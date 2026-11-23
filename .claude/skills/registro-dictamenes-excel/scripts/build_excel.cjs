// Uso: node build_excel.cjs entrada.json salida.xlsx
// entrada.json: { "manual": [...], "registros": [...] } con campos carrera, dic, desc, revisar.
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const [, , entrada, salida] = process.argv;
if (!entrada || !salida) { console.error('uso: build_excel.cjs entrada.json salida.xlsx'); process.exit(1); }

const req = createRequire(path.join(process.cwd(), 'package.json'));
const ExcelJS = req('exceljs');

const datos = JSON.parse(fs.readFileSync(entrada, 'utf8'));
const filas = [...(datos.manual || []), ...(datos.registros || [])];

(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.getColumn(3).width = 32; ws.getColumn(4).width = 26; ws.getColumn(5).width = 46;
  const borde = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  const amarillo = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2A8' } };

  ['Carrera', 'N° Dictamen', 'Descripción'].forEach((t, i) => {
    const c = ws.getRow(3).getCell(3 + i);
    c.value = t; c.font = { bold: true }; c.border = borde;
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  let fila = 4;
  for (const r of filas) {
    const lineas = String(r.carrera || '').split('\n').filter(Boolean);
    const n = Math.max(1, lineas.length);
    for (let i = 0; i < n; i++) {
      const c = ws.getRow(fila + i).getCell(3);
      c.value = lineas[i] || null; c.border = borde;
      c.alignment = { vertical: 'middle', wrapText: true };
      if (r.revisar) c.fill = amarillo;
    }
    ws.getRow(fila).getCell(4).value = r.dic || null;
    ws.getRow(fila).getCell(5).value = r.desc || null;
    if (n > 1) {
      ws.mergeCells(fila, 4, fila + n - 1, 4);
      ws.mergeCells(fila, 5, fila + n - 1, 5);
    }
    for (let i = 0; i < n; i++) for (const col of [4, 5]) {
      const cell = ws.getRow(fila + i).getCell(col);
      cell.border = borde; cell.alignment = { vertical: 'middle', wrapText: true };
      if (r.revisar) cell.fill = amarillo;
    }
    fila += n;
  }

  await wb.xlsx.writeFile(salida);
  console.log(`${filas.length} registros, ${filas.filter(x => x.revisar).length} en amarillo -> ${salida}`);
})();
