// CommonJS Format für maximale Kompatibilität
const express = require('express');
const pg = require('pg');
const { Pool } = pg;

// Server erstellen
const app = express();
const port = process.env.PORT || 3000;

// Grundlegende Konfiguration
app.use(express.json());

// Datenbank-Verbindung
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Für Render/Supabase nötig
  }
});

// Test-Route
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Susibert Image Test</title>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; }
        .box { border: 1px solid #ddd; padding: 15px; margin: 15px 0; border-radius: 5px; }
        pre { background: #f5f5f5; padding: 10px; overflow: auto; }
      </style>
    </head>
    <body>
      <h1>Susibert Image Test</h1>
      <p>Bildtest-Server läuft - Serverzeit: ${new Date().toISOString()}</p>
      
      <div class="box">
        <h2>Test 1: Direktes Bild (ID 26)</h2>
        <p>Bild-URL: <a href="/direct-image/26">/direct-image/26</a></p>
      </div>
      
      <div class="box">
        <h2>Test 2: Bild in Seite eingebettet</h2>
        <p><a href="/view-image/26">Bild ID 26 anzeigen</a></p>
      </div>

      <div class="box">
        <h2>Test 3: Base64-JSON Format</h2>
        <p><a href="/base64-json/26">Bild als Base64-JSON</a></p>
      </div>
      
      <div class="box">
        <h2>Server-Info</h2>
        <p>Node.js Version: ${process.version}</p>
        <p>Datenbank: ${process.env.DATABASE_URL ? "Konfiguriert" : "Nicht konfiguriert"}</p>
      </div>
    </body>
    </html>
  `);
});

// Direktes Bild - Maximaler Debug-Modus
app.get('/direct-image/:id', async (req, res) => {
  console.log(`Bild mit ID ${req.params.id} angefordert`);
  try {
    const id = req.params.id;
    
    // Datenbank-Verbindung herstellen
    const client = await pool.connect();
    console.log('DB-Verbindung hergestellt für Bild ' + id);
    
    // Bild abrufen
    const result = await client.query('SELECT image, image_type FROM locations WHERE id = $1', [id]);
    console.log(`Abfrageergebnis: ${result.rowCount} Zeilen gefunden`);
    
    if (result.rows.length === 0) {
      client.release();
      console.log(`Bild ${id} nicht in DB gefunden`);
      return res.status(404).send('Bild nicht gefunden');
    }
    
    // Bild-Daten
    const imageBase64 = result.rows[0].image;
    const imageType = result.rows[0].image_type || 'image/jpeg';
    console.log(`Bild ${id} gefunden: Typ ${imageType}, Base64-Länge: ${imageBase64.length}`);
    
    // Buffer erstellen
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    console.log(`Bild ${id} in Buffer konvertiert: ${imageBuffer.length} Bytes`);
    
    // Content-Type setzen
    res.set('Content-Type', imageType);
    
    // Cache verhindern
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    
    // Bild direkt senden
    client.release();
    res.end(imageBuffer);
    console.log(`Bild ${id} wurde gesendet!`);
    
  } catch (err) {
    console.error('Fehler beim Abrufen des Bildes:', err);
    res.status(500).send(`Fehler: ${err.message}`);
  }
});

// Bild in HTML anzeigen
app.get('/view-image/:id', async (req, res) => {
  try {
    const id = req.params.id;
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bild ${id}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .image-box { border: 3px solid #333; padding: 20px; }
          img { max-width: 100%; }
        </style>
      </head>
      <body>
        <h1>Bild ${id}</h1>
        <p><a href="/">Zurück zur Übersicht</a></p>
        
        <div class="image-box">
          <h3>Standard Image Tag:</h3>
          <img src="/direct-image/${id}" alt="Bild ${id}">
        </div>
        
        <div>
          <h3>Debug-Informationen:</h3>
          <p>Bild-URL: /direct-image/${id}</p>
          <p>Timestamp: ${Date.now()}</p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`Fehler: ${err.message}`);
  }
});

// Base64-JSON Format
app.get('/base64-json/:id', async (req, res) => {
  try {
    const id = req.params.id;
    
    // Datenbank-Verbindung herstellen
    const client = await pool.connect();
    
    // Bild abrufen
    const result = await client.query('SELECT image, image_type FROM locations WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      client.release();
      return res.status(404).json({ success: false, message: 'Bild nicht gefunden' });
    }
    
    // Bild-Daten
    const imageBase64 = result.rows[0].image;
    const imageType = result.rows[0].image_type || 'image/jpeg';
    
    client.release();
    
    // JSON-Antwort senden
    res.json({
      success: true,
      imageType,
      imageData: imageBase64,
      length: imageBase64.length
    });
    
  } catch (err) {
    console.error('Fehler beim Abrufen des Bildes als JSON:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Fehler-Route
app.use((req, res) => {
  res.status(404).send('Seite nicht gefunden');
});

// Server starten
async function startServer() {
  try {
    // Verbindung zur Datenbank testen
    const client = await pool.connect();
    console.log('✅ Datenbank-Verbindung erfolgreich');
    
    // Tabellen-Existenz prüfen
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'locations'
      );
    `);
    
    const tableExists = tableCheck.rows[0].exists;
    console.log(`Tabelle 'locations' existiert: ${tableExists}`);
    
    if (tableExists) {
      // Anzahl der Bilder checken
      const countResult = await client.query('SELECT COUNT(*) FROM locations');
      console.log(`Anzahl Einträge in locations: ${countResult.rows[0].count}`);
    }
    
    client.release();
    
    // Server starten
    app.listen(port, () => {
      console.log(`
      ===================================
      🖼️  Bildfix-Server läuft auf Port ${port}
      ===================================
      `);
    });
  } catch (err) {
    console.error('❌ Fehler beim Starten des Servers:', err);
    process.exit(1);
  }
}

// Server starten
startServer();