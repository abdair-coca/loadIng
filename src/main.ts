import "./style.css";
import {
  type Registro,
  type Trabajo,
  uid,
  cargarRegistros,
  guardarRegistros,
  cargarTrabajos,
  guardarTrabajos,
  guardarFoto,
  leerFoto,
  limpiarFotosHuerfanas,
  pedirPersistencia,
  cargarAjustes,
  guardarAjustes,
} from "./db";
import { prepararArchivo } from "./imagen";
import { interpretar, mensajeDeError, MODELOS } from "./ia";
import { exportarExcel, importarExcel } from "./excel";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

let registros: Registro[] = [];
let trabajos: Trabajo[] = [];
let ajustes = cargarAjustes();
let activos = 0;
let completadosSesion = 0;

// ---------- Aviso breve ----------
let tAviso = 0;
function aviso(txt: string) {
  const el = $("#aviso");
  el.textContent = txt;
  el.classList.add("visible");
  clearTimeout(tAviso);
  tAviso = window.setTimeout(() => el.classList.remove("visible"), 2500);
}

// ---------- Guardado ----------
let tGuardar = 0;
function guardarPronto() {
  clearTimeout(tGuardar);
  tGuardar = window.setTimeout(() => {
    guardarRegistros(registros);
    guardarTrabajos(trabajos);
  }, 300);
}
window.addEventListener("beforeunload", () => {
  guardarRegistros(registros);
  guardarTrabajos(trabajos);
});

// ---------- Miniaturas ----------
const urls = new Map<string, string>();
const tipos = new Map<string, string>();
async function urlFoto(id: string): Promise<string | null> {
  if (urls.has(id)) return urls.get(id)!;
  const b = await leerFoto(id);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urls.set(id, u);
  tipos.set(id, b.type);
  return u;
}

// ---------- Tabla ----------
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function ordenar() {
  registros.sort((a, b) => a.creado - b.creado);
}

function autoAlto(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + 2 + "px";
}

function renderTabla() {
  const filtro = ($<HTMLInputElement>("#filtro").value || "").toLowerCase();
  // conservar el foco si el usuario está escribiendo
  const act = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  const foco = act?.dataset?.campo
    ? { id: act.closest("tr")?.dataset.id, campo: act.dataset.campo, ini: act.selectionStart, fin: act.selectionEnd }
    : null;

  const filas = registros.filter(
    (r) => !filtro || `${r.carrera} ${r.dictamen} ${r.descripcion} ${r.fuente}`.toLowerCase().includes(filtro),
  );
  const tb = $("#tbody");
  tb.innerHTML = filas
    .map((r) => {
      const n = registros.indexOf(r) + 1;
      const filasCar = Math.max(2, r.carrera.split("\n").length);
      return `<tr data-id="${r.id}" class="${r.revisar ? "revisar" : ""}">
        <td class="n">${n}</td>
        <td class="foto">${r.fotoIds.map((f) => `<img data-foto="${f}" alt="" />`).join("")}</td>
        <td class="car" data-label="Carrera"><textarea data-campo="carrera" rows="${filasCar}" title="Una línea por dependencia">${esc(r.carrera)}</textarea></td>
        <td class="dic" data-label="N° Dictamen"><input type="text" data-campo="dictamen" value="${esc(r.dictamen)}" /></td>
        <td data-label="Descripción"><textarea data-campo="descripcion" rows="2">${esc(r.descripcion)}</textarea></td>
        <td class="rev"><label><input type="checkbox" data-campo="revisar" ${r.revisar ? "checked" : ""}/> revisar</label>
          ${r.nota ? `<span class="nota">${esc(r.nota)}</span>` : ""}</td>
        <td class="acc"><button data-acc="arriba" title="Subir" aria-label="Subir">↑</button><button data-acc="abajo" title="Bajar" aria-label="Bajar">↓</button><button data-acc="borrar" title="Eliminar" aria-label="Eliminar">🗑</button></td>
      </tr>`;
    })
    .join("");
  $("#contador").textContent = filtro ? `${filas.length} de ${registros.length} registros` : `${registros.length} registros`;

  tb.querySelectorAll<HTMLImageElement>("img[data-foto]").forEach(async (img) => {
    const id = img.dataset.foto!;
    const u = await urlFoto(id);
    if (!u) return img.remove();
    if (tipos.get(id) === "application/pdf") {
      img.alt = "PDF";
      img.src =
        "data:image/svg+xml," +
        encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" fill="#fee2e2"/><text x="28" y="34" font-size="16" text-anchor="middle" fill="#b91c1c">PDF</text></svg>');
    } else img.src = u;
  });

  tb.querySelectorAll("textarea").forEach(autoAlto);

  if (foco?.id) {
    const el = tb.querySelector<HTMLInputElement>(`tr[data-id="${foco.id}"] [data-campo="${foco.campo}"]`);
    if (el) {
      el.focus();
      try { el.setSelectionRange(foco.ini, foco.fin); } catch { /* checkbox */ }
    }
  }
}

$("#tbody").addEventListener("input", (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el instanceof HTMLTextAreaElement) autoAlto(el);
  const campo = el.dataset.campo as keyof Registro | undefined;
  const id = el.closest("tr")?.dataset.id;
  const r = registros.find((x) => x.id === id);
  if (!r || !campo) return;
  if (campo === "revisar") {
    r.revisar = el.checked;
    if (!r.revisar) r.nota = "";
    el.closest("tr")!.classList.toggle("revisar", r.revisar);
  } else if (campo === "carrera" || campo === "dictamen" || campo === "descripcion") {
    r[campo] = el.value;
  }
  guardarPronto();
});

$("#tbody").addEventListener("click", async (ev) => {
  const t = ev.target as HTMLElement;
  const img = t.closest<HTMLImageElement>("img[data-foto]");
  if (img) return verFoto(img.dataset.foto!);
  const acc = t.closest<HTMLButtonElement>("button[data-acc]")?.dataset.acc;
  if (!acc) return;
  const id = t.closest("tr")?.dataset.id;
  const i = registros.findIndex((x) => x.id === id);
  if (i < 0) return;
  if (acc === "borrar") {
    if (!confirm("¿Eliminar este registro?")) return;
    registros.splice(i, 1);
  } else {
    const j = acc === "arriba" ? i - 1 : i + 1;
    if (j < 0 || j >= registros.length) return;
    [registros[i].creado, registros[j].creado] = [registros[j].creado, registros[i].creado];
    ordenar();
  }
  guardarPronto();
  renderTabla();
});

async function verFoto(id: string) {
  const u = await urlFoto(id);
  if (!u) return;
  const cont = $("#foto-grande");
  cont.innerHTML = tipos.get(id) === "application/pdf" ? `<iframe src="${u}"></iframe>` : `<img src="${u}" alt="" />`;
  $<HTMLDialogElement>("#dlg-foto").showModal();
}

$("#filtro").addEventListener("input", renderTabla);

$("#btn-agregar").addEventListener("click", () => {
  registros.push({
    id: uid(), carrera: "", dictamen: "", descripcion: "", fotoIds: [], fuente: "manual",
    revisar: false, nota: "", creado: Date.now(),
  });
  guardarPronto();
  renderTabla();
  $<HTMLTextAreaElement>(`tr[data-id="${registros[registros.length - 1].id}"] textarea`)?.focus();
});

$("#btn-borrar").addEventListener("click", async () => {
  if (!registros.length && !trabajos.length) return;
  if (!confirm(`¿Borrar los ${registros.length} registros y sus fotos? Exporta el Excel antes si lo necesitas.`)) return;
  if (!confirm("¿Seguro? Esto no se puede deshacer.")) return;
  $<HTMLDialogElement>("#dlg-ajustes").close();
  registros = [];
  trabajos = trabajos.filter((t) => t.estado === "procesando");
  await guardarRegistros(registros);
  await guardarTrabajos(trabajos);
  await limpiarFotosHuerfanas(registros, trabajos);
  renderTabla();
  renderCola();
});

// ---------- Excel ----------
$("#btn-exportar").addEventListener("click", async () => {
  if (!registros.length) return alert("No hay registros para exportar.");
  const blob = await exportarExcel(registros);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombreExcel();
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

const nombreExcel = () => `registro_${new Date().toISOString().slice(0, 10)}.xlsx`;
const btnCompartir = $<HTMLButtonElement>("#btn-compartir");
try {
  btnCompartir.hidden = !navigator.canShare?.({ files: [new File([""], "x.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })] });
} catch { /* sin soporte */ }
btnCompartir.addEventListener("click", async () => {
  if (!registros.length) return alert("No hay registros para compartir.");
  const blob = await exportarExcel(registros);
  const file = new File([blob], nombreExcel(), { type: blob.type });
  try {
    await navigator.share({ files: [file], title: "Registro de dictámenes" });
  } catch (e) {
    if ((e as Error).name !== "AbortError") alert("No se pudo compartir: " + (e as Error).message);
  }
});

$<HTMLInputElement>("#in-excel").addEventListener("change", async (ev) => {
  const input = ev.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = "";
  if (!f) return;
  try {
    const nuevos = await importarExcel(f);
    const base = registros.length ? Math.max(...registros.map((r) => r.creado)) + 1 : Date.now();
    nuevos.forEach((r, i) => (r.creado = base + i));
    registros.push(...nuevos);
    guardarPronto();
    renderTabla();
    alert(`Se importaron ${nuevos.length} registros (agregados al final).`);
  } catch (e) {
    alert("No se pudo importar: " + mensajeDeError(e));
  }
});

// ---------- Carga de fotos y cola de la IA ----------
let mismoAcumular = false;
let grupoCamara: Trabajo | null = null;

async function agregarArchivos(files: File[], desdeCamara = false) {
  files = files.filter((f) => f.type.startsWith("image/") || f.type === "application/pdf" || /\.(pdf|jpe?g|png|webp|heic)$/i.test(f.name));
  if (!files.length) return;
  if (!ajustes.apiKey) {
    alert("Primero ingresa tu clave de API en ⚙ Ajustes. Las fotos quedarán en cola.");
  }
  const marcado = $<HTMLInputElement>("#chk-mismo").checked;
  mismoAcumular = desdeCamara && marcado;
  const mismo = marcado && (files.length > 1 || mismoAcumular);
  const base = Date.now();
  const preparados: { id: string; nombre: string }[] = [];
  $("#cola").insertAdjacentHTML("afterbegin", `<p id="preparando">Preparando ${files.length} archivo(s)…</p>`);
  for (const f of files) {
    try {
      const blob = await prepararArchivo(f);
      const id = uid();
      await guardarFoto(id, blob);
      preparados.push({ id, nombre: f.name || "foto" });
    } catch (e) {
      trabajos.push({ id: uid(), nombre: f.name, fotoIds: [], estado: "error", error: mensajeDeError(e), creado: base });
    }
  }
  if (mismoAcumular && preparados.length) {
    // Cámara + "mismo documento": cada foto se suma al mismo grupo, que espera hasta desmarcar la casilla
    if (!grupoCamara || !trabajos.includes(grupoCamara) || grupoCamara.estado !== "espera") {
      grupoCamara = { id: uid(), nombre: "Documento de varias páginas", fotoIds: [], estado: "espera", creado: base };
      trabajos.push(grupoCamara);
    }
    grupoCamara.fotoIds.push(...preparados.map((p) => p.id));
    grupoCamara.nombre = `Documento de ${grupoCamara.fotoIds.length} página(s)`;
  } else if (mismo && preparados.length) {
    trabajos.push({
      id: uid(), nombre: preparados.map((p) => p.nombre).join(", "), fotoIds: preparados.map((p) => p.id),
      estado: "pendiente", creado: base,
    });
  } else {
    preparados.forEach((p, i) =>
      trabajos.push({ id: uid(), nombre: p.nombre, fotoIds: [p.id], estado: "pendiente", creado: base + i }),
    );
  }
  // En modo "mismo documento" con la cámara, las fotos se van juntando hasta desmarcar la casilla
  if (!(mismoAcumular && $<HTMLInputElement>("#chk-mismo").checked)) $<HTMLInputElement>("#chk-mismo").checked = false;
  await guardarTrabajos(trabajos);
  if (mismoAcumular && grupoCamara) {
    aviso(`📄 Página ${grupoCamara.fotoIds.length} agregada. Toma la siguiente o desmarca la casilla para enviar.`);
  } else if (preparados.length) {
    aviso(preparados.length === 1 ? "✔ Foto agregada. La IA la está leyendo…" : `✔ ${preparados.length} fotos agregadas`);
  }
  renderCola();
  procesarCola();
}

function procesarCola() {
  if (!ajustes.apiKey) return renderCola();
  while (activos < Math.max(1, ajustes.paralelo)) {
    const t = trabajos.find((x) => x.estado === "pendiente");
    if (!t) break;
    activos++;
    t.estado = "procesando";
    renderCola();
    procesar(t).finally(() => {
      activos--;
      guardarPronto();
      renderCola();
      procesarCola();
    });
  }
}

async function procesar(t: Trabajo) {
  try {
    const archivos = [];
    for (const id of t.fotoIds) {
      const blob = await leerFoto(id);
      if (!blob) throw new Error("La foto ya no está guardada.");
      archivos.push({ blob, nombre: t.nombre });
    }
    const res = await interpretar(ajustes.apiKey, ajustes.modelo, archivos, t.fotoIds.length > 1);
    const lista = res.length
      ? res
      : [{ carrera: [], n_dictamen: "", descripcion: "", revisar: true, nota: "La IA no encontró ningún documento" }];
    lista.forEach((r, i) =>
      registros.push({
        id: uid(),
        carrera: r.carrera.map((s) => s.trim()).filter(Boolean).join("\n"),
        dictamen: r.n_dictamen.trim(),
        descripcion: r.descripcion.trim(),
        fotoIds: t.fotoIds,
        fuente: t.nombre,
        revisar: r.revisar,
        nota: r.revisar ? r.nota : "",
        creado: t.creado + i / 100,
      }),
    );
    ordenar();
    trabajos = trabajos.filter((x) => x !== t);
    completadosSesion++;
    renderTabla();
  } catch (e) {
    t.estado = "error";
    t.error = mensajeDeError(e);
  }
}

function renderCola() {
  const cola = $("#cola");
  if (!trabajos.length) {
    cola.innerHTML = completadosSesion ? `<p class="ayuda">✔ ${completadosSesion} carga(s) procesadas en esta sesión.</p>` : "";
    return;
  }
  const c = (e: string) => trabajos.filter((t) => t.estado === e).length;
  const pend = c("pendiente"), proc = c("procesando"), err = c("error");
  const visibles = trabajos.filter((t) => t.estado !== "pendiente").slice(0, 50);
  const etiqueta = (t: Trabajo) =>
    t.estado === "procesando" ? "⏳ procesando" : t.estado === "espera" ? "📄 juntando páginas (desmarca la casilla para enviar)" : "⚠ error";
  cola.innerHTML = `
    <div class="cola-res">
      <b>Cola IA:</b> ${proc} procesando · ${pend} en espera · ${completadosSesion} listas · ${err} con error
      ${!ajustes.apiKey && pend ? '<span class="trabajo error">— falta la clave de API (⚙ Ajustes)</span>' : ""}
      ${err ? '<button class="btn chico" data-cola="reintentar">Reintentar errores</button><button class="btn chico" data-cola="descartar">Descartar errores</button>' : ""}
    </div>
    ${visibles
      .map(
        (t) => `<div class="trabajo ${t.estado}"><span class="estado">${etiqueta(t)}</span>
        <span>${esc(t.nombre)}${t.error ? " — " + esc(t.error) : ""}</span></div>`,
      )
      .join("")}`;
}

$("#cola").addEventListener("click", async (ev) => {
  const acc = (ev.target as HTMLElement).dataset.cola;
  if (acc === "reintentar") {
    trabajos.forEach((t) => {
      if (t.estado === "error" && t.fotoIds.length) { t.estado = "pendiente"; t.error = undefined; }
    });
    procesarCola();
  } else if (acc === "descartar") {
    trabajos = trabajos.filter((t) => t.estado !== "error");
    await guardarTrabajos(trabajos);
    await limpiarFotosHuerfanas(registros, trabajos);
  }
  guardarPronto();
  renderCola();
});

for (const sel of ["#in-camara", "#in-archivos"]) {
  $<HTMLInputElement>(sel).addEventListener("change", (ev) => {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    agregarArchivos(files, sel === "#in-camara");
  });
}

// Al desmarcar "mismo documento", el grupo de páginas tomadas con la cámara se envía a la IA
$<HTMLInputElement>("#chk-mismo").addEventListener("change", (ev) => {
  if ((ev.target as HTMLInputElement).checked) return;
  trabajos.forEach((t) => { if (t.estado === "espera") t.estado = "pendiente"; });
  grupoCamara = null;
  guardarPronto();
  renderCola();
  procesarCola();
});

// Arrastrar y soltar
let profundidad = 0;
window.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer?.types.includes("Files")) return;
  profundidad++;
  document.body.classList.add("arrastrando");
});
window.addEventListener("dragleave", () => {
  if (--profundidad <= 0) { profundidad = 0; document.body.classList.remove("arrastrando"); }
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  profundidad = 0;
  document.body.classList.remove("arrastrando");
  const files = Array.from(e.dataTransfer?.files ?? []);
  const excel = files.find((f) => f.name.toLowerCase().endsWith(".xlsx"));
  if (excel) {
    const dt = new DataTransfer();
    dt.items.add(excel);
    const inp = $<HTMLInputElement>("#in-excel");
    inp.files = dt.files;
    inp.dispatchEvent(new Event("change"));
  }
  agregarArchivos(files.filter((f) => f !== excel));
});
// Pegar imágenes
window.addEventListener("paste", (e) => {
  const files = Array.from(e.clipboardData?.files ?? []);
  if (files.length) { e.preventDefault(); agregarArchivos(files); }
});

// ---------- Ajustes ----------
const dlg = $<HTMLDialogElement>("#dlg-ajustes");
$<HTMLSelectElement>("#aj-modelo").innerHTML = MODELOS.map((m) => `<option value="${m.id}">${m.nombre}</option>`).join("");
function abrirAjustes() {
  $<HTMLInputElement>("#aj-key").value = ajustes.apiKey;
  $<HTMLSelectElement>("#aj-modelo").value = ajustes.modelo;
  $<HTMLInputElement>("#aj-paralelo").value = String(ajustes.paralelo);
  dlg.showModal();
}
$("#btn-ajustes").addEventListener("click", abrirAjustes);
dlg.addEventListener("close", () => {
  if (dlg.returnValue !== "ok") return;
  ajustes = {
    apiKey: $<HTMLInputElement>("#aj-key").value.trim(),
    modelo: $<HTMLSelectElement>("#aj-modelo").value,
    paralelo: Math.min(10, Math.max(1, Number($<HTMLInputElement>("#aj-paralelo").value) || 3)),
  };
  guardarAjustes(ajustes);
  procesarCola();
});

// ---------- Inicio ----------
(async () => {
  pedirPersistencia();
  registros = await cargarRegistros();
  trabajos = await cargarTrabajos();
  // Trabajos que quedaron a medias al cerrar la página vuelven a la cola
  trabajos.forEach((t) => { if (t.estado === "procesando" || t.estado === "espera") t.estado = "pendiente"; });
  ordenar();
  renderTabla();
  renderCola();
  if (!ajustes.apiKey) abrirAjustes();
  procesarCola();
})();
