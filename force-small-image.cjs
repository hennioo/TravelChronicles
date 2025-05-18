// Script zum Erzwingen eines kleinen Bildes in der Datenbank
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Datenbank-Verbindung
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function createSmallTestImage() {
  try {
    console.log('Erstelle ein kleines Testbild...');
    
    // Erstelle ein einfaches, sehr kleines Bild (200x200 Pixel)
    const smallImageBuffer = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 242, g: 150, b: 12, alpha: 1 } // Orange
      }
    })
    .jpeg({ quality: 90 })
    .toBuffer();
    
    console.log(`Kleines Bild erstellt, Größe: ${smallImageBuffer.length} Bytes`);
    
    // Als Base64 konvertieren
    const base64Image = smallImageBuffer.toString('base64');
    console.log(`Base64-Größe: ${base64Image.length} Zeichen`);
    
    // Speichere in der Datenbank
    console.log('Lösche alle vorhandenen Orte...');
    await pool.query('DELETE FROM locations');
    
    console.log('Erstelle neuen Ort mit kleinem Testbild...');
    const result = await pool.query(
      'INSERT INTO locations (title, latitude, longitude, description, image_data, image_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      ['Kleines Testbild', 48.775846, 9.182932, 'Ein einfaches 200x200 Pixel Testbild', base64Image, 'image/jpeg']
    );
    
    console.log(`Neuer Ort mit ID ${result.rows[0].id} erstellt.`);
    console.log('Fertig. Logge dich ein und prüfe, ob das kleine Testbild angezeigt wird.');
    
  } catch (error) {
    console.error('Fehler:', error);
  } finally {
    await pool.end();
  }
}

createSmallTestImage();