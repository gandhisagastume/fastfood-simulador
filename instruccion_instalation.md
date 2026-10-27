# Instrucciones de instalación (para un agente)

Guía paso a paso para dejar FastFood Sim funcionando en una máquina nueva. Cada paso dice qué ejecutar
y cómo comprobar que salió bien. Sigue el orden; no avances si una comprobación falla.

## 0. Qué vas a levantar

| Servicio | Qué es | Puerto en la máquina |
|---|---|---|
| `db` | PostgreSQL 16 | `5434` |
| `seeder` | Carga el CSV a la DB y termina (se ejecuta una vez) | — |
| `backend` | API en Go | `8080` |
| `frontend` | Panel web (Astro + React, servido como sitio estático) | `4322` |
| `pgadmin` | Administrador de la DB (opcional) | `5050` |

Todo corre con Docker Compose desde la carpeta `web/`. No hace falta instalar Go, Node ni PostgreSQL.

## 1. Requisitos

- Git.
- Docker con el plugin Compose v2 (Docker Desktop en Windows o macOS; Docker Engine en Linux).
- Unos 3 GB libres para las imágenes.
- Los puertos `5434`, `8080`, `4322` y `5050` libres.

Comprueba:

```bash
git --version
docker --version
docker compose version      # debe ser v2.x
docker info > /dev/null && echo "docker OK"
```

Si `docker info` falla, el daemon no está corriendo: abre Docker Desktop (o `sudo systemctl start docker` en Linux) y repite.

Para ver si un puerto está ocupado:

```bash
# Linux / macOS
lsof -i :8080
# Windows (PowerShell)
Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
```

## 2. Clonar

```bash
git clone https://github.com/gandhisagastume/fastfood-simulador.git
cd fastfood-simulador
```

Comprueba que existan estos dos archivos. El seeder los necesita y Compose los monta por ruta relativa:

```bash
ls web/docker-compose.yml "PROYECTO FINAL/FastFoodNutritionMenuV2.csv"
```

No cambies el nombre de la carpeta `PROYECTO FINAL` ni la muevas: `web/docker-compose.yml` monta `../PROYECTO FINAL` en el seeder.

En Windows, si Git convierte los finales de línea a CRLF, no afecta: los Dockerfile y el código funcionan igual.

## 3. Levantar todo

```bash
cd web
docker compose up --build -d
```

La primera vez tarda varios minutos: descarga imágenes, compila Go e instala dependencias de Node.
No hay archivo `.env` que crear: los valores por defecto están en `docker-compose.yml`.

Espera a que termine el seeder y revisa que haya cargado el CSV:

```bash
docker compose ps -a
docker compose logs seeder
```

Lo esperado:

- `seeder` en estado `Exited (0)` y en su log la línea `seed ok dataset=1`.
- `db` en `healthy`, y `backend`, `frontend` y `pgadmin` en `Up`.

## 4. Verificar

```bash
curl -s http://localhost:8080/api/health
# {"ok":"true"}

curl -s http://localhost:8080/api/quality/report | head -c 200
# debe incluir "rows_total":1148,"rows_section":15,"rows_valid":1133

curl -s -X POST http://localhost:8080/api/simulate \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"C","variable":"calories","n":1000,"seed":42}' | head -c 200
# debe devolver {"results":[...],"run_id":N}

curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4322
# 200
```

En Windows PowerShell usa `curl.exe` en lugar de `curl`, o `Invoke-RestMethod http://localhost:8080/api/health`.

Luego abre en el navegador:

- Panel: http://localhost:4322 (pestañas Explorar, Simular y Propuesta; botón de tema arriba a la derecha)
- Datos y diccionario: http://localhost:4322/datos
- pgAdmin (opcional): http://localhost:5050, usuario `admin@example.com`, contraseña `admin`

Si el panel dice «No hay conexión con el backend», ve a Problemas frecuentes.

## 5. Pruebas (opcional pero recomendado)

Pruebas del backend en Go, dentro de un contenedor (no requiere Go instalado):

```bash
# Linux / macOS, desde la raíz del repo
docker run --rm -v "$PWD/web/backend:/app" -w /app golang:1.22-alpine go test ./...
# Windows (PowerShell), desde la raíz del repo
docker run --rm -v "${PWD}/web/backend:/app" -w /app golang:1.22-alpine go test ./...
# Windows (Git Bash): anteponer MSYS_NO_PATHCONV=1 y usar $(pwd -W)
```

Esperado: `ok  fastfood-sim/internal/service`.

Verificación cruzada con pandas (necesita Python 3.10+ con `pandas` y `numpy`, y el stack levantado):

```bash
pip install pandas numpy
python web/scripts/validar_pandas.py
```

Esperado: todas las líneas en `OK` y al final `RESULTADO: todo coincide`.

## 6. Operación diaria

```bash
cd web
docker compose stop                 # detener sin borrar datos
docker compose start                # volver a arrancar
docker compose up --build -d        # después de cambiar código: reconstruir (si no, se sirve la imagen vieja)
docker compose logs -f backend      # ver logs del backend
```

Volver a sembrar la DB desde el CSV. **Borra el volumen de Postgres, incluidas las corridas de simulación guardadas:**

```bash
docker compose down -v && docker compose up --build -d
```

El seeder no recarga si la tabla `products` ya tiene filas; por eso hace falta `down -v` para repetir la carga.

## 7. Configuración

| Variable | Dónde | Valor por defecto | Para qué |
|---|---|---|---|
| `DATABASE_URL` | `backend`, `seeder` | `postgres://sim:sim@db:5432/sim?sslmode=disable` | Conexión a la DB |
| `PORT` | `backend` | `8080` | Puerto de la API |
| `CORS_ORIGINS` | `backend` | `*` | Orígenes permitidos, separados por coma |
| `SEED_CSV` / `SEED_ONLY` | `seeder` | ruta del CSV / `1` | Carga del dataset |
| `PUBLIC_API_URL` | build arg de `frontend` | `http://localhost:8080` | URL de la API que usa el navegador |

`PUBLIC_API_URL` queda fija en el sitio al construirlo. Si el panel se abrirá desde otra máquina (no `localhost`),
cambia el `args: PUBLIC_API_URL` del servicio `frontend` en `docker-compose.yml` por la IP o el dominio del servidor
(por ejemplo `http://192.168.1.50:8080`) y reconstruye con `docker compose up --build -d frontend`.

Las contraseñas de `docker-compose.yml` (`sim`/`sim` y `admin`) son solo para desarrollo local. Antes de exponer el servicio
en una red, cámbialas, limita `CORS_ORIGINS` al dominio real y no publiques los puertos `5434` ni `5050`.
No subas archivos `.env` al repositorio; `.gitignore` ya los excluye.

## 8. Desarrollo sin Docker (alternativa)

Solo si no se puede usar Docker. Requisitos: Go 1.22+, Node 20+, PostgreSQL 16.

```bash
# 1) DB
createdb sim
psql -d sim -f web/db/migrations/001_schema.sql

# 2) Cargar el CSV y levantar la API (desde web/backend)
cd web/backend
export DATABASE_URL="postgres://USUARIO:CLAVE@localhost:5432/sim?sslmode=disable"
SEED_CSV="../../PROYECTO FINAL/FastFoodNutritionMenuV2.csv" SEED_ONLY=1 go run ./cmd/api
go run ./cmd/api              # queda escuchando en :8080

# 3) Frontend (otra terminal, desde web/frontend)
cd web/frontend
npm install
PUBLIC_API_URL=http://localhost:8080 npm run dev    # http://localhost:4321
```

## 9. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `port is already allocated` | Otro programa usa el puerto | Libéralo, o cambia el puerto de la izquierda en `ports:` de `docker-compose.yml` (si cambias `8080`, cambia también `PUBLIC_API_URL` y reconstruye) |
| El panel dice «No hay conexión con el backend» | El backend no arrancó, o `PUBLIC_API_URL` no apunta a él | `docker compose ps -a` y `docker compose logs backend`; revisa la sección 7 |
| La API responde `sin dataset: corre el seeder` (503) | El seeder falló o no encontró el CSV | `docker compose logs seeder`; confirma que exista `PROYECTO FINAL/FastFoodNutritionMenuV2.csv` y ejecuta `docker compose up -d seeder` |
| El seeder no encuentra el archivo | Se movió o renombró la carpeta `PROYECTO FINAL` | Restaura la estructura del repo tal como se clonó |
| `backend` termina al arrancar | La DB aún no estaba lista o el seeder falló | `docker compose up -d` de nuevo; Compose espera a `db` sano y al seeder terminado |
| Los cambios de código no se ven | Se sirve la imagen anterior | `docker compose up --build -d` y recarga el navegador con Ctrl+F5 |
| Falla la compilación del frontend en Docker | Sin acceso a npm, o poca memoria | Revisa la conexión a internet y asigna al menos 4 GB a Docker |

## 10. Desinstalar

```bash
cd web
docker compose down -v --rmi local   # borra contenedores, volumen de datos e imágenes del proyecto
```

Este comando es irreversible para los datos de la DB (se pueden volver a sembrar desde el CSV).

## Para el agente que ejecuta esto

- No ejecutes `docker compose down -v` ni borres volúmenes salvo que el usuario lo pida o haga falta volver a sembrar; borra las corridas guardadas.
- No crees ni subas archivos `.env` con credenciales reales.
- Si un puerto está ocupado, pregunta antes de detener procesos ajenos al proyecto.
- Da por terminada la instalación solo cuando pasen las cuatro comprobaciones de la sección 4.
