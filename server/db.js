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
      serving_size_grams REAL,
      calories REAL,
      total_fat REAL,
      saturated_fat REAL,
      trans_fat REAL,
      cholesterol REAL,
      sodium REAL,
      total_carbs REAL,
      dietary_fiber REAL,
      total_sugars REAL,
      added_sugars REAL,
      protein REAL,
      other_nutrients TEXT DEFAULT '{}',
      image_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'meal',
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
      protein REAL,
      other_nutrients TEXT DEFAULT '{}',
      FOREIGN KEY (meal_id) REFERENCES meals(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS custom_nutrients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      unit TEXT NOT NULL DEFAULT 'mg',
      daily_target REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Insert default custom nutrients if none exist
  const count = db.prepare('SELECT COUNT(*) as count FROM custom_nutrients').get();
  if (count.count === 0) {
    const insert = db.prepare(
      'INSERT INTO custom_nutrients (name, unit, daily_target) VALUES (?, ?, ?)'
    );
    insert.run('Potasio', 'mg', 3500);
    insert.run('Calcio', 'mg', 1000);
    insert.run('Vitamina C', 'mg', 90);
    insert.run('Hierro', 'mg', 18);
    insert.run('Magnesio', 'mg', 400);
  }
}
