/**
 * Loads a base64 image data string and downscales it to fit within a 1024x1024 bounding box,
 * returning a highly compressed (0.6 quality) JPEG base64 string in short-lived memory.
 */
export function downscaleAndCompressImage(base64Data: string, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = `data:${mimeType};base64,${base64Data}`;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      const MAX_DIM = 1024;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      // Export as compressed JPEG with 0.6 quality
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.6);
      const base64Result = compressedDataUrl.split(',')[1];
      resolve(base64Result);
    };
    img.onerror = (err) => {
      reject(err);
    };
  });
}
