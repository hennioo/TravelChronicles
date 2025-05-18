import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// Einfaches Skript zum Testen des Bild-Uploads nach Supabase
async function uploadTestImage() {
  console.log('🔄 Starte Test-Bild-Upload nach Supabase');
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL nicht gesetzt');
    return;
  }
  
  // Pool mit SSL-Option für Supabase
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  try {
    // Verbindung testen
    const client = await pool.connect();
    console.log('✅ Verbindung zu Supabase hergestellt');
    
    // Test-Bild laden (wir verwenden ein einfaches Beispielbild aus dem Projekt)
    let testImagePath;
    
    // Verschiedene mögliche Pfade für Testbilder
    const possiblePaths = [
      'animal-eye-staring-close-up-watch-nature-generative-ai.jpg',
      'compressed-eye.jpg',
      'public/favicon.ico',
      'attached_assets/image_1747570164149.png'
    ];
    
    // Ersten existierenden Pfad finden
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        testImagePath = p;
        break;
      }
    }
    
    if (!testImagePath) {
      console.error('❌ Kein Testbild gefunden! Bitte lege ein Bild im Projektverzeichnis ab.');
      client.release();
      return;
    }
    
    console.log(`✅ Testbild gefunden: ${testImagePath}`);
    
    // Bild lesen und in Base64 konvertieren
    const imageBuffer = fs.readFileSync(testImagePath);
    const imageBase64 = imageBuffer.toString('base64');
    
    // MIME-Typ basierend auf Dateiendung bestimmen
    const extension = path.extname(testImagePath).toLowerCase();
    let mimeType;
    
    switch (extension) {
      case '.jpg':
      case '.jpeg':
        mimeType = 'image/jpeg';
        break;
      case '.png':
        mimeType = 'image/png';
        break;
      case '.gif':
        mimeType = 'image/gif';
        break;
      case '.ico':
        mimeType = 'image/x-icon';
        break;
      default:
        mimeType = 'application/octet-stream';
    }
    
    console.log(`✅ Bild in Base64 konvertiert: ${imageBase64.length} Zeichen`);
    console.log(`✅ MIME-Typ: ${mimeType}`);
    
    // In die Datenbank einfügen
    const result = await client.query(`
      INSERT INTO locations (title, description, latitude, longitude, image, image_type, created_at) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      'Automatischer Testort',
      'Dieser Ort wurde automatisch zur Diagnose erstellt',
      48.1351, // München
      11.5820,
      imageBase64,
      mimeType,
      new Date()
    ]);
    
    if (result.rows.length > 0) {
      const newId = result.rows[0].id;
      console.log(`✅ Testort mit ID ${newId} und Bild erfolgreich eingefügt!`);
      
      // Kontrollabfrage
      const checkResult = await client.query('SELECT id, title, image_type FROM locations WHERE id = $1', [newId]);
      
      if (checkResult.rows.length > 0) {
        const savedRow = checkResult.rows[0];
        console.log(`✅ Kontrolle: Ort ${savedRow.id} (${savedRow.title}) mit Bild-Typ ${savedRow.image_type} gefunden`);
        
        // Prüfen, ob das Bild-Feld gefüllt ist
        const imageCheck = await client.query('SELECT image FROM locations WHERE id = $1', [newId]);
        
        if (imageCheck.rows[0].image) {
          console.log(`✅ Bild ist in der Datenbank gespeichert (${imageCheck.rows[0].image.length} Zeichen)`);
        } else {
          console.log(`❌ Das Bild wurde NICHT korrekt gespeichert!`);
        }
      }
    } else {
      console.log('❌ Fehler beim Einfügen des Testorts!');
    }
    
    // Verbindung beenden
    client.release();
    
  } catch (err) {
    console.error('❌ Fehler beim Testbild-Upload:', err);
  } finally {
    pool.end();
  }
}

// Ausführen
uploadTestImage();