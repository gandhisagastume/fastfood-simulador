package service

import (
	"fmt"
	"math"
)

// VarInfo describe una variable numérica. Threshold es un límite de referencia de ≈30% del
// valor diario, una comida de tres; es criterio del equipo, no norma.
type VarInfo struct {
	ID, Column, Label, Unit, Desc string
	Threshold                     float64
}

var Variables = []VarInfo{
	{"calories", "Calories", "Calorías", "kcal", "Energía total del producto.", 600},
	{"calories_from_fat", "Calories from Fat", "Calorías de grasa", "kcal", "Parte de la energía que aporta la grasa. Ausente en 4 de 6 cadenas.", 200},
	{"total_fat", "Total Fat (g)", "Grasa total", "g", "Grasa total.", 25},
	{"saturated_fat", "Saturated Fat (g)", "Grasa saturada", "g", "Grasa saturada.", 6},
	{"trans_fat", "Trans Fat (g)", "Grasa trans", "g", "Grasa trans.", 1},
	{"cholesterol", "Cholesterol (mg)", "Colesterol", "mg", "Colesterol.", 90},
	{"sodium", "Sodium (mg)", "Sodio", "mg", "Sodio.", 800},
	{"carbs", "Carbs (g)", "Carbohidratos", "g", "Carbohidratos totales.", 80},
	{"fiber", "Fiber (g)", "Fibra", "g", "Fibra dietética.", 8},
	{"sugars", "Sugars (g)", "Azúcares", "g", "Azúcares totales (la FDA solo fija valor diario para los añadidos).", 15},
	{"protein", "Protein (g)", "Proteína", "g", "Proteína.", 20},
	{"ww_pnts", "Weight Watchers Pnts", "Puntos WW", "pts", "Puntaje de Weight Watchers. Escala no documentada: variable secundaria.", 10},
	{"cost", "(derivada)", "Costo nutricional", "% VD", "Promedio del %VD de calorías, sodio, azúcares y grasa saturada. Más alto, peor.", 20},
	{"benefit", "(derivada)", "Beneficio nutricional", "% VD", "Promedio del %VD de proteína y fibra. Más alto, mejor.", 20},
	{"balance", "(derivada)", "Balance nutricional", "% VD", "Beneficio menos costo. Positivo: aporta más de lo que cuesta.", 0},
}

// Threshold devuelve el umbral de referencia de una variable (600 si no se conoce).
func Threshold(variable string) float64 {
	for _, v := range Variables {
		if v.ID == variable {
			return v.Threshold
		}
	}
	return 600
}

// DictEntry es una fila del diccionario de datos, con la calidad de cada variable.
type DictEntry struct {
	Column       string  `json:"column"`
	ID           string  `json:"id"`
	Type         string  `json:"type"`
	Unit         string  `json:"unit"`
	Description  string  `json:"description"`
	DailyValue   float64 `json:"daily_value"`
	Threshold    float64 `json:"threshold"`
	ThresholdPct float64 `json:"threshold_pct_dv"`
	Valid        int     `json:"valid"`
	Missing      int     `json:"missing"`
	Completeness float64 `json:"completeness"`
	Min          float64 `json:"min"`
	Max          float64 `json:"max"`
	Mean         float64 `json:"mean"`
}

// Dictionary arma el diccionario con estadísticas calculadas sobre los productos válidos.
func Dictionary(products []Product) []DictEntry {
	var rows int
	for _, p := range products {
		if !p.IsSectionRow {
			rows++
		}
	}
	cat := func(col, id, desc string) DictEntry {
		return DictEntry{Column: col, ID: id, Type: "categórica nominal", Description: desc, Valid: rows, Completeness: 1}
	}
	out := []DictEntry{
		cat("Company", "company", "Cadena de comida rápida (6)."),
		cat("Item", "item", "Nombre del producto tal como figura en el menú, sin caracteres dañados."),
		cat("(derivada)", "category", "Tipo de producto: Bebidas, Postres, Complementos o Platos. Se infiere por palabras clave del nombre."),
	}
	for _, v := range Variables {
		xs := values(products, v.ID)
		d := Describe(xs)
		typ := "numérica continua"
		if v.Column == "(derivada)" {
			typ = "numérica derivada (índice)"
		}
		e := DictEntry{
			Column: v.Column, ID: v.ID, Type: typ, Unit: v.Unit, Description: v.Desc, DailyValue: DailyValue[v.ID],
			Threshold: v.Threshold, Valid: len(xs), Missing: rows - len(xs), Min: d.Min, Max: d.Max, Mean: d.Mean,
		}
		if rows > 0 {
			e.Completeness = float64(len(xs)) / float64(rows)
		}
		if e.DailyValue > 0 {
			e.ThresholdPct = math.Round(v.Threshold/e.DailyValue*1000) / 10
		}
		out = append(out, e)
	}
	return out
}

// VarQuality es la calidad de una variable: faltantes y atípicos según Tukey.
type VarQuality struct {
	ID           string  `json:"id"`
	Label        string  `json:"label"`
	Valid        int     `json:"valid"`
	Missing      int     `json:"missing"`
	Completeness float64 `json:"completeness"`
	Lower        float64 `json:"lower_fence"`
	Upper        float64 `json:"upper_fence"`
	Outliers     int     `json:"outliers"`
	Extreme      int     `json:"extreme"`
	Note         string  `json:"note,omitempty"`
}

// CleanReport resume qué se conservó, corrigió y excluyó. Los atípicos se señalan, no se borran.
type CleanReport struct {
	RowsTotal   int          `json:"rows_total"`
	RowsSection int          `json:"rows_section"`
	RowsValid   int          `json:"rows_valid"`
	Duplicates  int          `json:"duplicates"`
	DupExamples []string     `json:"duplicate_examples"`
	Censored    int          `json:"censored"`
	Variables   []VarQuality `json:"variables"`
	Rules       []string     `json:"rules"`
}

func BuildReport(products []Product) CleanReport {
	r := CleanReport{RowsTotal: len(products), Rules: []string{
		"Encabezados normalizados: sin saltos de línea ni espacios dobles.",
		"Celdas vacías pasan a NULL; no se rellenan ni se interpolan.",
		"Se quitan las unidades de texto («5.5 g» pasa a 5.5) y las comas de miles.",
		"Valores censurados «<5» se guardan como 2.5 y el producto queda marcado como censurado.",
		"Filas sin ningún valor numérico se marcan como filas de sección y se excluyen de estadísticas y simulación.",
		"Caracteres dañados en los nombres se eliminan y los saltos de línea pasan a espacio.",
		"Duplicados exactos se reportan y se conservan: pueden ser el mismo producto en dos menús.",
		"Atípicos (criterio de Tukey, 1.5 veces el rango intercuartil) se señalan y se conservan: son productos reales, como las porciones familiares.",
	}}
	seen := map[string]bool{}
	var valid []Product
	for _, p := range products {
		if p.IsSectionRow {
			r.RowsSection++
			continue
		}
		valid = append(valid, p)
		if p.Censored {
			r.Censored++
		}
		k := p.Company + "|" + p.Item
		for _, v := range Variables[:12] {
			if x := VarValue(p, v.ID); x != nil {
				k += fmt.Sprintf("|%g", *x)
			} else {
				k += "|-"
			}
		}
		if seen[k] {
			r.Duplicates++
			if len(r.DupExamples) < 5 {
				r.DupExamples = append(r.DupExamples, p.Company+" — "+p.Item)
			}
		}
		seen[k] = true
	}
	r.RowsValid = len(valid)
	for _, v := range Variables {
		xs := values(valid, v.ID)
		d := Describe(xs)
		iqr := d.P75 - d.P25
		q := VarQuality{ID: v.ID, Label: v.Label, Valid: len(xs), Missing: r.RowsValid - len(xs), Lower: d.P25 - 1.5*iqr, Upper: d.P75 + 1.5*iqr}
		if r.RowsValid > 0 {
			q.Completeness = float64(len(xs)) / float64(r.RowsValid)
		}
		if iqr == 0 {
			q.Note = "Más de la mitad de los valores son iguales: la regla de Tukey no aplica."
		}
		for _, x := range xs {
			if iqr == 0 {
				break
			}
			if x < q.Lower || x > q.Upper {
				q.Outliers++
			}
			if x < d.P25-3*iqr || x > d.P75+3*iqr {
				q.Extreme++
			}
		}
		r.Variables = append(r.Variables, q)
	}
	return r
}
