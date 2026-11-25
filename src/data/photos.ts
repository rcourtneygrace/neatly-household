/** Photo processing: resize on the device before saving. Never uploaded in v1. */

export const PHOTO_MAX_EDGE = 1600;
export const THUMB_EDGE = 240; // covers the 64px detail thumbs and 58px list thumbs at 3x
export const MAX_PHOTOS_PER_RECORD = 6;

export interface ProcessedPhoto {
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(source: ImageBitmap | HTMLImageElement, maxEdge: number, cover = false): HTMLCanvasElement {
  const sw = source.width;
  const sh = source.height;
  const canvas = document.createElement('canvas');
  if (cover) {
    // Square crop from the center, for thumbnails
    const side = Math.min(sw, sh);
    const out = Math.min(maxEdge, side);
    canvas.width = out;
    canvas.height = out;
    canvas.getContext('2d')!.drawImage(source, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, out, out);
  } else {
    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save photo'))), 'image/jpeg', quality),
  );
}

export async function processPhoto(file: Blob): Promise<ProcessedPhoto> {
  const source = await decode(file);
  const full = draw(source, PHOTO_MAX_EDGE);
  const thumb = draw(source, THUMB_EDGE, true);
  if ('close' in source) source.close();
  return {
    blob: await toBlob(full, 0.85),
    thumb: await toBlob(thumb, 0.8),
    width: full.width,
    height: full.height,
  };
}
