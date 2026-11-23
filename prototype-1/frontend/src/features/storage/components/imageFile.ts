export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const ALLOWED = new Set(IMAGE_ACCEPT.split(","));
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_EDGE = 480; // thumbnails only; keeps data URLs small

/** Validates an uploaded picture and returns a downscaled JPEG data URL. Throws a Thai message on bad input. */
export async function readItemImage(file: File): Promise<string> {
  if (!ALLOWED.has(file.type)) throw new Error("รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("ไฟล์ใหญ่เกิน 2 MB");

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("เปิดไฟล์รูปไม่สำเร็จ");
  });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เปิดไฟล์รูปไม่สำเร็จ");
  ctx.fillStyle = "#ffffff"; // flatten transparency for JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}
