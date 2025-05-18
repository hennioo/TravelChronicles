import fetch from 'node-fetch';

// Die Render-URL
const RENDER_URL = 'https://susio.onrender.com';

// Test-Funktion
async function testRenderImages() {
  console.log('Starte Test für Bilder auf Render');
  
  try {
    // Test 1: Hauptseite abrufen
    console.log('\n--- Test 1: Hauptseite ---');
    const homepageResponse = await fetch(`${RENDER_URL}/`);
    const homepageStatus = homepageResponse.status;
    const homepageText = await homepageResponse.text();
    console.log(`Hauptseite Status: ${homepageStatus}`);
    console.log(`Hauptseite Länge: ${homepageText.length} Zeichen`);
    
    // Test 2: Bild direkt abrufen
    console.log('\n--- Test 2: Direktes Bild ---');
    const imageResponse = await fetch(`${RENDER_URL}/bild/26`);
    const imageStatus = imageResponse.status;
    const imageType = imageResponse.headers.get('content-type');
    
    console.log(`Bild Status: ${imageStatus}`);
    console.log(`Bild Content-Type: ${imageType}`);
    
    if (imageStatus === 200) {
      const imageBuffer = await imageResponse.buffer();
      console.log(`Bild-Größe: ${imageBuffer.length} Bytes`);
      console.log(`Erste 20 Bytes: ${Array.from(imageBuffer.slice(0, 20))}`);
      
      // Prüfen ob es ein JPEG ist (beginnt mit FF D8)
      if (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) {
        console.log('✅ Das Bild ist ein gültiges JPEG');
      } else if (imageBuffer.toString().startsWith('<!DOCTYPE')) {
        console.log('❌ Die Antwort ist HTML, nicht ein Bild');
        console.log(`Antwort-Anfang: ${imageBuffer.toString().slice(0, 100)}...`);
      } else {
        console.log('⚠️ Unbekanntes Format');
      }
    }
    
    // Test 3: Base64-JSON Format
    console.log('\n--- Test 3: JSON/Base64 Format ---');
    const jsonResponse = await fetch(`${RENDER_URL}/base64-json/26`);
    const jsonStatus = jsonResponse.status;
    console.log(`JSON Status: ${jsonStatus}`);
    
    if (jsonStatus === 200) {
      const jsonData = await jsonResponse.json();
      console.log('JSON-Antwort erhalten:');
      console.log(`- Erfolg: ${jsonData.success}`);
      console.log(`- Bild-Typ: ${jsonData.imageType}`);
      console.log(`- Base64-Länge: ${jsonData.imageData?.length || 0}`);
      
      if (jsonData.imageData) {
        // Versuchen, Base64 zu dekodieren
        try {
          const buffer = Buffer.from(jsonData.imageData, 'base64');
          console.log(`✅ Base64 erfolgreich dekodiert (${buffer.length} Bytes)`);
        } catch (err) {
          console.log(`❌ Fehler beim Dekodieren von Base64: ${err.message}`);
        }
      }
    }
    
  } catch (err) {
    console.error('Fehler beim Testen:', err);
  }
}

// Tests ausführen
testRenderImages();