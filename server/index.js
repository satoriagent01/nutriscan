const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb, closeDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ============ PRODUCTS ============

// Get all products
app.get('/api/products', (req, res) => {
  const db = getDb();
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json(products);
});

// Get single product
app.get('/api/products/:id', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// Create product from OCR
app.post('/api/products', (req, res) => {
  const db = getDb();
  const { name, brand, serving_size, serving_grams, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, sugars, protein } = req.body;
  
  const stmt = db.prepare(`
    INSERT INTO products (name, brand, serving_size, serving_grams, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, sugars, protein)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    name || 'Unknown', brand || '', serving_size || '', serving_grams || 0,
    calories || 0, total_fat || 0, saturated_fat || 0, trans_fat || 0,
    cholesterol || 0, sodium || 0, total_carbs || 0, dietary_fiber || 0,
    sugars || 0, protein || 0
  );
  
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(product);
});

// Delete product
app.delete('/api/products/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ MEALS ============

// Get all meals
app.get('/api/meals', (req, res) => {
  const db = getDb();
  const meals = db.prepare(`
    SELECT m.*, 
      COUNT(mi.id) as item_count,
      ROUND(SUM(mi.calories), 1) as total_calories,
      ROUND(SUM(mi.total_fat), 1) as total_fat,
      ROUND(SUM(mi.saturated_fat), 1) as total_sat_fat,
      ROUND(SUM(mi.sodium), 1) as total_sodium,
      ROUND(SUM(mi.total_carbs), 1) as total_carbs,
      ROUND(SUM(mi.dietary_fiber), 1) as total_fiber,
      ROUND(SUM(mi.sugars), 1) as total_sugars,
      ROUND(SUM(mi.protein), 1) as total_protein
    FROM meals m
    LEFT JOIN meal_items mi ON m.id = mi.meal_id
    GROUP BY m.id
    ORDER BY m.date DESC, m.created_at DESC
  `).all();
  res.json(meals);
});

// Get single meal with items
app.get('/api/meals/:id', (req, res) => {
  const db = getDb();
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id);
  if (!meal) return res.status(404).json({ error: 'Meal not found' });
  
  const items = db.prepare(`
    SELECT mi.*, p.name as product_name, p.brand
    FROM meal_items mi
    LEFT JOIN products p ON mi.product_id = p.id
    WHERE mi.meal_id = ?
  `).all(req.params.id);
  
  res.json({ ...meal, items });
});

// Create meal
app.post('/api/meals', (req, res) => {
  const db = getDb();
  const { name, date, type } = req.body;
  
  const stmt = db.prepare('INSERT INTO meals (name, date, type) VALUES (?, ?, ?)');
  const result = stmt.run(name || 'Untitled', date || new Date().toISOString().split('T')[0], type || 'meal');
  
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(meal);
});

// Add item to meal
app.post('/api/meals/:id/items', (req, res) => {
  const db = getDb();
  const { product_id, product_name, grams, calories, total_fat, saturated_fat, sodium, total_carbs, dietary_fiber, sugars, protein } = req.body;
  
  // Check meal exists
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id);
  if (!meal) return res.status(404).json({ error: 'Meal not found' });
  
  const stmt = db.prepare(`
    INSERT INTO meal_items (meal_id, product_id, product_name, grams, calories, total_fat, saturated_fat, sodium, total_carbs, dietary_fiber, sugars, protein)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    req.params.id, product_id || null, product_name || 'Custom', grams,
    calories || 0, total_fat || 0, saturated_fat || 0, sodium || 0,
    total_carbs || 0, dietary_fiber || 0, sugars || 0, protein || 0
  );
  
  const item = db.prepare('SELECT * FROM meal_items WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(item);
});

// Delete meal item
app.delete('/api/meals/:mealId/items/:itemId', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM meal_items WHERE id = ? AND meal_id = ?').run(req.params.itemId, req.params.mealId);
  res.json({ success: true });
});

// Delete meal
app.delete('/api/meals/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM meals WHERE id = ?').run(req.params.id);
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
  const { name, unit, daily_target } = req.body;
  
  try {
    const stmt = db.prepare('INSERT INTO custom_nutrients (name, unit, daily_target) VALUES (?, ?, ?)');
    const result = stmt.run(name, unit || 'mg', daily_target || null);
    const nutrient = db.prepare('SELECT * FROM custom_nutrients WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(nutrient);
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Nutrient already exists' });
    }
    throw e;
  }
});

app.delete('/api/custom-nutrients/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM custom_nutrients WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ OCR UPLOAD ============

app.post('/api/ocr/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }
  res.json({
    filename: req.file.filename,
    path: `/uploads/${req.file.filename}`,
    message: 'Image uploaded. Use the /api/ocr/parse endpoint with the filename.'
  });
});

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// ============ HEALTH ============
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`NutriScan server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  closeDb();
  server.close();
  process.exit(0);
});

module.exports = { app, server };
