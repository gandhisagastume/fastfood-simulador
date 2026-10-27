# Criterios de Evaluación y Lista de Cotejo para Proyecto de Simulación y Analítica de Datos (911)

> Transcripción fiel del PDF `Criterios de Evaluación y Lista de Cotejo - Proyecto Simulación 911.pdf` (4 páginas).
> Rúbrica redactada para el tema de ejemplo: "Simulación y Analítica de Datos en el Despacho de Llamadas de Emergencia (911) con Datos Abiertos de Kaggle", curso de Simulación.

## Instrucciones de uso para el evaluador

- **Sí (Cumplido):** asigna el 100% del puntaje correspondiente al criterio.
- **P (Parcial):** asigna el 50% del puntaje si cumple con el fondo pero falta detalle o rigor conceptual.
- **No (No Cumplido):** asigna 0 puntos.

## 1. Dimensiones evaluativas principales

| Dimensión | Peso | Qué evalúa |
|-----------|------|------------|
| Calidad Operativa y Manejo de Datos | 30% | Rigor en el tratamiento de los datos abiertos desde Kaggle, preprocesamiento, limpieza y Análisis Exploratorio de Datos (EDA). |
| Rigor en el Modelado de Simulación y Estadística | 30% | Precisión conceptual en el ajuste de distribuciones de probabilidad (Poisson no homogéneo) y construcción del modelo de eventos discretos (SimPy/Arena/ProModel). |
| Visualización, Métricas y Data Storytelling | 20% | Calidad del dashboard interactivo (Power BI/Tableau/Plotly), definición de KPIs operativos y capacidad narrativa basada en datos. |
| Coherencia Estratégica, Entregables y Solución | 20% | Alineación del problema con la propuesta de solución, análisis costo-beneficio y cumplimiento formal de documentos y exposiciones. |

## 2. Lista de cotejo por fases del proyecto

### Fase 1: Fundamentación y Propuesta Documental (25 puntos)

| No. | Criterio de evaluación | Puntaje máx. | Sí | P | No |
|-----|------------------------|--------------|----|---|----|
| 1.1 | Delimitación y contexto histórico del sistema 911 y dataset de Kaggle (Montgomery, PA). | 3 pts | | | |
| 1.2 | Planteamiento claro del problema de balance entre costo y tiempo de espera. | 4 pts | | | |
| 1.3 | Objetivo general y específicos medibles y bien estructurados. | 4 pts | | | |
| 1.4 | Clasificación explícita de variables (numéricas, categóricas, temporales). | 4 pts | | | |
| 1.5 | Ficha técnica del dataset (fuente, licencia, volumen, fechas y tamaño). | 3 pts | | | |
| 1.6 | Documentación explícita de supuestos para datos no presentes (tiempos de servicio/operadores). | 4 pts | | | |
| 1.7 | Entrega formal de informe PDF (5-8 págs) y presentación breve (8-10 min). | 3 pts | | | |

### Fase 2: Recolección, Análisis y Simulación de Datos (35 puntos)

| No. | Criterio de evaluación | Puntaje máx. | Sí | P | No |
|-----|------------------------|--------------|----|---|----|
| 2.1 | Limpieza, tratamiento de nulos/outliers y entrega de dataset limpio con diccionario de datos. | 5 pts | | | |
| 2.2 | Análisis Exploratorio de Datos (EDA) completo por hora, día y tipo de emergencia (EMS/Fire/Traffic). | 5 pts | | | |
| 2.3 | Ajuste estadístico de distribuciones (Poisson no homogéneo / exponenciales). | 5 pts | | | |
| 2.4 | Script/Notebook funcional y reproducible del modelo de simulación del escenario As-Is. | 5 pts | | | |
| 2.5 | Validación del modelo simulado contrastado con el comportamiento de los datos reales. | 5 pts | | | |
| 2.6 | Modelado e implementación de escenarios alternativos (To-Be). | 5 pts | | | |
| 2.7 | Tablero interactivo (Dashboard) con KPIs (espera, cola, utilización, SLA, abandono). | 5 pts | | | |

### Fase 3: Resultados, Soluciones y Conclusiones (40 puntos)

| No. | Criterio de evaluación | Puntaje máx. | Sí | P | No |
|-----|------------------------|--------------|----|---|----|
| 3.1 | Análisis comparativo cuantitativo entre escenarios As-Is y To-Be. | 6 pts | | | |
| 3.2 | Análisis costo-beneficio simplificado de las mejoras operativas o tecnológicas. | 6 pts | | | |
| 3.3 | Propuesta de dotación de personal/turnos basada 100% en hallazgos de datos. | 7 pts | | | |
| 3.4 | Conclusiones fundamentadas, análisis de limitaciones y trabajo futuro. | 5 pts | | | |
| 3.5 | Informe final PDF integrado (incisos 1-9 completados rigurosamente). | 6 pts | | | |
| 3.6 | Presentación ejecutiva final con data storytelling (12-15 min). | 6 pts | | | |
| 3.7 | Reporte de autoevaluación grupal y desglose de trabajo de cada integrante. | 4 pts | | | |

## 3. Resumen de calificación final

| Fase de evaluación | Puntaje máximo | Puntaje obtenido |
|--------------------|----------------|------------------|
| Fase 1: Fundamentación y Propuesta Documental | 25 pts | |
| Fase 2: Datos, Simulación y Dashboard | 35 pts | |
| Fase 3: Resultados, Soluciones e Informe Final | 40 pts | |
| **TOTAL** | **100 pts** | |

**Observaciones generales del evaluador:**

______________________________________________________________________

______________________________________________________________________
