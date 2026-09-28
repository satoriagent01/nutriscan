import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API: Save product from OCR
app.post('/api/products', (req, res) => {
  const db = getDb();
  const { name, servingSize, servingSizeGrams, imageUrl, ocrText, ...nutrients } = req.body;
  
  const stmt = db.prepare(`
    INSERT INTO products (name, servingSize, servingSizeGrams, imageUrl, ocrText,
      calories, totalFat, saturatedFat, transFat, cholesterol, sodium,
      totalCarbs, dietaryFiber, sugars, protein, otherNutrients)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const otherNutrients = JSON.stringify(nutrients);
  const result = stmt.run(
    name, servingSize, servingSizeGrams || null, imageUrl || null, ocrText || null,
    nutrients.calories || null, nutrients.totalFat || null, nutrients.saturatedFat || null,
    nutrients.transFat || null, nutrients.cholesterol || null, nutrients.sodium || null,
    nutrients.totalCarbs || null, nutrients.dietaryFiber || null, nutrients.sugars || null,
    nutrients.protein || null, otherNutrients
  );
  
  res.json({ id: result.lastInsertRowid });
});

// API: Get all products
app.get('/api/products', (req, res) => {
  const db = getDb();
  const products = db.prepare('SELECT * FROM products ORDER BY createdAt DESC').all();
  res.json(products);
});

// API: Get product by ID
app.get('/api/products/:id', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// API: Delete product
app.delete('/api/products/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// API: Create meal
app.post('/api/meals', (req, res) => {
  const db = getDb();
  const { name, date } = req.body;
  const stmt = db.prepare('INSERT INTO meals (name, date) VALUES (?, ?)');
  const result = stmt.run(name, date);
  res.json({ id: result.lastInsertRowid });
});

// API: Add item to meal
app.post('/api/meals/:id/items', (req, res) => {
  const db = getDb();
  const mealId = req.params.id;
  const item = req.body;
  
  const stmt = db.prepare(`
    INSERT INTO mealItems (mealId, productId, productName, grams,
      calories, totalFat, saturatedFat, cholesterol, sodium,
      totalCarbs, dietaryFiber, sugars, protein, otherNutrients)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const otherNutrients = JSON.stringify(item.otherNutrients || {});
  const result = stmt.run(
    mealId, item.productId || null, item.productName || '', item.grams,
    item.calories || null, item.totalFat || null, item.saturatedFat || null,
    item.cholesterol || null, item.sodium || null,
    item.totalCarbs || null, item.dietaryFiber || null, item.sugars || null,
    item.protein || null, otherNutrients
  );
  
  // Update daily totals
  updateDailyTotals(db, item);
  
  res.json({ id: result.lastInsertRowid });
});

// API: Get meal with items
app.get('/api/meals/:id', (req, res) => {
  const db = getDb();
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id);
  if (!meal) return res.status(404).json({ error: 'Meal not found' });
  
  const items = db.prepare('SELECT * FROM mealItems WHERE mealId = ?').all(req.params.id);
  res.json({ ...meal, items });
});

// API: Get all meals
app.get('/api/meals', (req, res) => {
  const db = getDb();
  const meals = db.prepare('SELECT * FROM meals ORDER BY date DESC, createdAt DESC').all();
  res.json(meals);
});

// API: Get daily totals
app.get('/api/daily-totals/:date', (req, res) => {
  const db = getDb();
  const totals = db.prepare('SELECT * FROM dailyTotals WHERE date = ?').get(req.params.date);
  res.json(totals || { date: req.params.date });
});

// API: Get all daily totals
app.get('/api/daily-totals', (req, res) => {
  const db = getDb();
  const totals = db.prepare('SELECT * FROM dailyTotals ORDER BY date DESC').all();
  res.json(totals);
});

// API: Delete meal
app.delete('/api/meals/:id', (req, res) => {
  const db = getDb();
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id);
  if (!meal) return res.status(404).json({ error: 'Meal not found' });
  
  // Remove items from daily totals
  const items = db.prepare('SELECT * FROM mealItems WHERE mealId = ?').all(req.params.id);
  items.forEach(item => {
    removeFromDailyTotals(db, item);
  });
  
  db.prepare('DELETE FROM mealItems WHERE mealId = ?').run(req.params.id);
  db.prepare('DELETE FROM meals WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

function updateDailyTotals(db, item) {
  const date = new Date().toISOString().split('T')[0];
  
  const existing = db.prepare('SELECT * FROM dailyTotals WHERE date = ?').get(date);
  
  if (existing) {
    db.prepare(`
      UPDATE dailyTotals SET
        calories = calories + ?,
        totalFat = totalFat + ?,
        saturatedFat = saturatedFat + ?,
        cholesterol = cholesterol + ?,
        sodium = sodium + ?,
        totalCarbs = totalCarbs + ?,
        dietaryFiber = dietaryFiber + ?,
        sugars = sugars + ?,
        protein = protein + ?
      WHERE date = ?
    `).run(
      item.calories || 0, item.totalFat || 0, item.saturatedFat || 0,
      item.cholesterol || 0, item.sodium || 0,
      item.totalCarbs || 0, item.dietaryFiber || 0, item.sugars || 0,
      item.protein || 0, date
    );
  } else {
    db.prepare(`
      INSERT INTO dailyTotals (date, calories, totalFat, saturatedFat, cholesterol,
        sodium, totalCarbs, dietaryFiber, sugars, protein)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      date, item.calories || 0, item.totalFat || 0, item.saturatedFat || 0,
      item.cholesterol || 0, item.sodium || 0,
      item.totalCarbs || 0, item.dietaryFiber || 0, item.sugars || 0,
      item.protein || 0
    );
  }
}

function removeFromDailyTotals(db, item) {
  const date = new Date().toISOString().split('T')[0];
  
  db.prepare(`
    UPDATE dailyTotals SET
      calories = MAX(0, calories - ?),
      totalFat = MAX(0, totalFat - ?),
      saturatedFat = MAX(0, saturatedFat - ?),
      cholesterol = MAX(0, cholesterol - ?),
      sodium = MAX(0, sodium - ?),
      totalCarbs = MAX(0, totalCarbs - ?),
      dietaryFiber = MAX(0, dietaryFiber - ?),
      sugars = MAX(0, sugars - ?),
      protein = MAX(0, protein - ?)
    WHERE date = ?
  `).run(
    item.calories || 0, item.totalFat || 0, item.saturatedFat || 0,
    item.cholesterol || 0, item.sodium || 0,
    item.totalCarbs || 0, item.dietaryFiber || 0, item.sugars || 0,
    item.protein || 0, date
  );
}

// Serve frontend
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`NutriScan server running on http://localhost:${PORT}`);
});
