import { useMemo } from 'react';
import { boxStats, corrMatrix, valueOf } from '../lib/data';
import { fmt, niceMax, varMeta, type VarMeta } from '../lib/stats';
import type { Product } from '../lib/types';

type Props = { products: Product[]; v: string; meta: VarMeta; focus: string; companies: string[] };

/* Caja de Tukey por cadena: la caja es la mitad central, los bigotes llegan al dato más lejano dentro
   de 1.5 veces el rango intercuartil y los puntos fuera de ahí son los atípicos. */
export function boxes({ products, v, companies }: Pick<Props, 'products' | 'v' | 'companies'>) {
  return companies.map((c) => {
    const xs = products.filter((p) => p.Company === c).map((p) => valueOf(p, v)).filter((x): x is number => x != null);
    return { c, b: boxStats(xs) };
  });
}

export function boxInsight(bs: ReturnType<typeof boxes>, meta: VarMeta) {
  const total = bs.reduce((a, x) => a + x.b.outliers.length, 0);
  const top = [...bs].sort((a, b) => b.b.outliers.length - a.b.outliers.length)[0];
  if (!top || !total) return `Ninguna cadena tiene valores atípicos en ${meta.label.toLowerCase()}.`;
  const max = Math.max(...bs.flatMap((x) => x.b.outliers));
  return `${total} productos son atípicos en ${meta.label.toLowerCase()}; ${top.c} concentra más (${top.b.outliers.length}). El mayor llega a ${fmt(max)} ${meta.unit}.`;
}

export function Boxplot({ products, v, meta, focus, companies }: Props) {
  const bs = useMemo(() => boxes({ products, v, companies }), [products, v, companies]);
  const W = 620, L = 120, R = 70, ROW = 34, T = 18;
  const max = niceMax(Math.max(1, ...bs.flatMap((x) => [x.b.hi, ...x.b.outliers])));
  const sx = (x: number) => L + (x / max) * (W - L - R);
  const H = T + bs.length * ROW + 6;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="boxsvg" role="img" aria-label={`Cajas de ${meta.label} por cadena con valores atípicos`}>
      {[0, 1, 2, 3, 4].map((t) => (
        <g key={t}>
          <line x1={sx((max / 4) * t)} x2={sx((max / 4) * t)} y1={T - 4} y2={H - 4} stroke="var(--hair)" />
          <text x={sx((max / 4) * t)} y={11} className="ax" textAnchor="middle">{fmt((max / 4) * t)}</text>
        </g>
      ))}
      {bs.map(({ c, b }, i) => {
        const y = T + i * ROW + ROW / 2;
        return (
          <g key={c} opacity={focus && focus !== c ? 0.3 : 1}>
            <title>{`${c}: mediana ${fmt(b.med)} ${meta.unit}, mitad central entre ${fmt(b.q1)} y ${fmt(b.q3)}, ${b.outliers.length} atípicos`}</title>
            <text x={L - 8} y={y + 4} className="ax lab" textAnchor="end">{c}</text>
            <line x1={sx(b.lo)} x2={sx(b.hi)} y1={y} y2={y} stroke="var(--ink)" />
            <rect x={sx(b.q1)} y={y - 9} width={Math.max(2, sx(b.q3) - sx(b.q1))} height={18} fill="var(--data-soft)" stroke="var(--data)" strokeWidth="2" />
            <line x1={sx(b.med)} x2={sx(b.med)} y1={y - 9} y2={y + 9} stroke="var(--data)" strokeWidth="3" />
            {b.outliers.map((o, k) => <circle key={k} cx={sx(o)} cy={y} r={2.6} fill="none" stroke="var(--warn)" strokeWidth="1.4" />)}
            <text x={W - R + 8} y={y + 4} className="ax">{b.flat ? 'sin regla' : `${b.outliers.length} atíp.`}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function BoxLegend() {
  return (
    <p className="legend">
      <span><i className="k-box" />Mitad central (cuartil 1 a 3)</span>
      <span><i className="k-med" />Mediana</span>
      <span><i className="k-whisk" />Bigotes: hasta 1.5 veces el ancho de la caja</span>
      <span><i className="k-out" />Atípico</span>
    </p>
  );
}

const KEYS = ['calories', 'total_fat', 'saturated_fat', 'sodium', 'carbs', 'sugars', 'fiber', 'protein'];

export function corrInsight(products: Product[]) {
  const m = corrMatrix(products, KEYS);
  let best = { i: 0, j: 1, r: 0 };
  m.forEach((row, i) => row.forEach((r, j) => { if (j > i && Math.abs(r) > Math.abs(best.r)) best = { i, j, r }; }));
  const [a, b] = [varMeta(KEYS[best.i]), varMeta(KEYS[best.j])];
  return `La relación más fuerte es ${a.label.toLowerCase()} con ${b.label.toLowerCase()} (r = ${best.r.toFixed(2)}).`;
}

export function Correlations({ products }: { products: Product[] }) {
  const m = useMemo(() => corrMatrix(products, KEYS), [products]);
  return (
    <div className="tablewrap">
      <table className="heat corr">
        <thead><tr><th scope="col" /> {KEYS.map((k) => <th key={k} scope="col" className="num">{varMeta(k).label}</th>)}</tr></thead>
        <tbody>
          {m.map((row, i) => (
            <tr key={KEYS[i]}>
              <th scope="row">{varMeta(KEYS[i]).label}</th>
              {row.map((r, j) => (
                <td key={j} className="num" style={{
                  background: `color-mix(in srgb, var(${r >= 0 ? '--data' : '--warn'}) ${Math.round(Math.abs(r) * 90)}%, var(--surface))`,
                  color: Math.abs(r) > 0.55 ? 'var(--on-data)' : 'var(--ink)'
                }}>{i === j ? '—' : r.toFixed(2)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

