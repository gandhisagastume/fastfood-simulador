import { useState } from 'react';
import { api } from '../lib/api';
import { findings, fmt, fromSim, pct, varMeta, type Row, type VarMeta } from '../lib/stats';
import { Hint } from './Hint';
import { Legend, RangeStrip, StatTable } from './StatView';

// [id, nombre, ¿es un escenario To-Be comparable con el menú actual?]
const SC: [string, string, boolean][] = [
  ['C', 'Comparar cadenas', false], ['A', 'Todo el menú junto', false], ['B', 'Cadenas con igual peso', false],
  ['E5', 'Comparar tipos de producto', false], ['D', 'Con mis filtros', true], ['E3', 'Solo bajo sodio (menos de 800 mg)', true],
  ['E4', 'Solo alta proteína (20 g o más)', true], ['E1', 'Combo de 3 productos', false], ['E2', 'Pasarse de un umbral', false]
];
// Explicación sencilla de cada escenario, para el ícono (i).
const SC_HELP: Record<string, string> = {
  C: 'Simula cada cadena por separado: cada vez toma al azar un producto de esa cadena. Sirve para comparar cadenas entre sí.',
  A: 'Junta los productos de todas las cadenas y toma uno al azar. Las cadenas con más productos pesan más.',
  B: 'Primero elige una cadena al azar (todas igual de probables) y luego un producto de ella. Así McDonald’s no pesa más solo por tener más productos.',
  E5: 'Simula por tipo de producto (bebidas, postres, complementos y platos), para ver cuál sube más el valor.',
  D: 'Tú pones los límites (calorías, sodio o proteína) y solo entran productos que los cumplan. Se compara con el menú completo para ver el efecto de la regla.',
  E3: 'Solo entran productos con menos de 800 mg de sodio. Muestra cuánto bajaría el consumo de sodio con esa regla.',
  E4: 'Solo entran productos con 20 g o más de proteína. Sirve para ver qué otros nutrientes suben cuando se prioriza la proteína.',
  E1: 'Arma un combo: toma 3 productos al azar y suma el total, como una comida completa.',
  E2: 'Cuenta qué tan seguido un producto elegido al azar supera el umbral que pongas. Es la probabilidad de «pasarse».'
};
const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

type Last = { key: string; rows: Row[]; v: string; over?: number; id: number; baseId?: number; scenario: string; n: number; seed: number };

// Simulación Monte Carlo. Los escenarios con filtros (To-Be) se comparan con el menú completo (As-Is).
export default function Simulation({ v, meta, focus }: { v: string; meta: VarMeta; focus: string }) {
  const [sc, setSc] = useState('D');
  const [thr, setThr] = useState('');
  const [f, setF] = useState({ cal: '', sod: '', prot: '' });
  const [n, setN] = useState(10000);
  const [seed, setSeed] = useState(42);
  const [raw, setRaw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [last, setLast] = useState<Last | null>(null);

  const comparable = SC.find((s) => s[0] === sc)![2];
  const over = sc === 'E2' ? num(thr) ?? meta.threshold : num(thr);
  const body: any = { scenario: sc, variable: v, n, seed, filter: {} };
  if (over !== undefined) body.over = over;
  if (sc === 'D') {
    if (num(f.cal) !== undefined) body.filter.max_calories = num(f.cal);
    if (num(f.sod) !== undefined) body.filter.max_sodium = num(f.sod);
    if (num(f.prot) !== undefined) body.filter.min_protein = num(f.prot);
  }
  if (sc === 'E1') body.filter.combo = 3;
  const base = { scenario: 'A', variable: v, n, seed, filter: {} };
  const key = JSON.stringify(body);

  const run = async () => {
    setBusy(true); setErr('');
    try {
      const [alt, ref] = await Promise.all([api.simulate(body), comparable ? api.simulate(base) : Promise.resolve(null)]);
      let rows = fromSim(alt.results);
      if (ref) {
        const was = new Map(fromSim(ref.results).map((r) => [r.key, r]));
        rows = rows.map((r) => {
          const b = was.get(r.key);
          return b && b.mean ? { ...r, delta: (r.mean - b.mean) / b.mean, basePool: b.pool, baseP50: b.p50, baseP95: b.p95 } as Row : r;
        });
      }
      setLast({ key, rows, v, over, id: alt.run_id, baseId: ref?.run_id, scenario: sc, n, seed });
    } catch (e: any) {
      setErr(e instanceof TypeError ? 'Sin conexión con el backend.' : String(e.message ?? e));
    } finally { setBusy(false); }
  };

  const m = last ? varMeta(last.v) : meta;
  const stale = last !== null && last.key !== key;
  const all: any = last?.rows.find((r) => r.total);

  const lines = last ? findings(last.rows, m, last.over) : [];
  if (all?.delta !== undefined) {
    lines.unshift(`Con esta regla quedan ${all.pool} de ${all.basePool} productos (${pct(all.pool / all.basePool)}). La mediana pasa de ${fmt(all.baseP50)} a ${fmt(all.p50)} ${m.unit} y el P95, de ${fmt(all.baseP95)} a ${fmt(all.p95)}.`);
  }

  return (
    <>
      <div className="fields">
        <label htmlFor="sim-sc"><span>Escenario<Hint title="¿Qué simula este escenario?" left>{SC_HELP[sc]}</Hint></span>
          <select id="sim-sc" value={sc} onChange={(e) => setSc(e.target.value)}>{SC.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select>
        </label>
        {sc === 'D' && <>
          <label htmlFor="sim-cal"><span>Máx. calorías<Hint left>Deja fuera los productos con más calorías que este número. Vacío = sin límite.</Hint></span><input id="sim-cal" inputMode="numeric" value={f.cal} onChange={(e) => setF({ ...f, cal: e.target.value })} placeholder="sin límite" /></label>
          <label htmlFor="sim-sod"><span>Máx. sodio (mg)<Hint left>Deja fuera los productos con más sodio que este número. La recomendación diaria ronda los 2,300 mg.</Hint></span><input id="sim-sod" inputMode="numeric" value={f.sod} onChange={(e) => setF({ ...f, sod: e.target.value })} placeholder="sin límite" /></label>
          <label htmlFor="sim-prot"><span>Mín. proteína (g)<Hint>Solo deja los productos con al menos esta proteína. Vacío = sin mínimo.</Hint></span><input id="sim-prot" inputMode="numeric" value={f.prot} onChange={(e) => setF({ ...f, prot: e.target.value })} placeholder="sin límite" /></label>
        </>}
        {sc === 'E2' && <label htmlFor="sim-thr"><span>Umbral ({meta.unit})<Hint>El valor que no quieres pasar. El resultado dice qué porcentaje de las elecciones al azar lo supera.</Hint></span><input id="sim-thr" inputMode="numeric" value={thr} onChange={(e) => setThr(e.target.value)} placeholder={String(meta.threshold)} /></label>}
        <button className="btn" onClick={run} disabled={busy}>{busy ? 'Simulando…' : stale ? 'Actualizar' : 'Simular'}</button>
      </div>
      <p className="note">
        {comparable ? 'Se compara con el menú completo (As-Is), simulado con la misma semilla.' : 'Este escenario describe el menú actual (As-Is): no hay con qué compararlo.'}
      </p>
      <details className="adv">
        <summary>Opciones avanzadas y cómo reproducir</summary>
        <div className="fields">
          <label htmlFor="sim-n"><span>Repeticiones<Hint left>Cuántas veces se elige un producto al azar. Más repeticiones dan un resultado más estable, pero tardan más. 10,000 es un buen punto.</Hint></span><input id="sim-n" type="number" min={100} max={100000} step={1000} value={n} onChange={(e) => setN(Number(e.target.value))} /></label>
          <label htmlFor="sim-seed"><span>Semilla<Hint left>Número que arranca el azar. Misma semilla y mismos ajustes dan siempre el mismo resultado; así cualquiera puede repetir la corrida.</Hint></span><input id="sim-seed" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} /></label>
          {sc !== 'E2' && <label htmlFor="sim-mark"><span>Marcar umbral ({meta.unit})<Hint left>Dibuja una línea en el valor que pongas y muestra qué porcentaje de productos lo pasa. Es opcional.</Hint></span><input id="sim-mark" inputMode="numeric" value={thr} onChange={(e) => setThr(e.target.value)} placeholder="ninguno" /></label>}
        </div>
        <p className="note">Misma semilla y mismos ajustes dan siempre el mismo resultado.</p>
        <pre className="repro">{`curl -X POST $API/api/simulate \\\n  -H 'Content-Type: application/json' \\\n  -d '${key}'`}</pre>
      </details>

      {err && <p className="alert" role="alert">{err}</p>}
      {stale && <p className="stale">Cambiaste la configuración. Pulsa «Actualizar» para ver el resultado nuevo.</p>}
      {!last && !err && <p className="note">Elige un escenario y pulsa «Simular».</p>}
      {last && (
        <>
          <h3 className="rhead">Resultado<Hint title="Cómo leerlo" left>Cada fila es un grupo. La barra va del valor bajo al alto: la caja es donde está la mitad central de las elecciones, la marca gruesa es la mediana y el número grande es la media. P95 es el valor que el 95% no supera. Si hay «Δ», es el cambio frente al menú completo.</Hint></h3>
          <ul className="findings">{lines.map((l, i) => <li key={i}><mark>{l}</mark></li>)}</ul>
          <div className="seg" role="group" aria-label="Forma de ver">
            <button aria-pressed={!raw} onClick={() => setRaw(false)}>Lectura</button>
            <button aria-pressed={raw} onClick={() => setRaw(true)}>Números crudos</button>
          </div>
          {raw
            ? <StatTable rows={last.rows} meta={m} over={last.over} />
            : <><RangeStrip rows={last.rows} meta={m} over={last.over} focus={last.scenario === 'E5' ? '' : focus} /><Legend meta={m} over={last.over} /></>}
          <p className="note">Corrida #{last.id}{last.baseId ? ` (y #${last.baseId} como referencia)` : ''} guardada: {last.n.toLocaleString('en-US')} repeticiones, semilla {last.seed}.</p>
        </>
      )}
    </>
  );
}
