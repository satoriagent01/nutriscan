import express from 'express';
import cors from 'cors';
import db from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

// Serve built frontend
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

// ============ PRODUCTS ============

app.post('/api/products', (req, res) => {
  const { name, brand, serving_size, serving_grams, calories, protein, carbs, fat, saturated_fat, fiber, sugar, sodium, ocr_text, custom_nutrients } = req.body;
  const stmt = db.prepare(`
    INSERT INTO products (name, brand, serving_size, serving_grams, calories, protein, carbs, fat, saturated_fat, fiber, sugar, sodium, ocr_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    name, brand, serving_size, serving_grams || 100,
    calories || 0, protein || 0, carbs || 0, fat || 0,
    saturated_fat || 0, fiber || 0, sugar || 0, sodium || 0,
    ocr_text || ''
  );
  const productId = result.lastInsertRowid;

  // Save custom nutrients
  if (custom_nutrients && custom_nutrients.length > 0) {
    const insertCustom = db.prepare(`
      INSERT INTO product_custom_nutrients (product_id, nutrient_id, value)
      VALUES (?, ?, ?)
    `);
    const getNutrientId = db.prepare('SELECT id FROM custom_nutrients WHERE name = ?');

    for (const { name: nName, value, unit } of custom_nutrients) {
      let nutrient = getNutrientId.get(nName);
      if (!nutrient) {
        db.prepare('INSERT INTO custom_nutrients (name, unit) VALUES (?, ?)').run(nName, unit || 'mg');
        nutrient = getNutrientId.get(nName);
      }
      insertCustom.run(productId, nutrient.id, value);
    }
  }

  res.json({ id: productId });
});

app.get('/api/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  const getCustom = db.prepare(`
    SELECT cn.name, cn.unit, pcn.value
    FROM product_custom_nutrients pcn
    JOIN custom_nutrients cn ON pcn.nutrient_id = cn.id
    WHERE pcn.product_id = ?
  `);
  const result = products.map(p => {
    const custom = getCustom.all(p.id);
    return { ...p, custom_nutrients: custom };
  });
  res.json(result);
});

app.get('/api/products/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });
  const custom = db.prepare(`
    SELECT cn.name, cn.unit, pcn.value
    FROM product_custom_nutrients pcn
    JOIN custom_nutrients cn ON pcn.nutrient_id = cn.id
    WHERE pcn.product_id = ?
  `).all(req.params.id);
  res.json({ ...product, custom_nutrients: custom });
});

app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============ MEALS ============

app.post('/api/meals', (req, res) => {
  const { name, date } = req.body;
  const stmt = db.prepare('INSERT INTO meals (name, date) VALUES (?, ?)');
  const result = stmt.run(name, date);
  res.json({ id: result.lastInsertRowid });
});

app.get('/api/meals', (req, res) => {
  const meals = db.prepare(`
    SELECT m.*, 
      COUNT(mi.id) as item_count,
      COALESCE(SUM(
        (SELECT p.calories FROM products p WHERE p.id = mi.product_id) * mi.grams / COALESCE((SELECT p.serving_grams FROM products p WHERE p.id = mi.product_id), 100)
      , 0) as total_calories,
      COALESCE(SUM(
        (SELECT p.protein FROM products p WHERE p.id = mi.product_id) * mi.grams / COALESCE((SELECT p.serving_grams FROM products p WHERE p.id = mi.product_id), 100)
      , 0) as total_protein,
      COALESCE(SUM(
        (SELECT p.carbs FROM products p WHERE p.id = mi.product_id) * mi.grams / COALESCE((SELECT p.serving_grams FROM products p WHERE p.id = mi.product_id), 100)
      , 0) as total_carbs,
      COALESCE(SUM(
        (SELECT p.fat FROM products p WHERE p.id = mi.product_id) * mi.grams / COALESCE((SELECT p.serving_grams FROM products p WHERE p.id = mi.product_id), 100)
      , 0) as total_fat
    FROM meals m
    LEFT JOIN meal_items mi ON mi.meal_id = m.id
    GROUP BY m.id
    ORDER BY m.date DESC, m.created_at DESC
  `).all();
  res.json(meals);
});

app.get('/api/meals/:id', (req, res) => {
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id);
  if (!meal) return res.status(404).json({ error: 'Not found' });
  const items = db.prepare(`
    SELECT mi.*, p.name as product_name, p.serving_grams, p.calories, p.protein, p.carbs, p.fat, p.saturated_fat, p.fiber, p.sugar, p.sodium
    FROM meal_items mi
    JOIN products p ON p.id = mi.product_id
    WHERE mi.meal_id = ?
  `).all(req.params.id);
  res.json({ ...meal, items });
});

app.post('/api/meals/:id/items', (req, res) => {
  const { product_id, grams } = req.body;
  const stmt = db.prepare('INSERT INTO meal_items (meal_id, product_id, grams) VALUES (?, ?, ?)');
  const result = stmt.run(req.params.id, product_id, grams);
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/meals/:id/items/:itemId', (req, res) => {
  db.prepare('DELETE FROM meal_items WHERE id = ? AND meal_id = ?').run(req.params.itemId, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/meals/:id', (req, res) => {
  db.prepare('DELETE FROM meals WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============ CUSTOM NUTRIENTS ============

app.get('/api/nutrients', (req, res) => {
  const nutrients = db.prepare('SELECT * FROM custom_nutrients ORDER BY name').all();
  res.json(nutrients);
});

app.post('/api/nutrients', (req, res) => {
  const { name, unit } = req.body;
  try {
    db.prepare('INSERT INTO custom_nutrients (name, unit) VALUES (?, ?)').run(name, unit || 'mg');
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      res.status(409).json({ error: 'Nutrient already exists' });
    } else {
      throw e;
    }
  }
});

app.delete('/api/nutrients/:id', (req, res) => {
  db.prepare('DELETE FROM custom_nutrients WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============ OCR PARSER ============

app.post('/api/ocr/parse', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided' });

  const parsed = parseNutritionLabel(text);
  res.json(parsed);
});

// ============ HEALTHY FALLBACK ============

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NutriScan server running on http://localhost:${PORT}`);
});

// ============ OCR PARSER HELPERS ============

function parseNutritionLabel(text) {
  const result = {
    name: '',
    brand: '',
    serving_size: '',
    serving_grams: 100,
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    saturated_fat: 0,
    fiber: 0,
    sugar: 0,
    sodium: 0,
  };

  // Extract serving size
  const servingMatch = text.match(/porci[oó]n\s*(?:de\s*)?(\d+[.,]?\d*)\s*(?:g|gramos?)/i);
  if (servingMatch) {
    result.serving_size = servingMatch[0];
    result.serving_grams = parseFloat(servingMatch[1].replace(',', '.'));
  }

  // Extract numeric values with labels
  const patterns = [
    { key: 'calories', regex: /(?:calor[aí]as?|energ[aí]a)\s*[:\-]?\s*(\d+[.,]?\d*)/i },
    { key: 'protein', regex: /(?:pr[oó]te[aí]nas?|prote[í]na)\s*[:\-]?\s*(\d+[.,]?\d*)/i },
    { key: 'carbs', regex: /(?:carbohidratos?|carb[s\u00f3])\s*[:\-]?\s*(\d+[.,]?\d*)/i },
    { key: 'fat', regex: /(?:grasas?\s*(?:total(?:es)?|tot))?\s*[:\-]?\s*(\d+[.,]?\d*)/i },
    { key: 'saturated_fat', regex: /(?:grasa\s*saturada|grasas?\s*saturadas?)\s*[:\-]?\s*(\d+[.,]?\d*)/i },
    { key: 'fiber', regex: /(?:fibra)\s*[:\-]?\s*(\d+[.,]?\d*)/i },
    { key: 'sugar', regex: /(?:az[úu]car(?:es)?|sacarosa|jarabe)\s*[:\-]?\s*(\d+[.,]?\d*)/i },
    { key: 'sodium', regex: /(?:sodio|sal)\s*[:\-]?\s*(\d+[.,]?\d*)/i },
  ];

  for (const { key, regex } of patterns) {
    const match = text.match(regex);
    if (match) {
      result[key] = parseFloat(match[1].replace(',', '.'));
    }
  }

  // Try to extract product name (first line or lines before nutrition table)
  const lines = text.split('\n').filter(l => l.trim().length > 2);
  if (lines.length > 0) {
    // Look for a line that's not a number or unit
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 3 && trimmed.length < 60 && !/^\d/.test(trimmed) && !/\d+\s*(g|mg|kcal|kj)/i.test(trimmed)) {
        result.name = trimmed;
        break;
      }
    }
  }

  return result;
}
