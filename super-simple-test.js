import express from 'express';
import pg from 'pg';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Express App erstellen
const app = express();
const port = process.env.PORT || 3000;
const { Pool } = pg;

// Middleware für Formular-Daten
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer für Datei-Uploads
const upload = multer({
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB Limit
});

// Datenbank-Verbindung
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Testen, ob wir uns mit der Datenbank verbinden können
async function testDB() {
  try {
    const client = await pool.connect();
    console.log('✅ Datenbank-Verbindung erfolgreich!');
    
    // Prüfen, ob die Tabelle existiert, sonst erstellen
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'test_images'
      );
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('⚠️ Tabelle test_images existiert nicht, wird erstellt...');
      await client.query(`
        CREATE TABLE test_images (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          image BYTEA,
          image_type TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Tabelle test_images erstellt!');
    } else {
      console.log('✅ Tabelle test_images existiert bereits!');
    }
    
    client.release();
    return true;
  } catch (err) {
    console.error('❌ Datenbank-Verbindungsfehler:', err);
    return false;
  }
}

// HTML für die Testseite
const getHTML = (message = '', images = []) => `
<!DOCTYPE html>
<html>
<head>
  <title>Susibert Bild-Test</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    h1 {
      color: #333;
      text-align: center;
    }
    form {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.1);
      margin-bottom: 30px;
    }
    label {
      display: block;
      margin-bottom: 8px;
      font-weight: bold;
    }
    input[type="text"],
    input[type="file"] {
      width: 100%;
      padding: 8px;
      margin-bottom: 20px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    button {
      background-color: #4CAF50;
      color: white;
      border: none;
      padding: 10px 15px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
    }
    button:hover {
      background-color: #45a049;
    }
    .message {
      padding: 10px 15px;
      margin: 20px 0;
      border-radius: 4px;
      background-color: ${message.includes('Fehler') ? '#ffdddd' : '#ddffdd'};
      border-left: 5px solid ${message.includes('Fehler') ? '#f44336' : '#4CAF50'};
    }
    .images {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
    }
    .image-card {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    }
    .image-card img {
      width: 100%;
      height: 200px;
      object-fit: cover;
    }
    .image-info {
      padding: 15px;
    }
    .timestamp {
      color: #666;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <h1>Susibert Bild-Test</h1>
  
  ${message ? `<div class="message">${message}</div>` : ''}
  
  <form action="/upload" method="post" enctype="multipart/form-data">
    <h2>Neues Bild hochladen</h2>
    <div>
      <label for="title">Titel:</label>
      <input type="text" id="title" name="title" required>
    </div>
    <div>
      <label for="image">Bild (max. 15MB):</label>
      <input type="file" id="image" name="image" accept="image/*" required>
    </div>
    <button type="submit">Hochladen</button>
  </form>
  
  <h2>Gespeicherte Bilder</h2>
  <div class="images">
    ${images.map(img => `
      <div class="image-card">
        <img src="/image/${img.id}" alt="${img.title}">
        <div class="image-info">
          <h3>${img.title}</h3>
          <p class="timestamp">Hochgeladen: ${new Date(img.created_at).toLocaleString()}</p>
        </div>
      </div>
    `).join('')}
  </div>
  
  <hr>
  <p>Aktuelle Zeit: ${new Date().toLocaleString()}</p>
</body>
</html>
`;

// Hauptseite
app.get('/', async (req, res) => {
  try {
    // Alle Bilder abrufen
    const result = await pool.query('SELECT id, title, created_at FROM test_images ORDER BY created_at DESC');
    const images = result.rows;
    
    res.send(getHTML('', images));
  } catch (err) {
    console.error('Fehler beim Abrufen der Bilder:', err);
    res.send(getHTML('Fehler beim Abrufen der Bilder: ' + err.message));
  }
});

// Bild-Upload
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    console.log('Bild-Upload gestartet');
    
    if (!req.file) {
      return res.send(getHTML('Fehler: Kein Bild hochgeladen'));
    }
    
    const title = req.body.title;
    if (!title) {
      return res.send(getHTML('Fehler: Kein Titel angegeben'));
    }
    
    // MIME-Typ des Bildes
    const imageType = req.file.mimetype;
    console.log(`Hochgeladenes Bild: ${title}, Typ: ${imageType}, Größe: ${req.file.size} Bytes`);
    
    // Bild in Base64 konvertieren
    const imageBuffer = req.file.buffer;
    
    // In Datenbank speichern
    const result = await pool.query(
      'INSERT INTO test_images (title, image, image_type) VALUES ($1, $2, $3) RETURNING id',
      [title, imageBuffer, imageType]
    );
    
    const imageId = result.rows[0].id;
    console.log(`Bild mit ID ${imageId} erfolgreich gespeichert`);
    
    // Zur Hauptseite mit Erfolgsmeldung zurückleiten
    const allImages = await pool.query('SELECT id, title, created_at FROM test_images ORDER BY created_at DESC');
    res.send(getHTML(`Bild "${title}" erfolgreich hochgeladen!`, allImages.rows));
  } catch (err) {
    console.error('Fehler beim Hochladen des Bildes:', err);
    res.send(getHTML('Fehler beim Hochladen des Bildes: ' + err.message));
  }
});

// Bild anzeigen
app.get('/image/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).send('Ungültige Bild-ID');
    }
    
    // Bild aus Datenbank abrufen
    const result = await pool.query('SELECT image, image_type FROM test_images WHERE id = $1', [id]);
    
    if (result.rows.length === 0 || !result.rows[0].image) {
      return res.status(404).send('Bild nicht gefunden');
    }
    
    // Wichtig: Content-Type setzen
    const imageType = result.rows[0].image_type || 'image/jpeg';
    res.set('Content-Type', imageType);
    
    // Cache-Control setzen
    res.set('Cache-Control', 'no-store, max-age=0');
    
    // Bild direkt senden
    const imageBuffer = result.rows[0].image;
    console.log(`Sende Bild ${id} mit Typ ${imageType}, Größe: ${imageBuffer.length} Bytes`);
    res.end(imageBuffer);
  } catch (err) {
    console.error('Fehler beim Abrufen des Bildes:', err);
    res.status(500).send('Interner Serverfehler');
  }
});

// Server starten
async function startServer() {
  const dbConnected = await testDB();
  
  if (dbConnected) {
    app.listen(port, () => {
      console.log(`
      ===========================================
      🖼️  Susibert Bild-Test läuft auf Port ${port}
      ===========================================
      Öffne http://localhost:${port} im Browser
      `);
    });
  } else {
    console.log('Server wird nicht gestartet, da keine Datenbankverbindung besteht');
  }
}

startServer();