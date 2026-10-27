"""Verificación cruzada e independiente: rehace la limpieza y las estadísticas con pandas/numpy
y las compara con lo que responde la API en Go. También contrasta la simulación con la media real.

Uso (con el stack levantado):
    python web/scripts/validar_pandas.py [URL_API] [RUTA_CSV]
"""
import json
import math
import re
import sys
import urllib.request
from pathlib import Path

import numpy as np
sys.stdout.reconfigure(encoding="utf-8")  # consola de Windows
import pandas as pd

API = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080").rstrip("/")
CSV = Path(sys.argv[2] if len(sys.argv) > 2 else Path(__file__).resolve().parents[2] / "PROYECTO FINAL" / "FastFoodNutritionMenuV2.csv")

NUM = {  # id de la API -> columna del CSV (encabezados ya normalizados)
    "calories": "Calories", "calories_from_fat": "Calories from Fat", "total_fat": "Total Fat (g)",
    "saturated_fat": "Saturated Fat (g)", "trans_fat": "Trans Fat (g)", "cholesterol": "Cholesterol (mg)",
    "sodium": "Sodium (mg)", "carbs": "Carbs (g)", "fiber": "Fiber (g)", "sugars": "Sugars (g)",
    "protein": "Protein (g)", "ww_pnts": "Weight Watchers Pnts",
}
DV = {"calories": 2000, "sodium": 2300, "sugars": 50, "saturated_fat": 20, "protein": 50, "fiber": 28}


def num(x):
    """Mismas reglas que el backend: vacío -> NaN, quita 'g' y comas, '<5' -> 2.5."""
    t = str(x).strip()
    if t in ("", "nan"):
        return np.nan
    t = t.removesuffix(" g").removesuffix("g").strip()
    if t.startswith("<"):
        return 2.5
    try:
        return float(t.replace(",", ""))
    except ValueError:
        return np.nan


def load():
    df = pd.read_csv(CSV, dtype=str, keep_default_na=False)
    df.columns = [re.sub(r"\s+", " ", c).strip() for c in df.columns]
    for c in NUM.values():
        df[c] = df[c].map(num)
    df["Company"] = df["Company"].str.strip()
    df = df[df[list(NUM.values())].notna().any(axis=1)].copy()  # fuera filas de sección
    for k, v in DV.items():
        df["dv_" + k] = df[NUM[k]] / v
    ok = df[[NUM[k] for k in DV]].notna().all(axis=1)
    df["cost"] = np.where(ok, 100 * df[["dv_calories", "dv_sodium", "dv_sugars", "dv_saturated_fat"]].mean(axis=1), np.nan)
    df["benefit"] = np.where(ok, 100 * df[["dv_protein", "dv_fiber"]].mean(axis=1), np.nan)
    return df


def get(path):
    with urllib.request.urlopen(API + path) as r:
        return json.load(r)


def post(path, body):
    req = urllib.request.Request(API + path, json.dumps(body).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


fails = 0


def check(name, cond, detail=""):
    global fails
    fails += not cond
    print(("OK   " if cond else "FALLA"), name, detail)


df = load()
check("filas válidas", len(df) == get("/api/quality/report")["rows_valid"], f"pandas={len(df)}")

# 1) Estadística descriptiva por cadena y total
for var in ["calories", "sodium", "protein", "sugars", "cost", "benefit"]:
    col = NUM.get(var, var)
    api = get(f"/api/stats/descriptive?variable={var}")
    worst = 0.0
    for name, g in [("ALL", df[col])] + [(c, d[col]) for c, d in df.groupby("Company")]:
        x = g.dropna().to_numpy()
        mine = {"n": len(x), "mean": x.mean(), "sd": x.std(ddof=1), "p25": np.percentile(x, 25),
                "p50": np.percentile(x, 50), "p75": np.percentile(x, 75), "p95": np.percentile(x, 95)}
        for k, v in mine.items():
            worst = max(worst, abs(api[name][k] - v))
    check(f"descriptiva {var} (7 grupos x 7 estadísticos)", worst < 1e-6, f"diferencia máx {worst:.2e}")

# 2) La simulación reproduce la media real (dentro de 3 errores estándar)
for var in ["calories", "sodium"]:
    col = NUM[var]
    n = 20000
    res = post("/api/simulate", {"scenario": "C", "variable": var, "n": n, "seed": 42})["results"]
    bad = []
    for r in res:
        x = df[df.Company == r["company"]][col].dropna()
        se = x.std(ddof=1) / math.sqrt(n)
        if abs(r["mean"] - x.mean()) > 3 * se:
            bad.append(r["company"])
    check(f"simulación C {var}: media simulada ≈ real (|z| ≤ 3)", not bad, f"fuera: {bad}" if bad else f"{len(res)} cadenas")

# 3) Reproducibilidad: misma semilla, mismo resultado
a = post("/api/simulate", {"scenario": "A", "variable": "calories", "n": 5000, "seed": 7})["results"]
b = post("/api/simulate", {"scenario": "A", "variable": "calories", "n": 5000, "seed": 7})["results"]
check("misma semilla, mismos resultados", a == b)

print("\nRESULTADO:", "todo coincide" if not fails else f"{fails} verificaciones fallaron")
sys.exit(1 if fails else 0)
