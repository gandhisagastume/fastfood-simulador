package config

import "os"

func Env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
