import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { colorOf, companiesOf, loadProducts, rowsFor } from '../lib/data';
import { fmt, pct, VARS, varMeta } from '../lib/stats';
import type { Product } from '../lib/types';
import Explore from './Explore';
import Propose from './Propose';
import Simulate from './Simulate';

const TABS = [['explorar', 'Explorar'], ['simular', 'Simular'], ['propuesta', 'Propuesta']] as const;
type Tab = (typeof TABS)[number][0];
type Q = Record<string, { valid: number; total: number; missing: number }>;

function Skeleton() {
  return <div aria-busy aria-label="Cargando" className="dash">{[0, 1, 2].map((i) => <div key={i} className="panel skel"><i /><i /><i /><i /></div>)}</div>;
}

export default function Dashboard() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [quality, setQuality] = useState<Q | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('explorar');
  const [v, setV] = useState('calories');
  const [focus, setFocus] = useState('');

  useEffect(() => {
    const h = location.hash.slice(1) as Tab;
    if (TABS.some((t) => t[0] === h)) setTab(h);
    loadProducts().then(setProducts).catch((e) => setErr(e instanceof TypeError ? 'No hay conexión con el backend. Levanta el proyecto con docker compose up.' : String(e.message ?? e)));
    api.completeness().then(setQuality).catch(() => {});
  }, []);
  const go = (t: Tab) => { setTab(t); history.replaceState(null, '', `#${t}`); };

  const companies = useMemo(() => (products ? companiesOf(products) : []), [products]);
  const meta = varMeta(v);
  const median = useMemo(() => (products ? rowsFor(products, v).find((r) => r.total)?.p50 : undefined), [products, v]);

  if (err) return <p className="alert" role="alert">{err}</p>;
  if (!products) return <Skeleton />;

  const q = quality?.[v];
  const shared = { products, v, meta, focus, companies };
  const nutrients = VARS.filter((x) => x.id !== 'cost' && x.id !== 'benefit');
  const indices = VARS.filter((x) => x.id === 'cost' || x.id === 'benefit');

  return (
    <div className="dash">
      <div className="controls">
        <div className="controls-inner">
          <div role="tablist" aria-label="Secciones" className="tabs">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => go(id)}>{label}</button>
            ))}
          </div>
          {tab !== 'propuesta' && (
            <>
              <label className="measure">Medida
                <select value={v} onChange={(e) => setV(e.target.value)}>
                  <optgroup label="Nutrientes">{nutrients.map((x) => <option key={x.id} value={x.id}>{x.label} ({x.unit})</option>)}</optgroup>
                  <optgroup label="Índices nutricionales">{indices.map((x) => <option key={x.id} value={x.id}>{x.label} ({x.unit})</option>)}</optgroup>
                </select>
              </label>
              <fieldset className="chips chains">
                <legend>Resaltar</legend>
                <label><input type="radio" name="focus" checked={focus === ''} onChange={() => setFocus('')} /><span>Todas</span></label>
                {companies.map((c) => (
                  <label key={c}><input type="radio" name="focus" checked={focus === c} onChange={() => setFocus(c)} />
                    <span><i className="dot" style={{ background: colorOf(c, companies) }} />{c}</span></label>
                ))}
              </fieldset>
            </>
          )}
        </div>
      </div>

      {tab !== 'propuesta' && (
        <p className="facts">
          <span><b>{products.length.toLocaleString('en-US')}</b> productos</span>
          <span><b>{companies.length}</b> cadenas</span>
          <span><b>{median !== undefined ? fmt(median) : '—'}</b> {meta.unit} de mediana en {meta.label.toLowerCase()}</span>
          <span><b>{q ? pct(q.valid / q.total) : '—'}</b> con dato</span>
        </p>
      )}

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'explorar' && <Explore {...shared} />}
        {tab === 'simular' && <Simulate {...shared} />}
        {tab === 'propuesta' && <Propose />}
      </div>
      <p className="note">Datos del menú publicado, no ventas ni consumo real. Los valores «&lt;5» se tratan como 2.5.</p>
    </div>
  );
}
