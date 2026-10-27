package service

import (
	"fmt"
	"sort"
	"strings"
)

// Rule es una regla de selección (un escenario To-Be) con su costo-beneficio frente al menú completo.
type Rule struct {
	Label        string    `json:"label"`
	Filter       SimFilter `json:"filter"`
	Pool         int       `json:"pool"`
	Retained     float64   `json:"retained"`
	Chains       int       `json:"chains"`
	CaloriesMean float64   `json:"calories_mean"`
	CaloriesP95  float64   `json:"calories_p95"`
	SodiumMean   float64   `json:"sodium_mean"`
	SodiumP95    float64   `json:"sodium_p95"`
	Cost         float64   `json:"cost"`
	Benefit      float64   `json:"benefit"`
	Balance      float64   `json:"balance"`
	DCost        float64   `json:"d_cost"`    // cambio relativo del costo frente al menú completo
	DBenefit     float64   `json:"d_benefit"` // cambio relativo del beneficio
	DBalance     float64   `json:"d_balance"` // cambio absoluto del balance, en puntos de %VD
	Eligible     bool      `json:"eligible"`
}

// Conc dice qué parte del menú de cada cadena supera los umbrales de referencia.
type Conc struct {
	Company      string  `json:"company"`
	N            int     `json:"n"`
	OverCalories float64 `json:"over_calories"`
	OverSodium   float64 `json:"over_sodium"`
	OverSugars   float64 `json:"over_sugars"`
}

// Combo es la mejor comida armada con un plato, una bebida y un postre de la misma cadena.
type Combo struct {
	Company  string  `json:"company"`
	Plate    string  `json:"plate"`
	Drink    string  `json:"drink"`
	Dessert  string  `json:"dessert"`
	Calories float64 `json:"calories"`
	Sodium   float64 `json:"sodium"`
	Protein  float64 `json:"protein"`
	Balance  float64 `json:"balance"`
}

type Recommendation struct {
	Baseline      Rule     `json:"baseline"`
	Rules         []Rule   `json:"rules"`
	Best          *Rule    `json:"best"`
	Discarded     int      `json:"discarded"`
	Concentration []Conc   `json:"concentration"`
	Combos        []Combo  `json:"combos"`
	Method        []string `json:"method"`
}

const minRetained = 0.30

func ptr(x float64) *float64 { return &x }

func ruleLabel(f SimFilter) string {
	var parts []string
	if f.MaxCalories != nil {
		parts = append(parts, fmt.Sprintf("hasta %g kcal", *f.MaxCalories))
	}
	if f.MaxSodium != nil {
		parts = append(parts, fmt.Sprintf("sodio hasta %g mg", *f.MaxSodium))
	}
	if f.MinProtein != nil {
		parts = append(parts, fmt.Sprintf("proteína desde %g g", *f.MinProtein))
	}
	if len(parts) == 0 {
		return "Menú completo (escenario actual)"
	}
	return strings.Join(parts, " · ")
}

func evalRule(eligible []Product, f SimFilter) Rule {
	r := Rule{Label: ruleLabel(f), Filter: f}
	var cal, sod, cost, ben, bal []float64
	chains := map[string]bool{}
	for _, p := range eligible {
		if !passFilter(p, f, "balance") {
			continue
		}
		chains[p.Company] = true
		cal = append(cal, *p.Calories)
		sod = append(sod, *p.Sodium)
		cost = append(cost, *p.Cost)
		ben = append(ben, *p.Benefit)
		bal = append(bal, *p.Balance)
	}
	r.Pool, r.Chains = len(cal), len(chains)
	if len(eligible) > 0 {
		r.Retained = float64(r.Pool) / float64(len(eligible))
	}
	dc, ds := Describe(cal), Describe(sod)
	r.CaloriesMean, r.CaloriesP95, r.SodiumMean, r.SodiumP95 = dc.Mean, dc.P95, ds.Mean, ds.P95
	r.Cost, _ = meanSD(cost)
	r.Benefit, _ = meanSD(ben)
	r.Balance, _ = meanSD(bal)
	return r
}

// Recommend evalúa una grilla de reglas sobre los productos con datos completos y elige la que
// más mejora el balance sin dejar fuera a ninguna cadena ni a más del 70% del menú.
func Recommend(products []Product) Recommendation {
	var eligible []Product
	for _, p := range products {
		if !p.IsSectionRow && p.Balance != nil {
			eligible = append(eligible, p)
		}
	}
	rec := Recommendation{Baseline: evalRule(eligible, SimFilter{}), Method: []string{
		"Se usan solo los productos con calorías, sodio, azúcares, grasa saturada, proteína y fibra (el mismo conjunto para costo, beneficio y balance).",
		"Costo = promedio del %VD de calorías, sodio, azúcares y grasa saturada. Beneficio = promedio del %VD de proteína y fibra. Balance = beneficio − costo.",
		"%VD sobre los valores diarios de la FDA para una dieta de 2 000 kcal. Los azúcares usan 50 g como referencia aunque la FDA solo la fija para los añadidos.",
		"Se descartan reglas que dejen menos del 30% del menú o que dejen sin productos a alguna cadena.",
		"No hay precios en el CSV: el costo es nutricional, no monetario.",
	}}
	for _, cal := range []*float64{nil, ptr(500), ptr(600), ptr(700)} {
		for _, sod := range []*float64{nil, ptr(800), ptr(1000)} {
			for _, prot := range []*float64{nil, ptr(15), ptr(20)} {
				if cal == nil && sod == nil && prot == nil {
					continue
				}
				r := evalRule(eligible, SimFilter{MaxCalories: cal, MaxSodium: sod, MinProtein: prot})
				b := rec.Baseline
				if b.Cost != 0 {
					r.DCost = (r.Cost - b.Cost) / b.Cost
				}
				if b.Benefit != 0 {
					r.DBenefit = (r.Benefit - b.Benefit) / b.Benefit
				}
				r.DBalance = r.Balance - b.Balance
				r.Eligible = r.Retained >= minRetained && r.Chains == b.Chains
				if r.Eligible {
					rec.Rules = append(rec.Rules, r)
				} else {
					rec.Discarded++
				}
			}
		}
	}
	sort.SliceStable(rec.Rules, func(i, j int) bool { return rec.Rules[i].Balance > rec.Rules[j].Balance })
	if len(rec.Rules) > 0 {
		rec.Best = &rec.Rules[0]
	}
	rec.Concentration = concentration(products)
	rec.Combos = combos(eligible)
	return rec
}

func concentration(products []Product) []Conc {
	over := func(ps []Product, id string) float64 {
		var n, c int
		for _, p := range ps {
			if v := VarValue(p, id); v != nil {
				n++
				if *v > Threshold(id) {
					c++
				}
			}
		}
		if n == 0 {
			return 0
		}
		return float64(c) / float64(n)
	}
	var out []Conc
	for _, c := range companyList(products) {
		var ps []Product
		for _, p := range products {
			if !p.IsSectionRow && p.Company == c {
				ps = append(ps, p)
			}
		}
		out = append(out, Conc{c, len(ps), over(ps, "calories"), over(ps, "sodium"), over(ps, "sugars")})
	}
	score := func(c Conc) float64 { return c.OverCalories + c.OverSodium + c.OverSugars }
	sort.Slice(out, func(i, j int) bool { return score(out[i]) > score(out[j]) })
	return out
}

// combos busca por cadena la comida de mayor balance con un plato, una bebida y un postre
// que sume entre 400 y 900 kcal y no pase de 1 500 mg de sodio. Cada pieza debe ser una porción
// real (plato ≥ 150 kcal, bebida ≥ 50, postre ≥ 100), para no premiar sobres y aderezos.
func combos(eligible []Product) []Combo {
	var out []Combo
	for _, c := range companyList(eligible) {
		by := map[string][]Product{}
		for _, p := range eligible {
			if p.Company == c {
				by[p.Category] = append(by[p.Category], p)
			}
		}
		var best *Combo
		over := func(ps []Product, kcal float64) []Product {
			var out []Product
			for _, p := range ps {
				if *p.Calories >= kcal {
					out = append(out, p)
				}
			}
			return out
		}
		for _, a := range over(by["Platos"], 150) {
			for _, b := range over(by["Bebidas"], 50) {
				for _, d := range over(by["Postres"], 100) {
					cal := *a.Calories + *b.Calories + *d.Calories
					sod := *a.Sodium + *b.Sodium + *d.Sodium
					bal := *a.Balance + *b.Balance + *d.Balance
					if cal < 400 || cal > 900 || sod > 1500 || (best != nil && bal <= best.Balance) {
						continue
					}
					best = &Combo{c, a.Item, b.Item, d.Item, cal, sod, *a.Protein + *b.Protein + *d.Protein, bal}
				}
			}
		}
		if best != nil {
			out = append(out, *best)
		}
	}
	return out
}
