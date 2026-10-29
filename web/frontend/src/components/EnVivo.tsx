import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  DIAS, ESCENARIOS, META_ABANDONO, META_ESPERA, NIVELES_FALLA, simularDias,
  type DiaVivo, type Tiempos as TiemposCfg
} from '../lib/colas';
import type { Product } from '../lib/types';
import { Card } from './Charts';
import Faq from './Faq';
import { Hint } from './Hint';

const T = 12 * 3600; // segundos de atención
const VEL = 5400; // segundos simulados por segundo real a velocidad 1 (un día dura 8 s)
const PASO = 60; // la fila se muestrea cada minuto

const num = (s: string, def: number, lo: number, hi: number) => {
  const x = Number(s.replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(x) ? def : Math.min(hi, Math.max(lo, x));
};
const q = (x: number) => `Q${Math.round(x).toLocaleString('en-US')}`;
const f1 = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const hhmm = (s: number) => `${10 + Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
const niceMax = (v: number) => {
  const top = Math.max(v, 1e-9) * 1.1, p = 10 ** Math.floor(Math.log10(top)), m = top / p;
  return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => m <= x) ?? 10) * p;
};

const FAQ = [
  { q: '¿Qué estoy viendo?', a: 'Varios días de atención seguidos, uno tras otro, corriendo en vivo. Arriba ves el día y la hora; en «Cajas», qué hace cada caja; y las gráficas de abajo se van llenando conforme termina cada día.' },
  { q: '¿Qué es una caja?', a: 'Un puesto de atención: toma el pedido, lo prepara y cobra. Cada caja atiende a una persona a la vez.' },
  { q: '¿Cuándo falla una caja?', a: 'Al azar. Con «A veces» una caja se cae una vez cada 40 horas y tarda unos 15 minutos en repararse; con «Seguido», una vez cada 10 horas y unos 25 minutos. Mientras está caída no atiende y la fila crece. La franja roja marca cuándo.' },
  { q: '¿Cuándo un día «cumple»?', a: `Cuando la espera promedio es de ${META_ESPERA} minutos o menos y se va sin comprar el ${META_ABANDONO}% o menos.` },
  { q: '¿De dónde salen los números?', a: 'Del modelo. Las llegadas, los tiempos y las fallas son supuestos del modelo; el menú sí es el publicado. Sirve para probar qué pasa, no para predecir una sucursal.' }
];

interface Form { esc: string; cadena: string; puestos: string; llegadas: string; fallas: string; dias: string; vel: string; seed: string }

/* ——— fila durante el día, con las caídas marcadas ——— */
function ColaDia({ serie, hasta, caidas, max }: { serie: number[]; hasta: number; caidas: [number, number][][]; max: number }) {
  const W = 620, H = 240, L = 40, R = 12, Tp = 12, B = 32;
  const sx = (s: number) => L + (s / T) * (W - L - R), sy = (v: number) => H - B - (v / max) * (H - Tp - B);
  const n = Math.min(serie.length - 1, Math.floor(hasta / PASO));
  const pts = Array.from({ length: n + 1 }, (_, i) => `${sx(i * PASO)},${sy(serie[i])}`);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="boxsvg" role="img" aria-label="Clientes en la fila a lo largo del día">
      {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} stroke="var(--hair)" /><text x={L - 6} y={sy(t) + 4} className="ax" textAnchor="end">{Math.round(t)}</text></g>)}
      {Array.from({ length: 7 }, (_, i) => <text key={i} x={sx(i * 7200)} y={H - 14} className="ax" textAnchor="middle">{10 + i * 2}h</text>)}
      {caidas.flatMap((l, j) => l.filter(([a]) => a <= hasta).map(([a, b], k) => (
        <rect key={`${j}-${k}`} x={sx(a)} y={Tp} width={Math.max(2, sx(Math.min(b, hasta)) - sx(a))} height={H - B - Tp} fill="var(--warn)" fillOpacity=".16">
          <title>{`Caja ${j + 1} caída de ${hhmm(a)} a ${hhmm(Math.min(b, T))}`}</title>
        </rect>
      )))}
      {n > 0 && <polygon points={`${sx(0)},${sy(0)} ${pts.join(' ')} ${sx(n * PASO)},${sy(0)}`} fill="var(--data)" fillOpacity=".14" />}
      <polyline fill="none" stroke="var(--data)" strokeWidth="2.4" points={pts.join(' ')} />
      <line x1={sx(hasta)} x2={sx(hasta)} y1={Tp} y2={H - B} stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="3 3" />
      <text x={(L + W - R) / 2} y={H - 1} className="ax" textAnchor="middle">hora del día · clientes en fila (franja roja: una caja caída)</text>
    </svg>
  );
}

/* ——— barras por día, que se van llenando ——— */
function BarrasDias({ vals, color, marcas, linea, lineaLabel, max, unit, label, fmt }: {
  vals: (number | null)[]; color: (i: number) => string; marcas?: number[]; linea?: number; lineaLabel?: string; max: number; unit: string; label: string; fmt: (v: number) => string;
}) {
  const W = 620, H = 240, L = 50, R = 12, Tp = 14, B = 44, n = vals.length, bw = (W - L - R) / n;
  const sy = (v: number) => H - B - (Math.min(v, max) / max) * (H - Tp - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="boxsvg" role="img" aria-label={label}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => <g key={t}><line x1={L} x2={W - R} y1={sy(t * max)} y2={sy(t * max)} stroke="var(--hair)" /><text x={L - 6} y={sy(t * max) + 4} className="ax" textAnchor="end">{fmt(t * max)}</text></g>)}
      {vals.map((v, i) => (
        <g key={i}>
          {v === null
            ? <rect x={L + i * bw + bw * 0.15} y={H - B - 2} width={bw * 0.7} height={2} fill="var(--rule)" />
            : <rect x={L + i * bw + bw * 0.15} y={sy(v)} width={bw * 0.7} height={Math.max(0, H - B - sy(v))} fill={color(i)}><title>{`Día ${i + 1} (${DIAS[i % 7]}): ${fmt(v)} ${unit}`}</title></rect>}
          {n <= 21 && <text x={L + i * bw + bw / 2} y={H - B + 14} className="ax" textAnchor="middle">{n <= 14 ? DIAS[i % 7] : i + 1}</text>}
          {marcas && marcas[i] > 0 && (
            <g><circle cx={L + i * bw + bw / 2} cy={H - B + 29} r="8" fill="var(--warn)" /><text x={L + i * bw + bw / 2} y={H - B + 33} className="ax" textAnchor="middle" style={{ fill: 'var(--surface)', fontWeight: 700 }}>{marcas[i]}</text></g>
          )}
        </g>
      ))}
      {linea !== undefined && linea <= max && <g><line x1={L} x2={W - R} y1={sy(linea)} y2={sy(linea)} stroke="var(--warn)" strokeWidth="2" strokeDasharray="6 4" /><text x={W - R} y={sy(linea) - 5} className="ax" textAnchor="end" fill="var(--warn-ink)">{lineaLabel}</text></g>}
    </svg>
  );
}

function LineaDias({ vals, cur, linea, lineaLabel, max, label, fmt }: { vals: (number | null)[]; cur: number; linea: number; lineaLabel: string; max: number; label: string; fmt: (v: number) => string }) {
  const W = 620, H = 240, L = 50, R = 12, Tp = 14, B = 34, n = vals.length;
  const sx = (i: number) => L + ((i + 0.5) / n) * (W - L - R), sy = (v: number) => H - B - (Math.min(v, max) / max) * (H - Tp - B);
  const pts = vals.map((v, i) => (v === null ? null : `${sx(i)},${sy(v)}`)).filter(Boolean).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="boxsvg" role="img" aria-label={label}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => <g key={t}><line x1={L} x2={W - R} y1={sy(t * max)} y2={sy(t * max)} stroke="var(--hair)" /><text x={L - 6} y={sy(t * max) + 4} className="ax" textAnchor="end">{fmt(t * max)}</text></g>)}
      {n <= 21 && vals.map((_, i) => <text key={i} x={sx(i)} y={H - 14} className="ax" textAnchor="middle">{n <= 14 ? DIAS[i % 7] : i + 1}</text>)}
      <line x1={L} x2={W - R} y1={sy(linea)} y2={sy(linea)} stroke="var(--warn)" strokeWidth="2" strokeDasharray="6 4" />
      <text x={W - R} y={sy(linea) - 5} className="ax" textAnchor="end" fill="var(--warn-ink)">{lineaLabel}</text>
      <polyline fill="none" stroke="var(--data)" strokeWidth="2.4" points={pts} />
      {vals.map((v, i) => v === null ? null : (
        <circle key={i} cx={sx(i)} cy={sy(v)} r={i === cur ? 5.5 : 4} fill={v > linea ? 'var(--warn)' : 'var(--data)'} stroke="var(--surface)" strokeWidth="2"><title>{`Día ${i + 1} (${DIAS[i % 7]}): ${fmt(v)} min`}</title></circle>
      ))}
    </svg>
  );
}

export default function EnVivo({ productos, companies, t }: { productos: Product[]; companies: string[]; t: TiemposCfg }) {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [f, setF] = useState<Form>({ esc: 'normal', cadena: companies.includes('McDonald’s') ? 'McDonald’s' : '', puestos: '3', llegadas: '30', fallas: '1', dias: '14', vel: '1', seed: '42' });
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const fd = useDeferredValue(f);
  const esc = ESCENARIOS.find((e) => e.id === fd.esc) ?? ESCENARIOS[0];
  const puestos = Math.round(num(fd.puestos, 3, 1, 8)), llegadas = num(fd.llegadas, 30, 5, 150);
  const nDias = Math.round(num(fd.dias, 14, 7, 30)), seed = Math.round(num(fd.seed, 42, 0, 1e9)), nivel = Number(fd.fallas) || 0;
  const vel = Number(f.vel) || 1;

  const dias = useMemo(() => simularDias(productos, { cadena: fd.cadena, puestos, llegadas, paciencia: 8, sla: 5, maxKcal: null, tiempos: t }, esc, nivel, nDias, seed),
    [productos, t, fd.esc, fd.cadena, puestos, llegadas, nivel, nDias, seed]);

  // Fila de cada día muestreada cada minuto (para dibujarla sin recalcular en cada cuadro).
  const filas = useMemo(() => (dias ?? []).map((d) => {
    const diff = new Array(T / PASO + 2).fill(0);
    for (const c of d.det.clientes) { const a = Math.ceil(c.t / PASO), b = Math.min(diff.length - 1, Math.ceil(c.inicio / PASO)); if (b > a) { diff[a]++; diff[b]--; } }
    let acc = 0;
    return diff.map((x) => (acc += x)).slice(0, T / PASO + 1);
  }), [dias]);
  const maxFila = Math.max(4, ...filas.map((s) => Math.max(...s)));

  const [pos, setPos] = useState({ i: 0, t: 0 });
  const [play, setPlay] = useState(!reduce);
  const ref = useRef({ i: 0, t: 0 });
  useEffect(() => { ref.current = { i: 0, t: 0 }; setPos({ i: 0, t: 0 }); setPlay(!reduce); }, [dias]);
  useEffect(() => {
    if (!play || !dias) return;
    let raf = 0, last = performance.now(), acc = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      let ti = ref.current.t + dt * VEL * vel, ii = ref.current.i;
      while (ti >= T) {
        ti -= T; ii++;
        if (ii >= dias.length) { ref.current = { i: dias.length - 1, t: T }; setPos(ref.current); setPlay(false); return; }
      }
      ref.current = { i: ii, t: ti };
      acc += dt;
      if (acc >= 1 / 30 || ti < dt * VEL * vel) { acc = 0; setPos({ ...ref.current }); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, dias, vel]);

  const reiniciar = () => { ref.current = { i: 0, t: 0 }; setPos({ i: 0, t: 0 }); setPlay(true); };
  const fin = !!dias && pos.i === dias.length - 1 && pos.t >= T;

  // Lo que pasa ahora mismo en el día en curso.
  const vivo = useMemo(() => {
    if (!dias) return null;
    const d = dias[Math.min(pos.i, dias.length - 1)], s = pos.t;
    let llegados = 0, enCola = 0, atendidos = 0, fuera = 0, ventas = 0, sumEsp = 0, nEsp = 0;
    const estado = Array.from({ length: puestos }, () => 'libre' as 'libre' | 'atendiendo' | 'falla');
    for (const c of d.det.clientes) {
      if (c.t > s) continue;
      llegados++;
      if (s < c.inicio) enCola++;
      if (c.ab) { if (c.salida <= s) fuera++; continue; }
      if (c.inicio <= s) { sumEsp += c.inicio - c.t; nEsp++; }
      if (c.fin <= s) { atendidos++; ventas += c.valor; } else if (c.inicio <= s && s < c.fin) estado[c.j] = 'atendiendo';
    }
    let fallasHoy = 0;
    d.det.caidas.forEach((l, j) => l.forEach(([a, b]) => { if (a <= s) { fallasHoy++; if (s < b) estado[j] = 'falla'; } }));
    return { d, llegados, enCola, atendidos, fuera, ventas, espera: nEsp ? sumEsp / nEsp / 60 : 0, abandono: llegados ? (100 * fuera) / llegados : 0, estado, fallasHoy };
  }, [dias, pos, puestos]);

  if (!dias || !vivo) return <p className="alert" role="alert">No quedan productos con esos datos. Elige otra cadena.</p>;
  const { d: hoy } = vivo;
  const pi = Math.min(pos.i, dias.length - 1);
  const hecho = (i: number) => i < pi || (fin && i === pi);
  const ventasV = dias.map((x, i) => (hecho(i) ? x.kpi.ventas : i === pi ? vivo.ventas : null));
  const esperaV = dias.map((x, i) => (hecho(i) ? x.kpi.espera : i === pi && vivo.atendidos > 0 ? vivo.espera : null));
  const abandV = dias.map((x, i) => (hecho(i) ? x.kpi.abandono : i === pi ? vivo.abandono : null));
  const fallasV = dias.map((x, i) => (hecho(i) ? x.kpi.fallas : i === pi ? vivo.fallasHoy : 0));
  const terminados = dias.filter((_, i) => hecho(i));
  const cumplen = terminados.filter((x) => x.kpi.cumple).length;
  const malos = terminados.filter((x) => !x.kpi.cumple);
  const porEvento = malos.filter((x) => x.evento).length, porFalla = malos.filter((x) => x.kpi.fallas > 0).length;
  const maxEsp = niceMax(Math.max(META_ESPERA * 1.2, ...esperaV.filter((v): v is number => v !== null)));
  const maxAb = niceMax(Math.max(META_ABANDONO * 1.5, ...abandV.filter((v): v is number => v !== null)));
  const maxVen = niceMax(Math.max(1, ...dias.map((x) => x.kpi.ventas)));
  const funcionando = vivo.estado.filter((e) => e !== 'falla').length;
  const caidasHoy = hoy.det.caidas.flatMap((l, j) => l.map(([a, b]) => ({ j, a, b }))).filter((x) => x.a <= pos.t).sort((x, y) => x.a - y.a);

  return (
    <div className="dgrid">
      <Card title="Escenarios en vivo" wide
        what="Corre varios días seguidos y los muestra en vivo: la hora, la fila, qué hace cada caja y cómo se llenan las gráficas conforme pasan los días."
        how="Elige un escenario y mira. Si quieres probar otra cosa, cambia cajas, clientes o fallas: arranca de nuevo solo.">
        <div className="fields">
          <label htmlFor="e-esc"><span>Escenario<Hint left>Qué pasa durante la semana: normal, con promoción, con partido o con cajas dañadas.</Hint></span>
            <select id="e-esc" value={f.esc} onChange={set('esc')}>{ESCENARIOS.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label>
          <label htmlFor="e-pue"><span>Cajas<Hint left>Cuántas cajas atienden a la vez. Más cajas, menos fila.</Hint></span>
            <input id="e-pue" type="number" min={1} max={8} value={f.puestos} onChange={set('puestos')} /></label>
          <label htmlFor="e-lle"><span>Clientes por hora<Hint left>Promedio del día. El escenario lo sube o lo baja según el día.</Hint></span>
            <input id="e-lle" type="number" min={5} max={150} value={f.llegadas} onChange={set('llegadas')} /></label>
          <label htmlFor="e-fal"><span>Fallas de caja<Hint>Qué tan seguido se descompone una caja. Mientras se repara no atiende y la fila crece.</Hint></span>
            <select id="e-fal" value={f.fallas} onChange={set('fallas')}>{NIVELES_FALLA.map((n, i) => <option key={n.nombre} value={i}>{n.nombre}</option>)}</select></label>
        </div>
        <p className="note"><b>{esc.nombre}:</b> {esc.desc}{esc.fallas ? ' Las fallas están en «Seguido».' : ''}</p>
        <div className="controles">
          <button className="btn" onClick={() => (fin ? reiniciar() : setPlay(!play))}>{fin ? 'Ver de nuevo' : play ? 'Pausar' : 'Seguir'}</button>
          <button className="btn ghost" onClick={reiniciar}>Reiniciar</button>
          <label htmlFor="e-vel" className="inline"><span>Velocidad</span>
            <select id="e-vel" value={f.vel} onChange={set('vel')}><option value="1">Normal</option><option value="3">Rápida</option><option value="10">Muy rápida</option></select></label>
        </div>
        <details className="adv">
          <summary>Más opciones</summary>
          <div className="fields">
            <label htmlFor="e-cad"><span>Cadena<Hint left>De qué cadena son los productos que piden.</Hint></span>
              <select id="e-cad" value={f.cadena} onChange={set('cadena')}><option value="">Todas</option>{companies.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label htmlFor="e-dia"><span>Días<Hint left>Cuántos días seguidos se simulan (de 7 a 30).</Hint></span>
              <input id="e-dia" type="number" min={7} max={30} value={f.dias} onChange={set('dias')} /></label>
            <label htmlFor="e-seed"><span>Semilla<Hint>Con la misma semilla pasa exactamente lo mismo.</Hint></span>
              <input id="e-seed" type="number" min={0} value={f.seed} onChange={set('seed')} /></label>
          </div>
        </details>
        <div className="tiles tiles4">
          <div className="tile"><div className="tl">Día</div><div className="tv">{pi + 1}<small>de {dias.length} · {DIAS[hoy.dow]}</small></div>
            <div className={`td ${hoy.evento ? 'bad' : ''}`}>{hoy.evento ? `${hoy.evento}: ${f1(hoy.mult)}× de clientes` : `${f1(hoy.mult)}× de clientes`}</div></div>
          <div className="tile"><div className="tl">Hora</div><div className="tv">{hhmm(Math.min(pos.t, T - 1))}</div><div className="td">{fin ? 'terminó' : play ? 'corriendo' : 'en pausa'}</div></div>
          <div className="tile"><div className="tl">En la fila ahora</div><div className="tv">{vivo.enCola}<small>clientes</small></div><div className="td">atendidos hoy: {vivo.atendidos} · se fueron: {vivo.fuera}</div></div>
          <div className="tile"><div className="tl">Cajas funcionando</div><div className="tv">{funcionando}<small>de {puestos}</small></div>
            <div className={`td ${funcionando < puestos ? 'bad' : 'good'}`}>{funcionando < puestos ? `${puestos - funcionando} caída${puestos - funcionando > 1 ? 's' : ''}` : 'todas bien'}</div></div>
        </div>
      </Card>

      <Card title="Las cajas" wide
        what="Qué está haciendo cada caja a lo largo del día: atendiendo, libre o fuera de servicio."
        how="Cada fila es una caja. Azul es que está atendiendo, gris es que está libre y rojo con rayas es que está caída. La línea negra es la hora actual.">
        <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}><defs>
          <pattern id="rayas" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--warn-soft)" /><rect width="3" height="6" fill="var(--warn)" /></pattern>
        </defs></svg>
        <div className="cajas">
          {vivo.estado.map((e, j) => (
            <div className="caja" key={j}>
              <div className="cl"><b>Caja {j + 1}</b>
                <span className={`cs ${e}`}>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    {e === 'falla' ? <path d="M6 6l12 12M18 6L6 18" /> : e === 'atendiendo' ? <circle cx="12" cy="12" r="5" fill="currentColor" /> : <path d="M6 12h12" />}
                  </svg>
                  {e === 'falla' ? 'Fuera de servicio' : e === 'atendiendo' ? 'Atendiendo' : 'Libre'}
                </span></div>
              <svg viewBox="0 0 620 28" className="cstrip" role="img" aria-label={`Línea de tiempo de la caja ${j + 1}`}>
                <rect x="0" y="4" width="620" height="20" fill="var(--hair)" />
                {hoy.det.clientes.filter((c) => !c.ab && c.j === j && c.inicio <= pos.t).map((c, k) => (
                  <rect key={k} x={(c.inicio / T) * 620} y="4" width={Math.max(1, (Math.min(c.fin, pos.t) - c.inicio) / T * 620)} height="20" fill="var(--data)" />
                ))}
                {hoy.det.caidas[j].filter(([a]) => a <= pos.t).map(([a, b], k) => (
                  <rect key={k} x={(a / T) * 620} y="2" width={Math.max(2, (Math.min(b, pos.t) - a) / T * 620)} height="24" fill="url(#rayas)" stroke="var(--warn)" strokeWidth="1.5"><title>{`Caída de ${hhmm(a)} a ${hhmm(Math.min(b, T))}`}</title></rect>
                ))}
                <line x1={(pos.t / T) * 620} x2={(pos.t / T) * 620} y1="0" y2="28" stroke="var(--ink)" strokeWidth="2" />
              </svg>
            </div>
          ))}
          <div className="caja"><div className="cl" /><svg viewBox="0 0 620 16" className="cstrip" aria-hidden>
            {Array.from({ length: 7 }, (_, i) => <text key={i} x={Math.min(606, Math.max(8, (i * 7200 / T) * 620))} y="12" className="ax" textAnchor="middle">{10 + i * 2}h</text>)}
          </svg></div>
        </div>
        <h3 className="rhead">Fallas de hoy<Hint left>Cada vez que una caja se descompone queda anotado aquí, con la hora y lo que tarda en repararse.</Hint></h3>
        {caidasHoy.length === 0
          ? <p className="note">Sin fallas por ahora.</p>
          : <ul className="fallas">{caidasHoy.slice(-5).map((x, i) => {
            const ahora = pos.t < x.b;
            return <li key={i} className={ahora ? 'ahora' : ''}><b>{hhmm(x.a)}</b> · Caja {x.j + 1} se cayó{ahora ? ' (sigue caída)' : ` y se reparó a las ${hhmm(Math.min(x.b, T))}`} · {Math.round((x.b - x.a) / 60)} min</li>;
          })}</ul>}
      </Card>

      <Card title="La fila durante el día" wide
        what="Cuántos clientes están esperando en la fila a cada hora, del día que está corriendo."
        how="Sube en los picos de almuerzo y cena. Las franjas rojas son momentos con una caja caída: casi siempre la fila crece ahí.">
        <ColaDia serie={filas[pi]} hasta={pos.t} caidas={hoy.det.caidas} max={Math.ceil(niceMax(maxFila) / 4) * 4} />
      </Card>

      <Card title="Ventas por día"
        what="Cuánto dinero entra cada día, en quetzales (precios supuestos)."
        how="Las barras se van llenando. Naranja es un día con promoción o partido; verde es el día en curso.">
        <BarrasDias vals={ventasV} max={maxVen} unit="" label="Ventas por día" fmt={(v) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${Math.round(v)}`)}
          color={(i) => (!hecho(i) ? 'var(--c4)' : dias[i].evento ? 'var(--c2)' : 'var(--data)')} />
        <p className="note">{terminados.length ? `Van ${q(terminados.reduce((a, x) => a + x.kpi.ventas, 0))} en ${terminados.length} ${terminados.length === 1 ? 'día' : 'días'}.` : 'Esperando el primer día…'}</p>
      </Card>

      <Card title="Espera por día"
        what="Cuántos minutos espera en promedio un cliente cada día."
        how={`La línea roja es la meta (${META_ESPERA} min). Un punto rojo es un día que se pasó.`}>
        <LineaDias vals={esperaV} cur={pi} linea={META_ESPERA} lineaLabel={`meta ${META_ESPERA} min`} max={maxEsp} label="Espera promedio por día" fmt={(v) => f1(v)} />
      </Card>

      <Card title="Se van sin comprar y fallas" wide
        what="Qué porcentaje de los clientes se cansa de esperar y se va, cada día. Los círculos rojos con número son las fallas de caja de ese día."
        how={`Una barra roja pasó de la meta (${META_ABANDONO}%). Mira si los días con fallas coinciden con barras altas.`}>
        <BarrasDias vals={abandV} max={maxAb} unit="%" label="Abandono por día" linea={META_ABANDONO} lineaLabel={`meta ${META_ABANDONO}%`} marcas={fallasV}
          fmt={(v) => `${v.toFixed(v < 10 ? 1 : 0)}%`} color={(i) => (!hecho(i) ? 'var(--c4)' : (abandV[i] ?? 0) > META_ABANDONO ? 'var(--warn)' : 'var(--data)')} />
      </Card>

      <Card title="Qué días cumplen" wide
        insight={terminados.length ? <>{cumplen} de {terminados.length} días cumplen{malos.length ? `. De los ${malos.length} que no, ${porEvento ? `${porEvento} fueron ${esc.id === 'promo' ? 'de promoción' : esc.id === 'partido' ? 'de partido' : 'con evento'}, ` : ''}${porFalla} tuvieron fallas de caja` : ''}.</> : null}
        what={`Un día cumple si la espera promedio es de ${META_ESPERA} min o menos y se van sin comprar ${META_ABANDONO}% o menos.`}
        how="Verde con palomita cumple, rojo con cruz no. El día en curso aparece marcado y los que faltan, en gris.">
        <div className="dias" role="list">
          {dias.map((x, i) => {
            const h = hecho(i), now = i === pi && !h;
            return (
              <div key={i} role="listitem" className={`hchip ${h ? (x.kpi.cumple ? 'ok' : 'no') : now ? 'now' : 'wait'}`}
                title={h ? `Día ${i + 1}: espera ${f1(x.kpi.espera)} min, abandono ${f1(x.kpi.abandono)}%, ${x.kpi.fallas} fallas${x.evento ? `, ${x.evento}` : ''}` : `Día ${i + 1}`}>
                <b>{DIAS[x.dow]} {i + 1}</b>
                {h ? <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">{x.kpi.cumple ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M6 6l12 12M18 6L6 18" />}</svg> : <span className="pt">{now ? '…' : '·'}</span>}
                <small>{h ? `${f1(x.kpi.espera)} min` : now ? 'hoy' : ''}</small>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Preguntas frecuentes" wide what="Respuestas cortas." how="Pulsa una pregunta."><Faq items={FAQ} /></Card>
    </div>
  );
}
