"""Genera el paquete de datos validados para el módulo «Inversión, KPIs y Resultados».

Uso: python3 -I paquete_inversion.py <config-2026.json> <fuentes.json> <referencia.json> <salida.json>

- config-2026.json  · presupuesto autorizado, movimientos, reclasificaciones y KPI sin archivo (datos/)
- fuentes.json      · cifras extraídas de los Excel (salida/, ver extraer_datos.py)
- referencia.json   · presupuesto por partida tal como lo comunicó Dirección (para conciliar)

Reglas: no inventa cifras; cada registro lleva fuente, corte y estado de validación;
las diferencias contra la referencia se reportan en `discrepancias` (nunca se corrigen
en silencio). El paquete sólo AGREGA registros al importarse (ids deterministas).
"""
import json
import re
import sys
import unicodedata
from datetime import date, datetime

cfg_path, fuentes_path, ref_path, out_path = sys.argv[1:]
cfg = json.load(open(cfg_path, encoding='utf-8'))
src = json.load(open(fuentes_path, encoding='utf-8'))
ref = json.load(open(ref_path, encoding='utf-8'))
STAMP = '2026-10-27T00:00:00.000Z'


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    return re.sub(r'[^a-z0-9]+', ' ', ''.join(c for c in s if unicodedata.category(c) != 'Mn')).strip()


def slug(s):
    return norm(s).replace(' ', '-')


def base(id_, **kw):
    return {'id': id_, 'createdAt': STAMP, 'updatedAt': STAMP, **kw}


def month_period(ym, fin=None):
    y, m = map(int, ym.split('-'))
    last = (date(y + (m == 12), m % 12 + 1, 1) - date.resolution).day
    return {'inicio': f'{ym}-01', 'fin': fin or f'{ym}-{last:02d}'}


MESES = {'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12}
MES_TXT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
MES_CORTO = {'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'ago': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dic': 12}
AREA = {'MD': 'area:Marketing Digital', 'CON': 'area:Contenido', 'DIS': 'area:Diseño', 'STORE': 'area:SOC Store'}

data = {k: [] for k in ['objectives', 'kpis', 'kpiTargets', 'results', 'budgetLines', 'budgetMovements', 'spend', 'budgetCommitments', 'budgetAllocations', 'projectKpis', 'projectAreas', 'revenues', 'efficiencyScopes']}
discrepancias = []

# ─── Presupuesto ───────────────────────────────────────────────────────────
P = cfg['presupuesto']
F_PPTO = 'Presupuesto autorizado 2026 · Dirección de Posicionamiento'
movs = cfg['movimientos']
line_id = lambda clave: f'ptda-{clave.lower()}'
for i, p in enumerate(cfg['partidas']):
    neto = sum(m['monto'] for m in movs if m['partida'] == p['id'])
    data['budgetLines'].append(base(line_id(p['id']), clave=p['id'], nombre=p['nombre'], original=p['autorizado'] - neto,
        categoriasContables=p['categorias'], revolvente=bool(p.get('revolvente')), orden=i + 1,
        fuente=F_PPTO, corte='Vigente 2026', estado='CONFIRMADO',
        nota='Documento de autorización no adjunto: anexarlo para cerrar la conciliación.'))
data['budgetLines'].append(base(line_id('RES'), clave='RES', nombre='Reserva no asignada', original=0, categoriasContables=[], reserva=True,
    orden=len(cfg['partidas']) + 1, fuente=F_PPTO, corte='Vigente 2026', estado='CONFIRMADO', nota='Destino pendiente de definir por Dirección.'))

def lid(partida):
    return line_id('RES' if partida == 'RESERVA' else partida)

for m in [m for m in movs if m['tipo'] == 'Ampliación']:
    data['budgetMovements'].append(base(f'mov-{m["id"].lower()}', folio=m['id'], tipo='ampliacion', aLineaId=lid(m['partida']), monto=m['monto'],
        concepto=m['concepto'], fuente=F_PPTO, estado=m['estado'], nota='Fecha del movimiento no informada.'))
# Transferencias: el config las trae como pares (−origen / +destino); aquí son UN registro.
trans = [m for m in movs if m['tipo'] == 'Transferencia']
neg = [m for m in trans if m['monto'] < 0]
pos = [m for m in trans if m['monto'] > 0]
assert len(neg) == len(pos), 'Transferencias sin par'
for a, b in zip(neg, pos):
    assert a['concepto'] == b['concepto'] and -a['monto'] == b['monto'], f'Par de transferencia inconsistente: {a} {b}'
    data['budgetMovements'].append(base(f'mov-{a["id"].lower()}-{b["id"].lower()}', folio=f'{a["id"]}/{b["id"]}', tipo='transferencia', deLineaId=lid(a['partida']),
        aLineaId=lid(b['partida']), monto=b['monto'], concepto=b['concepto'], fuente=F_PPTO, estado=a['estado'], nota='Fecha del movimiento no informada.'))
for r in cfg['reclasificaciones']:
    mv = base(f'mov-{r["id"].lower()}', folio=r['id'], tipo='reclasificacion', aLineaId=lid(r['a']), concepto=r['concepto'],
        fuente='Análisis directivo del gasto contable', estado=r['estado'], nota=r.get('validacionContable'))
    if r['deTipo'] == 'partida':
        mv['deLineaId'] = lid(r['de'])
    else:
        mv['deCategoria'] = r['de']
    if r.get('monto') is not None:
        mv['monto'] = r['monto']
    data['budgetMovements'].append(mv)

# Vigente calculado vs referencia de Dirección
vig = {l['clave']: l['original'] for l in data['budgetLines']}
for m in data['budgetMovements']:
    if m['estado'] != 'CONFIRMADO' or m['tipo'] == 'reclasificacion':
        continue
    by_id = {l['id']: l['clave'] for l in data['budgetLines']}
    if m['tipo'] in ('ampliacion', 'transferencia'):
        vig[by_id[m['aLineaId']]] += m['monto']
    if m['tipo'] in ('reduccion', 'transferencia'):
        vig[by_id[m['deLineaId']]] -= m['monto']
lines_by_norm = {norm(l['nombre']): l for l in data['budgetLines']}
alias = {norm(k): norm(v) for k, v in ref.get('alias', {}).items()}  # nombre distinto: se reporta
equivalentes = {norm(k): norm(v) for k, v in ref.get('equivalentes', {}).items()}  # sólo puntuación / conectores
ref_total = 0
for r in ref['partidas']:
    ref_total += r['monto']
    key = equivalentes.get(norm(r['nombre'])) or alias.get(norm(r['nombre']), norm(r['nombre']))
    l = lines_by_norm.get(key)
    if not l:
        discrepancias.append({'tema': f'Partida «{r["nombre"]}»', 'referencia': f'${r["monto"]:,.2f}', 'validado': 'No existe en el presupuesto validado',
            'tratamiento': 'No se agregó. Confirmar si es otra partida.'})
        continue
    if abs(vig[l['clave']] - r['monto']) > 0.004:
        discrepancias.append({'tema': f'Monto de «{l["nombre"]}»', 'referencia': f'${r["monto"]:,.2f}', 'validado': f'${vig[l["clave"]]:,.2f}',
            'tratamiento': 'Se conserva la cifra validada; resolver con Dirección.'})
        l['discrepancia'] = f'Referencia ${r["monto"]:,.2f} vs validado ${vig[l["clave"]]:,.2f}.'
    if norm(r['nombre']) in alias:
        msg = f'La referencia la nombra «{r["nombre"]}» y el presupuesto validado «{l["nombre"]}» (mismo monto). Confirmar que es la misma partida.'
        discrepancias.append({'tema': f'Nombre de partida «{r["nombre"]}»', 'referencia': r['nombre'], 'validado': l['nombre'], 'tratamiento': 'Se usa el nombre validado hasta que Dirección confirme.'})
        l['discrepancia'] = msg
if abs(ref_total - P['total']) > 0.004:
    discrepancias.append({'tema': 'Presupuesto total', 'referencia': f'${ref_total:,.2f}', 'validado': f'${P["total"]:,.2f}', 'tratamiento': 'Resolver con Dirección.'})
assert abs(sum(vig.values()) - P['total']) < 0.005, 'El vigente no cuadra con el total autorizado'

# ─── Gasto contable (hoja RESUMEN; verificado contra GASTOS) ─────────────────
c = src['contable']
F_CONT = f'{c["fuente"]} · hoja {c["hoja"]}'
for cat in c['categorias']:
    for ym, v in zip(c['meses'], cat['mensual']):
        if v:
            data['spend'].append(base(f'gto-{slug(cat["nombre"])}-{ym}', categoria=cat['nombre'], mes=ym, monto=round(v, 2), fuente=F_CONT, corte=c['corte'], estado='CONFIRMADO'))
gasto = round(sum(s['monto'] for s in data['spend']), 2)
assert abs(gasto - c['total']) < 0.005 and abs(c['total'] - c['detalle']['total']) < 0.005, 'El gasto no cuadra con el reporte contable'
if abs(gasto - ref['gastoContable']) > 0.004:
    discrepancias.append({'tema': 'Gasto contable ene–ago', 'referencia': f'${ref["gastoContable"]:,.2f}', 'validado': f'${gasto:,.2f}', 'tratamiento': 'Se usa el reporte contable.'})

# ─── Objetivos y KPIs ───────────────────────────────────────────────────────
OBJ = [('OE-A', 'Posicionamiento de marca', 'A'), ('OE-B', 'Atracción y generación de demanda', 'B'), ('OE-C', 'Atracción de franquicias', 'C'),
       ('OE-D', 'Desarrollo y retención de la red', 'D'), ('OE-E', 'Contenido y comunicación', 'E'), ('OE-F', 'Eficiencia operativa', 'F')]
for i, (clave, nombre, g) in enumerate(OBJ):
    data['objectives'].append(base(f'obj-{clave.lower()}', clave=clave, nombre=nombre, orden=i + 1, estado='PROPUESTA',
        descripcion=f'Agrupa los KPIs del grupo {g} definidos por Dirección. Sujeto a aprobación.'))

def kpi(clave, nombre, definicion, grupo, tipo, areas, unidad, fuente, sentido='mayor', agregacion='suma', estado='PROPUESTA'):
    k = base(f'kpi-{clave.lower()}', clave=clave, nombre=nombre, definicion=definicion, grupo=grupo, tipo=tipo, objetivoId=f'obj-oe-{grupo.lower()}',
             areaIds=[AREA[a] for a in areas], unidad=unidad, sentido=sentido, agregacion=agregacion, fuente=fuente, estado=estado, activo=True)
    data['kpis'].append(k)
    return k['id']

def result(kid, metrica, valor, unidad, periodo, fuente, estado, corte=None, nota=None, sufijo=''):
    r = base(f'res-{kid[4:]}-{periodo["inicio"]}-{periodo["fin"]}{sufijo}', kpiId=kid, metrica=metrica, valor=valor, unidad=unidad, periodo=periodo,
             fuente=fuente, estado=estado)
    if corte: r['corte'] = corte
    if nota: r['nota'] = nota
    data['results'].append(r)

# C · Franquicias (archivo trimestral con desglose mensual)
fr = src['franquicias']
F_FR = fr['fuente']
ks = {
    'leads': kpi('C-LEADS', 'Leads de franquicias', 'Prospectos de franquicia generados en el periodo.', 'C', 'actividad', ['MD'], 'leads', F_FR, estado='CONFIRMADO'),
    'mql': kpi('C-MQL', 'MQL de franquicias', 'Leads calificados por Marketing.', 'C', 'desempeno', ['MD'], 'MQL', F_FR, estado='CONFIRMADO'),
    'sql': kpi('C-SQL', 'SQL de franquicias', 'Leads aceptados por el área comercial de franquicias.', 'C', 'desempeno', ['MD'], 'SQL', F_FR, estado='CONFIRMADO'),
    'cierres': kpi('C-CIERRES', 'Cierres de franquicia', 'Franquicias firmadas en el periodo.', 'C', 'desempeno', ['MD'], 'cierres', F_FR, estado='CONFIRMADO'),
}
for row in fr['mensual']:
    m = MESES[row['mes'].lower()]
    per = month_period(f'2026-{m:02d}')
    nota = ref.get('notas', {}).get('franquiciasT3') if m >= 7 else None
    for k, kid in ks.items():
        result(kid, f'{k.upper()} {row["mes"]} 2026', row[k], data['kpis'][[x['id'] for x in data['kpis']].index(kid)]['unidad'], per, F_FR,
               'PENDIENTE' if (k == 'sql' and nota) else 'CONFIRMADO', corte='2026-09', nota=nota if k == 'sql' else None)
for k in ['leads', 'mql', 'sql', 'cierres']:
    assert sum(r[k] for r in fr['mensual']) == fr['total'][k], f'Franquicias: el desglose mensual de {k} no cuadra'
assert abs(sum(r['inversion'] for r in fr['mensual']) - fr['total']['inversion']) < 0.01

# Alcances de eficiencia: año a la fecha y por trimestre (inversión del mismo archivo)
NOTA_FR = 'Inversión reportada en el archivo de franquicias; no se identifica su partida contable (no se suma al gasto contable). Periodo ene–sep vs corte contable a agosto.'
def scope(id_, nombre, per, inversion):
    data['efficiencyScopes'].append(base(id_, nombre=nombre, areaId=AREA['MD'], projectIds=[], lineaIds=[], periodo=per, inversion=round(inversion, 2),
        inversionIncluye='Inversión reportada por Marketing Digital para atracción de franquicias (desglose no informado).',
        etapas={'leads': ks['leads'], 'mql': ks['mql'], 'sql': ks['sql'], 'cierres': ks['cierres']}, gastoPublicitario=None,
        fuente=F_FR, corte='2026-09', estado='PENDIENTE', nota=NOTA_FR))
scope('alc-franquicias-2026-t1t3', 'Atracción de franquicias · ene–sep 2026', {'inicio': '2026-01-01', 'fin': '2026-09-30', 'etiqueta': 'Ene–sep 2026'}, fr['total']['inversion'])
for t, (ini, fin) in zip(fr['trimestres'], [('2026-01-01', '2026-03-31'), ('2026-04-01', '2026-06-30'), ('2026-07-01', '2026-09-30')]):
    scope(f'alc-franquicias-2026-{t.lower()}', f'Atracción de franquicias · {t} 2026', {'inicio': ini, 'fin': fin, 'etiqueta': f'{t} 2026'}, fr['inversion'][fr['trimestres'].index(t)])

# B · SOC Leads+ (exportación HubSpot)
sl = src['socleads']
F_SL = sl['fuente']
per_sl = {'inicio': '2021-01-01', 'fin': sl['corte'], 'etiqueta': f'Acumulado del programa al {sl["corte"]}'}
NOTA_SL = f'{sum(v for k, v in sl["registrosPorAnio"].items() if k != "2026")} de {sl["leads"]} registros son anteriores a 2026.'
k1 = kpi('B-SLP-LEADS', 'SOC Leads+: leads asignados', 'Negocios asignados a oficinas a través del programa SOC Leads+.', 'B', 'actividad', ['MD'], 'leads', F_SL, agregacion='ultimo')
k2 = kpi('B-SLP-SINGEST', 'SOC Leads+: leads sin gestionar', 'Leads asignados sin primer contacto.', 'B', 'desempeno', ['MD'], 'leads', F_SL, sentido='menor', agregacion='ultimo')
k3 = kpi('B-SLP-PROCESO', 'SOC Leads+: leads en proceso', 'Leads asesorados, en integración o en espera de banco.', 'B', 'desempeno', ['MD'], 'leads', F_SL, agregacion='ultimo')
result(k1, 'Leads del programa', sl['leads'], 'leads', per_sl, F_SL, 'PENDIENTE', corte=sl['corte'], nota=NOTA_SL)
result(k2, 'Sin gestionar', sl['sinGestionar'], 'leads', per_sl, F_SL, 'PENDIENTE', corte=sl['corte'], nota=NOTA_SL)
result(k3, 'En proceso', sl['enProceso'], 'leads', per_sl, F_SL, 'PENDIENTE', corte=sl['corte'], nota=NOTA_SL)

# B · Precalificador
pc = src['precalificador']
F_PC = pc['fuente']
kp = kpi('B-PREC', 'Registros del precalificador hipotecario', 'Personas que completan el precalificador en el sitio.', 'B', 'actividad', ['MD'], 'registros', F_PC, estado='CONFIRMADO')
for ym, v in zip(pc['meses'], pc['mensual']):
    fin = pc['corte'] if ym == pc['corte'][:7] else None
    result(kp, f'Registros {ym}', v, 'registros', month_period(ym, fin), F_PC, 'CONFIRMADO', corte=pc['corte'], nota='Mes parcial (al corte).' if fin else None)
assert sum(v for ym, v in zip(pc['meses'], pc['mensual']) if ym.startswith('2026')) == pc['total2026']
kz = kpi('B-PREC-SINZONA', 'Precalificador: registros sin zona', 'Registros sin zona asignada (no se pueden canalizar).', 'B', 'desempeno', ['MD'], 'registros', F_PC, sentido='menor')
for ym, v in zip(pc['meses'], pc['sinZonaMensual']):
    if ym.startswith('2026'):
        fin = pc['corte'] if ym == pc['corte'][:7] else None
        result(kz, f'Sin zona {ym}', v, 'registros', month_period(ym, fin), F_PC, 'CONFIRMADO', corte=pc['corte'])

# D · SOC Store (fondo revolvente; no es ingreso publicitario)
st = src['store']
F_ST = st['fuente']
kst = kpi('D-STORE-FACT', 'SOC Store: facturación', 'Ventas de la tienda a la red (fondo revolvente).', 'D', 'desempeno', ['STORE'], 'MXN', F_ST)
kst2 = kpi('D-STORE-VENTAS', 'SOC Store: pedidos', 'Pedidos registrados en la tienda.', 'D', 'actividad', ['STORE'], 'pedidos', F_ST)
ing = c.get('ingresoTienda', {}).get('total')
NOTA_ST = (f'Por conciliar: «Ingreso Tienda» contable ene–{MES_TXT[int(c["corte"][5:]) - 1]} ${ing:,.2f} vs facturación del reporte comercial.' if ing is not None else 'Por conciliar con contabilidad.') + \
    f' Incluye {st["pedidosDescuentoTotal"]} pedidos con 100% de descuento y {st["ventasCentroCosto"]["ventas"]} ventas a centro de costo.'
for row in st['porMes']:
    name = row['mes'].split('/')[0].lower()
    y = 2025 if '/25' in row['mes'] else 2026
    ym = f'{y}-{MES_CORTO[name]:02d}'
    if y == 2026 and MES_CORTO[name] >= 4:
        fin = '2026-10-16' if ym == '2026-10' else None
        result(kst, f'Facturación {ym}', row['facturacion'], 'MXN', month_period(ym, fin), F_ST, 'PENDIENTE', corte='2026-10-16', nota=NOTA_ST)
        result(kst2, f'Pedidos {ym}', row['ventas'], 'pedidos', month_period(ym, fin), F_ST, 'PENDIENTE', corte='2026-10-16')

# Datos reportados sin archivo fuente (pendientes de validación)
km = cfg['kpisManuales']
F_REP = 'Dato reportado a Dirección (archivo fuente no adjunto)'
ktv = kpi('E-SOCTV-VISTAS', 'SOC TV: visualizaciones', 'Reproducciones de los contenidos de SOC TV.', 'E', 'actividad', ['CON'], 'visualizaciones', 'Reporte SOC TV (archivo no adjunto)')
result(ktv, 'Visualizaciones SOC TV', km['socTv']['vistas'], 'visualizaciones', {'inicio': '2026-01-01', 'fin': '2026-03-31', 'etiqueta': 'T1 2026'}, F_REP, 'PENDIENTE',
       nota=f'Crecimiento interanual reportado: +{km["socTv"]["crecimiento"] * 100:.0f}%.')
per_plat = {'inicio': '2026-07-01', 'fin': '2026-08-31', 'etiqueta': 'Julio–agosto 2026'}
kd1 = kpi('D-PLAT-DESC', 'Plataforma SOC: descargas de materiales', 'Descargas de materiales desde la Plataforma SOC.', 'D', 'actividad', ['MD'], 'descargas', 'Reporte Plataforma SOC (archivo no adjunto)')
kd2 = kpi('D-PLAT-SOL', 'Plataforma SOC: solicitudes', 'Solicitudes de material o servicio en la Plataforma SOC.', 'D', 'actividad', ['MD'], 'solicitudes', 'Reporte Plataforma SOC (archivo no adjunto)')
kd3 = kpi('D-PLAT-OF', 'Plataforma SOC: oficinas activas', 'Oficinas con actividad en la plataforma.', 'D', 'desempeno', ['MD'], 'oficinas', 'Reporte Plataforma SOC (archivo no adjunto)', agregacion='ultimo')
result(kd1, 'Descargas', km['plataforma']['descargas'], 'descargas', per_plat, F_REP, 'PENDIENTE')
result(kd2, 'Solicitudes', km['plataforma']['solicitudes'], 'solicitudes', per_plat, F_REP, 'PENDIENTE')
result(kd3, 'Oficinas activas', km['plataforma']['oficinasActivas'], 'oficinas', per_plat, F_REP, 'PENDIENTE')
per_br = {'inicio': '2026-07-01', 'fin': '2026-09-30', 'etiqueta': 'T3 2026'}
for ln in km['branding']['lineas']:
    kb = kpi(f'A-BRAND-{slug(ln["linea"]).upper()[:4]}', f'Oficinas con branding · {ln["linea"]}', f'Oficinas de la línea {ln["linea"]} con branding físico aplicado.', 'A', 'marca', ['DIS'],
             'oficinas', 'Seguimiento Branding de oficinas (archivo no adjunto)', agregacion='ultimo')
    result(kb, f'Oficinas con branding {ln["linea"]}', ln['logradas'], 'oficinas', per_br, F_REP, 'PENDIENTE', nota=f'Universo reportado: {ln["universo"]} oficinas (confirmar).')

# Catálogo propuesto sin datos todavía (fuente esperada; estado PROPUESTA)
CAT = [
    ('A-ALCANCE', 'Alcance de marca', 'Personas únicas alcanzadas por los canales de SOC.', 'A', 'marca', ['MD'], 'personas', 'Meta Business Suite / plataformas'),
    ('A-TRAFICO', 'Tráfico web', 'Sesiones en los sitios de SOC.', 'A', 'marca', ['MD'], 'sesiones', 'Google Analytics'),
    ('A-BUSQ', 'Búsquedas de marca', 'Búsquedas que incluyen la marca SOC.', 'A', 'marca', ['MD'], 'búsquedas', 'Google Search Console'),
    ('A-COMUN', 'Crecimiento de comunidades', 'Seguidores netos ganados en redes sociales.', 'A', 'marca', ['MD', 'CON'], 'seguidores', 'Meta Business Suite / LinkedIn'),
    ('A-INTER', 'Interacciones', 'Interacciones con publicaciones de SOC.', 'A', 'marca', ['CON'], 'interacciones', 'Meta Business Suite / LinkedIn'),
    ('A-CONSIST', 'Consistencia de identidad', 'Piezas aprobadas conforme al brandbook entre piezas revisadas.', 'A', 'marca', ['DIS'], '%', 'Registro de revisión de Diseño'),
    ('A-RECON', 'Reconocimiento de marca', 'Reconocimiento asistido de SOC en el público objetivo.', 'A', 'marca', [], '%', 'Estudio de marca'),
    ('B-LEADS', 'Leads de clientes', 'Leads de cliente final generados por Marketing.', 'B', 'actividad', ['MD'], 'leads', 'HubSpot'),
    ('B-MQL', 'MQL de clientes', 'Leads de cliente calificados por Marketing.', 'B', 'desempeno', ['MD'], 'MQL', 'HubSpot'),
    ('B-SQL', 'SQL de clientes', 'Leads de cliente aceptados por la red.', 'B', 'desempeno', ['MD'], 'SQL', 'HubSpot'),
    ('B-CLIENTES', 'Clientes adquiridos', 'Clientes que formalizan con SOC atribuibles a Marketing.', 'B', 'desempeno', ['MD'], 'clientes', 'HubSpot / Comercial'),
    ('D-PROGRAMAS', 'Participación en programas', 'Asistentes a programas de formación (Aula SOC).', 'D', 'actividad', [], 'participantes', 'Aula SOC'),
    ('D-EVENTOS', 'Asistencia a eventos', 'Asistentes a eventos de la red.', 'D', 'actividad', ['STORE'], 'asistentes', 'Registro de eventos'),
    ('D-ADOPCION', 'Adopción de iniciativas', 'Oficinas que adoptan una iniciativa entre oficinas invitadas.', 'D', 'desempeno', [], '%', 'Seguimiento de iniciativas'),
    ('D-RETENCION', 'Retención de oficinas', 'Oficinas activas al cierre entre oficinas activas al inicio (sólo con datos verificables).', 'D', 'desempeno', [], '%', 'Dirección de Red'),
    ('E-PRODUCCION', 'Piezas producidas', 'Piezas de contenido entregadas.', 'E', 'actividad', ['CON', 'DIS'], 'piezas', 'Alignment & Unblock / calendario'),
    ('E-PUBLIC', 'Publicaciones', 'Publicaciones en canales propios.', 'E', 'actividad', ['CON'], 'publicaciones', 'Calendario editorial'),
    ('E-ALCANCE', 'Alcance de contenido', 'Personas alcanzadas por el contenido.', 'E', 'desempeno', ['CON'], 'personas', 'Meta Business Suite / LinkedIn'),
    ('E-CTR', 'CTR de contenido', 'Clics entre impresiones.', 'E', 'desempeno', ['CON'], '%', 'Plataformas'),
    ('E-TRAFICO', 'Tráfico generado por contenido', 'Sesiones originadas en contenidos.', 'E', 'desempeno', ['CON'], 'sesiones', 'Google Analytics (UTM)'),
    ('E-CONV', 'Conversiones atribuibles a contenido', 'Leads o registros con origen en contenido.', 'E', 'desempeno', ['CON'], 'conversiones', 'HubSpot (UTM)'),
    ('E-CALENDARIO', 'Cumplimiento del calendario', 'Publicaciones realizadas entre programadas.', 'E', 'eficiencia', ['CON'], '%', 'Calendario editorial'),
]
for clave, nombre, definicion, g, tipo, areas, unidad, fuente in CAT:
    kpi(clave, nombre, definicion, g, tipo, areas, unidad, f'{fuente} (por conectar)', agregacion='ultimo' if unidad == '%' else 'suma')

for k in data['kpis']:
    if k['unidad'] == '%' and k['sentido'] == 'mayor' and k['agregacion'] != 'ultimo':
        k['agregacion'] = 'ultimo'

ids = [x['id'] for col in data.values() for x in col]
assert len(ids) == len(set(ids)), 'Ids duplicados en el paquete'

pkg = {
    'app': 'alignment-unblock', 'tipo': 'paquete-inversion', 'version': 1, 'generado': datetime.now().strftime('%Y-%m-%d %H:%M'),
    'descripcion': 'Presupuesto 2026, gasto contable ene–ago, movimientos, reclasificaciones, catálogo de KPIs y resultados validados de la Dirección de Posicionamiento SOC.',
    'fuentes': [
        {'id': 'F-PPTO', 'archivo': F_PPTO, 'corte': 'Vigente', 'uso': 'Partidas, ampliaciones y transferencias', 'estado': 'CONFIRMADO', 'nota': 'Documento de autorización no adjunto.'},
        {'id': 'F-CONT', 'archivo': c['fuente'], 'corte': c['corte'], 'uso': f'Gasto ejercido ({len(data["spend"])} registros mensuales; RESUMEN = GASTOS al centavo)', 'estado': 'CONFIRMADO'},
        {'id': 'F-FRAN', 'archivo': F_FR, 'corte': '2026-09', 'uso': 'Embudo e inversión de franquicias', 'estado': 'CONFIRMADO', 'nota': 'Partida contable de la inversión sin identificar.'},
        {'id': 'F-SLP', 'archivo': F_SL, 'corte': sl['corte'], 'uso': 'SOC Leads+', 'estado': 'PENDIENTE'},
        {'id': 'F-PREC', 'archivo': F_PC, 'corte': pc['corte'], 'uso': 'Precalificador', 'estado': 'CONFIRMADO'},
        {'id': 'F-STORE', 'archivo': F_ST, 'corte': '2026-10-16', 'uso': 'SOC Store', 'estado': 'PENDIENTE', 'nota': 'Por conciliar con contabilidad.'},
        {'id': 'F-REP', 'archivo': F_REP, 'uso': 'SOC TV, Plataforma SOC, branding de oficinas', 'estado': 'PENDIENTE'},
    ],
    'discrepancias': discrepancias,
    'data': data,
}
json.dump(pkg, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(out_path, {k: len(v) for k, v in data.items()}, f'{len(discrepancias)} discrepancias')
