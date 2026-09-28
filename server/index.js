import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    cb(null, `ocr-${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// Ensure uploads directory exists
import fs from 'fs';
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ============ OCR ENDPOINT ============
app.post('/api/ocr', upload.single('image'), async (req, res) => {
  try {
    // The OCR will be done client-side with Tesseract.js
    // This endpoint is for future server-side OCR if needed
    res.json({ message: 'Use client-side OCR with Tesseract.js' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ PRODUCTS API ============
app.get('/api/products', (req, res) => {
  const db = getDb();
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json(products);
});

app.post('/api/products', (req, res) => {
  const db = getDb();
  const { name, brand, serving_size, serving_grams, calories, protein, carbs, fat, saturated_fat, fiber, sugar, sodium, custom_nutrients, ocr_text } = req.body;
  
  const stmt = db.prepare(`
    INSERT INTO products (name, brand, serving_size, serving_grams, calories, protein, carbs, fat, saturated_fat, fiber, sugar, sodium, custom_nutrients, ocr_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    name || 'Producto escaneado',
    brand || '',
    serving_size || '',
    serving_grams || 100,
    calories || 0,
    protein || 0,
    carbs || 0,
    fat || 0,
    saturated_fat || 0,
    fiber || 0,
    sugar || 0,
    sodium || 0,
    JSON.stringify(custom_nutrients || {}),
    ocr_text || ''
  );
  
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  res.json(product);
});

app.delete('/api/products/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.put('/api/products/:id', (req, res) => {
  const db = getDb();
  const { name, brand, serving_size, serving_grams, calories, protein, carbs, fat, saturated_fat, fiber, sugar, sodium, custom_nutrients } = req.body;
  
  db.prepare(`
    UPDATE products SET name=?, brand=?, serving_size=?, serving_grams=?, calories=?, protein=?, carbs=?, fat=?, saturated_fat=?, fiber=?, sugar=?, sodium=?, custom_nutrients=?
    WHERE id=?
  `).run(
    name, brand, serving_size, serving_grams, calories, protein, carbs, fat, saturated_fat, fiber, sugar, sodium,
    JSON.stringify(custom_nutrients || {}),
    req.params.id
  );
  
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(product);
});

// ============ MEALS API ============
app.get('/api/meals', (req, res) => {
  const db = getDb();
  const meals = db.prepare(`
    SELECT m.*, 
      (SELECT SUM(mi.calories) FROM meal_items mi WHERE mi.meal_id = m.id) as total_calories,
      (SELECT SUM(mi.protein) FROM meal_items mi WHERE mi.meal_id = m.id) as total_protein,
      (SELECT SUM(mi.carbs) FROM meal_items mi WHERE mi.meal_id = m.id) as total_carbs,
      (SELECT SUM(mi.fat) FROM meal_items mi WHERE mi.meal_id = m.id) as total_fat
    FROM meals m ORDER BY m.date DESC, m.created_at DESC
  `).all();
  res.json(meals);
});

app.post('/api/meals', (req, res) => {
  const db = getDb();
  const { name, date, type } = req.body;
  
  const stmt = db.prepare('INSERT INTO meals (name, date, type) VALUES (?, ?, ?)');
  const result = stmt.run(name || 'Comida', date || new Date().toISOString().split('T')[0], type || 'meal');
  
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(result.lastInsertRowid);
  res.json(meal);
});

app.delete('/api/meals/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM meal_items WHERE meal_id = ?').run(req.params.id);
  db.prepare('DELETE FROM meals WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ MEAL ITEMS API ============
app.post('/api/meals/:mealId/items', (req, res) => {
  const db = getDb();
  const { product_id, product_name, grams, calories, protein, carbs, fat, saturated_fat, fiber, sugar, sodium, custom_nutrients } = req.body;
  
  const stmt = db.prepare(`
    INSERT INTO meal_items (meal_id, product_id, product_name, grams, calories, protein, carbs, fat, saturated_fat, fiber, sugar, sodium, custom_nutrients)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    req.params.mealId, product_id || null, product_name || '', grams,
    calories || 0, protein || 0, carbs || 0, fat || 0, saturated_fat || 0,
    fiber || 0, sugar || 0, sodium || 0,
    JSON.stringify(custom_nutrients || {})
  );
  
  const item = db.prepare('SELECT * FROM meal_items WHERE id = ?').get(result.lastInsertRowid);
  res.json(item);
});

app.delete('/api/meals/:mealId/items/:itemId', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM meal_items WHERE id = ? AND meal_id = ?').run(req.params.itemId, req.params.mealId);
  res.json({ success: true });
});

// ============ DAILY SUMMARY API ============
app.get('/api/summary/:date', (req, res) => {
  const db = getDb();
  const date = req.params.date;
  
  const summary = db.prepare(`
    SELECT 
      COUNT(DISTINCT m.id) as meal_count,
      SUM(mi.calories) as total_calories,
      SUM(mi.protein) as total_protein,
      SUM(mi.carbs) as total_carbs,
      SUM(mi.fat) as total_fat,
      SUM(mi.saturated_fat) as total_saturated_fat,
      SUM(mi.fiber) as total_fiber,
      SUM(mi.sugar) as total_sugar,
      SUM(mi.sodium) as total_sodium
    FROM meal_items mi
    JOIN meals m ON mi.meal_id = m.id
    WHERE m.date = ?
  `).get(date);
  
  res.json(summary || {});
});

// ============ CUSTOM NUTRIENTS API ============
app.get('/api/custom-nutrients', (req, res) => {
  const db = getDb();
  const nutrients = db.prepare('SELECT * FROM custom_nutrients ORDER BY name').all();
  res.json(nutrients);
});

app.post('/api/custom-nutrients', (req, res) => {
  const db = getDb();
  const { name, unit, daily_goal } = req.body;
  
  const stmt = db.prepare('INSERT INTO custom_nutrients (name, unit, daily_goal) VALUES (?, ?, ?)');
  const result = stmt.run(name, unit || 'g', daily_goal || null);
  
  const nutrient = db.prepare('SELECT * FROM custom_nutrients WHERE id = ?').get(result.lastInsertRowid);
  res.json(nutrient);
});

app.delete('/api/custom-nutrients/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM custom_nutrients WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ OCR TEXT PARSING API ============
app.post('/api/ocr/parse', (req, res) => {
  const { text } = req.body;
  if (!text) return res.json({ parsed: {} });
  
  const parsed = parseNutritionText(text);
  res.json({ parsed });
});

// ============ HEALTHY ROUTING ============
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`NutriScan server running on http://localhost:${PORT}`);
});

// ============ OCR PARSING FUNCTIONS ============
function parseNutritionText(text) {
  const result = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    saturated_fat: 0,
    fiber: 0,
    sugar: 0,
    sodium: 0,
    serving_size: '',
    serving_grams: 100,
    name: '',
    brand: ''
  };
  
  const lowerText = text.toLowerCase();
  
  // Extract serving size
  const servingMatch = text.match(/porci[oó]n\s*(?:de)?\s*([\d,]+)\s*(g|ml|unidades|unidad|porci[oó]n)/i);
  if (servingMatch) {
    result.serving_size = servingMatch[0];
    const grams = parseFloat(servingMatch[1].replace(',', '.'));
    if (grams > 0) result.serving_grams = grams;
  }
  
  // Extract product name (first line or after "producto")
  const nameMatch = text.match(/(?:producto|nombre|marca)[:\s]+(.+?)(?:\n|$)/i);
  if (nameMatch) result.name = nameMatch[1].trim();
  
  // Extract brand
  const brandMatch = text.match(/(?:marca)[:\s]+(.+?)(?:\n|$)/i);
  if (brandMatch) result.brand = brandMatch[1].trim();
  
  // Parse nutritional values - Spanish label patterns
  const patterns = [
    { key: 'calories', regex: /(?:energ[aí]a|calor[aí]as?)\s*[\-:]\s*([\d,]+\.?[\d]*)/i },
    { key: 'protein', regex: /(?:pr[oó]te[aí]nas?|prote[aí]na)\s*[\-:]\s*([\d,]+\.?[\d]*)/i },
    { key: 'carbs', regex: /(?:carbohidratos?|hidratos? de carbono)\s*[\-:]\s*([\d,]+\.?[\d]*)/i },
    { key: 'fat', regex: /(?:grasas?\s*(?:total(?:es)?)?|lip[aí]s?)\s*[\-:]\s*([\d,]+\.?[\d]*)/i },
    { key: 'saturated_fat', regex: /(?:grasas?\s*saturadas?|grasas? satur[aá]s?)\s*[\-:]\s*([\d,]+\.?[\d]*)/i },
    { key: 'fiber', regex: /(?:fibra)\s*[\-:]\s*([\d,]+\.?[\d]*)/i },
    { key: 'sugar', regex: /(?:az[úu]cares?|sacarosa|glucosa)\s*[\-:]\s*([\d,]+\.?[\d]*)/i },
    { key: 'sodium', regex: /(?:sodio|sal)\s*[\-:]\s*([\d,]+\.?[\d]*)/i }
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match) {
      const value = parseFloat(match[1].replace(',', '.'));
      if (!isNaN(value)) {
        result[pattern.key] = value;
      }
    }
  }
  
  return result;
}
