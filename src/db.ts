// Persistencia 100% en el navegador (IndexedDB). No hay backend.
import { createStore, get, set, del, keys } from "idb-keyval";

export interface Registro {
  id: string;
  /** Celda "Carrera". Puede tener varias líneas (ej. "FACULTAD DE ARTES\nDECANATURA"). */
  carrera: string;
  dictamen: string;
  descripcion: string;
  /** Fotos de las que salió el registro (vacío si vino de un Excel importado o se creó a mano). */
  fotoIds: string[];
  /** Nombre(s) de archivo originales. */
  fuente: string;
  /** La IA marcó dudas (texto ilegible, campo no encontrado, etc.). */
  revisar: boolean;
  nota: string;
  creado: number;
}

export type EstadoTrabajo = "espera" | "pendiente" | "procesando" | "listo" | "error";

export interface Trabajo {
  id: string;
  nombre: string;
  fotoIds: string[];
  estado: EstadoTrabajo;
  error?: string;
  creado: number;
}

const store = createStore("registro-dictamenes", "kv");

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export async function cargarRegistros(): Promise<Registro[]> {
  return (await get<Registro[]>("registros", store)) ?? [];
}
export async function guardarRegistros(r: Registro[]) {
  await set("registros", r, store);
}
export async function cargarTrabajos(): Promise<Trabajo[]> {
  return (await get<Trabajo[]>("trabajos", store)) ?? [];
}
export async function guardarTrabajos(t: Trabajo[]) {
  await set("trabajos", t, store);
}

export async function guardarFoto(id: string, blob: Blob) {
  await set("foto:" + id, blob, store);
}
export async function leerFoto(id: string): Promise<Blob | undefined> {
  return get<Blob>("foto:" + id, store);
}
export async function borrarFoto(id: string) {
  await del("foto:" + id, store);
}

/** Borra fotos que ya no usa ningún registro ni trabajo. */
export async function limpiarFotosHuerfanas(registros: Registro[], trabajos: Trabajo[]) {
  const usadas = new Set<string>();
  registros.forEach((r) => r.fotoIds.forEach((f) => usadas.add(f)));
  trabajos.forEach((t) => t.fotoIds.forEach((f) => usadas.add(f)));
  for (const k of await keys(store)) {
    const s = String(k);
    if (s.startsWith("foto:") && !usadas.has(s.slice(5))) await del(k, store);
  }
}

export async function pedirPersistencia() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* opcional */
  }
}

// Ajustes simples (clave de API, modelo, etc.) en localStorage
export interface Ajustes {
  apiKey: string;
  modelo: string;
  paralelo: number;
  /** Solo en claude.ai: nivel de modelo de la suscripción. */
  precision: "default" | "complex";
}
const AJ_KEY = "registro-dictamenes:ajustes";
export function cargarAjustes(): Ajustes {
  const def: Ajustes = { apiKey: "", modelo: "claude-opus-5-5", paralelo: 3, precision: "default" };
  try {
    const raw = localStorage.getItem(AJ_KEY);
    return raw ? { ...def, ...JSON.parse(raw) } : def;
  } catch {
    return def;
  }
}
export function guardarAjustes(a: Ajustes) {
  try {
    localStorage.setItem(AJ_KEY, JSON.stringify(a));
  } catch {
    /* ignorar */
  }
}
