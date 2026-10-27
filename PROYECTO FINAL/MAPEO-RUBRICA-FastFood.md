# Mapeo de la rúbrica (911) al proyecto de comida rápida

La rúbrica `Criterios de Evaluación y Lista de Cotejo - Proyecto Simulación 911` está escrita para llamadas de emergencia
con tiempos, colas y operadores. Este proyecto analiza el menú de 6 cadenas (`FastFoodNutritionMenuV2.csv`): no hay fechas,
horas, llegadas ni tiempos de servicio, así que cada criterio se traduce a su equivalente. Solo se incluye lo que resuelve el programa;
informes, presentaciones y autoevaluación (1.7, 3.5, 3.6, 3.7) se entregan aparte.

| Criterio | Equivalente en este proyecto | Dónde está |
|---|---|---|
| 2.1 Limpieza, nulos/outliers, dataset limpio y diccionario | Reglas de limpieza, 15 filas de sección, 7 duplicados, 45 censurados «<5». Atípicos por Tukey señalados, no borrados. CSV limpio y diccionario descargables | `/datos`, `GET /api/quality/report`, `/api/dictionary`, `/api/export/*.csv` |
| 2.2 EDA por hora, día y tipo | Sin variables temporales (declarado). Por cadena y por tipo de producto (bebidas, postres, complementos, platos): franjas, histogramas, cajas con atípicos, correlaciones, dispersión, mapa de calor, ranking | Panel › Explorar |
| 2.3 Ajuste de distribuciones | Normal, lognormal, exponencial y gamma con KS (D contra valor crítico). Poisson y exponencial de llegadas no aplican: no hay llegadas. Si ninguna ajusta, se usa la empírica y la app lo dice | Panel › Simular › Ajuste, `GET /api/fit` |
| 2.4 Script reproducible As-Is | Motor Monte Carlo en Go con semilla; cada corrida guarda escenario, N, semilla y filtros, y se reproduce con el `curl` mostrado. Verificación independiente en `web/scripts/validar_pandas.py` | Panel › Simular, `POST /api/simulate` |
| 2.5 Validación contra datos reales | Media simulada contra real por grupo con z, IC 95% y KS, para 1,000, 5,000, 10,000 y 20,000 repeticiones | Panel › Simular › Validación, `GET /api/validate` |
| 2.6 Escenarios To-Be | D filtros propios, E3 bajo sodio, E4 alta proteína, E1 combo de 3, E2 umbral, E5 por tipo de producto | Panel › Simular |
| 2.7 Dashboard con KPIs | Equivalentes a espera, cola, SLA y abandono: mediana, P95, % de productos sobre el umbral (≈30% del valor diario FDA) y costo, beneficio y balance nutricional | Panel › Explorar |
| 3.1 As-Is contra To-Be | Cada escenario con filtros se compara con el menú completo (misma semilla): productos que quedan, mediana, P95 y cambio de la media por grupo | Panel › Simular |
| 3.2 Costo-beneficio | Costo nutricional (calorías, sodio, azúcares, grasa saturada) y beneficio (proteína, fibra) en % del valor diario. Sin precios: el CSV no los trae | Panel › Propuesta, `GET /api/recommend` |
| 3.3 Propuesta basada en datos | Equivalente a la dotación de personal: regla de selección recomendada, dónde se concentra el exceso y mejor comida por cadena | Panel › Propuesta |
| 3.4 Limitaciones | Avisos en cada vista y notas del diccionario (abajo, resumidas) | Panel, `/datos` |

## Limitaciones que conviene declarar en el informe

- Es el menú publicado: no hay ventas, frecuencia de compra ni precios. Los resultados describen el menú, no el consumo real.
- Los umbrales (600 kcal, 800 mg, etc.) son criterio del equipo, cerca del 30% del valor diario de la FDA (dieta de 2 000 kcal). Para los azúcares se usa 50 g como referencia aunque la FDA solo la fija para los añadidos.
- El tipo de producto se infiere por palabras clave del nombre: puede equivocarse en casos raros. Los batidos cuentan como bebidas.
- Costo, beneficio y balance dependen de la fórmula elegida (promedio simple de %VD). Otra ponderación puede cambiar qué regla sale recomendada.
- El balance de casi todo el menú es negativo: la mayoría de los productos cuesta más de lo que aporta. La recomendación mejora el balance, pero no lo vuelve positivo.
- Monte Carlo empírico remuestrea el mismo menú: la validación comprueba la implementación, no predice nada nuevo.
- «<5» se imputa como 2.5 (45 productos con al menos un valor censurado).
- El dataset no trae autor, licencia, periodo ni cobertura: figuran como «no especificado».

## Cómo comprobarlo

1. `docker compose up --build -d` en `web/` y abrir http://localhost:4322.
2. `python web/scripts/validar_pandas.py`: rehace la limpieza y las estadísticas con pandas y las compara con la API (diferencia máxima 1e-13).
3. Pruebas del backend: ver `web/README.md`.
