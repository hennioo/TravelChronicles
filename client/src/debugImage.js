// Debug-Skript zur direkten Untersuchung des Bildproblems in der Browserkonsole
// Speichere diese Datei und importiere sie in LocationImage.tsx oder kopiere den Code direkt in die Browserkonsole

export function debugImage(locationId) {
  // Den Test-Endpunkt zum Überprüfen der grundsätzlichen Bildfunktionalität aufrufen
  console.log("Teste den /api/test-image Endpunkt...");
  fetch(`/api/test-image?${new Date().getTime()}`)
    .then(response => {
      console.log("Test-Image Status:", response.status);
      return response.json();
    })
    .then(data => {
      console.log("Test-Image Antwort:", {
        success: data.success,
        imageType: data.imageType,
        imageDataLength: data.imageData?.length || 0
      });
      
      if (data.success && data.imageData) {
        console.log("Test-Image scheint zu funktionieren.");
        // Versuche, das Testbild auf der Seite anzuzeigen
        const testDiv = document.createElement('div');
        testDiv.style.position = 'fixed';
        testDiv.style.top = '10px';
        testDiv.style.left = '10px';
        testDiv.style.width = '100px';
        testDiv.style.height = '100px';
        testDiv.style.zIndex = '10000';
        testDiv.style.border = '3px solid green';
        testDiv.style.backgroundImage = `url(data:${data.imageType || 'image/jpeg'};base64,${data.imageData})`;
        testDiv.style.backgroundSize = 'cover';
        testDiv.style.backgroundPosition = 'center';
        document.body.appendChild(testDiv);
        console.log("Test-Bild eingefügt (grüner Rahmen)");
      }
    })
    .catch(err => {
      console.error("Test-Image Fehler:", err);
    });
  
  // Echtes Bild für die angegebene Location abrufen
  if (locationId) {
    console.log(`Teste den /api/locations/${locationId}/image Endpunkt...`);
    fetch(`/api/locations/${locationId}/image?${new Date().getTime()}`)
      .then(response => {
        console.log("Location-Image Status:", response.status);
        return response.json();
      })
      .then(data => {
        console.log("Location-Image Antwort:", {
          success: data.success,
          imageType: data.imageType,
          imageDataLength: data.imageData?.length || 0
        });
        
        if (data.success && data.imageData) {
          console.log("Location-Image scheint zu funktionieren.");
          // Versuche, das echte Bild auf der Seite anzuzeigen
          const locationDiv = document.createElement('div');
          locationDiv.style.position = 'fixed';
          locationDiv.style.top = '120px';
          locationDiv.style.left = '10px';
          locationDiv.style.width = '100px';
          locationDiv.style.height = '100px';
          locationDiv.style.zIndex = '10000';
          locationDiv.style.border = '3px solid blue';
          locationDiv.style.backgroundImage = `url(data:${data.imageType || 'image/jpeg'};base64,${data.imageData})`;
          locationDiv.style.backgroundSize = 'cover';
          locationDiv.style.backgroundPosition = 'center';
          document.body.appendChild(locationDiv);
          console.log("Location-Bild eingefügt (blauer Rahmen)");
        }
      })
      .catch(err => {
        console.error("Location-Image Fehler:", err);
      });
  }
}

// exportiere Funktion für direkten Aufruf in der Komponente
export default debugImage;