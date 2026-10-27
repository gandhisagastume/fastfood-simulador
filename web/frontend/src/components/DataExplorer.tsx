import { useEffect, useMemo, useState } from 'react';
import { companiesOf, loadProducts } from '../lib/data';
import type { Product } from '../lib/types';

const PAGE = 15;
type SortKey = 'Item' | 'Calories' | 'Sodium' | 'Sugars' | 'Protein';
const COLS: { k: SortKey; label: string; unit?: string }[] = [
  { k: 'Calories', label: 'Calorías', unit: 'kcal' },
  { k: 'Sodium', label: 'Sodio', unit: 'mg' },
  { k: 'Sugars', label: 'Azúcares', unit: 'g' },
  { k: 'Protein', label: 'Proteína', unit: 'g' }
];

export default function DataExplorer() {
  const [all, setAll] = useState<Product[] | null>(null);
  const [company, setCompany] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('Calories');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [err, setErr] = useState('');

  useEffect(() => {
    loadProducts().then(setAll).catch((e) => setErr(e instanceof TypeError ? 'No hay conexión con el backend.' : String(e.message ?? e)));
  }, []);
  useEffect(() => setPage(0), [company, q]);

  const companies = useMemo(() => (all ? companiesOf(all) : []), [all]);
  const sorted = useMemo(() => {
    const text = q.trim().toLowerCase();
    const rows = (all ?? []).filter((p) => (!company || p.Company === company) && (!text || p.Item.toLowerCase().includes(text)));
    return rows.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null) return 1; // vacíos siempre al final
      if (bv == null) return -1;
      return typeof av === 'string' ? av.localeCompare(bv as string) * sortDir : ((av as number) - (bv as number)) * sortDir;
    });
  }, [all, company, q, sortKey, sortDir]);

  const max = useMemo(() => Object.fromEntries(COLS.map((c) => [c.k, Math.max(1, ...(all ?? []).map((r) => Number(r[c.k] ?? 0)))])), [all]);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const view = sorted.slice(page * PAGE, page * PAGE + PAGE);

  const sortBy = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(k === 'Item' ? 1 : -1); }
  };
  const aria = (k: SortKey) => (sortKey === k ? (sortDir === 1 ? 'ascending' : 'descending') : 'none');

  return (
    <div className="panel">
      <div className="fields">
        <label>Cadena
          <select value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="">Todas</option>
            {companies.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Buscar producto
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Whopper, nuggets…" />
        </label>
      </div>
      {err && <p className="alert" role="alert">{err}</p>}
      <p className="note">{all ? `${sorted.length.toLocaleString('en-US')} productos. Las barras comparan cada valor con el máximo de todo el menú.` : 'Cargando…'}</p>
      <div className="tablewrap">
        <table className="data explorer">
          <thead><tr>
            <th scope="col" aria-sort={aria('Item')}><button onClick={() => sortBy('Item')}>Producto</button></th>
            {COLS.map((c) => (
              <th key={c.k} scope="col" className="num" aria-sort={aria(c.k)}>
                <button onClick={() => sortBy(c.k)}>{c.label}{c.unit && <small> {c.unit}</small>}</button>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={`${r.SourceLine}-${i}`}>
                <th scope="row">{r.Item}<small>{r.Company} · {r.Category}</small></th>
                {COLS.map((c) => {
                  const v = r[c.k];
                  return (
                    <td key={c.k} className="num bar">
                      {v == null ? <span className="na">sin dato</span> : <><i style={{ width: `${(Number(v) / max[c.k]) * 100}%` }} />{v}</>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {all && !view.length && <tr><td colSpan={5}>Ningún producto coincide. Prueba con otra palabra o quita la cadena.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</button>
        <span>Página {page + 1} de {pages}</span>
        <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
      </div>
    </div>
  );
}
