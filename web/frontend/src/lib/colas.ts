// Simulación con tiempos: llegadas por hora, puestos de servicio, cola FIFO y abandono.
// El CSV no trae tiempos: todo lo de aquí son SUPUESTOS editables, no datos medidos. Lo único real
// es el menú (qué productos pide la gente y de qué cadena), que se remuestrea igual que en Monte Carlo.
import type { Product } from './types';

export const TIPOS = ['Bebidas', 'Complementos', 'Postres', 'Platos'] as const;
export type Tipo = (typeof TIPOS)[number];

export interface Tiempos {
  base: Record<Tipo, number>; // segundos de preparación de un producto "promedio" de ese tipo
  pedido: number; // segundos fijos por cliente: tomar el pedido y cobrar
}

export const TIEMPOS_BASE: Tiempos = {
  base: { Bebidas: 15, Complementos: 45, Postres: 30, Platos: 120 },
  pedido: 40
};

// Precio de lista supuesto, en quetzales: base del tipo, más caro mientras más grande es el producto.
export const PRECIO_BASE: Record<Tipo, number> = { Bebidas: 12, Complementos: 15, Postres: 14, Platos: 38 };
export function precioProducto(p: Product): number {
  const f = p.Calories == null ? 1 : Math.min(1.6, Math.max(0.8, 0.8 + p.Calories / 1000));
  return (PRECIO_BASE[p.Category as Tipo] ?? PRECIO_BASE.Platos) * f;
}

export const CV_PRODUCTO = 0.5; // variación aleatoria del tiempo de cada producto (gamma, CV = 0.5)

// Perfil de llegadas por hora (10:00 a 22:00), relativo al promedio. Dos picos: almuerzo y cena.
export const APERTURA = 10;
export const CIERRE = 22;
export const PERFIL = [0.3, 0.7, 1.5, 1.4, 0.8, 0.5, 0.6, 0.9, 1.4, 1.5, 1.0, 0.5];
export const PERFIL_MAX = Math.max(...PERFIL);
export const PERFIL_MEDIA = PERFIL.reduce((a, b) => a + b, 0) / PERFIL.length;

// Cuántos productos pide cada cliente.
const PEDIDO_TAMANO: [number, number][] = [[1, 0.25], [2, 0.4], [3, 0.25], [4, 0.1]];
export const PEDIDO_MEDIO = PEDIDO_TAMANO.reduce((a, [k, p]) => a + k * p, 0);

/** Tiempo medio (s) de preparar un producto: base del tipo, escalada por lo grande que es (calorías). */
export function tiempoProducto(p: Product, t: Tiempos): number {
  const base = t.base[p.Category as Tipo] ?? t.base.Platos;
  const f = p.Calories == null ? 1 : Math.min(2, Math.max(0.75, 0.75 + p.Calories / 800));
  return base * f;
}

// ——— azar reproducible ———
export function rng(seed: number, ...ids: number[]) {
  // mezcla (semilla, réplica, flujo) en un solo entero de 32 bits y arranca mulberry32
  let h = (seed | 0) ^ 0x9e3779b9;
  for (const x of ids) { h = Math.imul(h ^ (x | 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; }
  let a = h >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return u;
}
const normal = (u: () => number) => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
// Gamma(k, 1) por Marsaglia-Tsang; para k < 1 se usa el truco de potencia.
function gamma(u: () => number, k: number): number {
  if (k < 1) return gamma(u, k + 1) * Math.pow(1 - u(), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normal(u), v = (1 + c * x) ** 3;
    if (v <= 0) continue;
    const r = u();
    if (Math.log(1 - r) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}
const expo = (u: () => number, media: number) => -media * Math.log(1 - u());

// ——— configuración y resultados ———
export interface Config {
  cadena: string; // '' = todas
  puestos: number;
  llegadas: number; // clientes por hora, en promedio sobre el día
  paciencia: number; // minutos que aguanta un cliente en cola (media); 0 = nadie abandona
  sla: number; // minutos de espera aceptables
  maxKcal: number | null; // regla To-Be: solo se ofrecen productos con hasta estas kcal
  fallas?: { tasa: number; reparacion: number }; // por caja: fallas por hora y minutos medios de reparación
  servicioX?: number; // factor oculto sobre el tiempo de servicio (solo para generar datos que no calcen perfecto)
  tiempos: Tiempos;
}

export interface Kpi { media: number; ic: number } // media entre réplicas y mitad del IC 95%
export interface Resultado {
  reps: number;
  clientes: Kpi; // llegadas por día
  espera: Kpi; // minutos, de quienes fueron atendidos
  p95: Kpi; // minutos
  sistema: Kpi; // minutos desde que llega hasta que sale
  cola: Kpi; // clientes en cola, promedio en el tiempo
  colaMax: Kpi;
  sla: Kpi; // % de llegadas atendidas dentro del SLA
  abandono: Kpi; // % de llegadas que se van sin ser atendidas
  uso: Kpi; // % de ocupación de los puestos
  ventas: Kpi; // Q vendidos por día
  perdidas: Kpi; // Q que se van con los clientes que abandonan
  extra: Kpi; // minutos que se pasa de la hora de cierre
  servicio: number; // segundos medios por cliente atendido
  porHora: { hora: number; llegadas: number; espera: number; cola: number; uso: number; abandono: number; ventas: number }[];
  little: number; // diferencia relativa entre Lq y λ·Wq (debe ser ~0)
}

const T = 12 * 3600; // segundos de atención al público

/** Productos que entran al pedido: de la cadena elegida y bajo la regla de calorías, si hay. */
export function menu(productos: Product[], cfg: Pick<Config, 'cadena' | 'maxKcal'>): Product[] {
  return productos.filter((p) =>
    !p.IsSectionRow && (!cfg.cadena || p.Company === cfg.cadena) &&
    (cfg.maxKcal == null || (p.Calories != null && p.Calories <= cfg.maxKcal)));
}

interface Dia {
  llegadas: number; atendidos: number; abandonos: number; dentroSla: number;
  esperas: number[]; sistema: number[]; colaMax: number; cola: number; uso: number; extra: number; servTotal: number;
  hLleg: number[]; hEsp: number[]; hEspN: number[]; hCola: number[]; hUso: number[]; hAban: number[];
  lq: number; wqSum: number; // para la ley de Little
  ventas: number; perdidas: number; hVen: number[];
  nFallas: number; caido: number; // fallas del día y segundos en que alguna caja estuvo fuera de servicio
}

/** Cada cliente del día, para poder reproducirlo en pantalla: cuándo llegó, en qué caja y hasta cuándo. */
export interface Cliente { t: number; inicio: number; fin: number; j: number; ab: boolean; salida: number; valor: number; k: number }
export interface DiaDet { clientes: Cliente[]; caidas: [number, number][][] }

/** Un cliente tal como quedaría en el registro de una caja: cuándo llegó, cuánto esperó, qué pagó. */
export interface Rec { dia: number; dow: number; hora: number; espera: number; servicio: number; abandono: boolean; total: number; items: number }

function simularDia(rep: number, seed: number, cfg: Config, tprod: { t: number; precio: number }[], log?: Rec[], dow = 0, det?: DiaDet): Dia {
  const ua = rng(seed, rep, 1); // llegadas
  const us = rng(seed, rep, 2); // pedidos y tiempos
  const up = rng(seed, rep, 3); // paciencia
  const lamMax = cfg.llegadas * PERFIL_MAX / PERFIL_MEDIA / 3600; // por segundo
  const slaS = cfg.sla * 60, pacS = cfg.paciencia * 60;

  const libre = new Array<number>(cfg.puestos).fill(0);
  const ocupado = new Array<number>(12).fill(0); // segundos de servicio dentro de cada hora

  // Fallas: cada caja se cae según un proceso de Poisson y tarda en repararse; mientras tanto no atiende.
  const caidas: [number, number][][] = Array.from({ length: cfg.puestos }, () => []);
  if (cfg.fallas && cfg.fallas.tasa > 0) {
    const uf = rng(seed, rep, 4);
    for (const lista of caidas) {
      for (let t0 = expo(uf, 3600 / cfg.fallas.tasa); t0 < T;) {
        const dur = Math.max(180, expo(uf, cfg.fallas.reparacion * 60));
        lista.push([t0, t0 + dur]);
        t0 += dur + expo(uf, 3600 / cfg.fallas.tasa);
      }
    }
  }
  // Cuándo empieza y termina un servicio de `s` segundos en la caja j si la pide desde `desde`:
  // espera a que la caja esté sana y, si se cae a mitad del servicio, lo retoma al repararse.
  const ajusta = (j: number, desde: number, s: number): [number, number] => {
    let cur = desde, resto = s, inicio = -1;
    for (const [a, b] of caidas[j]) {
      if (b <= cur) continue;
      if (a <= cur) { cur = b; continue; }
      if (inicio < 0) inicio = cur;
      if (a < cur + resto) { resto -= a - cur; cur = b; } else break;
    }
    if (inicio < 0) inicio = cur;
    return [inicio, cur + resto];
  };
  const d: Dia = {
    llegadas: 0, atendidos: 0, abandonos: 0, dentroSla: 0, esperas: [], sistema: [], colaMax: 0, cola: 0, uso: 0, extra: 0, servTotal: 0,
    hLleg: new Array(12).fill(0), hEsp: new Array(12).fill(0), hEspN: new Array(12).fill(0), hCola: new Array(12).fill(0),
    hUso: new Array(12).fill(0), hAban: new Array(12).fill(0), lq: 0, wqSum: 0,
    ventas: 0, perdidas: 0, hVen: new Array(12).fill(0), nFallas: caidas.reduce((a, l) => a + l.length, 0), caido: 0
  };
  for (const l of caidas) for (const [a, b] of l) d.caido += Math.max(0, Math.min(b, T) - a);
  if (det) det.caidas = caidas;
  const ev: [number, number][] = []; // (tiempo, +1/-1) para el largo de la cola
  let ultimo = T;

  // Llegadas: proceso de Poisson no homogéneo por adelgazamiento (thinning).
  for (let t = expo(ua, 1 / lamMax); t < T; t += expo(ua, 1 / lamMax)) {
    const h = Math.min(11, Math.floor(t / 3600));
    if (ua() > (PERFIL[h] / PERFIL_MAX)) continue;
    d.llegadas++; d.hLleg[h]++;

    // Pedido: k productos al azar del menú + tiempo fijo; cada tiempo es gamma alrededor de su media.
    let k = 1, r = us(), acum = 0;
    for (const [n, p] of PEDIDO_TAMANO) { acum += p; if (r <= acum) { k = n; break; } }
    let s = cfg.tiempos.pedido * (0.6 + 0.8 * us()); // 40 s ± 40%
    let valor = 0;
    for (let i = 0; i < k; i++) {
      const it = tprod[Math.floor(us() * tprod.length)];
      valor += it.precio;
      s += (it.t * CV_PRODUCTO ** 2) * gamma(us, 1 / (CV_PRODUCTO ** 2));
    }
    s *= cfg.servicioX ?? 1;

    // Puesto que se libera primero (FIFO). Quien abandona no ocupa ningún puesto.
    let j = 0, mejor = ajusta(0, Math.max(t, libre[0]), s);
    for (let i = 1; i < libre.length; i++) {
      const c = ajusta(i, Math.max(t, libre[i]), s);
      if (c[0] < mejor[0]) { j = i; mejor = c; }
    }
    const inicio = mejor[0];
    const espera = inicio - t;
    const pac = pacS > 0 ? expo(up, pacS) : Infinity;
    if (espera > pac) {
      d.abandonos++; d.hAban[h]++; d.perdidas += valor;
      log?.push({ dia: rep, dow, hora: APERTURA + t / 3600, espera: pac / 60, servicio: 0, abandono: true, total: valor, items: k });
      ev.push([t, 1], [t + pac, -1]);
      det?.clientes.push({ t, inicio: t + pac, fin: t + pac, j: -1, ab: true, salida: t + pac, valor, k });
      d.wqSum += pac;
      continue;
    }
    const fin = mejor[1];
    libre[j] = fin;
    det?.clientes.push({ t, inicio, fin, j, ab: false, salida: fin, valor, k });
    d.atendidos++; d.servTotal += s; d.ventas += valor; d.hVen[h] += valor;
    log?.push({ dia: rep, dow, hora: APERTURA + t / 3600, espera: espera / 60, servicio: s / 60, abandono: false, total: valor, items: k });
    d.esperas.push(espera / 60); d.sistema.push((fin - t) / 60);
    d.hEsp[h] += espera / 60; d.hEspN[h]++;
    if (espera <= slaS) d.dentroSla++;
    if (espera > 0) { ev.push([t, 1], [inicio, -1]); d.wqSum += espera; }
    if (fin > ultimo) ultimo = fin;
    // ocupación por hora: reparte [inicio, fin] entre las horas que toca
    for (let a = inicio; a < fin;) {
      const hh = Math.floor(a / 3600), corte = Math.min(fin, (hh + 1) * 3600);
      if (hh < 12) ocupado[hh] += corte - a;
      a = corte;
    }
  }

  // Cola en el tiempo: barrido de eventos. Promedio por hora y máximo.
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let q = 0, prev = 0, area = 0;
  const areaH = new Array(12).fill(0);
  const sumar = (a: number, b: number, n: number) => {
    if (n <= 0 || b <= a) return;
    area += n * (b - a);
    for (let s0 = a; s0 < b;) {
      const hh = Math.floor(s0 / 3600), corte = Math.min(b, (hh + 1) * 3600);
      if (hh < 12) areaH[hh] += n * (corte - s0);
      s0 = corte;
    }
  };
  for (const [tt, dq] of ev) { sumar(prev, tt, q); q += dq; prev = tt; if (q > d.colaMax) d.colaMax = q; }
  d.cola = area / ultimo; d.lq = area; // área = clientes·segundo
  d.hCola = areaH.map((x) => x / 3600);
  const fin = Math.max(T, ultimo);
  d.extra = (fin - T) / 60;
  d.uso = d.servTotal / (cfg.puestos * fin);
  d.hUso = ocupado.map((x) => Math.min(1, x / (cfg.puestos * 3600)));
  return d;
}

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function kpi(xs: number[]): Kpi {
  const m = media(xs), n = xs.length;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : 0;
  return { media: m, ic: n > 1 ? 1.96 * sd / Math.sqrt(n) : 0 };
}
function p95(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), pos = 0.95 * (s.length - 1), lo = Math.floor(pos);
  return s[lo] + (s[Math.ceil(pos)] - s[lo]) * (pos - lo);
}

/** Simula `reps` días con la misma semilla; misma semilla y mismos ajustes dan siempre lo mismo. */
export function simular(productos: Product[], cfg: Config, reps: number, seed: number): Resultado | null {
  const m = menu(productos, cfg);
  if (!m.length || cfg.puestos < 1) return null;
  const tprod = m.map((p) => ({ t: tiempoProducto(p, cfg.tiempos), precio: precioProducto(p) }));
  const dias: Dia[] = [];
  for (let r = 0; r < reps; r++) dias.push(simularDia(r, seed, cfg, tprod));

  const pc = (f: (d: Dia) => number) => dias.map(f);
  const horas = Array.from({ length: 12 }, (_, h) => ({
    hora: APERTURA + h,
    llegadas: media(pc((d) => d.hLleg[h])),
    espera: media(pc((d) => (d.hEspN[h] ? d.hEsp[h] / d.hEspN[h] : 0))),
    cola: media(pc((d) => d.hCola[h])),
    uso: media(pc((d) => d.hUso[h])) * 100,
    abandono: media(pc((d) => (d.hLleg[h] ? (d.hAban[h] / d.hLleg[h]) * 100 : 0))),
    ventas: media(pc((d) => d.hVen[h]))
  }));
  // Ley de Little: clientes·segundo en cola = suma de segundos que esperaron (o aguantaron antes de irse).
  const lq = dias.reduce((a, d) => a + d.lq, 0), wq = dias.reduce((a, d) => a + d.wqSum, 0);
  const servidos = dias.reduce((a, d) => a + d.atendidos, 0);
  return {
    reps,
    clientes: kpi(pc((d) => d.llegadas)),
    espera: kpi(pc((d) => media(d.esperas))),
    p95: kpi(pc((d) => p95(d.esperas))),
    sistema: kpi(pc((d) => media(d.sistema))),
    cola: kpi(pc((d) => d.cola)),
    colaMax: kpi(pc((d) => d.colaMax)),
    sla: kpi(pc((d) => (d.llegadas ? (d.dentroSla / d.llegadas) * 100 : 0))),
    abandono: kpi(pc((d) => (d.llegadas ? (d.abandonos / d.llegadas) * 100 : 0))),
    uso: kpi(pc((d) => d.uso * 100)),
    ventas: kpi(pc((d) => d.ventas)),
    perdidas: kpi(pc((d) => d.perdidas)),
    extra: kpi(pc((d) => d.extra)),
    servicio: servidos ? dias.reduce((a, d) => a + d.servTotal, 0) / servidos : 0,
    porHora: horas,
    little: wq > 0 ? Math.abs(lq - wq) / wq : 0
  };
}

// Demanda relativa por día de la semana (0 = lunes): el fin de semana se vende más.
export const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DOW = [0.85, 0.85, 0.9, 0.95, 1.2, 1.35, 1.2];

/**
 * Datos simulados y coherentes: un registro de caja de `dias` días de una sucursal. Cada día varía
 * por día de la semana y por un factor al azar (llueve, hay partido…), y el servicio real es 12% más
 * lento que el supuesto del modelo, para que modelo y "realidad" no calcen de forma perfecta.
 */
export function registrar(productos: Product[], cfg: Config, dias: number, seed: number): Rec[] {
  const m = menu(productos, cfg);
  if (!m.length) return [];
  const tprod = m.map((p) => ({ t: tiempoProducto(p, cfg.tiempos), precio: precioProducto(p) }));
  const ud = rng(seed, 777), log: Rec[] = [];
  for (let d = 0; d < dias; d++) {
    const dow = d % 7, mult = DOW[dow] * Math.exp(0.15 * normal(ud) - 0.011);
    simularDia(d, seed, { ...cfg, llegadas: cfg.llegadas * mult, servicioX: 1.12 }, tprod, log, dow);
  }
  return log;
}


// ——— Escenarios de varios días, para verlos correr en vivo ———
export const NIVELES_FALLA = [
  { nombre: 'Ninguna', tasa: 0, reparacion: 0 },
  { nombre: 'A veces', tasa: 1 / 40, reparacion: 15 },
  { nombre: 'Seguido', tasa: 1 / 10, reparacion: 25 }
];

export interface Escenario { id: string; nombre: string; desc: string; mult: (dow: number) => number; evento: (dow: number) => string; fallas?: number }
export const ESCENARIOS: Escenario[] = [
  { id: 'normal', nombre: 'Semana normal', desc: 'Una semana típica: el fin de semana se vende más.', mult: (d) => DOW[d], evento: () => '' },
  { id: 'promo', nombre: 'Promoción entre semana', desc: 'De miércoles a viernes hay una promoción y llega 40% más gente.', mult: (d) => DOW[d] * (d >= 2 && d <= 4 ? 1.4 : 1), evento: (d) => (d >= 2 && d <= 4 ? 'Promoción' : '') },
  { id: 'partido', nombre: 'Día de partido', desc: 'Cada jueves hay partido y llega el doble de gente.', mult: (d) => DOW[d] * (d === 3 ? 2 : 1), evento: (d) => (d === 3 ? 'Partido' : '') },
  { id: 'cajas', nombre: 'Cajas dañadas', desc: 'Las cajas se caen seguido y tardan en repararse.', mult: (d) => DOW[d], evento: () => '', fallas: 2 }
];

export const META_ESPERA = 3, META_ABANDONO = 5;
export interface DiaVivo {
  dia: number; dow: number; mult: number; evento: string; det: DiaDet;
  kpi: { llegadas: number; atendidos: number; abandonos: number; espera: number; sla: number; abandono: number; ventas: number; perdidas: number; uso: number; fallas: number; caidoMin: number; colaMax: number; extra: number; cumple: boolean };
}

/** Simula `dias` días seguidos de un escenario y guarda el detalle de cada uno para animarlo. */
export function simularDias(productos: Product[], cfg: Config, esc: Escenario, nivel: number, dias: number, seed: number): DiaVivo[] | null {
  const m = menu(productos, cfg);
  if (!m.length || cfg.puestos < 1) return null;
  const tprod = m.map((p) => ({ t: tiempoProducto(p, cfg.tiempos), precio: precioProducto(p) }));
  const nv = NIVELES_FALLA[Math.max(nivel, esc.fallas ?? 0)] ?? NIVELES_FALLA[0];
  const un = rng(seed, 555), out: DiaVivo[] = [];
  for (let d = 0; d < dias; d++) {
    const dow = d % 7, mult = esc.mult(dow) * Math.exp(0.08 * normal(un));
    const det: DiaDet = { clientes: [], caidas: [] };
    const c: Config = { ...cfg, llegadas: cfg.llegadas * mult, fallas: nv.tasa > 0 ? { tasa: nv.tasa, reparacion: nv.reparacion } : undefined };
    const x = simularDia(d, seed, c, tprod, undefined, dow, det);
    const espera = media(x.esperas), abandono = x.llegadas ? (100 * x.abandonos) / x.llegadas : 0;
    out.push({
      dia: d, dow, mult, evento: esc.evento(dow), det,
      kpi: {
        llegadas: x.llegadas, atendidos: x.atendidos, abandonos: x.abandonos, espera, abandono,
        sla: x.llegadas ? (100 * x.dentroSla) / x.llegadas : 100, ventas: x.ventas, perdidas: x.perdidas, uso: x.uso * 100,
        fallas: x.nFallas, caidoMin: x.caido / 60, colaMax: x.colaMax, extra: x.extra, cumple: espera <= META_ESPERA && abandono <= META_ABANDONO
      }
    });
  }
  return out;
}
