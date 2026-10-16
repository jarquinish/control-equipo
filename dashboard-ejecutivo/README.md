# Dashboard Ejecutivo · Marketing y Posicionamiento SOC 2026

Archivo HTML único (se abre con doble clic, sin servidor ni servicios externos) con 7 módulos: Resumen ejecutivo, Presupuesto y ejecución, Planeación de cierre, Resultados y KPI, Gestión por gerencia, Conciliación y trazabilidad, y Decisiones de Dirección.

## Estructura

| Ruta | Contenido | En git |
|---|---|---|
| `src/dashboard.html`, `src/app.js` | Interfaz y lógica (sin datos) | Sí |
| `scripts/extraer_datos.py` | Lee los Excel fuente y genera `salida/fuentes.json` (sólo cifras agregadas, sin datos personales) | Sí |
| `scripts/construir.py` | Valida el cuadre del presupuesto y arma el HTML único | Sí |
| `scripts/md_a_html.py` | Documentos de soporte → HTML → Word (LibreOffice) | Sí |
| `pruebas/probar.mjs` | Pruebas funcionales y financieras en navegador (`file://`) | Sí |
| `docs/` | Diccionario de datos y guía de actualización mensual | Sí |
| `datos/config-2026.json` | Presupuesto, movimientos, reclasificaciones, KPI sin archivo y gerencias | **No** (cifras y nombres del equipo) |
| `salida/` | HTML final, auditoría, pendientes, checklist | **No** |

## Generar el dashboard

```bash
# 1. Extraer cifras de los Excel (requiere openpyxl)
python3 -I scripts/extraer_datos.py <ruta_openpyxl> salida/fuentes.json \
  --contable Ejercicio_de_presupuesto_2026_a_Agosto.xlsx --franquicias Metricas_Trimestrales_Franquicias_2026.xlsx \
  --socleads Informe_SOCLeads.xlsx --store SOC_STORE.xlsx --precalificador precalificador-datos-homologados.xlsx
# 2. Armar el HTML (falla si las 20 partidas + reserva no suman el total)
python3 -I scripts/construir.py salida/fuentes.json datos/config-2026.json \
  ../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2 salida/Dashboard_Ejecutivo_MKT_SOC_2026.html
# 3. Probar
node pruebas/probar.mjs salida/Dashboard_Ejecutivo_MKT_SOC_2026.html <excel_contable_de_prueba.xlsx> <carpeta_capturas>
```

El corte contable mensual no requiere regenerar: se carga desde el propio dashboard (**Actualizar contable**). Ver `docs/05_Guia_de_actualizacion_mensual.md`.

## Reglas de diseño

- Gasto real sólo del reporte contable; meses posteriores al corte = compromisos/planeación (nunca gasto real).
- Reclasificaciones para el análisis directivo con neto $0; no se asumen formalizadas.
- Módulos independientes: el cálculo financiero no lee KPI, gestión ni decisiones; no hay ROI ni calificaciones individuales.
- Todo registro tiene estado Confirmado / Pendiente de validación / Propuesta.
