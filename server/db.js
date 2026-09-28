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
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      brand TEXT,
      serving_size TEXT,
      serving_grams REAL,
      calories REAL,
      protein REAL,
      carbs REAL,
      fat REAL,
      saturated_fat REAL,
      fiber REAL,
      sugar REAL,
      sodium REAL,
      custom_nutrients TEXT DEFAULT '{}',
      ocr_text TEXT,
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
      protein REAL,
      carbs REAL,
      fat REAL,
      saturated_fat REAL,
      fiber REAL,
      sugar REAL,
      sodium REAL,
      custom_nutrients TEXT DEFAULT '{}',
      FOREIGN KEY (meal_id) REFERENCES meals(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS custom_nutrients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_key TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'g',
      daily_goal REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
