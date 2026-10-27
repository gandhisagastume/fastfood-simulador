package service

import (
	"math/rand"
	"slices"
	"sort"
	"strings"
)

// SimFilter filtros escenario D/E.
type SimFilter struct {
	Company     string   `json:"company"`
	Companies   []string `json:"companies"`
	MaxCalories *float64 `json:"max_calories"`
	MinProtein  *float64 `json:"min_protein"`
	MaxSodium   *float64 `json:"max_sodium"`
	MinCalories *float64 `json:"min_calories"`
	Search      string   `json:"search"`
	Combo       int      `json:"combo"` // E1: suma k productos
}

// SimResult por grupo (cadena, tipo de producto o total).
type SimResult struct {
	Company string  `json:"company"`
	Mean    float64 `json:"mean"`
	SD      float64 `json:"sd"`
	P25     float64 `json:"p25"`
	P50     float64 `json:"p50"`
	P75     float64 `json:"p75"`
	P95     float64 `json:"p95"`
	POver   float64 `json:"p_over"`
	NValid  int     `json:"n_valid"`
	Pool    int     `json:"pool"` // productos distintos de los que se muestreó
}

var scenarios = []string{"A", "B", "C", "D", "E1", "E2", "E3", "E4", "E5"}

// ValidScenario dice si el motor implementa el escenario.
func ValidScenario(s string) bool { return slices.Contains(scenarios, s) }

// Preset completa las reglas propias de cada escenario E sin pisar lo que mande el cliente.
func Preset(scenario, variable string, f SimFilter, over *float64) (SimFilter, *float64) {
	def := func(p **float64, v float64) {
		if *p == nil {
			*p = &v
		}
	}
	switch scenario {
	case "E1":
		if f.Combo < 2 {
			f.Combo = 3
		}
	case "E2":
		def(&over, Threshold(variable))
	case "E3":
		def(&f.MaxSodium, 800)
	case "E4":
		def(&f.MinProtein, 20)
	}
	return f, over
}

func passFilter(p Product, f SimFilter, variable string) bool {
	if p.IsSectionRow || VarValue(p, variable) == nil {
		return false
	}
	if f.Company != "" && p.Company != f.Company {
		return false
	}
	if len(f.Companies) > 0 && !slices.Contains(f.Companies, p.Company) {
		return false
	}
	if f.Search != "" && !strings.Contains(strings.ToLower(p.Item), strings.ToLower(f.Search)) {
		return false
	}
	if f.MaxCalories != nil && (p.Calories == nil || *p.Calories > *f.MaxCalories) {
		return false
	}
	if f.MinCalories != nil && (p.Calories == nil || *p.Calories < *f.MinCalories) {
		return false
	}
	if f.MinProtein != nil && (p.Protein == nil || *p.Protein < *f.MinProtein) {
		return false
	}
	if f.MaxSodium != nil && (p.Sodium == nil || *p.Sodium > *f.MaxSodium) {
		return false
	}
	return true
}

// group es una población de la que se muestrea y las muestras obtenidas.
type group struct {
	Label string
	Pool  []float64
	Xs    []float64
}

// draw hace el muestreo empírico con reemplazo. Misma semilla y entradas, mismo resultado.
func draw(products []Product, scenario, variable string, n int, seed int64, f SimFilter) []group {
	rng := rand.New(rand.NewSource(seed))
	key := func(p Product) string {
		if scenario == "E5" {
			return p.Category
		}
		return p.Company
	}
	var poolAll []float64
	pools := map[string][]float64{}
	for _, p := range products {
		if !passFilter(p, f, variable) {
			continue
		}
		v := *VarValue(p, variable)
		poolAll = append(poolAll, v)
		pools[key(p)] = append(pools[key(p)], v)
	}
	keys := make([]string, 0, len(pools))
	for k := range pools {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	k := max(1, f.Combo)
	// sim hace n corridas; cada una suma k elecciones, cada una de pick().
	sim := func(label string, pool []float64, pick func() []float64) group {
		xs := make([]float64, n)
		for i := range xs {
			for j := 0; j < k; j++ {
				p := pick()
				xs[i] += p[rng.Intn(len(p))]
			}
		}
		return group{label, pool, xs}
	}
	of := func(key string) func() []float64 { return func() []float64 { return pools[key] } }

	var out []group
	switch scenario {
	case "B":
		if len(keys) > 0 {
			out = append(out, sim("BALANCED", poolAll, func() []float64 { return pools[keys[rng.Intn(len(keys))]] }))
		}
	case "C", "E5":
		for _, c := range keys {
			out = append(out, sim(c, pools[c], of(c)))
		}
	default: // A, D, E1–E4: total y detalle por cadena
		if len(poolAll) > 0 {
			out = append(out, sim("ALL", poolAll, func() []float64 { return poolAll }))
		}
		for _, c := range keys {
			out = append(out, sim(c, pools[c], of(c)))
		}
	}
	return out
}

// Simulate Monte Carlo empírico con reemplazo; resume cada grupo.
func Simulate(products []Product, scenario, variable string, n int, seed int64, f SimFilter, over *float64) []SimResult {
	var out []SimResult
	for _, g := range draw(products, scenario, variable, n, seed, f) {
		d := Describe(g.Xs)
		r := SimResult{Company: g.Label, Mean: d.Mean, SD: d.SD, P25: d.P25, P50: d.P50, P75: d.P75, P95: d.P95, NValid: d.N, Pool: len(g.Pool)}
		if over != nil {
			c := 0
			for _, v := range g.Xs {
				if v > *over {
					c++
				}
			}
			r.POver = float64(c) / float64(len(g.Xs))
		}
		out = append(out, r)
	}
	return out
}
