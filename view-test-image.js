import express from 'express';
import { Pool } from 'pg';

// Express-Server für Bild-Anzeige
const app = express();
const port = 4567; // Anderer Port als Hauptapp

// Datenbankverbindung für Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Hauptseite
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bild-Test</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        img { max-width: 100%; border: 1px solid #ddd; }
        .image-box { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
      </style>
    </head>
    <body>
      <h1>Bild-Test für Supabase</h1>
      <p>Serverzeit: ${new Date().toISOString()}</p>
      
      <div class="image-box">
        <h2>Test 1: Von uns hochgeladenes Bild (ID 29)</h2>
        <img src="/image/29" alt="Testbild">
      </div>
      
      <p>Wenn das Bild angezeigt wird, funktioniert der Bildabruf!</p>
    </body>
    </html>
  `);
});

// Bild-Route mit detailliertem Logging
app.get('/image/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`Bild ${id} angefordert`);
    
    // Datenbank-Verbindung
    const client = await pool.connect();
    console.log(`DB-Verbindung für Bild ${id} hergestellt`);
    
    // Bild abrufen
    const result = await client.query('SELECT image, image_type FROM locations WHERE id = $1', [id]);
    console.log(`Abfrageergebnis für Bild ${id}: ${result.rowCount} Zeilen`);
    
    if (result.rows.length === 0 || !result.rows[0].image) {
      client.release();
      console.log(`Bild ${id} nicht gefunden oder leer`);
      return res.status(404).send('Bild nicht gefunden');
    }
    
    // Bild-Daten
    const imageBase64 = result.rows[0].image;
    const imageType = result.rows[0].image_type || 'image/jpeg';
    console.log(`Bild ${id} gefunden: Typ ${imageType}, Base64-Länge: ${imageBase64.length}`);
    
    // Header setzen
    res.set('Content-Type', imageType);
    res.set('Cache-Control', 'no-store');
    
    // Bild senden
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    console.log(`Bild ${id} in Buffer konvertiert: ${imageBuffer.length} Bytes`);
    res.end(imageBuffer);
    console.log(`Bild ${id} an Client gesendet!`);
    
    client.release();
    
  } catch (err) {
    console.error('Fehler beim Abrufen des Bildes:', err);
    res.status(500).send('Serverfehler: ' + err.message);
  }
});

// Server starten
app.listen(port, () => {
  console.log(`
  ====================================
  🖼️  Bild-Testserver läuft auf Port ${port}
  ====================================
  Öffne http://localhost:${port} im Browser
  `);
});