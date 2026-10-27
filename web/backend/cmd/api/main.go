package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"fastfood-sim/internal/config"
	"fastfood-sim/internal/db"
	"fastfood-sim/internal/handler"
	"fastfood-sim/internal/repository"
	"fastfood-sim/internal/seed"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Pool(ctx, config.Env("DATABASE_URL", "postgres://sim:sim@db:5432/sim?sslmode=disable"))
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	if path := os.Getenv("SEED_CSV"); path != "" {
		if id, err := seed.Run(ctx, pool, path); err != nil {
			log.Printf("seed error: %v", err)
		} else {
			log.Printf("seed ok dataset=%d", id)
		}
		if os.Getenv("SEED_ONLY") == "1" {
			return
		}
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger, middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: strings.Split(config.Env("CORS_ORIGINS", "*"), ","),
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type"},
	}))
	r.Mount("/api", (&handler.H{Repo: &repository.Repo{DB: pool}}).Routes())

	srv := &http.Server{
		Addr:              ":" + config.Env("PORT", "8080"),
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      60 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		srv.Shutdown(shutdown)
	}()
	log.Printf("backend %s", srv.Addr)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
