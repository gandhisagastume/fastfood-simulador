import { useMemo, useState } from 'react';
import { rowsFor, valueOf } from '../lib/data';
import { findings, fmt, type VarMeta } from '../lib/stats';
import type { Product } from '../lib/types';
import { Card, Heatmap, heatInsight, Histograms, Ranking, Scatter } from './Charts';
import { BoxLegend, Boxplot, boxes, boxInsight, Correlations, corrInsight } from './EdaCharts';
import { Legend, RangeStrip, StatTable } from './StatView';

export type Shared = { products: Product[]; v: string; meta: VarMeta; focus: string; companies: string[] };

// Distribución del menú real, por cadena o por tipo de producto, con el umbral de referencia.
function RealDistribution({ products, v, meta, focus }: Shared) {
  const [by, setBy] = useState<'chain' | 'type'>('chain');
  const [raw, setRaw] = useState(false);
  const [thr, setThr] = useState(true);
  const over = thr ? meta.threshold : undefined;
  const rows = useMemo(
    () => rowsFor(products, v, by === 'chain' ? (p) => p.Company : (p) => p.Category, over),
    [products, v, by, over]
  );
  const all = rows.find((r) => r.total);
  const hi = rows.filter((r) => !r.total).sort((a, b) => (b.pOver ?? 0) - (a.pOver ?? 0))[0];
  const lead = findings(rows, meta)[0];
  return (
    <>
      <p className="insight"><mark>
        {lead}
        {over !== undefined && all && hi && ` ${Math.round((all.pOver ?? 0) * 100)}% de los productos pasa de ${fmt(over)} ${meta.unit}; ${hi.label} el más alto (${Math.round((hi.pOver ?? 0) * 100)}%).`}
      </mark></p>
      <div className="bar2">
        <div className="seg" role="group" aria-label="Agrupar por">
          <button aria-pressed={by === 'chain'} onClick={() => setBy('chain')}>Por cadena</button>
          <button aria-pressed={by === 'type'} onClick={() => setBy('type')}>Por tipo de producto</button>
        </div>
        <div className="seg" role="group" aria-label="Forma de ver">
          <button aria-pressed={!raw} onClick={() => setRaw(false)}>Lectura</button>
          <button aria-pressed={raw} onClick={() => setRaw(true)}>Números crudos</button>
        </div>
        <label className="check"><input type="checkbox" checked={thr} onChange={(e) => setThr(e.target.checked)} />Marcar umbral ({fmt(meta.threshold)} {meta.unit})</label>
      </div>
      {raw
        ? <StatTable rows={rows} meta={meta} over={over} />
        : <><RangeStrip rows={rows} meta={meta} over={over} focus={by === 'chain' ? focus : ''} /><Legend meta={meta} over={over} /></>}
    </>
  );
}

export default function Explore(s: Shared) {
  const { products, v, meta, focus, companies } = s;
  const all = useMemo(() => rowsFor(products, v).find((r) => r.total), [products, v]);
  const bs = useMemo(() => boxes({ products, v, companies }), [products, v, companies]);
  const top = useMemo(() => [...products].filter((p) => valueOf(p, v) != null).sort((a, b) => valueOf(b, v)! - valueOf(a, v)!)[0], [products, v]);
  const corr = useMemo(() => corrInsight(products), [products]);

  const Sect = ({ title, hint }: { title: string; hint: string }) => (
    <div className="sect"><h2>{title}</h2><span>{hint}</span></div>
  );

  return (
    <div className="dgrid">
      <Sect title="Comparar cadenas" hint="¿Quién tiene más y por cuánto?" />
      <Card title="Distribución" wide
        what="Resume en qué rango de la medida elegida cae la mayoría de los productos, por cadena o por tipo de producto (bebidas, postres, complementos y platos)."
        how="La caja contiene a la mitad central de los productos. La marca es la mediana. La línea llega hasta el valor que solo 1 de cada 20 supera. La línea roja punteada es el umbral de referencia, cerca del 30% del valor diario, y el porcentaje indica cuántos productos lo pasan.">
        <RealDistribution {...s} />
      </Card>

      <Card title="Perfil de cada cadena" insight={heatInsight(products, companies, v)}
        what="Compara la mediana de seis medidas clave en todas las cadenas a la vez."
        how="Cada columna se pinta por separado: cuanto más intenso el azul, más alta es esa cadena respecto a las demás en esa medida. El número es la mediana.">
        <Heatmap products={products} focus={focus} companies={companies} />
      </Card>

      <Card title={`Productos con más ${meta.label.toLowerCase()}`}
        insight={top && `${top.Item} (${top.Company}) llega a ${fmt(valueOf(top, v)!)} ${meta.unit}.`}
        what="Los diez productos individuales que más (o menos) aportan de la medida elegida."
        how="El largo de la barra es el valor del producto; el color, su cadena. Si resaltas una cadena, el ranking se limita a ella.">
        <Ranking {...s} />
      </Card>

      <Sect title="Forma de los datos" hint="¿Cómo se reparten los valores y qué se sale de lo normal?" />
      <Card title="Forma de la distribución" wide
        insight={all && `La mitad central de los productos está entre ${fmt(all.p25)} y ${fmt(all.p75)} ${meta.unit}. Solo 1 de cada 20 pasa de ${fmt(all.p95)} ${meta.unit}.`}
        what="Un histograma por cadena: cuántos productos hay en cada tramo de la medida. Todas usan la misma escala."
        how="Cada barra es un tramo; su altura es el porcentaje de productos de esa cadena en el tramo. La línea roja es la mediana. Un pico a la izquierda es un menú liviano; una cola larga a la derecha, pocos productos muy altos.">
        <Histograms {...s} />
      </Card>

      <Card title="Valores atípicos" wide insight={boxInsight(bs, meta)}
        what="Diagrama de cajas por cadena. Señala los productos que se alejan mucho del resto, sin borrarlos."
        how="La caja es la mitad central; la raya, la mediana; los bigotes llegan al dato más lejano dentro de 1.5 veces el ancho de la caja. Cada círculo rojo es un producto atípico. Si más de la mitad de los datos son iguales (por ejemplo grasa trans) la regla no aplica. Pasa el cursor sobre una fila para ver sus cifras.">
        <Boxplot {...s} />
        <BoxLegend />
      </Card>

      <Sect title="Relaciones" hint="¿Qué medidas suben juntas?" />
      <Card title="Correlaciones" wide insight={corr}
        what="Qué tan juntas suben o bajan dos medidas en los productos del menú."
        how="Cada celda es la correlación r entre dos medidas, de −1 a 1. Azul intenso: suben juntas. Rojo: una sube cuando la otra baja. Cerca de 0 (claro): no se relacionan.">
        <Correlations products={products} />
      </Card>

      <Card title="Relación entre dos medidas" wide
        what="Cada punto es un producto. Muestra si dos medidas suben juntas, por ejemplo calorías y proteína."
        how="Pasa el cursor sobre un punto para ver el producto. El valor r va de −1 a 1: cerca de 0 no hay relación, cerca de 1 suben juntas. El color indica la cadena; usa «Resaltar» para aislar una.">
        <Scatter products={products} focus={focus} companies={companies} />
      </Card>
    </div>
  );
}
