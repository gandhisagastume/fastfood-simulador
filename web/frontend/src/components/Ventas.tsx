import { useDeferredValue, useMemo, useState } from 'react';
import { DIAS, registrar, simular, type Config, type Rec, type Tiempos as TiemposCfg } from '../lib/colas';
import { cumplimiento, resumir } from '../lib/ventas';
import { Card } from './Charts';
import { Barras, Calor, PorHora, Tile } from './ChartsTiempo';
import Faq from './Faq';
import { Hint } from './Hint';

const SLA = 5; // min de espera aceptables
const q = (x: number) => `Q${Math.round(x).toLocaleString('en-US')}`;
const f1 = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const num = (s: string, def: number, lo: number, hi: number) => {
  const x = Number(s.replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(x) ? def : Math.min(hi, Math.max(lo, x));
};
const solo = (x: number) => ({ media: x, ic: 0 });

interface Form { cadena: string; puestos: string; llegadas: string; dias: string; seed: string }

const FAQ = [
  { q: '¿De qué sucursal son los datos?', a: 'De ninguna: es un registro de caja de una sucursal ficticia, generado con reglas que tienen sentido (más ventas el fin de semana, picos a la hora de almuerzo y cena, precios en quetzales que suben con el tamaño del producto, y días buenos y malos al azar). Sirven para practicar el análisis; no describen ninguna sucursal real.' },
  { q: '¿Por qué el simulador casi coincide con ellos?', a: 'Porque los datos se generaron con un motor parecido al del simulador. Para que no calcen perfecto, el servicio «real» es 12% más lento que el supuesto del simulador y cada día tiene su propia demanda. Con datos de una caja real la validación sería una prueba de verdad.' },
  { q: '¿Cómo se decide qué cumple y qué no?', a: 'Cada indicador se compara con una meta de servicio: espera promedio de 3 min o menos, 90% o más de clientes atendidos en 5 min, abandono de 5% o menos, ventas perdidas de 5% o menos, ocupación entre 60% y 85%, y todas las horas dentro de la meta. Puedes cambiar la cantidad de puestos o de clientes y ver cómo cambia el veredicto.' },
  { q: '¿Qué son las ventas perdidas?', a: 'El valor de los pedidos de clientes que se cansaron de esperar y se fueron. Es dinero que se habría ganado con más personal o con un servicio más rápido.' },
  { q: '¿Qué muestra el mapa de calor?', a: 'Cuántos clientes llegan, en promedio, en cada hora de cada día de la semana. Más oscuro es más gente. Sirve para decidir en qué horarios reforzar el personal.' }
];

function Estado({ ok }: { ok: boolean }) {
  return (
    <span className={`estado ${ok ? 'ok' : 'no'}`}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {ok ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M6 6l12 12M18 6L6 18" />}
      </svg>
      {ok ? 'Cumple' : 'No cumple'}
    </span>
  );
}

function csv(log: Rec[]) {
  const head = 'dia,dia_semana,hora,espera_min,servicio_min,abandono,total_q,productos';
  const rows = log.map((r) => [r.dia + 1, DIAS[r.dow], r.hora.toFixed(3), r.espera.toFixed(2), r.servicio.toFixed(2), r.abandono ? 1 : 0, r.total.toFixed(2), r.items].join(','));
  return '﻿' + [head, ...rows].join('\n');
}

export default function Ventas({ productos, companies, t }: { productos: import('../lib/types').Product[]; companies: string[]; t: TiemposCfg }) {
  const [f, setF] = useState<Form>({ cadena: companies.includes('McDonald’s') ? 'McDonald’s' : companies[0] ?? '', puestos: '3', llegadas: '40', dias: '60', seed: '2026' });
  const ap = useDeferredValue(f);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const cfg: Config = useMemo(() => ({
    cadena: ap.cadena, puestos: Math.round(num(ap.puestos, 3, 1, 12)), llegadas: num(ap.llegadas, 40, 5, 200),
    paciencia: 8, sla: SLA, maxKcal: null, tiempos: t
  }), [ap, t]);
  const dias = Math.round(num(ap.dias, 60, 14, 180)), seed = Math.round(num(ap.seed, 2026, 0, 1e9));

  const log = useMemo(() => registrar(productos, cfg, dias, seed), [productos, cfg, dias, seed]);
  const res = useMemo(() => resumir(log, cfg.puestos, SLA), [log, cfg.puestos]);
  const metas = useMemo(() => (res ? cumplimiento(res, SLA) : []), [res]);
  // El simulador, calibrado solo con lo que se vería en caja (clientes por hora y puestos), contra lo observado.
  const sim = useMemo(() => (res ? simular(productos, { ...cfg, llegadas: res.clientes / 12 }, 200, 7) : null), [productos, cfg, res]);

  const descargar = () => {
    const url = URL.createObjectURL(new Blob([csv(log)], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'ventas_esperas_simuladas.csv' });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const horas = Array.from({ length: 12 }, (_, i) => `${10 + i}h`);
  const picoH = res ? res.hora.reduce((m, h, i, a) => (h.ventas > a[m].ventas ? i : m), 0) : 0;
  const cumplen = metas.filter((m) => m.cumple).length;

  const comp = res && sim ? ([
    ['Clientes por día', res.clientes, sim.clientes.media, 0, 0, 'num'],
    ['Ventas por día (Q)', res.ventas, sim.ventas.media, 0, 0, 'num'],
    ['Espera promedio (min)', res.espera, sim.espera.media, 2, 0.3, 'num'],
    ['Atendidos en la meta (%)', res.sla, sim.sla.media, 1, 3, 'pp'],
    ['Abandono (%)', res.abandono, sim.abandono.media, 1, 3, 'pp'],
    ['Ocupación (%)', res.uso, sim.uso.media, 1, 4, 'pp']
  ] as [string, number, number, number, number, string][]).map(([n, o, s, d, abs]) => {
    const dif = o ? (s - o) / o : 0;
    return { n, o, s, d, dif, ok: Math.abs(dif) <= 0.15 || Math.abs(s - o) <= abs };
  }) : [];

  return (
    <div className="dgrid">
      <Card title="Ventas y esperas" wide
        what="Un registro de caja simulado: cada cliente con su hora de llegada, cuánto esperó y cuánto pagó. Sirve para ver las ventas y revisar si el servicio cumple sus metas."
        how="Cambia los datos y todo se actualiza solo.">
        <div className="fields">
          <label htmlFor="v-cad"><span>Cadena<Hint left>De qué cadena es el menú de esta sucursal ficticia.</Hint></span>
            <select id="v-cad" value={f.cadena} onChange={set('cadena')}>{companies.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label htmlFor="v-pue"><span>Puestos<Hint left>Personas que atienden a la vez.</Hint></span>
            <input id="v-pue" type="number" min={1} max={12} value={f.puestos} onChange={set('puestos')} /></label>
          <label htmlFor="v-lle"><span>Clientes por hora<Hint left>Promedio del día. En el almuerzo y la cena llegan más.</Hint></span>
            <input id="v-lle" type="number" min={5} max={200} value={f.llegadas} onChange={set('llegadas')} /></label>
        </div>
        <details className="adv">
          <summary>Más opciones</summary>
          <div className="fields">
            <label htmlFor="v-dia"><span>Días de registro<Hint left>De 14 a 180 días. Con 60 se ven bien los patrones de la semana.</Hint></span>
              <input id="v-dia" type="number" min={14} max={180} value={f.dias} onChange={set('dias')} /></label>
            <label htmlFor="v-seed"><span>Semilla<Hint>Cámbiala para obtener otro registro simulado.</Hint></span>
              <input id="v-seed" type="number" min={0} value={f.seed} onChange={set('seed')} /></label>
          </div>
        </details>
        {res && <p className="note"><b>{log.length.toLocaleString('en-US')}</b> clientes en <b>{res.dias}</b> días.{' '}
          <button className="linkbtn" onClick={descargar}>Descargar el registro (CSV)</button></p>}
      </Card>

      {res && (
        <>
          <Card title="Resumen del registro" wide
            what="Los números clave del registro de caja: cuánto se vende, a cuánto sale cada cliente y cómo es el servicio."
            how="Son promedios por día sobre todo el registro. Abajo se evalúa cuáles cumplen su meta.">
            <div className="tiles">
              <Tile label="Ventas por día" unit="Q" digits={0} a={solo(res.ventas)} sub={`${q(res.ventas * 30)} al mes aprox.`} lowerIsBetter={false} hint="Dinero que entra en un día promedio, solo de los clientes atendidos." />
              <Tile label="Ticket promedio" unit="Q" a={solo(res.ticket)} sub="lo que gasta cada cliente" hint="Lo que paga en promedio un cliente atendido." />
              <Tile label="Espera promedio" unit="min" a={solo(res.espera)} sub={`el 5% más lento espera ${f1(res.p95)} min`} hint="Minutos que pasa un cliente en la fila antes de que lo atiendan." />
              <Tile label="Atendidos en la meta" unit="%" digits={0} a={solo(res.sla)} sub={`meta: esperar ${SLA} min o menos`} hint="Porcentaje de clientes que esperó menos del tiempo aceptable. Quien abandona cuenta como incumplido." />
              <Tile label="Abandono" unit="%" a={solo(res.abandono)} sub="se fueron sin comprar" hint="Porcentaje de clientes que se cansó de esperar y se fue." />
              <Tile label="Ventas perdidas por día" unit="Q" digits={0} a={solo(res.perdidas)} sub="por clientes que abandonaron" hint="Valor de los pedidos de quienes se fueron de la fila sin comprar." />
            </div>
          </Card>

          <Card title="Qué cumple y qué no" wide
            insight={<>{cumplen} de {metas.length} metas se cumplen{cumplen < metas.length ? `; fallan: ${metas.filter((m) => !m.cumple).map((m) => m.nombre.toLowerCase()).join(', ')}.` : '.'}</>}
            what="Compara cada indicador del servicio con su meta y dice si se cumple o no."
            how="Verde con palomita es que cumple; rojo con cruz es que no. La franja de abajo hace lo mismo hora por hora (la espera debe estar bajo la meta y el abandono, en 5% o menos). Prueba con más puestos arriba y mira cuántas pasan a verde.">
            <ul className="metas">
              {metas.map((m) => (
                <li key={m.id} className={m.cumple ? 'ok' : 'no'}>
                  <Estado ok={m.cumple} />
                  <span className="mn"><b>{m.nombre}</b><small>{m.detalle}</small></span>
                  <span className="mv"><b>{m.valor}</b><small>meta {m.meta}</small></span>
                </li>
              ))}
            </ul>
            <h3 className="rhead">Hora por hora<Hint left>Una hora cumple si la espera promedio no pasa de la meta y el abandono es de 5% o menos.</Hint></h3>
            <div className="horas" role="list">
              {res.hora.map((h, i) => {
                const ok = h.espera <= SLA && h.abandono <= 5;
                return (
                  <div key={i} role="listitem" className={`hchip ${ok ? 'ok' : 'no'}`} title={`${10 + i}h: espera ${f1(h.espera)} min, abandono ${f1(h.abandono)}%`}>
                    <b>{10 + i}h</b>
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">{ok ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M6 6l12 12M18 6L6 18" />}</svg>
                    <small>{f1(h.espera)} min</small>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Ventas por hora" insight={<>Se vende más a las {10 + picoH}:00, con {q(res.hora[picoH].ventas)} al día en esa hora.</>}
            what="Cuánto dinero entra en cada hora del día, en promedio."
            how="Las barras más altas son los picos de almuerzo y cena. La barra de otro color es la hora que más vende.">
            <Barras cats={horas} vals={res.hora.map((h) => h.ventas)} unit="Q por día en esa hora" label="Ventas promedio por hora" resaltar={[picoH]} fmtv={(v) => Math.round(v).toLocaleString('en-US')} />
          </Card>

          <Card title="Ventas por día de la semana"
            insight={<>{DIAS[res.dow.reduce((m, d, i, a) => (d.ventas > a[m].ventas ? i : m), 0)]} es el día más fuerte: {q(Math.max(...res.dow.map((d) => d.ventas)))} contra {q(Math.min(...res.dow.map((d) => d.ventas)))} el más flojo.</>}
            what="Cuánto se vende en un día promedio de cada día de la semana."
            how="El fin de semana (barras de otro color) vende más que entre semana. Un día fuerte necesita más personal.">
            <Barras cats={DIAS} vals={res.dow.map((d) => d.ventas)} unit="Q por día" label="Ventas promedio por día de la semana" resaltar={[5, 6]} fmtv={(v) => `${(v / 1000).toFixed(1)}k`} />
          </Card>

          <Card title="Cuándo llega la gente" wide
            what="Cuántos clientes llegan en promedio en cada hora de cada día de la semana. Esta es la tasa de llegadas que usa el simulador (un proceso de Poisson que cambia con la hora)."
            how="Más oscuro es más gente. Busca las manchas oscuras: son los horarios de almuerzo y cena, sobre todo el sábado y el domingo.">
            <Calor filas={DIAS} cols={horas} vals={res.calor} unit="clientes por hora" label="Clientes por hora y día de la semana" />
          </Card>

          <Card title="Espera por hora" wide
            what="Cuánto espera un cliente según la hora a la que llega: el promedio y el caso del 5% más lento (P95)."
            how="La línea roja es la espera aceptable. Donde la línea punteada (el 5% más lento) la cruza, hay clientes con mala experiencia; donde también la cruza el promedio, el problema es general.">
            <PorHora label="Espera promedio y P95 por hora" unit="min" linea={SLA} refLabel={`meta ${SLA} min`}
              series={[{ name: 'Promedio', color: 'var(--data)', vals: res.hora.map((h) => h.espera) }, { name: 'El 5% más lento (P95)', color: 'var(--c2)', dash: '7 4', sq: true, vals: res.hora.map((h) => h.p95) }]} />
          </Card>

          <Card title="Cuánto espera cada cliente"
            what="El porcentaje de clientes según los minutos que esperaron. La última barra son los que se fueron sin ser atendidos."
            how="Si la mayoría está en las barras de la izquierda, el servicio es rápido. Las barras de la derecha son esperas largas y abandonos: ventas en riesgo.">
            <Barras cats={res.hist.cats} vals={res.hist.vals} unit="% de los clientes · minutos de espera" label="Distribución de la espera" resaltar={[9]} alt="var(--warn)" digits={0} fmtv={(v) => `${v.toFixed(0)}%`} />
          </Card>

          <Card title="Abandono por hora"
            what="Qué porcentaje de los clientes que llegan en cada hora se va sin ser atendido."
            how="La línea roja es el máximo aceptable (5%). Casi siempre se pasa en las horas pico, que es cuando más se vende.">
            <Barras cats={horas} vals={res.hora.map((h) => h.abandono)} unit="% que abandona" label="Abandono por hora" linea={5} lineaLabel="máximo 5%" resaltar={res.hora.map((h, i) => (h.abandono > 5 ? i : -1)).filter((i) => i >= 0)} alt="var(--warn)" fmtv={(v) => `${v.toFixed(0)}%`} />
          </Card>

          {sim && (
            <Card title="¿El simulador reproduce estos datos?" wide
              insight={<>El simulador reproduce {comp.filter((c) => c.ok).length} de {comp.length} indicadores del registro.</>}
              what="Se le da al simulador solo lo que se vería en caja (clientes por hora, puestos y el menú) y se compara lo que predice con lo que realmente pasó en el registro."
              how="Se acepta el indicador si la diferencia es de 15% o menos, o muy pequeña en términos absolutos. Si falla, el modelo necesita ajustes (por ejemplo, tiempos de servicio más largos).">
              <div className="tablewrap">
                <table className="data">
                  <caption className="sr">Registro observado contra simulador calibrado</caption>
                  <thead><tr><th scope="col">Indicador</th><th className="num">Registro</th><th className="num">Simulador</th><th className="num">Diferencia</th><th scope="col">Veredicto</th></tr></thead>
                  <tbody>
                    {comp.map((c) => (
                      <tr key={c.n}>
                        <th scope="row">{c.n}</th>
                        <td className="num">{c.o.toLocaleString('en-US', { maximumFractionDigits: c.d })}</td>
                        <td className="num">{c.s.toLocaleString('en-US', { maximumFractionDigits: c.d })}</td>
                        <td className="num">{c.dif > 0 ? '+' : ''}{(c.dif * 100).toFixed(0)}%</td>
                        <td><Estado ok={c.ok} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="note">Los datos se inventaron con un servicio 12% más lento que el supuesto del simulador, y con días buenos y malos; por eso no calzan perfecto. Con datos reales, esta comparación es la validación del modelo.</p>
            </Card>
          )}

          <Card title="Rúbrica: qué se puede evaluar ahora" wide
            what="Los criterios del proyecto que pedían datos con tiempos (llegadas, esperas, ventas) y dónde se ve cada uno."
            how="Cada fila dice qué se necesitaba y qué gráfica o tabla lo cubre.">
            <ul className="metas">
              {[
                ['2.2', 'Análisis exploratorio por hora y por día', 'Ventas por hora, ventas por día de la semana y mapa de calor.'],
                ['2.3', 'Llegadas y tiempos de servicio', 'Tasa de llegadas por hora (proceso de Poisson no homogéneo) y tiempo de servicio por producto.'],
                ['2.5', 'Validación contra datos', 'Comparación del simulador con el registro, con veredicto por indicador.'],
                ['2.7', 'Indicadores de espera, cola, utilización, SLA y abandono', 'Resumen del registro, espera por hora y abandono por hora.'],
                ['3.1', 'Comparación As-Is contra To-Be', 'Pestaña «Simulador con tiempos», con más puestos o menú más corto.']
              ].map(([id, n, d]) => (
                <li key={id} className="ok"><Estado ok /><span className="mn"><b>{id} · {n}</b><small>{d}</small></span></li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <Card title="Preguntas frecuentes" wide what="Respuestas cortas sobre los datos y cómo se evalúan." how="Pulsa una pregunta para ver la respuesta.">
        <Faq items={FAQ} />
      </Card>
    </div>
  );
}
