# Modelo de priorización · Dirección de Posicionamiento

Actualización del modelo de prioridades de *Alignment & Unblock* **sin reconstruir la herramienta**: se conservan todas las vistas, el historial, los IDs y el formato de Excel anterior.

## 1. Diagnóstico (modelo anterior)

| Hallazgo | Efecto |
|---|---|
| Una sola prioridad: `Score = Impacto + Urgencia + Dependencia` (8–9 P1). | Lo estratégico y lo urgente competían en el mismo número: un proyecto de marca con urgencia baja nunca llegaba a P1, y cualquier urgencia alta sí. |
| La matriz oficial de P1 por gerencia no existía en la herramienta. | Las prioridades de Dirección dependían de que cada gerente subiera la ponderación «a mano». |
| El ajuste de Dirección era un valor único, motivo opcional y sin historial. | No quedaba rastro de quién cambió qué ni por qué. |
| Límite de P1 global (6) para las cuatro gerencias. | No detectaba concentración de P1 en una sola gerencia. |
| Nombres como «Convención», «Convención SOC 2026» o «SOC Leads+» no se reconocían como la misma iniciativa. | Imposible vincular el trabajo con la matriz. |
| Cualquiera con permiso de edición podía cambiar la ponderación después de la Weekly. | Los acuerdos de prioridad podían deshacerse sin Dirección. |

## 2. Propuesta (aprobada)

- **Dos ejes independientes**: prioridad **Estratégica** (E) y **Operativa / urgente** (O), cada una P1/P2/P3.
  - E = P1 si el proyecto pertenece a una iniciativa estratégica de la matriz de su gerencia. Fuera de la matriz, máximo P2 automático: Negocio → P2 *candidato a P1, requiere validación directiva*; Estrategia → P2; Operación → P3.
  - O = P1 si pertenece a la matriz de urgencias. Fuera de ella: Urgencia (1–3) + Dependencia (1–3) + fecha compromiso (+2 vencida o ≤ 7 días, +1 entre 8 y 14) + bloqueado (+1). ≥ 7 → P1, 5–6 → P2, ≤ 4 → P3. Sin fecha: +0 y aviso *requiere validación* (no se inventan datos).
- **Clasificación integrada**: P1 Crítico (E y O = P1) · P1 Urgente (sólo O) · P1 Estratégico (sólo E) · P2 · P3.
- **Orden de atención** (niveles 1–5 en ese orden). Un P1 Estratégico sin avance ni compromiso abierto en **7 días** sube al nivel 2 (*desatendido*), para que las urgencias no lo posterguen indefinidamente. Desempates: vencido, fecha más cercana, bloqueado, dependencia, impacto.
- **Matriz directiva** editable sólo por Dirección; lo que marca es directivo y **no se degrada automáticamente**.
- **Reconocimiento de nombres** sin acentos, mayúsculas ni años, por nombre o frente. *Brokers, Dirección Comercial y Dirección General* se reconocen por el nuevo campo **Solicitante**; si sólo se mencionan en el nombre, quedan **por validar** (Dirección valida o descarta). Nunca se fusionan proyectos: cada uno conserva nombre e ID.
- **Validación directiva**: Dirección fija E u O con motivo obligatorio; prevalece sobre el cálculo; se muestra *calculada → Dirección → final*; todo queda en una **bitácora inalterable** (valor anterior, nuevo, motivo, fecha, responsable, origen: pantalla / Excel / Weekly).
- **Límites por gerencia**: máximo 3 P1 Críticos + Urgentes y 3 P1 Estratégicos (configurable). Al excederlos, alerta y la pregunta de la regla 8: *¿qué prioridad desplaza?*
- **Acuerdo de prioridades**: después de la Weekly, Dirección lo cierra. Las gerencias siguen editando avance, estado, responsable, fechas, compromisos y bloqueos; ya no impacto, urgencia, dependencia, solicitante ni frente. Sólo Dirección los cambia o reabre el acuerdo.
- **Compatibilidad**: el `prioridadFinal` (P1/P2/P3) sigue existiendo para KPIs, historial y reportes; la columna *Prioridad validada* del Excel anterior no se aplica y queda como **nota por revalidar**.

## 3. Cambios técnicos

| Pieza | Cambio |
|---|---|
| `src/domain/priority.ts` (nuevo) | Matriz oficial, normalización de nombres, reconocimiento de iniciativas, clasificación por eje con motivo y fuente, integración, desatendido y orden de atención. |
| `src/services/priorityService.ts` (nuevo) | Validación directiva, desplazamiento (regla 8), vínculos con la matriz, cierre/reapertura del acuerdo, edición de la matriz, bitácora y migración única del modelo anterior. |
| `src/services/projectService.ts` | Campos *Solicitante* y *Frente*; recálculo de la clasificación; bloqueo de la ponderación con acuerdo cerrado. |
| `src/state/app.tsx` | Recálculo automático (al abrir, tras cambios y al cambiar el día) por quien puede editar proyectos; `useAttention()`. |
| Pantallas | Inicio (P1 Crítico, carga por gerencia, alertas nuevas), Proyectos (Orden, Clasificación, E, O y filtros por eje), ficha (*¿Por qué esta prioridad?*, iniciativas por validar, acuerdo, bitácora), Paso 4 de la Weekly (ambos ejes, cerrar acuerdo, límites por gerencia), formularios (Solicitante, Frente, vista previa), Configuración (matriz directiva y criterios nuevos). |
| Excel | Columnas nuevas (Solicitante, prioridades y motivos de Dirección, Iniciativa, Validación directiva), vista previa con E/O/clasificación, opción *Actualizar prioridades* de proyectos existentes sin duplicar. Los archivos anteriores siguen funcionando. |
| CSV | Columnas nuevas **al final** (no cambia el orden de las anteriores) y CSV de la bitácora. |
| Supabase `0002_prioridad_dos_ejes.sql` | Colección `priorityLog`; bitácora inalterable; sólo Dirección cambia prioridad directiva, vínculos y acuerdo; con acuerdo cerrado el servidor rechaza cambios de ponderación de las gerencias; vistas `au_projects_v` (columnas nuevas al final) y `au_priority_log_v`. |

**Orden de despliegue:** 1) ejecutar `0002_prioridad_dos_ejes.sql` en Supabase; 2) reemplazar la plantilla de HubSpot; 3) Dirección entra primero (convierte los ajustes anteriores en *nota por revalidar* y calcula la clasificación de todo).

## 4. Pruebas

Automáticas (todas pasan): 58 unitarias, 10 de navegador, multiusuario sobre Supabase local, plantilla de HubSpot y seguridad SQL.

| Caso obligatorio | Resultado |
|---|---|
| SOC TV en Contenido | **P1 Crítico** (matriz estratégica y de urgencias); no se degrada aunque baje su ponderación. |
| Campaña Franquicias en Diseño | **P1 Estratégico** (operativa por criterios). |
| Precalificador (también «Precalificador hipotecario») en Marketing Digital | **P1 Crítico**. En Contenido no está en la matriz: se pondera por criterios. |
| Convención («CONVENCIÓN SOC 2026») en SOC Store | **P1 Urgente** (sólo matriz de urgencias). |
| Proyecto fuera de la matriz | Máximo P2 automático; con impacto Negocio, aviso *candidato a P1*; puede ser P1 Urgente si su puntuación operativa llega a 7. |

También probado: variantes de nombre sin confundir iniciativas («SOC Store» ≠ «SOC TV», «Paula» ≠ «AULA»), Brokers por solicitante (firme) vs. en el nombre (por validar), proyectos de la misma iniciativa sin fusionarse, motivo obligatorio y bitácora, sólo Dirección valida, acuerdo cerrado en la app y en el servidor, migración del modelo anterior, orden de atención y desatendido, importación con columnas nuevas (Dirección vs. gerencia), reimportación sin duplicados ni cambios de ID o historial, CSV compatible.

**Archivo real de Contenido** (34 proyectos): se importa completo. Resultado: 4 P1 Crítico (SOC TV y la masterclass de franquicias), 16 P1 Urgente, 2 P1 Estratégico, 12 P2. **Hallazgo**: Contenido queda con 20 P1 Críticos + Urgentes frente al límite de 3 — 11 vienen de la matriz (Convención y SOC TV) y 9 de fechas compromiso vencidas o muy próximas. La herramienta lo alerta; es una decisión de Dirección (agrupar los entregables de Convención en un frente, revalidar fechas o ajustar el límite).

## 5. Resumen ejecutivo

La herramienta ya distingue **lo estratégico de lo urgente**. La matriz oficial de la Dirección de Posicionamiento define los P1 de cada gerencia y nadie la degrada por cálculo; lo que queda fuera de ella llega como máximo a P2 y se marca para validación. Cada proyecto explica su prioridad, tiene un orden de atención (Crítico → Urgente → Estratégico → P2 → P3) y un P1 Estratégico olvidado una semana sube de nivel. Dirección valida con motivo, todo queda en una bitácora que no se puede alterar y, al cerrar el acuerdo de la Weekly, la ponderación sólo se cambia a través de Dirección. El historial, los IDs y los archivos de Excel anteriores siguen funcionando.
