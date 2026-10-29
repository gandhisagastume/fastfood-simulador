import { Hint } from './Hint';
import { APERTURA, type Kpi } from '../lib/colas';

/* ——— gráfica por hora ——— */
export type Serie = { name: string; color: string; dash?: string; sq?: boolean; vals: number[] };
export function PorHora({ series, unit, linea, refLabel, label, digits = 1, maxY }: {
  series: Serie[]; unit: string; linea?: number; refLabel?: string; label: string; digits?: number; maxY?: number;
}) {
  const W = 620, H = 250, L = 46, R = 12, T = 12, B = 34;
  const top = Math.max(1e-9, ...series.flatMap((s) => s.vals), linea ?? 0) * 1.12;
  const nice = maxY ?? (() => { const p = 10 ** Math.floor(Math.log10(top)); const m = top / p; return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => m <= x) ?? 10) * p; })();
  const sx = (i: number) => L + ((i + 0.5) / 12) * (W - L - R), sy = (y: number) => H - B - (y / nice) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * nice);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="boxsvg" role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}><line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} stroke="var(--hair)" />
            <text x={L - 6} y={sy(t) + 4} className="ax" textAnchor="end">{t.toLocaleString('en-US', { maximumFractionDigits: nice < 5 ? 1 : 0 })}</text></g>
        ))}
        {Array.from({ length: 12 }, (_, i) => <text key={i} x={sx(i)} y={H - 16} className="ax" textAnchor="middle">{APERTURA + i}h</text>)}
        <text x={(L + W - R) / 2} y={H - 3} className="ax" textAnchor="middle">hora del día · {unit}</text>
        {linea !== undefined && linea <= nice && (
          <g><line x1={L} x2={W - R} y1={sy(linea)} y2={sy(linea)} stroke="var(--warn)" strokeWidth="2" strokeDasharray="6 4" />
            <text x={W - R} y={sy(linea) - 5} className="ax" textAnchor="end" fill="var(--warn-ink)">{refLabel}</text></g>
        )}
        {series.map((s) => (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth="2.4" strokeDasharray={s.dash} points={s.vals.map((v, i) => `${sx(i)},${sy(v)}`).join(' ')} />
            {s.vals.map((v, i) => s.sq
              ? <rect key={i} x={sx(i) - 4} y={sy(v) - 4} width="8" height="8" fill={s.color} stroke="var(--surface)" strokeWidth="2"><title>{`${s.name} · ${APERTURA + i}h: ${v.toFixed(digits)} ${unit}`}</title></rect>
              : <circle key={i} cx={sx(i)} cy={sy(v)} r="4.2" fill={s.color} stroke="var(--surface)" strokeWidth="2"><title>{`${s.name} · ${APERTURA + i}h: ${v.toFixed(digits)} ${unit}`}</title></circle>)}
          </g>
        ))}
      </svg>
      <p className="legend">
        {series.map((s) => (
          <span key={s.name}>
            <svg width="30" height="10" aria-hidden><line x1="0" x2="30" y1="5" y2="5" stroke={s.color} strokeWidth="2.4" strokeDasharray={s.dash} />{s.sq ? <rect x="11" y="1" width="8" height="8" fill={s.color} /> : <circle cx="15" cy="5" r="4" fill={s.color} />}</svg>
            {s.name}
          </span>
        ))}
        {linea !== undefined && <span><svg width="30" height="10" aria-hidden><line x1="0" x2="30" y1="5" y2="5" stroke="var(--warn)" strokeWidth="2" strokeDasharray="6 4" /></svg>{refLabel}</span>}
      </p>
    </>
  );
}

/* ——— tarjeta de indicador ——— */
export function Tile({ label, hint, a, b, unit, digits = 1, lowerIsBetter = true, sub }: {
  label: string; hint: string; a: Kpi; b?: Kpi; unit: string; digits?: number; lowerIsBetter?: boolean; sub?: string;
}) {
  const fmtv = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const d = b ? b.media - a.media : 0;
  const better = lowerIsBetter ? d < 0 : d > 0;
  const same = !b || Math.abs(d) < 10 ** -digits / 2;
  return (
    <div className="tile">
      <div className="tl">{label}<Hint left>{hint}</Hint></div>
      <div className="tv">{fmtv(b ? b.media : a.media)}<small>{unit}</small></div>
      {b
        ? <div className={`td ${same ? '' : better ? 'good' : 'bad'}`}>{same ? 'sin cambio' : `${d > 0 ? '▲' : '▼'} ${fmtv(Math.abs(d))} frente a ${fmtv(a.media)} (${better ? 'mejora' : 'empeora'})`}</div>
        : <div className="td">{sub ?? `± ${fmtv(a.ic)} (IC 95%)`}</div>}
    </div>
  );
}


/* ——— barras verticales: una por categoría, con una línea de referencia opcional ——— */
export function Barras({ cats, vals, unit, label, color = 'var(--data)', alt = 'var(--c2)', resaltar = [], linea, lineaLabel, digits = 0, fmtv, maxY }: {
  cats: string[]; vals: number[]; unit: string; label: string; color?: string; alt?: string; resaltar?: number[];
  linea?: number; lineaLabel?: string; digits?: number; fmtv?: (v: number) => string; maxY?: number;
}) {
  const W = 620, H = 250, L = 52, R = 12, T = 16, B = 34;
  const top = Math.max(1e-9, ...vals, linea ?? 0) * 1.12;
  const nice = maxY ?? (() => { const p = 10 ** Math.floor(Math.log10(top)); const m = top / p; return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => m <= x) ?? 10) * p; })();
  const bw = (W - L - R) / cats.length, sy = (y: number) => H - B - (y / nice) * (H - T - B);
  const f = fmtv ?? ((v: number) => v.toLocaleString('en-US', { maximumFractionDigits: digits }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="boxsvg" role="img" aria-label={label}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}><line x1={L} x2={W - R} y1={sy(t * nice)} y2={sy(t * nice)} stroke="var(--hair)" />
          <text x={L - 6} y={sy(t * nice) + 4} className="ax" textAnchor="end">{f(t * nice)}</text></g>
      ))}
      {vals.map((v, i) => (
        <g key={i}>
          <rect x={L + i * bw + bw * 0.14} y={sy(v)} width={bw * 0.72} height={Math.max(0, H - B - sy(v))} fill={resaltar.includes(i) ? alt : color}>
            <title>{`${cats[i]}: ${f(v)} ${unit}`}</title>
          </rect>
          {cats.length <= 12 && <text x={L + i * bw + bw / 2} y={sy(v) - 4} className="ax" textAnchor="middle">{f(v)}</text>}
          <text x={L + i * bw + bw / 2} y={H - 16} className="ax" textAnchor="middle">{cats[i]}</text>
        </g>
      ))}
      {linea !== undefined && linea <= nice && (
        <g><line x1={L} x2={W - R} y1={sy(linea)} y2={sy(linea)} stroke="var(--warn)" strokeWidth="2" strokeDasharray="6 4" />
          <text x={W - R} y={sy(linea) - 5} className="ax" textAnchor="end" fill="var(--warn-ink)">{lineaLabel}</text></g>
      )}
      <text x={(L + W - R) / 2} y={H - 3} className="ax" textAnchor="middle">{unit}</text>
    </svg>
  );
}

/* ——— mapa de calor día × hora ——— */
export function Calor({ filas, cols, vals, label, unit }: { filas: string[]; cols: string[]; vals: number[][]; label: string; unit: string }) {
  const W = 620, L = 44, T = 22, cw = (W - L - 8) / cols.length, ch = 30, H = T + filas.length * ch + 8;
  const max = Math.max(1e-9, ...vals.flat());
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="boxsvg" role="img" aria-label={label}>
      {cols.map((c, j) => <text key={c} x={L + j * cw + cw / 2} y={14} className="ax" textAnchor="middle">{c}</text>)}
      {filas.map((fl, i) => (
        <g key={fl}>
          <text x={L - 8} y={T + i * ch + ch / 2 + 4} className="ax" textAnchor="end">{fl}</text>
          {vals[i].map((v, j) => (
            <g key={j}>
              <rect x={L + j * cw + 1} y={T + i * ch + 1} width={cw - 2} height={ch - 2} fill="var(--data)" fillOpacity={0.07 + 0.93 * (v / max)}>
                <title>{`${fl} ${cols[j]}: ${v.toFixed(1)} ${unit}`}</title>
              </rect>
              <text x={L + j * cw + cw / 2} y={T + i * ch + ch / 2 + 4} className="ax" textAnchor="middle" style={{ fill: v / max > 0.55 ? 'var(--on-data)' : 'var(--ink)' }}>{Math.round(v)}</text>
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}
