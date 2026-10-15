# Inventario en Excel · instrucciones para las gerencias

Para Contenido, Diseño, Marketing Digital y SOC Store. La plantilla se descarga en la herramienta: **Actualizar mi área → Importar Excel → Descargar plantilla**. Una hoja por gerencia; el nombre de la hoja debe ser el de la gerencia.

## Qué llena la gerencia

| Columna | Cómo llenarla |
|---|---|
| **ID** | El que ya tiene el proyecto (p. ej. `CON-01`). **No lo cambies ni lo reutilices**: es lo que evita duplicados. Proyecto nuevo → ID nuevo. |
| **Proyecto / iniciativa / pendiente** | Nombre claro. Si pertenece a una iniciativa de la matriz, inclúyela en el nombre o en *Proyecto padre / frente* (p. ej. «Convención SOC – escaletas», frente «SOC TV»). |
| **Tipo propuesto** | Proyecto / Subproyecto se cargan como proyecto; Actividad u Operación recurrente se agrupan en su frente. |
| **Proyecto padre / frente** | Iniciativa o frente al que pertenece. |
| **Solicitante** *(nueva)* | Quién pide el trabajo. Escribe **Brokers**, **Dirección Comercial** o **Dirección General** cuando aplique: así entra a la matriz de urgencias. Si sólo lo mencionas en el nombre, queda *por validar*. |
| **Impacto** | Operación · Estrategia · Negocio. |
| **Urgencia** | Puede esperar · Debe avanzar esta semana · Deadline inmediato. |
| **Dependencia** | Autónomo · Depende de otra área/persona · Varias áreas / Dirección / tercero. |
| **Fecha compromiso entrega** | AAAA-MM-DD. Sin fecha, la prioridad operativa se marca *requiere validación*. |
| Siguiente acción, responsables, bloqueo, etc. | Igual que antes. |
| **Validación gerencia** | Validado o Modificado para importar. |

## Qué NO llena la gerencia (sólo Dirección)

*Prioridad estratégica (Dirección)*, *Motivo prioridad estratégica*, *Prioridad operativa (Dirección)*, *Motivo prioridad operativa*, *Iniciativa (matriz)* y *Validación directiva*. Si una gerencia las llena, la herramienta las ignora y lo avisa. La prioridad final (E, O y clasificación) **la calcula la herramienta**: no hay que escribirla.

## Cómo se clasifica

- **Estratégica (E)**: P1 si es una iniciativa estratégica de tu gerencia en la matriz; si no, Negocio → P2 (candidato a P1), Estrategia → P2, Operación → P3.
- **Operativa (O)**: P1 si es urgente según la matriz; si no, Urgencia + Dependencia + cercanía de la fecha + bloqueo.
- **P1 Crítico** (E y O en P1) · **P1 Urgente** · **P1 Estratégico** · P2 · P3.

Matriz oficial vigente:

| Gerencia | P1 estratégico | P1 urgente |
|---|---|---|
| Diseño y Contenido | Campaña Franquicias · Campaña ¿Qué es SOC? · SOC TV · Campaña de Marketing Digital | Convención SOC · SOC TV · Brokers · Dirección Comercial · Dirección General |
| Marketing Digital | SOC Leads · Precalificador · Costo Cero | Precalificador · Automatización · Convención SOC · SOC TV · AULA |
| SOC Store | Campaña para Venta · Venta Brokers · Dirección Comercial | Convención SOC · Workshop · AULA · Campañas Temáticas · Cobros Extraordinarios |

## Cargar y volver a cargar

1. **Importar Excel** → elige el archivo → revisa la vista previa (cada fila muestra su clasificación y avisos) → **Importar**.
2. ¿Ya cargaste el archivo y cambiaste la ponderación? Vuelve a importarlo con **Actualizar prioridades**: sólo se actualizan impacto, urgencia, dependencia, solicitante y frente de los proyectos existentes; no se duplican ni cambian sus ID.
3. Si Dirección ya **cerró el acuerdo** de un proyecto, su ponderación no cambia desde el Excel ni desde la pantalla; pide el ajuste a Dirección. Avance, compromisos y bloqueos siguen abiertos.
4. Archivos con el formato anterior siguen funcionando. La columna *Prioridad validada* ya no se aplica: queda como *nota por revalidar* para Dirección.
5. No borres columnas ni cambies los encabezados.
