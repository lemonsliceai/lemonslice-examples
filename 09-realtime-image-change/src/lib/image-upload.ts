/** Match agent TARGET_IMAGE_* — keeps LiveKit data packets under the 64KB limit. */
const TARGET_WIDTH = 368;
const TARGET_HEIGHT = 560;
const JPEG_QUALITY = 0.85;

/**
 * Decode a File, center-crop to 2:3 portrait, JPEG-encode, return raw base64.
 * LiveKit `publishData` rejects payloads over 64KB, so uploads must be compressed
 * before they cross the data channel (LemonSlice still receives image_base64 via the agent).
 */
export async function fileToUploadBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    const targetRatio = TARGET_WIDTH / TARGET_HEIGHT;
    const srcRatio = srcW / srcH;

    let sx = 0;
    let sy = 0;
    let sw = srcW;
    let sh = srcH;
    if (srcRatio > targetRatio) {
      sw = Math.round(srcH * targetRatio);
      sx = Math.round((srcW - sw) / 2);
    } else {
      sh = Math.round(srcW / targetRatio);
      sy = Math.round((srcH - sh) / 2);
    }

    const canvas = document.createElement("canvas");
    canvas.width = TARGET_WIDTH;
    canvas.height = TARGET_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create canvas for image upload");
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Failed to encode JPEG"))),
        "image/jpeg",
        JPEG_QUALITY,
      );
    });

    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  } finally {
    bitmap.close();
  }
}
