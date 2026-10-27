package handler

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"

	"fastfood-sim/internal/service"
)

// loadAll trae todo el dataset (incluidas filas de sección) o responde el error.
func (h *H) loadAll(w http.ResponseWriter, r *http.Request) ([]service.Product, bool) {
	ds, ok := h.dataset(w, r)
	if !ok {
		return nil, false
	}
	ps, err := h.Repo.AllForSim(r.Context(), ds)
	if err != nil {
		internal(w, err)
		return nil, false
	}
	return ps, true
}

func variableParam(w http.ResponseWriter, r *http.Request) (string, bool) {
	v := r.URL.Query().Get("variable")
	if v == "" {
		v = "calories"
	}
	if !service.ValidVariable(v) {
		http.Error(w, "variable desconocida: "+v, http.StatusBadRequest)
		return "", false
	}
	return v, true
}

func (h *H) dictionary(w http.ResponseWriter, r *http.Request) {
	if ps, ok := h.loadAll(w, r); ok {
		write(w, map[string]any{
			"entries": service.Dictionary(ps),
			"notes": []string{
				"El dataset no contiene variables temporales (fechas, horas, tiempos de espera o de servicio): no hay colas ni horas pico que modelar.",
				"El umbral de cada variable es un límite de referencia de aproximadamente el 30% del valor diario (FDA, dieta de 2 000 kcal): una comida de tres. Es criterio del equipo.",
				"El tipo de producto se infiere por palabras clave del nombre, y puede equivocarse en casos raros.",
			},
		})
	}
}

func (h *H) report(w http.ResponseWriter, r *http.Request) {
	if ps, ok := h.loadAll(w, r); ok {
		write(w, service.BuildReport(ps))
	}
}

func (h *H) fit(w http.ResponseWriter, r *http.Request) {
	variable, ok := variableParam(w, r)
	if !ok {
		return
	}
	ps, ok := h.loadAll(w, r)
	if !ok {
		return
	}
	company := r.URL.Query().Get("company")
	var xs []float64
	for _, p := range ps {
		if p.IsSectionRow || (company != "" && p.Company != company) {
			continue
		}
		if v := service.VarValue(p, variable); v != nil {
			xs = append(xs, *v)
		}
	}
	res, err := service.FitDistributions(xs)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	write(w, res)
}

func (h *H) validate(w http.ResponseWriter, r *http.Request) {
	variable, ok := variableParam(w, r)
	if !ok {
		return
	}
	ps, ok := h.loadAll(w, r)
	if !ok {
		return
	}
	write(w, service.Validate(ps, variable, []int{1000, 5000, 10000, 20000}, 42))
}

func (h *H) recommend(w http.ResponseWriter, r *http.Request) {
	if ps, ok := h.loadAll(w, r); ok {
		write(w, service.Recommend(ps))
	}
}

func num(x *float64) string {
	if x == nil {
		return ""
	}
	return strconv.FormatFloat(*x, 'f', -1, 64)
}

func csvResponse(w http.ResponseWriter, name string) *csv.Writer {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	w.Write([]byte("\ufeff")) // para que Excel lea bien los acentos
	return csv.NewWriter(w)
}

// exportDataset entrega el dataset limpio: sin filas de sección, con tipo de producto e índices.
func (h *H) exportDataset(w http.ResponseWriter, r *http.Request) {
	ps, ok := h.loadAll(w, r)
	if !ok {
		return
	}
	cw := csvResponse(w, "dataset_limpio.csv")
	head := []string{"linea_origen", "empresa", "producto", "tipo_producto"}
	for _, v := range service.Variables {
		head = append(head, v.ID)
	}
	head = append(head, "censurado")
	cw.Write(head)
	for _, p := range ps {
		if p.IsSectionRow {
			continue
		}
		row := []string{strconv.Itoa(p.SourceLine), p.Company, p.Item, p.Category}
		for _, v := range service.Variables {
			row = append(row, num(service.VarValue(p, v.ID)))
		}
		cw.Write(append(row, strconv.FormatBool(p.Censored)))
	}
	cw.Flush()
}

func (h *H) exportDictionary(w http.ResponseWriter, r *http.Request) {
	ps, ok := h.loadAll(w, r)
	if !ok {
		return
	}
	cw := csvResponse(w, "diccionario_datos.csv")
	cw.Write([]string{"columna_csv", "id", "tipo", "unidad", "descripcion", "valor_diario", "umbral", "umbral_pct_vd", "validos", "faltantes", "completitud", "min", "max", "media"})
	f := func(x float64) string { return strconv.FormatFloat(x, 'f', -1, 64) }
	for _, e := range service.Dictionary(ps) {
		cw.Write([]string{e.Column, e.ID, e.Type, e.Unit, e.Description, f(e.DailyValue), f(e.Threshold), f(e.ThresholdPct),
			strconv.Itoa(e.Valid), strconv.Itoa(e.Missing), fmt.Sprintf("%.4f", e.Completeness), f(e.Min), f(e.Max), f(e.Mean)})
	}
	cw.Flush()
}
