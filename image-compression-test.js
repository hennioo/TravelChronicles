import { Pool } from 'pg';
import fs from 'fs';
import sharp from 'sharp';

// Test für Bild-Kompression und Upload
async function testImageCompression() {
  console.log('🖼️ Starte Bild-Kompressions-Test...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  try {
    // Verbindung herstellen
    const client = await pool.connect();
    console.log('✅ Datenbankverbindung hergestellt');
    
    // Testbild von ID 26 holen
    const result = await client.query('SELECT image, image_type FROM locations WHERE id = 26');
    
    if (result.rows.length === 0 || !result.rows[0].image) {
      console.log('❌ Testbild nicht gefunden');
      client.release();
      return;
    }
    
    const originalImage = result.rows[0].image;
    const imageType = result.rows[0].image_type;
    
    console.log(`✅ Original-Bild geladen: ${formatBytes(originalImage.length)}, Typ: ${imageType}`);
    
    // Bild dekodieren und mit Sharp verarbeiten
    const imageBuffer = Buffer.from(originalImage, 'base64');
    fs.writeFileSync('original-image.jpg', imageBuffer);
    console.log(`✅ Original-Bild gespeichert: ${formatBytes(imageBuffer.length)}`);
    
    // Bild komprimieren mit verschiedenen Qualitätsstufen
    const compressionLevels = [80, 60, 40];
    const compressedVersions = [];
    
    for (const quality of compressionLevels) {
      console.log(`\nKomprimiere Bild mit Qualität ${quality}...`);
      
      try {
        // Mit Sharp komprimieren
        const compressed = await sharp(imageBuffer)
          .jpeg({ quality: quality, mozjpeg: true })
          .toBuffer();
        
        const filename = `compressed-${quality}.jpg`;
        fs.writeFileSync(filename, compressed);
        
        const compressionRatio = ((1 - compressed.length / imageBuffer.length) * 100).toFixed(2);
        console.log(`✅ Komprimiertes Bild (${quality}%): ${formatBytes(compressed.length)} (${compressionRatio}% kleiner)`);
        console.log(`✅ Gespeichert als: ${filename}`);
        
        // Als Base64 konvertieren
        const base64 = compressed.toString('base64');
        
        compressedVersions.push({
          quality,
          size: compressed.length,
          base64Length: base64.length,
          filename,
          base64: base64
        });
      } catch (err) {
        console.error(`❌ Fehler bei Kompression mit Qualität ${quality}:`, err);
      }
    }
    
    // Besten Kompromiss finden (60% Qualität ist oft gut)
    const bestVersion = compressedVersions.find(v => v.quality === 60);
    
    if (bestVersion) {
      console.log(`\nSpeichere komprimierte Version in Datenbank...`);
      
      // Erstelle einen neuen Eintrag mit dem komprimierten Bild
      const insertResult = await client.query(`
        INSERT INTO locations (title, description, latitude, longitude, image, image_type, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        'Komprimiertes Testbild',
        'Automatisch komprimiert auf 60% Qualität',
        48.1351,
        11.5820,
        bestVersion.base64,
        'image/jpeg',
        new Date()
      ]);
      
      if (insertResult.rows.length > 0) {
        const newId = insertResult.rows[0].id;
        console.log(`✅ Komprimiertes Bild als neuen Ort mit ID ${newId} gespeichert`);
        console.log(`✅ Originalgröße: ${formatBytes(imageBuffer.length)}`);
        console.log(`✅ Komprimierte Größe: ${formatBytes(bestVersion.size)} (${((1 - bestVersion.size / imageBuffer.length) * 100).toFixed(2)}% kleiner)`);
      }
    }
    
    client.release();
    
  } catch (err) {
    console.error('❌ Fehler beim Kompressionstest:', err);
  } finally {
    pool.end();
  }
  
  console.log('\n✅ Kompressionstest abgeschlossen');
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
testImageCompression();