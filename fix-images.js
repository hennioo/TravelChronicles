// Skript zur Migration von Bildern in der Datenbank
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

async function migrateImages() {
  console.log('Starte Migration der Bilder...');
  
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
    }
    
    // Hole alle Orte, die einen Bildpfad haben, aber keine Bilddaten
    const locations = await pool.query(`
      SELECT id, image, image_type FROM locations 
      WHERE image IS NOT NULL AND (image_data IS NULL OR image_data = '')
    `);
    
    console.log(`${locations.rows.length} Orte mit Bildern gefunden, die migriert werden müssen`);
    
    for (const location of locations.rows) {
      try {
        console.log(`Migriere Bild für Ort ${location.id}...`);
        
        const imagePath = location.image;
        
        // Wenn der Pfad nicht existiert, überspringe
        if (!imagePath || !fs.existsSync(imagePath)) {
          console.log(`- Bildpfad nicht gefunden: ${imagePath}`);
          continue;
        }
        
        // Bild als Base64 einlesen
        const imageData = fs.readFileSync(imagePath, { encoding: 'base64' });
        
        // In die Datenbank aktualisieren
        await pool.query(
          'UPDATE locations SET image_data = $1 WHERE id = $2',
          [imageData, location.id]
        );
        
        console.log(`- Bild für Ort ${location.id} erfolgreich migriert`);
      } catch (error) {
        console.error(`Fehler bei der Migration von Ort ${location.id}:`, error);
      }
    }
    
    console.log('Migration abgeschlossen!');
  } catch (error) {
    console.error('Fehler bei der Migration:', error);
  } finally {
    await pool.end();
  }
}

// Migrations-Funktion ausführen
migrateImages();