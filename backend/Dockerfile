# Stage 1: Build the Go application
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go.mod and go.sum first to leverage Docker cache
COPY go.mod go.sum ./
RUN go mod download
RUN go mod tidy
RUN go mod vendor

COPY . .

# Build the binary statically linked
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /main .

# Stage 2: Create a minimal runtime image
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copy the pre-built binary from the builder stage
COPY --from=builder /main .

EXPOSE 8080

# Command to run the executable
CMD ["./main"]
