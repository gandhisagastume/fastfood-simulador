import { useId, useState, type ReactNode } from 'react';

/* Ícono (i) pequeño con una explicación breve al pasar el cursor o enfocarlo con el teclado. */
export function Hint({ title, children, label = 'Explicación', left }: { title?: string; children: ReactNode; label?: string; left?: boolean }) {
  const id = useId();
  // Si el ícono está en la mitad derecha de la pantalla, el tooltip se abre hacia la izquierda y viceversa.
  const [der, setDer] = useState<boolean | null>(null);
  const lado = (e: { currentTarget: Element }) => setDer(e.currentTarget.getBoundingClientRect().left > innerWidth / 2);
  const l = der === null ? !!left : !der;
  return (
    <span className="info hint" onMouseEnter={lado} onFocus={lado}>
      <button type="button" aria-describedby={id} aria-label={label}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
          <rect x="11" y="10.5" width="2" height="7" fill="currentColor" />
          <circle cx="12" cy="7.3" r="1.4" fill="currentColor" />
        </svg>
      </button>
      <span role="tooltip" id={id} className={`tip${l ? ' l' : ''}`}>{title && <b>{title}</b>}{children}</span>
    </span>
  );
}

const ICONS: Record<string, ReactNode> = {
  dado: <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1.2" fill="currentColor" /><circle cx="15" cy="15" r="1.2" fill="currentColor" /><circle cx="15" cy="9" r="1.2" fill="currentColor" /><circle cx="9" cy="15" r="1.2" fill="currentColor" /></>,
  repetir: <><path d="M4 11a8 8 0 0 1 14-4l2 2" /><path d="M20 4v5h-5" /><path d="M20 13a8 8 0 0 1-14 4l-2-2" /><path d="M4 20v-5h5" /></>,
  grafica: <><path d="M4 20V4" /><path d="M4 20h16" /><rect x="7" y="12" width="3" height="6" fill="currentColor" /><rect x="12" y="8" width="3" height="10" fill="currentColor" /><rect x="17" y="14" width="3" height="4" fill="currentColor" /></>,
};

const STEPS = [
  ['dado', 'Se elige al azar', 'El simulador toma un producto del menú real, como sacar una bolita de una bolsa. Cada producto tiene la misma probabilidad. Después lo devuelve a la bolsa.'],
  ['repetir', 'Se repite miles de veces', 'Hace esa elección 10,000 veces (puedes cambiarlo en «Opciones avanzadas»). Con tantas repeticiones, el resultado se estabiliza y deja de depender de la suerte.'],
  ['grafica', 'Se resume el resultado', 'Con los 10,000 valores calcula la media, la mediana y el P95 (el valor que el 95% no supera). Con la misma semilla siempre da lo mismo.'],
] as const;

/* Guía de tres pasos de qué hace la simulación. */
export function SimGuide() {
  return (
    <ol className="steps" aria-label="Cómo funciona la simulación">
      {STEPS.map(([ic, t, d], i) => (
        <li key={t}>
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[ic]}</svg>
          <span><b>{i + 1}. {t}</b></span>
          <Hint label={`Explicar el paso ${i + 1}`} left={i < 2}>{d}</Hint>
        </li>
      ))}
    </ol>
  );
}
