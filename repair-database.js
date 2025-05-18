import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// Skript zur Reparatur der fehlenden Bilder in der Datenbank
async function repairDatabase() {
  console.log('🛠️ Starte Datenbank-Reparatur...');
  
  // Datenbankverbindung
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  try {
    // Verbindung testen
    const client = await pool.connect();
    console.log('✅ Verbindung zur Datenbank hergestellt');
    
    // Alle Orte abrufen, die repariert werden müssen
    const result = await client.query(`
      SELECT id, title 
      FROM locations 
      WHERE image IS NULL OR image = ''
    `);
    
    console.log(`ℹ️ ${result.rows.length} Orte ohne Bilder gefunden`);
    
    if (result.rows.length === 0) {
      console.log('✅ Keine Orte zum Reparieren - Datenbank ist in gutem Zustand');
      client.release();
      return;
    }
    
    // Testbild finden
    let testImagePath;
    const possiblePaths = [
      'animal-eye-staring-close-up-watch-nature-generative-ai.jpg',
      'compressed-eye.jpg',
      'test-image.jpg'
    ];
    
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        testImagePath = p;
        break;
      }
    }
    
    if (!testImagePath) {
      console.error('❌ Kein Testbild gefunden!');
      client.release();
      return;
    }
    
    console.log(`✅ Verwende Testbild: ${testImagePath}`);
    
    // Bild in Base64 konvertieren
    const imageBuffer = fs.readFileSync(testImagePath);
    const imageBase64 = imageBuffer.toString('base64');
    
    // Für jeden Ort das Bild einfügen
    let successCount = 0;
    
    for (const location of result.rows) {
      console.log(`🔄 Repariere Ort ID ${location.id}: ${location.title}...`);
      
      const updateResult = await client.query(`
        UPDATE locations 
        SET image = $1, image_type = $2 
        WHERE id = $3
        RETURNING id
      `, [imageBase64, 'image/jpeg', location.id]);
      
      if (updateResult.rows.length > 0) {
        console.log(`✅ Ort ID ${location.id} erfolgreich repariert`);
        successCount++;
      } else {
        console.log(`❌ Fehler beim Reparieren von Ort ID ${location.id}`);
      }
    }
    
    console.log(`\n==========================`);
    console.log(`✅ Reparatur abgeschlossen!`);
    console.log(`✅ ${successCount} von ${result.rows.length} Orten repariert`);
    
    // Kontrolle
    const checkResult = await client.query(`
      SELECT COUNT(*) 
      FROM locations 
      WHERE image IS NOT NULL AND image != ''
    `);
    
    console.log(`✅ Insgesamt ${checkResult.rows[0].count} Orte mit Bildern in der Datenbank`);
    
    client.release();
    
  } catch (err) {
    console.error('❌ Fehler bei der Datenbank-Reparatur:', err);
  } finally {
    pool.end();
  }
}

// Ausführen
repairDatabase();