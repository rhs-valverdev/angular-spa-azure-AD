import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Trash2, Eye, RefreshCw, Zap, BrainCircuit } from 'lucide-react'; // Added BrainCircuit
import { saveImageToDB, getAllImagesMetadataFromDB, getImageFromDB, deleteImageFromDB } from './lib/db';
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';

interface StoredImageMetadata {
  id: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  createdAt: Date;
}

interface PredictionResult {
  className: string;
  probability: number;
}

const App: React.FC = () => {
  const [image, setImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [feedback, setFeedback] = useState<string>('');
  const [isPredicting, setIsPredicting] = useState(false);
  const [storedImages, setStoredImages] = useState<StoredImageMetadata[]>([]);
  const [isLoadingStoredImages, setIsLoadingStoredImages] = useState(true);
  const [currentImageId, setCurrentImageId] = useState<string | null>(null);
  const [model, setModel] = useState<mobilenet.MobileNet | null>(null);
  const [modelLoadingStatus, setModelLoadingStatus] = useState<string>("Cargando modelo de IA (MobileNet)...");
  const [trainingStatus, setTrainingStatus] = useState<string>(''); // For ML training feedback

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const loadModel = async () => {
      try {
        await tf.ready();
        const loadedModel = await mobilenet.load();
        setModel(loadedModel);
        setModelLoadingStatus("Modelo de IA (MobileNet) cargado y listo.");
        console.log("MobileNet model loaded successfully.");
      } catch (error) {
        console.error("Error loading MobileNet model:", error);
        setModelLoadingStatus("Error al cargar el modelo MobileNet. Las predicciones pre-entrenadas no estarán disponibles.");
      }
    };
    loadModel();
  }, []);

  const fetchStoredImages = useCallback(async () => {
    setIsLoadingStoredImages(true);
    try {
      const metadata = await getAllImagesMetadataFromDB();
      setStoredImages(metadata);
    } catch (error) {
      console.error("Error fetching images from DB:", error);
    } finally {
      setIsLoadingStoredImages(false);
    }
  }, []);

  useEffect(() => {
    fetchStoredImages();
  }, [fetchStoredImages]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImage(file);
      const previewUrl = URL.createObjectURL(file);
      setImagePreviewUrl(previewUrl);
      setPredictions([]);
      setCurrentImageId(null); // Clear current image ID from DB selection

      try {
        const savedId = await saveImageToDB(file);
        console.log(`Image ${file.name} saved to IndexedDB with ID: ${savedId}`);
        fetchStoredImages(); // Refresh list of stored images
        // TODO: In a future step, also upload to backend for persistent storage and training
      } catch (error) {
        console.error("Error saving image to IndexedDB:", error);
        alert("Error al guardar la imagen en la base de datos local (IndexedDB).");
      }
    }
  };

  const handlePredict = async () => {
    if (!imageRef.current) {
      alert("Por favor, sube o selecciona una imagen primero y espera a que se muestre.");
      return;
    }
    if (!model) {
      alert("El modelo de IA (MobileNet) aún no está cargado. Por favor, espera.");
      return;
    }

    setIsPredicting(true);
    setPredictions([]);

    try {
      const tfPredictions = await model.classify(imageRef.current);
      setPredictions(tfPredictions.map(p => ({ className: p.className, probability: p.probability })));
      console.log("MobileNet Predictions:", tfPredictions);
    } catch (error) {
      console.error("Error during MobileNet prediction:", error);
      alert("Ocurrió un error durante el análisis de la imagen con MobileNet.");
      setPredictions([{ className: "Error en la predicción de MobileNet", probability: 0 }]);
    } finally {
      setIsPredicting(false);
    }
  };

  const handleFeedbackSubmit = () => {
    console.log('Feedback enviado:', {
      imageName: image?.name || currentImageId,
      predictions,
      feedbackText: feedback,
    });
    alert('¡Gracias por tus comentarios!');
    setFeedback('');
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleLoadImageFromDB = async (imageId: string) => {
    try {
      const imageRecord = await getImageFromDB(imageId);
      if (imageRecord) {
        const file = new File([imageRecord.data], imageRecord.name, { type: imageRecord.type, lastModified: imageRecord.lastModified });
        setImage(file); // Set as current image for potential operations
        const previewUrl = URL.createObjectURL(imageRecord.data);
        setImagePreviewUrl(previewUrl);
        setPredictions([]); // Clear previous predictions
        setCurrentImageId(imageId); // Mark that this image is from DB
      }
    } catch (error) {
      console.error("Error loading image from IndexedDB:", error);
      alert("Error al cargar la imagen desde la base de datos local (IndexedDB).");
    }
  };

  const handleDeleteImageFromDB = async (imageId: string) => {
    if (window.confirm("¿Estás seguro de que quieres eliminar esta imagen de la base de datos local (IndexedDB)?")) {
      try {
        await deleteImageFromDB(imageId);
        fetchStoredImages();
        if (currentImageId === imageId) { // If the deleted image was being previewed
          setImage(null);
          setImagePreviewUrl(null);
          setPredictions([]);
          setCurrentImageId(null);
        }
      } catch (error) {
        console.error("Error deleting image from IndexedDB:", error);
        alert("Error al eliminar la imagen de la base de datos local (IndexedDB).");
      }
    }
  };

  const handleStartCustomTraining = async () => {
    setTrainingStatus("Iniciando solicitud de entrenamiento personalizado...");
    try {
      // The backend URL will be proxied by Vite during development if configured,
      // or will be relative if frontend is served by the same domain as backend in production.
      // For Docker setup, frontend is on 5173, backend on 8080.
      // We'll assume a direct call for now, or that a proxy is set up in vite.config.ts if needed.
      const response = await fetch('/api/ml/start-training', { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        setTrainingStatus(`Respuesta del backend: ${data.message}`);
      } else {
        setTrainingStatus(`Error del backend: ${data.error || 'Error desconocido'}`);
      }
    } catch (error) {
      console.error("Error starting custom training:", error);
      setTrainingStatus("Error de red o conexión al intentar iniciar el entrenamiento.");
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 text-gray-100 flex flex-col items-center p-4 selection:bg-sky-500 selection:text-white">
      <div className="bg-slate-800 shadow-2xl rounded-xl p-6 md:p-10 w-full max-w-4xl flex flex-col md:flex-row gap-8">
        {/* Columna Izquierda: Carga y Predicción */}
        <div className="flex-1">
          <header className="text-center mb-8">
            <h1 className="text-4xl font-bold text-sky-400">Analizador de Imágenes Médicas</h1>
            <p className="text-slate-400 mt-2">Sube una imagen microscópica para análisis con MobileNet o entrena tu propio modelo.</p>
            <p className="text-xs text-slate-500 mt-1">{modelLoadingStatus}</p>
          </header>

          <div className="mb-6">
            <label htmlFor="imageInput" className="block text-sm font-medium text-slate-300 mb-2">
              Subir Imagen Nueva (Guardada en Navegador)
            </label>
            <div
              onClick={triggerFileInput}
              className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-600 border-dashed rounded-md cursor-pointer hover:border-sky-500 transition-colors"
            >
              <div className="space-y-1 text-center">
                <Upload className="mx-auto h-12 w-12 text-slate-500" strokeWidth={1.5} />
                <div className="flex text-sm text-slate-400">
                  <span className="relative bg-slate-800 rounded-md font-medium text-sky-500 hover:text-sky-400 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-slate-800 focus-within:ring-sky-600">
                    Haz clic para subir
                  </span>
                  <input
                    id="imageInput"
                    name="imageInput"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    ref={fileInputRef}
                    className="sr-only"
                  />
                </div>
                <p className="text-xs text-slate-500">PNG, JPG, GIF. Se guarda en IndexedDB.</p>
              </div>
            </div>
          </div>

          {imagePreviewUrl && (
            <div className="mb-6 p-4 bg-slate-700/50 rounded-lg">
              <h3 className="text-lg font-semibold text-sky-400 mb-2">Vista Previa:</h3>
              <img
                ref={imageRef}
                src={imagePreviewUrl}
                alt="Diapositiva microscópica subida o seleccionada"
                className="max-w-full h-auto max-h-64 rounded-md shadow-md mx-auto"
                crossOrigin="anonymous"
              />
            </div>
          )}

          <button
            onClick={handlePredict}
            disabled={!imagePreviewUrl || isPredicting || !model}
            className="w-full bg-sky-600 hover:bg-sky-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-800 flex items-center justify-center gap-2 mb-4"
          >
            <Zap size={20} />
            {isPredicting ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Analizando con MobileNet...
              </div>
            ) : (
              'Analizar con MobileNet (Pre-entrenado)'
            )}
          </button>

          {/* Sección de Entrenamiento Personalizado */}
          <div className="mt-8 p-4 bg-slate-700/70 rounded-lg shadow">
            <h3 className="text-xl font-semibold text-purple-400 mb-3 flex items-center gap-2">
              <BrainCircuit size={24} /> Entrenamiento de Modelo Personalizado
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Inicia el proceso de entrenamiento para un nuevo modelo de IA usando las imágenes preparadas en el backend.
              (Nota: La preparación y transferencia de datos al backend es un paso futuro).
            </p>
            <button
              onClick={handleStartCustomTraining}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-slate-800 flex items-center justify-center gap-2"
            >
              <Zap size={20} /> Iniciar Entrenamiento Personalizado (Simulado)
            </button>
            {trainingStatus && (
              <p className="mt-3 text-sm text-slate-300 bg-slate-600/50 p-2 rounded">{trainingStatus}</p>
            )}
          </div>


          {predictions.length > 0 && !isPredicting && (
            <div className="mt-8 p-4 bg-slate-700 rounded-lg shadow">
              <h3 className="text-xl font-semibold text-sky-400 mb-3">Resultados del Análisis (MobileNet):</h3>
              <ul className="space-y-2">
                {predictions.map((pred, index) => (
                  <li key={index} className="text-slate-300 flex justify-between items-center">
                    <span>{pred.className.split(',')[0]}</span>
                    <span className={`font-semibold px-2 py-0.5 rounded text-sm ${pred.probability > 0.5 ? 'bg-green-600/30 text-green-300' : 'bg-amber-600/30 text-amber-300'}`}>
                      {(pred.probability * 100).toFixed(2)}%
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500 mt-4">
                Nota: Estas predicciones son de un modelo de clasificación general (MobileNet) y no son específicas para diagnóstico médico.
              </p>
            </div>
          )}

          <div className="mt-8">
            <label htmlFor="feedbackInput" className="block text-sm font-medium text-slate-300 mb-1">
              Enviar Comentarios sobre MobileNet (Opcional)
            </label>
            <p className="text-xs text-slate-500 mb-2">Ayúdanos a mejorar el modelo enviando tus comentarios sobre la predicción.</p>
            <textarea
              id="feedbackInput"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              placeholder="¿Fue precisa la predicción de MobileNet? ¿Algún comentario?"
              className="shadow-sm appearance-none bg-slate-700 border border-slate-600 rounded-md w-full py-2 px-3 text-slate-300 leading-tight focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 placeholder-slate-500"
            />
            <button
              onClick={handleFeedbackSubmit}
              disabled={!feedback.trim()}
              className="mt-3 w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-800"
            >
              Enviar Comentarios
            </button>
          </div>
        </div>

        {/* Columna Derecha: Imágenes Guardadas (IndexedDB) */}
        <div className="w-full md:w-1/3 md:min-w-[300px] bg-slate-800/50 p-4 rounded-lg mt-8 md:mt-0">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-sky-400">Imágenes en Navegador (IndexedDB)</h2>
            <button onClick={fetchStoredImages} title="Refrescar lista" className="text-slate-400 hover:text-sky-400">
              <RefreshCw size={20} />
            </button>
          </div>
          {isLoadingStoredImages ? (
            <p className="text-slate-400">Cargando imágenes de IndexedDB...</p>
          ) : storedImages.length === 0 ? (
            <p className="text-slate-400">No hay imágenes guardadas en IndexedDB.</p>
          ) : (
            <ul className="space-y-3 max-h-[calc(100vh-250px)] overflow-y-auto pr-2">
              {storedImages.map((imgMeta) => (
                <li key={imgMeta.id} className="p-3 bg-slate-700 rounded-md shadow flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate" title={imgMeta.name}>{imgMeta.name}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(imgMeta.createdAt).toLocaleString()} - {(imgMeta.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <div className="flex space-x-1 shrink-0">
                    <button
                      onClick={() => handleLoadImageFromDB(imgMeta.id)}
                      title="Cargar esta imagen para vista previa/análisis MobileNet"
                      className="p-1.5 text-sky-500 hover:text-sky-300 rounded hover:bg-sky-500/20"
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteImageFromDB(imgMeta.id)}
                      title="Eliminar esta imagen de IndexedDB"
                      className="p-1.5 text-red-500 hover:text-red-300 rounded hover:bg-red-500/20"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <footer className="text-center mt-8 text-slate-500 text-sm">
        <p>&copy; {new Date().getFullYear()} Analizador de Imágenes Médicas. Solo para fines de investigación.</p>
      </footer>
    </div>
  );
};

export default App;
