/**
 * Fix für die Detailansicht von Orten im Susibert-Reisekarte-Projekt
 * 
 * Dieses Skript erstellt eine neue HTML-Struktur für die Detailansicht
 * mit verbesserten Styling-Eigenschaften und garantierter Sichtbarkeit.
 * 
 * Hinweis: Die Datei muss in das Haupt-HTML als Skript eingebunden werden.
 */

// Funktion zur Anzeige der Ort-Details
function showLocationDetailFixed(locationId) {
  console.log('Zeige Details für Ort:', locationId);
  
  // Lokale Variablen
  const sessionId = new URLSearchParams(window.location.search).get('sessionId');
  
  // Finde den entsprechenden Ort
  const location = window.locations.find(loc => loc.id === locationId);
  if (!location) {
    console.error('Ort mit ID ' + locationId + ' nicht gefunden');
    return;
  }
  
  // Entferne vorhandene Detailansicht falls vorhanden
  removeExistingDetailView();
  
  // Erstelle neues Detailfenster
  const detailView = document.createElement('div');
  detailView.id = 'locationDetailFixed';
  detailView.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 450px;
    background-color: #222;
    color: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 0 20px rgba(0,0,0,0.5);
    z-index: 9999;
    display: flex;
    flex-direction: column;
  `;
  
  // Header mit Titel und Schließen-Button
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
  `;
  
  const title = document.createElement('h3');
  title.textContent = location.title || 'Unbenannter Ort';
  title.style.cssText = `
    margin: 0;
    color: #fff;
    font-size: 18px;
  `;
  
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '&times;';
  closeButton.style.cssText = `
    background: none;
    border: none;
    color: white;
    font-size: 24px;
    cursor: pointer;
    padding: 0 5px;
  `;
  closeButton.onclick = removeExistingDetailView;
  
  header.appendChild(title);
  header.appendChild(closeButton);
  
  // Bild
  const image = document.createElement('img');
  image.src = `/api/locations/${locationId}/image?sessionId=${sessionId}&t=${Date.now()}`;
  image.alt = location.title || 'Ortsbild';
  image.style.cssText = `
    width: 100%;
    max-height: 300px;
    object-fit: cover;
    border-radius: 4px;
    margin-bottom: 15px;
  `;
  image.onerror = function() {
    image.src = '/uploads/couple.jpg';
    console.error('Fehler beim Laden des Bildes');
  };
  
  // Beschreibung
  const description = document.createElement('div');
  description.textContent = location.description || 'Keine Beschreibung vorhanden.';
  description.style.cssText = `
    margin-bottom: 15px;
    line-height: 1.4;
  `;
  
  // Löschen-Button
  const deleteButton = document.createElement('button');
  deleteButton.textContent = 'Löschen';
  deleteButton.style.cssText = `
    background-color: #e74c3c;
    color: white;
    border: none;
    padding: 8px 15px;
    border-radius: 4px;
    cursor: pointer;
    align-self: flex-start;
    margin-top: 10px;
  `;
  deleteButton.onclick = function() {
    if (confirm('Ort wirklich löschen?')) {
      window.location.href = `/delete-location?id=${locationId}&sessionId=${sessionId}`;
    }
  };
  
  // Alles zusammenfügen
  detailView.appendChild(header);
  detailView.appendChild(image);
  detailView.appendChild(description);
  detailView.appendChild(deleteButton);
  
  // Zum Body hinzufügen
  document.body.appendChild(detailView);
  
  console.log('Detailansicht sollte jetzt sichtbar sein');
}

// Hilfsfunktion um bestehende Detailansicht zu entfernen
function removeExistingDetailView() {
  const existingDetail = document.getElementById('locationDetailFixed');
  if (existingDetail) {
    existingDetail.remove();
  }
}

// Original-Funktion ersetzen
window.originalShowLocationDetail = window.showLocationDetail;
window.showLocationDetail = showLocationDetailFixed;

console.log('Detailansicht-Fix wurde geladen');