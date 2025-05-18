import { Pool } from 'pg';
import fetch from 'node-fetch';
import fs from 'fs';

// Umfassender Test für die Bild-Handhabung
async function runComprehensiveImageTests() {
  console.log('🧪 Starte umfassende Bild-Tests...');
  
  // Verbindung zur Datenbank herstellen
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  try {
    // Test 1: Datenbankverbindung
    console.log('\n-- Test 1: Datenbankverbindung --');
    const client = await pool.connect();
    console.log('✅ Datenbankverbindung hergestellt');
    
    // Test 2: Alle verfügbaren Bilder prüfen
    console.log('\n-- Test 2: Verfügbare Bilder --');
    const imagesQuery = await client.query(`
      SELECT id, title, image_type, LENGTH(image) as image_size
      FROM locations
      WHERE image IS NOT NULL
      ORDER BY id
    `);
    
    if (imagesQuery.rows.length === 0) {
      console.log('❌ Keine Bilder in der Datenbank gefunden!');
      client.release();
      return;
    }
    
    console.log(`✅ ${imagesQuery.rows.length} Bilder in der Datenbank gefunden:`);
    
    for (const img of imagesQuery.rows) {
      console.log(`   - ID ${img.id}: ${img.title} (${img.image_type}, ${formatBytes(img.image_size)})`);
    }
    
    // Test 3: Stichprobenartig Bilder herunterladen
    console.log('\n-- Test 3: Bild-Download-Test --');
    
    const testServer = 'http://localhost:3000'; // Lokaler Test-Server (falls läuft)
    const testIds = imagesQuery.rows.map(row => row.id);
    
    console.log(`Teste Zugriff auf ${testIds.length} Bilder...`);
    
    // Einzelbild-Prüfung mit detaillierter Analyse
    async function checkImage(id) {
      console.log(`\nPrüfe Bild ${id}...`);
      
      // Direkt aus Datenbank holen
      const directResult = await client.query(`
        SELECT image, image_type 
        FROM locations 
        WHERE id = $1
      `, [id]);
      
      if (directResult.rows.length === 0 || !directResult.rows[0].image) {
        console.log(`❌ Bild ${id} nicht in Datenbank gefunden!`);
        return false;
      }
      
      const imageBase64 = directResult.rows[0].image;
      const imageType = directResult.rows[0].image_type;
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      
      console.log(`✅ Bild ${id} direkt aus DB: ${formatBytes(imageBuffer.length)}, Typ: ${imageType}`);
      
      // Prüfen, ob es ein gültiges Bild ist
      if (imageBuffer.length > 2) {
        if (imageType.includes('jpeg') && imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) {
          console.log(`✅ Bild ${id} hat gültigen JPEG-Header`);
        } else if (imageType.includes('png') && imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
          console.log(`✅ Bild ${id} hat gültigen PNG-Header`);
        } else {
          console.log(`⚠️ Bild ${id} hat unbekannten Header: ${imageBuffer.slice(0, 4).toString('hex')}`);
        }
      }
      
      // Für weitere Analyse das Bild speichern
      const testFilename = `test-image-${id}.jpg`;
      fs.writeFileSync(testFilename, imageBuffer);
      console.log(`✅ Bild ${id} wurde als ${testFilename} gespeichert`);
      
      return true;
    }
    
    // Tests für alle gefundenen Bilder
    let successCount = 0;
    for (const id of testIds) {
      const success = await checkImage(id);
      if (success) successCount++;
    }
    
    console.log(`\n✅ ${successCount} von ${testIds.length} Bildern erfolgreich geprüft`);
    
    // Verbindung trennen
    client.release();
    pool.end();
    
    console.log('\n🏆 Alle Tests abgeschlossen!');
    
  } catch (err) {
    console.error('❌ Fehler bei den Tests:', err);
  }
}

// Hilfsfunktion zur Formatierung der Bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Ausführen
runComprehensiveImageTests();