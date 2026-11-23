// Build de una sola página HTML (todo en línea) para publicarla como artifact en claude.ai,
// donde la IA usa la suscripción de Claude del usuario.
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  publicDir: false,
  build: { outDir: "dist-artifact", chunkSizeWarningLimit: 5000 },
});
