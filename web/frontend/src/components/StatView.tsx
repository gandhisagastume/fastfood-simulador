import { useState } from 'react';
import { fmt, niceMax, pct, type Row, type VarMeta } from '../lib/stats';

// Franja de distribución: caja = mitad central (P25–P75), marca = mediana, línea = hasta P95.
export function RangeStrip({ rows, meta, over, focus }: { rows: Row[]; meta: VarMeta; over?: number; focus?: string }) {
  const max = niceMax(Math.max(...rows.map((r) => r.p95), over ?? 0));
  const at = (v: number) => `${(v / max) * 100}%`;
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
  return (
    <div className="strip" role="list">
      <div className="srow shead" aria-hidden>
        <span />
        <div className="axis">{ticks.map((t) => <span key={t}>{fmt(t)}</span>)}</div>
        <span className="val">mediana</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.key}
          role="listitem"
          className={`srow${r.total ? ' total' : ''}${focus && !r.total && r.key !== focus ? ' dim' : ''}`}
          aria-label={`${r.label}: mediana ${fmt(r.p50)} ${meta.unit}, mitad central entre ${fmt(r.p25)} y ${fmt(r.p75)}, 1 de 20 pasa de ${fmt(r.p95)}`}
        >
          <span className="lab">{r.label}<small>{r.pool !== undefined ? `${r.pool.toLocaleString('en-US')} productos` : `${r.n.toLocaleString('en-US')} datos`}</small></span>
          <div className="track">
            <i className="whisk" style={{ left: at(r.p75), width: `calc(${at(r.p95)} - ${at(r.p75)})` }} />
            <i className="cap" style={{ left: at(r.p95) }} />
            <i className="box" style={{ left: at(r.p25), width: `calc(${at(r.p75)} - ${at(r.p25)})` }} />
            <i className="med" style={{ left: at(r.p50) }} />
            {over !== undefined && <i className="thr" style={{ left: at(over) }} />}
          </div>
          <span className="val">{fmt(r.p50)}<small>{meta.unit}</small>{r.pOver !== undefined && over !== undefined && <em>{pct(r.pOver)} &gt; {fmt(over)}</em>}{r.delta !== undefined && <em className="delta">{r.delta > 0 ? '+' : ''}{pct(r.delta)} vs actual</em>}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ over, meta }: { over?: number; meta: VarMeta }) {
  return (
    <p className="legend">
      <span><i className="k-box" />Mitad central de los resultados</span>
      <span><i className="k-med" />Mediana</span>
      <span><i className="k-whisk" />Hasta el valor que solo 1 de cada 20 supera</span>
      {over !== undefined && <span><i className="k-thr" />Umbral: {fmt(over)} {meta.unit}</span>}
    </p>
  );
}

// Los mismos números sin interpretar. Para quien quiere auditar.
export function StatTable({ rows, meta, over }: { rows: Row[]; meta: VarMeta; over?: number }) {
  const showOver = over !== undefined && rows.some((r) => r.pOver !== undefined);
  const showDelta = rows.some((r) => r.delta !== undefined);
  return (
    <div className="tablewrap">
      <table className="data">
        <caption className="sr">Estadísticas de {meta.label.toLowerCase()} en {meta.unit}</caption>
        <thead><tr>
          <th scope="col">Grupo</th><th className="num">n</th><th className="num">Media</th><th className="num">DE</th>
          <th className="num">P25</th><th className="num">P50</th><th className="num">P75</th><th className="num">P95</th>
          {showOver && <th className="num">P(&gt;{fmt(over!)})</th>}
          {showDelta && <th className="num">Δ media</th>}
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              <td className="num">{r.n.toLocaleString('en-US')}</td>
              <td className="num">{fmt(r.mean)}</td><td className="num">{fmt(r.sd)}</td>
              <td className="num">{fmt(r.p25)}</td><td className="num">{fmt(r.p50)}</td>
              <td className="num">{fmt(r.p75)}</td><td className="num">{fmt(r.p95)}</td>
              {showOver && <td className="num">{r.pOver !== undefined ? pct(r.pOver) : '—'}</td>}
              {showDelta && <td className="num">{r.delta !== undefined ? `${r.delta > 0 ? '+' : ''}${pct(r.delta)}` : '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Alterna entre la lectura visual y los números crudos.
export function StatView({ rows, meta, over }: { rows: Row[]; meta: VarMeta; over?: number }) {
  const [raw, setRaw] = useState(false);
  return (
    <div>
      <div className="seg" role="group" aria-label="Forma de ver los resultados">
        <button aria-pressed={!raw} onClick={() => setRaw(false)}>Lectura</button>
        <button aria-pressed={raw} onClick={() => setRaw(true)}>Números crudos</button>
      </div>
      {raw ? <StatTable rows={rows} meta={meta} over={over} /> : <><RangeStrip rows={rows} meta={meta} over={over} /><Legend over={over} meta={meta} /></>}
    </div>
  );
}
