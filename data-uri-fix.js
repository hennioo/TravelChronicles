// Füge diese Funktion in deine map.html ein, um die Bilder als Data-URI direkt im HTML anzuzeigen

document.addEventListener('DOMContentLoaded', function() {
  // Ursprüngliche Funktion zum Anzeigen der Detailansicht überschreiben
  window.showLocationDetail = function(location) {
    selectedLocation = location;
    
    const detailTitleEl = document.getElementById('detailTitle');
    const detailContentEl = document.getElementById('detailContent');
    const overlayEl = document.getElementById('overlay');
    const detailViewEl = document.getElementById('detailView');
    
    detailTitleEl.textContent = location.title;
    
    // Basis-HTML für die Detailansicht
    detailContentEl.innerHTML = `
      <div id="imageLoadingContainer" style="width: 100%; height: 300px; background-color: #222; display: flex; justify-content: center; align-items: center; border-radius: 4px; margin-bottom: 15px;">
        <div>Bild wird geladen...</div>
      </div>
      <div>${location.description || 'Keine Beschreibung vorhanden.'}</div>
      <div class="form-actions" style="margin-top: 20px;">
        <button id="deleteLocationBtn" class="btn delete-btn">Löschen</button>
      </div>
    `;
    
    // Bild direkt als Base64 vom Server abrufen
    fetch(`/api/locations/${location.id}/image/base64?sessionId=${sessionId}&t=${Date.now()}`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Bild konnte nicht geladen werden');
        }
        return response.json();
      })
      .then(data => {
        if (data.success && data.imageData) {
          const imageContainer = document.getElementById('imageLoadingContainer');
          
          const img = document.createElement('img');
          img.src = `data:${data.imageType || 'image/jpeg'};base64,${data.imageData}`;
          img.alt = location.title;
          img.style.width = '100%';
          img.style.maxHeight = '300px';
          img.style.objectFit = 'cover';
          img.style.borderRadius = '4px';
          
          // Bild in Container einfügen
          imageContainer.innerHTML = '';
          imageContainer.appendChild(img);
        } else {
          // Fallback zum Pärchenbild
          document.getElementById('imageLoadingContainer').innerHTML = `
            <img src="/uploads/couple.jpg" alt="Pärchenbild" style="width: 100%; max-height: 300px; object-fit: cover; border-radius: 4px;">
          `;
        }
      })
      .catch(error => {
        console.error('Fehler beim Laden des Bildes:', error);
        // Fallback zum Pärchenbild
        document.getElementById('imageLoadingContainer').innerHTML = `
          <img src="/uploads/couple.jpg" alt="Pärchenbild" style="width: 100%; max-height: 300px; object-fit: cover; border-radius: 4px;">
        `;
      });
    
    // EventListener für Lösch-Button
    document.getElementById('deleteLocationBtn').addEventListener('click', function() {
      deleteLocation(location.id);
    });
    
    // Detail-Ansicht anzeigen
    overlayEl.style.display = 'block';
    detailViewEl.style.display = 'block';
  };
});