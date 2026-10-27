package seed

import (
	"context"
	"encoding/csv"
	"os"

	"fastfood-sim/internal/service"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Run carga CSV -> datasets + products. Idempotente: si ya hay productos, salta.
func Run(ctx context.Context, db *pgxpool.Pool, csvPath string) (int, error) {
	var n int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM products`).Scan(&n); err == nil && n > 0 {
		var id int
		_ = db.QueryRow(ctx, `SELECT MAX(id) FROM datasets`).Scan(&id)
		return id, nil
	}
	f, err := os.Open(csvPath)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	rd := csv.NewReader(f)
	rd.LazyQuotes = true
	rd.FieldsPerRecord = -1
	records, err := rd.ReadAll()
	if err != nil {
		return 0, err
	}
	if len(records) < 2 {
		return 0, nil
	}
	idx := service.HeaderIndex(records[0])
	prods := make([]service.Product, 0, len(records))
	for i, rec := range records[1:] {
		prods = append(prods, service.CleanRow(rec, idx, i+2))
	}
	var datasetID int
	err = db.QueryRow(ctx, `INSERT INTO datasets(filename,rows_total,rows_kept)
		VALUES($1,$2,$3) RETURNING id`, csvPath, len(prods), len(prods)).Scan(&datasetID)
	if err != nil {
		return 0, err
	}
	for _, p := range prods {
		_, err = db.Exec(ctx, `INSERT INTO products(dataset_id,company,item,calories,calories_from_fat,total_fat,saturated_fat,trans_fat,cholesterol,sodium,carbs,fiber,sugars,protein,ww_pnts,censored,is_section_row,source_line)
		 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
			datasetID, p.Company, p.Item, p.Calories, p.CaloriesFromFat, p.TotalFat, p.SaturatedFat, p.TransFat, p.Cholesterol, p.Sodium, p.Carbs, p.Fiber, p.Sugars, p.Protein, p.WwPnts, p.Censored, p.IsSectionRow, p.SourceLine)
		if err != nil {
			return datasetID, err
		}
	}
	return datasetID, nil
}
