// "Lote": un archivo .zip con las fotos de varios documentos, agrupadas por documento.
// Se crea en la copia de Vercel (donde la cámara en vivo funciona) y se importa en la
// versión de claude.ai, donde Claude lo lee con la suscripción del usuario.
import JSZip from "jszip";

export interface DocLote {
  id: string;
  nombre: string;
  creado: number;
  paginas: Blob[];
}

interface Manifiesto {
  app: "registro-dictamenes";
  version: 1;
  creado: string;
  documentos: { id: string; nombre: string; creado: number; paginas: string[] }[];
}

export async function crearLote(docs: DocLote[]): Promise<Blob> {
  const zip = new JSZip();
  const man: Manifiesto = { app: "registro-dictamenes", version: 1, creado: new Date().toISOString(), documentos: [] };
  docs.forEach((d, i) => {
    const carpeta = `documento-${String(i + 1).padStart(3, "0")}`;
    const paginas = d.paginas.map((b, j) => {
      const ruta = `${carpeta}/pagina-${j + 1}.jpg`;
      zip.file(ruta, b);
      return ruta;
    });
    man.documentos.push({ id: d.id, nombre: d.nombre, creado: d.creado, paginas });
  });
  zip.file("lote.json", JSON.stringify(man, null, 2));
  // Las fotos ya son JPEG: no se vuelven a comprimir
  return zip.generateAsync({ type: "blob", compression: "STORE", mimeType: "application/zip" });
}

export async function leerLote(archivo: Blob): Promise<DocLote[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(archivo);
  } catch {
    throw new Error("Ese archivo no es un lote de fotos (.zip) de esta app.");
  }
  const manTxt = await zip.file("lote.json")?.async("string");
  if (!manTxt) throw new Error("Ese .zip no es un lote de esta app (falta lote.json).");
  const man = JSON.parse(manTxt) as Manifiesto;
  if (man.app !== "registro-dictamenes" || !Array.isArray(man.documentos)) throw new Error("Lote no reconocido.");
  const out: DocLote[] = [];
  for (const d of man.documentos) {
    const paginas: Blob[] = [];
    for (const ruta of d.paginas) {
      const f = zip.file(ruta);
      if (f) paginas.push(new Blob([await f.async("arraybuffer")], { type: "image/jpeg" }));
    }
    if (paginas.length) out.push({ id: String(d.id), nombre: String(d.nombre || "Documento"), creado: Number(d.creado) || Date.now(), paginas });
  }
  if (!out.length) throw new Error("El lote no tiene fotos.");
  return out;
}
