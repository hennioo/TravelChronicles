/**
 * Fix für die Bild-Upload-Funktionen in Susibert
 * 
 * Dieses Skript stellt sicher, dass Bilder korrekt als Base64 in der Datenbank
 * gespeichert werden und immer korrekt geladen werden können.
 */

// Import der benötigten Module
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');

// Create uploads dir if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
}

// Datenbank-Verbindung
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Schemaprüfung und -anpassung
async function checkSchema() {
  console.log('Prüfe Datenbankschema...');
  
  try {
    // Prüfe, ob image_data Spalte existiert
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'locations' AND column_name = 'image_data'
    `);
    
    // Falls die Spalte nicht existiert, erstelle sie
    if (columnCheck.rows.length === 0) {
      console.log('Spalte image_data existiert nicht, erstelle sie...');
      await pool.query(`
        ALTER TABLE locations ADD COLUMN image_data TEXT
      `);
      console.log('Spalte image_data hinzugefügt');
    } else {
      console.log('Spalte image_data existiert bereits');
    }
    
    return true;
  } catch (error) {
    console.error('Fehler bei der Schemaprüfung:', error);
    return false;
  }
}

// Express-App erstellen
const app = express();
const port = process.env.PORT || 3000;

// Multer für Datei-Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

// Route für die Hauptseite
app.get('/', (req, res) => {
  res.send(`
    <h1>Susibert Bild-Upload-Fix</h1>
    <p>Dieses Tool behebt Probleme mit Bildern in der Datenbank.</p>
    <ul>
      <li><a href="/check-schema">Schema prüfen</a></li>
      <li><a href="/fix-images">Bilder reparieren</a></li>
      <li><a href="/upload-test">Upload-Test</a></li>
    </ul>
  `);
});

// Schema prüfen
app.get('/check-schema', async (req, res) => {
  const result = await checkSchema();
  res.send(`
    <h1>Schema-Prüfung</h1>
    <p>Ergebnis: ${result ? 'Erfolgreich' : 'Fehlgeschlagen'}</p>
    <p><a href="/">Zurück</a></p>
  `);
});

// Bilder reparieren
app.get('/fix-images', async (req, res) => {
  try {
    // Hole alle Orte, die einen Bildpfad haben, aber keine Bilddaten
    const locations = await pool.query(`
      SELECT id, image, image_type FROM locations 
      WHERE image IS NOT NULL AND (image_data IS NULL OR image_data = '')
    `);
    
    const results = [];
    
    for (const location of locations.rows) {
      try {
        const imagePath = location.image;
        
        if (!imagePath) {
          results.push({ id: location.id, result: 'Kein Bildpfad vorhanden' });
          continue;
        }
        
        if (!fs.existsSync(imagePath)) {
          const relativePath = path.join('uploads', path.basename(imagePath));
          if (fs.existsSync(relativePath)) {
            // Bild als Base64 einlesen
            const imageData = fs.readFileSync(relativePath, { encoding: 'base64' });
            
            // In die Datenbank aktualisieren
            await pool.query(
              'UPDATE locations SET image_data = $1 WHERE id = $2',
              [imageData, location.id]
            );
            
            results.push({ 
              id: location.id, 
              result: `Erfolgreich migriert (relativer Pfad: ${relativePath})` 
            });
          } else {
            results.push({ 
              id: location.id, 
              result: `Datei nicht gefunden: ${imagePath} oder ${relativePath}` 
            });
          }
        } else {
          // Bild als Base64 einlesen
          const imageData = fs.readFileSync(imagePath, { encoding: 'base64' });
          
          // In die Datenbank aktualisieren
          await pool.query(
            'UPDATE locations SET image_data = $1 WHERE id = $2',
            [imageData, location.id]
          );
          
          results.push({ 
            id: location.id, 
            result: `Erfolgreich migriert (absoluter Pfad: ${imagePath})` 
          });
        }
      } catch (error) {
        results.push({ 
          id: location.id, 
          result: `Fehler: ${error.message}` 
        });
      }
    }
    
    res.send(`
      <h1>Bilder-Reparatur</h1>
      <h2>${locations.rows.length} Bilder gefunden:</h2>
      <ul>
        ${results.map(r => `<li>Ort ID ${r.id}: ${r.result}</li>`).join('')}
      </ul>
      <p><a href="/">Zurück</a></p>
    `);
  } catch (error) {
    res.send(`
      <h1>Fehler</h1>
      <p>${error.message}</p>
      <p><a href="/">Zurück</a></p>
    `);
  }
});

// Upload-Test
app.get('/upload-test', (req, res) => {
  res.send(`
    <h1>Upload-Test</h1>
    <form action="/upload" method="post" enctype="multipart/form-data">
      <div>
        <label for="title">Titel:</label>
        <input type="text" id="title" name="title" required>
      </div>
      <div>
        <label for="description">Beschreibung:</label>
        <textarea id="description" name="description"></textarea>
      </div>
      <div>
        <label for="latitude">Breitengrad:</label>
        <input type="number" id="latitude" name="latitude" step="0.000001" required value="50.0">
      </div>
      <div>
        <label for="longitude">Längengrad:</label>
        <input type="number" id="longitude" name="longitude" step="0.000001" required value="10.0">
      </div>
      <div>
        <label for="image">Bild:</label>
        <input type="file" id="image" name="image" required accept="image/*">
      </div>
      <button type="submit">Hochladen</button>
    </form>
    <p><a href="/">Zurück</a></p>
  `);
});

// Upload-Handler
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const { title, description, latitude, longitude } = req.body;
    
    if (!req.file) {
      return res.status(400).send('Kein Bild hochgeladen');
    }
    
    // Bild als Base64 einlesen
    const imageData = fs.readFileSync(req.file.path, { encoding: 'base64' });
    
    // In die Datenbank einfügen
    const result = await pool.query(
      'INSERT INTO locations (title, latitude, longitude, description, image, image_data, image_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [title, latitude, longitude, description || null, req.file.path, imageData, req.file.mimetype]
    );
    
    res.send(`
      <h1>Upload erfolgreich</h1>
      <p>Ort mit ID ${result.rows[0].id} erstellt</p>
      <h2>Bildinformationen:</h2>
      <ul>
        <li>Pfad: ${req.file.path}</li>
        <li>MIME-Typ: ${req.file.mimetype}</li>
        <li>Größe: ${req.file.size} Bytes</li>
        <li>Base64-Länge: ${imageData.length} Zeichen</li>
      </ul>
      <p><a href="/">Zurück</a></p>
    `);
  } catch (error) {
    res.status(500).send(`
      <h1>Fehler</h1>
      <p>${error.message}</p>
      <p><a href="/">Zurück</a></p>
    `);
  }
});

// Server starten
async function startServer() {
  // Schemaprüfung durchführen
  await checkSchema();
  
  app.listen(port, () => {
    console.log(`Server läuft auf Port ${port}`);
  });
}

startServer();