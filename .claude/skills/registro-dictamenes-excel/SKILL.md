---
name: registro-dictamenes-excel
description: Crear el Excel de registro de dictámenes (Carrera | N° Dictamen | Descripción) a partir de los lotes .zip o fotos de documentos de la UATF, siguiendo las reglas acordadas. Usar cuando el usuario suba lotes (lote_*.zip) o fotos y pida el Excel, la planilla o el registro.
---

# Excel de registro de dictámenes

Genera `registro_*.xlsx` con el mismo diseño que exporta la app (`src/excel.ts`).
Las reglas de abajo son las que acordó el usuario; si una regla no aplica, pregunta antes de inventar.

## 1. Entrada

- Lotes `.zip` de la app: `lote.json` + `documento-NNN/pagina-N.jpg`. Cada documento tiene `id`, `nombre` y `creado` (ms UTC).
- Extraer cada lote en su propio directorio (no ejecutar nada desde dentro).
- Leer **todas las páginas** de cada documento antes de decidir sus datos.

## 2. Orden de las filas

1. **Primero**, las filas manuales que el usuario ya tenía (texto tal cual, sin corregir, en el orden dado).
2. **Después**, los documentos de los lotes ordenados por `creado`: fecha, hora, minuto y segundo (UTC). Si hay empate, conservar el orden del lote.
   - Los nombres de lote (p. ej. `1600`, `1611`) son hora local; el orden no cambia.

## 3. Una fila por documento distinto

- Una foto o documento con **varios dictámenes** se separa: una fila por dictamen (la app hace lo mismo).
- Una **resolución** que homologa dictámenes no es una fila por sí misma: la fila es el dictamen que homologa.
- Si un dictamen ya tiene fila en otro documento, no lo repitas.
- Antes de cerrar, revisar duplicados entre lotes y con las filas manuales. Si aparece uno, preguntar al usuario, no borrarlo.

## 4. Columna Carrera

- **Siempre** la carrera (p. ej. `CARRERA DE INGENIERÍA CIVIL`, `CARRERA DE INGENIERÍA AMBIENTAL`).
- **No** poner la facultad cuando hay carrera identificable.
- **No** poner líneas de DECANATURA ni de DECANATO nunca.
- Solo si estrictamente no hay carrera dirigida, usar la facultad (`FACULTAD DE …`).
- Si un documento trata de dos carreras, una línea por carrera (la app combina celdas en D y E).

## 5. Columna N° Dictamen (regla estricta)

1. Si el documento muestra un **número de dictamen**, va ese número, tal como aparece:
   `DICTAMEN N° 01/2024`, `DICTAMEN ADMINISTRATIVO N° 001/2024`, `DICTAMEN N° 006/2024`.
2. Si no hay dictamen, va el **número de carta** (CITE), p. ej. `UATF/DDI/CIV/CAR/042/2024`, `C - I.A. N° 035/2024`.
3. **Nunca** poner un número de **resolución** (`RESOLUCIÓN N° …`) en esta columna.
4. Si no hay ni dictamen ni CITE, **no se incluye la fila** (decisión del usuario en el caso de Minería, MIN 201).

## 6. Columna Descripción

- Una oración corta, mayúscula inicial, sin punto final, como los ejemplos de la planilla.
- Incluir: qué se habilita o solicita, curso/gestión (p. ej. "Curso de Verano 3/2023"), asignaturas o docente cuando son el objeto, y nombre del estudiante cuando el documento es de un estudiante.
- No inventar datos: si no se lee, no se pone.

## 7. Amarillo = revisar

Marcar la fila en amarillo (`FFFFF2A8`) cuando:
- un dato es ilegible o la foto está cortada (tabla incompleta),
- la gestión o el año no se lee o no coincide con el documento,
- el documento no es del curso de verano,
- la fecha del documento parece errónea.

Explicar el motivo en el chat, no en el Excel (el Excel no tiene columna de notas).

## 8. Formato del archivo

- Hoja `Hoja1`. Encabezados `Carrera`, `N° Dictamen`, `Descripción` en **C3:E3**, en negrita, centrados, con borde fino. Datos desde la fila 4.
- Anchos: C=32, D=26, E=46. Texto con ajuste de línea.
- Bordes finos en todas las celdas de datos. Celdas combinadas en D y E cuando la carrera tiene varias líneas.
- Generar con `scripts/build_excel.cjs` (usa `exceljs` del repositorio).
- Entregar con `SendUserFile` (`display: attach`) y dar la ruta completa.

## 9. Respuesta al usuario

- Lista corta de los amarillos y el motivo de cada uno.
- Lista de decisiones tomadas en esta corrida (por ejemplo, separar una resolución en dos dictámenes).
- Si hay posibles duplicados con las filas manuales, preguntar; no decidir solo.

## Ejecución

```bash
node /home/user/loadIng/.claude/skills/registro-dictamenes-excel/scripts/build_excel.cjs entrada.json salida.xlsx
```

`entrada.json`:

```json
{
  "manual": [ { "carrera": "Carrera de Derecho", "dic": "Dictamen Nro° 01/2024", "desc": "…", "revisar": false } ],
  "registros": [ { "carrera": "CARRERA DE INGENIERÍA CIVIL", "dic": "UATF/DDI/CIV/CAR/042/2024", "desc": "…", "revisar": false } ]
}
```

`carrera` puede tener varias líneas separadas por `\n`.
