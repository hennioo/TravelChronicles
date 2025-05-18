// Kompressionstest
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Datenbank-Verbindung
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function testCompression() {
  try {
    // Verbinde zur Datenbank
    console.log('Verbinde zur Datenbank...');
    
    // Lade ein Testbild, das wir komprimieren werden
    const testImagePath = path.resolve(__dirname, 'animal-eye-staring-close-up-watch-nature-generative-ai.jpg');
    console.log(`Lade Testbild: ${testImagePath}`);
    
    if (!fs.existsSync(testImagePath)) {
      console.error('Testbild nicht gefunden. Bitte stelle sicher, dass die Datei existiert.');
      return;
    }
    
    const imageBuffer = fs.readFileSync(testImagePath);
    console.log(`Original-Bildgröße: ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    
    // Versuche Sharp zu laden
    try {
      const sharp = require('sharp');
      
      // Bild komprimieren
      console.log('Komprimiere Bild...');
      const compressedImageBuffer = await sharp(imageBuffer)
        .resize(1200, 1200, { 
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ 
          quality: 60,  // Stärkere Komprimierung
          progressive: true
        })
        .toBuffer();
      
      console.log(`Komprimierte Bildgröße: ${(compressedImageBuffer.length / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Reduzierung: ${(100 - compressedImageBuffer.length / imageBuffer.length * 100).toFixed(2)}%`);
      
      // Speichere das komprimierte Bild ab
      const compressedPath = path.resolve(__dirname, 'compressed-eye.jpg');
      fs.writeFileSync(compressedPath, compressedImageBuffer);
      console.log(`Komprimiertes Bild gespeichert unter: ${compressedPath}`);
      
      // Direkt in die Datenbank speichern
      console.log('Speichere komprimiertes Bild in der Datenbank...');
      const base64Data = compressedImageBuffer.toString('base64');
      
      // Lösche alle vorherigen Orte
      await pool.query('DELETE FROM locations');
      
      // Erstelle einen neuen Ort mit dem komprimierten Bild
      const result = await pool.query(
        'INSERT INTO locations (title, latitude, longitude, description, image_data, image_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        ['Komprimiertes Adlerauge', 48.775846, 9.182932, 'Test der Bildkompression', base64Data, 'image/jpeg']
      );
      
      console.log(`Neuer Ort mit ID ${result.rows[0].id} erstellt und komprimiertes Bild gespeichert.`);
      
    } catch (sharpError) {
      console.error('Sharp ist nicht installiert oder es gab einen Fehler:', sharpError);
    }
    
  } catch (error) {
    console.error('Fehler:', error);
  } finally {
    await pool.end();
    console.log('Datenbankverbindung geschlossen.');
  }
}

// Führe den Test aus
testCompression();