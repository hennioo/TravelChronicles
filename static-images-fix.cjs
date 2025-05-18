const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Konfiguration
const UPLOADS_DIR = path.join(__dirname, 'dist', 'uploads'); // Zielverzeichnis für Bilder
const DATABASE_URL = process.env.DATABASE_URL;

// Stelle sicher, dass das Uploads-Verzeichnis existiert
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log(`Verzeichnis erstellt: ${UPLOADS_DIR}`);
}

// Datenbankverbindung
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function extractAndSaveImages() {
  try {
    console.log('Verbinde zur Datenbank...');
    
    // Hole alle Orte mit Base64-Bildern
    const result = await pool.query('SELECT id, title, image_data, image_type FROM locations WHERE image_data IS NOT NULL');
    
    console.log(`${result.rows.length} Orte mit Bildern gefunden.`);
    
    // Für jeden Ort mit Bild
    for (const location of result.rows) {
      try {
        const { id, title, image_data, image_type } = location;
        
        if (!image_data) {
          console.log(`Ort #${id} (${title}) hat keine Bilddaten.`);
          continue;
        }
        
        // Bestimme Dateityp
        let extension = 'jpg';
        if (image_type) {
          // Extrahiere Dateiendung aus MIME-Typ
          const match = image_type.match(/^image\/(\w+)$/);
          if (match && match[1]) {
            extension = match[1] === 'jpeg' ? 'jpg' : match[1];
          }
        }
        
        // Erstelle Dateinamen
        const fileName = `location_${id}_${Date.now()}.${extension}`;
        const filePath = path.join(UPLOADS_DIR, fileName);
        
        // Dekodiere und speichere das Bild
        const buffer = Buffer.from(image_data, 'base64');
        fs.writeFileSync(filePath, buffer);
        
        console.log(`Bild für Ort #${id} (${title}) als ${fileName} gespeichert.`);
        
        // Aktualisiere die Datenbank mit dem neuen Dateipfad
        await pool.query(
          'UPDATE locations SET image = $1 WHERE id = $2',
          [`/uploads/${fileName}`, id]
        );
        
        console.log(`Datenbank für Ort #${id} aktualisiert.`);
      } catch (err) {
        console.error(`Fehler bei Ort #${location.id}:`, err);
      }
    }
    
    console.log('Fertig!');
  } catch (err) {
    console.error('Fehler:', err);
  } finally {
    await pool.end();
  }
}

// Aktualisiere den Server-Code
async function updateServerCode() {
  try {
    const indexPath = path.join(__dirname, 'dist', 'index.js');
    
    // Lass uns sicherstellen, dass der Datei-basierte Endpunkt korrekt funktioniert
    if (fs.existsSync(indexPath)) {
      let code = fs.readFileSync(indexPath, 'utf8');
      
      // Verbessere den Bild-Endpunkt
      if (code.includes('app.get(\'/api/locations/:id/image\'')) {
        console.log('Aktualisiere Bild-Endpunkt...');
        
        // Regex, um den existierenden Bild-Endpunkt zu finden
        const regex = /app\.get\(['"]\/api\/locations\/:id\/image['"].*?\}\);/s;
        
        // Neuer, verbesserter Endpunkt
        const newEndpoint = `app.get('/api/locations/:id/image', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    console.log(\`Bild für Ort \${id} angefordert\`);
    
    // Cache-Control Header setzen
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Zuerst versuchen, ein Bild aus der Datenbank zu finden
    const result = await pool.query('SELECT image, image_data, image_type FROM locations WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      console.log(\`Ort \${id} nicht gefunden\`);
      return res.sendFile(path.join(uploadsDir, 'couple.jpg'));
    }
    
    const { image, image_data, image_type } = result.rows[0];
    
    // Wenn es einen Dateipfad gibt, verwende diesen
    if (image) {
      const imagePath = path.join(__dirname, image);
      console.log(\`Sende Bilddatei: \${image}\`);
      
      if (image.startsWith('/uploads/')) {
        // Direktes Senden der statischen Datei
        return res.sendFile(path.join(__dirname, image));
      }
    }
    
    // Fallback zu Base64-Daten, falls vorhanden
    if (image_data) {
      console.log(\`Sende Base64-Bild für Ort \${id}\`);
      const buffer = Buffer.from(image_data, 'base64');
      res.setHeader('Content-Type', image_type || 'image/jpeg');
      return res.send(buffer);
    }
    
    // Fallback zum Pärchenbild
    console.log('Bild nicht gefunden, sende Fallback');
    return res.sendFile(path.join(uploadsDir, 'couple.jpg'));
  } catch (error) {
    console.error('Fehler beim Abrufen des Bildes:', error);
    res.status(500).send('Fehler beim Abrufen des Bildes');
  }
});`;
        
        // Ersetze den alten Endpunkt durch den neuen
        code = code.replace(regex, newEndpoint);
        
        // Speichere die Änderungen
        fs.writeFileSync(indexPath, code);
        console.log('Bild-Endpunkt erfolgreich aktualisiert.');
      } else {
        console.log('Bild-Endpunkt nicht gefunden.');
      }
    } else {
      console.log(`Datei nicht gefunden: ${indexPath}`);
    }
  } catch (err) {
    console.error('Fehler beim Aktualisieren des Server-Codes:', err);
  }
}

// Führe alles aus
async function main() {
  console.log('Starte Bild-Extraktion...');
  await extractAndSaveImages();
  
  console.log('Aktualisiere Server-Code...');
  await updateServerCode();
  
  console.log('Alles erledigt! Bitte deploye erneut mit "Manual Deploy" und "Clear build cache & deploy".');
}

// Starte das Skript
main();