import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from './db.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `ocr-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ==================== OCR ENDPOINT ====================
app.post('/api/ocr', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Return the image path for client-side OCR
    res.json({
      imagePath: `/uploads/${req.file.filename}`,
      message: 'Image uploaded. Use Tesseract.js client-side for OCR.'
    });
  } catch (err) {
    console.error('OCR upload error:', err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// ==================== PRODUCTS ====================
app.get('/api/products', (req, res) => {
  const products = db.prepare(
    'SELECT * FROM products ORDER BY created_at DESC'
  ).all();
  res.json(products);
});

app.post('/api/products', (req, res) => {
  const { name, brand, serving_size, serving_grams, ...nutrients } = req.body;
  const stmt = db.prepare(`
    INSERT INTO products 
    (name, brand, serving_size, serving_grams, calories, total_fat, saturated_fat, trans_fat, 
     cholesterol, sodium, total_carbs, dietary_fiber, sugars, protein, other_nutrients, ocr_raw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    name || 'Sin nombre',
    brand || '',
    serving_size || '',
    serving_grams || 100,
    nutrients.calories || 0,
    nutrients.total_fat || 0,
    nutrients.saturated_fat || 0,
    nutrients.trans_fat || 0,
    nutrients.cholesterol || 0,
    nutrients.sodium || 0,
    nutrients.total_carbs || 0,
    nutrients.dietary_fiber || 0,
    nutrients.sugars || 0,
    nutrients.protein || 0,
    JSON.stringify(nutrients.other_nutrients || {}),
    req.body.ocr_raw || ''
  );
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  res.json(product);
});

app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==================== MEALS ====================
app.get('/api/meals', (req, res) => {
  const { date } = req.query;
  let meals;
  if (date) {
    meals = db.prepare(
      'SELECT * FROM meals WHERE date = ? ORDER BY created_at DESC'
    ).all(date);
  } else {
    meals = db.prepare(
      'SELECT * FROM meals ORDER BY date DESC, created_at DESC LIMIT 30'
    ).all();
  }
  res.json(meals);
});

app.post('/api/meals', (req, res) => {
  const { name, date, type } = req.body;
  const stmt = db.prepare(
    'INSERT INTO meals (name, date, type) VALUES (?, ?, ?)'
  );
  const result = stmt.run(name || 'Comida', date || new Date().toISOString().split('T')[0], type || 'meal');
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(result.lastInsertRowid);
  res.json(meal);
});

app.delete('/api/meals/:id', (req, res) => {
  db.prepare('DELETE FROM meals WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==================== MEAL ITEMS ====================
app.post('/api/meals/:mealId/items', (req, res) => {
  const { mealId } = req.params;
  const { product_id, product_name, grams, ...nutrients } = req.body;
  const stmt = db.prepare(`
    INSERT INTO meal_items 
    (meal_id, product_id, product_name, grams, calories, total_fat, saturated_fat, 
     sodium, total_carbs, dietary_fiber, sugars, protein)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    mealId, product_id || null, product_name || '', grams,
    nutrients.calories || 0, nutrients.total_fat || 0, nutrients.saturated_fat || 0,
    nutrients.sodium || 0, nutrients.total_carbs || 0, nutrients.dietary_fiber || 0,
    nutrients.sugars || 0, nutrients.protein || 0
  );
  const item = db.prepare('SELECT * FROM meal_items WHERE id = ?').get(result.lastInsertRowid);
  res.json(item);
});

app.delete('/api/meals/items/:id', (req, res) => {
  db.prepare('DELETE FROM meal_items WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==================== DAILY SUMMARY ====================
app.get('/api/summary/:date', (req, res) => {
  const { date } = req.params;
  const summary = db.prepare(`
    SELECT 
      COALESCE(SUM(calories), 0) as total_calories,
      COALESCE(SUM(total_fat), 0) as total_fat,
      COALESCE(SUM(saturated_fat), 0) as total_saturated_fat,
      COALESCE(SUM(sodium), 0) as total_sodium,
      COALESCE(SUM(total_carbs), 0) as total_carbs,
      COALESCE(SUM(dietary_fiber), 0) as total_fiber,
      COALESCE(SUM(sugars), 0) as total_sugars,
      COALESCE(SUM(protein), 0) as total_protein,
      COUNT(DISTINCT mi.id) as total_items,
      COUNT(DISTINCT m.id) as total_meals
    FROM meal_items mi
    JOIN meals m ON mi.meal_id = m.id
    WHERE m.date = ?
  `).get(date);
  res.json(summary);
});

// ==================== CUSTOM NUTRIENTS ====================
app.get('/api/custom-nutrients', (req, res) => {
  const nutrients = db.prepare('SELECT * FROM custom_nutrients ORDER BY name').all();
  res.json(nutrients);
});

app.post('/api/custom-nutrients', (req, res) => {
  const { name, unit, daily_goal } = req.body;
  try {
    const result = db.prepare('INSERT INTO custom_nutrients (name, unit, daily_goal) VALUES (?, ?, ?)').run(name, unit || 'g', daily_goal || 0);
    const nutrient = db.prepare('SELECT * FROM custom_nutrients WHERE id = ?').get(result.lastInsertRowid);
    res.json(nutrient);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Nutrient already exists' });
    }
    throw err;
  }
});

app.delete('/api/custom-nutrients/:id', (req, res) => {
  db.prepare('DELETE FROM custom_nutrients WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==================== UPLOADS (static) ====================
app.use('/uploads', express.static(uploadsDir));

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== START ====================
app.listen(PORT, () => {
  console.log(`NutriScan server running on http://localhost:${PORT}`);
});

export default app;
