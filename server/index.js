import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve built client
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

// ============ PRODUCTS API ============

app.post('/api/products', (req, res) => {
  const db = getDb();
  const {
    name, brand, serving_size, serving_size_grams,
    calories, total_fat, saturated_fat, trans_fat,
    cholesterol, sodium, total_carbs, dietary_fiber,
    total_sugars, added_sugars, protein, other_nutrients, image_path
  } = req.body;

  const stmt = db.prepare(`
    INSERT INTO products (
      name, brand, serving_size, serving_size_grams,
      calories, total_fat, saturated_fat, trans_fat,
      cholesterol, sodium, total_carbs, dietary_fiber,
      total_sugars, added_sugars, protein, other_nutrients, image_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    name, brand, serving_size, serving_size_grams || 100,
    calories || 0, total_fat || 0, saturated_fat || 0, trans_fat || 0,
    cholesterol || 0, sodium || 0, total_carbs || 0, dietary_fiber || 0,
    total_sugars || 0, added_sugars || 0, protein || 0,
    JSON.stringify(other_nutrients || {}), image_path || null
  );

  res.json({ id: result.lastInsertRowid });
});

app.get('/api/products', (req, res) => {
  const db = getDb();
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  products.forEach(p => {
    if (p.other_nutrients) {
      p.other_nutrients = JSON.parse(p.other_nutrients);
    }
  });
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.other_nutrients) {
    product.other_nutrients = JSON.parse(product.other_nutrients);
  }
  res.json(product);
});

app.delete('/api/products/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ MEALS API ============

app.post('/api/meals', (req, res) => {
  const db = getDb();
  const { name, date, type, items } = req.body;

  const stmt = db.prepare('INSERT INTO meals (name, date, type) VALUES (?, ?, ?)');
  const result = stmt.run(name || 'Sin nombre', date || new Date().toISOString().split('T')[0], type || 'meal');

  if (items && items.length > 0) {
    const itemStmt = db.prepare(`
      INSERT INTO meal_items (
        meal_id, product_id, product_name, grams,
        calories, total_fat, saturated_fat, sodium,
        total_carbs, protein, other_nutrients
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      itemStmt.run(
        result.lastInsertRowid,
        item.product_id || null,
        item.product_name || '',
        item.grams || 0,
        item.calories || 0,
        item.total_fat || 0,
        item.saturated_fat || 0,
        item.sodium || 0,
        item.total_carbs || 0,
        item.protein || 0,
        JSON.stringify(item.other_nutrients || {})
      );
    }
  }

  res.json({ id: result.lastInsertRowid });
});

app.get('/api/meals', (req, res) => {
  const db = getDb();
  const { date } = req.query;
  let meals;
  if (date) {
    meals = db.prepare('SELECT * FROM meals WHERE date = ? ORDER BY created_at DESC').all(date);
  } else {
    meals = db.prepare('SELECT * FROM meals ORDER BY date DESC, created_at DESC').all();
  }

  const mealsWithItems = meals.map(meal => {
    const items = db.prepare('SELECT * FROM meal_items WHERE meal_id = ?').all(meal.id);
    items.forEach(item => {
      if (item.other_nutrients) {
        item.other_nutrients = JSON.parse(item.other_nutrients);
      }
    });
    return { ...meal, items };
  });

  res.json(mealsWithItems);
});

app.get('/api/meals/:id', (req, res) => {
  const db = getDb();
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id);
  if (!meal) return res.status(404).json({ error: 'Meal not found' });
  const items = db.prepare('SELECT * FROM meal_items WHERE meal_id = ?').all(meal.id);
  items.forEach(item => {
    if (item.other_nutrients) item.other_nutrients = JSON.parse(item.other_nutrients);
  });
  res.json({ ...meal, items });
});

app.delete('/api/meals/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM meal_items WHERE meal_id = ?').run(req.params.id);
  db.prepare('DELETE FROM meals WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ CUSTOM NUTRIENTS API ============

app.get('/api/nutrients', (req, res) => {
  const db = getDb();
  const nutrients = db.prepare('SELECT * FROM custom_nutrients ORDER BY name').all();
  res.json(nutrients);
});

app.post('/api/nutrients', (req, res) => {
  const db = getDb();
  const { name, unit, daily_target } = req.body;
  try {
    db.prepare('INSERT INTO custom_nutrients (name, unit, daily_target) VALUES (?, ?, ?)').run(name, unit, daily_target || 0);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      res.status(409).json({ error: 'Nutrient already exists' });
    } else {
      throw e;
    }
  }
});

app.delete('/api/nutrients/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM custom_nutrients WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ OCR API ============

app.post('/api/ocr', (req, res) => {
  // OCR is done client-side with Tesseract.js
  // This endpoint is reserved for future AI enhancement
  res.json({ message: 'Use Tesseract.js client-side for OCR' });
});

// ============ SUMMARY API ============

app.get('/api/summary', (req, res) => {
  const db = getDb();
  const { date } = req.query;
  
  let dateFilter = '';
  let params = [];
  if (date) {
    dateFilter = 'WHERE m.date = ?';
    params = [date];
  }

  const totals = db.prepare(`
    SELECT 
      SUM(mi.calories) as calories,
      SUM(mi.total_fat) as total_fat,
      SUM(mi.saturated_fat) as saturated_fat,
      SUM(mi.sodium) as sodium,
      SUM(mi.total_carbs) as total_carbs,
      SUM(mi.protein) as protein
    FROM meal_items mi
    JOIN meals m ON mi.meal_id = m.id
    ${dateFilter}
  `).get(...params);

  const mealCount = db.prepare(`
    SELECT COUNT(*) as count FROM meals ${dateFilter}
  `).get(...params);

  res.json({
    totals: totals || { calories: 0, total_fat: 0, saturated_fat: 0, sodium: 0, total_carbs: 0, protein: 0 },
    mealCount: mealCount?.count || 0
  });
});

// Catch-all: serve index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`NutriScan server running on http://localhost:${PORT}`);
});
