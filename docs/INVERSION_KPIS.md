# Inversión, KPIs y Resultados

Módulo de Alignment & Unblock que conecta la operación de cada gerencia (proyectos, prioridades, bloqueos, compromisos) con el presupuesto, los indicadores y los resultados. Menú **Inversión y KPIs** (`/inversion`) y panel **Inversión, KPIs y resultados** en el detalle de cada proyecto.

> Este documento no contiene cifras reales. Las cifras viven en Supabase y en el paquete de datos (`paquete-inversion-*.json`), que no se guarda en el repositorio.

## Arquitectura

Es una evolución, no un sistema aparte:

- **Mismo almacenamiento.** 13 colecciones nuevas en `au_records` (un documento JSON por registro), como el resto de la información. Hereda la seguridad por fila, el tiempo real, los respaldos y la restauración, el modo local (IndexedDB v2) y la plantilla de HubSpot.
- **Relaciones por identificador.** No hay vínculos por coincidencia de nombres. `budgetAllocations` (partida ↔ proyecto), `projectKpis` (proyecto ↔ KPI) y `projectAreas` (proyecto ↔ gerencia colaboradora) son tablas de asociación, así que las relaciones pueden ser múltiples en ambos sentidos.
- **Cálculo en el cliente.** Es puro y está probado: `src/domain/investment/` (presupuesto, KPIs, eficiencia, alertas, índice, lector contable).
- **Reglas reforzadas en el servidor.** `supabase/migrations/0004_inversion_kpis_resultados.sql` repite las reglas de la app, para que no dependan sólo de la pantalla.

| Colección | Qué guarda | Quién la modifica |
|---|---|---|
| `objectives` | Objetivos estratégicos | Dirección |
| `kpis` | Catálogo: clave, definición, grupo A–F, tipo (actividad, desempeño, eficiencia, rentabilidad, marca), objetivo, gerencias, unidad, sentido (mayor / menor / rango), agregación, fuente, validación | Dirección |
| `kpiTargets` | Meta por KPI y periodo | Dirección |
| `results` | Resultado medido por periodo. Sin KPI = «pendiente de vinculación» | Gerencias capturan «pendiente»; sólo Dirección confirma y modifica un resultado confirmado |
| `budgetLines` | Partida: autorizado inicial, categorías contables, revolvente, reserva | Dirección |
| `budgetMovements` | Ampliación, reducción, transferencia (un solo registro origen → destino) y reclasificación de gasto | Dirección |
| `spend` | Gasto ejercido por categoría contable y mes (reporte contable) | Dirección |
| `budgetCommitments` | Gasto comprometido, o ejercido con detalle de proyecto | Dirección |
| `budgetAllocations` | Partida ↔ proyecto (monto) | Dirección |
| `projectKpis` | Proyecto ↔ KPI (directa / indirecta) | Quien edita proyectos |
| `projectAreas` | Proyecto ↔ gerencia colaboradora | Quien edita proyectos |
| `revenues` | Ingreso atribuible a publicidad (ROAS) o beneficio económico atribuible (ROI) | Dirección |
| `efficiencyScopes` | Alcance de eficiencia: inversión atribuible y KPIs del embudo, del mismo periodo | Dirección |

El rol Consulta sólo lee. Un acceso suspendido o un correo desconocido no ve nada.

## Reglas de cálculo

**Presupuesto**

| Concepto | Cómo se calcula |
|---|---|
| Vigente | Inicial + ampliaciones − reducciones ± transferencias **confirmadas**. Las transferencias no cambian el total. |
| Ejercido | Gasto del reporte contable de las categorías de la partida, hasta el corte. |
| Reclasificaciones de gasto | Sólo las confirmadas cambian el ejercido oficial. Las pendientes aparecen en «ejercido con reclasificaciones propuestas». Nunca se corrigen en silencio. |
| Gasto sin partida | Una categoría contable que no pertenece a ninguna partida se muestra aparte y cuenta en el total. |
| Disponible | Vigente − ejercido (incluye el gasto sin partida) − comprometido. |

- **Fondo revolvente** (SOC Store): se marca «conciliar», no «sobreejercido».
- **Sin doble conteo:**
  - una categoría contable pertenece a una sola partida;
  - un solo registro de gasto por categoría y mes;
  - el total por partidas + sin partida = total del reporte (validación visible en Control presupuestal);
  - lo asignado a proyectos ≤ vigente;
  - un compromiso no puede superar el disponible (salvo revolvente).
- **«Gasto registrado» de un proyecto:** sólo compromisos con proyecto identificado. El reporte contable es por categoría y no se reparte entre proyectos por estimación.

**KPIs**

- **Cumplimiento:**
  - mayor es mejor = real / meta;
  - menor es mejor = meta / real;
  - rango = dentro del rango.
- **En riesgo:** por debajo del 90 %.
- **Periodos:**
  - un resultado se compara con la meta de su mismo periodo;
  - si la meta es de un periodo mayor, se suman los resultados contenidos en él;
  - el periodo exacto manda sobre los desgloses;
  - con traslapes irregulares no se suma y se reporta «periodos incompatibles»;
  - con resultados parciales de un KPI de suma, se compara contra la meta proporcional, rotulada como tal.
- **Eficiencia operativa** (grupo F): se calcula con los datos de la propia herramienta.
  - Proyectos concluidos y retrasados.
  - Bloqueos abiertos y tiempo medio de resolución.
  - Cumplimiento de compromisos, P1 atendidos y desviación de fechas.

**Eficiencia y rentabilidad** (`src/domain/investment/efficiency.ts`)

| Indicador | Fórmula |
|---|---|
| CPL | inversión atribuible / leads |
| Costo por MQL / SQL / cierre | inversión atribuible / etapa |
| CPA | inversión atribuible / clientes adquiridos |
| ROAS | ingresos atribuibles a publicidad / gasto publicitario |
| ROI | (beneficio económico atribuible − inversión) / inversión × 100 |

- **Inversión y resultados:** deben ser del **mismo alcance y periodo**, y los resultados deben cubrir todo el periodo de la inversión.
- **ROI:** exige definir qué costos y beneficios se consideran.
- **Qué no es beneficio:** el ingreso bruto y la colocación hipotecaria; el servidor rechaza registrar la colocación como ingreso.
- **Dato faltante:** el indicador muestra «No calculable con los datos disponibles» y el motivo; nunca se usan estimaciones.

**Índice complementario de atención** (propuesta configurable; no cambia la prioridad oficial)

- **Pesos por defecto (suman 100):**
  - impacto 25, urgencia 15, dependencia 10, riesgo 15;
  - avance 5, contribución a KPIs 15, inversión 5, fecha 10.
- **Límite de la inversión:** tiene tope y nunca puede pesar más que el impacto estratégico.

**Centro de decisiones** (`alerts.ts`): las alertas se calculan, no se guardan.

- **Categorías:**
  - estratégicos retrasados y KPIs debajo de meta;
  - presupuesto sin proyecto y proyectos sin KPI;
  - inversión sin resultados y resultados sin inversión;
  - sobrepresupuesto (incluye gasto sin partida) y bloqueos que requieren a Dirección;
  - movimientos pendientes de autorización;
  - discrepancias de fuente y KPIs sin fuente.
- **Cada alerta indica:** responsable, causa, impacto y siguiente acción.
- **Registrar decisión:** usa la colección existente `decisions`.

## Carga y actualización de datos

1. **Paquete de datos validados.** Ve a Datos y configuración → Paquete.
   - `dashboard-ejecutivo/scripts/paquete_inversion.py` lo genera a partir de los datos del Dashboard Ejecutivo y compara contra la referencia de Dirección.
   - Las diferencias van a `discrepancias` y al campo `discrepancia` del registro, que aparece en el Centro de decisiones.
   - La importación sólo agrega registros con id nuevo: nunca sobrescribe ni borra, y se puede repetir sin duplicar.
   - Las gerencias del paquete (`area:Nombre`) se traducen a las áreas reales con confirmación en pantalla.
2. **Corte contable mensual.** Ve a Datos → Actualizar gasto contable y elige el Excel (hoja RESUMEN, encabezado «REPORTE MKT»).
   - Se valida el cuadre de cada categoría y del total.
   - Los meses nuevos se agregan.
   - Las correcciones de meses ya registrados sólo se aplican con confirmación explícita, y queda anotado el monto anterior.
3. **Captura.** Movimientos, compromisos, asignaciones, metas, resultados, alcances e ingresos se capturan con formularios validados.

```bash
python3 -I dashboard-ejecutivo/scripts/paquete_inversion.py \
  dashboard-ejecutivo/datos/config-2026.json dashboard-ejecutivo/salida/fuentes.json \
  dashboard-ejecutivo/datos/referencia-2026-10-27.json entrega-hubspot/paquete-inversion-SOC-2026.json
```

## Despliegue

1. **Supabase.** En el SQL Editor ejecuta `0004_inversion_kpis_resultados.sql`, después de 0001–0003.
   - Es idempotente.
   - No borra ni modifica registros.
   - No cambia las políticas existentes: agrega un trigger.
2. **HubSpot.** Reemplaza la plantilla. Ver [HUBSPOT.md](HUBSPOT.md).
3. **Carga del paquete.** Dirección entra → Inversión y KPIs → Datos y configuración → carga el paquete.

## Pruebas

| Comando | Qué cubre |
|---|---|
| `npm test` | Cálculo presupuestal, KPIs, eficiencia, alertas, permisos, importación, índice y lector contable (`tests/unit/investment.test.ts`) |
| `npm run test:supabase:sql` | Permisos y restricciones de 0004 en PostgreSQL |
| `npm run test:supabase` | Adaptador Supabase con el servidor rechazando cambios financieros de una gerencia |
| `npm run test:e2e` | Flujo completo en pantalla y sin desbordes en celular ni tableta (`tests/e2e/investment.spec.ts`) |
| `npm run test:e2e:supabase` | Consulta: el módulo se ve, pero sin acciones |
