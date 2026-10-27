-- 001 schema base
CREATE TABLE IF NOT EXISTS datasets(
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  rows_total INT NOT NULL,
  rows_kept INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products(
  id SERIAL PRIMARY KEY,
  dataset_id INT REFERENCES datasets(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  item TEXT NOT NULL,
  calories DOUBLE PRECISION,
  calories_from_fat DOUBLE PRECISION,
  total_fat DOUBLE PRECISION,
  saturated_fat DOUBLE PRECISION,
  trans_fat DOUBLE PRECISION,
  cholesterol DOUBLE PRECISION,
  sodium DOUBLE PRECISION,
  carbs DOUBLE PRECISION,
  fiber DOUBLE PRECISION,
  sugars DOUBLE PRECISION,
  protein DOUBLE PRECISION,
  ww_pnts DOUBLE PRECISION,
  censored BOOL NOT NULL DEFAULT FALSE,
  is_section_row BOOL NOT NULL DEFAULT FALSE,
  source_line INT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_company ON products(company);
CREATE INDEX IF NOT EXISTS idx_products_dataset ON products(dataset_id);

CREATE TABLE IF NOT EXISTS simulation_runs(
  id SERIAL PRIMARY KEY,
  dataset_id INT REFERENCES datasets(id),
  scenario TEXT NOT NULL CHECK (scenario IN ('A','B','C','D','E1','E2','E3','E4','E5')),
  n INT NOT NULL CHECK (n > 0),
  seed BIGINT NOT NULL DEFAULT 42,
  variable TEXT NOT NULL DEFAULT 'calories',
  filters JSONB NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation_results(
  run_id INT REFERENCES simulation_runs(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  variable TEXT NOT NULL,
  mean DOUBLE PRECISION NOT NULL,
  sd DOUBLE PRECISION NOT NULL,
  p25 DOUBLE PRECISION NOT NULL,
  p50 DOUBLE PRECISION NOT NULL,
  p75 DOUBLE PRECISION NOT NULL,
  p95 DOUBLE PRECISION NOT NULL,
  p_over DOUBLE PRECISION NOT NULL DEFAULT 0,
  n_valid INT NOT NULL,
  PRIMARY KEY (run_id, company, variable)
);
