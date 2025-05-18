// Erstellt ein winziges Bild und speichert es in der Datenbank
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

// Eine kleine 1x1 Pixel Base64-Grafik (orange Farbe)
const tinyImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function createTinyImage() {
  try {
    console.log('Erstelle einen neuen Ort mit winzigem Bild...');
    
    // Erstelle einen neuen Ort
    const result = await pool.query(
      'INSERT INTO locations (title, latitude, longitude, description, image_data, image_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      ['TINY TEST', 48.775846, 9.182932, 'Ein winziges 1x1 Pixel Bild', tinyImageBase64, 'image/png']
    );
    
    console.log(`Neuer Ort mit ID ${result.rows[0].id} erstellt und winziges Bild gespeichert.`);
    console.log('Das Bild ist nur 68 Bytes groß - das sollte definitiv funktionieren!');
  } catch (error) {
    console.error('Fehler:', error);
  } finally {
    await pool.end();
    console.log('Datenbankverbindung geschlossen.');
  }
}

// Führe den Test aus
createTinyImage();