package service

import (
	"regexp"
	"sort"
)

// DailyValue son los valores diarios de referencia de la FDA (dieta de 2 000 kcal).
var DailyValue = map[string]float64{
	"calories": 2000, "total_fat": 78, "saturated_fat": 20, "cholesterol": 300,
	"sodium": 2300, "carbs": 275, "fiber": 28, "sugars": 50, "protein": 50,
}

// Derive calcula lo que no viene en el CSV: tipo de producto e índices nutricionales.
//
// Costo    = promedio del %VD de calorías, sodio, azúcares y grasa saturada.
// Beneficio = promedio del %VD de proteína y fibra.
// Balance  = beneficio - costo. Los tres solo existen si el producto trae las seis medidas,
// así comparten el mismo conjunto de productos.
func (p *Product) Derive() {
	p.Category = Categorize(p.Item)
	p.Cost, p.Benefit, p.Balance = nil, nil, nil
	if p.IsSectionRow || p.Calories == nil || p.Sodium == nil || p.Sugars == nil ||
		p.SaturatedFat == nil || p.Protein == nil || p.Fiber == nil {
		return
	}
	dv := DailyValue
	cost := 100 * (*p.Calories/dv["calories"] + *p.Sodium/dv["sodium"] + *p.Sugars/dv["sugars"] + *p.SaturatedFat/dv["saturated_fat"]) / 4
	benefit := 100 * (*p.Protein/dv["protein"] + *p.Fiber/dv["fiber"]) / 2
	balance := benefit - cost
	p.Cost, p.Benefit, p.Balance = &cost, &benefit, &balance
}

var (
	reBeverage = regexp.MustCompile(`(?i)fl oz|shake|coffee|latte|mocha|cappuccino|frapp|\btea\b|lemonade|juice|smoothie|\bmilk\b|\bcola\b|coke|sprite|pepsi|dr pepper|fanta|mountain dew|mtn dew|miranda|freeze|hi-c|minute maid|powerade|dasani|water|refresher|\bsoda\b|beverage|punch|capri sun|tropicana|lipton|fountain|hot chocolate|espresso|cider|slush|brisk|root beer|barq|nestea|aquafina|gatorade|\bdiet\b|iced|lemon-lime`)
	reTopping  = regexp.MustCompile(`(?i)packet|for sundaes|topping`)
	rePotPie   = regexp.MustCompile(`(?i)pot pie`)
	reDessert  = regexp.MustCompile(`(?i)\bcone\b|sundae|\bpie\b|cookie|\bcake\b|cheesecake|mcflurry|ice cream|cinnamon|cinnabon|brownie|donut|parfait|soft serve|frosty|dessert|turnover|churro|fudge`)
	reSide     = regexp.MustCompile(`(?i)sauce|ketchup|mustard|dressing|packet|mayo|syrup|sweetener|dipping|\bdip\b|creamer|salsa|relish|seasoning|splenda`)
)

// Categorize clasifica por palabras clave del nombre: el CSV no trae tipo de producto.
// Es una heurística; los límites se documentan como limitación.
func Categorize(item string) string {
	switch {
	case reTopping.MatchString(item):
		return "Complementos"
	case reBeverage.MatchString(item):
		return "Bebidas"
	case rePotPie.MatchString(item):
		return "Platos"
	case reDessert.MatchString(item):
		return "Postres"
	case reSide.MatchString(item):
		return "Complementos"
	}
	return "Platos"
}

// values devuelve los datos válidos de una variable (sin filas de sección ni vacíos).
func values(products []Product, variable string) []float64 {
	var xs []float64
	for _, p := range products {
		if p.IsSectionRow {
			continue
		}
		if v := VarValue(p, variable); v != nil {
			xs = append(xs, *v)
		}
	}
	return xs
}

func companyList(products []Product) []string {
	set := map[string]bool{}
	for _, p := range products {
		if !p.IsSectionRow {
			set[p.Company] = true
		}
	}
	out := make([]string, 0, len(set))
	for c := range set {
		out = append(out, c)
	}
	sort.Strings(out)
	return out
}
