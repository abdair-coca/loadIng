// Diálogos propios (dentro de claude.ai no funcionan alert/confirm/prompt).

export interface Opcion {
  valor: string;
  etiqueta: string;
  tipo?: "primario" | "peligro";
}

export function preguntar(texto: string, opciones: Opcion[]): Promise<string | null> {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "pregunta";
    const p = document.createElement("p");
    p.textContent = texto;
    const fila = document.createElement("div");
    fila.className = "opciones";
    for (const o of opciones) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn" + (o.tipo ? " " + o.tipo : "");
      b.textContent = o.etiqueta;
      b.onclick = () => { resolve(o.valor); dlg.close(); };
      fila.append(b);
    }
    dlg.append(p, fila);
    dlg.addEventListener("close", () => { resolve(null); dlg.remove(); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export async function confirmar(texto: string, si = "Sí", peligro = false): Promise<boolean> {
  return (await preguntar(texto, [
    { valor: "no", etiqueta: "Cancelar" },
    { valor: "si", etiqueta: si, tipo: peligro ? "peligro" : "primario" },
  ])) === "si";
}

let tAviso = 0;
export function aviso(texto: string, ms = 2800) {
  const el = document.getElementById("aviso")!;
  el.textContent = texto;
  el.classList.add("visible");
  clearTimeout(tAviso);
  tAviso = window.setTimeout(() => el.classList.remove("visible"), ms);
}
