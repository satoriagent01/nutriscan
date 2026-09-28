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
      name TEXT NOT NULL,
      servingSize TEXT,
      servingSizeGrams REAL,
      calories REAL,
      totalFat REAL,
      saturatedFat REAL,
      transFat REAL,
      cholesterol REAL,
      sodium REAL,
      totalCarbs REAL,
      dietaryFiber REAL,
      sugars REAL,
      protein REAL,
      otherNutrients TEXT DEFAULT '{}',
      ocrText TEXT,
      imageUrl TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mealItems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mealId INTEGER NOT NULL,
      productId INTEGER,
      productName TEXT,
      grams REAL NOT NULL,
      calories REAL,
      totalFat REAL,
      saturatedFat REAL,
      cholesterol REAL,
      sodium REAL,
      totalCarbs REAL,
      dietaryFiber REAL,
      sugars REAL,
      protein REAL,
      otherNutrients TEXT DEFAULT '{}',
      FOREIGN KEY (mealId) REFERENCES meals(id),
      FOREIGN KEY (productId) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS dailyTotals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      calories REAL DEFAULT 0,
      totalFat REAL DEFAULT 0,
      saturatedFat REAL DEFAULT 0,
      cholesterol REAL DEFAULT 0,
      sodium REAL DEFAULT 0,
      totalCarbs REAL DEFAULT 0,
      dietaryFiber REAL DEFAULT 0,
      sugars REAL DEFAULT 0,
      protein REAL DEFAULT 0,
      otherNutrients TEXT DEFAULT '{}'
    );
  `);
}
