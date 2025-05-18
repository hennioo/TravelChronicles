const fs = require('fs');
const path = require('path');

// Map HTML-Template mit dem neuen Base64 Ansatz
const mapHtml = `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Susibert - Unsere Reisekarte</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 0;
            color: #fff;
            background-color: #222;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .header {
            background-color: #333;
            padding: 0.8rem 1rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 100;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        
        .logo {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .logo img {
            width: 2rem;
            height: 2rem;
            border-radius: 50%;
        }
        
        .logo h1 {
            margin: 0;
            font-size: 1.5rem;
            color: #f2960c;
        }
        
        .actions {
            display: flex;
            gap: 1rem;
            align-items: center;
        }
        
        .btn {
            padding: 0.5rem 1rem;
            background-color: #444;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: background-color 0.3s;
        }
        
        .btn-primary {
            background-color: #f2960c;
        }
        
        .btn:hover {
            background-color: #555;
        }
        
        .btn-primary:hover {
            background-color: #d98200;
        }
        
        .menu-icon {
            font-size: 1.5rem;
            cursor: pointer;
            color: #f2960c;
            user-select: none;
        }
        
        .content {
            flex: 1;
            position: relative;
            overflow: hidden;
            display: flex;
        }
        
        #map {
            width: 100%;
            height: 100%;
            transition: width 0.3s ease;
            z-index: 1;
        }
        
        .sidebar {
            width: 0;
            height: 100%;
            background-color: #333;
            transition: width 0.3s ease;
            overflow-y: auto;
            position: absolute;
            right: 0;
            top: 0;
            z-index: 2;
            box-shadow: -2px 0 5px rgba(0,0,0,0.2);
            box-sizing: border-box;
        }
        
        .sidebar.open {
            width: 320px;
            padding: 1rem;
        }
        
        .sidebar-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }
        
        .sidebar-title {
            font-size: 1.2rem;
            font-weight: bold;
            color: #f2960c;
            margin: 0;
        }
        
        .location-list {
            margin-top: 1rem;
        }
        
        .location-item {
            padding: 0.8rem;
            background-color: #444;
            border-radius: 4px;
            margin-bottom: 0.8rem;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        
        .location-item:hover {
            background-color: #555;
        }
        
        .location-title {
            font-weight: bold;
            margin-bottom: 0.3rem;
            color: #f2960c;
        }
        
        .location-coords {
            font-size: 0.8rem;
            color: #aaa;
        }
        
        .detail-view {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: #333;
            padding: 1.5rem;
            border-radius: 8px;
            z-index: 9999;
            max-width: 90%;
            width: 450px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            display: none;
            max-height: 90vh;
            overflow-y: auto;
        }
        
        .detail-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }
        
        .detail-title {
            font-size: 1.5rem;
            font-weight: bold;
            color: #f2960c;
            margin: 0;
        }
        
        .close-btn {
            font-size: 1.5rem;
            cursor: pointer;
            color: #aaa;
            transition: color 0.3s;
        }
        
        .close-btn:hover {
            color: #fff;
        }
        
        .overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.7);
            z-index: 9998;
            display: none;
        }
        
        .add-form {
            display: none;
            margin-top: 1.5rem;
        }
        
        .form-group {
            margin-bottom: 1rem;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            color: #ccc;
        }
        
        .form-group input, .form-group textarea {
            width: 100%;
            padding: 0.75rem;
            background-color: #444;
            border: 1px solid #555;
            border-radius: 4px;
            color: #fff;
            font-family: inherit;
            box-sizing: border-box;
        }
        
        .form-group textarea {
            min-height: 100px;
            resize: vertical;
        }
        
        .form-actions {
            display: flex;
            justify-content: flex-end;
            gap: 0.8rem;
        }
        
        .delete-btn {
            background-color: #e74c3c;
            color: white;
        }
        
        .delete-btn:hover {
            background-color: #c0392b;
        }
        
        .edit-mode-notice {
            background-color: #f2960c;
            color: #333;
            text-align: center;
            padding: 0.5rem;
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 1000;
            font-weight: bold;
            display: none;
        }
        
        .leaflet-container {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        .temp-marker {
            display: none;
            position: absolute;
            z-index: 1000;
            pointer-events: none;
        }
        
        .temp-marker:before {
            content: '';
            display: block;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background-color: rgba(242, 150, 12, 0.7);
            border: 2px solid white;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
        }
        
        .confirmation-buttons {
            display: none;
            position: absolute;
            z-index: 1000;
            margin-top: 10px;
            background-color: #333;
            padding: 5px;
            border-radius: 4px;
        }
        
        /* Mobile Ansicht */
        @media (max-width: 768px) {
            .sidebar.open {
                width: 250px;
            }
            
            .detail-view {
                width: 90%;
            }
            
            .actions {
                gap: 0.5rem;
            }
            
            .btn {
                padding: 0.4rem 0.8rem;
                font-size: 0.8rem;
            }
            
            .logo h1 {
                font-size: 1.2rem;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">
            <img src="/uploads/couple.jpg" alt="Logo">
            <h1>Susibert</h1>
        </div>
        <div class="actions">
            <button id="addLocationBtn" class="btn btn-primary">Ort hinzufügen</button>
            <button id="logoutBtn" class="btn">Abmelden</button>
            <div id="menuToggle" class="menu-icon">☰</div>
        </div>
    </div>
    
    <div class="content">
        <div id="map"></div>
        <div id="sidebar" class="sidebar">
            <div class="sidebar-header">
                <h2 class="sidebar-title">Unsere Orte</h2>
                <div id="closeSidebar" class="close-btn">×</div>
            </div>
            <div id="locationList" class="location-list"></div>
        </div>
    </div>
    
    <div id="overlay" class="overlay"></div>
    
    <div id="detailView" class="detail-view">
        <div class="detail-header">
            <h2 id="detailTitle" class="detail-title"></h2>
            <div id="closeDetail" class="close-btn">×</div>
        </div>
        <div id="detailContent"></div>
    </div>
    
    <div id="editModeNotice" class="edit-mode-notice">
        Klicke auf die Karte, um einen neuen Ort zu markieren
    </div>
    
    <div id="tempMarker" class="temp-marker"></div>
    <div id="confirmationButtons" class="confirmation-buttons">
        <button id="confirmLocationBtn" class="btn btn-primary">Bestätigen</button>
        <button id="cancelLocationBtn" class="btn">Abbrechen</button>
    </div>

    <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
    <script>
        // Status Variablen
        let editMode = false;
        let map;
        let markers = [];
        let selectedLocation = null;
        let tempMarker = null;
        
        // Ort-Objekte
        let locations = [];
        
        // Session-ID aus Cookie oder URL abrufen
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
        
        // Session-ID
        const sessionId = getSessionId();
        
        document.addEventListener('DOMContentLoaded', function() {
            // DOM-Elemente
            const sidebarEl = document.getElementById('sidebar');
            const menuToggleEl = document.getElementById('menuToggle');
            const closeSidebarEl = document.getElementById('closeSidebar');
            const locationListEl = document.getElementById('locationList');
            const overlayEl = document.getElementById('overlay');
            const detailViewEl = document.getElementById('detailView');
            const closeDetailEl = document.getElementById('closeDetail');
            const detailTitleEl = document.getElementById('detailTitle');
            const detailContentEl = document.getElementById('detailContent');
            const addLocationBtnEl = document.getElementById('addLocationBtn');
            const logoutBtnEl = document.getElementById('logoutBtn');
            const editModeNoticeEl = document.getElementById('editModeNotice');
            const tempMarkerEl = document.getElementById('tempMarker');
            const confirmationButtonsEl = document.getElementById('confirmationButtons');
            const confirmLocationBtnEl = document.getElementById('confirmLocationBtn');
            const cancelLocationBtnEl = document.getElementById('cancelLocationBtn');
            
            // Seitenleiste öffnen/schließen
            menuToggleEl.addEventListener('click', function() {
                sidebarEl.classList.toggle('open');
            });
            
            closeSidebarEl.addEventListener('click', function() {
                sidebarEl.classList.remove('open');
            });
            
            // Detail-Ansicht schließen
            closeDetailEl.addEventListener('click', function() {
                hideDetailView();
            });
            
            overlayEl.addEventListener('click', function() {
                hideDetailView();
            });
            
            // Logout-Funktion
            logoutBtnEl.addEventListener('click', function() {
                window.location.href = '/api/logout';
            });
            
            // Karte initialisieren
            initMap();
            
            // Orte laden
            loadLocations();
            
            // "Ort hinzufügen"-Modus
            addLocationBtnEl.addEventListener('click', function() {
                toggleEditMode();
            });
            
            // Bestätigen eines neuen Orts
            confirmLocationBtnEl.addEventListener('click', function() {
                if (tempMarker) {
                    showAddLocationForm(tempMarker.getLatLng());
                }
            });
            
            // Abbrechen eines neuen Orts
            cancelLocationBtnEl.addEventListener('click', function() {
                cancelAddLocation();
            });
            
            // Tastaturkürzel (ESC zum Abbrechen)
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    if (editMode) {
                        cancelAddLocation();
                    } else if (detailViewEl.style.display === 'block') {
                        hideDetailView();
                    }
                }
            });
        });
        
        // Karte initialisieren
        function initMap() {
            // Karte erstellen und auf Europa zentrieren
            map = L.map('map').setView([48.775846, 9.182932], 5);
            
            // Kartenkacheln von OpenStreetMap laden
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
            
            // Karten-Klick-Event für das Hinzufügen neuer Orte
            map.on('click', function(e) {
                if (editMode) {
                    placeTemporaryMarker(e.latlng);
                }
            });
        }
        
        // Temporären Marker platzieren
        function placeTemporaryMarker(latlng) {
            // Vorherigen temporären Marker entfernen
            if (tempMarker) {
                map.removeLayer(tempMarker);
            }
            
            // Neuen temporären Marker erstellen
            tempMarker = L.marker(latlng).addTo(map);
            
            // Bestätigungs-Buttons positionieren und anzeigen
            const confirmationButtonsEl = document.getElementById('confirmationButtons');
            
            // Position der Buttons relativ zum Marker berechnen
            const point = map.latLngToContainerPoint(latlng);
            confirmationButtonsEl.style.left = point.x - 60 + 'px';
            confirmationButtonsEl.style.top = point.y + 30 + 'px';
            confirmationButtonsEl.style.display = 'block';
        }
        
        // Hinzufügen-Modus umschalten
        function toggleEditMode() {
            editMode = !editMode;
            
            const editModeNoticeEl = document.getElementById('editModeNotice');
            const addLocationBtnEl = document.getElementById('addLocationBtn');
            
            if (editMode) {
                editModeNoticeEl.style.display = 'block';
                addLocationBtnEl.textContent = 'Abbrechen';
                
                // Cursor-Style anpassen
                document.getElementById('map').style.cursor = 'crosshair';
            } else {
                editModeNoticeEl.style.display = 'none';
                addLocationBtnEl.textContent = 'Ort hinzufügen';
                
                // Temporären Marker und Bestätigungs-Buttons entfernen
                cancelAddLocation();
                
                // Cursor zurücksetzen
                document.getElementById('map').style.cursor = '';
            }
        }
        
        // Hinzufügen abbrechen
        function cancelAddLocation() {
            const confirmationButtonsEl = document.getElementById('confirmationButtons');
            confirmationButtonsEl.style.display = 'none';
            
            if (tempMarker) {
                map.removeLayer(tempMarker);
                tempMarker = null;
            }
            
            if (editMode) {
                toggleEditMode();
            }
        }
        
        // Formular zum Hinzufügen eines Ortes anzeigen
        function showAddLocationForm(latlng) {
            // Detail-Ansicht vorbereiten
            const detailTitleEl = document.getElementById('detailTitle');
            const detailContentEl = document.getElementById('detailContent');
            const overlayEl = document.getElementById('overlay');
            const detailViewEl = document.getElementById('detailView');
            
            detailTitleEl.textContent = 'Neuen Ort hinzufügen';
            
            // Formular erstellen
            const formHtml = \`
                <form id="addLocationForm" enctype="multipart/form-data">
                    <div class="form-group">
                        <label for="title">Titel *</label>
                        <input type="text" id="title" name="title" required>
                    </div>
                    <div class="form-group">
                        <label for="description">Beschreibung</label>
                        <textarea id="description" name="description"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="image">Bild *</label>
                        <input type="file" id="image" name="image" accept="image/*" required>
                    </div>
                    <input type="hidden" id="latitude" name="latitude" value="\${latlng.lat}">
                    <input type="hidden" id="longitude" name="longitude" value="\${latlng.lng}">
                    <div class="form-actions">
                        <button type="button" id="cancelFormBtn" class="btn">Abbrechen</button>
                        <button type="submit" class="btn btn-primary">Speichern</button>
                    </div>
                </form>
            \`;
            
            detailContentEl.innerHTML = formHtml;
            
            // Formular-Events
            document.getElementById('addLocationForm').addEventListener('submit', function(e) {
                e.preventDefault();
                submitAddLocationForm();
            });
            
            document.getElementById('cancelFormBtn').addEventListener('click', function() {
                hideDetailView();
                cancelAddLocation();
            });
            
            // Detail-Ansicht und Overlay anzeigen
            overlayEl.style.display = 'block';
            detailViewEl.style.display = 'block';
            
            // Bestätigungs-Buttons ausblenden
            document.getElementById('confirmationButtons').style.display = 'none';
        }
        
        // Formular absenden
        function submitAddLocationForm() {
            console.log('Formular wird abgesendet');
            
            const form = document.getElementById('addLocationForm');
            const formData = new FormData(form);
            
            // Session-ID hinzufügen
            formData.append('sessionId', sessionId);
            
            // Validierung
            const title = formData.get('title');
            const lat = formData.get('latitude');
            const lng = formData.get('longitude');
            const image = formData.get('image');
            
            if (!title || !lat || !lng || !image) {
                alert('Bitte fülle alle Pflichtfelder aus!');
                return;
            }
            
            console.log('Alle Eingaben validiert, bereite FormData vor', { title, lat, lng });
            
            // Formular absenden
            fetch('/api/locations', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Detail-Ansicht ausblenden
                    hideDetailView();
                    
                    // Edit-Modus beenden
                    cancelAddLocation();
                    
                    // Orte neu laden
                    loadLocations();
                } else {
                    alert('Fehler beim Speichern: ' + (data.error || 'Unbekannter Fehler'));
                }
            })
            .catch(error => {
                console.error('Fehler beim Absenden des Formulars:', error);
                alert('Fehler beim Speichern des Ortes. Bitte versuche es später noch einmal.');
            });
        }
        
        // Orte vom Server laden
        function loadLocations() {
            fetch(\`/api/locations?sessionId=\${sessionId}\`)
                .then(response => response.json())
                .then(data => {
                    locations = data;
                    
                    // Marker auf der Karte aktualisieren
                    updateMapMarkers();
                    
                    // Liste in der Seitenleiste aktualisieren
                    updateLocationList();
                })
                .catch(error => {
                    console.error('Fehler beim Laden der Orte:', error);
                });
        }
        
        // Marker auf der Karte aktualisieren
        function updateMapMarkers() {
            // Alle vorhandenen Marker entfernen
            markers.forEach(marker => map.removeLayer(marker));
            markers = [];
            
            // Neue Marker hinzufügen
            locations.forEach(location => {
                const marker = L.marker([location.latitude, location.longitude])
                    .addTo(map)
                    .bindPopup(location.title);
                
                // Klick-Event für Marker
                marker.on('click', function() {
                    showLocationDetail(location);
                });
                
                // Marker speichern
                markers.push(marker);
                
                // Visuelle Markierung des bereisten Bereichs (50km Radius)
                const circle = L.circle([location.latitude, location.longitude], {
                    color: '#f2960c',
                    fillColor: '#f2960c',
                    fillOpacity: 0.2,
                    radius: 50000
                }).addTo(map);
                
                markers.push(circle);
            });
            
            // Wenn es Orte gibt, Karte auf alle Marker zentrieren
            if (locations.length > 0) {
                const group = new L.featureGroup(markers);
                map.fitBounds(group.getBounds(), { padding: [50, 50] });
            }
        }
        
        // Liste in der Seitenleiste aktualisieren
        function updateLocationList() {
            const locationListEl = document.getElementById('locationList');
            locationListEl.innerHTML = '';
            
            if (locations.length === 0) {
                locationListEl.innerHTML = '<p>Noch keine Orte vorhanden. Füge deinen ersten Ort hinzu!</p>';
                return;
            }
            
            locations.forEach(location => {
                const itemEl = document.createElement('div');
                itemEl.className = 'location-item';
                
                const titleEl = document.createElement('div');
                titleEl.className = 'location-title';
                titleEl.textContent = location.title;
                
                itemEl.appendChild(titleEl);
                
                if (location.description) {
                    const descEl = document.createElement('div');
                    descEl.textContent = location.description.length > 50 
                        ? location.description.substring(0, 50) + '...' 
                        : location.description;
                    itemEl.appendChild(descEl);
                }
                
                // Klick-Event
                itemEl.addEventListener('click', function() {
                    // Marker zentrieren und Popup öffnen
                    map.setView([location.latitude, location.longitude], 12);
                    
                    // Detail-Ansicht anzeigen
                    showLocationDetail(location);
                    
                    // Auf mobilen Geräten die Seitenleiste schließen
                    if (window.innerWidth < 768) {
                        document.getElementById('sidebar').classList.remove('open');
                    }
                });
                
                locationListEl.appendChild(itemEl);
            });
        }
        
        // Detail-Ansicht eines Ortes anzeigen
        function showLocationDetail(location) {
            selectedLocation = location;
            
            const detailTitleEl = document.getElementById('detailTitle');
            const detailContentEl = document.getElementById('detailContent');
            const overlayEl = document.getElementById('overlay');
            const detailViewEl = document.getElementById('detailView');
            
            detailTitleEl.textContent = location.title;
            
            // Basis-HTML für die Detailansicht
            detailContentEl.innerHTML = \`
              <div id="imageLoadingContainer" style="width: 100%; height: 300px; background-color: #222; display: flex; justify-content: center; align-items: center; border-radius: 4px; margin-bottom: 15px;">
                <div>Bild wird geladen...</div>
              </div>
              <div>\${location.description || 'Keine Beschreibung vorhanden.'}</div>
              <div class="form-actions" style="margin-top: 20px;">
                <button id="deleteLocationBtn" class="btn delete-btn">Löschen</button>
              </div>
            \`;
            
            // Bild direkt als Base64 vom Server abrufen
            fetch(\`/api/locations/\${location.id}/image/base64?sessionId=\${sessionId}&t=\${Date.now()}\`)
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
                  img.src = \`data:\${data.imageType || 'image/jpeg'};base64,\${data.imageData}\`;
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
                  document.getElementById('imageLoadingContainer').innerHTML = \`
                    <img src="/uploads/couple.jpg" alt="Pärchenbild" style="width: 100%; max-height: 300px; object-fit: cover; border-radius: 4px;">
                  \`;
                }
              })
              .catch(error => {
                console.error('Fehler beim Laden des Bildes:', error);
                // Fallback zum Pärchenbild
                document.getElementById('imageLoadingContainer').innerHTML = \`
                  <img src="/uploads/couple.jpg" alt="Pärchenbild" style="width: 100%; max-height: 300px; object-fit: cover; border-radius: 4px;">
                \`;
              });
            
            // EventListener für Lösch-Button
            document.getElementById('deleteLocationBtn').addEventListener('click', function() {
                deleteLocation(location.id);
            });
            
            // Detail-Ansicht anzeigen
            overlayEl.style.display = 'block';
            detailViewEl.style.display = 'block';
        }
        
        // Detail-Ansicht ausblenden
        function hideDetailView() {
            const overlayEl = document.getElementById('overlay');
            const detailViewEl = document.getElementById('detailView');
            
            overlayEl.style.display = 'none';
            detailViewEl.style.display = 'none';
            
            selectedLocation = null;
        }
        
        // Ort löschen
        function deleteLocation(id) {
            if (!confirm('Bist du sicher, dass du diesen Ort löschen möchtest?')) {
                return;
            }
            
            fetch(\`/api/locations/\${id}?sessionId=\${sessionId}\`, {
                method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Detail-Ansicht ausblenden
                    hideDetailView();
                    
                    // Orte neu laden
                    loadLocations();
                } else {
                    alert('Fehler beim Löschen: ' + (data.error || 'Unbekannter Fehler'));
                }
            })
            .catch(error => {
                console.error('Fehler beim Löschen des Ortes:', error);
                alert('Fehler beim Löschen des Ortes. Bitte versuche es später noch einmal.');
            });
        }
    </script>
</body>
</html>`;

// Server-Code für den Base64 Endpunkt
const serverCode = `
// Bild eines Ortes als Base64 im JSON-Format abrufen
app.get('/api/locations/:id/image/base64', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    console.log(\`Bild für Ort \${id} als Base64 angefordert\`);
    
    // Cache-Control Header setzen
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Direkter und vereinfachter Abruf der Bilddaten aus der Datenbank
    const result = await pool.query('SELECT image_data, image_type FROM locations WHERE id = $1', [id]);
    
    if (result.rows.length === 0 || !result.rows[0].image_data) {
      console.log(\`Ort \${id} nicht gefunden oder hat keine Bilddaten\`);
      return res.status(404).json({ success: false, message: 'Bild nicht gefunden' });
    }
    
    const { image_data, image_type } = result.rows[0];
    
    // Als JSON mit Base64-String zurückgeben
    return res.json({
      success: true,
      imageData: image_data,
      imageType: image_type || 'image/jpeg'
    });
  } catch (error) {
    console.error('Fehler beim Abrufen des Bildes:', error);
    return res.status(500).json({ success: false, message: 'Serverfehler beim Abrufen des Bildes' });
  }
});`;

// Schreibe HTML-Dateien und Server-Code
console.log('Schreibe Dateien...');
try {
  // Erstelle dist-Verzeichnis, falls es nicht existiert
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(distDir)){
    fs.mkdirSync(distDir, { recursive: true });
  }
  
  // Schreibe map.html
  fs.writeFileSync(path.join(distDir, 'map.html'), mapHtml);
  console.log('map.html erfolgreich geschrieben');
  
  // Server-Code: Füge Base64-Endpunkt hinzu
  const indexFilePath = path.join(distDir, 'index.js');
  if (fs.existsSync(indexFilePath)) {
    let serverContent = fs.readFileSync(indexFilePath, 'utf8');
    
    // Nur hinzufügen, wenn der Endpunkt noch nicht existiert
    if (!serverContent.includes('/api/locations/:id/image/base64')) {
      serverContent += serverCode;
      fs.writeFileSync(indexFilePath, serverContent);
      console.log('Server-Code erfolgreich aktualisiert');
    } else {
      console.log('Base64-Endpunkt existiert bereits');
    }
  } else {
    console.log('index.js nicht gefunden');
  }
  
  console.log('Fertig! Bitte manuell deployen mit "Manual Deploy" und "Clear build cache & deploy" auf Render.');
} catch (error) {
  console.error('Fehler:', error);
}