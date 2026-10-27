package service

import "math"

// ValRow compara la media simulada de un grupo con la media real del menú.
type ValRow struct {
	Company string  `json:"company"`
	N       int     `json:"n"`
	Real    float64 `json:"real_mean"`
	Sim     float64 `json:"sim_mean"`
	RelDiff float64 `json:"rel_diff"`
	SE      float64 `json:"se"`
	Z       float64 `json:"z"`
	InCI    bool    `json:"in_ci"` // |z| <= 1.96
	KSD     float64 `json:"ks_d"`  // distancia entre la distribución simulada y la real
	Pool    int     `json:"pool"`
}

func meanSD(xs []float64) (mean, sd float64) {
	if len(xs) == 0 {
		return 0, 0
	}
	for _, x := range xs {
		mean += x
	}
	mean /= float64(len(xs))
	if len(xs) > 1 {
		for _, x := range xs {
			sd += (x - mean) * (x - mean)
		}
		sd = math.Sqrt(sd / float64(len(xs)-1))
	}
	return mean, sd
}

// Validate repite el escenario A con distintos N y contrasta lo simulado con los datos reales:
// diferencia relativa, puntaje z de la media y distancia de Kolmogorov-Smirnov.
func Validate(products []Product, variable string, ns []int, seed int64) []ValRow {
	var out []ValRow
	for _, n := range ns {
		for _, g := range draw(products, "A", variable, n, seed, SimFilter{}) {
			real, _ := meanSD(g.Pool)
			sim, sd := meanSD(g.Xs)
			row := ValRow{Company: g.Label, N: n, Real: real, Sim: sim, Pool: len(g.Pool), KSD: ksTwoSample(g.Xs, g.Pool)}
			row.SE = sd / math.Sqrt(float64(n))
			if real != 0 {
				row.RelDiff = (sim - real) / real
			}
			if row.SE > 0 {
				row.Z = (sim - real) / row.SE
			}
			row.InCI = math.Abs(row.Z) <= 1.96
			out = append(out, row)
		}
	}
	return out
}
