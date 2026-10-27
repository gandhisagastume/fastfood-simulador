import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { fmt, pct } from '../lib/stats';
import { Card } from './Charts';

const signed = (x: number) => `${x > 0 ? '+' : ''}${pct(x)}`;

function Bar({ share }: { share: number }) {
  return <span className="qbar"><i style={{ width: pct(share), background: 'var(--data)' }} /></span>;
}

export default function Propose() {
  const [rec, setRec] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.recommend().then(setRec).catch((e) => setErr(String(e.message ?? e))); }, []);
  if (err) return <p className="alert" role="alert">{err}</p>;
  if (!rec) return <p className="note" aria-busy>Calculando la propuesta…</p>;

  const b = rec.baseline, best = rec.best;
  const lead = (id: 'over_calories' | 'over_sodium' | 'over_sugars') => [...rec.concentration].sort((x: any, y: any) => y[id] - x[id])[0];
  const cal = lead('over_calories'), sod = lead('over_sodium'), sug = lead('over_sugars');

  return (
    <div className="dgrid">
      {best && (
        <section className="panel chart span2 verdict">
          <h2>Propuesta</h2>
          <p className="lead">
            Priorizar productos con <b>{best.label}</b>. Deja el {pct(best.retained)} del menú, con al menos un producto en cada cadena,
            baja el costo nutricional {pct(Math.abs(best.d_cost))} y {best.d_benefit < 0 ? `reduce el beneficio ${pct(Math.abs(best.d_benefit))}` : `sube el beneficio ${pct(best.d_benefit)}`}.
            El balance pasa de {fmt(b.balance)} a {fmt(best.balance)} puntos de valor diario.
          </p>
          <p className="note">Calculado sobre los {b.pool.toLocaleString('en-US')} productos con datos completos. El costo es nutricional: el CSV no trae precios.</p>
        </section>
      )}

      <Card title="Dónde se concentra el exceso" wide
        insight={`${cal.company} lidera las calorías altas (${pct(cal.over_calories)} de su menú pasa de 600 kcal), ${sod.company} el sodio (${pct(sod.over_sodium)} pasa de 800 mg) y ${sug.company} los azúcares (${pct(sug.over_sugars)} pasa de 15 g).`}
        what="Para cada cadena, qué parte de su menú supera el umbral de referencia en calorías, sodio y azúcares. Los umbrales son cerca del 30% del valor diario."
        how="Cada barra es el porcentaje de productos de la cadena que pasa el umbral. Más larga, más concentrado el exceso. Está ordenado de la cadena con más exceso a la que menos.">
        <div className="tablewrap">
          <table className="data conc">
            <thead><tr><th scope="col">Cadena</th><th scope="col">Más de 600 kcal</th><th scope="col">Más de 800 mg de sodio</th><th scope="col">Más de 15 g de azúcares</th></tr></thead>
            <tbody>
              {rec.concentration.map((c: any) => (
                <tr key={c.company}>
                  <th scope="row">{c.company}<small>{c.n} productos</small></th>
                  {(['over_calories', 'over_sodium', 'over_sugars'] as const).map((k) => <td key={k}><Bar share={c[k]} /><span className="qv">{pct(c[k])}</span></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Reglas de selección y costo-beneficio" wide
        insight={best && `La regla «${best.label}» tiene el mejor balance entre las ${rec.rules.length} que cumplen las condiciones; se descartaron ${rec.discarded}.`}
        what="Compara reglas del tipo «solo productos con hasta X kcal» contra el menú completo. Para cada una mide cuánto cuesta y cuánto aporta nutricionalmente lo que queda."
        how="Costo: promedio del porcentaje del valor diario de calorías, sodio, azúcares y grasa saturada. Beneficio: lo mismo para proteína y fibra. Balance: beneficio menos costo. Interesan reglas que bajen el costo sin perder demasiado beneficio, y que dejen productos en todas las cadenas.">
        <div className="tablewrap">
          <table className="data">
            <thead><tr>
              <th scope="col">Regla</th><th className="num">Productos</th><th className="num">Costo</th><th className="num">Beneficio</th>
              <th className="num">Balance</th><th className="num">Δ costo</th><th className="num">Δ beneficio</th>
            </tr></thead>
            <tbody>
              <tr className="base">
                <th scope="row">{b.label}</th><td className="num">{b.pool.toLocaleString('en-US')}</td>
                <td className="num">{fmt(b.cost)}</td><td className="num">{fmt(b.benefit)}</td><td className="num">{fmt(b.balance)}</td><td className="num">—</td><td className="num">—</td>
              </tr>
              {rec.rules.slice(0, 8).map((r: any) => (
                <tr key={r.label} className={best && r.label === best.label ? 'best' : ''}>
                  <th scope="row">{r.label}{best && r.label === best.label && <small>Recomendada</small>}</th>
                  <td className="num">{r.pool.toLocaleString('en-US')}<small>{pct(r.retained)}</small></td>
                  <td className="num">{fmt(r.cost)}</td><td className="num">{fmt(r.benefit)}</td><td className="num">{fmt(r.balance)}</td>
                  <td className="num">{signed(r.d_cost)}</td><td className="num">{signed(r.d_benefit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="adv">
          <summary>Cómo se calcula</summary>
          <ul className="method">{rec.method.map((m: string) => <li key={m}>{m}</li>)}</ul>
        </details>
      </Card>

      <Card title="Mejor comida por cadena" wide
        insight="Un plato, una bebida y un postre de la misma cadena, con entre 400 y 900 kcal y hasta 1,500 mg de sodio, elegidos por el mejor balance."
        what="Un ejemplo concreto de la propuesta: la comida completa que mejor equilibra beneficio y costo en cada cadena."
        how="Se probaron todas las combinaciones posibles de plato, bebida y postre de cada cadena, y se quedó la de mayor balance dentro de los límites. Son porciones reales: no cuentan sobres ni aderezos.">
        <ul className="combos">
          {rec.combos.map((c: any) => (
            <li key={c.company}>
              <b>{c.company}</b>
              <span>{c.plate}</span><span>{c.drink}</span><span>{c.dessert}</span>
              <small>{fmt(c.calories)} kcal · {fmt(c.sodium)} mg de sodio · {fmt(c.protein)} g de proteína</small>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
