# Registro de Dictámenes

> **Usar con tu suscripción de Claude (sin clave de API):** usa la versión publicada en claude.ai
> (https://claude.ai/artifact/Jwyj6PH8Y7kjpUU9HFrPU4)
> (`npm run build:artifact` genera `dist-artifact/registro-dictamenes.html`, que se publica como artifact).
> Dentro de claude.ai la IA usa tu cuenta de Claude y los registros se sincronizan entre celular y PC.
> Fuera de claude.ai (Vercel) la app necesita una clave de API de Anthropic, porque la suscripción
> solo puede usarse dentro de claude.ai.

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

## Uso (pensado para celular)

1. Abre la app en el celular y agrégala a la pantalla de inicio (menú del navegador → "Agregar a pantalla de inicio").
2. Solo en la versión fuera de claude.ai: en **⚙ Ajustes** pega tu clave de API de Anthropic.
3. **📷 Nuevo documento**: toma todas las páginas que quieras con la cámara y toca **✔ Guardar**:
   se guarda como UN documento (un registro). Las páginas quedan guardadas aunque se cierre la app.
   La cámara se abre directo. Dentro de la app de Claude la cámara no está permitida: abre el enlace en Chrome o Safari.
4. Revisa/corrige las tarjetas (las dudosas salen en amarillo) y **⬇ Descargar Excel** o **📤 Compartir Excel** (WhatsApp, correo…).

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
