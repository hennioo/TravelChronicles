import express from 'express';
import { Pool } from 'pg';

// Absolut einfaches Skript zum Testen der Bildausgabe
const app = express();
const port = process.env.PORT || 3000;

// Datenbank-Verbindung einrichten
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

console.log("Bildfix-Tool gestartet");

// Status-Route
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Bildfix</title>
        <style>
          body { font-family: Arial; max-width: 800px; margin: 0 auto; padding: 20px; }
          img { max-width: 100%; border: 1px solid #ddd; }
        </style>
      </head>
      <body>
        <h1>Bildfix</h1>
        <p>Einfache Testseite, um Bilder direkt anzuzeigen.</p>
        <p>Teste einen dieser Links:</p>
        <ul>
          <li><a href="/bild/26">Bild ID 26 anzeigen</a></li>
          <li><a href="/bild-html/26">Bild ID 26 in HTML eingebettet</a></li>
          <li><a href="/alle-bilder">Alle Bilder anzeigen</a></li>
        </ul>
      </body>
    </html>
  `);
});

// Rohbild direkt anzeigen
app.get('/bild/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).send('Ungültige ID');
    }
    
    console.log(`Bild mit ID ${id} angefordert`);
    
    const result = await pool.query('SELECT image, image_type FROM locations WHERE id = $1', [id]);
    
    if (result.rows.length === 0 || !result.rows[0].image) {
      return res.status(404).send('Bild nicht gefunden');
    }
    
    const imageBase64 = result.rows[0].image;
    const imageType = result.rows[0].image_type || 'image/jpeg';
    
    // Wichtig: Alle Header zurücksetzen
    res.setHeader('Content-Type', imageType);
    res.setHeader('Cache-Control', 'no-store');
    
    // Bild als Binärdaten senden
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    console.log(`Sende Bild ${id} (${imageBuffer.length} Bytes) als ${imageType}`);
    
    // res.send statt res.end um ggf. Express-spezifische Probleme zu umgehen
    return res.send(imageBuffer);
  } catch (error) {
    console.error('Fehler beim Abrufen des Bildes:', error);
    res.status(500).send('Fehler: ' + error.message);
  }
});

// Bild in HTML eingebettet anzeigen
app.get('/bild-html/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).send('Ungültige ID');
    }
    
    console.log(`Bild mit ID ${id} in HTML angefordert`);
    
    const result = await pool.query('SELECT id, title FROM locations WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).send('Bild nicht gefunden');
    }
    
    const location = result.rows[0];
    
    res.send(`
      <html>
        <head>
          <title>Bild ${location.title}</title>
          <style>
            body { font-family: Arial; max-width: 800px; margin: 0 auto; padding: 20px; }
            img { max-width: 100%; border: 1px solid #ddd; }
          </style>
        </head>
        <body>
          <h1>Bild: ${location.title}</h1>
          <p><a href="/">Zurück zur Übersicht</a></p>
          
          <div style="margin: 20px 0;">
            <h3>Bild (ID: ${id}):</h3>
            <img src="/bild/${id}" alt="${location.title}">
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Fehler:', error);
    res.status(500).send('Fehler: ' + error.message);
  }
});

// Alle Bilder anzeigen
app.get('/alle-bilder', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, title FROM locations ORDER BY id');
    
    if (result.rows.length === 0) {
      return res.send(`
        <html>
          <head><title>Keine Bilder</title></head>
          <body>
            <h1>Keine Bilder gefunden</h1>
            <p><a href="/">Zurück zur Übersicht</a></p>
          </body>
        </html>
      `);
    }
    
    const locations = result.rows;
    
    res.send(`
      <html>
        <head>
          <title>Alle Bilder</title>
          <style>
            body { font-family: Arial; max-width: 1000px; margin: 0 auto; padding: 20px; }
            .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
            .image-card { border: 1px solid #ddd; padding: 10px; }
            img { width: 100%; height: 200px; object-fit: cover; }
          </style>
        </head>
        <body>
          <h1>Alle Bilder</h1>
          <p><a href="/">Zurück zur Übersicht</a></p>
          
          <div class="gallery">
            ${locations.map(loc => `
              <div class="image-card">
                <h3>${loc.title}</h3>
                <img src="/bild/${loc.id}" alt="${loc.title}">
                <p><a href="/bild-html/${loc.id}">Details anzeigen</a></p>
              </div>
            `).join('')}
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Fehler:', error);
    res.status(500).send('Fehler: ' + error.message);
  }
});

// Server starten
app.listen(port, () => {
  console.log(`Bildfix läuft auf Port ${port}`);
});