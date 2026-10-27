"""Convierte los documentos de soporte (Markdown sencillo) en un HTML listo para LibreOffice → .docx.

Uso: python3 -I md_a_html.py <salida.html> <titulo> <doc1.md> [doc2.md …]
Soporta: encabezados, párrafos, listas, tablas, negritas, cursivas, código y citas.
"""
import html
import re
import sys

salida, titulo, *docs = sys.argv[1:]


def inline(t):
    t = html.escape(t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<i>\1</i>', t)
    t = re.sub(r'`(.+?)`', r'<code>\1</code>', t)
    return t


def convertir(md):
    out, lineas, i = [], md.splitlines(), 0
    while i < len(lineas):
        l = lineas[i]
        if not l.strip():
            i += 1
            continue
        m = re.match(r'^(#{1,4})\s+(.*)', l)
        if m:
            n = len(m.group(1))
            out.append(f'<h{n}>{inline(m.group(2))}</h{n}>')
            i += 1
            continue
        if l.startswith('|'):
            filas = []
            while i < len(lineas) and lineas[i].startswith('|'):
                celdas = [c.strip() for c in lineas[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-{3,}:?', c) for c in celdas):
                    filas.append(celdas)
                i += 1
            t = '<table>'
            for k, f in enumerate(filas):
                tag = 'th' if k == 0 else 'td'
                t += '<tr>' + ''.join(f'<{tag}>{inline(c)}</{tag}>' for c in f) + '</tr>'
            out.append(t + '</table>')
            continue
        if re.match(r'^(\s*)([-*]|\d+\.)\s+', l):
            # Listas con anidación por sangría (2+ espacios por nivel).
            items = []
            while i < len(lineas) and re.match(r'^(\s*)([-*]|\d+\.)\s+', lineas[i]):
                m = re.match(r'^(\s*)([-*]|\d+\.)\s+(.*)', lineas[i])
                items.append((len(m.group(1)) // 2, m.group(2)[0].isdigit(), m.group(3)))
                i += 1
            html_l, pila = '', []
            for nivel, ordenada, texto in items:
                tag = 'ol' if ordenada else 'ul'
                while pila and pila[-1][0] > nivel:
                    html_l += f'</li></{pila.pop()[1]}>'
                if pila and pila[-1][0] == nivel:
                    html_l += '</li>'
                else:
                    html_l += f'<{tag}>'
                    pila.append((nivel, tag))
                html_l += f'<li>{inline(texto)}'
            while pila:
                html_l += f'</li></{pila.pop()[1]}>'
            out.append(html_l)
            continue
        if l.startswith('>'):
            out.append(f'<blockquote>{inline(l.lstrip("> "))}</blockquote>')
            i += 1
            continue
        par = []
        while i < len(lineas) and lineas[i].strip() and not re.match(r'^(#|\||>|\s*([-*]|\d+\.)\s)', lineas[i]):
            par.append(lineas[i])
            i += 1
        out.append(f'<p>{inline(" ".join(par))}</p>')
    return '\n'.join(out)


cuerpo = '\n<br style="page-break-before:always">\n'.join(convertir(open(d, encoding='utf-8').read()) for d in docs)
estilo = """body{font-family:'DM Sans',Arial,sans-serif;font-size:10pt;color:#13261f}
h1{color:#006d4e;font-size:17pt}h2{color:#006d4e;font-size:13pt;margin-top:14pt}h3{font-size:11pt}
table{border-collapse:collapse;width:100%;margin:6pt 0}th,td{border:1px solid #c9d6d0;padding:3pt 5pt;vertical-align:top;font-size:8.5pt}
th{background:#eef6f2;color:#00402e}code{font-family:Consolas,monospace;font-size:8.5pt}blockquote{color:#7a5600;background:#fff4d4;padding:4pt 8pt}"""
open(salida, 'w', encoding='utf-8').write(f'<!doctype html><html lang="es"><head><meta charset="utf-8"><title>{html.escape(titulo)}</title><style>{estilo}</style></head><body>{cuerpo}</body></html>')
print(salida)
