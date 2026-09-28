import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'nutriscan.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    brand TEXT,
    serving_size TEXT,
    serving_grams REAL,
    calories REAL,
    total_fat REAL,
    saturated_fat REAL,
    trans_fat REAL,
    cholesterol REAL,
    sodium REAL,
    total_carbs REAL,
    dietary_fiber REAL,
    sugars REAL,
    protein REAL,
    other_nutrients TEXT DEFAULT '{}',
    ocr_raw TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    type TEXT DEFAULT 'meal',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS meal_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT,
    grams REAL NOT NULL,
    calories REAL,
    total_fat REAL,
    saturated_fat REAL,
    sodium REAL,
    total_carbs REAL,
    dietary_fiber REAL,
    sugars REAL,
    protein REAL,
    FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS custom_nutrients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    unit TEXT DEFAULT 'g',
    daily_goal REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS meal_custom_nutrients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_item_id INTEGER NOT NULL,
    custom_nutrient_id INTEGER NOT NULL,
    value REAL NOT NULL,
    FOREIGN KEY (meal_item_id) REFERENCES meal_items(id) ON DELETE CASCADE,
    FOREIGN KEY (custom_nutrient_id) REFERENCES custom_nutrients(id) ON DELETE CASCADE,
    UNIQUE(meal_item_id, custom_nutrient_id)
  );
`);

// Seed default custom nutrients if none exist
const stmt = db.prepare('SELECT COUNT(*) as count FROM custom_nutrients');
if (stmt.get().count === 0) {
  const insert = db.prepare(
    'INSERT INTO custom_nutrients (name, unit, daily_goal) VALUES (?, ?, ?)'
  );
  insert.run('Potasio', 'mg', 3500);
  insert.run('Azúcares añadidos', 'g', 50);
  insert.run('Vitamina C', 'mg', 90);
  insert.run('Calcio', 'mg', 1000);
  insert.run('Hierro', 'mg', 18);
}

export default db;
