// Cámara dentro de la app: visor en vivo para tomar muchas páginas seguidas sin salir.
// Si el navegador no la permite (por ejemplo dentro de claude.ai), se usa la cámara
// del sistema, una foto por toque.

const LADO_MAX = 2200;

export async function abrirCamara(video: HTMLVideoElement): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play().catch(() => {});
    return stream;
  } catch {
    return null;
  }
}

export function cerrarCamara(video: HTMLVideoElement, stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}

export function capturar(video: HTMLVideoElement): Promise<Blob> {
  const w0 = video.videoWidth, h0 = video.videoHeight;
  if (!w0 || !h0) return Promise.reject(new Error("La cámara aún no está lista"));
  const k = Math.min(1, LADO_MAX / Math.max(w0, h0));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w0 * k);
  canvas.height = Math.round(h0 * k);
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo capturar"))), "image/jpeg", 0.9),
  );
}
