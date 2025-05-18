// Einfacher Fix, den du in die Browser-Konsole einfügen kannst

(function() {
  // Verbesserte Show-Detail-Funktion
  function showLocationDetailFixed(locationId) {
    console.log("Zeige Details für Ort:", locationId);
    
    // Ort finden
    const location = window.locations.find(loc => loc.id == locationId);
    if (!location) {
      console.log("Ort nicht gefunden");
      return;
    }

    // Session ID bekommen
    const sessionId = new URLSearchParams(window.location.search).get('sessionId');
    
    // Detail-Element holen
    const detail = document.getElementById('locationDetail');
    const title = document.getElementById('detailTitle');
    const image = document.getElementById('detailImage');
    const description = document.getElementById('detailDescription');
    
    // Detail-Container anpassen
    detail.style.position = "fixed";
    detail.style.top = "50%";
    detail.style.left = "50%";
    detail.style.transform = "translate(-50%, -50%)";
    detail.style.width = "90%";
    detail.style.maxWidth = "400px";
    detail.style.backgroundColor = "#222";
    detail.style.padding = "20px";
    detail.style.borderRadius = "10px";
    detail.style.zIndex = "9999";
    detail.style.boxShadow = "0 5px 15px rgba(0,0,0,0.5)";
    
    // Details setzen
    title.textContent = location.title || "Unbenannter Ort";
    description.textContent = location.description || "Keine Beschreibung";
    image.src = `/api/locations/${location.id}/image?sessionId=${sessionId}&t=${Date.now()}`;
    
    // Anzeigen
    detail.style.display = "block";
    
    // X-Button zum Schließen
    const closeBtn = document.getElementById('detailClose');
    if (closeBtn) {
      closeBtn.onclick = function() {
        detail.style.display = "none";
      };
    }
    
    console.log("Detail-Fenster sollte jetzt sichtbar sein");
  }
  
  // Funktion ersetzen
  window.showLocationDetail = showLocationDetailFixed;
  
  // Event-Listener für alle Marker hinzufügen
  document.querySelectorAll('.leaflet-marker-icon').forEach(marker => {
    marker.addEventListener('click', function(e) {
      // LocationId aus dem Marker extrahieren
      const markerImg = e.target;
      const locationId = markerImg.src.match(/marker-icon/);
      if (locationId) {
        showLocationDetailFixed(locationId[1]);
      }
    });
  });
  
  // Liste der Orte ansehen
  console.log("Verfügbare Orte:", window.locations);
  
  // Bei jedem Klick auf die Karte prüfen, ob der Marker geklickt wurde
  document.querySelector('#map').addEventListener('click', function(e) {
    if (e.target.classList.contains('leaflet-marker-icon')) {
      const markerId = e.target.src.match(/marker-icon/);
      if (markerId) {
        showLocationDetailFixed(markerId[1]);
      }
    }
  });
  
  // Direkter Klick auf einen Ort in der Seitenleiste
  document.querySelectorAll('.location-item').forEach(item => {
    item.addEventListener('click', function() {
      const locationId = this.dataset.id;
      if (locationId) {
        showLocationDetailFixed(locationId);
      }
    });
  });
  
  alert("Fix für Detailansicht aktiviert! Du kannst jetzt auf Orte klicken.");
})();
