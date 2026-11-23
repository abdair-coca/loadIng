# Registro de Dictámenes

Saca fotos (o sube PDFs) de documentos y una IA (Claude) llena automáticamente la planilla
**Carrera | N° Dictamen | Descripción**, con el mismo formato que `registro_2025.xlsx`.

- **Sin backend**: todo corre en el navegador. La IA se llama directo a la API de Anthropic con tu propia clave.
- **Los datos persisten** en el navegador (IndexedDB): registros, fotos y la cola pendiente sobreviven a recargas y cierres.
  Exporta el Excel de vez en cuando como respaldo (los datos son de ese navegador/dispositivo).
- **Muchas fotos de un tiro**: selecciona, arrastra o pega decenas de fotos; se procesan en paralelo (configurable).
  Marca "páginas de un mismo documento" si varias fotos son del mismo dictamen.
- **Importar Excel**: lee cualquier .xlsx con encabezados "Carrera", "N° Dictamen", "Descripción" (respeta celdas combinadas).
- **Exportar Excel**: genera el .xlsx con el mismo diseño (encabezados en C3, celdas combinadas cuando la Carrera tiene varias líneas).
- Cada registro guarda su foto para verificar; los dudosos se marcan en amarillo con una nota.

## Uso

1. Abre la app y en **⚙ Ajustes** pega tu clave de API de Anthropic (console.anthropic.com → API Keys).
2. **📷 Tomar foto** (celular) o **🖼 Subir fotos / PDF** (varias a la vez).
3. Revisa/corrige en la tabla y **⬇ Exportar Excel**.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # genera dist/
```

## Despliegue en Vercel

Importa el repositorio en vercel.com → New Project (detecta Vite; `vercel.json` ya está configurado), o:

```bash
npx vercel --prod
```
