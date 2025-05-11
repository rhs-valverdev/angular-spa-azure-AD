package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid" // For generating unique filenames
	_ "github.com/lib/pq"    // PostgreSQL driver
)

const uploadPath = "/app/uploads" // Ensure this matches docker-compose volume mount

// ImageMetadata struct for database records and API responses
type ImageMetadata struct {
	ID               int       `json:"id"`
	OriginalFilename string    `json:"original_filename"`
	DiskFilename     string    `json:"disk_filename"` // Actual filename on disk (e.g., UUID.ext)
	ContentType      string    `json:"content_type"`
	Size             int64     `json:"size"`
	UploadedAt       time.Time `json:"uploaded_at"`
}

// SimpleResponse struct for simple JSON messages
type SimpleResponse struct {
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
	ID      int    `json:"id,omitempty"` // Optionally return ID of new resource
}

var db *sql.DB // Global database connection pool

func main() {
	// Ensure upload directory exists
	if err := os.MkdirAll(uploadPath, os.ModePerm); err != nil {
		log.Fatalf("Failed to create upload directory: %v", err)
	}

	dbHost := os.Getenv("DB_HOST")
	dbPort := os.Getenv("DB_PORT")
	dbUser := os.Getenv("DB_USER")
	dbPassword := os.Getenv("DB_PASSWORD")
	dbName := os.Getenv("DB_NAME")

	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbUser, dbPassword, dbName)

	var err error
	maxRetries := 10
	for i := 0; i < maxRetries; i++ {
		db, err = sql.Open("postgres", connStr)
		if err != nil {
			log.Printf("Failed to open database connection: %v. Retrying in 5 seconds...", err)
			time.Sleep(5 * time.Second)
			continue
		}
		err = db.Ping()
		if err == nil {
			log.Println("Successfully connected to the database!")
			break
		}
		log.Printf("Failed to ping database: %v. Retrying in 5 seconds...", err)
		db.Close() // Close previous attempt before retrying
		time.Sleep(5 * time.Second)
	}

	if err != nil {
		log.Fatalf("Could not connect to the database after %d retries: %v", maxRetries, err)
	}
	// defer db.Close() // Keep db open for handlers

	// Create table if not exists
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS images (
			id SERIAL PRIMARY KEY,
			original_filename VARCHAR(255) NOT NULL,
			disk_filename VARCHAR(255) NOT NULL UNIQUE,
			content_type VARCHAR(100),
			size BIGINT,
			uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		log.Fatalf("Failed to create images table: %v", err)
	}
	log.Println("Images table checked/created.")

	// API Router
	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Hello from Go Backend!")
	})
	mux.HandleFunc("/health", healthCheckHandler)

	// Image related routes
	mux.HandleFunc("/api/images/upload", uploadImageHandler)
	mux.HandleFunc("/api/images", listImagesHandler) // GET for list
	mux.HandleFunc("/api/images/file/", serveImageHandler) // GET /api/images/file/{disk_filename}
	mux.HandleFunc("/api/images/delete/", deleteImageHandler) // DELETE /api/images/delete/{id}

	// ML related routes
	mux.HandleFunc("/api/ml/start-training", startTrainingHandler)

	log.Println("Starting Go backend server on port 8080...")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatalf("Could not start server: %s\n", err.Error())
	}
}

func healthCheckHandler(w http.ResponseWriter, r *http.Request) {
	err := db.Ping()
	if err != nil {
		http.Error(w, "Database connection error", http.StatusInternalServerError)
		log.Printf("Health check failed: %v", err)
		return
	}
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "OK")
}

func uploadImageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	// Max 10 MB files.
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "Could not parse multipart form: "+err.Error(), http.StatusBadRequest)
		return
	}

	file, handler, err := r.FormFile("imageFile") // "imageFile" is the name of the form field
	if err != nil {
		http.Error(w, "Error retrieving the file: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()

	originalFilename := handler.Filename
	contentType := handler.Header.Get("Content-Type")
	fileSize := handler.Size

	fileExtension := filepath.Ext(originalFilename)
	diskFilename := uuid.New().String() + fileExtension
	filePathOnDisk := filepath.Join(uploadPath, diskFilename)

	dst, err := os.Create(filePathOnDisk)
	if err != nil {
		http.Error(w, "Error creating the file on server: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, "Error saving the file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var imageID int
	err = db.QueryRow(
		"INSERT INTO images (original_filename, disk_filename, content_type, size) VALUES ($1, $2, $3, $4) RETURNING id",
		originalFilename, diskFilename, contentType, fileSize,
	).Scan(&imageID)

	if err != nil {
		os.Remove(filePathOnDisk) // Attempt to clean up orphaned file
		http.Error(w, "Error saving image metadata to database: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(SimpleResponse{Message: "Image uploaded successfully", ID: imageID})
}

func listImagesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Only GET method is allowed", http.StatusMethodNotAllowed)
		return
	}

	rows, err := db.Query("SELECT id, original_filename, disk_filename, content_type, size, uploaded_at FROM images ORDER BY uploaded_at DESC")
	if err != nil {
		http.Error(w, "Error querying database: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var images []ImageMetadata
	for rows.Next() {
		var img ImageMetadata
		if err := rows.Scan(&img.ID, &img.OriginalFilename, &img.DiskFilename, &img.ContentType, &img.Size, &img.UploadedAt); err != nil {
			http.Error(w, "Error scanning database results: "+err.Error(), http.StatusInternalServerError)
			return
		}
		images = append(images, img)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(images)
}

func serveImageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Only GET method is allowed", http.StatusMethodNotAllowed)
		return
	}
	diskFilename := strings.TrimPrefix(r.URL.Path, "/api/images/file/")
	if diskFilename == "" {
		http.Error(w, "Filename not provided", http.StatusBadRequest)
		return
	}

	// Basic sanitization to prevent path traversal
	// A more robust solution would involve checking against a list of known valid filenames from DB
	// or ensuring no ".." components are present.
	cleanFilename := filepath.Base(diskFilename)
	if cleanFilename != diskFilename || strings.Contains(diskFilename, "..") {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(uploadPath, cleanFilename)
	http.ServeFile(w, r, filePath)
}

func deleteImageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Only DELETE method is allowed", http.StatusMethodNotAllowed)
		return
	}
	idStr := strings.TrimPrefix(r.URL.Path, "/api/images/delete/")
	if idStr == "" {
		http.Error(w, "Image ID not provided", http.StatusBadRequest)
		return
	}

	imageID, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid Image ID format", http.StatusBadRequest)
		return
	}

	var diskFilename string
	err = db.QueryRow("SELECT disk_filename FROM images WHERE id = $1", imageID).Scan(&diskFilename)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Image not found", http.StatusNotFound)
		} else {
			http.Error(w, "Error querying image from database: "+err.Error(), http.StatusInternalServerError)
		}
		return
	}

	// Delete from database
	_, err = db.Exec("DELETE FROM images WHERE id = $1", imageID)
	if err != nil {
		http.Error(w, "Error deleting image metadata from database: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Delete from filesystem
	filePathOnDisk := filepath.Join(uploadPath, diskFilename)
	err = os.Remove(filePathOnDisk)
	if err != nil {
		// Log this error, but don't fail the request if DB entry was removed.
		// The file might have been already deleted or there are permission issues.
		log.Printf("Warning: failed to delete image file %s: %v", filePathOnDisk, err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SimpleResponse{Message: "Image deleted successfully"})
}

func startTrainingHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	log.Println("Received request to start custom ML training.")
	// In a real scenario:
	// 1. Validate request (e.g., user authentication, parameters).
	// 2. Fetch image data/paths from PostgreSQL (using disk_filename) or a shared volume (uploadPath).
	//    The images are already in uploadPath. The ml-trainer service would need access to this volume.
	// 3. Trigger the ML training script/process (e.g., via Docker exec, gRPC call to ML service, message queue).
	// 4. Monitor training progress.

	w.Header().Set("Content-Type", "application/json")
	response := SimpleResponse{Message: "Solicitud de entrenamiento personalizado recibida. Proceso simulado iniciado."}
	json.NewEncoder(w).Encode(response)
}
