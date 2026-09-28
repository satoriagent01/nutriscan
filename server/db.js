const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'nutriscan.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
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
      total_fat REAL,
      saturated_fat REAL,
      trans_fat REAL,
      cholesterol REAL,
      sodium REAL,
      total_carbs REAL,
      dietary_fiber REAL,
      sugars REAL,
      protein REAL,
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
      unit TEXT DEFAULT 'mg',
      daily_target REAL,
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
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };
