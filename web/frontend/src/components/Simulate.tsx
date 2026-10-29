import { Card } from './Charts';
import { FitBody, useFit, Validation } from './ModelChecks';
import Faq, { QA_SIM } from './Faq';
import { SimGuide } from './Hint';
import Simulation from './Simulation';
import type { Shared } from './Explore';

export default function Simulate({ v, meta, focus }: Shared) {
  const { fit, err } = useFit(v, focus);
  return (
    <div className="dgrid">
      <Card title="Simulación Monte Carlo" wide
        what="Repite 10,000 veces la elección al azar de un producto del menú real y resume el resultado. Sirve para probar reglas («¿y si solo se vendiera lo que tenga menos de 800 mg de sodio?») sin inventar datos."
        how="Elige un escenario y pulsa Simular. Los escenarios con filtros se comparan con el menú completo: el porcentaje bajo cada valor es el cambio de la media. Las franjas se leen igual que en Explorar.">
        <SimGuide />
        <Simulation v={v} meta={meta} focus={focus} />
      </Card>

      <Card title="Ajuste de distribuciones" wide
        what="Prueba si una distribución conocida (normal, lognormal, exponencial o gamma) describe la medida elegida. Con cadena resaltada, ajusta solo esa cadena."
        how="La línea gruesa son los datos. Si alguna curva de color la sigue de cerca, esa distribución sirve. D mide la distancia máxima entre ambas: debe ser menor que el valor crítico. Si ninguna ajusta, el modelo usa directamente los datos (distribución empírica).">
        <FitBody fit={fit} err={err} meta={meta} />
      </Card>

      <Card title="Validación del modelo" wide
        what="Comprueba que la simulación reproduce lo que pasa en el menú real y que mejora al repetir más veces."
        how="Cada celda es la diferencia relativa entre la media simulada y la media real. Verde significa que cae dentro del intervalo de confianza del 95%. A más repeticiones, las diferencias se acercan a 0.">
        <Validation v={v} meta={meta} />
      </Card>

      <Card title="Preguntas frecuentes" wide
        what="Respuestas cortas sobre cómo funciona la simulación y cómo leer sus resultados."
        how="Pulsa una pregunta para ver la respuesta.">
        <Faq items={QA_SIM} />
      </Card>
    </div>
  );
}
