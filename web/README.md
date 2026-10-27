# FastFood Sim — web

Astro + React + TS · Go 1.22 · PostgreSQL 16 · Docker.

## Correr con Docker Desktop

```powershell
cd web
docker compose up --build -d
docker compose logs seeder   # seed CSV -> Postgres
```

- Frontend: http://localhost:4322
- Backend: http://localhost:8080/api/health
- pgAdmin: http://localhost:5050 (admin@example.com / admin)
- Postgres: localhost:5434 (sim/sim/sim)

## Dev local frontend

```powershell
cd web/frontend
npm install
npm run dev
```

Env: `PUBLIC_API_URL=http://localhost:8080`.

## Qué hace

Una sola pantalla (`/`) con tres secciones: **Explorar** (distribución, forma, atípicos, correlaciones, relación,
perfil y ranking), **Simular** (Monte Carlo con comparación As-Is contra To-Be, ajuste de distribuciones y
validación) y **Propuesta** (concentración del exceso, reglas con costo-beneficio y mejor comida por cadena).
`/datos` trae el reporte de limpieza, el diccionario de datos y las descargas. Cada gráfico lleva una «i» que explica qué muestra.

Tras cambiar código hay que reconstruir: `docker compose up --build -d` (si no, Docker sirve la imagen vieja).
Para volver a sembrar la DB desde el CSV: `docker compose down -v && docker compose up --build -d`.

## API

- GET /api/health, /api/companies, /api/products, /api/quality/completeness, /api/stats/descriptive?variable=
- POST /api/simulate {scenario A|B|C|D|E1..E5, variable, n, seed, over, filter}
- GET /api/runs, /api/runs/{id}, /api/dashboard/summary
- GET /api/dictionary, /api/quality/report: diccionario con calidad y reporte de limpieza (atípicos de Tukey, duplicados)
- GET /api/fit?variable=&company=: normal, lognormal, exponencial y gamma con prueba de Kolmogorov-Smirnov
- GET /api/validate?variable=: media simulada contra real (z, IC 95%, KS) para 1,000 a 20,000 repeticiones
- GET /api/recommend: reglas de selección con costo-beneficio, concentración por cadena y mejor comida por cadena
- GET /api/export/dataset.csv, /api/export/dictionary.csv

Escenarios: A global, B cadenas con igual peso, C por cadena, D filtros propios, E1 combo de 3, E2 umbral,
E3 bajo sodio (<800 mg), E4 alta proteína (>=20 g), E5 por tipo de producto (bebidas, postres, complementos, platos).
Variables extra: `cost` y `benefit` (% del valor diario FDA, dieta de 2 000 kcal) y `balance` (beneficio menos costo).

Reglas de limpieza: header multilínea normalizado, "" -> NULL, " g" strip, "<5" -> 2.5 + censored,
0 numéricos -> sección, caracteres dañados fuera de los nombres. Atípicos y duplicados se señalan, no se borran.

## Pruebas

```powershell
# Go (sin toolchain local, vía Docker)
docker run --rm -v ${PWD}/backend:/app -w /app golang:1.22-alpine go test ./...

# Verificación cruzada con pandas (stack levantado): limpieza, estadísticas, simulación y semilla
python scripts/validar_pandas.py
```
