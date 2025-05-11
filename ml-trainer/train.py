import os
import tensorflow as tf
from PIL import Image # Example: using Pillow

# Path where images uploaded by the backend are mounted
TRAINING_IMAGES_DIR = "/app/training_images" 
# Path for saving trained models or other data produced by this script
# This path should correspond to a volume mount in docker-compose.yml if persistence is needed
# For example, if ml_data volume is mounted to /app/data
# OUTPUT_DATA_DIR = "/app/data" 

def check_gpu():
    gpus = tf.config.list_physical_devices('GPU')
    if gpus:
        try:
            # Currently, memory growth needs to be the same across GPUs
            for gpu in gpus:
                tf.config.experimental.set_memory_growth(gpu, True)
            logical_gpus = tf.config.list_logical_devices('GPU')
            print(f"TensorFlow: {len(gpus)} Physical GPUs, {len(logical_gpus)} Logical GPUs available.")
            for i, gpu in enumerate(gpus):
                print(f"  GPU {i}: {gpu.name}")
        except RuntimeError as e:
            # Memory growth must be set before GPUs have been initialized
            print(f"Error setting memory growth: {e}")
    else:
        print("TensorFlow: No GPUs available. Training will run on CPU.")

def list_training_images():
    print(f"\nChecking for images in: {TRAINING_IMAGES_DIR}")
    if not os.path.exists(TRAINING_IMAGES_DIR):
        print(f"Error: Directory {TRAINING_IMAGES_DIR} does not exist.")
        return

    image_files = []
    valid_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff')
    try:
        for item in os.listdir(TRAINING_IMAGES_DIR):
            if item.lower().endswith(valid_extensions):
                image_files.append(item)
                # Example: Open image with Pillow to verify it's readable
                try:
                    img_path = os.path.join(TRAINING_IMAGES_DIR, item)
                    with Image.open(img_path) as img:
                        # You could do basic checks like img.verify() or print img.format, img.size
                        pass # print(f"  Successfully opened {item} ({img.format}, {img.size})")
                except Exception as e:
                    print(f"  Warning: Could not open or process image {item}: {e}")

        if image_files:
            print(f"Found {len(image_files)} image(s):")
            for img_file in image_files[:10]: # Print first 10
                print(f"  - {img_file}")
            if len(image_files) > 10:
                print(f"  ... and {len(image_files) - 10} more.")
        else:
            print("No image files found in the directory.")
    except Exception as e:
        print(f"Error listing images: {e}")


if __name__ == "__main__":
    print("--- ML Trainer Script Starting ---")
    print(f"TensorFlow version: {tf.__version__}")
    
    check_gpu()
    list_training_images()

    print("\n--- Placeholder Training Logic ---")
    print("This is where your actual model training code would go.")
    print("For example, loading data, preprocessing, defining a model, training, and saving.")
    # Example:
    # 1. Load image paths and labels (you'll need a way to get labels, perhaps from filenames or a DB query)
    # 2. Create tf.data.Dataset
    # 3. Preprocess images (resize, normalize, augment)
    # 4. Define your Keras model (e.g., tf.keras.Sequential or functional API)
    # 5. Compile the model (optimizer, loss, metrics)
    # 6. Train the model (model.fit())
    # 7. Save the trained model (e.g., model.save(os.path.join(OUTPUT_DATA_DIR, 'my_model.h5')))
    
    print("\n--- ML Trainer Script Finished ---")
