import express from 'express';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// Express-Server erstellen
const app = express();
const port = 3456; // Anderer Port als die Hauptanwendung

// Datenbankverbindung
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Hauptseite
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Lokaler Bildtest</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .image-box { border: 1px solid #ddd; padding: 15px; margin: 15px 0; }
      </style>
    </head>
    <body>
      <h1>Lokaler Bildtest</h1>
      <p>Dieser Server testet lokal, ob die Bildausgabe funktioniert.</p>
      
      <div class="image-box">
        <h2>Test 1: Bild aus Datenbank (ID 26)</h2>
        <img src="/db-image/26" alt="Bild aus DB" style="max-width: 100%;">
      </div>
      
      <div class="image-box">
        <h2>Test 2: Lokales Testbild</h2>
        <img src="/test-image" alt="Testbild" style="max-width: 100%;">
      </div>
    </body>
    </html>
  `);
});

// Bild aus Datenbank
app.get('/db-image/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`Bild ${id} angefordert`);
    
    // Bild aus Datenbank holen
    const result = await pool.query('SELECT image, image_type FROM locations WHERE id = $1', [id]);
    
    if (result.rows.length === 0 || !result.rows[0].image) {
      console.log(`Bild ${id} nicht gefunden`);
      return res.status(404).send('Bild nicht gefunden');
    }
    
    const imageBase64 = result.rows[0].image;
    const imageType = result.rows[0].image_type || 'image/jpeg';
    
    console.log(`Bild ${id} gefunden, Typ: ${imageType}, Base64-Länge: ${imageBase64.length}`);
    
    // Header setzen
    res.set('Content-Type', imageType);
    res.set('Cache-Control', 'no-store');
    
    // Bild senden
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    console.log(`Sende Bild mit ${imageBuffer.length} Bytes`);
    
    res.end(imageBuffer);
    
  } catch (err) {
    console.error('Fehler beim Anzeigen des Bildes:', err);
    res.status(500).send('Serverfehler: ' + err.message);
  }
});

// Lokales Testbild
app.get('/test-image', (req, res) => {
  try {
    // Generiere ein einfaches Testbild
    const size = 200;
    const canvas = new Uint8ClampedArray(size * size * 4);
    
    // Einfaches Farbmuster erzeugen
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        canvas[i]   = x;       // Rot
        canvas[i+1] = y;       // Grün
        canvas[i+2] = 128;     // Blau
        canvas[i+3] = 255;     // Alpha
      }
    }
    
    // JPEG Header und Footer (sehr vereinfacht)
    const header = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    const footer = Buffer.from([0xFF, 0xD9]);
    
    // "Bild" aus Header, Daten und Footer zusammensetzen
    const imageBuffer = Buffer.concat([header, Buffer.from(canvas), footer]);
    
    // Als JPEG senden
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'no-store');
    res.end(imageBuffer);
    
    console.log('Testbild gesendet');
    
  } catch (err) {
    console.error('Fehler beim Generieren des Testbildes:', err);
    res.status(500).send('Serverfehler: ' + err.message);
  }
});

// Server starten
async function startServer() {
  try {
    // DB-Verbindung testen
    const client = await pool.connect();
    console.log('✅ Datenbank-Verbindung erfolgreich');
    
    // Locations-Tabelle prüfen
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'locations'
      );
    `);
    
    console.log(`Tabelle 'locations' existiert: ${tableExists.rows[0].exists}`);
    
    if (tableExists.rows[0].exists) {
      // Anzahl der Bilder prüfen
      const countResult = await client.query('SELECT COUNT(*) FROM locations WHERE image IS NOT NULL');
      console.log(`Anzahl Bilder in der Datenbank: ${countResult.rows[0].count}`);
      
      // Ein Beispielbild laden
      const sampleResult = await client.query('SELECT id, title FROM locations WHERE image IS NOT NULL LIMIT 1');
      if (sampleResult.rows.length > 0) {
        console.log(`Beispielbild: ID ${sampleResult.rows[0].id}, Titel: ${sampleResult.rows[0].title}`);
      }
    }
    
    client.release();
    
    // Server starten
    app.listen(port, () => {
      console.log(`
      =====================================
      🖼️  Lokaler Bildtest läuft auf Port ${port}
      =====================================
      Öffne http://localhost:${port} im Browser
      `);
    });
    
  } catch (err) {
    console.error('❌ Fehler beim Starten des Servers:', err);
  }
}

// Starten
startServer();