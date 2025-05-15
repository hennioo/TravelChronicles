// Neues Layout für die Kartenansicht mit rechter Seitenleiste und Detailansicht
function generateMapView(coupleImageUrl) {
  return `
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Susibert</title>
      <!-- Leaflet CSS -->
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          background-color: #1a1a1a;
          color: #f5f5f5;
          margin: 0;
          padding: 0;
          height: 100vh;
        }
        
        /* Verbesserte Header-Styling */
        .header {
          background-color: #222;
          padding: 10px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2);
          position: relative;
          z-index: 1000;
        }
        
        .logo {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #f59a0c;
          text-decoration: none;
        }
        
        .logo-circle {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border: 2px solid #f59a0c;
        }
        
        .logo-circle img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .logo-text {
          font-size: 1.5rem;
          font-weight: bold;
        }
        
        .header-right {
          display: flex;
          gap: 15px;
          align-items: center;
        }
        
        .btn {
          background-color: #333;
          color: #fff;
          border: none;
          padding: 8px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: background-color 0.2s;
        }
        
        .btn:hover {
          background-color: #444;
        }
        
        .btn-primary {
          background-color: #f59a0c;
          color: #000;
        }
        
        .btn-primary:hover {
          background-color: #e58e0b;
        }
        
        /* Haupt-Container */
        .main-container {
          display: flex;
          height: calc(100vh - 56px); /* volle Höhe minus Header */
        }
        
        /* Kartenbereich */
        .map-container {
          flex: 1;
          position: relative;
        }
        
        #map {
          height: 100%;
          width: 100%;
          z-index: 1;
        }
        
        /* Sidebar mit Orten */
        .sidebar {
          width: 300px;
          background-color: #222;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }
        
        .sidebar-header {
          padding: 15px;
          border-bottom: 1px solid #333;
        }
        
        .sidebar-header h2 {
          margin: 0;
          color: #f59a0c;
          font-size: 1.4rem;
        }
        
        /* Orte-Liste */
        .locations-list {
          flex: 1;
          padding: 15px;
          display: flex;
          flex-direction: column;
          gap: 15px;
          overflow-y: auto;
        }
        
        .location-item {
          background-color: #333;
          border-radius: 8px;
          padding: 12px;
          cursor: pointer;
          transition: transform 0.2s, background-color 0.2s;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .location-item:hover {
          transform: translateY(-2px);
          background-color: #3a3a3a;
        }
        
        .location-item.active {
          background-color: #3a3a3a;
          border-left: 3px solid #f59a0c;
        }
        
        .location-thumbnail {
          width: 60px;
          height: 60px;
          border-radius: 4px;
          overflow: hidden;
          flex-shrink: 0;
        }
        
        .location-thumbnail img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .location-info {
          flex: 1;
          overflow: hidden;
        }
        
        .location-info h3 {
          margin: 0 0 5px 0;
          color: #f59a0c;
          font-size: 1rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .location-info p {
          margin: 0;
          font-size: 0.8rem;
          color: #aaa;
        }
        
        /* Location Detail View */
        .location-detail {
          display: none;
          background-color: rgba(0, 0, 0, 0.8);
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          z-index: 2000;
          justify-content: center;
          align-items: center;
          backdrop-filter: blur(5px);
        }
        
        .location-detail-content {
          background-color: #222;
          width: 90%;
          max-width: 500px;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
          position: relative;
        }
        
        .location-detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px 20px;
          border-bottom: 1px solid #333;
        }
        
        .location-detail-title {
          margin: 0;
          color: #f59a0c;
        }
        
        .close-detail {
          background: none;
          border: none;
          color: #fff;
          font-size: 1.5rem;
          cursor: pointer;
        }
        
        .location-detail-image {
          width: 100%;
          height: 300px;
        }
        
        .location-detail-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .location-detail-body {
          padding: 20px;
        }
        
        .location-detail-footer {
          padding: 15px 20px;
          border-top: 1px solid #333;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
        
        /* Neuen Ort hinzufügen Form */
        #addLocationForm {
          padding: 20px;
          background-color: #222;
          border-radius: 8px;
          margin-top: 20px;
          display: none;
        }
        
        .form-group {
          margin-bottom: 15px;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 5px;
          color: #f59a0c;
        }
        
        .form-control {
          width: 100%;
          padding: 10px;
          background-color: #333;
          border: 1px solid #444;
          border-radius: 4px;
          color: #fff;
          font-size: 1rem;
        }
        
        /* Popup-Styling für Leaflet */
        .custom-popup .leaflet-popup-content-wrapper {
          background-color: #222;
          color: #fff;
          border-radius: 8px;
        }
        
        .custom-popup .leaflet-popup-content {
          margin: 15px;
        }
        
        .custom-popup .leaflet-popup-tip {
          background-color: #222;
        }
        
        .popup-title {
          color: #f59a0c;
          margin: 0 0 5px 0;
          font-size: 1.1rem;
        }
        
        .popup-date {
          color: #aaa;
          font-size: 0.8rem;
          margin: 0 0 10px 0;
        }
        
        .popup-image {
          width: 100%;
          height: 120px;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 10px;
        }
        
        .popup-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .popup-description {
          margin: 10px 0 0 0;
          font-size: 0.9rem;
        }
        
        .popup-actions {
          margin-top: 10px;
          display: flex;
          justify-content: flex-end;
        }
        
        .marker-highlight {
          border-radius: 50%;
          background-color: rgba(242, 150, 12, 0.5);
          border: 2px solid #f59a0c;
        }
        
        /* Instructions for edit mode */
        .instructions {
          display: none;
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background-color: rgba(0, 0, 0, 0.7);
          color: white;
          padding: 10px 20px;
          border-radius: 20px;
          font-size: 0.9rem;
          z-index: 1000;
          text-align: center;
        }
        
        @media (max-width: 768px) {
          .main-container {
            flex-direction: column;
          }
          
          .sidebar {
            width: 100%;
            height: 200px;
          }
          
          .map-container {
            height: calc(100vh - 56px - 200px);
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <a href="/map" class="logo">
          <div class="logo-circle">
            <img src="${coupleImageUrl}" alt="Pärchenbild">
          </div>
          <span class="logo-text">Susibert</span>
        </a>
        <div class="header-right">
          <button id="editBtn" class="btn">Bearbeiten</button>
          <a href="/admin" class="btn">Admin</a>
          <a href="/logout" class="btn btn-primary">Abmelden</a>
        </div>
      </div>
      
      <div class="main-container">
        <div class="map-container">
          <div id="map"></div>
          <div class="instructions" id="editInstructions">
            Klicke auf die Karte, um einen neuen Ort hinzuzufügen
          </div>
        </div>
        
        <div class="sidebar">
          <div class="sidebar-header">
            <h2>Our Destinations</h2>
          </div>
          <!-- Orte werden im JavaScript dynamisch generiert -->
          <div class="locations-list" id="locationsList"></div>
        </div>
      </div>
      
      <!-- Detailansicht für einen Ort -->
      <div class="location-detail" id="locationDetail">
        <div class="location-detail-content">
          <div class="location-detail-header">
            <h2 class="location-detail-title" id="detailTitle"></h2>
            <button class="close-detail" id="closeDetail">&times;</button>
          </div>
          <div class="location-detail-image">
            <img id="detailImage" src="" alt="Ortsbild">
          </div>
          <div class="location-detail-body">
            <p id="detailDate" style="color: #aaa; font-size: 0.9rem; margin-bottom: 10px;"></p>
            <p id="detailDescription"></p>
          </div>
          <div class="location-detail-footer">
            <button class="btn btn-primary" id="detailDeleteBtn">Löschen</button>
          </div>
        </div>
      </div>
      
      <!-- Leaflet JS -->
      <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
      <script>
        // Globale Variablen
        let map;
        let markers = [];
        let editMode = false;
        let locations = [];
        let activeLocationId = null;
        const highlightRadius = 50; // Radius in km
        
        // Initialisiere die Karte
        function initMap() {
          // Dunkler Kartenstil
          const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
          });
          
          // Hellerer Kartenstil als Alternative
          const lightLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
          });
          
          // Karte mit Zentrierung auf Europa
          map = L.map('map', {
            center: [48.8566, 10.3522], // Zentriert auf Europa
            zoom: 5,
            layers: [darkLayer],
            zoomControl: true
          });
          
          // Basiskarten
          const baseMaps = {
            "Dunkel": darkLayer,
            "Hell": lightLayer
          };
          
          // Lade Orte von der API
          fetchLocations();
          
          // Map-Klick-Event für das Hinzufügen neuer Orte im Bearbeitungsmodus
          map.on('click', function(e) {
            if (editMode) {
              const lat = e.latlng.lat;
              const lng = e.latlng.lng;
              showAddLocationForm(lat, lng);
            }
          });
        }
        
        // Lade Orte von der API
        function fetchLocations() {
          fetch('/api/locations')
            .then(response => response.json())
            .then(data => {
              locations = data;
              displayLocations(locations);
              addMarkersToMap(locations);
            })
            .catch(error => {
              console.error('Fehler beim Laden der Orte:', error);
            });
        }
        
        // Zeige Orte in der Sidebar-Liste an
        function displayLocations(locations) {
          const locationsList = document.getElementById('locationsList');
          locationsList.innerHTML = '';
          
          if (locations.length === 0) {
            locationsList.innerHTML = '<p style="padding: 15px; color: #aaa;">Keine Orte gefunden. Klicke im Bearbeitungsmodus auf die Karte, um Orte hinzuzufügen.</p>';
            return;
          }
          
          locations.forEach(location => {
            const locationItem = document.createElement('div');
            locationItem.className = 'location-item';
            locationItem.dataset.id = location.id;
            locationItem.onclick = () => {
              // Ändere aktiven Status für alle Elemente
              document.querySelectorAll('.location-item').forEach(item => {
                item.classList.remove('active');
              });
              locationItem.classList.add('active');
              activeLocationId = location.id;
              
              // Zeige Details und zoome zur Location
              showLocationDetails(location);
              focusLocation(location);
            };
            
            let thumbnailHtml = '';
            if (location.image) {
              thumbnailHtml = \`
                <div class="location-thumbnail">
                  <img src="\${location.image}" alt="\${location.name}" onerror="this.src='/uploads/couple.jpg'; this.onerror=null;">
                </div>
              \`;
            } else {
              thumbnailHtml = \`
                <div class="location-thumbnail">
                  <img src="/uploads/couple.jpg" alt="Fallback">
                </div>
              \`;
            }
            
            const date = new Date(location.date).toLocaleDateString('de-DE');
            
            locationItem.innerHTML = \`
              \${thumbnailHtml}
              <div class="location-info">
                <h3>\${location.name}</h3>
                <p>\${date}</p>
              </div>
            \`;
            
            locationsList.appendChild(locationItem);
          });
        }
        
        // Fokussiere auf einen Ort auf der Karte
        function focusLocation(location) {
          const lat = parseFloat(location.latitude);
          const lng = parseFloat(location.longitude);
          
          if (!isNaN(lat) && !isNaN(lng)) {
            map.setView([lat, lng], 8);
            
            // Finde den Marker für diesen Ort und öffne sein Popup
            markers.forEach(marker => {
              if (marker instanceof L.Marker && marker.getLatLng().lat === lat && marker.getLatLng().lng === lng) {
                marker.openPopup();
              }
            });
          }
        }
        
        // Füge Marker zur Karte hinzu
        function addMarkersToMap(locations) {
          // Entferne bestehende Marker
          markers.forEach(marker => map.removeLayer(marker));
          markers = [];
          
          locations.forEach(location => {
            const lat = parseFloat(location.latitude);
            const lng = parseFloat(location.longitude);
            
            if (isNaN(lat) || isNaN(lng)) {
              console.error('Ungültige Koordinaten für Ort:', location);
              return;
            }
            
            // Erstelle den Marker
            const marker = L.marker([lat, lng]).addTo(map);
            markers.push(marker);
            
            // Füge Popup hinzu
            const popupContent = \`
              <div>
                <h3 class="popup-title">\${location.name}</h3>
                <p class="popup-date">\${new Date(location.date).toLocaleDateString('de-DE')}</p>
                \${location.image ? \`
                  <div class="popup-image">
                    <img src="\${location.image}" alt="\${location.name}" onerror="this.src='/uploads/couple.jpg'; this.onerror=null;">
                  </div>
                \` : ''}
                \${location.description ? \`<p class="popup-description">\${location.description}</p>\` : ''}
                <div class="popup-actions">
                  <button class="btn btn-primary" onclick="showLocationDetails(\${JSON.stringify(location).replace(/"/g, '&quot;')})">Details</button>
                </div>
              </div>
            \`;
            
            marker.bindPopup(popupContent, { className: 'custom-popup' });
            
            // Event-Listener für Marker-Klick, um auch die Sidebar zu aktualisieren
            marker.on('click', function() {
              // Aktualisiere aktiven Status in der Sidebar
              document.querySelectorAll('.location-item').forEach(item => {
                if (item.dataset.id == location.id) {
                  item.classList.add('active');
                  // Scrolle zum Element
                  item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } else {
                  item.classList.remove('active');
                }
              });
              
              activeLocationId = location.id;
            });
            
            // Farbiger Radius um den Marker (Highlight)
            const radius = highlightRadius * 1000; // km zu m umrechnen
            const circle = L.circle([lat, lng], {
              radius: radius,
              color: '#f59a0c',
              fillColor: '#f59a0c',
              fillOpacity: 0.2,
              weight: 1
            }).addTo(map);
            markers.push(circle);
          });
        }
        
        // Zeige Ort-Details in der Detailansicht
        function showLocationDetails(location) {
          const detailView = document.getElementById('locationDetail');
          const detailTitle = document.getElementById('detailTitle');
          const detailImage = document.getElementById('detailImage');
          const detailDate = document.getElementById('detailDate');
          const detailDescription = document.getElementById('detailDescription');
          const detailDeleteBtn = document.getElementById('detailDeleteBtn');
          
          detailTitle.textContent = location.name;
          detailDate.textContent = new Date(location.date).toLocaleDateString('de-DE');
          
          if (location.image) {
            detailImage.src = location.image;
            detailImage.onerror = function() {
              // Fallback, wenn Bild nicht geladen werden kann
              this.src = '/uploads/couple.jpg';
              this.onerror = null;
            };
          } else {
            detailImage.src = '/uploads/couple.jpg';
          }
          
          detailDescription.textContent = location.description || 'Keine Beschreibung verfügbar.';
          
          // Lösch-Button-Aktion
          detailDeleteBtn.onclick = function() {
            if (confirm('Möchtest du diesen Ort wirklich löschen?')) {
              deleteLocation(location.id);
            }
          };
          
          // Zeige Detailansicht
          detailView.style.display = 'flex';
        }
        
        // Ort löschen
        function deleteLocation(id) {
          fetch(\`/api/locations/\${id}/delete\`)
            .then(response => {
              if (response.ok || response.redirected) {
                // Schließe Detailansicht
                document.getElementById('locationDetail').style.display = 'none';
                
                // Lade Orte neu
                fetchLocations();
              } else {
                throw new Error('Fehler beim Löschen des Ortes');
              }
            })
            .catch(error => {
              console.error('Fehler:', error);
              alert('Fehler beim Löschen des Ortes');
            });
        }
        
        // Formular zum Hinzufügen eines neuen Ortes anzeigen
        function showAddLocationForm(lat, lng) {
          // Erstelle eine temporäre Popup-Form direkt auf der Karte
          const popupContent = \`
            <form id="addLocationForm" onsubmit="submitNewLocation(event, \${lat}, \${lng})">
              <div class="form-group">
                <label for="locationName">Name des Ortes:</label>
                <input type="text" id="locationName" class="form-control" required>
              </div>
              <div class="form-group">
                <label for="locationDescription">Beschreibung (optional):</label>
                <textarea id="locationDescription" class="form-control" rows="3"></textarea>
              </div>
              <div class="form-group">
                <label for="locationImage">Bild:</label>
                <input type="file" id="locationImage" name="image" accept="image/*" class="form-control" required>
              </div>
              <button type="submit" class="btn btn-primary">Ort hinzufügen</button>
            </form>
          \`;
          
          const popup = L.popup()
            .setLatLng([lat, lng])
            .setContent(popupContent)
            .openOn(map);
        }
        
        // Neuen Ort hinzufügen
        function submitNewLocation(event, lat, lng) {
          event.preventDefault();
          
          const name = document.getElementById('locationName').value;
          const description = document.getElementById('locationDescription').value;
          const imageFile = document.getElementById('locationImage').files[0];
          
          if (!name || !imageFile) {
            alert('Bitte fülle alle Pflichtfelder aus.');
            return;
          }
          
          const formData = new FormData();
          formData.append('name', name);
          formData.append('description', description);
          formData.append('latitude', lat);
          formData.append('longitude', lng);
          formData.append('image', imageFile);
          
          fetch('/api/locations', {
            method: 'POST',
            body: formData
          })
          .then(response => {
            if (!response.ok) {
              throw new Error('Fehler beim Speichern des Ortes');
            }
            return response.json();
          })
          .then(data => {
            // Schließe alle offenen Popups
            map.closePopup();
            
            // Lade Orte neu
            fetchLocations();
          })
          .catch(error => {
            console.error('Fehler:', error);
            alert('Fehler beim Hinzufügen des Ortes: ' + error.message);
          });
        }
        
        // Event-Listener
        document.addEventListener('DOMContentLoaded', function() {
          // Initialisiere Karte
          initMap();
          
          // Bearbeiten-Button
          const editBtn = document.getElementById('editBtn');
          const editInstructions = document.getElementById('editInstructions');
          
          editBtn.addEventListener('click', function() {
            editMode = !editMode;
            
            if (editMode) {
              editBtn.textContent = 'Bearbeiten beenden';
              editBtn.classList.add('btn-primary');
              map.getContainer().style.cursor = 'crosshair';
              editInstructions.style.display = 'block';
            } else {
              editBtn.textContent = 'Bearbeiten';
              editBtn.classList.remove('btn-primary');
              map.getContainer().style.cursor = '';
              editInstructions.style.display = 'none';
            }
          });
          
          // Detailansicht schließen
          const closeDetail = document.getElementById('closeDetail');
          const detailView = document.getElementById('locationDetail');
          
          closeDetail.addEventListener('click', function() {
            detailView.style.display = 'none';
          });
          
          // Klick außerhalb der Detailansicht schließt sie
          detailView.addEventListener('click', function(event) {
            if (event.target === detailView) {
              detailView.style.display = 'none';
            }
          });
        });
      </script>
    </body>
    </html>
  `;
}

module.exports = { generateMapView };