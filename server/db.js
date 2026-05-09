const Database = require("better-sqlite3");
const path = require("path");
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "data.sqlite");
const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS credit_wallets (user_id TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS credit_transactions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, amount INTEGER NOT NULL, description TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, key_prefix TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_used_at TEXT);
CREATE TABLE IF NOT EXISTS api_usage_logs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, api_key_id TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, credits_used INTEGER NOT NULL, status TEXT NOT NULL, error_message TEXT, created_at TEXT NOT NULL);
`);

module.exports = db;
