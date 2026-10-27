package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Pool(ctx context.Context, url string) (*pgxpool.Pool, error) {
	ctx2, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return pgxpool.New(ctx2, url)
}
