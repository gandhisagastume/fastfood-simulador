package service

import (
	"math"
	"math/rand"
	"testing"
)

func full(company, item string, cal, sod, sug, sat, prot, fib float64) Product {
	p := Product{Company: company, Item: item, Calories: &cal, Sodium: &sod, Sugars: &sug, SaturatedFat: &sat, Protein: &prot, Fiber: &fib}
	p.Derive()
	return p
}

func TestCategorize(t *testing.T) {
	cases := map[string]string{
		"Big Mac":                           "Platos",
		"Chocolate Triple Thick Shake":      "Bebidas",
		"20 fl oz":                          "Bebidas",
		"Iced Vanilla Latte (Small)":        "Bebidas",
		"Vanilla Frosty, Medium":            "Postres",
		"Sugar Cookie":                      "Postres",
		"Chicken Pot Pie":                   "Platos",
		"Hotcakes":                          "Platos",
		"Barbecue Dipping Sauce (1 oz)":     "Complementos",
		"Sour Cream and Chive Baked Potato": "Platos",
	}
	for item, want := range cases {
		if got := Categorize(item); got != want {
			t.Errorf("Categorize(%q) = %s, want %s", item, got, want)
		}
	}
}

func TestIndex(t *testing.T) {
	// Un producto que aporta exactamente el valor diario de todo: costo 100, beneficio 100, balance 0.
	p := full("X", "Todo", 2000, 2300, 50, 20, 50, 28)
	if p.Cost == nil || math.Abs(*p.Cost-100) > 1e-9 || math.Abs(*p.Benefit-100) > 1e-9 || math.Abs(*p.Balance) > 1e-9 {
		t.Errorf("índices = %v %v %v", p.Cost, p.Benefit, p.Balance)
	}
	cal := 100.0
	q := Product{Calories: &cal}
	q.Derive()
	if q.Cost != nil || q.Balance != nil {
		t.Error("sin las seis medidas no debe haber índice")
	}
}

func TestGammaP(t *testing.T) {
	// P(1, x) = 1 - e^-x ; P(2, 3) = 1 - 4e^-3
	for _, c := range []struct{ a, x, want float64 }{{1, 0.5, 1 - math.Exp(-0.5)}, {1, 4, 1 - math.Exp(-4)}, {2, 3, 1 - 4*math.Exp(-3)}, {5, 2, 0.052653}} {
		if got := gammaP(c.a, c.x); math.Abs(got-c.want) > 1e-5 {
			t.Errorf("gammaP(%v,%v) = %v want %v", c.a, c.x, got, c.want)
		}
	}
}

func TestFitDistributions(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	exp := make([]float64, 800)
	for i := range exp {
		exp[i] = rng.ExpFloat64() * 100
	}
	res, err := FitDistributions(exp)
	if err != nil {
		t.Fatal(err)
	}
	// Una exponencial real debe ser aceptada, y gamma(forma≈1) tan buena como ella.
	var accepted bool
	for _, f := range res.Fits {
		if f.Dist == "Exponencial" && f.Accept {
			accepted = true
		}
	}
	if !accepted || len(res.Curve) != 60 {
		t.Errorf("la exponencial debía ajustar: %+v", res.Fits)
	}
	// Una mezcla bimodal con ceros no la describe ninguna paramétrica.
	bi := []float64{0, 0, 0}
	for i := 0; i < 400; i++ {
		bi = append(bi, 50+rng.Float64()*10, 900+rng.Float64()*10)
	}
	res, err = FitDistributions(bi)
	if err != nil || res.Zeros != 3 || res.Fits[0].Accept {
		t.Errorf("bimodal no debe ajustar: err=%v zeros=%d fits=%+v", err, res.Zeros, res.Fits)
	}
	if _, err := FitDistributions([]float64{1, 1, 1}); err == nil {
		t.Error("pocos datos debe fallar")
	}
}

func TestValidate(t *testing.T) {
	ps := menu()
	rows := Validate(ps, "calories", []int{1000, 20000}, 42)
	if len(rows) != 2*3 || rows[0].Company != "ALL" {
		t.Fatalf("filas inesperadas: %+v", rows)
	}
	for _, r := range rows {
		if r.KSD > 0.05 || math.Abs(r.RelDiff) > 0.1 {
			t.Errorf("el remuestreo debe reproducir lo real: %+v", r)
		}
	}
	if d := ksTwoSample([]float64{1, 2, 3}, []float64{1, 2, 3}); d != 0 {
		t.Errorf("KS de muestras iguales = %v", d)
	}
	if d := ksTwoSample([]float64{1, 2}, []float64{10, 20}); d != 1 {
		t.Errorf("KS de muestras disjuntas = %v", d)
	}
}

func TestReport(t *testing.T) {
	ps := []Product{full("A", "x", 100, 100, 1, 1, 1, 1), full("A", "x", 100, 100, 1, 1, 1, 1)}
	for i := 0; i < 20; i++ {
		ps = append(ps, full("B", "y", float64(100+i), 100, 1, 1, 1, 1))
	}
	ps = append(ps, full("B", "z", 5000, 100, 1, 1, 1, 1), Product{Company: "B", Item: "Sección", IsSectionRow: true})
	r := BuildReport(ps)
	if r.RowsTotal != 24 || r.RowsSection != 1 || r.RowsValid != 23 || r.Duplicates != 1 {
		t.Errorf("conteos: %+v", r)
	}
	if q := r.Variables[0]; q.ID != "calories" || q.Outliers < 1 || q.Extreme < 1 {
		t.Errorf("el 5000 debe ser atípico extremo: %+v", q)
	}
}

func TestRecommend(t *testing.T) {
	var ps []Product
	for _, c := range []string{"A", "B"} {
		for i := 0; i < 20; i++ {
			// Mitad productos livianos con proteína, mitad pesados y salados.
			if i%2 == 0 {
				ps = append(ps, full(c, "Ligero", 300, 400, 2, 1, 25, 5))
			} else {
				ps = append(ps, full(c, "Pesado", 900, 1800, 20, 10, 5, 1))
			}
		}
	}
	rec := Recommend(ps)
	if rec.Baseline.Pool != 40 || rec.Best == nil {
		t.Fatalf("recomendación: %+v", rec)
	}
	if rec.Best.Balance <= rec.Baseline.Balance || rec.Best.DCost >= 0 || rec.Best.Retained < 0.3 || rec.Best.Chains != 2 {
		t.Errorf("la mejor regla debe mejorar balance y bajar costo: %+v", rec.Best)
	}
	for _, r := range rec.Rules {
		if !r.Eligible {
			t.Errorf("regla no elegible en el listado: %+v", r)
		}
	}
}

func TestSimulateByCategory(t *testing.T) {
	a, b := full("X", "Big Mac", 500, 100, 1, 1, 1, 1), full("X", "Cola (20 fl oz)", 200, 10, 50, 0, 0, 0)
	r := Simulate([]Product{a, b}, "E5", "calories", 50, 1, SimFilter{}, nil)
	if len(r) != 2 || r[0].Company != "Bebidas" || r[0].Mean != 200 || r[1].Company != "Platos" || r[1].Mean != 500 {
		t.Errorf("E5 debe agrupar por tipo: %+v", r)
	}
	if r[0].Pool != 1 {
		t.Errorf("pool = %d", r[0].Pool)
	}
}

func TestReportFlatVariable(t *testing.T) {
	var ps []Product
	for i := 0; i < 20; i++ {
		p := full("A", "x", 100, 100, 1, 1, 1, 1)
		z := 0.0
		if i == 0 {
			z = 3
		}
		p.TransFat = &z
		ps = append(ps, p)
	}
	for _, q := range BuildReport(ps).Variables {
		if q.ID == "trans_fat" && (q.Outliers != 0 || q.Note == "") {
			t.Errorf("IQR=0 no debe marcar atípicos: %+v", q)
		}
	}
}
