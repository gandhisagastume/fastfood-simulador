import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { fmt, pct, type VarMeta } from '../lib/stats';
import { Hint } from './Hint';

const CURVES = [
  ['empirical', 'Empírica (datos)', 'var(--ink)', 3],
  ['normal', 'Normal', 'var(--c2)', 1.8],
  ['lognormal', 'Lognormal', 'var(--c5)', 1.8],
  ['exponential', 'Exponencial', 'var(--c4)', 1.8],
  ['gamma', 'Gamma', 'var(--c3)', 1.8]
] as const;

/* Ajuste de distribuciones: ¿alguna distribución conocida describe la variable? */
export function useFit(v: string, company: string) {
  const [fit, setFit] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    setFit(null); setErr('');
    api.fit(v, company).then((r) => live && setFit(r)).catch((e) => live && setErr(String(e.message ?? e).replace(/^API \d+: /, '')));
    return () => { live = false; };
  }, [v, company]);
  return { fit, err };
}

export function FitBody({ fit, err, meta }: { fit: any; err: string; meta: VarMeta }) {
  if (err) return <p className="alert" role="alert">{err}</p>;
  if (!fit) return <p className="note">Ajustando…</p>;
  const W = 620, H = 300, L = 40, R = 10, T = 10, B = 30;
  const top = fit.curve[fit.curve.length - 1].x;
  const sx = (x: number) => L + (x / top) * (W - L - R), sy = (y: number) => H - B - y * (H - T - B);
  return (
    <>
      <p className="insight"><mark>{fit.verdict}</mark></p>
      <svg viewBox={`0 0 ${W} ${H}`} className="boxsvg" role="img" aria-label={`Distribución acumulada de ${meta.label} frente a cuatro ajustes`}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}><line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} stroke="var(--hair)" /><text x={L - 6} y={sy(t) + 4} className="ax" textAnchor="end">{t * 100}%</text></g>
        ))}
        {[0, 1, 2, 3, 4].map((t) => <text key={t} x={sx((top / 4) * t)} y={H - 12} className="ax" textAnchor={t === 4 ? 'end' : 'middle'}>{fmt((top / 4) * t)}</text>)}
        <text x={(L + W - R) / 2} y={H - 1} className="ax" textAnchor="middle">{meta.label} ({meta.unit})</text>
        {[...CURVES].reverse().map(([k, , color, w]) => (
          <polyline key={k} fill="none" stroke={color} strokeWidth={w} points={fit.curve.map((p: any) => `${sx(p.x)},${sy(p[k])}`).join(' ')} />
        ))}
      </svg>
      <p className="legend">{CURVES.map(([k, name, color]) => <span key={k}><i className="dot" style={{ background: color }} />{name}</span>)}</p>
      <div className="tablewrap">
        <table className="data">
          <caption className="sr">Bondad de ajuste por distribución</caption>
          <thead><tr><th scope="col">Distribución</th><th scope="col">Parámetros</th><th className="num">D (KS)<Hint title="D (prueba KS)" left>La mayor distancia entre la curva de los datos y la de la distribución. Cuanto más cerca de 0, mejor; si es menor que el valor crítico (abajo), la distribución ajusta.</Hint></th><th className="num">AIC<Hint title="AIC" left>Puntaje para comparar distribuciones: gana la más baja. Se usa de apoyo cuando D no decide.</Hint></th><th scope="col">¿Ajusta?</th></tr></thead>
          <tbody>
            {fit.fits.map((f: any) => (
              <tr key={f.dist}>
                <th scope="row">{f.dist}</th>
                <td>{Object.entries(f.params).map(([k, x]) => `${k} ${Number((x as number).toPrecision(3))}`).join(' · ')}</td>
                <td className="num">{f.ks_d.toFixed(3)}</td><td className="num">{Math.round(f.aic).toLocaleString('en-US')}</td>
                <td>{f.accept ? 'Sí' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        {fit.n.toLocaleString('en-US')} productos con valor mayor que 0{fit.zeros > 0 && ` (se excluyeron ${fit.zeros} con valor 0, que estas distribuciones no admiten)`}.
        Se acepta un ajuste si D ≤ {fit.d_crit.toFixed(3)} (Kolmogorov-Smirnov al 5%, criterio conservador porque los parámetros salen de los mismos datos).
      </p>
    </>
  );
}

/* Validación: ¿el modelo reproduce lo real, y mejora al repetir más veces? */
export function Validation({ v, meta }: { v: string; meta: VarMeta }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    setRows(null); setErr('');
    api.validate(v).then((r) => live && setRows(r)).catch((e) => live && setErr(String(e.message ?? e)));
    return () => { live = false; };
  }, [v]);
  if (err) return <p className="alert" role="alert">{err}</p>;
  if (!rows) return <p className="note">Validando…</p>;

  const ns = [...new Set(rows.map((r) => r.n))] as number[];
  const labels = [...new Set(rows.map((r) => r.company))] as string[];
  const cell = (c: string, n: number) => rows.find((r) => r.company === c && r.n === n);
  const at = (n: number) => rows.filter((r) => r.n === n);
  const inCI = at(10000).filter((r) => r.in_ci).length;
  const worst = Math.max(...at(10000).map((r) => Math.abs(r.rel_diff)));
  const ksMax = Math.max(...at(20000).map((r) => r.ks_d));

  return (
    <>
      <p className="insight"><mark>
        Con 10,000 repeticiones, {inCI} de {at(10000).length} medias simuladas caen dentro del intervalo de confianza del 95% de la media real; la mayor diferencia es {pct(worst)}.
        La distribución simulada se separa de la real a lo más {ksMax.toFixed(3)} (KS).
      </mark></p>
      <div className="tablewrap">
        <table className="data">
          <caption className="sr">Diferencia relativa entre la media simulada y la real según el número de repeticiones</caption>
          <thead><tr>
            <th scope="col">Grupo</th><th className="num">Media real<Hint left>Promedio de los productos reales del grupo. Es la referencia contra la que se compara la simulación.</Hint></th>
            {ns.map((n) => <th key={n} className="num">{n.toLocaleString('en-US')} rep.</th>)}
          </tr></thead>
          <tbody>
            {labels.map((c) => (
              <tr key={c}>
                <th scope="row">{c === 'ALL' ? 'Todo el menú' : c}</th>
                <td className="num">{fmt(cell(c, ns[0]).real_mean)} {meta.unit}</td>
                {ns.map((n) => {
                  const r = cell(c, n);
                  return (
                    <td key={n} className={`num ${r.in_ci ? 'okc' : 'badc'}`} title={`z = ${r.z.toFixed(2)} · KS = ${r.ks_d.toFixed(3)}`}>
                      {r.rel_diff > 0 ? '+' : ''}{pct(r.rel_diff)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">Verde: la media simulada está dentro del intervalo de confianza del 95% de la real (|z| ≤ 1.96). Pasa el cursor sobre una celda para ver z y KS. Al subir las repeticiones la diferencia tiende a 0.</p>
    </>
  );
}
