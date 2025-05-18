// Script für eine verbesserte Bilddarstellung
document.addEventListener('DOMContentLoaded', function() {
  // Funktionalität zum Anzeigen der Detailansicht für einen Ort
  window.showLocationDetail = function(locationId) {
    console.log('[DEBUG] Detailansicht für Ort:', locationId);
    
    // Bestehende Detailansicht entfernen, falls vorhanden
    const existingDetail = document.querySelector('.detail-view');
    if (existingDetail) {
      existingDetail.remove();
    }
    
    // Lösche auch alle .debug-image-container, falls vorhanden
    const debugContainers = document.querySelectorAll('.debug-image-container');
    debugContainers.forEach(container => container.remove());
    
    // Lade die Ortsdaten
    const sessionId = getSessionId();
    fetch(`/api/locations/${locationId}?sessionId=${sessionId}`)
      .then(response => response.json())
      .then(location => {
        // Debug-Container für Bild erstellen
        const debugContainer = document.createElement('div');
        debugContainer.className = 'debug-image-container';
        debugContainer.style.position = 'fixed';
        debugContainer.style.top = '10px';
        debugContainer.style.left = '10px';
        debugContainer.style.zIndex = '1000';
        debugContainer.style.background = 'rgba(0,0,0,0.8)';
        debugContainer.style.padding = '10px';
        debugContainer.style.borderRadius = '5px';
        debugContainer.style.color = 'white';
        debugContainer.innerHTML = `
          <h3>Debug: Bild für Ort #${locationId}</h3>
          <div id="debug-image-preview" style="width:300px;height:200px;background-size:cover;background-position:center;border:2px solid red;"></div>
          <div id="status">Lade Bild...</div>
        `;
        document.body.appendChild(debugContainer);
        
        // Lade das Bild mit Background-CSS-Methode
        fetch(`/api/locations/${locationId}/image/base64?sessionId=${sessionId}&nocache=${Date.now()}`)
          .then(response => response.json())
          .then(data => {
            const statusDiv = document.getElementById('status');
            if (data.success && data.imageData) {
              statusDiv.innerHTML = 'Bild geladen: ' + Math.round(data.imageData.length / 1024) + ' KB';
              const imgPreview = document.getElementById('debug-image-preview');
              imgPreview.style.backgroundImage = `url('data:${data.imageType || 'image/jpeg'};base64,${data.imageData}')`;
            } else {
              statusDiv.innerHTML = 'Fehler: Keine Bilddaten erhalten';
            }
          })
          .catch(error => {
            document.getElementById('status').innerHTML = 'Fehler: ' + error.message;
          });
        
        // Detailansicht erstellen
        const detailView = document.createElement('div');
        detailView.className = 'detail-view';
        detailView.setAttribute('data-location-id', locationId);
        
        // Inhalt für die Detailansicht
        detailView.innerHTML = `
          <div class="detail-header">
            <h2>${location.title}</h2>
            <button class="close-button">&times;</button>
          </div>
          <div class="image-container">
            <div class="location-image" style="height:200px;background-color:#333;"></div>
          </div>
          <div class="location-description">
            ${location.description || 'Keine Beschreibung vorhanden.'}
          </div>
          <button class="delete-button">Löschen</button>
        `;
        
        // Füge die Detailansicht zur Seite hinzu
        document.body.appendChild(detailView);
        
        // Bild laden, erst als Hintergrund versuchen
        try {
          const imageContainer = detailView.querySelector('.location-image');
          
          // Version 1: Als CSS-Hintergrund
          fetch(`/api/locations/${locationId}/image/base64?sessionId=${sessionId}&nocache=${Date.now()}`)
            .then(response => response.json())
            .then(data => {
              if (data.success && data.imageData) {
                console.log('[DEBUG] Bild erhalten, Länge:', data.imageData.length);
                imageContainer.style.backgroundImage = `url('data:${data.imageType || 'image/jpeg'};base64,${data.imageData}')`;
                imageContainer.style.backgroundSize = 'cover';
                imageContainer.style.backgroundPosition = 'center';
              } else {
                console.error('[DEBUG] Keine Bilddaten in der Antwort');
                imageContainer.textContent = 'Bild konnte nicht geladen werden.';
              }
            })
            .catch(error => {
              console.error('[DEBUG] Fehler beim Laden des Bildes:', error);
              imageContainer.textContent = 'Fehler beim Laden des Bildes.';
            });
        } catch (error) {
          console.error('[DEBUG] Fehler beim Verarbeiten des Bildes:', error);
        }
        
        // Event-Listener für den Schließen-Button
        detailView.querySelector('.close-button').addEventListener('click', function() {
          detailView.remove();
          debugContainer.remove();
        });
        
        // Event-Listener für den Löschen-Button
        detailView.querySelector('.delete-button').addEventListener('click', function() {
          if (confirm('Möchtest du diesen Ort wirklich löschen?')) {
            fetch(`/api/locations/${locationId}?sessionId=${sessionId}`, {
              method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                detailView.remove();
                debugContainer.remove();
                loadLocations(); // Orte neu laden
              } else {
                alert('Fehler beim Löschen des Ortes: ' + data.error);
              }
            })
            .catch(error => {
              console.error('Fehler beim Löschen:', error);
              alert('Fehler beim Löschen des Ortes.');
            });
          }
        });
      })
      .catch(error => {
        console.error('Fehler beim Laden der Ortsdaten:', error);
      });
  };

  // Hilfsfunktion zum Extrahieren der Session-ID aus dem Cookie
  function getSessionId() {
    return document.cookie.split(';')
      .find(c => c.trim().startsWith('sessionId='))
      ?.split('=')[1] || '';
  }
});