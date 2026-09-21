-- Ръчен fallback за настройка на PostgreSQL за приложението "Напояване ХТР Ямбол".
-- От версията със самонастройваща се инсталация (electron/provision.cjs) това вече НЕ е нужно
-- за нормална инсталация — при първо стартиране приложението си го прави само. Пусни ръчно само
-- за отстраняване на проблем или нестандартна настройка: psql -U postgres -f setup.sql

CREATE DATABASE napoyavane;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'napoyavane_app') THEN
    CREATE ROLE napoyavane_app WITH LOGIN PASSWORD 'f4MIhX8XoWqX7rZsrftenuhd';
  END IF;
END
$$;

GRANT ALL PRIVILEGES ON DATABASE napoyavane TO napoyavane_app;

\c napoyavane

GRANT ALL ON SCHEMA public TO napoyavane_app;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'operator';

CREATE TABLE IF NOT EXISTS contractors (id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id), data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS htus (id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id), data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS irrigation_methods (id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id), data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS crops (id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id), data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS contracts (id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id), data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS acts (id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id), data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id), data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id), data JSONB NOT NULL);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO napoyavane_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO napoyavane_app;
