# Use an official TensorFlow image with GPU support
# Check https://hub.docker.com/r/tensorflow/tensorflow/tags for available tags
# Using a specific version is generally recommended for stability.
# This example uses a recent version, adjust if needed for your specific TF version requirements.
FROM tensorflow/tensorflow:2.15.0-gpu

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install Python dependencies
# --no-cache-dir reduces image size
# --default-timeout=300 increases timeout for pip, useful for slower connections or large packages
RUN pip install --no-cache-dir --default-timeout=300 -r requirements.txt

# Copy the training script and any other necessary files
COPY train.py .
# If you have other Python modules or data files for the trainer, copy them here as well
# COPY ./src ./src

# Ensure the script is executable (though python train.py doesn't strictly need it)
# RUN chmod +x train.py

# Default command to run when the container starts (can be overridden in docker-compose.yml)
# For now, we'll let docker-compose define the command to make it easier to experiment.
# CMD ["python", "train.py"]

# Expose any ports if your ML service needs to listen for incoming requests (e.g., for a Flask API)
# For a batch training script, this is usually not needed.
# EXPOSE 5000
