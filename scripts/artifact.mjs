// Convierte dist-artifact/index.html en el formato de página de artifact de claude.ai:
// sin <html>/<head>/<body> (claude.ai los agrega), con <title> y <style> al inicio y el script al final.
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("dist-artifact/index.html", "utf8");
const head = html.slice(html.indexOf("<head>") + 6, html.indexOf("</head>"));
const body = html.slice(html.indexOf("<body>") + 6, html.lastIndexOf("</body>"));

const title = head.match(/<title>[\s\S]*?<\/title>/)[0];
const styles = head.match(/<style[\s\S]*?<\/style>/g) ?? [];
const scripts = [...(head.match(/<script[\s\S]*?<\/script>/g) ?? []), ...(body.match(/<script[\s\S]*?<\/script>/g) ?? [])];
const contenido = body.replace(/<script[\s\S]*?<\/script>/g, "").trim();

const out = [
  title,
  '<meta name="claude:viewport-fit-sides" content="cover">',
  ...styles,
  contenido,
  // El código de las librerías trae el carácter U+FFFD literal; se escribe como escape JS (mismo valor).
  ...scripts.map((sc) => sc.replaceAll("\uFFFD", "\\uFFFD")),
].join("\n");
writeFileSync("dist-artifact/registro-dictamenes.html", out);
console.log(`dist-artifact/registro-dictamenes.html (${(out.length / 1024).toFixed(0)} KB)`);
