package repository

import (
	"context"
	"time"

	"fastfood-sim/internal/service"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repo struct{ DB *pgxpool.Pool }

func (r *Repo) Companies(ctx context.Context, datasetID int) ([]map[string]any, error) {
	rows, err := r.DB.Query(ctx, `SELECT company, COUNT(*) c FROM products WHERE dataset_id=$1 AND is_section_row=false GROUP BY 1 ORDER BY 2 DESC`, datasetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var c string
		var n int
		if err := rows.Scan(&c, &n); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"company": c, "count": n})
	}
	return out, rows.Err()
}

func (r *Repo) Products(ctx context.Context, datasetID int, company, q string, limit, offset int) ([]service.Product, error) {
	rows, err := r.DB.Query(ctx, `SELECT company,item,calories,calories_from_fat,total_fat,saturated_fat,trans_fat,cholesterol,sodium,carbs,fiber,sugars,protein,ww_pnts,censored,is_section_row,source_line
		FROM products WHERE dataset_id=$1 AND ($2='' OR company=$2) AND ($3='' OR item ILIKE '%'||$3||'%')
		ORDER BY id LIMIT $4 OFFSET $5`, datasetID, company, q, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []service.Product{}
	for rows.Next() {
		var p service.Product
		if err := rows.Scan(&p.Company, &p.Item, &p.Calories, &p.CaloriesFromFat, &p.TotalFat, &p.SaturatedFat, &p.TransFat, &p.Cholesterol, &p.Sodium, &p.Carbs, &p.Fiber, &p.Sugars, &p.Protein, &p.WwPnts, &p.Censored, &p.IsSectionRow, &p.SourceLine); err != nil {
			return nil, err
		}
		p.Derive()
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *Repo) AllForSim(ctx context.Context, datasetID int) ([]service.Product, error) {
	return r.Products(ctx, datasetID, "", "", 100000, 0)
}

func (r *Repo) Completeness(ctx context.Context, datasetID int) (map[string]map[string]int, error) {
	q := `SELECT
	 COUNT(calories),COUNT(calories_from_fat),COUNT(total_fat),COUNT(saturated_fat),COUNT(trans_fat),COUNT(cholesterol),COUNT(sodium),COUNT(carbs),COUNT(fiber),COUNT(sugars),COUNT(protein),COUNT(ww_pnts),COUNT(*)
	 FROM products WHERE dataset_id=$1 AND is_section_row=false`
	var c [13]int
	if err := r.DB.QueryRow(ctx, q, datasetID).Scan(&c[0], &c[1], &c[2], &c[3], &c[4], &c[5], &c[6], &c[7], &c[8], &c[9], &c[10], &c[11], &c[12]); err != nil {
		return nil, err
	}
	names := []string{"calories", "calories_from_fat", "total_fat", "saturated_fat", "trans_fat", "cholesterol", "sodium", "carbs", "fiber", "sugars", "protein", "ww_pnts"}
	out := map[string]map[string]int{}
	for i, nm := range names {
		out[nm] = map[string]int{"valid": c[i], "total": c[12], "missing": c[12] - c[i]}
	}
	return out, nil
}

// SaveRun guarda la corrida y sus resultados en una sola transacción.
func (r *Repo) SaveRun(ctx context.Context, datasetID int, scenario, variable string, n int, seed int64, filters []byte, res []service.SimResult) (int, error) {
	tx, err := r.DB.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	var id int
	if err := tx.QueryRow(ctx, `INSERT INTO simulation_runs(dataset_id,scenario,n,seed,variable,filters) VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING id`,
		datasetID, scenario, n, seed, variable, string(filters)).Scan(&id); err != nil {
		return 0, err
	}
	b := &pgx.Batch{}
	for _, x := range res {
		b.Queue(`INSERT INTO simulation_results(run_id,company,variable,mean,sd,p25,p50,p75,p95,p_over,n_valid) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
			id, x.Company, variable, x.Mean, x.SD, x.P25, x.P50, x.P75, x.P95, x.POver, x.NValid)
	}
	br := tx.SendBatch(ctx, b)
	for range res {
		if _, err := br.Exec(); err != nil {
			br.Close()
			return 0, err
		}
	}
	if err := br.Close(); err != nil {
		return 0, err
	}
	return id, tx.Commit(ctx)
}

func (r *Repo) RunResults(ctx context.Context, runID int) ([]map[string]any, error) {
	rows, err := r.DB.Query(ctx, `SELECT company,variable,mean,sd,p25,p50,p75,p95,p_over,n_valid FROM simulation_results WHERE run_id=$1 ORDER BY company`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var co, va string
		var me, sd, p25, p50, p75, p95, po float64
		var nv int
		if err := rows.Scan(&co, &va, &me, &sd, &p25, &p50, &p75, &p95, &po, &nv); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"company": co, "variable": va, "mean": me, "sd": sd, "p25": p25, "p50": p50, "p75": p75, "p95": p95, "p_over": po, "n_valid": nv})
	}
	return out, rows.Err()
}

// Runs lista las corridas más recientes (sin resultados).
func (r *Repo) Runs(ctx context.Context, limit int) ([]map[string]any, error) {
	rows, err := r.DB.Query(ctx, `SELECT id,scenario,variable,n,seed,filters,created_at FROM simulation_runs ORDER BY id DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, n int
		var seed int64
		var sc, va string
		var filters map[string]any
		var at time.Time
		if err := rows.Scan(&id, &sc, &va, &n, &seed, &filters, &at); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"id": id, "scenario": sc, "variable": va, "n": n, "seed": seed, "filters": filters, "created_at": at})
	}
	return out, rows.Err()
}

func (r *Repo) LatestDataset(ctx context.Context) (int, error) {
	var id int
	err := r.DB.QueryRow(ctx, `SELECT COALESCE(MAX(id),0) FROM datasets`).Scan(&id)
	return id, err
}
