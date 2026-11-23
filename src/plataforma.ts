// Detecta dónde corre la app:
// - Dentro de claude.ai (artifact): la IA usa la suscripción de Claude del usuario
//   (capacidad `sample`) y los registros se guardan en la base del artifact (`db`),
//   sincronizados entre el celular y la PC.
// - Fuera de claude.ai (Vercel, local): IA con clave de API y datos en IndexedDB.

export interface Plataforma {
  enClaude: boolean;
  sample: ClaudeCapabilityMap["sample"] | null;
  /** Cuántas imágenes acepta una llamada a `sample` (0 = no se pueden enviar imágenes). */
  maxImagenes: number;
  db: DB | null;
  downloads: ClaudeCapabilityMap["downloads"] | null;
}

export async function detectarPlataforma(): Promise<Plataforma> {
  const c = (window as Partial<Window>).claude;
  if (!c || typeof c.use !== "function") {
    return { enClaude: false, sample: null, maxImagenes: 0, db: null, downloads: null };
  }
  const [sample, db, downloads] = await Promise.all([
    c.use("sample").catch(() => null),
    c.use("db").catch(() => null),
    c.use("downloads").catch(() => null),
  ]);
  let maxImagenes = 0;
  if (sample) {
    const lim = await sample.limits().catch(() => null);
    maxImagenes = lim?.images?.maxCount ?? 0;
  }
  return { enClaude: true, sample, maxImagenes, db, downloads };
}
