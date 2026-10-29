// Resume un registro de caja (simulado, ver `registrar`) en lo que se grafica y se evalúa.
import { type Rec } from './colas';

export interface Resumen {
  dias: number;
  clientes: number; // por día
  ventas: number; // Q por día
  ticket: number; // Q por cliente atendido
  perdidas: number; // Q por día que se fueron con quienes abandonaron
  espera: number; // min, atendidos
  p95: number;
  sla: number; // % de todas las llegadas atendidas dentro del SLA
  abandono: number; // %
  uso: number; // % ocupación estimada
  hora: { llegadas: number; ventas: number; espera: number; p95: number; abandono: number; sla: number }[];
  dow: { llegadas: number; ventas: number; ticket: number; espera: number }[];
  calor: number[][]; // clientes por día, dow × hora
  hist: { cats: string[]; vals: number[] };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function p95(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), pos = 0.95 * (s.length - 1), lo = Math.floor(pos);
  return s[lo] + (s[Math.ceil(pos)] - s[lo]) * (pos - lo);
}

export function resumir(log: Rec[], puestos: number, sla: number): Resumen | null {
  if (!log.length) return null;
  const dias = Math.max(...log.map((r) => r.dia)) + 1;
  const diasDow = Array.from({ length: 7 }, (_, d) => Math.max(1, Array.from({ length: dias }, (_, i) => i).filter((i) => i % 7 === d).length));
  const ok = log.filter((r) => !r.abandono);
  const dentro = (r: Rec) => !r.abandono && r.espera <= sla;
  const hr = (r: Rec) => Math.min(11, Math.floor(r.hora - 10));

  const hora = Array.from({ length: 12 }, (_, h) => {
    const xs = log.filter((r) => hr(r) === h), at = xs.filter((r) => !r.abandono);
    return {
      llegadas: xs.length / dias, ventas: at.reduce((a, r) => a + r.total, 0) / dias,
      espera: mean(at.map((r) => r.espera)), p95: p95(at.map((r) => r.espera)),
      abandono: xs.length ? (100 * xs.filter((r) => r.abandono).length) / xs.length : 0,
      sla: xs.length ? (100 * xs.filter(dentro).length) / xs.length : 100
    };
  });
  const dow = Array.from({ length: 7 }, (_, d) => {
    const xs = log.filter((r) => r.dow === d), at = xs.filter((r) => !r.abandono);
    return {
      llegadas: xs.length / diasDow[d], ventas: at.reduce((a, r) => a + r.total, 0) / diasDow[d],
      ticket: mean(at.map((r) => r.total)), espera: mean(at.map((r) => r.espera))
    };
  });
  const calor = Array.from({ length: 7 }, (_, d) => Array.from({ length: 12 }, (_, h) => log.filter((r) => r.dow === d && hr(r) === h).length / diasDow[d]));

  // Histograma de la espera de los atendidos, en minutos enteros; la última columna son los que se fueron.
  const cats = ['0-1', '1-2', '2-3', '3-4', '4-5', '5-6', '6-7', '7-8', '8+', 'se fue'];
  const cuenta = new Array(cats.length).fill(0);
  for (const r of log) cuenta[r.abandono ? 9 : Math.min(8, Math.floor(r.espera))]++;
  const vals = cuenta.map((c) => (100 * c) / log.length);

  const horasAbiertas = 12 * 60 * dias * puestos;
  return {
    dias,
    clientes: log.length / dias,
    ventas: ok.reduce((a, r) => a + r.total, 0) / dias,
    ticket: mean(ok.map((r) => r.total)),
    perdidas: log.filter((r) => r.abandono).reduce((a, r) => a + r.total, 0) / dias,
    espera: mean(ok.map((r) => r.espera)),
    p95: p95(ok.map((r) => r.espera)),
    sla: (100 * log.filter(dentro).length) / log.length,
    abandono: (100 * log.filter((r) => r.abandono).length) / log.length,
    uso: (100 * ok.reduce((a, r) => a + r.servicio, 0)) / horasAbiertas,
    hora, dow, calor, hist: { cats, vals }
  };
}

export interface Meta { id: string; nombre: string; meta: string; valor: string; cumple: boolean; detalle: string }

/** Objetivos de servicio del negocio, evaluados sobre el registro. */
export function cumplimiento(r: Resumen, sla: number): Meta[] {
  const horasMal = r.hora.map((h, i) => ({ h: 10 + i, mal: h.espera > sla || h.abandono > 5 })).filter((x) => x.mal);
  const potencial = r.ventas + r.perdidas;
  const perd = potencial ? (100 * r.perdidas) / potencial : 0;
  return [
    { id: 'espera', nombre: 'Espera promedio', meta: '≤ 3 min', valor: `${r.espera.toFixed(1)} min`, cumple: r.espera <= 3, detalle: 'Lo que espera un cliente típico antes de que lo atiendan.' },
    { id: 'sla', nombre: `Atendidos en ${sla} min o menos`, meta: '≥ 90%', valor: `${r.sla.toFixed(0)}%`, cumple: r.sla >= 90, detalle: 'Cumplimiento del tiempo aceptable (SLA); quien abandona cuenta como incumplido.' },
    { id: 'aband', nombre: 'Abandono', meta: '≤ 5%', valor: `${r.abandono.toFixed(1)}%`, cumple: r.abandono <= 5, detalle: 'Clientes que se van de la fila sin comprar.' },
    { id: 'perd', nombre: 'Ventas perdidas', meta: '≤ 5% de la venta posible', valor: `${perd.toFixed(1)}% (Q${Math.round(r.perdidas).toLocaleString('en-US')} al día)`, cumple: perd <= 5, detalle: 'Dinero que se fue con los clientes que abandonaron.' },
    { id: 'uso', nombre: 'Ocupación del personal', meta: '60% a 85%', valor: `${r.uso.toFixed(0)}%`, cumple: r.uso >= 60 && r.uso <= 85, detalle: 'Menos de 60% sobra personal; más de 85% se forma fila.' },
    { id: 'horas', nombre: 'Horas dentro de la meta', meta: '12 de 12', valor: `${12 - horasMal.length} de 12`, cumple: horasMal.length === 0, detalle: horasMal.length ? `Fallan: ${horasMal.map((x) => `${x.h}h`).join(', ')}.` : 'Todas las horas cumplen.' }
  ];
}
