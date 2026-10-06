// Pruebas: simula lo que HubSpot entrega al navegador a partir de la plantilla
// (quita la anotación, las etiquetas {% raw %} y los includes estándar) y
// escribe la configuración de la pila local de Supabase.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [url, key, outDir = 'dist-hubspot-test'] = process.argv.slice(2);
let html = readFileSync('dist-hubspot/alignment-unblock-hubspot.html', 'utf8');
html = html
  .replace(/^<!--[\s\S]*?-->\s*/, '')
  .replace(/\{%-?\s*(end)?raw\s*-?%\}/g, '')
  .replace(/\{\{\s*standard_(header|footer)_includes\s*\}\}/g, '')
  .replace('supabaseUrl: ""', `supabaseUrl: "${url}"`)
  .replace('supabaseAnonKey: ""', `supabaseAnonKey: "${key}"`);
if (/\{\{|\{%/.test(html)) throw new Error('Quedó HubL sin procesar en la plantilla.');
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/index.html`, html);
