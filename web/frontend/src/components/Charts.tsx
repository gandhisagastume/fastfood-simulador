import { useId, useMemo, useState, type ReactNode } from 'react';
import { colorOf, pearson, summarize, valueOf } from '../lib/data';
import { fmt, niceMax, VARS, varMeta, type VarMeta } from '../lib/stats';
import type { Product } from '../lib/types';

/* ——— Marco común: título, frase-conclusión y el ícono (i) que explica el gráfico ——— */

function Info({ what, how }: { what: string; how: string }) {
  const id = useId();
  return (
    <span className="info">
      <button type="button" aria-describedby={id} aria-label="Qué muestra este gráfico">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
          <rect x="11" y="10.5" width="2" height="7" fill="currentColor" />
          <circle cx="12" cy="7.3" r="1.4" fill="currentColor" />
        </svg>
      </button>
      <span role="tooltip" id={id} className="tip"><b>Qué es</b>{what}<b>Cómo leerlo</b>{how}</span>
    </span>
  );
}

export function Card({ title, insight, what, how, wide, controls, children }: {
  title: string; insight?: ReactNode; what: string; how: string; wide?: boolean; controls?: ReactNode; children: ReactNode;
}) {
  return (
    <section className={`panel chart${wide ? ' span2' : ''}`}>
      <header>
        <h2>{title}</h2>
        <Info what={what} how={how} />
      </header>
      {insight && <p className="insight"><mark>{insight}</mark></p>}
      {controls}
      {children}
    </section>
  );
}

type Common = { products: Product[]; v: string; meta: VarMeta; focus: string; companies: string[] };

/* ——— 1. Forma de la distribución: un histograma por cadena, misma escala ——— */

export function Histograms({ products, v, meta, focus, companies }: Common) {
  const BINS = 12;
  const { max, groups, yMax } = useMemo(() => {
    const vals = products.map((p) => valueOf(p, v)).filter((x): x is number => x != null);
    const max = niceMax(Math.max(0, ...vals));
    const groups = companies.map((c) => {
      const xs = products.filter((p) => p.Company === c).map((p) => valueOf(p, v)).filter((x): x is number => x != null);
      const bins = Array(BINS).fill(0);
      xs.forEach((x) => bins[Math.min(BINS - 1, Math.floor((x / max) * BINS))]++);
      return { c, n: xs.length, share: bins.map((b) => b / (xs.length || 1)), p50: summarize(xs).p50 };
    });
    return { max, groups, yMax: Math.max(0.01, ...groups.flatMap((g) => g.share)) };
  }, [products, v, companies]);

  return (
    <div className="hists">
      {groups.map((g) => (
        <figure key={g.c} className={focus && focus !== g.c ? 'dim' : ''}>
          <svg viewBox="0 0 240 96" role="img" aria-label={`${g.c}: mediana ${fmt(g.p50)} ${meta.unit}, ${g.n} productos`}>
            {g.share.map((s, i) => (
              <rect key={i} x={i * 20 + 1} width={18} y={72 - (s / yMax) * 66} height={(s / yMax) * 66} fill="var(--data)" opacity={0.85} />
            ))}
            <line x1="0" x2="240" y1="72.5" y2="72.5" stroke="var(--ink)" />
            <line x1={(g.p50 / max) * 240} x2={(g.p50 / max) * 240} y1="2" y2="72" stroke="var(--warn)" strokeWidth="2" />
            <text x="0" y="88" className="ax">0</text>
            <text x="240" y="88" className="ax" textAnchor="end">{fmt(max)} {meta.unit}</text>
          </svg>
          <figcaption><b>{g.c}</b><small>mediana {fmt(g.p50)} · {g.n} productos</small></figcaption>
        </figure>
      ))}
    </div>
  );
}

/* ——— 2. Relación entre dos medidas ——— */

export function Scatter({ products, focus, companies }: Pick<Common, 'products' | 'focus' | 'companies'>) {
  const [xv, setXv] = useState('calories');
  const [yv, setYv] = useState('protein');
  const [hover, setHover] = useState<{ p: Product; x: number; y: number } | null>(null);
  const W = 620, H = 340, L = 46, R = 12, T = 10, B = 34;
  const xm = varMeta(xv), ym = varMeta(yv);

  const pts = useMemo(() => products
    .map((p) => ({ p, x: valueOf(p, xv), y: valueOf(p, yv) }))
    .filter((d): d is { p: Product; x: number; y: number } => d.x != null && d.y != null), [products, xv, yv]);
  const xMax = niceMax(Math.max(1, ...pts.map((d) => d.x))), yMax = niceMax(Math.max(1, ...pts.map((d) => d.y)));
  const sx = (x: number) => L + (x / xMax) * (W - L - R), sy = (y: number) => H - B - (y / yMax) * (H - T - B);
  const inFocus = (c: string) => !focus || c === focus;
  const sel = pts.filter((d) => inFocus(d.p.Company));
  const r = pearson(sel.map((d) => d.x), sel.map((d) => d.y));
  const strength = Math.abs(r) >= 0.7 ? 'fuerte' : Math.abs(r) >= 0.4 ? 'moderada' : 'débil';

  const move = (e: React.MouseEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - b.left) * W) / b.width, my = ((e.clientY - b.top) * H) / b.height;
    let best: (typeof pts)[number] | null = null, bd = 18 * 18;
    for (const d of sel) {
      const dd = (sx(d.x) - mx) ** 2 + (sy(d.y) - my) ** 2;
      if (dd < bd) { bd = dd; best = d; }
    }
    setHover(best ? { p: best.p, x: sx(best.x), y: sy(best.y) } : null);
  };
  const ticks = [0, 1, 2, 3, 4];

  return (
    <>
      <p className="insight"><mark>
        {sel.length > 2 ? `Relación ${strength} y ${r >= 0 ? 'positiva' : 'negativa'} (r = ${r.toFixed(2)}): ${r >= 0 ? 'más' : 'menos'} ${xm.label.toLowerCase()} suele venir con ${r >= 0 ? 'más' : 'menos'} ${ym.label.toLowerCase()}.` : 'Sin datos suficientes.'}
      </mark></p>
      <div className="fields">
        <label>Eje horizontal<select value={xv} onChange={(e) => setXv(e.target.value)}>{VARS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
        <label>Eje vertical<select value={yv} onChange={(e) => setYv(e.target.value)}>{VARS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
      </div>
      <div className="plot">
        <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={move} onMouseLeave={() => setHover(null)} role="img"
          aria-label={`Dispersión de ${ym.label} contra ${xm.label}, ${sel.length} productos`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={sy((yMax / 4) * t)} y2={sy((yMax / 4) * t)} stroke="var(--hair)" />
              <text x={L - 6} y={sy((yMax / 4) * t) + 4} className="ax" textAnchor="end">{fmt((yMax / 4) * t)}</text>
              <text x={sx((xMax / 4) * t)} y={H - B + 16} className="ax" textAnchor="middle">{fmt((xMax / 4) * t)}</text>
            </g>
          ))}
          <text x={(L + W - R) / 2} y={H - 2} className="ax" textAnchor="middle">{xm.label} ({xm.unit})</text>
          <text transform={`translate(11 ${(T + H - B) / 2}) rotate(-90)`} className="ax" textAnchor="middle">{ym.label} ({ym.unit})</text>
          {pts.map((d, i) => (
            <circle key={i} cx={sx(d.x)} cy={sy(d.y)} r={3.4} fill={inFocus(d.p.Company) ? colorOf(d.p.Company, companies) : 'var(--hair)'} opacity={inFocus(d.p.Company) ? 0.7 : 0.6} />
          ))}
          {hover && <circle cx={hover.x} cy={hover.y} r={6.5} fill="none" stroke="var(--ink)" strokeWidth="2" />}
        </svg>
        {hover && (
          <div className="pop" style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }}>
            <b>{hover.p.Item}</b>{hover.p.Company}<br />
            {xm.label}: {fmt(valueOf(hover.p, xv)!)} {xm.unit} · {ym.label}: {fmt(valueOf(hover.p, yv)!)} {ym.unit}
          </div>
        )}
      </div>
      <Swatches companies={companies} />
    </>
  );
}

export function Swatches({ companies }: { companies: string[] }) {
  return <p className="legend">{companies.map((c) => <span key={c}><i className="dot" style={{ background: colorOf(c, companies) }} />{c}</span>)}</p>;
}

/* ——— 3. Mapa de calor: perfil de cada cadena ——— */

const HEAT = ['calories', 'total_fat', 'sodium', 'sugars', 'carbs', 'protein'];

export function Heatmap({ products, focus, companies }: Pick<Common, 'products' | 'focus' | 'companies'>) {
  const med = useMemo(() => companies.map((c) => HEAT.map((h) => summarize(products.filter((p) => p.Company === c).map((p) => valueOf(p, h)).filter((x): x is number => x != null)).p50)), [products, companies]);
  const colMax = HEAT.map((_, j) => Math.max(1, ...med.map((r) => r[j])));
  return (
    <div className="tablewrap">
      <table className="heat">
        <thead><tr><th scope="col">Cadena</th>{HEAT.map((h) => <th key={h} scope="col" className="num">{varMeta(h).label}<small>{varMeta(h).unit}</small></th>)}</tr></thead>
        <tbody>
          {companies.map((c, i) => (
            <tr key={c} className={focus && focus !== c ? 'dim' : ''}>
              <th scope="row">{c}</th>
              {med[i].map((m, j) => {
                const t = m / colMax[j];
                return <td key={j} className="num" style={{ background: `color-mix(in srgb, var(--data) ${Math.round((0.08 + t * 0.82) * 100)}%, var(--surface))`, color: t > 0.55 ? 'var(--on-data)' : 'var(--ink)' }}>{fmt(m)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function heatInsight(products: Product[], companies: string[], v: string) {
  const top = companies.map((c) => ({ c, m: summarize(products.filter((p) => p.Company === c).map((p) => valueOf(p, v)).filter((x): x is number => x != null)).p50 })).sort((a, b) => b.m - a.m)[0];
  const m = varMeta(v);
  return top ? `En ${m.label.toLowerCase()}, ${top.c} tiene la mediana más alta (${fmt(top.m)} ${m.unit}).` : '';
}

/* ——— 4. Ranking de productos ——— */

export function Ranking({ products, v, meta, focus, companies }: Common) {
  const [low, setLow] = useState(false);
  const list = useMemo(() => {
    const xs = products.filter((p) => (!focus || p.Company === focus) && valueOf(p, v) != null && (!low || valueOf(p, v)! > 0));
    xs.sort((a, b) => (low ? 1 : -1) * (valueOf(a, v)! - valueOf(b, v)!));
    return xs.slice(0, 10);
  }, [products, v, focus, low]);
  const max = Math.max(1, ...list.map((p) => valueOf(p, v)!));
  return (
    <>
      <div className="seg" role="group" aria-label="Orden del ranking">
        <button aria-pressed={!low} onClick={() => setLow(false)}>Más altos</button>
        <button aria-pressed={low} onClick={() => setLow(true)}>Más bajos (sin ceros)</button>
      </div>
      <ol className="rank">
        {list.map((p, i) => (
          <li key={`${p.SourceLine}-${i}`}>
            <span className="rname">{p.Item}<small>{p.Company}</small></span>
            <span className="rbar"><i style={{ width: `${(valueOf(p, v)! / max) * 100}%`, background: colorOf(p.Company, companies) }} /></span>
            <span className="rval">{fmt(valueOf(p, v)!)}<small>{meta.unit}</small></span>
          </li>
        ))}
        {!list.length && <li className="note">Sin productos con este dato.</li>}
      </ol>
    </>
  );
}
