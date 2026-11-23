// Dónde se guardan los registros. Dos implementaciones con la misma interfaz:
// - AlmacenLocal: IndexedDB del navegador (versión Vercel).
// - AlmacenClaude: base de datos del artifact en claude.ai (sincroniza dispositivos).
import { type Registro, cargarRegistros, guardarRegistros } from "./db";

export interface Almacen {
  /** "local" o "claude" */
  tipo: "local" | "claude";
  /** Carga inicial; `alCambiar` recibe cambios hechos en otros dispositivos. */
  iniciar(alCambiar: (remotos: Registro[]) => void): Promise<Registro[]>;
  /** Marca un registro como modificado (se guarda en segundo plano). */
  guardar(r: Registro): void;
  borrar(id: string): void;
  /** Ids con cambios locales aún no confirmados (no deben pisarse con datos remotos). */
  pendientes(): Set<string>;
  /** Promesa que se cumple cuando todo lo pendiente quedó guardado. */
  vaciar(): Promise<void>;
}

export class AlmacenLocal implements Almacen {
  tipo = "local" as const;
  private t = 0;
  constructor(private todos: () => Registro[]) {}
  async iniciar() {
    window.addEventListener("pagehide", () => guardarRegistros(this.todos()));
    return cargarRegistros();
  }
  guardar() { this.programar(); }
  borrar() { this.programar(); }
  pendientes() { return new Set<string>(); }
  private programar() {
    clearTimeout(this.t);
    this.t = window.setTimeout(() => guardarRegistros(this.todos()), 300);
  }
  async vaciar() {
    clearTimeout(this.t);
    await guardarRegistros(this.todos());
  }
}

type Op = { tipo: "set"; r: Registro } | { tipo: "del"; id: string };

export class AlmacenClaude implements Almacen {
  tipo = "claude" as const;
  private col: CollectionReference;
  /** Última operación pendiente por documento (las ráfagas se juntan en una sola escritura). */
  private cola = new Map<string, Op>();
  private timers = new Map<string, number>();
  private enVuelo = new Set<string>();
  private trabajando = false;
  private esperando: (() => void)[] = [];
  onError: (msg: string) => void = () => {};

  constructor(db: DB) {
    this.col = db.collection("registros");
  }

  iniciar(alCambiar: (remotos: Registro[]) => void): Promise<Registro[]> {
    return new Promise((resolve) => {
      let primero = true;
      const timer = window.setTimeout(() => {
        if (primero) { primero = false; resolve([]); this.onError("No se pudo conectar con los datos guardados todavía; se mostrarán al llegar."); }
      }, 10000);
      this.col.onSnapshot(
        (snap) => {
          const regs = snap.docs.filter((d) => d.exists).map((d) => desdeDoc(d.id, d.data()!));
          if (primero) {
            if (snap.metadata.fromCache && snap.empty) return; // esperar la respuesta real
            primero = false;
            clearTimeout(timer);
            resolve(regs);
          } else {
            alCambiar(regs);
          }
        },
        (e) => {
          clearTimeout(timer);
          if (primero) { primero = false; resolve([]); }
          this.onError("Se perdió la conexión con los datos guardados (" + e.code + "). Recarga la página.");
        },
      );
    });
  }

  guardar(r: Registro) { this.encolar(r.id, { tipo: "set", r }); }
  borrar(id: string) { this.encolar(id, { tipo: "del", id }, 0); }

  pendientes() {
    return new Set<string>([...this.cola.keys(), ...this.enVuelo]);
  }

  vaciar(): Promise<void> {
    for (const [id, t] of this.timers) { clearTimeout(t); this.timers.delete(id); }
    this.procesar();
    if (!this.cola.size && !this.enVuelo.size) return Promise.resolve();
    return new Promise((res) => this.esperando.push(res));
  }

  private encolar(id: string, op: Op, espera = 700) {
    this.cola.set(id, op);
    clearTimeout(this.timers.get(id));
    this.timers.set(id, window.setTimeout(() => { this.timers.delete(id); this.procesar(); }, espera));
  }

  /** Escribe de a una operación por vez (la base pide una escritura a la vez por documento). */
  private async procesar() {
    if (this.trabajando) return;
    this.trabajando = true;
    try {
      while (true) {
        const id = [...this.cola.keys()].find((k) => !this.timers.has(k));
        if (id === undefined) break;
        const op = this.cola.get(id)!;
        this.cola.delete(id);
        this.enVuelo.add(id);
        try {
          await this.ejecutar(op);
        } catch (e) {
          const code = (e as DbError)?.code;
          if (code === "unavailable" || code === "resource_exhausted") {
            await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
            try { await this.ejecutar(op); } catch (e2) { this.onError(mensajeDb(e2)); }
          } else {
            this.onError(mensajeDb(e));
          }
        } finally {
          this.enVuelo.delete(id);
        }
      }
    } finally {
      this.trabajando = false;
      if (!this.cola.size && !this.enVuelo.size) this.esperando.splice(0).forEach((f) => f());
    }
  }

  private ejecutar(op: Op) {
    return op.tipo === "set" ? this.col.doc(op.r.id).set(aDoc(op.r)) : this.col.doc(op.id).delete();
  }
}

function aDoc(r: Registro): Record<string, unknown> {
  return {
    carrera: r.carrera, dictamen: r.dictamen, descripcion: r.descripcion, fotoIds: r.fotoIds,
    fuente: r.fuente, revisar: r.revisar, nota: r.nota, creado: r.creado,
  };
}

function desdeDoc(id: string, d: Record<string, unknown>): Registro {
  return {
    id,
    carrera: String(d.carrera ?? ""),
    dictamen: String(d.dictamen ?? ""),
    descripcion: String(d.descripcion ?? ""),
    fotoIds: Array.isArray(d.fotoIds) ? d.fotoIds.map(String) : [],
    fuente: String(d.fuente ?? ""),
    revisar: Boolean(d.revisar),
    nota: String(d.nota ?? ""),
    creado: Number(d.creado) || 0,
  };
}

function mensajeDb(e: unknown): string {
  const code = (e as DbError)?.code;
  if (code === "quota_exceeded") return "Se llenó el espacio de registros. Exporta el Excel y borra registros antiguos.";
  if (code === "invalid_argument") return "No tienes permiso para guardar cambios en este registro (pide acceso de edición al dueño).";
  if (code === "revoked" || code === "not_granted") return "Se perdió el acceso a los datos. Recarga la página.";
  return "No se pudo guardar un cambio (" + (code ?? "error") + "). Revisa tu conexión.";
}
