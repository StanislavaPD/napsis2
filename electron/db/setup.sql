-- Еднократна настройка на PostgreSQL за приложението "Напояване ХТР Ямбол".
-- Пусни с: psql -U postgres -f setup.sql

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contractors (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS htus (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS irrigation_methods (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS crops (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS contracts (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS acts (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, data JSONB NOT NULL);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO napoyavane_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO napoyavane_app;
