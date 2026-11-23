// Prepara cada archivo para enviarlo a la IA: reduce fotos grandes a JPEG
// (las fotos de celular pesan 3-10 MB; la API acepta hasta 5 MB por imagen).

const LADO_MAX = 2200;

export async function prepararArchivo(file: File): Promise<Blob> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return file.type ? file : new Blob([file], { type: "application/pdf" });
  }
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      `No se pudo leer la imagen "${file.name}". Usa JPG, PNG o WEBP (en iPhone: Ajustes > Cámara > Formatos > Más compatible).`,
    );
  }
  const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * escala);
  const h = Math.round(bmp.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  let calidad = 0.85;
  let blob = await aBlob(canvas, calidad);
  while (blob.size > 4.5 * 1024 * 1024 && calidad > 0.4) {
    calidad -= 0.15;
    blob = await aBlob(canvas, calidad);
  }
  return blob;
}

function aBlob(canvas: HTMLCanvasElement, calidad: number): Promise<Blob> {
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo comprimir la imagen"))), "image/jpeg", calidad),
  );
}

export async function aBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const paso = 0x8000;
  for (let i = 0; i < buf.length; i += paso) {
    bin += String.fromCharCode(...buf.subarray(i, i + paso));
  }
  return btoa(bin);
}
