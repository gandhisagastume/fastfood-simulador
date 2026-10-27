package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"

	"fastfood-sim/internal/repository"
	"fastfood-sim/internal/service"
	"github.com/go-chi/chi/v5"
)

type H struct {
	Repo *repository.Repo
}

func write(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("encode: %v", err)
	}
}

// internal registra el detalle y responde sin filtrar texto de la DB al cliente.
func internal(w http.ResponseWriter, err error) {
	log.Printf("error: %v", err)
	http.Error(w, "error interno", http.StatusInternalServerError)
}

func (h *H) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/health", func(w http.ResponseWriter, req *http.Request) { write(w, map[string]string{"ok": "true"}) })
	r.Get("/companies", h.companies)
	r.Get("/products", h.products)
	r.Get("/quality/completeness", h.completeness)
	r.Get("/stats/descriptive", h.descriptive)
	r.Post("/simulate", h.simulate)
	r.Get("/runs", h.runs)
	r.Get("/runs/{id}", h.run)
	r.Get("/dashboard/summary", h.dashboard)
	r.Get("/dictionary", h.dictionary)
	r.Get("/quality/report", h.report)
	r.Get("/fit", h.fit)
	r.Get("/validate", h.validate)
	r.Get("/recommend", h.recommend)
	r.Get("/export/dataset.csv", h.exportDataset)
	r.Get("/export/dictionary.csv", h.exportDictionary)
	return r
}

// dataset resuelve ?dataset_id= o el más reciente. Responde 503 si aún no hay datos.
func (h *H) dataset(w http.ResponseWriter, r *http.Request) (int, bool) {
	if n, err := strconv.Atoi(r.URL.Query().Get("dataset_id")); err == nil && n > 0 {
		return n, true
	}
	id, err := h.Repo.LatestDataset(r.Context())
	if err != nil {
		internal(w, err)
		return 0, false
	}
	if id == 0 {
		http.Error(w, "sin dataset: corre el seeder", http.StatusServiceUnavailable)
		return 0, false
	}
	return id, true
}

func (h *H) companies(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.dataset(w, r)
	if !ok {
		return
	}
	out, err := h.Repo.Companies(r.Context(), ds)
	if err != nil {
		internal(w, err)
		return
	}
	write(w, out)
}

func (h *H) products(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.dataset(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	lim, _ := strconv.Atoi(q.Get("limit"))
	if lim <= 0 || lim > 500 {
		lim = 50
	}
	off, _ := strconv.Atoi(q.Get("offset"))
	out, err := h.Repo.Products(r.Context(), ds, q.Get("company"), q.Get("q"), lim, max(off, 0))
	if err != nil {
		internal(w, err)
		return
	}
	write(w, out)
}

func (h *H) completeness(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.dataset(w, r)
	if !ok {
		return
	}
	out, err := h.Repo.Completeness(r.Context(), ds)
	if err != nil {
		internal(w, err)
		return
	}
	write(w, out)
}

// describeBy agrupa la variable por empresa (sin filas de sección) y añade "ALL".
func (h *H) describeBy(ctx context.Context, ds int, variable string) (map[string]service.Desc, error) {
	prods, err := h.Repo.AllForSim(ctx, ds)
	if err != nil {
		return nil, err
	}
	byCo := map[string][]float64{}
	var all []float64
	for _, p := range prods {
		if p.IsSectionRow {
			continue
		}
		if v := service.VarValue(p, variable); v != nil {
			byCo[p.Company] = append(byCo[p.Company], *v)
			all = append(all, *v)
		}
	}
	out := map[string]service.Desc{"ALL": service.Describe(all)}
	for c, xs := range byCo {
		out[c] = service.Describe(xs)
	}
	return out, nil
}

func (h *H) descriptive(w http.ResponseWriter, r *http.Request) {
	variable := r.URL.Query().Get("variable")
	if variable == "" {
		variable = "calories"
	}
	if !service.ValidVariable(variable) {
		http.Error(w, "variable desconocida: "+variable, http.StatusBadRequest)
		return
	}
	ds, ok := h.dataset(w, r)
	if !ok {
		return
	}
	out, err := h.describeBy(r.Context(), ds, variable)
	if err != nil {
		internal(w, err)
		return
	}
	write(w, out)
}

type simReq struct {
	Scenario string            `json:"scenario"`
	Variable string            `json:"variable"`
	N        int               `json:"n"`
	Seed     int64             `json:"seed"`
	Over     *float64          `json:"over"`
	Filter   service.SimFilter `json:"filter"`
}

func (h *H) simulate(w http.ResponseWriter, r *http.Request) {
	req := simReq{Scenario: "A", Variable: "calories", N: 10000, Seed: 42}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		http.Error(w, "JSON inválido: "+err.Error(), http.StatusBadRequest)
		return
	}
	if !service.ValidScenario(req.Scenario) {
		http.Error(w, "escenario desconocido: "+req.Scenario, http.StatusBadRequest)
		return
	}
	if !service.ValidVariable(req.Variable) {
		http.Error(w, "variable desconocida: "+req.Variable, http.StatusBadRequest)
		return
	}
	if req.N <= 0 {
		req.N = 10000
	}
	req.N = min(req.N, 100000)
	req.Filter, req.Over = service.Preset(req.Scenario, req.Variable, req.Filter, req.Over)

	ds, ok := h.dataset(w, r)
	if !ok {
		return
	}
	prods, err := h.Repo.AllForSim(r.Context(), ds)
	if err != nil {
		internal(w, err)
		return
	}
	res := service.Simulate(prods, req.Scenario, req.Variable, req.N, req.Seed, req.Filter, req.Over)
	if len(res) == 0 {
		http.Error(w, "ningún producto cumple los filtros", http.StatusUnprocessableEntity)
		return
	}
	filters, _ := json.Marshal(struct {
		service.SimFilter
		Over *float64 `json:"over"`
	}{req.Filter, req.Over})
	runID, err := h.Repo.SaveRun(r.Context(), ds, req.Scenario, req.Variable, req.N, req.Seed, filters, res)
	if err != nil {
		internal(w, err)
		return
	}
	write(w, map[string]any{"run_id": runID, "results": res})
}

func (h *H) runs(w http.ResponseWriter, r *http.Request) {
	lim, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if lim <= 0 || lim > 200 {
		lim = 20
	}
	out, err := h.Repo.Runs(r.Context(), lim)
	if err != nil {
		internal(w, err)
		return
	}
	write(w, out)
}

func (h *H) run(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "id inválido", http.StatusBadRequest)
		return
	}
	h.writeRun(w, r, id)
}

func (h *H) writeRun(w http.ResponseWriter, r *http.Request, id int) {
	out, err := h.Repo.RunResults(r.Context(), id)
	if err != nil {
		internal(w, err)
		return
	}
	if len(out) == 0 {
		http.Error(w, "corrida no encontrada", http.StatusNotFound)
		return
	}
	write(w, map[string]any{"run_id": id, "results": out})
}

func (h *H) dashboard(w http.ResponseWriter, r *http.Request) {
	if s := r.URL.Query().Get("run_id"); s != "" {
		id, err := strconv.Atoi(s)
		if err != nil {
			http.Error(w, "run_id inválido", http.StatusBadRequest)
			return
		}
		h.writeRun(w, r, id)
		return
	}
	ds, ok := h.dataset(w, r)
	if !ok {
		return
	}
	out, err := h.describeBy(r.Context(), ds, "calories")
	if err != nil {
		internal(w, err)
		return
	}
	delete(out, "ALL")
	write(w, map[string]any{"default_variable": "calories", "by_company": out})
}
