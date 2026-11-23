import "./style.css";
import {
  type Registro,
  type Trabajo,
  uid,
  cargarTrabajos,
  guardarTrabajos,
  guardarFoto,
  leerFoto,
  borrarFoto,
  limpiarFotosHuerfanas,
  pedirPersistencia,
  cargarAjustes,
  guardarAjustes,
} from "./db";
import { prepararArchivo } from "./imagen";
import { interpretar, interpretarConSuscripcion, mensajeDeError, ErrorPausa, MODELOS, type RegistroIA } from "./ia";
import { exportarExcel, importarExcel } from "./excel";
import { detectarPlataforma, type Plataforma } from "./plataforma";
import { type Almacen, AlmacenLocal, AlmacenClaude } from "./almacen";
import { preguntar, confirmar, aviso } from "./ui";
import { abrirCamara, cerrarCamara, capturar } from "./camara";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

let registros: Registro[] = [];
let trabajos: Trabajo[] = [];
let ajustes = cargarAjustes();
let plataforma: Plataforma = { enClaude: false, sample: null, maxImagenes: 0, db: null, downloads: null };
let almacen: Almacen = new AlmacenLocal(() => registros);
let listo = false;
let activos = 0;
let completadosSesion = 0;
/** La cola está detenida por un error de la cuenta (límite de uso, permiso…). */
let pausado = false;
/** En claude.ai la IA gasta el uso del usuario: la cola arranca solo tras una acción suya. */
let autorizado = false;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

let tTrab = 0;
function guardarTrabajosPronto() {
  clearTimeout(tTrab);
  tTrab = window.setTimeout(() => guardarTrabajos(trabajos), 300);
}

// ---------- Miniaturas ----------
const urls = new Map<string, string>();
const tipos = new Map<string, string>();
async function urlFoto(id: string): Promise<string | null> {
  if (urls.has(id)) return urls.get(id)!;
  const b = await leerFoto(id).catch(() => undefined);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urls.set(id, u);
  tipos.set(id, b.type);
  return u;
}
const ICONO_PDF =
  "data:image/svg+xml," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" fill="#fde2e0"/><text x="28" y="34" font-size="16" text-anchor="middle" fill="#b42318" font-family="sans-serif">PDF</text></svg>');

async function cargarMiniaturas(raiz: ParentNode) {
  raiz.querySelectorAll<HTMLImageElement>("img[data-foto]:not([src])").forEach(async (img) => {
    const id = img.dataset.foto!;
    const u = await urlFoto(id);
    if (!u) return img.remove(); // la foto está en otro dispositivo
    img.src = tipos.get(id) === "application/pdf" ? ICONO_PDF : u;
  });
}

// ---------- Tabla / tarjetas ----------
function ordenar() {
  registros.sort((a, b) => a.creado - b.creado);
}
const firma = (r: Registro, n: number) =>
  JSON.stringify([n, r.carrera, r.dictamen, r.descripcion, r.revisar, r.nota, r.fotoIds]);

function autoAlto(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + 2 + "px";
}

function filaHTML(r: Registro, n: number) {
  return `<tr data-id="${esc(r.id)}" data-f="${esc(firma(r, n))}" class="${r.revisar ? "revisar" : ""}">
    <td class="n">${n}</td>
    <td class="foto">${r.fotoIds.map((f) => `<img data-foto="${esc(f)}" alt="Foto del documento" />`).join("")}</td>
    <td class="car" data-label="Carrera"><textarea id="car-${esc(r.id)}" data-campo="carrera" rows="1" title="Una línea por dependencia">${esc(r.carrera)}</textarea></td>
    <td class="dic" data-label="N° Dictamen"><input id="dic-${esc(r.id)}" type="text" data-campo="dictamen" value="${esc(r.dictamen)}" /></td>
    <td data-label="Descripción"><textarea id="des-${esc(r.id)}" data-campo="descripcion" rows="1">${esc(r.descripcion)}</textarea></td>
    <td class="rev"><label><input id="rev-${esc(r.id)}" type="checkbox" data-campo="revisar" ${r.revisar ? "checked" : ""}/> revisar</label>
      ${r.nota ? `<span class="nota">${esc(r.nota)}</span>` : ""}</td>
    <td class="acc"><button type="button" data-acc="arriba" aria-label="Subir">↑</button><button type="button" data-acc="abajo" aria-label="Bajar">↓</button><button type="button" data-acc="borrar" aria-label="Eliminar">🗑</button></td>
  </tr>`;
}

function renderTabla() {
  const filtro = ($<HTMLInputElement>("#filtro").value || "").toLowerCase();
  const act = document.activeElement as HTMLInputElement | null;
  const foco = act?.dataset?.campo
    ? { id: act.closest("tr")?.dataset.id, campo: act.dataset.campo, ini: act.selectionStart, fin: act.selectionEnd }
    : null;

  const filas = registros.filter(
    (r) => !filtro || `${r.carrera} ${r.dictamen} ${r.descripcion} ${r.fuente}`.toLowerCase().includes(filtro),
  );
  const numero = new Map(registros.map((r, i) => [r.id, i + 1]));
  const tb = $("#tbody");
  const actuales = Array.from(tb.children) as HTMLTableRowElement[];
  const mismoOrden = actuales.length === filas.length && actuales.every((tr, i) => tr.dataset.id === filas[i].id);

  if (mismoOrden) {
    // Solo se reemplazan las filas que cambiaron (no se interrumpe a quien está escribiendo)
    filas.forEach((r, i) => {
      const n = numero.get(r.id)!;
      if (actuales[i].dataset.f === firma(r, n)) return;
      const t = document.createElement("tbody");
      t.innerHTML = filaHTML(r, n);
      const nueva = t.firstElementChild as HTMLTableRowElement;
      actuales[i].replaceWith(nueva);
      nueva.querySelectorAll("textarea").forEach(autoAlto);
    });
  } else {
    tb.innerHTML = filas.map((r) => filaHTML(r, numero.get(r.id)!)).join("");
    tb.querySelectorAll("textarea").forEach(autoAlto);
  }
  cargarMiniaturas(tb);
  $("#contador").textContent = filtro ? `${filas.length} de ${registros.length} registros` : `${registros.length} registros`;
  $("#vacio").hidden = registros.length > 0;

  if (foco?.id && document.activeElement !== act) {
    const el = tb.querySelector<HTMLInputElement>(`tr[data-id="${CSS.escape(foco.id)}"] [data-campo="${foco.campo}"]`);
    if (el) {
      el.focus();
      try { el.setSelectionRange(foco.ini, foco.fin); } catch { /* checkbox */ }
    }
  }
}

$("#tbody").addEventListener("input", (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el instanceof HTMLTextAreaElement) autoAlto(el);
  const campo = el.dataset.campo;
  const tr = el.closest("tr") as HTMLTableRowElement | null;
  const r = registros.find((x) => x.id === tr?.dataset.id);
  if (!r || !campo || !tr) return;
  if (campo === "revisar") {
    r.revisar = el.checked;
    if (!r.revisar) r.nota = "";
    tr.classList.toggle("revisar", r.revisar);
    tr.querySelector(".nota")?.remove();
  } else if (campo === "carrera" || campo === "dictamen" || campo === "descripcion") {
    r[campo] = el.value;
  }
  tr.dataset.f = firma(r, registros.indexOf(r) + 1);
  almacen.guardar(r);
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
    const r = registros[i];
    if (!(await confirmar(`¿Eliminar el registro ${r.dictamen || "sin número"}?`, "Eliminar", true))) return;
    registros.splice(registros.indexOf(r), 1);
    almacen.borrar(r.id);
  } else {
    const j = acc === "arriba" ? i - 1 : i + 1;
    if (j < 0 || j >= registros.length) return;
    const a = registros[i], b = registros[j];
    [a.creado, b.creado] = [b.creado, a.creado];
    if (a.creado === b.creado) a.creado += acc === "arriba" ? -0.001 : 0.001;
    almacen.guardar(a);
    almacen.guardar(b);
    ordenar();
  }
  renderTabla();
});

async function verFoto(id: string) {
  const u = await urlFoto(id);
  if (!u) return;
  const cont = $("#foto-grande");
  cont.innerHTML = tipos.get(id) === "application/pdf" ? `<iframe src="${u}" title="PDF"></iframe>` : `<img src="${u}" alt="Foto del documento" />`;
  $<HTMLDialogElement>("#dlg-foto").showModal();
}

$("#filtro").addEventListener("input", renderTabla);

$("#btn-agregar").addEventListener("click", () => {
  const ultimo = registros.at(-1)?.creado ?? 0;
  const r: Registro = {
    id: uid(), carrera: "", dictamen: "", descripcion: "", fotoIds: [], fuente: "manual",
    revisar: false, nota: "", creado: Math.max(Date.now(), ultimo + 1),
  };
  registros.push(r);
  almacen.guardar(r);
  renderTabla();
  $<HTMLTextAreaElement>(`#car-${CSS.escape(r.id)}`)?.focus();
});

$("#btn-borrar").addEventListener("click", async () => {
  if (!registros.length) return aviso("No hay registros.");
  $<HTMLDialogElement>("#dlg-ajustes").close();
  if (!(await confirmar(`¿Borrar los ${registros.length} registros? Descarga el Excel antes si lo necesitas. No se puede deshacer.`, "Borrar todo", true))) return;
  for (const r of registros) almacen.borrar(r.id);
  registros = [];
  renderTabla();
  await almacen.vaciar();
  await limpiarFotosHuerfanas(registros, trabajos);
  aviso("Registros borrados");
});

// Datos que llegan de otro dispositivo (solo en claude.ai)
function fusionarRemotos(remotos: Registro[]) {
  const pend = almacen.pendientes();
  const locales = new Map(registros.map((r) => [r.id, r]));
  const idsRemotos = new Set(remotos.map((r) => r.id));
  const nuevos = remotos
    .filter((r) => !(pend.has(r.id) && !locales.has(r.id))) // borrado aquí, aún no confirmado
    .map((r) => (pend.has(r.id) && locales.has(r.id) ? locales.get(r.id)! : r));
  for (const r of registros) if (pend.has(r.id) && !idsRemotos.has(r.id)) nuevos.push(r); // creado aquí, aún no confirmado
  registros = nuevos;
  ordenar();
  renderTabla();
}

// ---------- Excel ----------
const nombreExcel = () => `registro_${new Date().toISOString().slice(0, 10)}.xlsx`;

$("#btn-exportar").addEventListener("click", async () => {
  if (!registros.length) return aviso("No hay registros para descargar.");
  await almacen.vaciar();
  const blob = await exportarExcel(registros);
  if (plataforma.enClaude) {
    if (!plataforma.downloads) return aviso("Esta vista de Claude no permite descargar archivos. Abre la app en el navegador.", 5000);
    try {
      await plataforma.downloads.save({ filename: nombreExcel(), data: blob });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "declined") aviso("No se pudo descargar el Excel (" + (code ?? "error") + ").");
    }
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombreExcel();
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

const btnCompartir = $<HTMLButtonElement>("#btn-compartir");
btnCompartir.addEventListener("click", async () => {
  if (!registros.length) return aviso("No hay registros para compartir.");
  const blob = await exportarExcel(registros);
  const file = new File([blob], nombreExcel(), { type: blob.type });
  try {
    await navigator.share({ files: [file], title: "Registro de dictámenes" });
  } catch (e) {
    if ((e as Error).name !== "AbortError") aviso("No se pudo compartir: " + (e as Error).message);
  }
});

$<HTMLInputElement>("#in-excel").addEventListener("change", async (ev) => {
  const input = ev.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = "";
  if (f) await importarArchivoExcel(f);
});

async function importarArchivoExcel(f: File) {
  try {
    const nuevos = await importarExcel(f);
    const base = registros.length ? Math.max(...registros.map((r) => r.creado)) + 1 : Date.now();
    nuevos.forEach((r, i) => {
      r.creado = base + i;
      almacen.guardar(r);
    });
    registros.push(...nuevos);
    renderTabla();
    aviso(`Se importaron ${nuevos.length} registros (agregados al final).`, 4000);
  } catch (e) {
    aviso("No se pudo importar: " + mensajeDeError(e), 5000);
  }
}

// ---------- Cola de la IA ----------
const puedeLeer = () => (plataforma.enClaude ? !!plataforma.sample && plataforma.maxImagenes > 0 : !!ajustes.apiKey);
const maxParalelo = () => (plataforma.enClaude ? 2 : Math.max(1, ajustes.paralelo));
const esPdf = (b: Blob) => b.type === "application/pdf";

function procesarCola() {
  renderCola();
  if (!listo || pausado || !puedeLeer()) return;
  if (plataforma.enClaude && !autorizado) return;
  while (activos < maxParalelo()) {
    const t = trabajos.find((x) => x.estado === "pendiente");
    if (!t) break;
    activos++;
    t.estado = "procesando";
    procesar(t).finally(() => {
      activos--;
      guardarTrabajosPronto();
      procesarCola();
    });
  }
  renderCola();
}

async function procesar(t: Trabajo) {
  try {
    const blobs: Blob[] = [];
    for (const id of t.fotoIds) {
      const blob = await leerFoto(id);
      if (!blob) throw new Error("La foto ya no está guardada en este dispositivo.");
      blobs.push(blob);
    }
    let res: RegistroIA[];
    let extra = "";
    if (plataforma.enClaude) {
      if (!plataforma.sample) throw new ErrorPausa("Claude no está disponible en esta vista.");
      const imgs = blobs.filter((b) => !esPdf(b));
      if (!imgs.length) throw new Error("En la versión de claude.ai sube fotos (JPG/PNG), no PDF.");
      const usar = imgs.slice(0, plataforma.maxImagenes);
      if (imgs.length > usar.length) extra = `Solo se leyeron las primeras ${usar.length} de ${imgs.length} páginas.`;
      res = await interpretarConSuscripcion(plataforma.sample, usar, t.fotoIds.length > 1, ajustes.precision);
    } else {
      res = await interpretar(ajustes.apiKey, ajustes.modelo, blobs.slice(0, 20).map((blob) => ({ blob, nombre: t.nombre })), t.fotoIds.length > 1);
    }
    const lista = res.length ? res : [{ carrera: [], n_dictamen: "", descripcion: "", revisar: true, nota: "La IA no encontró ningún documento" }];
    lista.forEach((r, i) => {
      const nota = [r.revisar ? r.nota : "", extra].filter(Boolean).join(" ");
      const reg: Registro = {
        id: uid(),
        carrera: r.carrera.map((s) => s.trim()).filter(Boolean).join("\n"),
        dictamen: r.n_dictamen.trim(),
        descripcion: r.descripcion.trim(),
        fotoIds: t.fotoIds,
        fuente: t.nombre,
        revisar: r.revisar || !!extra,
        nota,
        creado: t.creado + i / 100,
      };
      registros.push(reg);
      almacen.guardar(reg);
    });
    ordenar();
    trabajos = trabajos.filter((x) => x !== t);
    completadosSesion++;
    renderTabla();
  } catch (e) {
    t.estado = "error";
    t.error = mensajeDeError(e);
    if (e instanceof ErrorPausa) pausado = true;
  }
}

function renderCola() {
  const cola = $("#cola");
  const visibles = trabajos.filter((t) => t.estado !== "espera");
  if (!visibles.length) {
    cola.innerHTML = completadosSesion ? `<p class="ayuda">✔ ${completadosSesion} documento(s) leídos en esta sesión.</p>` : "";
    return;
  }
  const c = (e: string) => trabajos.filter((t) => t.estado === e).length;
  const pend = c("pendiente"), proc = c("procesando"), err = c("error");
  const detenida = pend && !proc && (pausado || (plataforma.enClaude && !autorizado) || !puedeLeer());
  cola.innerHTML = `
    <div class="cola-res">
      <b>Lectura IA:</b> ${proc} leyendo · ${pend} en espera · ${err} con error
      ${detenida && puedeLeer() ? `<button type="button" class="btn chico primario" data-cola="continuar">▶ Leer ${pend} pendiente(s)</button>` : ""}
      ${!puedeLeer() && pend ? '<span class="trabajo error">— la IA no está disponible (mira ⚙ Ajustes)</span>' : ""}
      ${err ? '<button type="button" class="btn chico" data-cola="reintentar">Reintentar errores</button><button type="button" class="btn chico" data-cola="descartar">Descartar errores</button>' : ""}
    </div>
    ${visibles
      .filter((t) => t.estado !== "pendiente")
      .slice(0, 50)
      .map(
        (t) => `<div class="trabajo ${t.estado}"><span class="estado">${t.estado === "procesando" ? "⏳ leyendo" : "⚠ error"}</span>
        <span>${esc(t.nombre)}${t.error ? " — " + esc(t.error) : ""}</span></div>`,
      )
      .join("")}`;
}

$("#cola").addEventListener("click", async (ev) => {
  const acc = (ev.target as HTMLElement).dataset.cola;
  if (!acc) return;
  autorizado = true;
  pausado = false;
  if (acc === "reintentar") {
    trabajos.forEach((t) => {
      if (t.estado === "error" && t.fotoIds.length) { t.estado = "pendiente"; t.error = undefined; }
    });
  } else if (acc === "descartar") {
    trabajos = trabajos.filter((t) => t.estado !== "error");
    await guardarTrabajos(trabajos);
    await limpiarFotosHuerfanas(registros, trabajos);
  }
  guardarTrabajosPronto();
  procesarCola();
});

// ---------- Galería: muchas fotos de un tiro ----------
async function agregarArchivos(files: File[]) {
  files = files.filter((f) => f.type.startsWith("image/") || f.type === "application/pdf" || /\.(pdf|jpe?g|png|webp|heic)$/i.test(f.name));
  if (plataforma.enClaude && files.some((f) => f.type === "application/pdf")) {
    aviso("En la versión de claude.ai solo se leen fotos; se omitieron los PDF.", 4000);
    files = files.filter((f) => f.type !== "application/pdf");
  }
  if (!files.length) return;

  let unSolo = false;
  if (files.length > 1) {
    const r = await preguntar(`Elegiste ${files.length} fotos. ¿Qué son?`, [
      { valor: "cancelar", etiqueta: "Cancelar" },
      { valor: "uno", etiqueta: `Páginas de UN solo documento (1 registro)` },
      { valor: "varios", etiqueta: `Documentos distintos (${files.length} registros)`, tipo: "primario" },
    ]);
    if (!r || r === "cancelar") return;
    unSolo = r === "uno";
  }

  aviso(`Preparando ${files.length} foto(s)…`);
  const base = Math.max(Date.now(), (registros.at(-1)?.creado ?? 0) + 1);
  const preparados: { id: string; nombre: string }[] = [];
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
  if (unSolo && preparados.length) {
    trabajos.push({
      id: uid(), nombre: `Documento de ${preparados.length} página(s)`, fotoIds: preparados.map((p) => p.id),
      estado: "pendiente", creado: base,
    });
  } else {
    preparados.forEach((p, i) =>
      trabajos.push({ id: uid(), nombre: p.nombre, fotoIds: [p.id], estado: "pendiente", creado: base + i }),
    );
  }
  await guardarTrabajos(trabajos);
  autorizado = true;
  pausado = false;
  aviso(preparados.length === 1 ? "✔ Foto agregada; la IA la está leyendo…" : `✔ ${preparados.length} fotos agregadas; la IA las está leyendo…`);
  procesarCola();
}

$<HTMLInputElement>("#in-archivos").addEventListener("change", (ev) => {
  const input = ev.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  agregarArchivos(files);
});

// ---------- Nuevo documento con la cámara: muchas páginas -> UN documento ----------
const dlgDoc = $<HTMLDialogElement>("#dlg-doc");
const visor = $<HTMLVideoElement>("#visor");
let stream: MediaStream | null = null;
let doc: Trabajo | null = null;

async function abrirDocumento() {
  doc = trabajos.find((t) => t.estado === "espera") ?? null;
  if (!doc) {
    doc = { id: uid(), nombre: "Documento", fotoIds: [], estado: "espera", creado: Date.now() };
    trabajos.push(doc);
  }
  renderPaginas();
  dlgDoc.showModal();
  stream = await abrirCamara(visor);
  const conVisor = !!stream;
  visor.hidden = !conVisor;
  $("#sin-visor").hidden = conVisor;
  $("#doc-disparar").hidden = !conVisor;
  $("#doc-tomar").hidden = conVisor;
}

function cerrarDocumento() {
  cerrarCamara(visor, stream);
  stream = null;
  if (dlgDoc.open) dlgDoc.close();
}

async function agregarPagina(blob: Blob) {
  if (!doc) return;
  const id = uid();
  await guardarFoto(id, blob);
  doc.fotoIds.push(id);
  await guardarTrabajos(trabajos); // cada página queda guardada al instante
  renderPaginas();
  aviso(`📄 Página ${doc.fotoIds.length} agregada`, 1500);
}

function renderPaginas() {
  if (!doc) return;
  const n = doc.fotoIds.length;
  $("#doc-titulo").textContent = n ? `Documento nuevo · ${n} página(s)` : "Documento nuevo";
  const guardar = $<HTMLButtonElement>("#doc-guardar");
  guardar.disabled = n === 0;
  guardar.textContent = n ? `✔ Guardar (${n})` : "✔ Guardar";
  const cont = $("#paginas");
  cont.innerHTML = doc.fotoIds
    .map((id, i) => `<div class="pagina"><img data-foto="${esc(id)}" alt="Página ${i + 1}" /><span>${i + 1}</span><button type="button" data-quitar="${esc(id)}" aria-label="Quitar página ${i + 1}">✕</button></div>`)
    .join("");
  cargarMiniaturas(cont);
  cont.scrollLeft = cont.scrollWidth;
}

$("#paginas").addEventListener("click", async (ev) => {
  const id = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-quitar]")?.dataset.quitar;
  if (!id || !doc) return;
  doc.fotoIds = doc.fotoIds.filter((f) => f !== id);
  await borrarFoto(id);
  await guardarTrabajos(trabajos);
  renderPaginas();
});

$("#btn-nuevo").addEventListener("click", abrirDocumento);

$("#doc-disparar").addEventListener("click", async () => {
  try {
    const btn = $<HTMLButtonElement>("#doc-disparar");
    btn.disabled = true;
    await agregarPagina(await capturar(visor));
    btn.disabled = false;
  } catch (e) {
    $<HTMLButtonElement>("#doc-disparar").disabled = false;
    aviso(mensajeDeError(e));
  }
});

for (const sel of ["#in-pagina", "#in-pagina-galeria"]) {
  $<HTMLInputElement>(sel).addEventListener("change", async (ev) => {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    for (const f of files) {
      try {
        await agregarPagina(await prepararArchivo(f));
      } catch (e) {
        aviso(mensajeDeError(e), 4000);
      }
    }
  });
}

$("#doc-guardar").addEventListener("click", async () => {
  if (!doc || !doc.fotoIds.length) return;
  const n = doc.fotoIds.length;
  doc.estado = "pendiente";
  doc.nombre = `Documento de ${n} página(s)`;
  doc.creado = Math.max(Date.now(), (registros.at(-1)?.creado ?? 0) + 1);
  doc = null;
  await guardarTrabajos(trabajos);
  cerrarDocumento();
  autorizado = true;
  pausado = false;
  aviso(`✔ Documento guardado (${n} página(s)); la IA lo está leyendo…`, 3500);
  procesarCola();
});

async function cancelarDocumento() {
  if (doc && doc.fotoIds.length) {
    const ok = await confirmar(`¿Descartar las ${doc.fotoIds.length} página(s) tomadas?`, "Descartar", true);
    if (!ok) return;
  }
  if (doc) {
    const d = doc;
    trabajos = trabajos.filter((t) => t !== d);
    for (const f of d.fotoIds) await borrarFoto(f);
    await guardarTrabajos(trabajos);
  }
  doc = null;
  cerrarDocumento();
}
$("#doc-cancelar").addEventListener("click", cancelarDocumento);
// Botón "atrás" de Android / tecla Esc: preguntar en vez de perder las páginas
dlgDoc.addEventListener("cancel", (ev) => {
  ev.preventDefault();
  cancelarDocumento();
});

// ---------- Arrastrar y pegar (PC) ----------
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
  if (excel) importarArchivoExcel(excel);
  const resto = files.filter((f) => f !== excel);
  if (dlgDoc.open) resto.forEach(async (f) => agregarPagina(await prepararArchivo(f)));
  else agregarArchivos(resto);
});
window.addEventListener("paste", (e) => {
  const files = Array.from(e.clipboardData?.files ?? []);
  if (!files.length) return;
  e.preventDefault();
  if (dlgDoc.open) files.forEach(async (f) => agregarPagina(await prepararArchivo(f)));
  else agregarArchivos(files);
});

// ---------- Ajustes ----------
const dlgAj = $<HTMLDialogElement>("#dlg-ajustes");
$<HTMLSelectElement>("#aj-modelo").innerHTML = MODELOS.map((m) => `<option value="${m.id}">${m.nombre}</option>`).join("");
function abrirAjustes() {
  $("#aj-claude").hidden = !plataforma.enClaude;
  $("#aj-api").hidden = plataforma.enClaude;
  $<HTMLSelectElement>("#aj-precision").value = ajustes.precision;
  $<HTMLInputElement>("#aj-key").value = ajustes.apiKey;
  $<HTMLSelectElement>("#aj-modelo").value = ajustes.modelo;
  $<HTMLInputElement>("#aj-paralelo").value = String(ajustes.paralelo);
  dlgAj.showModal();
}
$("#btn-ajustes").addEventListener("click", abrirAjustes);
dlgAj.addEventListener("close", () => {
  if (dlgAj.returnValue !== "ok") return;
  dlgAj.returnValue = "";
  ajustes = {
    apiKey: $<HTMLInputElement>("#aj-key").value.trim(),
    modelo: $<HTMLSelectElement>("#aj-modelo").value,
    paralelo: Math.min(10, Math.max(1, Number($<HTMLInputElement>("#aj-paralelo").value) || 3)),
    precision: $<HTMLSelectElement>("#aj-precision").value === "complex" ? "complex" : "default",
  };
  guardarAjustes(ajustes);
  pintarModo();
  procesarCola();
});

function pintarModo() {
  const m = $("#modo");
  if (plataforma.enClaude) {
    if (!plataforma.sample) m.textContent = "⚠ Tu cuenta no permite que esta app use Claude. Puedes cargar y editar registros a mano.";
    else if (!plataforma.maxImagenes) m.textContent = "⚠ Esta vista de Claude no permite enviar fotos. Ábrela en el navegador o actualiza la app de Claude.";
    else m.textContent = "✔ La IA usa tu cuenta de Claude." + (plataforma.db ? " Los registros se guardan en claude.ai y se ven en todos tus dispositivos." : "");
  } else {
    m.textContent = ajustes.apiKey
      ? "✔ IA con tu clave de API. Los registros se guardan en este navegador."
      : "⚠ Falta la clave de API (⚙ Ajustes). Para usar tu suscripción de Claude abre la versión de claude.ai.";
  }
}

// ---------- Inicio ----------
(async () => {
  renderTabla();
  pedirPersistencia();
  trabajos = await cargarTrabajos().catch(() => []);
  trabajos.forEach((t) => { if (t.estado === "procesando") t.estado = "pendiente"; });
  renderCola();

  plataforma = await detectarPlataforma();
  if (plataforma.db) {
    const a = new AlmacenClaude(plataforma.db);
    a.onError = (msg) => aviso(msg, 6000);
    almacen = a;
  }
  try {
    btnCompartir.hidden =
      plataforma.enClaude ||
      !navigator.canShare?.({ files: [new File([""], "x.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })] });
  } catch { /* sin soporte */ }
  if (plataforma.enClaude) $<HTMLInputElement>("#in-archivos").accept = "image/*";

  registros = await almacen.iniciar(fusionarRemotos);
  ordenar();
  listo = true;
  pintarModo();
  renderTabla();
  if (!plataforma.enClaude) autorizado = true;
  if (!plataforma.enClaude && !ajustes.apiKey) abrirAjustes();
  // Documento con páginas a medio tomar (por ejemplo, si el celular cerró la página)
  const enCurso = trabajos.find((t) => t.estado === "espera");
  if (enCurso?.fotoIds.length) {
    aviso(`Tienes un documento sin terminar (${enCurso.fotoIds.length} página(s)).`, 4000);
    abrirDocumento();
  } else if (enCurso) {
    trabajos = trabajos.filter((t) => t !== enCurso);
  }
  procesarCola();
})();
