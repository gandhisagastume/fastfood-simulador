# FastFood Sim

Analítica de datos y simulación Monte Carlo sobre los menús de 6 cadenas de comida rápida
(`FastFoodNutritionMenuV2.csv`, 1,148 filas). Proyecto del curso Modelación y Simulación, USAC CUNOR.

El CSV no trae tiempos ni llegadas, así que no hay colas: el modelo remuestrea el menú real y compara
escenarios (por cadena, con filtros, combos, umbrales y tipo de producto) contra el menú completo.

- `web/`: aplicación (Go + PostgreSQL + Astro/React, todo en Docker). Instrucciones en [`web/README.md`](web/README.md).
- `PROYECTO FINAL/FastFoodNutritionMenuV2.csv`: dataset original, el seeder lo carga a la DB.
- `PROYECTO FINAL/MAPEO-RUBRICA-FastFood.md`: cómo se corresponde cada criterio de evaluación con lo que hace la app.

## Correr

```bash
cd web
docker compose up --build -d
```

Panel en http://localhost:4322 y API en http://localhost:8080/api/health.

Las credenciales de `docker-compose.yml` y `web/.env.example` son solo para desarrollo local: cámbialas antes de exponer el servicio.

Los resultados describen el menú publicado, no ventas ni consumo real.
