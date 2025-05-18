// Server-seitiges Script zum Überprüfen und Reparieren der Bilder in der Datenbank
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

async function checkAndFixImages() {
  try {
    console.log('Verbinde zur Datenbank...');
    
    // Prüfe alle Orte
    const locationsResult = await pool.query('SELECT id, title, image_data, image_type FROM locations');
    
    console.log(`${locationsResult.rows.length} Orte gefunden.`);
    
    for (const location of locationsResult.rows) {
      const { id, title, image_data, image_type } = location;
      
      console.log(`Prüfe Ort #${id} (${title}):`);
      
      if (!image_data) {
        console.log(`  - Kein Bild gefunden!`);
        
        // Prüfe, ob es eine image-Spalte mit einem Pfad gibt
        const imagePathResult = await pool.query('SELECT image FROM locations WHERE id = $1', [id]);
        const imagePath = imagePathResult.rows[0]?.image;
        
        if (imagePath) {
          console.log(`  - Gefundener Bildpfad: ${imagePath}`);
          
          // Prüfe, ob die Datei existiert
          const absolutePath = path.resolve(__dirname, imagePath);
          if (fs.existsSync(absolutePath)) {
            console.log(`  - Datei existiert: ${absolutePath}`);
            
            // Datei als Base64 einlesen
            const imageBuffer = fs.readFileSync(absolutePath);
            const base64Data = imageBuffer.toString('base64');
            
            console.log(`  - Konvertiere Datei zu Base64 (${base64Data.length} Zeichen)`);
            
            // In die Datenbank schreiben
            await pool.query(
              'UPDATE locations SET image_data = $1, image_type = $2 WHERE id = $3',
              [base64Data, 'image/jpeg', id]
            );
            
            console.log(`  - Datenbank aktualisiert, Bild als Base64 gespeichert.`);
          } else {
            console.log(`  - Datei existiert nicht: ${absolutePath}`);
          }
        } else {
          console.log(`  - Kein Bildpfad gefunden.`);
        }
      } else {
        // Prüfe Länge des Base64-Strings
        console.log(`  - Base64-Daten gefunden, Länge: ${image_data.length} Zeichen`);
        console.log(`  - MIME-Typ: ${image_type || 'nicht angegeben'}`);
        
        // Validiere die Base64-Daten
        try {
          const buffer = Buffer.from(image_data, 'base64');
          console.log(`  - Base64-Daten sind gültig, dekodierte Größe: ${buffer.length} Bytes`);
          
          // Stelle sicher, dass der MIME-Typ gesetzt ist
          if (!image_type) {
            console.log(`  - Setze fehlenden MIME-Typ auf 'image/jpeg'`);
            await pool.query(
              'UPDATE locations SET image_type = $1 WHERE id = $2',
              ['image/jpeg', id]
            );
          }
        } catch (error) {
          console.error(`  - Fehler beim Validieren der Base64-Daten:`, error);
        }
      }
      
      console.log(''); // Leerzeile für bessere Lesbarkeit
    }
    
    console.log('Prüfung und Reparatur abgeschlossen.');
    
    // Teste das Abrufen eines Bildes
    const testLocationResult = await pool.query('SELECT id FROM locations LIMIT 1');
    
    if (testLocationResult.rows.length > 0) {
      const testId = testLocationResult.rows[0].id;
      console.log(`\nFübre Testabfrage für Ort #${testId} durch...`);
      
      const testImageResult = await pool.query('SELECT image_data, image_type FROM locations WHERE id = $1', [testId]);
      
      if (testImageResult.rows.length > 0 && testImageResult.rows[0].image_data) {
        const { image_data, image_type } = testImageResult.rows[0];
        console.log(`Bild gefunden! Länge: ${image_data.length} Zeichen, Typ: ${image_type}`);
        console.log(`Die ersten 100 Zeichen des Base64-Strings: ${image_data.substring(0, 100)}...`);
      } else {
        console.log('Kein Bild im Testergebnis gefunden.');
      }
    }
    
  } catch (error) {
    console.error('Fehler:', error);
  } finally {
    await pool.end();
    console.log('Datenbankverbindung geschlossen.');
  }
}

// Führe die Prüfung und Reparatur aus
checkAndFixImages();