import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ─── Products ──────────────────────────────────────────────

app.get('/api/products', (req, res) => {
  const stmt = db.prepare('SELECT * FROM products ORDER BY created_at DESC');
  const products = stmt.all();
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const stmt = db.prepare('SELECT * FROM products WHERE id = ?');
  const product = stmt.get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(product);
});

app.post('/api/products', (req, res) => {
  const { name, brand, serving_size, serving_grams, calories, protein, fat, saturated_fat, carbs, sugars, fiber, sodium, other_nutrients, image_url } = req.body;
  const stmt = db.prepare(
    'INSERT INTO products (name, brand, serving_size, serving_grams, calories, protein, fat, saturated_fat, carbs, sugars, fiber, sodium, other_nutrients, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const info = stmt.run(
    name || '', brand || '', serving_size || '', serving_grams || 0,
    calories || 0, protein || 0, fat || 0, saturated_fat || 0,
    carbs || 0, sugars || 0, fiber || 0, sodium || 0,
    JSON.stringify(other_nutrients || {}), image_url || ''
  );
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(product);
});

app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Meals ─────────────────────────────────────────────────

app.get('/api/meals', (req, res) => {
  const { date, type } = req.query;
  let sql = 'SELECT * FROM meals WHERE 1=1';
  const params = [];
  if (date) { sql += ' AND date = ?'; params.push(date); }
  if (type) { sql += ' AND type = ?'; params.push(type); }
  sql += ' ORDER BY created_at DESC';
  const stmt = db.prepare(sql);
  const meals = stmt.all(...params);
  res.json(meals);
});

app.post('/api/meals', (req, res) => {
  const { name, date, type } = req.body;
  if (!name || !date) return res.status(400).json({ error: 'Nombre y fecha son requeridos' });
  const stmt = db.prepare('INSERT INTO meals (name, date, type) VALUES (?, ?, ?)');
  const info = stmt.run(name, date, type || 'meal');
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(meal);
});

app.delete('/api/meals/:id', (req, res) => {
  db.prepare('DELETE FROM meals WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Meal Items ────────────────────────────────────────────

app.get('/api/meals/:mealId/items', (req, res) => {
  const stmt = db.prepare('SELECT * FROM meal_items WHERE meal_id = ?');
  const items = stmt.all(req.params.mealId);
  res.json(items);
});

app.post('/api/meals/:mealId/items', (req, res) => {
  const { product_id, product_name, grams, calories, protein, fat, saturated_fat, carbs, sugars, fiber, sodium, other_nutrients } = req.body;
  const stmt = db.prepare(
    'INSERT INTO meal_items (meal_id, product_id, product_name, grams, calories, protein, fat, saturated_fat, carbs, sugars, fiber, sodium, other_nutrients) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const info = stmt.run(
    req.params.mealId, product_id || null, product_name || '', grams,
    calories || 0, protein || 0, fat || 0, saturated_fat || 0,
    carbs || 0, sugars || 0, fiber || 0, sodium || 0,
    JSON.stringify(other_nutrients || {})
  );
  const item = db.prepare('SELECT * FROM meal_items WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(item);
});

app.delete('/api/meals/items/:id', (req, res) => {
  db.prepare('DELETE FROM meal_items WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Custom Nutrients ──────────────────────────────────────

app.get('/api/custom-nutrients', (req, res) => {
  const stmt = db.prepare('SELECT * FROM custom_nutrients ORDER BY name');
  const nutrients = stmt.all();
  res.json(nutrients);
});

app.post('/api/custom-nutrients', (req, res) => {
  const { name, unit, daily_target } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    const stmt = db.prepare('INSERT INTO custom_nutrients (name, unit, daily_target) VALUES (?, ?, ?)');
    const info = stmt.run(name, unit || 'g', daily_target || null);
    const nutrient = db.prepare('SELECT * FROM custom_nutrients WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(nutrient);
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ya existe un nutriente con ese nombre' });
    }
    throw e;
  }
});

app.delete('/api/custom-nutrients/:id', (req, res) => {
  db.prepare('DELETE FROM custom_nutrients WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Daily Summary ─────────────────────────────────────────

app.get('/api/summary', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Fecha requerida' });

  const stmt = db.prepare(`
    SELECT
      COALESCE(SUM(calories), 0) as total_calories,
      COALESCE(SUM(protein), 0) as total_protein,
      COALESCE(SUM(fat), 0) as total_fat,
      COALESCE(SUM(saturated_fat), 0) as total_saturated_fat,
      COALESCE(SUM(carbs), 0) as total_carbs,
      COALESCE(SUM(sugars), 0) as total_sugars,
      COALESCE(SUM(fiber), 0) as total_fiber,
      COALESCE(SUM(sodium), 0) as total_sodium
    FROM meal_items mi
    JOIN meals m ON mi.meal_id = m.id
    WHERE m.date = ?
  `);
  const totals = stmt.get(date);

  // Get custom nutrient totals
  const customNutrients = db.prepare('SELECT * FROM custom_nutrients').all();
  const customTotals = {};
  for (const cn of customNutrients) {
    const cstmt = db.prepare(`
      SELECT COALESCE(SUM(value), 0) as total
      FROM meal_item_custom_nutrients micn
      JOIN meal_items mi ON micn.meal_item_id = mi.id
      JOIN meals m ON mi.meal_id = m.id
      WHERE micn.custom_nutrient_id = ? AND m.date = ?
    `);
    const ctotal = cstmt.get(cn.id, date);
    customTotals[cn.name] = { total: ctotal.total, unit: cn.unit, daily_target: cn.daily_target };
  }

  res.json({ ...totals, custom: customTotals });
});

// ─── OCR Endpoint (proxy for Tesseract.js worker) ──────────
// The actual OCR happens client-side with Tesseract.js
// This endpoint is reserved for future AI enhancements

// ─── Serve frontend ────────────────────────────────────────

const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🍽️ NutriScan server running on http://localhost:${PORT}`);
});
