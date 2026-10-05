# Alignment & Unblock · SOC

**Sistema operativo semanal de alineación, prioridades y desbloqueo** de la Dirección de Posicionamiento.
Coordina inicialmente a **Contenido · Diseño · Marketing Digital · SOC Store**.

> No es un gestor de tareas. Es el lugar donde **la junta semanal vive dentro del dashboard**:
> las áreas actualizan antes de la Weekly y Dirección la conduce paso a paso desde aquí.

```
REVISAR → VISIBILIZAR → ORDENAR → PRIORIZAR → DETECTAR → DESTRABAR → COMPROMETER → CERRAR → GESTIONAR → DAR SEGUIMIENTO
```

---

## Índice

1. [Objetivo](#objetivo)
2. [Stack](#stack)
3. [Instalación y ejecución](#instalación-y-ejecución)
4. [Guía de uso](#guía-de-uso)
5. [Exportar, respaldar y restaurar](#exportar-respaldar-y-restaurar)
6. [Arquitectura](#arquitectura)
7. [Modelo de datos](#modelo-de-datos)
8. [Pruebas](#pruebas)
9. [Despliegue](#despliegue)
10. [Backend e integraciones futuras](#backend-e-integraciones-futuras)
11. [Limitaciones conocidas](#limitaciones-conocidas)
12. [Roadmap](#roadmap)

---

## Objetivo

Responder cada semana, sin minutas narrativas:

| Pregunta | Dónde se responde |
|---|---|
| ¿Cuáles son nuestros principales proyectos? | Inicio · Proyectos · Paso 2 *Visibilizar* |
| ¿Qué es importante / urgente? | Eisenhower · Paso 3 *Ordenar* |
| ¿Qué es P1, P2, P3? | Ponderación automática · Paso 4 *Priorizar* |
| ¿Qué está bloqueado y qué lo provoca? | Centro de bloqueos · Paso 5 *Detectar* |
| ¿Qué necesitamos y de quién dependemos? | Dependencias · Paso 6 *Destrabar* |
| ¿Quién gestiona, con qué fecha y hora? | Compromisos · Paso 6 *Comprometer* |
| ¿Se cumplió? ¿Qué escalamos? | Paso 1 *Revisar* de la siguiente Weekly |
| ¿Qué revisamos la próxima semana? | Resumen automático · Historial |

**Reglas del juego** (visibles en Inicio y aplicadas por el sistema):

1. No reportamos actividades: trabajamos sobre **proyectos**.
2. No todo lo urgente es importante (Eisenhower + sugerencia por impacto/urgencia).
3. No todo puede ser P1 (alerta al superar el máximo configurable).
4. Un bloqueo no identifica culpables; identifica dónde necesita ayuda el proyecto.
5. Todo bloqueo termina en una acción.
6. Toda acción tiene **responsable + fecha + hora** (validado; sin eso un bloqueo no queda "en gestión").
7. La siguiente Weekly comienza revisando los compromisos anteriores (Paso 1).
8. Una nueva prioridad crítica identifica qué prioridad desplaza (modal de ajuste de Dirección).

---

## Stack

| Capa | Elección | Por qué |
|---|---|---|
| UI | **React 19 + TypeScript** | Componentes mantenibles y tipado estricto del dominio |
| Build | **Vite** | Build rápido, SPA estática fácil de desplegar |
| Persistencia V1 | **IndexedDB** (fallback localStorage / memoria) detrás de una capa de adaptadores | Funciona sin servidor y sobrevive al cierre del navegador |
| Íconos | `lucide-react` (tree-shaking) | Ligero, sólo se incluyen los íconos usados |
| Tipografía | **DM Sans** (licencia OFL, empaquetada con `@fontsource`) | Alternativa geométrica a *Circular*, que es propietaria y **no** se incorporó |
| Router | Router propio sobre History API (≈80 líneas) | Sin dependencias extra |
| Pruebas | **Vitest** (dominio/servicios) + **Playwright** (E2E en Chromium) | |

Sin librerías de estado, de formularios ni de gráficas. Build de producción ≈ **136 KB gzip** de JS + 10 KB de CSS + fuente.

---

## Instalación y ejecución

Requisitos: **Node.js 18+** (probado con Node 22).

```bash
npm install          # dependencias
npm run dev          # desarrollo en http://localhost:5173
npm run build        # build de producción en dist/
npm run preview      # sirve dist/ en http://localhost:4173
```

Pruebas:

```bash
npm test             # pruebas unitarias (Vitest)
npm run test:e2e     # E2E con Playwright (compila y levanta preview automáticamente)
npm run test:all     # typecheck + unitarias + build + E2E
```

> Para E2E se necesita Chromium de Playwright (`npx playwright install chromium` si tu equipo no lo tiene).

### Primer uso

Al abrir por primera vez se crean automáticamente las **4 áreas**, el perfil **Dirección de Posicionamiento** y la **semana actual** (semana ISO).
Para explorar sin afectar información real: **Configuración → Cargar datos demo** (o el botón en Inicio).

---

## Guía de uso

### Semana activa

Todo gira alrededor de una **semana activa** (barra superior: `SEMANA 41 · 5 oct — 11 oct 2026`).

- **← Semana anterior / Semana siguiente →** navegan el historial (las semanas cerradas son de **sólo lectura** y muestran su fotografía).
- **Semana actual** vuelve a la semana activa.
- **Abrir Semana N** (en la flecha siguiente, en Weekly o en Configuración) crea la siguiente semana. Si la actual sigue abierta, se cierra y se guarda su snapshot: **nunca se sobrescribe información histórica**.

### Actualizar mi área (antes de la Weekly)

Inicio → **Actualizar mi área** (o clic en el estado del área). Por cada proyecto:

- **Continuar** – sigue igual; queda registrada la actualización semanal.
- **Actualizar** – estado, responsable, fecha objetivo, impacto/urgencia/dependencia, comentario.
- **Bloqueo** – registra qué bloquea, qué se necesita, de quién depende y (opcional) el compromiso.
- **Cerrar / Archivar** – sale de los activos y conserva su historial.
- **Crear proyecto**.

Al final: **Marcar actualización completada** (registra fecha, hora y usuario). Si quedan proyectos sin revisar, el sistema ofrece marcarlos como "continúa sin cambios". Inicio muestra ✓ / ⚠ por área.

### Crear un proyecto

Campos: nombre, descripción breve, área, responsable, fecha objetivo, impacto, urgencia, dependencia, Eisenhower (con sugerencia), estado, *¿de quién depende?* y *¿está bloqueado?* El score y la prioridad se calculan en vivo.

### Priorizar (ponderación)

```
SCORE = IMPACTO + URGENCIA + DEPENDENCIA      (cada criterio 1–3)
8–9 → P1    6–7 → P2    3–5 → P3
```

| | 1 | 2 | 3 |
|---|---|---|---|
| Impacto | Operativo / bajo | Relevante | Estratégico / comercial / reputacional |
| Urgencia | Puede esperar | Debe avanzar esta semana | Deadline inmediato |
| Dependencia | Prácticamente autónomo | Depende de otra área/persona | Varias áreas / Dirección / tercero |

**Ajuste de Dirección**: botón *Ajuste Dirección* (o la prioridad en el Paso 4). Se conservan `prioridadCalculada`, `prioridadFinal`, `ajusteDireccion = true` y el motivo. Si el cambio crea un nuevo P1, el sistema pregunta **qué prioridad desplaza** (regla 8) y registra la decisión. Sólo roles *Dirección* y *Administrador* pueden ajustar.

### Iniciar la Weekly (Modo Junta)

Inicio o Weekly → **Iniciar Weekly**. Pantalla limpia para proyectar (1920×1080, 1440×900, laptop, tablet horizontal), con **PASO X DE 7**, barra de progreso, navegación con ← → y botón de pantalla completa. Se puede salir y **continuar** donde se quedó.

| Paso | Pregunta | Qué se hace |
|---|---|---|
| 1 Revisar | ¿Cumplimos lo acordado? | Compromisos abiertos de semanas anteriores: ✓ Cumplido · ↻ Reprogramar (nueva fecha, hora y motivo; conserva fecha/hora original y contador) · ✕ Incumplido · ↑ Escalar |
| 2 Visibilizar | ¿En qué estamos? | Proyectos por área (máx. 5 recomendado; aviso si hay más) |
| 3 Ordenar | ¿Es importante, urgente o ambas? | Eisenhower con drag & drop |
| 4 Priorizar | ¿Este orden representa las prioridades de la Dirección? | Tabla por score, edición de I/U/D con recálculo inmediato y override |
| 5 Detectar | ¿Puede avanzar? | Tarjeta grande por proyecto en orden: P1 bloqueados → P1 → P2 bloqueados → P2 → P3 que requieren atención. ✓ Avanza · ⚠ Bloqueado · ? Requiere decisión · ✓ Resuelto |
| 6 Destrabar y comprometer | ¿Qué necesitamos para avanzar? | Las 5 preguntas del bloqueo + acción, responsable, apoyo, fecha y hora. Marca **⚠ BLOQUEO SIN COMPROMISO** si falta algo |
| 7 Cerrar | ¿Con qué salimos? | P1, bloqueos, decisiones, compromisos, escalamientos y tabla final. Valida y muestra **✓ TODO CLARO** o **⚠ X TEMAS REQUIEREN DEFINICIÓN** (con botón *Resolver*). **Cerrar Weekly** |

### Registrar un bloqueo y crear un compromiso

- **Bloqueos → Registrar bloqueo**, o *Marcar bloqueo* en un proyecto, o en la Weekly.
- Un bloqueo con compromiso completo pasa automáticamente a **En gestión**. Moverlo a *En gestión* sin compromiso abre el formulario para completarlo (no se permite gestionar sin responsable + fecha + hora).
- **Compromisos → Nuevo compromiso** para acciones de avance sin bloqueo.
- Acciones rápidas en la tabla: **Cumplir, Reprogramar, Escalar, Incumplido, Comentar, Ver proyecto, Reabrir**.
- Al cumplir un compromiso ligado a un bloqueo, se pregunta si el bloqueo quedó resuelto.
- Un compromiso abierto cuya fecha/hora ya pasó se muestra **VENCIDO** (se recalcula automáticamente cada 30 s).

### Cerrar la Weekly y resumen automático

Al cerrar se guarda un **snapshot inmutable** de la semana (proyectos, prioridades, Eisenhower, bloqueos, compromisos, decisiones, KPIs) y se genera el resumen ejecutivo:

- **Copiar para Teams** (Markdown compatible)
- **Copiar sólo compromisos**
- **Descargar .md** / **Descargar .txt**
- **Abrir Semana N+1**

### Otras vistas

- **Inicio**: estado de actualización por área, KPIs clicables (proyectos, P1, P2, P3, bloqueados, compromisos, vencidos, cumplimiento), *Requieren atención* ordenado por regla, salud de ejecución y alertas.
- **Eisenhower**: matriz 2×2 con drag & drop (y selector accesible por teclado), filtro por área, sugerencia cuando el cuadrante no coincide con impacto/urgencia.
- **Bloqueos**: Kanban *Por destrabar · En gestión · Resuelto · Escalado* con drag & drop y marca VENCIDO.
- **Compromisos**: tabla filtrable + **Mis compromisos** por responsable.
- **Dependencias**: *quién necesita → qué → de quién → para cuándo*, con cuellos de botella y filtros.
- **Áreas**: tablero por área (proyectos, P1, bloqueados, compromisos, vencidos, lo que necesitamos de otros y lo que otros necesitan de nosotros).
- **Historial**: semanas con su fotografía (proyectos, Eisenhower, bloqueos, compromisos, decisiones, resumen) y **Salud de ejecución** (cumplimiento por semana, vencidos, reprogramaciones, tiempo promedio de desbloqueo, dependencias y bloqueos recurrentes, proyectos abiertos demasiado tiempo).
- **Proyecto**: ponderación, **evolución semanal** (`SEMANA 39 → P2 · SEMANA 40 → P1 · BLOQUEADO …`), bloqueos, compromisos, decisiones y comentarios.
- **Búsqueda global** (Ctrl+K) en proyectos, compromisos, bloqueos y personas.

### Cumplimiento: cómo se calcula

- **Inicio** (ventana móvil): compromisos cuya fecha/hora original cayó en las **últimas 4 semanas** (o que se cerraron en ellas) → `cumplidos / (cumplidos + incumplidos + vencidos)`. Reprogramados que aún no vencen no cuentan.
- **Historial** (por semana): mismo cálculo para los compromisos que vencían originalmente en esa semana.

Son indicadores **del sistema**, no de personas.

---

## Exportar, respaldar y restaurar

Configuración → *Datos, exportación y respaldo*:

| Acción | Resultado |
|---|---|
| **Generar respaldo** / **Exportar JSON** | Descarga todo el espacio en JSON (`alignment-unblock-respaldo-AAAA-MM-DD-HH-MM.json`) |
| **Restaurar respaldo** | Valida el archivo, muestra conteos y pide confirmación; **reemplaza** todo |
| **Importar JSON** | Valida y **combina** (agrega/actualiza por id; conserva la configuración local) |
| **Proyectos / Compromisos / Bloqueos CSV** | CSV UTF-8 con BOM para Excel |

La validación revisa formato, versión, ids duplicados, rangos 1–3, prioridades/estados válidos, fechas y horas, y referencias (proyecto → área, compromiso → proyecto…). **Un archivo inválido nunca toca la información**: se listan los problemas y no se modifica nada.

> La información vive en el navegador (IndexedDB). **Genera respaldos periódicos**, sobre todo antes de cambiar de equipo o limpiar datos del navegador.

---

## Arquitectura

```
src/
├── domain/           Lógica de negocio PURA (sin React, sin almacenamiento)
│   ├── types.ts        Modelo de datos
│   ├── scoring.ts      Score, prioridad, override, sugerencia Eisenhower
│   ├── selectors.ts    Semana viva vs. snapshot, estados efectivos (VENCIDO), utilidades
│   ├── alerts.ts       Alertas internas y "Requieren atención"
│   ├── metrics.ts      KPIs, cumplimiento, salud de ejecución
│   ├── weekly.ts       Orden de DETECTAR, compromisos a revisar, validaciones de cierre
│   ├── summary.ts      Resumen ejecutivo (Markdown / texto)
│   ├── validation.ts   Validaciones con mensajes para usuario
│   └── permissions.ts  Matriz de roles (ADMIN, DIRECTOR, GERENTE, COLABORADOR)
├── data/             Almacenamiento
│   ├── store.ts        DataStore: caché en memoria + cola de escritura asíncrona
│   ├── repository.ts   Repositorio genérico (list/read/filter/create/update/upsert/delete)
│   └── adapters/       IndexedDB · localStorage · memoria · REST
├── services/         Casos de uso (crear proyecto, reprogramar, cerrar Weekly, abrir semana, respaldo, CSV, demo…)
├── state/            Contexto React, espacios de trabajo (principal/demo), router SPA
├── ui/               Componentes base (modal accesible, formularios, chips, KPIs, toasts)
├── features/         Pantallas: home, weekly (Modo Junta), projects, eisenhower, blocks,
│                     commitments, dependencies, areas, history, settings, modals
└── styles/           Tokens de diseño SOC + estilos
```

Flujo: **UI → servicios → repositorios → DataStore → StorageAdapter**. La UI lee el estado en memoria (síncrono, inmutable, `useSyncExternalStore`) y los cambios se persisten por lotes. Cambiar IndexedDB por una API significa implementar `StorageAdapter` (ver `restAdapter.ts`), sin tocar la UI.

**Semana viva vs. histórica**: `getWeekData()` devuelve los datos vivos de la semana activa o la **fotografía** (`WeekSnapshot`) de una semana cerrada. Todas las vistas usan la misma función, por eso navegar a una semana anterior muestra exactamente lo que se acordó.

**Espacios de trabajo**: *Principal* y *Demo* usan bases IndexedDB separadas (`alignment-unblock-principal`, `alignment-unblock-demo`). La demo nunca toca la información real.

---

## Modelo de datos

| Entidad | Campos clave |
|---|---|
| `Area` | id, nombre, responsable, activo, orden, color, createdAt, updatedAt |
| `Person` | id, nombre, email, rol (ADMIN/DIRECTOR/GERENTE/COLABORADOR), areaId, activo |
| `Project` | id, nombre, descripcion, areaId, responsable, impacto, urgencia, dependencia, score, prioridadCalculada, prioridadFinal, ajusteDireccion, motivoAjuste, eisenhower, estado, bloqueado, fechaObjetivo, dependeDe, createdAt, updatedAt |
| `Week` | id (`2026-W41`), numero, anio, fechaInicio, fechaFin, estado (abierta/cerrada), createdAt, closedAt |
| `WeeklyUpdate` | id (`wu_<semana>_<proyecto>`, uno por proyecto y semana), weekId, projectId, areaId, estado, impacto, urgencia, dependencia, score, prioridad, bloqueado, eisenhower, comentario, origen (área/junta/cierre), updatedBy, updatedAt |
| `AreaUpdate` | weekId, areaId, completedAt, completedBy, comentario |
| `Block` | id, projectId, weekId, descripcion, necesidad, dependeDe, areaDependencia, quienPuedeAyudar, responsableGestion, estado (por_destrabar/en_gestion/resuelto/escalado), escaladoA, createdAt, resolvedAt |
| `Commitment` | id, projectId, blockId, weekId, accion, responsable, apoyo, fecha, hora, estado (pendiente/en_gestion/cumplido/reprogramado/incumplido/escalado; *vencido* se calcula), fechaOriginal, horaOriginal, reprogramaciones, motivoReprogramacion, escaladoA, comentarios[], historial[], createdAt, completedAt |
| `Session` | id, weekId, fecha, estado, pasoActual, proyectosRevisados, decisiones, compromisos, deteccion, desplazamientos, resumen, createdAt, closedAt |
| `Decision` | id, sessionId, weekId, projectId, descripcion, responsable, createdAt |
| `WeekSnapshot` | fotografía inmutable al cerrar: projects (WeeklyUpdate[]), blocks, commitments, decisions, areaUpdates, kpis, resumen |
| `Settings` | semana activa, usuario activo, dependencias externas, etiquetas de estado, criterios |

Un proyecto **no se duplica** entre semanas: su evolución se reconstruye con `WeeklyUpdate` (uno por semana).
Las dependencias se guardan como id de área interna o `ext:Nombre` (Comercial, TI, Finanzas, Proveedor externo… configurables).

---

## Pruebas

- **Unitarias (Vitest, 25 pruebas)**: score y prioridad, rangos inválidos, override, Eisenhower, fechas/semana ISO, bloqueo → compromiso → en gestión, reprogramar (fecha original + contador + motivo), cumplir/escalar, vencidos, regla 8, Weekly completa semana 1 → semana 2 con historial intacto, exportar/restaurar/importar, rechazo de JSON inválido, CSV, persistencia IndexedDB entre "aperturas", adaptador REST, datos demo y cumplimiento.
- **E2E (Playwright, 8 pruebas)**:
  - `weekly-flow.spec.ts` — **simulación completa de dos semanas desde la UI** (sección 55): responsables, las 4 áreas actualizan, Weekly de 7 pasos (Eisenhower, recálculo, override, detectar, destrabar, comprometer, decisión), cierre con ✓ TODO CLARO, resumen copiado al portapapeles y descargado, respaldo JSON; semana 2: revisar (cumplir con resolución de bloqueo, reprogramar validando motivo, escalar), nuevo proyecto, cierre de proyecto, segunda Weekly cerrada, **semana 1 sin cambios**, evolución sin duplicar, recarga del navegador, importación inválida rechazada y restauración del respaldo.
  - `demo-and-ux.spec.ts` — KPIs clicables, alertas, búsqueda global, Mis compromisos, dependencias, historial, aislamiento demo/principal, reinicio de demo con confirmación, drag & drop en Eisenhower y Kanban (incluida la regla de compromiso), y **sin scroll horizontal** en todas las vistas y los 7 pasos del Modo Junta a 1920×1080, 1440×900, 1366×768, 1024×768 y 390×844.

---

## Despliegue

La app es una **SPA estática**: `npm run build` genera `dist/`, que puede servir cualquier servidor web. Las rutas (`/proyectos`, `/weekly/junta`, …) deben devolver `index.html`:

| Servidor | Configuración incluida |
|---|---|
| Nginx | `deploy/nginx.conf` (fallback SPA, caché de assets, gzip) |
| Apache | `public/.htaccess` (se copia a `dist/`) |
| Netlify | `public/_redirects` |
| Vercel | `vercel.json` |
| Docker | `Dockerfile` (build + Nginx) → `docker build -t alignment-unblock . && docker run -p 8080:80 alignment-unblock` |

**Subdirectorio**: `BASE_PATH=/alignment/ npm run build` (y ajusta `RewriteBase` en `.htaccess` o el `location` de Nginx).

Variables de entorno (ver `.env.example`, ninguna obligatoria y **sin secretos**):

| Variable | Uso |
|---|---|
| `BASE_PATH` | Subdirectorio de publicación (por defecto `/`) |
| `VITE_STORAGE` | `indexeddb` (por defecto) o `rest` |
| `VITE_API_URL` | URL base de la API cuando `VITE_STORAGE=rest` |

---

## Backend e integraciones futuras

### Backend

`src/data/adapters/restAdapter.ts` ya traduce cada cambio a:

```
GET    /api/projects        POST /api/projects        PUT /api/projects/:id      DELETE /api/projects/:id
GET    /api/weeks           POST /api/weeks           PUT /api/weeks/:id
GET    /api/blocks          POST /api/blocks          PUT /api/blocks/:id
GET    /api/commitments     POST /api/commitments     PUT /api/commitments/:id
GET    /api/sessions        POST /api/sessions        PUT /api/sessions/:id
… areas, people, weekly-updates, area-updates, decisions, snapshots, settings
POST   /api/import (restaurar)      DELETE /api/data (vaciar)
```

Para conectar PostgreSQL / Supabase / MySQL / Firebase: implementar esos endpoints (cada colección es una tabla con las columnas del modelo; `historial`/`comentarios` como JSONB), y compilar con `VITE_STORAGE=rest VITE_API_URL=https://…/api`. El adaptador acepta un `getToken()` para autenticación (p. ej. **Microsoft Entra ID**). La matriz de permisos (`domain/permissions.ts`) debe aplicarse también en el servidor.

### Integraciones (preparadas conceptualmente, no implementadas)

- **Microsoft Teams / Power Automate**: el resumen ya se genera en Markdown compatible con Teams; un webhook o flujo puede publicarlo al cerrar la Weekly.
- **Outlook / Calendario / Microsoft Graph**: cada compromiso tiene fecha + hora + responsable (con correo opcional en *Responsables*) → candidatos a eventos o recordatorios.
- **Notificaciones**: las alertas (`domain/alerts.ts`) ya calculan vencidos, vence hoy, P1 bloqueado, bloqueo sin compromiso, área sin actualizar, reprogramados varias veces.
- **Power BI**: CSV/JSON exportables hoy; con backend, conexión directa a la base.
- **Trello / CRM**: `Project` y `Commitment` tienen ids estables para sincronización.

---

## Limitaciones conocidas

- **Un solo navegador por espacio**: sin backend, la información no se comparte entre equipos/personas. Para trabajo colaborativo real se necesita el backend REST (el adaptador está listo; el servidor no está incluido).
- **Usuario activo sin autenticación**: se elige en la barra superior; los permisos orientan la interfaz pero no son una barrera de seguridad.
- El borrado de datos del navegador elimina la información: usar **Generar respaldo** con regularidad.
- No se envían correos ni notificaciones push (no hay infraestructura en V1).
- La tipografía *Circular* no se incluyó por licencia; se usa DM Sans (OFL).
- Probado en Chromium (escritorio y emulación de tablet/móvil). Otros navegadores modernos deberían funcionar pero no se automatizaron pruebas en Firefox/Safari.
- El drag & drop táctil en tablets depende del soporte del navegador; siempre existe el selector equivalente en cada tarjeta.

---

## Roadmap

- **V2**: backend (Supabase/PostgreSQL) con autenticación Microsoft Entra ID y permisos aplicados en servidor; edición simultánea.
- Publicación automática del resumen en un canal de **Teams** al cerrar la Weekly.
- Recordatorios de compromisos por **Outlook/Graph** (vence hoy / vencido).
- Tendencias en Historial (cumplimiento por área y dependencias recurrentes por trimestre).
- Plantillas de proyecto recurrentes y vinculación con KPIs trimestrales.
