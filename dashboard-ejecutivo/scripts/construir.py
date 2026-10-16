"""Arma el Dashboard Ejecutivo en UN solo archivo HTML (se abre con doble clic, sin servidor).

Uso: python3 -I construir.py <fuentes.json> <config.json> <fuente.woff2> <salida.html>

Incrusta: tipografía DM Sans (woff2 en base64), datos de origen y la aplicación.
"""
import base64
import json
import sys
from pathlib import Path

fuentes_p, config_p, font_p, salida_p = sys.argv[1:5]
raiz = Path(__file__).resolve().parent.parent
html = (raiz / 'src' / 'dashboard.html').read_text(encoding='utf-8')
app = (raiz / 'src' / 'app.js').read_text(encoding='utf-8')
fuentes = json.loads(Path(fuentes_p).read_text(encoding='utf-8'))
config = json.loads(Path(config_p).read_text(encoding='utf-8'))
font = base64.b64encode(Path(font_p).read_bytes()).decode('ascii')

# Controles previos: el archivo no se arma si el presupuesto no cuadra.
p = config['presupuesto']
suma = sum(x['autorizado'] for x in config['partidas'])
assert len(config['partidas']) == 20, 'Deben ser 20 partidas'
assert suma == p['distribuido'], f'Las partidas suman {suma}, no {p["distribuido"]}'
assert suma + p['reserva'] == p['total'], 'Partidas + reserva no da el total'
ampl = sum(m['monto'] for m in config['movimientos'] if m['tipo'] == 'Ampliación')
transf = sum(m['monto'] for m in config['movimientos'] if m['tipo'] == 'Transferencia')
assert ampl == p['ampliacion'] and p['original'] + ampl == p['total'] and transf == 0, 'Movimientos no cuadran'
c = fuentes['contable']
assert abs(sum(x['total'] for x in c['categorias']) - c['total']) < 0.01, 'Contable no cuadra'

def js(obj):
    return json.dumps(obj, ensure_ascii=False).replace('</', '<\\/')

font_css = ("@font-face { font-family: 'DM Sans Variable'; font-style: normal; font-display: swap; font-weight: 100 1000; "
            f"src: url(data:font/woff2;base64,{font}) format('woff2'); }}")
datos = f'const FUENTES = {js(fuentes)};\nconst CONFIG = {js(config)};'
out = html.replace('/*__FONT__*/', font_css).replace('/*__DATOS__*/', datos).replace('/*__APP__*/', app.replace('</script', '<\\/script'))
for marca in ('/*__FONT__*/', '/*__DATOS__*/', '/*__APP__*/'):
    assert marca not in out
Path(salida_p).write_text(out, encoding='utf-8')
print(f'{salida_p}: {len(out.encode("utf-8")) // 1024} KB · partidas {suma:,} + reserva {p["reserva"]:,} = {suma + p["reserva"]:,} · contable {c["total"]:,.2f}')
