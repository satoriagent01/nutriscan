import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files from client build
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

// ============ PRODUCTS ============

app.get('/api/products', (req, res) => {
  const db = getDb();
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(product);
});

app.post('/api/products', (req, res) => {
  const db = getDb();
  const {
    name, brand, serving_size, serving_grams,
    calories, total_fat, saturated_fat, trans_fat,
    cholesterol, sodium, total_carbs, dietary_fiber,
    sugars, protein, image_path, raw_ocr
  } = req.body;

  const stmt = db.prepare(`
    INSERT INTO products (name, brand, serving_size, serving_grams,
      calories, total_fat, saturated_fat, trans_fat,
      cholesterol, sodium, total_carbs, dietary_fiber,
      sugars, protein, image_path, raw_ocr)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    name || '', brand || '', serving_size || '', serving_grams || 0,
    calories || 0, total_fat || 0, saturated_fat || 0, trans_fat || 0,
    cholesterol || 0, sodium || 0, total_carbs || 0, dietary_fiber || 0,
    sugars || 0, protein || 0, image_path || '', raw_ocr || ''
  );
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(product);
});

app.put('/api/products/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const updates = req.body;
  const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'created_at');
  if (fields.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });

  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updates[f]);
  values.push(id);

  db.prepare(`UPDATE products SET ${setClause} WHERE id = ?`).run(...values);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  res.json(product);
});

app.delete('/api/products/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ CUSTOM NUTRIENTS ============

app.get('/api/custom-nutrients', (req, res) => {
  const db = getDb();
  const nutrients = db.prepare('SELECT * FROM custom_nutrients ORDER BY name').all();
  res.json(nutrients);
});

app.post('/api/custom-nutrients', (req, res) => {
  const db = getDb();
  const { name, unit } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const result = db.prepare('INSERT INTO custom_nutrients (name, unit) VALUES (?, ?)').run(name, unit || 'mg');
  const nutrient = db.prepare('SELECT * FROM custom_nutrients WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(nutrient);
});

app.delete('/api/custom-nutrients/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM custom_nutrients WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM custom_nutrient_values WHERE custom_nutrient_id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ MEALS ============

app.get('/api/meals', (req, res) => {
  const db = getDb();
  const meals = db.prepare(`
    SELECT m.*, 
      COUNT(mi.id) as item_count,
      COALESCE(SUM(p.calories * mi.grams / p.serving_grams), 0) as total_calories,
      COALESCE(SUM(p.total_fat * mi.grams / p.serving_grams), 0) as total_fat,
      COALESCE(SUM(p.sodium * mi.grams / p.serving_grams), 0) as total_sodium,
      COALESCE(SUM(p.protein * mi.grams / p.serving_grams), 0) as total_protein,
      COALESCE(SUM(p.total_carbs * mi.grams / p.serving_grams), 0) as total_carbs
    FROM meals m
    LEFT JOIN meal_items mi ON mi.meal_id = m.id
    LEFT JOIN products p ON p.id = mi.product_id
    GROUP BY m.id
    ORDER BY m.date DESC, m.created_at DESC
  `).all();
  res.json(meals);
});

app.get('/api/meals/:id', (req, res) => {
  const db = getDb();
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id);
  if (!meal) return res.status(404).json({ error: 'Comida no encontrada' });
  const items = db.prepare(`
    SELECT mi.*, p.name as product_name, p.serving_grams, p.calories, p.total_fat, p.sodium, p.protein, p.total_carbs
    FROM meal_items mi
    LEFT JOIN products p ON p.id = mi.product_id
    WHERE mi.meal_id = ?
  `).all(req.params.id);
  res.json({ ...meal, items });
});

app.post('/api/meals', (req, res) => {
  const db = getDb();
  const { name, date, items } = req.body;
  if (!name || !date) return res.status(400).json({ error: 'Nombre y fecha requeridos' });

  const result = db.prepare('INSERT INTO meals (name, date) VALUES (?, ?)').run(name, date);
  const mealId = result.lastInsertRowid;

  if (items && items.length > 0) {
    const insertItem = db.prepare('INSERT INTO meal_items (meal_id, product_id, grams) VALUES (?, ?, ?)');
    const insertMany = db.transaction((items) => {
      for (const item of items) {
        insertItem.run(item.meal_id, item.product_id || null, item.grams);
      }
    });
    insertMany(items);
  }

  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(mealId);
  res.status(201).json(meal);
});

app.put('/api/meals/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { name, date, items } = req.body;

  if (name) db.prepare('UPDATE meals SET name = ? WHERE id = ?').run(name, id);
  if (date) db.prepare('UPDATE meals SET date = ? WHERE id = ?').run(date, id);

  if (items !== undefined) {
    db.prepare('DELETE FROM meal_items WHERE meal_id = ?').run(id);
    if (items.length > 0) {
      const insertItem = db.prepare('INSERT INTO meal_items (meal_id, product_id, grams) VALUES (?, ?, ?)');
      for (const item of items) {
        insertItem.run(id, item.product_id || null, item.grams);
      }
    }
  }

  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(id);
  res.json(meal);
});

app.delete('/api/meals/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM meal_items WHERE meal_id = ?').run(req.params.id);
  db.prepare('DELETE FROM meals WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ DAILY TOTALS ============

app.get('/api/daily-totals', (req, res) => {
  const db = getDb();
  const { date } = req.query;
  if (date) {
    const total = db.prepare('SELECT * FROM daily_totals WHERE date = ?').get(date);
    res.json(total || { date, calories: 0, total_fat: 0, saturated_fat: 0, cholesterol: 0, sodium: 0, total_carbs: 0, dietary_fiber: 0, sugars: 0, protein: 0 });
  } else {
    const totals = db.prepare('SELECT * FROM daily_totals ORDER BY date DESC').all();
    res.json(totals);
  }
});

app.post('/api/daily-totals', (req, res) => {
  const db = getDb();
  const { date, ...values } = req.body;
  if (!date) return res.status(400).json({ error: 'Fecha requerida' });

  const stmt = db.prepare(`
    INSERT INTO daily_totals (date, calories, total_fat, saturated_fat, cholesterol, sodium, total_carbs, dietary_fiber, sugars, protein)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      calories = excluded.calories,
      total_fat = excluded.total_fat,
      saturated_fat = excluded.saturated_fat,
      cholesterol = excluded.cholesterol,
      sodium = excluded.sodium,
      total_carbs = excluded.total_carbs,
      dietary_fiber = excluded.dietary_fiber,
      sugars = excluded.sugars,
      protein = excluded.protein
  `);
  stmt.run(
    date,
    values.calories || 0, values.total_fat || 0, values.saturated_fat || 0,
    values.cholesterol || 0, values.sodium || 0, values.total_carbs || 0,
    values.dietary_fiber || 0, values.sugars || 0, values.protein || 0
  );
  const total = db.prepare('SELECT * FROM daily_totals WHERE date = ?').get(date);
  res.json(total);
});

// ============ OCR ENDPOINT ============

app.post('/api/ocr', (req, res) => {
  // OCR se hace en el frontend con Tesseract.js
  // Este endpoint es para futuras integraciones con APIs de OCR
  res.json({ message: 'OCR se realiza en el cliente con Tesseract.js' });
});

// ============ HEALTH CHECK ============

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🍎 NutriScan server running on http://localhost:${PORT}`);
});
