// Funktion zum Anzeigen der Ortsdetails
function showLocationDetailFixed(locationId) {
  console.log("Zeige Details für Ort mit ID:", locationId);
  
  // Ort aus der Liste finden
  const location = locations.find(loc => loc.id === locationId);
  if (!location) {
    console.log("Ort nicht gefunden:", locationId);
    return;
  }
  
  // Detail-Container holen
  const locationDetail = document.getElementById("locationDetail");
  if (!locationDetail) {
    console.log("Detail-Container nicht gefunden");
    return;
  }
  
  // Details füllen
  document.getElementById("detailTitle").textContent = location.title || "Unbenannter Ort";
  document.getElementById("detailDescription").textContent = location.description || "Keine Beschreibung vorhanden.";
  
  // Bild mit Session-ID laden
  const sessionId = new URLSearchParams(window.location.search).get("sessionId");
  document.getElementById("detailImage").src = `/api/locations/${locationId}/image?sessionId=${sessionId}&t=${new Date().getTime()}`;
  
  // Als aktiven Ort merken
  window.activeLocationId = locationId;
  
  // Container anzeigen
  locationDetail.style.display = "block";
  
  // Karte auf den Ort zentrieren
  map.setView([location.latitude, location.longitude], 10);
}

// Überschreibe die globale Funktion
window.showLocationDetail = showLocationDetailFixed;

// Event-Listener hinzufügen
document.querySelectorAll(".location-item").forEach(item => {
  item.addEventListener("click", function() {
    const locationId = this.getAttribute("data-id");
    if (locationId) {
      showLocationDetailFixed(parseInt(locationId, 10));
    }
  });
});

// Schließen-Button einrichten
const detailClose = document.getElementById("detailClose");
if (detailClose) {
  detailClose.addEventListener("click", function() {
    document.getElementById("locationDetail").style.display = "none";
  });
}

console.log("Detailansicht-Fix installiert!");
