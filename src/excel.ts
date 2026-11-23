// Importar / exportar el Excel con el mismo formato que registro_2025.xlsx:
// encabezados en C3:E3 (Carrera | N° Dictamen | Descripción); cuando la Carrera
// tiene varias líneas, cada línea va en su fila y N° Dictamen / Descripción se combinan.
import ExcelJS from "exceljs";
import type { Registro } from "./db";
import { uid } from "./db";

const COL_INI = 3; // C
const FILA_ENC = 3;

const borde: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

export async function exportarExcel(registros: Registro[]): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Hoja1");
  ws.getColumn(COL_INI).width = 32;
  ws.getColumn(COL_INI + 1).width = 24;
  ws.getColumn(COL_INI + 2).width = 44;

  const enc = ws.getRow(FILA_ENC);
  ["Carrera", "N° Dictamen", "Descripción"].forEach((t, i) => {
    const c = enc.getCell(COL_INI + i);
    c.value = t;
    c.font = { bold: true };
    c.border = borde;
    c.alignment = { vertical: "middle", horizontal: "center" };
  });

  let fila = FILA_ENC + 1;
  for (const r of registros) {
    const lineas = r.carrera.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lineas.length === 0) lineas.push("");
    lineas.forEach((l, i) => {
      const c = ws.getRow(fila + i).getCell(COL_INI);
      c.value = l;
      c.border = borde;
      c.alignment = { vertical: "middle", wrapText: true };
    });
    const d = ws.getRow(fila).getCell(COL_INI + 1);
    const e = ws.getRow(fila).getCell(COL_INI + 2);
    d.value = r.dictamen || null;
    e.value = r.descripcion || null;
    for (const c of [d, e]) {
      c.alignment = { vertical: "middle", wrapText: true };
    }
    if (lineas.length > 1) {
      ws.mergeCells(fila, COL_INI + 1, fila + lineas.length - 1, COL_INI + 1);
      ws.mergeCells(fila, COL_INI + 2, fila + lineas.length - 1, COL_INI + 2);
    }
    for (let i = 0; i < lineas.length; i++) {
      ws.getRow(fila + i).getCell(COL_INI + 1).border = borde;
      ws.getRow(fila + i).getCell(COL_INI + 2).border = borde;
    }
    fila += lineas.length;
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export async function importarExcel(archivo: File): Promise<Registro[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await archivo.arrayBuffer());
  const out: Registro[] = [];

  for (const ws of wb.worksheets) {
    // Buscar la fila de encabezados en cualquier posición
    let filaEnc = 0;
    let cCar = 0, cDic = 0, cDes = 0;
    ws.eachRow((row, n) => {
      if (filaEnc) return;
      row.eachCell((cell, col) => {
        const t = norm(cell.text ?? "");
        if (!cCar && t.startsWith("carrera")) cCar = col;
        else if (!cDic && t.includes("dictamen")) cDic = col;
        else if (!cDes && t.startsWith("descrip")) cDes = col;
      });
      if (cCar && (cDic || cDes)) filaEnc = n;
      else { cCar = 0; cDic = 0; cDes = 0; }
    });
    if (!filaEnc) continue;

    let ultimo: Registro | null = null;
    for (let n = filaEnc + 1; n <= ws.rowCount; n++) {
      const row = ws.getRow(n);
      const texto = (col: number) => (col ? (row.getCell(col).text ?? "").toString().trim() : "");
      const car = texto(cCar);
      const celdaRef = row.getCell(cDic || cDes);
      const continuacion =
        ultimo !== null && celdaRef.isMerged && celdaRef.master.address !== celdaRef.address;

      if (continuacion && ultimo) {
        if (car) ultimo.carrera = ultimo.carrera ? ultimo.carrera + "\n" + car : car;
        continue;
      }
      const dic = texto(cDic);
      const des = texto(cDes);
      if (!car && !dic && !des) {
        ultimo = null;
        continue;
      }
      ultimo = {
        id: uid(),
        carrera: car,
        dictamen: dic,
        descripcion: des,
        fotoIds: [],
        fuente: archivo.name,
        revisar: false,
        nota: "",
        creado: Date.now() + out.length,
      };
      out.push(ultimo);
    }
  }
  if (out.length === 0) {
    throw new Error('No se encontró una tabla con encabezados "Carrera", "N° Dictamen" y "Descripción".');
  }
  return out;
}
