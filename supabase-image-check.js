import { Pool } from 'pg';
import fs from 'fs';

// Einfaches Diagnoseprogramm, das direkt mit Supabase kommuniziert
async function diagnoseImages() {
  console.log('🔍 Starte Supabase Bild-Diagnose');
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL nicht gesetzt - kann nicht mit Supabase verbinden');
    return;
  }
  
  // Pool mit SSL-Option (für Supabase notwendig)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Wichtig für Supabase
    }
  });
  
  try {
    // Verbindung testen
    const client = await pool.connect();
    console.log('✅ Verbindung zu Supabase hergestellt');
    
    // Locations-Tabelle prüfen
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'locations'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ Tabelle "locations" existiert nicht!');
      client.release();
      return;
    }
    
    console.log('✅ Tabelle "locations" gefunden');
    
    // Anzahl der Bilder in der Tabelle
    const countResult = await client.query('SELECT COUNT(*) FROM locations');
    console.log(`✅ Anzahl Einträge in locations: ${countResult.rows[0].count}`);
    
    // Bilder mit image-Feld
    const imageCountResult = await client.query('SELECT COUNT(*) FROM locations WHERE image IS NOT NULL');
    console.log(`✅ Anzahl Einträge mit Bildern: ${imageCountResult.rows[0].count}`);
    
    if (parseInt(imageCountResult.rows[0].count) === 0) {
      console.log('⚠️ Keine Bilder in der Datenbank gefunden!');
      client.release();
      return;
    }
    
    // Ein Beispielbild abrufen
    const sampleResult = await client.query(`
      SELECT id, title, image, image_type 
      FROM locations 
      WHERE image IS NOT NULL 
      LIMIT 1
    `);
    
    if (sampleResult.rows.length === 0) {
      console.log('❌ Konnte kein Beispielbild finden');
      client.release();
      return;
    }
    
    const sample = sampleResult.rows[0];
    console.log(`✅ Beispielbild gefunden: ID ${sample.id}, Titel: ${sample.title}`);
    console.log(`   Bild-Typ: ${sample.image_type || 'unbekannt'}`);
    console.log(`   Base64-Länge: ${sample.image ? sample.image.length : 0} Zeichen`);
    
    // Versuchen, das Bild zu dekodieren
    if (sample.image) {
      try {
        const imageBuffer = Buffer.from(sample.image, 'base64');
        console.log(`✅ Bild erfolgreich als Buffer dekodiert: ${imageBuffer.length} Bytes`);
        
        // Prüfen, ob es wie ein JPEG aussieht
        if (imageBuffer.length > 2 && imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) {
          console.log('✅ Das Bild hat einen gültigen JPEG-Header');
        } else {
          console.log('⚠️ Das Bild hat keinen JPEG-Header - erste Bytes:', 
            Array.from(imageBuffer.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' '));
        }
        
        // Bild zur Überprüfung speichern
        fs.writeFileSync('test-image.jpg', imageBuffer);
        console.log('✅ Bild als test-image.jpg gespeichert - bitte prüfen, ob es angezeigt werden kann');
      } catch (err) {
        console.error('❌ Fehler beim Dekodieren des Bildes:', err);
      }
    }
    
    // Verbindung beenden
    client.release();
    
  } catch (err) {
    console.error('❌ Fehler bei der Diagnose:', err);
  } finally {
    pool.end();
  }
}

// Ausführen
diagnoseImages();