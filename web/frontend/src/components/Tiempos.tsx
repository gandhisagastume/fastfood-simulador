import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { colorOf, companiesOf, loadProducts, summarize } from '../lib/data';
import {
  PEDIDO_MEDIO, TIEMPOS_BASE, TIPOS, menu, simular, tiempoProducto,
  type Config, type Kpi, type Resultado, type Tiempos as TiemposCfg
} from '../lib/colas';
import type { Product } from '../lib/types';
import { Card } from './Charts';
import { PorHora, Tile } from './ChartsTiempo';
import Faq from './Faq';
import { Hint } from './Hint';
import EnVivo from './EnVivo';
import Ventas from './Ventas';

const TABS = [['simulador', 'Simulador'], ['vivo', 'Escenarios y cajas'], ['ventas', 'Ventas y esperas'], ['datos', 'Tiempos de preparación']] as const;
type Tab = (typeof TABS)[number][0];

const num = (s: string, def: number, lo: number, hi: number) => {
  const x = Number(s.replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(x) ? def : Math.min(hi, Math.max(lo, x));
};
const f1 = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const f0 = (x: number) => Math.round(x).toLocaleString('en-US');
const mmss = (s: number) => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`;

const FAQ = [
  { q: '¿De dónde salen los tiempos?', a: 'El archivo del menú no trae tiempos, así que son supuestos: una bebida tarda unos 15 segundos, un plato unos 2 minutos, y cada cliente suma 40 segundos para pedir y pagar. Los puedes cambiar en la pestaña «Tiempos de preparación». Lo que sí es real es el menú.' },
  { q: '¿Qué es un puesto?', a: 'Una persona o estación que atiende a un cliente de principio a fin. Más puestos, menos fila.' },
  { q: '¿Qué simula?', a: 'Un día de 10:00 a 22:00. Llegan clientes (más a la hora de almuerzo y cena), piden productos del menú, hacen fila y los atienden. Si esperan demasiado, se van. Se repite el día muchas veces y se promedia.' },
  { q: '¿Qué hace «Probar una mejora»?', a: 'Corre otra simulación con los mismos clientes pero con más puestos o un menú de hasta 500 kcal, y te muestra cuánto cambia.' }
];

// Mejoras que se pueden probar: más puestos y/o un menú corto (los productos chicos se preparan más rápido).
const MEJORAS: { id: string; nombre: string; extra: number; kcal: number | null }[] = [
  { id: 'no', nombre: 'Ninguna', extra: 0, kcal: null },
  { id: 'p1', nombre: 'Un puesto más', extra: 1, kcal: null },
  { id: 'p2', nombre: 'Dos puestos más', extra: 2, kcal: null },
  { id: 'kcal', nombre: 'Menú corto (hasta 500 kcal)', extra: 0, kcal: 500 },
  { id: 'p1k', nombre: 'Un puesto más y menú corto', extra: 1, kcal: 500 }
];

interface Form { cadena: string; puestos: string; llegadas: string; mejora: string; paciencia: string; sla: string; reps: string; seed: string }
const FORM0: Form = { cadena: '', puestos: '3', llegadas: '40', mejora: 'p1', paciencia: '8', sla: '5', reps: '200', seed: '42' };

function toConfig(f: Form, t: TiemposCfg): Config {
  return {
    cadena: f.cadena, puestos: Math.round(num(f.puestos, 3, 1, 12)), llegadas: num(f.llegadas, 40, 1, 300),
    paciencia: num(f.paciencia, 8, 0, 120), sla: num(f.sla, 5, 0.5, 60), maxKcal: null, tiempos: t
  };
}

/* ——— simulador: se actualiza solo al cambiar cualquier dato ——— */
function Simulador({ productos, companies, t }: { productos: Product[]; companies: string[]; t: TiemposCfg }) {
  const [f, setF] = useState<Form>(FORM0);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const fd = useDeferredValue(f);
  const reps = Math.round(num(fd.reps, 200, 30, 1000)), seed = Math.round(num(fd.seed, 42, 0, 1e9));
  const mej = MEJORAS.find((m) => m.id === fd.mejora) ?? MEJORAS[0];
  const cfgA = toConfig(fd, t);
  const cfgB: Config | null = mej.id === 'no' ? null : { ...cfgA, puestos: Math.min(12, cfgA.puestos + mej.extra), maxKcal: mej.kcal };
  const key = JSON.stringify([cfgA, cfgB, reps, seed]);

  const out = useMemo(() => {
    const a = simular(productos, cfgA, reps, seed);
    const b = cfgB ? simular(productos, cfgB, reps, seed) : null;
    return a ? { a, b, ca: cfgA, cb: cfgB } : null;
  }, [productos, key]);
  const vacio = out === null;
  const [todo, setTodo] = useState(false);

  const lines = useMemo(() => {
    if (!out) return [] as string[];
    const { a, b, ca } = out;
    const peor = a.porHora.reduce((m, h) => (h.espera > m.espera ? h : m), a.porHora[0]);
    const l = [
      `Con ${ca.puestos} ${ca.puestos === 1 ? 'puesto' : 'puestos'}, un cliente espera ${f1(a.espera.media)} min en promedio. El ${f0(a.sla.media)}% espera ${f1(ca.sla)} min o menos y el ${f1(a.abandono.media)}% se va sin comprar.`,
      `La peor hora es a las ${peor.hora}:00, con ${f1(peor.espera)} min de espera.`
    ];
    if (b) l.unshift(`Con la mejora, la espera baja de ${f1(a.espera.media)} a ${f1(b.espera.media)} min y el abandono, de ${f1(a.abandono.media)}% a ${f1(b.abandono.media)}%.`);
    return l;
  }, [out]);

  return (
    <div className="dgrid">
      <Card title="Simulador de atención" wide
        what="Simula un día en el local: llegan clientes, hacen fila y los atienden. Muestra cuánto esperan y cuánto se vende."
        how="Cambia cualquier dato y el resultado se actualiza solo. Para probar una decisión, elige una mejora.">
        <div className="fields">
          <label htmlFor="t-cad"><span>Cadena<Hint left>De qué cadena son los productos que piden los clientes.</Hint></span>
            <select id="t-cad" value={f.cadena} onChange={set('cadena')}><option value="">Todas</option>{companies.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label htmlFor="t-pue"><span>Puestos<Hint left>Personas que atienden a la vez. Cada una toma el pedido, lo prepara y cobra.</Hint></span>
            <input id="t-pue" type="number" min={1} max={12} value={f.puestos} onChange={set('puestos')} /></label>
          <label htmlFor="t-lle"><span>Clientes por hora<Hint left>Promedio del día. En el almuerzo y la cena llegan más.</Hint></span>
            <input id="t-lle" type="number" min={1} max={300} value={f.llegadas} onChange={set('llegadas')} /></label>
          <label htmlFor="t-mej"><span>Probar una mejora<Hint>Compara contra la situación actual con los mismos clientes.</Hint></span>
            <select id="t-mej" value={f.mejora} onChange={set('mejora')}>{MEJORAS.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></label>
        </div>
        <details className="adv">
          <summary>Más opciones</summary>
          <div className="fields">
            <label htmlFor="t-pac"><span>Paciencia (min)<Hint left>Cuántos minutos aguanta un cliente en la fila antes de irse. Con 0 nadie se va.</Hint></span>
              <input id="t-pac" type="number" min={0} max={120} value={f.paciencia} onChange={set('paciencia')} /></label>
            <label htmlFor="t-sla"><span>Espera aceptable (min)<Hint left>Meta: un cliente está bien atendido si espera menos que esto.</Hint></span>
              <input id="t-sla" type="number" min={0.5} max={60} step={0.5} value={f.sla} onChange={set('sla')} /></label>
            <label htmlFor="t-reps"><span>Días simulados<Hint left>Más días dan un promedio más estable (mínimo 30).</Hint></span>
              <input id="t-reps" type="number" min={30} max={1000} step={50} value={f.reps} onChange={set('reps')} /></label>
            <label htmlFor="t-seed"><span>Semilla<Hint>Con la misma semilla el resultado es siempre igual.</Hint></span>
              <input id="t-seed" type="number" min={0} value={f.seed} onChange={set('seed')} /></label>
          </div>
        </details>
        <p className="note">Los tiempos y las llegadas son supuestos (el archivo no los trae). El menú sí es real.</p>
        {vacio && <p className="alert" role="alert">No quedan productos con esos datos. Elige otra cadena.</p>}
      </Card>

      {out && (
        <>
          <Card title="Resultado" wide
            what="El resumen del día, promedio de todos los días simulados."
            how={out.b ? 'El número grande es con la mejora. Debajo se ve cuánto cambió: verde es mejor, rojo es peor.' : 'El número grande es el promedio. Debajo, el margen de error.'}>
            <ul className="findings">{lines.map((l, i) => <li key={i}><mark>{l}</mark></li>)}</ul>
            <div className="tiles tiles4">
              <Tile label="Espera promedio" unit="min" a={out.a.espera} b={out.b?.espera} hint="Minutos en la fila antes de que lo atiendan." />
              <Tile label="Atendidos a tiempo" unit="%" digits={0} a={out.a.sla} b={out.b?.sla} lowerIsBetter={false} hint="Porcentaje que esperó menos del tiempo aceptable." />
              <Tile label="Se van sin comprar" unit="%" a={out.a.abandono} b={out.b?.abandono} hint="Porcentaje de clientes que abandona la fila." />
              <Tile label="Ventas por día" unit="Q" digits={0} a={out.a.ventas} b={out.b?.ventas} lowerIsBetter={false} hint="Dinero que entra en un día, en quetzales (precios supuestos)." />
            </div>
          </Card>

          <Card title="Espera por hora" wide
            what="Cuánto espera un cliente según la hora a la que llega."
            how="La línea roja es la espera aceptable. La fila se forma en los picos de almuerzo y cena.">
            <PorHora label="Espera promedio por hora de llegada" unit="min" linea={out.ca.sla} refLabel={`meta ${f1(out.ca.sla)} min`}
              series={[{ name: 'Actual', color: 'var(--data)', vals: out.a.porHora.map((h) => h.espera) },
                ...(out.b ? [{ name: 'Con la mejora', color: 'var(--c4)', dash: '7 4', sq: true, vals: out.b.porHora.map((h) => h.espera) }] : [])]} />
          </Card>

          <Card title="Qué tan ocupado está el personal" wide
            what="El porcentaje del tiempo que los puestos están trabajando, hora por hora."
            how="Cerca de 100% no hay descanso y se forma fila. Si baja mucho, sobra personal.">
            <PorHora label="Ocupación de los puestos por hora" unit="%" digits={0} maxY={100}
              series={[{ name: 'Actual', color: 'var(--data)', vals: out.a.porHora.map((h) => h.uso) },
                ...(out.b ? [{ name: 'Con la mejora', color: 'var(--c4)', dash: '7 4', sq: true, vals: out.b.porHora.map((h) => h.uso) }] : [])]} />
          </Card>

          <section className="panel span2">
            <button className="btn ghost" aria-expanded={todo} onClick={() => setTodo(!todo)}>{todo ? 'Ocultar los números' : 'Ver todos los números'}</button>
            {todo && (
              <div className="tablewrap" style={{ marginTop: 14 }}>
                <table className="data">
                  <caption className="sr">Indicadores de la simulación</caption>
                  <thead><tr><th scope="col">Indicador</th><th className="num">Actual</th>{out.b && <th className="num">Con la mejora</th>}</tr></thead>
                  <tbody>
                    {([
                      ['Clientes por día', 'clientes', 0, ''], ['Espera promedio', 'espera', 2, 'min'], ['Espera del 5% más lento', 'p95', 2, 'min'],
                      ['Clientes en cola (promedio)', 'cola', 2, ''], ['Atendidos a tiempo', 'sla', 1, '%'], ['Se van sin comprar', 'abandono', 1, '%'],
                      ['Ocupación del personal', 'uso', 1, '%'], ['Ventas por día', 'ventas', 0, 'Q'], ['Ventas perdidas por día', 'perdidas', 0, 'Q']
                    ] as [string, keyof Resultado, number, string][]).map(([n, k, d, u]) => {
                      const c = (x: Resultado) => { const v = x[k] as Kpi; return `${v.media.toFixed(d)} ± ${v.ic.toFixed(d)} ${u}`; };
                      return <tr key={k}><th scope="row">{n}</th><td className="num">{c(out.a)}</td>{out.b && <td className="num">{c(out.b)}</td>}</tr>;
                    })}
                  </tbody>
                </table>
                <p className="note">{out.a.reps} días simulados, semilla {seed}. Cada ± es el margen de error (95%). Revisión del modelo: la ley de Little da una diferencia de {(out.a.little * 100).toFixed(2)}%.</p>
              </div>
            )}
          </section>
        </>
      )}

      <Card title="Preguntas frecuentes" wide what="Respuestas cortas." how="Pulsa una pregunta.">
        <Faq items={FAQ} />
      </Card>
    </div>
  );
}

/* ——— datos con tiempos ——— */
function csvConTiempos(ps: Product[], t: TiemposCfg) {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = 'company,item,category,calories,sodium,sugars,protein,tiempo_prep_seg';
  const rows = ps.map((p) => [q(p.Company), q(p.Item), p.Category, p.Calories ?? '', p.Sodium ?? '', p.Sugars ?? '', p.Protein ?? '', Math.round(tiempoProducto(p, t))].join(','));
  return '﻿' + [head, ...rows].join('\n');
}

function Datos({ productos, companies, t, setT }: { productos: Product[]; companies: string[]; t: TiemposCfg; setT: (t: TiemposCfg) => void }) {
  const tipos = useMemo(() => TIPOS.map((tp) => {
    const xs = productos.filter((p) => p.Category === tp);
    return { ...summarize(xs.map((p) => tiempoProducto(p, t))), tp };
  }), [productos, t]);
  const cadenas = useMemo(() => companies.map((c) => {
    const xs = productos.filter((p) => p.Company === c).map((p) => tiempoProducto(p, t));
    const m = summarize(xs).mean;
    return { ...summarize(xs), c, item: m, pedido: t.pedido + PEDIDO_MEDIO * m };
  }), [productos, companies, t]);
  const maxPedido = Math.max(...cadenas.map((x) => x.pedido), 1);
  const descargar = () => {
    const url = URL.createObjectURL(new Blob([csvConTiempos(productos, t)], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'fastfood_con_tiempos.csv' });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const setBase = (tp: string, v: string) => setT({ ...t, base: { ...t.base, [tp]: num(v, TIEMPOS_BASE.base[tp as keyof typeof TIEMPOS_BASE.base], 1, 900) } });

  return (
    <div className="dgrid">
      <Card title="Tiempos de preparación" wide
        what="El menú no trae tiempos, así que se le agrega a cada producto un tiempo estimado de preparación."
        how="Cada tipo tiene un tiempo base que puedes cambiar. Los productos más grandes (más calorías) tardan un poco más.">
        <p className="aviso"><b>Son supuestos, no mediciones.</b> Si los cambias, todo se recalcula.</p>
        <div className="tablewrap">
          <table className="data">
            <caption className="sr">Tiempo de preparación por tipo de producto</caption>
            <thead><tr><th scope="col">Tipo de producto</th><th className="num">Productos</th>
              <th className="num">Base (seg)<Hint left>Segundos para preparar un producto típico de este tipo. Edítalo.</Hint></th>
              <th className="num">Estimado medio</th><th className="num">Mediana</th><th className="num">P95</th></tr></thead>
            <tbody>
              {tipos.map((x) => (
                <tr key={x.tp}>
                  <th scope="row">{x.tp}</th><td className="num">{f0(x.n)}</td>
                  <td className="num"><input aria-label={`Segundos base de ${x.tp}`} className="mini" inputMode="numeric" value={String(t.base[x.tp])} onChange={(e) => setBase(x.tp, e.target.value)} /></td>
                  <td className="num">{f0(x.mean)} s</td><td className="num">{f0(x.p50)} s</td><td className="num">{f0(x.p95)} s</td>
                </tr>
              ))}
              <tr>
                <th scope="row">Cada cliente<Hint left>Tiempo fijo por cliente para tomar el pedido y cobrar, sin importar qué pida. Varía ±40% al azar.</Hint></th><td className="num">—</td>
                <td className="num"><input aria-label="Segundos por cliente" className="mini" inputMode="numeric" value={String(t.pedido)} onChange={(e) => setT({ ...t, pedido: num(e.target.value, TIEMPOS_BASE.pedido, 0, 600) })} /></td>
                <td className="num">{f0(t.pedido)} s</td><td className="num">—</td><td className="num">—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="fields">
          <button className="btn ghost" onClick={() => setT({ base: { ...TIEMPOS_BASE.base }, pedido: TIEMPOS_BASE.pedido })}>Restablecer supuestos</button>
          <button className="btn" onClick={descargar}>Descargar CSV con tiempos</button>
        </div>
        
      </Card>

      <Card title="Cuánto tarda un pedido en cada cadena" wide
        what="Tiempo promedio de atender a un cliente: pedir y pagar, más sus productos."
        how="Barra más larga: cada cliente ocupa más tiempo un puesto. Pizza Hut solo tiene platos grandes, por eso es la más lenta.">
        <div className="tablewrap">
          <table className="data">
            <caption className="sr">Tiempo medio de un pedido por cadena</caption>
            <thead><tr><th scope="col">Cadena</th><th className="num">Productos</th><th className="num">Tiempo por producto</th><th scope="col">Pedido completo</th></tr></thead>
            <tbody>
              {[...cadenas].sort((a, b) => b.pedido - a.pedido).map((x) => (
                <tr key={x.c}>
                  <th scope="row"><i className="dot" style={{ background: colorOf(x.c, companies) }} />{x.c}</th>
                  <td className="num">{f0(x.n)}</td><td className="num">{f0(x.item)} s</td>
                  <td className="bcell"><span className="bar" style={{ width: `${(x.pedido / maxPedido) * 100}%`, background: colorOf(x.c, companies) }} /><b>{mmss(x.pedido)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ——— módulo ——— */
export default function Tiempos() {
  const [productos, setProductos] = useState<Product[] | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('simulador');
  const [t, setT] = useState<TiemposCfg>({ base: { ...TIEMPOS_BASE.base }, pedido: TIEMPOS_BASE.pedido });

  useEffect(() => {
    const h = location.hash.slice(1) as Tab;
    if (TABS.some((x) => x[0] === h)) setTab(h);
    loadProducts().then(setProductos).catch((e) => setErr(e instanceof TypeError ? 'No hay conexión con el backend. Levanta el proyecto con docker compose up.' : String(e.message ?? e)));
  }, []);
  const go = (x: Tab) => { setTab(x); history.replaceState(null, '', `#${x}`); };
  const companies = useMemo(() => (productos ? companiesOf(productos) : []), [productos]);

  if (err) return <p className="alert" role="alert">{err}</p>;
  if (!productos) return <div aria-busy aria-label="Cargando" className="dash">{[0, 1].map((i) => <div key={i} className="panel skel"><i /><i /><i /><i /></div>)}</div>;

  return (
    <div className="dash">
      <div className="controls"><div className="controls-inner">
        <div role="tablist" aria-label="Secciones" className="tabs">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" id={`tt-${id}`} aria-selected={tab === id} aria-controls={`tp-${id}`} onClick={() => go(id)}>{label}</button>
          ))}
        </div>
      </div></div>
      <p className="facts">
        <span><b>{productos.length.toLocaleString('en-US')}</b> productos del menú real</span>
        <span><b>{companies.length}</b> cadenas</span>
        <span><b>12</b> horas de atención (10:00 a 22:00)</span>
      </p>
      <div role="tabpanel" id={`tp-${tab}`} aria-labelledby={`tt-${tab}`}>
        {tab === 'simulador' && <Simulador productos={productos} companies={companies} t={t} />}
        {tab === 'vivo' && <EnVivo productos={productos} companies={companies} t={t} />}
        {tab === 'ventas' && <Ventas productos={productos} companies={companies} t={t} />}
        {tab === 'datos' && <Datos productos={productos} companies={companies} t={t} setT={setT} />}
      </div>
      <p className="note">Tiempos, llegadas y ventas salen del modelo con supuestos propios. El menú es el publicado.</p>
    </div>
  );
}
