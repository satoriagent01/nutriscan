import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'nutriscan.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
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
      image_path TEXT,
      raw_ocr TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS custom_nutrients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'mg',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS custom_nutrient_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
      custom_nutrient_id INTEGER REFERENCES custom_nutrients(id) ON DELETE CASCADE,
      value REAL,
      UNIQUE(product_id, custom_nutrient_id)
    );

    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS meal_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_id INTEGER REFERENCES meals(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      grams REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_totals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      calories REAL DEFAULT 0,
      total_fat REAL DEFAULT 0,
      saturated_fat REAL DEFAULT 0,
      cholesterol REAL DEFAULT 0,
      sodium REAL DEFAULT 0,
      total_carbs REAL DEFAULT 0,
      dietary_fiber REAL DEFAULT 0,
      sugars REAL DEFAULT 0,
      protein REAL DEFAULT 0,
      custom_nutrient_1 REAL DEFAULT 0,
      custom_nutrient_2 REAL DEFAULT 0,
      custom_nutrient_3 REAL DEFAULT 0,
      UNIQUE(date)
    );
  `);
}
