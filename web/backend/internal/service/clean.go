package service

import (
	"strconv"
	"strings"
)

// Product fila normalizada.
type Product struct {
	Company         string
	Item            string
	Calories        *float64
	CaloriesFromFat *float64
	TotalFat        *float64
	SaturatedFat    *float64
	TransFat        *float64
	Cholesterol     *float64
	Sodium          *float64
	Carbs           *float64
	Fiber           *float64
	Sugars          *float64
	Protein         *float64
	WwPnts          *float64
	Censored        bool
	IsSectionRow    bool
	SourceLine      int
	// Derivados (ver Derive): no vienen en el CSV ni se guardan en la DB.
	Category string
	Cost     *float64
	Benefit  *float64
	Balance  *float64
}

func normHeader(h string) string {
	h = strings.ReplaceAll(h, "\n", " ")
	h = strings.Join(strings.Fields(h), " ")
	return strings.ToLower(strings.TrimSpace(h))
}

// HeaderIndex mapea header normalizado -> índice.
func HeaderIndex(header []string) map[string]int {
	m := map[string]int{}
	for i, h := range header {
		m[normHeader(h)] = i
	}
	return m
}

// parseNum devuelve el valor y si venía censurado ("<5" -> 2.5).
func parseNum(s string) (*float64, bool) {
	t := strings.TrimSpace(s)
	if t == "" {
		return nil, false
	}
	t = strings.TrimSpace(strings.TrimSuffix(strings.TrimSuffix(t, " g"), "g"))
	if strings.HasPrefix(t, "<") {
		v := 2.5 // regla <5 -> 2.5 documentada
		return &v, true
	}
	v, err := strconv.ParseFloat(strings.ReplaceAll(t, ",", ""), 64)
	if err != nil {
		return nil, false
	}
	return &v, false
}

func cell(rec []string, idx map[string]int, keys ...string) string {
	for _, k := range keys {
		if i, ok := idx[k]; ok && i < len(rec) {
			return rec[i]
		}
	}
	return ""
}

// CleanRow convierte registro crudo -> Product. Sin ningún numérico = fila de sección.
func CleanRow(rec []string, idx map[string]int, line int) Product {
	p := Product{SourceLine: line}
	get := func(keys ...string) *float64 {
		v, censored := parseNum(cell(rec, idx, keys...))
		if censored {
			p.Censored = true
		}
		return v
	}
	p.Company = strings.TrimSpace(cell(rec, idx, "company"))
	p.Item = cleanText(cell(rec, idx, "item"))
	p.Calories = get("calories")
	p.CaloriesFromFat = get("calories from fat")
	p.TotalFat = get("total fat (g)", "total fat")
	p.SaturatedFat = get("saturated fat (g)", "saturated fat")
	p.TransFat = get("trans fat (g)", "trans fat")
	p.Cholesterol = get("cholesterol (mg)", "cholesterol")
	p.Sodium = get("sodium (mg)", "sodium")
	p.Carbs = get("carbs (g)", "carbs")
	p.Fiber = get("fiber (g)", "fiber")
	p.Sugars = get("sugars (g)", "sugars")
	p.Protein = get("protein (g)", "protein")
	p.WwPnts = get("weight watchers pnts", "weight watchers")

	p.IsSectionRow = true
	for _, v := range []*float64{p.Calories, p.CaloriesFromFat, p.TotalFat, p.SaturatedFat, p.TransFat, p.Cholesterol, p.Sodium, p.Carbs, p.Fiber, p.Sugars, p.Protein, p.WwPnts} {
		if v != nil {
			p.IsSectionRow = false
			break
		}
	}
	p.Derive()
	return p
}

// cleanText quita caracteres dañados (U+FFFD y espacios duros) y junta espacios y saltos de línea.
func cleanText(s string) string {
	s = strings.NewReplacer("\uFFFD", "", "\u00a0", " ").Replace(s)
	return strings.Join(strings.Fields(s), " ")
}

var fields = map[string]func(Product) *float64{
	"calories":          func(p Product) *float64 { return p.Calories },
	"calories_from_fat": func(p Product) *float64 { return p.CaloriesFromFat },
	"calories from fat": func(p Product) *float64 { return p.CaloriesFromFat },
	"total_fat":         func(p Product) *float64 { return p.TotalFat },
	"total fat":         func(p Product) *float64 { return p.TotalFat },
	"saturated_fat":     func(p Product) *float64 { return p.SaturatedFat },
	"trans_fat":         func(p Product) *float64 { return p.TransFat },
	"cholesterol":       func(p Product) *float64 { return p.Cholesterol },
	"sodium":            func(p Product) *float64 { return p.Sodium },
	"carbs":             func(p Product) *float64 { return p.Carbs },
	"fiber":             func(p Product) *float64 { return p.Fiber },
	"sugars":            func(p Product) *float64 { return p.Sugars },
	"protein":           func(p Product) *float64 { return p.Protein },
	"ww_pnts":           func(p Product) *float64 { return p.WwPnts },
	"cost":              func(p Product) *float64 { return p.Cost },
	"benefit":           func(p Product) *float64 { return p.Benefit },
	"balance":           func(p Product) *float64 { return p.Balance },
}

// ValidVariable dice si la API conoce la variable.
func ValidVariable(variable string) bool {
	_, ok := fields[strings.ToLower(variable)]
	return ok
}

// VarValue extrae variable para stats/simulación. nil si no existe o no hay dato.
func VarValue(p Product, variable string) *float64 {
	if f, ok := fields[strings.ToLower(variable)]; ok {
		return f(p)
	}
	return nil
}
