import { api } from './api';
import type { Row } from './stats';
import type { Product } from './types';

const VAR_KEY: Record<string, keyof Product> = {
  calories: 'Calories', sodium: 'Sodium', total_fat: 'TotalFat', sugars: 'Sugars', protein: 'Protein',
  carbs: 'Carbs', saturated_fat: 'SaturatedFat', trans_fat: 'TransFat', cholesterol: 'Cholesterol',
  fiber: 'Fiber', calories_from_fat: 'CaloriesFromFat', ww_pnts: 'WwPnts',
  cost: 'Cost', benefit: 'Benefit', balance: 'Balance'
};

export const valueOf = (p: Product, v: string): number | null => (p[VAR_KEY[v]] as number | null | undefined) ?? null;

// La API pagina de a 500; el dataset completo son ~1,150 filas.
export async function loadProducts(): Promise<Product[]> {
  const out: Product[] = [];
  for (let off = 0; ; off += 500) {
    const page = await api.products({ limit: 500, offset: off });
    out.push(...(page ?? []));
    if ((page?.length ?? 0) < 500) break;
  }
  return out.filter((p) => !p.IsSectionRow);
}

// Mismo método que el backend (interpolación lineal), para que lo crudo y lo visto coincidan.
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function summarize(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  const mean = n ? s.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd, p25: quantile(s, 0.25), p50: quantile(s, 0.5), p75: quantile(s, 0.75), p95: quantile(s, 0.95), max: s[n - 1] ?? 0 };
}

export const companiesOf = (ps: Product[]) => [...new Set(ps.map((p) => p.Company))].sort();

// Filas por grupo (cadena por defecto) más un total. `over` calcula qué parte supera ese umbral.
export function rowsFor(ps: Product[], v: string, by: (p: Product) => string = (p) => p.Company, over?: number): Row[] {
  const groups = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of ps) {
    const x = valueOf(p, v);
    if (x == null) continue;
    all.push(x);
    groups.set(by(p), [...(groups.get(by(p)) ?? []), x]);
  }
  const mk = (key: string, label: string, total: boolean, xs: number[]): Row => ({
    key, label, total, ...summarize(xs),
    ...(over !== undefined && { pOver: xs.filter((x) => x > over).length / xs.length })
  });
  const rows = [...groups].map(([c, xs]) => mk(c, c, false, xs)).sort((a, b) => b.p50 - a.p50);
  return all.length ? [mk('ALL', 'Todo el menú', true, all), ...rows] : [];
}

export interface Box { n: number; q1: number; med: number; q3: number; lo: number; hi: number; outliers: number[]; flat: boolean }

// Caja de Tukey: bigotes hasta el dato más lejano dentro de 1.5·RIC; fuera de ahí son atípicos.
// Si RIC = 0 (más de la mitad de los datos son iguales) la regla no aplica y no se marca ninguno.
export function boxStats(xs: number[]): Box {
  const s = [...xs].sort((a, b) => a - b);
  const q1 = quantile(s, 0.25), med = quantile(s, 0.5), q3 = quantile(s, 0.75), iqr = q3 - q1;
  const flat = iqr === 0;
  const inside = flat ? s : s.filter((x) => x >= q1 - 1.5 * iqr && x <= q3 + 1.5 * iqr);
  return { n: s.length, q1, med, q3, lo: inside[0] ?? q1, hi: inside[inside.length - 1] ?? q3, flat, outliers: flat ? [] : s.filter((x) => x < q1 - 1.5 * iqr || x > q3 + 1.5 * iqr) };
}

// Correlación de Pearson entre cada par de variables, usando solo los productos que tienen ambas.
export function corrMatrix(ps: Product[], ids: string[]): number[][] {
  return ids.map((a) => ids.map((b) => {
    if (a === b) return 1;
    const xs: number[] = [], ys: number[] = [];
    for (const p of ps) {
      const x = valueOf(p, a), y = valueOf(p, b);
      if (x != null && y != null) { xs.push(x); ys.push(y); }
    }
    return pearson(xs, ys);
  }));
}

export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

// Paleta apta para daltonismo (Okabe-Ito), una por cadena en orden alfabético.
// Los colores viven en CSS (--c1 … --c6) para que cambien con el tema.
export const colorOf = (company: string, all: string[]) => `var(--c${(all.indexOf(company) % 6) + 1})`;
