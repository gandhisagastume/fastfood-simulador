import { useEffect, useState } from 'react';
import { api, BASE } from '../lib/api';
import { fmt, pct } from '../lib/stats';
import { Card } from './Charts';

// Reporte de limpieza + diccionario de datos + descargas del dataset limpio.
export default function DataQuality() {
  const [rep, setRep] = useState<any>(null);
  const [dict, setDict] = useState<{ entries: any[]; notes: string[] } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    Promise.all([api.report(), api.dictionary()]).then(([r, d]) => { setRep(r); setDict(d); })
      .catch((e) => setErr(e instanceof TypeError ? 'No hay conexión con el backend.' : String(e.message ?? e)));
  }, []);
  if (err) return <p className="alert" role="alert">{err}</p>;
  if (!rep || !dict) return <p className="note" aria-busy>Cargando…</p>;

  const out = new Map<string, any>(rep.variables.map((q: any) => [q.id, q]));
  return (
    <div className="dgrid">
      <Card title="Limpieza del dataset" wide
        insight={`De ${rep.rows_total.toLocaleString('en-US')} filas del CSV, ${rep.rows_valid.toLocaleString('en-US')} son productos válidos y ${rep.rows_section} son filas de sección (sin ningún valor) que se excluyen. Hay ${rep.duplicates} duplicados exactos y ${rep.censored} productos con valores «<5».`}
        what="Qué se hizo con el CSV original para dejarlo listo para analizar, y qué se encontró."
        how="Nada se borra del original: las filas de sección, los duplicados y los atípicos se señalan. Abajo están las reglas aplicadas y, en la tabla, la completitud y los atípicos de cada variable.">
        <div className="dl">
          <a className="btn" href={`${BASE}/api/export/dataset.csv`} download>Descargar dataset limpio (CSV)</a>
          <a className="btn ghost" href={`${BASE}/api/export/dictionary.csv`} download>Descargar diccionario (CSV)</a>
        </div>
        <details className="adv">
          <summary>Reglas de limpieza aplicadas</summary>
          <ul className="method">{rep.rules.map((r: string) => <li key={r}>{r}</li>)}</ul>
          {rep.duplicate_examples?.length > 0 && <p className="note">Ejemplos de duplicados: {rep.duplicate_examples.join('; ')}.</p>}
        </details>
      </Card>

      <Card title="Diccionario de datos" wide
        what="Qué significa cada columna, su unidad, cuántos productos tienen el dato y el umbral de referencia que usa el panel."
        how="La barra muestra la completitud: qué parte de los productos trae el valor. «Atípicos» son productos fuera de 1.5 veces el rango intercuartil, señalados pero no borrados. El umbral es cerca del 30% del valor diario (FDA, dieta de 2 000 kcal).">
        <div className="tablewrap">
          <table className="data dict">
            <thead><tr>
              <th scope="col">Variable</th><th scope="col">Tipo y unidad</th><th scope="col">Completitud</th>
              <th className="num">Mín.</th><th className="num">Media</th><th className="num">Máx.</th>
              <th className="num">Atípicos</th><th className="num">Umbral</th>
            </tr></thead>
            <tbody>
              {dict.entries.map((e) => {
                const q = out.get(e.id);
                const num = e.type !== 'categórica nominal';
                return (
                  <tr key={e.id}>
                    <th scope="row">{e.id}<small>{e.description}</small></th>
                    <td>{e.type}{e.unit && ` · ${e.unit}`}</td>
                    <td><span className="qbar"><i style={{ width: pct(e.completeness), background: e.completeness < 0.8 ? 'var(--warn)' : 'var(--data)' }} /></span>
                      <span className="qv">{pct(e.completeness)}<small>{e.missing ? `faltan ${e.missing}` : 'completo'}</small></span></td>
                    <td className="num">{num ? fmt(e.min) : '—'}</td><td className="num">{num ? fmt(e.mean) : '—'}</td><td className="num">{num ? fmt(e.max) : '—'}</td>
                    <td className="num" title={q?.note}>{q ? (q.note ? 'n/a' : q.outliers) : '—'}</td>
                    <td className="num">{num && e.threshold_pct_dv ? <>{fmt(e.threshold)}<small>{e.threshold_pct_dv}% VD</small></> : num ? fmt(e.threshold) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="method">{dict.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </Card>
    </div>
  );
}
