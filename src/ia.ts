// Interpretación de las fotos con Claude, llamado directamente desde el navegador
// con la clave de API del propio usuario (no hay backend).
import Anthropic from "@anthropic-ai/sdk";
import { aBase64 } from "./imagen";

export interface RegistroIA {
  carrera: string[];
  n_dictamen: string;
  descripcion: string;
  revisar: boolean;
  nota: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    registros: {
      type: "array",
      items: {
        type: "object",
        properties: {
          carrera: {
            type: "array",
            items: { type: "string" },
            description:
              "Líneas de la celda Carrera: unidad que emite/remite el documento, en MAYÚSCULAS. Una línea por dependencia (ej. FACULTAD + DECANATO).",
          },
          n_dictamen: {
            type: "string",
            description: "Número o código del documento tal como aparece (ej. 'DICTAMEN N° 34/2025', 'CAR/060'). Vacío si no hay.",
          },
          descripcion: {
            type: "string",
            description: "Resumen breve del asunto/referencia, una sola oración, estilo de los ejemplos.",
          },
          revisar: {
            type: "boolean",
            description: "true si algún dato es dudoso, ilegible o tuvo que deducirse.",
          },
          nota: {
            type: "string",
            description: "Si revisar es true, qué revisar (breve). Si no, vacío.",
          },
        },
        required: ["carrera", "n_dictamen", "descripcion", "revisar", "nota"],
        additionalProperties: false,
      },
    },
  },
  required: ["registros"],
  additionalProperties: false,
} as const;

const EJEMPLOS = `Carrera | N° Dictamen | Descripción
FACULTAD DE CIENCIAS AGRÍCOLAS Y PECUARIAS / DECANATO | CAR/060 | Responsable Académico de Programa de Ciencias de la Comunicación
FACULTAD DE CIENCIAS AGRÍCOLAS Y PECUARIAS / DECANATURA | FAC.CC.AA.PP. 444/25 | Designación de Director Ad Ínterin de la carrera de Ingeniería de Desarrollo Rural
FACULTAD DE CIENCIAS ECONÓMICAS FINANCIERAS Y ADMINISTRATIVAS / DECANATURA | CAR 395 | Designación de Ad Ínterin de la carrera de Contabilidad y Finanzas
FACULTAD DE CIENCIAS PURAS / CARRERA DE QUÍMICA | CAR/444 | Solicitud de Apertura de sistema para regularizar registro de postulantes de la carrera. Mención: Litio y Recursos Evaporíticos (Sede-Uyuni)
CARRERA DE ARQUITECTURA | CAR/51 | Habilitación de sistema para programación de materias para curso de verano
FACULTAD DE ARTES / DECANATURA / CARRERA DE ARQUITECTURA | CAR/173 | Designación de Responsable Académico
FACULTAD DE INGENIERIA TECNOLOGICA | CAR N°138 | Emisión y publicación de la segunda convocatoria en las materias que señala el Dictamen
CARRERA DE AUDITORIA-CONTADURIA SEDE-TUPIZA | CAR/015 | Ampliación de fecha para cursos de verano
CARRERA DE ADMINISTRACION DE EMPRESAS |  | Solicitud de aprobación de cursos de verano
CARRERA DE CONSTRUCCIONES CIVILES | DICTAMEN N° 34/2025 | Convalidación a favor del estudiante: Maria Ines Condori Quispe
CARRERA DE CONSTRUCCIONES CIVILES | DICTAMEN N° 45/2025 | Apertura del sistema para Beca Auxiliatura para el semestre 2/2025
CARRERA DE INGENIERÍA EN GEODESIA Y TOPOGRAFIA | DITAMEN ADMINISTRATIVO N° 02/2025 | Readmisión por cambio de carrera del Sr. Ángel Rodrigo Fuertes Sanjines
CARRERA DE INGENIERÍA CIVIL | DES/Nro. 224 | Designación de Director Ad Ínterin
CARRERA DE INGENIERÍA CIVIL | DICTAMEN N° 039/2025 | Reasignación de asignatura y carga horaria del Ing. Gerardo Rios Buezo
CARRERA DE INGENIERÍA CIVIL | DICTAMEN N° 043/2025 | Planilla de notas 1/2025 de la asignatura CIV 400 GRUPO 1, 4, 6
CARRERA DE INGENIERÍA CIVIL | DICTAMEN N° 078/2025 | Ampliación de Transición para la gestión académica 2026`;

const SISTEMA = `Eres un asistente que registra documentos universitarios (dictámenes, cartas, resoluciones, notas) en una planilla Excel con tres columnas: Carrera, N° Dictamen y Descripción.

Recibirás una o varias fotos (o PDF). Para cada documento distinto que veas, devuelve un registro:

- carrera: la unidad que EMITE o REMITE el documento (membrete, sello o firma: Facultad, Decanato/Decanatura, Carrera, Sede). Escríbela en MAYÚSCULAS, completa, como aparece en el documento. Si el documento muestra a la vez la Facultad y una dependencia (Decanato, Decanatura o una Carrera), pon cada una como una línea separada, en ese orden (Facultad primero). Si sólo es una carrera, una sola línea "CARRERA DE ...".
- n_dictamen: el número/código del documento copiado tal cual (ej. "DICTAMEN N° 063/2025", "CAR/060", "FAC.CC.AA.PP. 444/25", "DES/Nro. 224"). Si no tiene número, cadena vacía.
- descripcion: el asunto/referencia resumido en una sola oración corta, con mayúscula inicial y sin punto final, como en los ejemplos. Incluye nombres propios de estudiantes/docentes, semestre/gestión (ej. 2/2025), asignaturas y grupos cuando sean el objeto del documento. Corrige tildes evidentes, pero no inventes datos.
- revisar / nota: marca revisar=true y explica brevemente en nota si algún dato es ilegible, dudoso o no estaba y lo dedujiste.

Reglas:
- Si varias fotos son páginas del MISMO documento, devuelve un solo registro.
- Si una foto contiene varios documentos distintos, devuelve un registro por cada uno.
- Si una foto no es un documento o es totalmente ilegible, devuelve un registro con lo que se pueda, revisar=true y la explicación en nota.

Ejemplos reales de la planilla (las "/" separan líneas de la celda Carrera):
${EJEMPLOS}`;

export const MODELOS = [
  { id: "claude-opus-5-5", nombre: "Claude Opus 5.5 (más preciso)" },
  { id: "claude-sonnet-5-5", nombre: "Claude Sonnet 5.5 (más barato)" },
  { id: "claude-haiku-5-5", nombre: "Claude Haiku 5.5 (el más barato)" },
];

export async function interpretar(
  apiKey: string,
  modelo: string,
  archivos: { blob: Blob; nombre: string }[],
  unSoloDocumento: boolean,
): Promise<RegistroIA[]> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 4 });

  const contenido: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const a of archivos) {
    const data = await aBase64(a.blob);
    if (a.blob.type === "application/pdf") {
      contenido.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
    } else {
      contenido.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
    }
  }
  contenido.push({
    type: "text",
    text:
      archivos.length > 1 && unSoloDocumento
        ? `Estas ${archivos.length} imágenes son páginas de un mismo documento. Devuelve un solo registro.`
        : "Extrae los registros de este documento.",
  });

  const base = {
    model: modelo,
    max_tokens: 16000,
    output_config: { effort: "medium" as const, format: { type: "json_schema" as const, schema: SCHEMA } },
    system: [{ type: "text" as const, text: SISTEMA, cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content: contenido }],
  };
  let resp: Anthropic.Beta.BetaMessage;
  try {
    resp = await client.beta.messages.create({
      ...base,
      // Si el modelo rechazara la petición por un falso positivo de seguridad, la API la reintenta con otro modelo.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (e) {
    // Si la cuenta/modelo no admite el reintento automático, se pide de nuevo sin él.
    if (!(e instanceof Anthropic.BadRequestError)) throw e;
    resp = await client.beta.messages.create(base);
  }

  if (resp.stop_reason === "refusal") {
    throw new Error("La IA rechazó procesar este documento" + (resp.stop_details?.explanation ? `: ${resp.stop_details.explanation}` : ""));
  }
  if (resp.stop_reason === "max_tokens") {
    throw new Error("La respuesta de la IA quedó cortada (demasiados documentos en una sola carga).");
  }
  const texto = resp.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let datos: { registros?: RegistroIA[] };
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error("La IA devolvió una respuesta que no se pudo leer. Reintenta.");
  }
  if (!Array.isArray(datos.registros)) throw new Error("Respuesta de la IA sin registros.");
  return datos.registros.map((r) => ({
    carrera: Array.isArray(r.carrera) ? r.carrera.map(String) : [String(r.carrera ?? "")],
    n_dictamen: String(r.n_dictamen ?? ""),
    descripcion: String(r.descripcion ?? ""),
    revisar: Boolean(r.revisar),
    nota: String(r.nota ?? ""),
  }));
}

export function mensajeDeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Clave de API inválida. Revisa ⚙ Ajustes.";
  if (e instanceof Anthropic.PermissionDeniedError) return "La clave no tiene permiso para este modelo.";
  if (e instanceof Anthropic.RateLimitError) return "Límite de uso alcanzado; espera un momento y reintenta.";
  if (e instanceof Anthropic.BadRequestError) return "Petición rechazada: " + e.message;
  if (e instanceof Anthropic.APIConnectionError) return "Sin conexión con la IA. Revisa tu internet.";
  if (e instanceof Anthropic.APIError) return `Error de la IA (${e.status}): ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
