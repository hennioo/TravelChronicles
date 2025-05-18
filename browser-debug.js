// === BROWSER-DEBUG-SCRIPT ===
// Kopiere diesen Code und führe ihn in der Browser-Konsole aus,
// nachdem du die Detailansicht eines Ortes geöffnet hast

// Hilfsfunktion zum Abrufen der Session ID
function getSessionId() {
  // Aus Cookie
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'sessionId') {
      return value;
    }
  }
  
  // Aus URL
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('sessionId');
}

// Aktueller Ort
const currentLocationId = prompt("Bitte gib die ID des aktuell angezeigten Ortes ein:");
if (!currentLocationId) {
  console.error("Keine Orts-ID angegeben");
  throw new Error("Keine Orts-ID angegeben");
}

const sessionId = getSessionId();
console.log(`Debug für Ort #${currentLocationId} mit Session ID: ${sessionId}`);

// Test 1: Direkte Bildanfrage
console.log("TEST 1: Direkte Bildanfrage");
fetch(`/api/locations/${currentLocationId}/image?sessionId=${sessionId}&t=${Date.now()}`)
  .then(response => {
    console.log("Antwort-Status:", response.status);
    console.log("Antwort-Headers:", Object.fromEntries([...response.headers]));
    return response.blob();
  })
  .then(blob => {
    console.log("Bild-Daten:", blob);
    
    // Bild anzeigen
    const img = document.createElement('img');
    img.src = URL.createObjectURL(blob);
    img.style.maxWidth = "300px";
    img.style.border = "2px solid green";
    document.body.appendChild(img);
    console.log("Test-Bild wurde zur Seite hinzugefügt (am Ende der Seite)");
  })
  .catch(error => {
    console.error("Fehler bei Test 1:", error);
  });

// Test 2: Base64-API
console.log("TEST 2: Base64-JSON-API");
fetch(`/api/locations/${currentLocationId}/image/base64?sessionId=${sessionId}&t=${Date.now()}`)
  .then(response => {
    console.log("Antwort-Status:", response.status);
    console.log("Antwort-Headers:", Object.fromEntries([...response.headers]));
    return response.json();
  })
  .then(data => {
    console.log("JSON-Antwort:", data);
    
    if (data.success && data.imageData) {
      // Bild anzeigen
      const img = document.createElement('img');
      img.src = `data:${data.imageType || 'image/jpeg'};base64,${data.imageData}`;
      img.style.maxWidth = "300px";
      img.style.border = "2px solid blue";
      document.body.appendChild(img);
      console.log("Base64-Bild wurde zur Seite hinzugefügt (am Ende der Seite)");
      
      // Versuch, das aktuelle Bild zu ersetzen
      const currentImg = document.querySelector('.detail-view img');
      if (currentImg) {
        console.log("Versuche, das angezeigte Bild zu ersetzen");
        const newSrc = `data:${data.imageType || 'image/jpeg'};base64,${data.imageData}`;
        currentImg.src = newSrc;
        
        // Zwangsaktualisierung
        currentImg.style.display = 'none';
        setTimeout(() => {
          currentImg.style.display = '';
          console.log("Bild in der Detailansicht wurde ersetzt");
        }, 100);
      }
    } else {
      console.error("Keine Bilddaten in der JSON-Antwort gefunden");
    }
  })
  .catch(error => {
    console.error("Fehler bei Test 2:", error);
  });

// Test 3: Analyse des aktuellen Bilds
console.log("TEST 3: Analyse des aktuellen Bilds");
const currentImg = document.querySelector('.detail-view img');
if (currentImg) {
  console.log("Aktuelles Bild:", currentImg);
  console.log("Bild-URL:", currentImg.src);
  console.log("Bild-Alt:", currentImg.alt);
  console.log("Bild-Style:", currentImg.style.cssText);
  
  // Überprüfe, ob das Bild erfolgreich geladen wurde
  if (currentImg.complete) {
    console.log("Bild wurde bereits geladen");
    console.log("Natürliche Größe:", currentImg.naturalWidth, "x", currentImg.naturalHeight);
    console.log("Angezeigte Größe:", currentImg.offsetWidth, "x", currentImg.offsetHeight);
  } else {
    console.log("Bild wird noch geladen");
    currentImg.onload = () => {
      console.log("Bild wurde geladen");
      console.log("Natürliche Größe:", currentImg.naturalWidth, "x", currentImg.naturalHeight);
      console.log("Angezeigte Größe:", currentImg.offsetWidth, "x", currentImg.offsetHeight);
    };
    currentImg.onerror = () => {
      console.error("Fehler beim Laden des Bildes");
    };
  }
} else {
  console.error("Kein Bild in der Detailansicht gefunden");
}

// Ausgabe
console.log("DEBUG ABGESCHLOSSEN");
console.log("Am Ende der Seite sollten zwei Test-Bilder angezeigt werden, falls die Anfragen erfolgreich waren.")