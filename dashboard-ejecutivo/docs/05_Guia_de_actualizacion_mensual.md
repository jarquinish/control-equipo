# Entregable 5 · Guía breve de actualización mensual

Tiempo estimado: 20–30 minutos al recibir el reporte contable del mes.

## Antes de empezar
1. Abre el dashboard (doble clic en el archivo `.html`) en **Chrome, Edge o Firefox** actualizados, siempre en la misma computadora y el mismo navegador.
2. Haz clic en **Respaldar** y guarda el `.json` con la fecha (respaldo previo a la actualización).

## 1 · Reporte contable (gasto real)
1. Recibe de Contabilidad el Excel del ejercicio presupuestal (mismo formato que «Ejercicio de presupuesto 2026 a Agosto»).
2. **Actualizar contable** → elige el archivo.
3. Revisa la vista previa:
   - **Corte detectado** (último mes con gasto). Debe ser el mes que esperas.
   - «✓ Las categorías cuadran con el total del reporte». Si dice ✕, **no apliques**: pide a Contabilidad el archivo corregido.
   - La partida de cada categoría. Si aparece una categoría nueva, elige su partida o déjala «Sin partida» (aparecerá en Conciliación como diferencia por resolver).
4. **Aplicar reporte**. El indicador superior cambia a «CORTE CONTABLE OFICIAL: <MES> 2026».
5. Ve a **Conciliación y trazabilidad** y confirma que las validaciones de cuadre estén en ✓.

> Los compromisos capturados para un mes que ya tiene gasto real dejan de contarse en la planeación: revísalos en el módulo 3 y elimínalos o muévelos.

## 2 · Reclasificaciones
- Si Contabilidad formaliza una reclasificación, en Conciliación haz clic en su estado → **Confirmado** con el motivo (p. ej. «Póliza XXXX del 15-nov»), y actualiza la «Validación contable» con ✎.
- Si la reclasificación ya viene aplicada en el nuevo Excel, avisa para retirarla de la configuración y no duplicarla (la validación «Las reclasificaciones no alteran el gasto total» seguirá en ✓, pero el gasto de la partida destino quedaría contado dos veces).

## 3 · Compromisos de cierre (septiembre–diciembre)
- Captura o importa (Plantilla CSV) los compromisos firmados y los proyectos pendientes. Usa el estado **Confirmado** sólo con contrato u orden de compra.
- Revisa el **saldo proyectado** por partida y las alertas de sobreejercicio.

## 4 · Resultados y KPI
- Cuando una gerencia entregue el archivo fuente de un indicador marcado como pendiente (SOC TV, Plataforma SOC, Branding de oficinas), cambia su estado a **Confirmado** indicando el archivo en el motivo.
- Las cifras de indicadores nuevos (otro periodo) requieren regenerar el dashboard con el script `scripts/extraer_datos.py` (ver README) para conservar la trazabilidad a su archivo.

## 5 · Gestión por gerencia y decisiones
- Importa con la Plantilla CSV los registros que cada gerencia valide.
- Registra o actualiza las decisiones acordadas en la reunión de Dirección y marca las resueltas con su resolución.

## Al terminar
1. **Respaldar** de nuevo (respaldo posterior) y guarda ambos `.json` en la carpeta compartida del área.
2. Para compartir la vista: **Imprimir / PDF**.
3. Para trabajar en otra computadora: abre el mismo `.html` allí y usa **Restaurar** con el último respaldo.

## Límites del guardado local
- Lo capturado vive sólo en este navegador y esta computadora; **no se sincroniza** entre personas ni equipos.
- Se pierde si se borran los datos del navegador o en ventanas privadas. Si aparece el aviso rojo «Este navegador no permite guardar», descarga un respaldo antes de cerrar.
- Capacidad aproximada: 5 MB (miles de registros); suficiente para el ejercicio 2026.
