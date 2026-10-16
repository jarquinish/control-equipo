# Entregable 4 · Diccionario de datos

Dashboard Ejecutivo · Marketing y Posicionamiento SOC 2026. Moneda: pesos mexicanos (MXN). Fechas: AAAA-MM-DD; meses: AAAA-MM.

## Estados de validación (todos los registros)

| Valor | Significado | Uso |
|---|---|---|
| `CONFIRMADO` | Información validada y respaldada por una fuente. | Verde ✓ |
| `PENDIENTE` | Información disponible que requiere confirmación. | Amarillo ! · valor por omisión de lo importado sin estado |
| `PROPUESTA` | Información sugerida para planeación o análisis. | Azul ◇ · valor por omisión de compromisos y decisiones capturados |

Cambiar un estado exige motivo y queda en la bitácora.

## Módulo 1 · Resumen ejecutivo (calculado)

| Indicador | Fórmula | Fuente |
|---|---|---|
| Presupuesto total autorizado | Constante 17,000,000 | Presupuesto autorizado |
| Gasto real | Σ categorías de la hoja RESUMEN (ene → corte) | Reporte contable |
| % de ejecución | Gasto real ÷ presupuesto total (también se muestra ÷ distribuido) | Calculado |
| Recursos no ejercidos | Presupuesto total − gasto real (incluye la reserva) | Calculado |
| Reserva sin asignar | Constante 40,000; no pertenece a ninguna partida | Presupuesto autorizado |
| Referencia lineal | Meses con gasto real ÷ 12. Orienta, no es proyección | Calculado |

## Módulo 2 · Presupuesto y ejecución (por partida)

| Campo | Definición |
|---|---|
| `id` | Número de partida 01–20 (no cambia). |
| `nombre` | Nombre de la partida autorizada. |
| `original` | Autorizado − movimientos (presupuesto antes de ampliación y transferencias). |
| `movimientos` | Σ ampliaciones y transferencias de la partida (bitácora de movimientos). |
| `autorizado` | Presupuesto vigente de la partida. |
| `categorias` | Categorías contables de la hoja RESUMEN que alimentan la partida (mapeo). |
| `gastoContable` | Σ de esas categorías tal como las registró Contabilidad. |
| `ajuste` | Reclasificaciones para el análisis directivo (+ entra / − sale). |
| `gastoAjustado` | gastoContable + ajuste. |
| `disponible` | autorizado − gastoAjustado. |
| `pct` | gastoAjustado ÷ autorizado. |
| `semaforo` | Sobreejercicio (> 100%) · Riesgo (≥ 90%) · En rango · Sin ejercer (gasto 0) · Conciliar (SOC Store, capital revolvente). |
| `estado` | Confirmado si no tiene reclasificaciones; Pendiente si su gasto ajustado depende de una reclasificación no formalizada. |

**Mapeo vigente categoría contable → partida:** Aula SOC → 01 · Branding | Red de Líderes → 02 · Google → 03 · Redes sociales → 04 · FORBES → 07 · Presupuesto Comercial Local → 11 · SOC TV → 12 · Tienda SOC → 16 · Branding, Áreas, Corporativo → 18 · Herramientas → 19 · Capacitación y Viáticos → 20. *Content Marketing* no tiene partida: la reclasificación R2 la asigna a Branding de la Red. Las demás partidas aún no tienen categoría con gasto.

## Movimientos presupuestales

| Campo | Definición |
|---|---|
| `id` | M1…Mn |
| `tipo` | Ampliación (modifica el total) · Transferencia (neto 0) |
| `partida` | 01–20 o `RESERVA` |
| `monto` | Positivo entra, negativo sale |
| `concepto`, `estado` | Descripción y validación |

## Reclasificaciones

| Campo | Definición |
|---|---|
| `id` | R1, R2 |
| `deTipo` / `de` | `partida` + id, o `categoria` + nombre contable |
| `a` | Partida destino |
| `monto` | Fijo, o el total de la categoría de origen si es `null` («íntegramente») |
| `validacionContable` | Texto editable (p. ej. «No formalizada por Contabilidad») |

Regla: el neto de reclasificaciones siempre es 0 (no alteran el gasto total).

## Módulo 3 · Compromisos de cierre (captura)

| Campo | Tipo | Regla |
|---|---|---|
| `partida` | 01–20 | Obligatorio |
| `mes` | AAAA-MM | Obligatorio; sólo meses posteriores al corte contable y del ejercicio 2026 |
| `concepto` | Texto | Obligatorio |
| `tipo` | Comprometido · Planeado · Proyecto pendiente | Obligatorio |
| `monto` | Número > 0 | Obligatorio |
| `proveedor`, `responsable`, `notas` | Texto | Opcional |
| `estado` | Estado de validación | Obligatorio (por omisión Propuesta) |

**Saldo proyectado por partida** = disponible al corte − Σ compromisos de la partida (opción «sólo confirmados»). La reserva no recibe compromisos.

## Módulo 4 · Resultados y KPI (independiente)

| Iniciativa | Campos | Cálculos |
|---|---|---|
| Atracción de franquicias | inversión, leads, MQL, SQL, cierres (por trimestre y total) | Costo por lead/MQL/SQL/cierre = inversión ÷ etapa; conversiones = etapa ÷ etapa anterior |
| SOC Leads+ | oficinas, leads, sin gestionar, contactados, en proceso, perdidos | % sin gestionar = sin gestionar ÷ leads |
| SOC TV | visualizaciones, crecimiento interanual | — |
| Plataforma SOC | descargas, solicitudes, oficinas activas | — |
| Precalificador | registros por mes 2025–2026, sin zona | Totales por año; ene–sep 2026 vs ene–sep 2025 |
| Branding de oficinas | por línea: oficinas con branding / universo | % por línea (no se suma entre líneas) |
| SOC Store | transacciones, facturado, unidades, ticket promedio y mediano, pedidos con 100% de descuento | Ninguno financiero (sin margen, utilidad ni ROI) |

Cada indicador lleva `periodo`, `fuente` y `estado`.

## Módulo 5 · Gestión por gerencia (captura)

| Campo | Regla |
|---|---|
| `gerencia` | MD (Marketing Digital) · CON (Contenido) · DIS (Diseño) · STORE (SOC Store y gestión comercial local). Obligatorio |
| `responsable`, `proyecto` (obligatorio), `actividad` | Texto |
| `prioridad` | P1 · P2 · P3 |
| `prioridadConfirmada` | Sí / No. Si es No se muestra «(propuesta)» |
| `avance` | Por iniciar · En curso · En riesgo · Bloqueado · Terminado |
| `fecha` | Fecha compromiso |
| `bloqueo`, `dependencia`, `proximaAccion` | Texto |
| `estado` | Validación (por omisión Pendiente) |

Fotografía por gerencia: pendientes, P1 propuestas y bloqueos (sólo conteos, sin calificación).

## Módulo 7 · Decisiones (captura)

| Campo | Regla |
|---|---|
| `decision` | Obligatorio |
| `motivo`, `impacto` | Texto |
| `prioridad` | Alta · Media · Baja |
| `responsable` | Responsable de seguimiento |
| `fechaLimite` | Fecha; se marca «Vencida» si pasó y no está resuelta |
| `estatus` | Abierta · En análisis · Resuelta (exige resolución) · Descartada |
| `resolucion` | Texto |
| `estado` | Validación (por omisión Propuesta) |

## Bitácora

`fecha` (ISO), `accion`, `detalle`. Registra capturas, ediciones, eliminaciones, cambios de estado, observaciones, importaciones, actualizaciones contables, respaldos y restauraciones. Conserva los últimos 500 movimientos.

## Archivos

| Archivo | Contenido |
|---|---|
| Respaldo `.json` | `{ app: "soc-mkt-dashboard-2026", version, exportado, corteContable, state }` |
| CSV de captura | Encabezados = etiquetas del dashboard (descargar «Plantilla CSV»). Separador coma o punto y coma; UTF-8 |
| Excel contable | Hoja `RESUMEN`: fila con «REPORTE MKT», columnas de meses y columna `2026` (total); última fila `2026` = total |
