import { useState } from 'react';

const QA = [
  { q: '¿Esto predice ventas o lo que come la gente?', a: 'No. Simula selección sobre el menú disponible. Sin frecuencias de compra, todo es experimento del modelo, no conducta real.' },
  { q: '¿Por qué no es un modelo de colas?', a: 'El CSV no trae timestamps, llegadas ni tiempos de servicio. Forzar colas sería inventar datos. Monte Carlo empírico es lo honesto.' },
  { q: '¿Qué significa <5 en el CSV?', a: 'Valor censurado. Se imputa 2.5 con flag censored y se documenta. Ver reporte de limpieza.' },
  { q: '¿Cómo reproduzco una corrida?', a: 'Cada run guarda escenario, N, seed, variable y filtros en Postgres. Re-corre con mismo seed y obtienes la misma distribución.' },
  { q: '¿Stack?', a: 'Astro + React + TypeScript, Go 1.22, PostgreSQL 16, Docker Compose. Motor Monte Carlo en Go.' }
];

export default function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <div className="grid faq" style={{ gridTemplateColumns: '1fr', gap: 10 }}>
      {QA.map((x, i) => (
        <details key={i} open={i === open} onToggle={() => setOpen(i)}>
          <summary>{x.q}</summary>
          <p>{x.a}</p>
        </details>
      ))}
    </div>
  );
}
