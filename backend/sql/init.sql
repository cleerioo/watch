CREATE TABLE IF NOT EXISTS app_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_store (key, value)
VALUES
  ('users', '[]'::jsonb),
  ('sessions', '[]'::jsonb),
  ('carts', '{}'::jsonb),
  ('wishlists', '{}'::jsonb),
  ('orders', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;
