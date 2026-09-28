import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'data', 'nutriscan.db'));

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
    protein REAL,
    fat REAL,
    saturated_fat REAL,
    carbs REAL,
    sugars REAL,
    fiber REAL,
    sodium REAL,
    other_nutrients TEXT DEFAULT '{}',
    image_url TEXT,
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
    protein REAL,
    fat REAL,
    saturated_fat REAL,
    carbs REAL,
    sugars REAL,
    fiber REAL,
    sodium REAL,
    other_nutrients TEXT DEFAULT '{}',
    FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS custom_nutrients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    unit TEXT NOT NULL DEFAULT 'g',
    daily_target REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS meal_item_custom_nutrients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_item_id INTEGER NOT NULL,
    custom_nutrient_id INTEGER NOT NULL,
    value REAL NOT NULL,
    FOREIGN KEY (meal_item_id) REFERENCES meal_items(id) ON DELETE CASCADE,
    FOREIGN KEY (custom_nutrient_id) REFERENCES custom_nutrients(id) ON DELETE CASCADE,
    UNIQUE(meal_item_id, custom_nutrient_id)
  );
`);

// Seed default custom nutrients
db.exec(`
  INSERT OR IGNORE INTO custom_nutrients (name, unit, daily_target) VALUES
    ('Potasio', 'mg', 3500),
    ('Calcio', 'mg', 1000),
    ('Hierro', 'mg', 18),
    ('Vitamina C', 'mg', 90),
    ('Vitamina D', 'IU', 600),
    ('Colesterol', 'mg', 300),
    ('Folato', 'mcg', 400),
    ('Magnesio', 'mg', 420);
`);

export default db;
