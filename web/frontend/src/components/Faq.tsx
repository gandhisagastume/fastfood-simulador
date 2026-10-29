import { useState } from 'react';

export const QA = [
  { q: '¿Esto predice ventas o lo que come la gente?', a: 'No. Simula selección sobre el menú disponible. Sin frecuencias de compra, todo es experimento del modelo, no conducta real.' },
  { q: '¿Por qué no es un modelo de colas?', a: 'El CSV no trae timestamps, llegadas ni tiempos de servicio. Forzar colas sería inventar datos. Monte Carlo empírico es lo honesto.' },
  { q: '¿Qué significa <5 en el CSV?', a: 'Valor censurado. Se imputa 2.5 con flag censored y se documenta. Ver reporte de limpieza.' },
  { q: '¿Cómo reproduzco una corrida?', a: 'Cada run guarda escenario, N, seed, variable y filtros en Postgres. Re-corre con mismo seed y obtienes la misma distribución.' },
  { q: '¿Stack?', a: 'Astro + React + TypeScript, Go 1.22, PostgreSQL 16, Docker Compose. Motor Monte Carlo en Go.' }
];

export const QA_SIM = [
  { q: '¿Qué hace exactamente la simulación?', a: 'Toma un producto del menú real al azar, anota su valor (calorías, sodio…) y repite eso 10,000 veces. Luego resume los 10,000 valores en media, mediana y P95. No inventa productos: solo remuestrea los que existen.' },
  { q: '¿Para qué sirve si ya tengo el menú?', a: 'Para probar reglas. «¿Qué pasaría si solo se eligieran productos con menos de 800 mg de sodio?» La simulación responde cuánto bajaría el valor típico y cuántos productos quedarían, sin tener que armar el caso a mano.' },
  { q: '¿Qué es la semilla?', a: 'El número que arranca el generador de azar. Con la misma semilla (42 por defecto) y los mismos ajustes obtienes exactamente el mismo resultado; si la cambias, varía un poco por azar.' },
  { q: '¿Qué significan mediana y P95?', a: 'La mediana es el valor del medio: la mitad de los productos queda por debajo. El P95 es el valor que el 95% no supera; muestra qué tan alto llegan los productos más fuertes.' },
  { q: '¿Qué significa «Δ media»?', a: 'El cambio de la media frente al menú completo. −51% quiere decir que, con esa regla, el valor promedio baja a la mitad.' },
  { q: '¿Cuántas repeticiones conviene usar?', a: '10,000 es un buen punto: la diferencia con el menú real ya es menor al 1%. Con 1,000 se nota más ruido; con 100,000 casi no mejora y tarda más.' },
  { q: '¿Qué dice la validación?', a: 'Que la media simulada cae dentro del intervalo de confianza del 95% de la real. Si pasa en todas las cadenas, el simulador reproduce bien el menú.' },
  { q: '¿Por qué ninguna distribución ajusta bien las calorías?', a: 'El menú mezcla bebidas, postres y platos, que son grupos muy distintos. Por eso se usan los datos reales (distribución empírica) en lugar de forzar una curva.' }
];

export default function Faq({ items = QA }: { items?: { q: string; a: string }[] }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="grid faq" style={{ gridTemplateColumns: '1fr', gap: 10 }}>
      {items.map((x, i) => (
        <details key={i} open={i === open} onToggle={() => setOpen(i)}>
          <summary>{x.q}</summary>
          <p>{x.a}</p>
        </details>
      ))}
    </div>
  );
}
