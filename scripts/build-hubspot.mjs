// Convierte el build de un solo archivo (dist-hubspot/index.html) en una plantilla de
// página de HubSpot (Design Manager → plantilla de código):
//  · anotación templateType para que se pueda usar al crear páginas,
//  · {{ standard_header_includes }} / {{ standard_footer_includes }} (obligatorios en HubSpot),
//  · bloque AU_CONFIG editable (conexión a Supabase) al inicio,
//  · todo el código de la app dentro de {% raw %} para que HubL no lo interprete.
import { readFileSync, writeFileSync } from 'node:fs';

const src = 'dist-hubspot/index.html';
const out = 'dist-hubspot/alignment-unblock-hubspot.html';
const html = readFileSync(src, 'utf8');
if (/\{%-?\s*endraw/.test(html)) throw new Error('El build contiene "endraw": no se puede proteger con {% raw %}.');

const head = /<head>([\s\S]*)<\/head>/.exec(html)?.[1]?.replace(/<meta charset="[^"]*"\s*\/?>/i, '');
const body = /<body>([\s\S]*)<\/body>/.exec(html)?.[1];
if (!head || !body) throw new Error('No se encontró <head> o <body> en el build.');

const config = `<script>
  /* ═══ CONFIGURACIÓN · lo único que se edita ═══
     Supabase → Project Settings → API
       supabaseUrl     = Project URL       (https://xxxx.supabase.co)
       supabaseAnonKey = anon public key   (pública por diseño; la seguridad la aplica el servidor)
     microsoft: true sólo si se configuró «Entrar con cuenta Microsoft» en Supabase.
     emailCode: true cuando el correo (SMTP) esté configurado; mientras tanto se entra con contraseña. */
  window.AU_CONFIG = {
    supabaseUrl: "",
    supabaseAnonKey: "",
    microsoft: false,
    emailCode: false
  };
</script>`;

const template = `<!--
  templateType: page
  isAvailableForNewContent: true
  label: Alignment & Unblock
-->
<!doctype html>
<html lang="es-MX">
<head>
<meta charset="UTF-8" />
<meta name="robots" content="noindex, nofollow" />
${config}
{{ standard_header_includes }}
{% raw %}
${head.trim()}
{% endraw %}
</head>
<body>
{% raw %}
${body.trim()}
{% endraw %}
{{ standard_footer_includes }}
</body>
</html>
`;
writeFileSync(out, template);
console.log(`Plantilla de HubSpot: ${out} (${(Buffer.byteLength(template) / 1024).toFixed(0)} KB)`);
