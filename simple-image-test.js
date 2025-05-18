const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Einfache Express-App erstellen
const app = express();
const port = process.env.PORT || 3000;

// Datenbank-Verbindung konfigurieren
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Verbindung testen
async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('Datenbankverbindung erfolgreich hergestellt');
    client.release();
    return true;
  } catch (err) {
    console.error('Fehler bei der Datenbankverbindung:', err);
    return false;
  }
}

// Testbild-Route - ohne Middleware, ohne Auth, so einfach wie möglich
app.get('/simple-test-image', async (req, res) => {
  try {
    console.log('Simple Test Image Route aufgerufen');
    
    // Feste Location ID für Test
    const locationId = 26;
    
    // Bild aus Datenbank holen
    const result = await pool.query(`
      SELECT image, image_type
      FROM locations
      WHERE id = $1 AND image IS NOT NULL
    `, [locationId]);
    
    if (result.rows.length === 0 || !result.rows[0].image) {
      return res.status(404).send('Bild nicht gefunden');
    }
    
    const imageBase64 = result.rows[0].image;
    const imageType = result.rows[0].image_type || 'image/jpeg';
    
    // Header explizit setzen
    res.set({
      'Content-Type': imageType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    // Bild konvertieren und senden
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    console.log(`Sende Bild mit Typ ${imageType}, Größe: ${imageBuffer.length} Bytes`);
    
    // Direkt senden, ohne weitere Verarbeitung
    return res.end(imageBuffer);
  } catch (error) {
    console.error('Fehler beim Testen des Bildes:', error);
    res.status(500).send('Interner Serverfehler');
  }
});

// Statischen Test-HTML-Endpunkt hinzufügen
app.get('/test-page', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bild-Test</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .image-container { 
          border: 2px solid #333; 
          padding: 10px; 
          margin: 20px 0; 
          max-width: 500px;
        }
        img { max-width: 100%; }
        h2 { color: #555; }
      </style>
    </head>
    <body>
      <h1>Bildtest für Susibert</h1>
      
      <h2>Direkter Bild-Test:</h2>
      <div class="image-container">
        <img src="/simple-test-image" alt="Test Bild" />
      </div>
      
      <p>Wenn das Bild oben angezeigt wird, funktioniert der Bildendpunkt korrekt.</p>
      <p>Aktuelle Zeit: ${new Date().toISOString()}</p>
    </body>
    </html>
  `);
});

// Status-Endpunkt hinzufügen
app.get('/', (req, res) => {
  res.send('Bild-Test-Server läuft. Teste <a href="/test-page">Testseite</a> oder <a href="/simple-test-image">direktes Bild</a>.');
});

// Server starten
async function startServer() {
  const dbConnected = await testConnection();
  
  if (dbConnected) {
    app.listen(port, () => {
      console.log(`Bild-Test-Server läuft auf Port ${port}`);
      console.log(`Teste unter: http://localhost:${port}/test-page`);
    });
  } else {
    console.log('Server wird nicht gestartet, da keine Datenbankverbindung besteht');
  }
}

startServer().catch(console.error);