// Datos crudos de la API -> filas listas para leer. Una sola forma para simulación y descriptiva real.

export interface Row {
  key: string;
  label: string;
  total: boolean; // fila agregada (todas las cadenas / equilibrada)
  n: number;
  mean: number;
  sd: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  pOver?: number;
  pool?: number; // productos distintos de los que se muestreó (solo simulación)
  delta?: number; // cambio relativo de la media frente al escenario actual
}

export interface VarMeta {
  id: string;
  label: string;
  unit: string;
  threshold: number; // umbral sugerido para "¿cuántos se pasan?"
}

// Umbrales: ≈30% del valor diario FDA (una comida de tres). Mantener alineados con Variables en Go.
export const VARS: VarMeta[] = [
  { id: 'calories', label: 'Calorías', unit: 'kcal', threshold: 600 },
  { id: 'sodium', label: 'Sodio', unit: 'mg', threshold: 800 },
  { id: 'total_fat', label: 'Grasa total', unit: 'g', threshold: 25 },
  { id: 'sugars', label: 'Azúcares', unit: 'g', threshold: 15 },
  { id: 'protein', label: 'Proteína', unit: 'g', threshold: 20 },
  { id: 'carbs', label: 'Carbohidratos', unit: 'g', threshold: 80 },
  { id: 'saturated_fat', label: 'Grasa saturada', unit: 'g', threshold: 6 },
  { id: 'trans_fat', label: 'Grasa trans', unit: 'g', threshold: 1 },
  { id: 'cholesterol', label: 'Colesterol', unit: 'mg', threshold: 90 },
  { id: 'fiber', label: 'Fibra', unit: 'g', threshold: 8 },
  { id: 'calories_from_fat', label: 'Calorías de grasa', unit: 'kcal', threshold: 200 },
  { id: 'ww_pnts', label: 'Puntos WW', unit: 'pts', threshold: 10 },
  { id: 'cost', label: 'Costo nutricional', unit: '% VD', threshold: 20 },
  { id: 'benefit', label: 'Beneficio nutricional', unit: '% VD', threshold: 20 }
]; // el balance (puede ser negativo) solo se usa en la propuesta

export const varMeta = (id: string): VarMeta => VARS.find((v) => v.id === id) ?? VARS[0];

const TOTAL_LABEL: Record<string, string> = { ALL: 'Todo el menú', BALANCED: 'Cadenas con igual peso' };

const order = (rows: Row[]) =>
  rows.sort((a, b) => Number(b.total) - Number(a.total) || b.p50 - a.p50);

export function fromSim(results: any[]): Row[] {
  return order(
    (results ?? []).map((r) => ({
      key: r.company,
      label: TOTAL_LABEL[r.company] ?? r.company,
      total: r.company in TOTAL_LABEL,
      n: r.n_valid, mean: r.mean, sd: r.sd, p25: r.p25, p50: r.p50, p75: r.p75, p95: r.p95,
      pOver: r.p_over, pool: r.pool
    }))
  );
}

export function fromDesc(map: Record<string, any>): Row[] {
  return order(
    Object.entries(map ?? {}).filter(([, d]) => d.n > 0).map(([k, d]) => ({
      key: k,
      label: TOTAL_LABEL[k] ?? k,
      total: k in TOTAL_LABEL,
      n: d.n, mean: d.mean, sd: d.sd, p25: d.p25, p50: d.p50, p75: d.p75, p95: d.p95
    }))
  );
}

export const fmt = (x: number) =>
  Math.abs(x) >= 100 ? Math.round(x).toLocaleString('en-US') : x.toLocaleString('en-US', { maximumFractionDigits: 1 });

export const pct = (x: number) => `${(x * 100).toLocaleString('en-US', { maximumFractionDigits: x < 0.1 ? 1 : 0 })}%`;

// Frases en lenguaje llano: lo que un lector sin estadística entiende de un vistazo.
export function findings(rows: Row[], m: VarMeta, over?: number): string[] {
  const groups = rows.filter((r) => !r.total);
  const out: string[] = [];
  if (groups.length > 1) {
    const hi = groups.reduce((a, b) => (b.p50 > a.p50 ? b : a));
    const lo = groups.reduce((a, b) => (b.p50 < a.p50 ? b : a));
    out.push(`${hi.label} tiene la mediana más alta de ${m.label.toLowerCase()}: ${fmt(hi.p50)} ${m.unit}. ${lo.label}, la más baja: ${fmt(lo.p50)} ${m.unit}.`);
  } else if (rows.length) {
    const r = rows[0];
    out.push(`La mitad de las elecciones tiene ${fmt(r.p50)} ${m.unit} o menos. Solo 1 de cada 20 pasa de ${fmt(r.p95)} ${m.unit}.`);
  }
  if (over !== undefined) {
    const withP = rows.filter((r) => r.pOver !== undefined);
    const worst = withP.filter((r) => !r.total).sort((a, b) => b.pOver! - a.pOver!)[0] ?? withP[0];
    if (worst) out.push(`${worst.label}: ${pct(worst.pOver!)} de las elecciones supera ${fmt(over)} ${m.unit}.`);
  }
  return out;
}

// Eje "bonito": 1, 2, 2.5 o 5 por potencia de 10.
export function niceMax(x: number): number {
  if (x <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  return ([1, 2, 2.5, 5, 10].map((s) => s * p).find((v) => v >= x) ?? 10 * p);
}
