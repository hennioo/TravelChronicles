// Einfacher Location-Server ohne Thumbnail-Spalte
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const sharp = require('sharp');

// Zugangscode
const ACCESS_CODE = process.env.ACCESS_CODE || 'suuuu';
console.log('Zugangscode:', ACCESS_CODE);

// Server erstellen
const app = express();
const port = process.env.PORT || 10000;

// Uploads konfigurieren
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB Limit
});

// Grundlegende Konfiguration
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Sessions speichern
const sessions = new Map();

// Datenbank-Verbindung
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Für Render/Supabase nötig
  }
});

// Session-Funktionen
function createSession() {
  const sessionId = crypto.randomBytes(16).toString('hex');
  sessions.set(sessionId, { 
    createdAt: new Date(),
    authenticated: false 
  });
  return sessionId;
}

function isValidSession(sessionId) {
  return sessions.has(sessionId) && sessions.get(sessionId).authenticated;
}

// Auth Middleware
function requireAuth(req, res, next) {
  const sessionId = req.query.sessionId || req.cookies.sessionId;
  
  if (!sessionId || !isValidSession(sessionId)) {
    return res.redirect('/login');
  }
  
  next();
}

// Login-Route
app.get('/login', (req, res) => {
  const sessionId = req.cookies.sessionId || createSession();
  res.cookie('sessionId', sessionId, { httpOnly: true });
  
  res.send(`
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Susibert - Login</title>
      <style>
        body, html {
          margin: 0;
          padding: 0;
          height: 100%;
          font-family: Arial, sans-serif;
          background-color: #000;
          color: white;
        }
        .container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          padding: 20px;
          box-sizing: border-box;
        }
        .login-box {
          background-color: #333;
          border-radius: 10px;
          padding: 30px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
          max-width: 400px;
          width: 100%;
          text-align: center;
        }
        .couple-image {
          width: 200px;
          height: 200px;
          border-radius: 50%;
          object-fit: cover;
          margin-bottom: 20px;
          border: 3px solid #f2960c;
        }
        h1 {
          margin-top: 0;
          color: #f2960c;
          font-size: 2rem;
        }
        input {
          width: 100%;
          padding: 12px;
          margin: 10px 0;
          border: none;
          border-radius: 5px;
          box-sizing: border-box;
          font-size: 1rem;
        }
        button {
          background-color: #f2960c;
          color: white;
          border: none;
          padding: 12px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 1rem;
          margin-top: 10px;
          width: 100%;
          transition: background-color 0.3s;
        }
        button:hover {
          background-color: #e08800;
        }
        .error {
          color: #ff6b6b;
          margin-top: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="login-box">
          <h1>SUSIBERT</h1>
          <img src="/first-image" alt="Pärchenbild" class="couple-image" onerror="this.src='/first-image'">
          <form id="login-form">
            <input type="password" id="access-code" placeholder="Zugangscode eingeben" required>
            <button type="submit">Zugang erhalten</button>
            <div class="error" id="error-message"></div>
          </form>
        </div>
      </div>
      
      <script>
        document.getElementById('login-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const accessCode = document.getElementById('access-code').value;
          
          try {
            document.getElementById('error-message').textContent = '';
            
            const response = await fetch('/verify-access', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ accessCode })
            });
            
            if (!response.ok) {
              throw new Error('Netzwerkfehler');
            }
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
              throw new Error('Ungültiges Antwortformat');
            }
            
            const data = await response.json();
            
            if (data.success) {
              window.location.href = '/?sessionId=' + data.sessionId;
            } else {
              document.getElementById('error-message').textContent = 'Falscher Zugangscode';
            }
          } catch (error) {
            console.error('Login-Fehler:', error);
            document.getElementById('error-message').textContent = 'Ein Fehler ist aufgetreten';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Erstes Bild aus der Datenbank
app.get('/first-image', async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Versuche ein Bild aus der locations Tabelle zu holen
    try {
      const result = await client.query('SELECT image, image_type FROM locations LIMIT 1');
      
      if (result.rows.length > 0 && result.rows[0].image) {
        const imageBase64 = result.rows[0].image;
        const imageType = result.rows[0].image_type || 'image/jpeg';
        
        const imageBuffer = Buffer.from(imageBase64, 'base64');
        
        res.set('Content-Type', imageType);
        client.release();
        return res.end(imageBuffer);
      }
    } catch (err) {
      console.error('Fehler beim Abrufen eines Bildes:', err);
    }
    
    client.release();
    
    // Standardbild senden (1x1 transparentes PNG)
    const transparentPixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    res.set('Content-Type', 'image/png');
    res.end(transparentPixel);
  } catch (error) {
    console.error('Fehler:', error);
    res.status(500).send('Fehler');
  }
});

// Zugangscode prüfen
app.post('/verify-access', express.json(), (req, res) => {
  res.set('Content-Type', 'application/json');
  
  const { accessCode } = req.body;
  const sessionId = req.cookies.sessionId || createSession();
  
  console.log('Zugangscode-Versuch:', accessCode);
  
  if (accessCode === ACCESS_CODE) {
    // Session als authentifiziert markieren
    sessions.set(sessionId, { 
      createdAt: new Date(),
      authenticated: true
    });
    
    console.log('Zugangscode korrekt, Session authentifiziert:', sessionId);
    res.json({ success: true, sessionId });
  } else {
    console.log('Falscher Zugangscode');
    res.json({ success: false, message: 'Falscher Zugangscode' });
  }
});

// Hauptseite mit Karte
app.get('/', requireAuth, (req, res) => {
  const sessionId = req.query.sessionId || req.cookies.sessionId;
  
  res.send(`
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Susibert - Reisekarte</title>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body, html {
          margin: 0;
          padding: 0;
          height: 100%;
          font-family: Arial, sans-serif;
          background-color: #222;
          color: white;
        }
        
        .container {
          display: flex;
          height: 100vh;
        }
        
        .sidebar {
          width: 300px;
          background-color: #333;
          overflow-y: auto;
          padding: 15px;
          box-shadow: 2px 0 5px rgba(0, 0, 0, 0.2);
        }
        
        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        
        .header {
          background-color: #333;
          padding: 10px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .map-container {
          flex: 1;
          position: relative;
        }
        
        #map {
          width: 100%;
          height: 100%;
        }
        
        h1, h2 {
          color: #f2960c;
        }
        
        button {
          background-color: #f2960c;
          color: white;
          border: none;
          padding: 8px 15px;
          border-radius: 5px;
          cursor: pointer;
        }
        
        button:hover {
          background-color: #e08800;
        }
        
        .location-item {
          margin-bottom: 15px;
          padding: 10px;
          background-color: #444;
          border-radius: 5px;
          cursor: pointer;
        }
        
        .location-item:hover {
          background-color: #555;
        }
        
        .location-title {
          font-weight: bold;
          margin-bottom: 5px;
          color: #f2960c;
        }
        
        .location-thumbnail {
          width: 100%;
          height: 120px;
          object-fit: cover;
          border-radius: 5px;
          margin-top: 5px;
        }
        
        .form-container {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.7);
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        
        .form-box {
          background-color: #333;
          padding: 20px;
          border-radius: 10px;
          width: 90%;
          max-width: 400px;
        }
        
        .form-group {
          margin-bottom: 15px;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 5px;
        }
        
        .form-group input, .form-group textarea {
          width: 100%;
          padding: 8px;
          border-radius: 5px;
          border: 1px solid #555;
          background-color: #444;
          color: white;
          box-sizing: border-box;
        }
        
        .form-group textarea {
          min-height: 100px;
          resize: vertical;
        }
        
        .modal {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.7);
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        
        .modal-content {
          background-color: #333;
          padding: 20px;
          border-radius: 10px;
          width: 90%;
          max-width: 600px;
          max-height: 80vh;
          overflow-y: auto;
        }
        
        .modal-image {
          width: 100%;
          max-height: 400px;
          object-fit: contain;
          margin-bottom: 15px;
          border-radius: 5px;
        }
        
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 15px;
        }
        
        .loading {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 2000;
          color: white;
          font-size: 18px;
        }
        
        .loading-circle {
          border: 5px solid #f3f3f3;
          border-top: 5px solid #f2960c;
          border-radius: 50%;
          width: 30px;
          height: 30px;
          animation: spin 1s linear infinite;
          margin-right: 10px;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .leaflet-container {
          background-color: #2d3439;
        }
        
        .marker-pin {
          width: 30px;
          height: 30px;
          border-radius: 50% 50% 50% 0;
          background: #f2960c;
          position: absolute;
          transform: rotate(-45deg);
          left: 50%;
          top: 50%;
          margin: -15px 0 0 -15px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="sidebar">
          <h2>Orte</h2>
          <div id="location-list">
            <!-- Dynamisch gefüllte Ortsliste -->
            <div class="loading">
              <div class="loading-circle"></div>
              Lade Orte...
            </div>
          </div>
          <div style="margin-top: 20px;">
            <button id="add-location-btn">Neuen Ort hinzufügen</button>
            <button id="logout-btn" style="margin-top: 10px;">Abmelden</button>
          </div>
        </div>
        
        <div class="main-content">
          <div class="header">
            <h1>Susibert</h1>
            <div id="edit-mode-controls">
              <button id="toggle-edit-mode">Bearbeitungsmodus</button>
            </div>
          </div>
          
          <div class="map-container">
            <div id="map"></div>
          </div>
        </div>
      </div>
      
      <!-- Formular zum Hinzufügen/Bearbeiten eines Ortes -->
      <div class="form-container" id="location-form-container">
        <div class="form-box">
          <h2>Ort hinzufügen</h2>
          <form id="location-form" enctype="multipart/form-data">
            <input type="hidden" id="form-location-id" name="id">
            <input type="hidden" id="form-lat" name="latitude">
            <input type="hidden" id="form-lng" name="longitude">
            <input type="hidden" id="form-session-id" name="sessionId" value="${sessionId}">
            
            <div class="form-group">
              <label for="form-title">Titel</label>
              <input type="text" id="form-title" name="title" required>
            </div>
            
            <div class="form-group">
              <label for="form-description">Beschreibung (optional)</label>
              <textarea id="form-description" name="description"></textarea>
            </div>
            
            <div class="form-group">
              <label for="form-image">Bild</label>
              <input type="file" id="form-image" name="image" accept="image/*" required>
            </div>
            
            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
              <button type="button" id="cancel-form">Abbrechen</button>
              <button type="submit">Speichern</button>
            </div>
          </form>
        </div>
      </div>
      
      <!-- Modal für Ortsdetails -->
      <div class="modal" id="location-detail-modal">
        <div class="modal-content">
          <h2 id="detail-title">Ortsname</h2>
          <img id="detail-image" src="" alt="Ortsbild" class="modal-image">
          <div id="detail-description">Beschreibung wird hier angezeigt...</div>
          <div class="modal-actions">
            <button id="detail-edit-btn">Bearbeiten</button>
            <button id="detail-delete-btn" style="background-color: #e74c3c;">Löschen</button>
            <button id="detail-close-btn">Schließen</button>
          </div>
        </div>
      </div>
      
      <!-- Lösch-Bestätigungsdialog -->
      <div class="modal" id="delete-confirm-modal">
        <div class="modal-content">
          <h2 style="color: #e74c3c;">Ort löschen?</h2>
          <p>Bist du sicher, dass du diesen Ort löschen möchtest? Diese Aktion kann nicht rückgängig gemacht werden.</p>
          <div class="modal-actions">
            <button id="cancel-delete-btn">Abbrechen</button>
            <button id="confirm-delete-btn" style="background-color: #e74c3c;">Löschen</button>
          </div>
        </div>
      </div>
      
      <!-- Lade-Indikator -->
      <div class="loading" id="loading-indicator" style="display: none;">
        <div class="loading-circle"></div>
        <span id="loading-text">Wird geladen...</span>
      </div>
      
      <script>
        // Globale Variablen
        const sessionId = '${sessionId}';
        let map;
        let editMode = false;
        let markers = [];
        let tempMarker;
        let selectedLocationId = null;
        
        // Beim Laden der Seite
        document.addEventListener('DOMContentLoaded', function() {
          // Karte initialisieren
          initMap();
          
          // Locations laden
          loadLocations();
          
          // Event-Listener
          setupEventListeners();
        });
        
        // Karte initialisieren
        function initMap() {
          map = L.map('map').setView([20, 0], 2);
          
          // Dunkler Kartenstil
          L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            subdomains: 'abcd',
            minZoom: 2,
          }).addTo(map);
          
          // Klick-Event für Karte
          map.on('click', function(e) {
            if (editMode) {
              showAddLocationForm(e.latlng.lat, e.latlng.lng);
            }
          });
        }
        
        // Locations laden
        async function loadLocations() {
          try {
            showLoading('Orte werden geladen...');
            
            const response = await fetch(\`/api/locations?sessionId=\${sessionId}\`);
            
            if (!response.ok) {
              throw new Error('Fehler beim Laden der Orte');
            }
            
            const locations = await response.json();
            
            // Map leeren
            markers.forEach(marker => map.removeLayer(marker));
            markers = [];
            
            // Orte zur Karte und Liste hinzufügen
            const locationList = document.getElementById('location-list');
            locationList.innerHTML = '';
            
            if (locations.length === 0) {
              locationList.innerHTML = '<p>Noch keine Orte hinzugefügt</p>';
            } else {
              locations.forEach(location => {
                addLocationToMap(location);
                addLocationToList(location);
              });
            }
            
            hideLoading();
          } catch (error) {
            console.error('Fehler beim Laden der Orte:', error);
            hideLoading();
            alert('Fehler beim Laden der Orte: ' + error.message);
          }
        }
        
        // Ort zur Karte hinzufügen
        function addLocationToMap(location) {
          // Custom Icon
          const customIcon = L.divIcon({
            className: 'custom-marker',
            html: '<div class="marker-pin"></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
          });
          
          // Marker erstellen
          const marker = L.marker([location.latitude, location.longitude], {
            icon: customIcon
          }).addTo(map);
          
          // Gradient-Kreis um den Ort (50km)
          const circle = L.circle([location.latitude, location.longitude], {
            radius: 50000, // 50km
            color: '#f2960c',
            fillColor: '#f2960c',
            fillOpacity: 0.2,
            weight: 1
          }).addTo(map);
          
          // Klick-Handler
          marker.on('click', () => {
            showLocationDetail(location.id);
          });
          
          // Zum Array hinzufügen
          markers.push(marker);
          markers.push(circle);
        }
        
        // Ort zur Liste hinzufügen
        function addLocationToList(location) {
          const locationList = document.getElementById('location-list');
          
          const locationItem = document.createElement('div');
          locationItem.className = 'location-item';
          locationItem.innerHTML = \`
            <div class="location-title">\${location.title}</div>
            <img src="/direct-image/\${location.id}?sessionId=\${sessionId}" alt="\${location.title}" class="location-thumbnail">
          \`;
          
          locationItem.addEventListener('click', () => {
            showLocationDetail(location.id);
          });
          
          locationList.appendChild(locationItem);
        }
        
        // Ort-Detail anzeigen
        async function showLocationDetail(id) {
          try {
            showLoading('Details werden geladen...');
            
            const response = await fetch(\`/api/locations/\${id}?sessionId=\${sessionId}\`);
            
            if (!response.ok) {
              throw new Error('Fehler beim Laden der Ort-Details');
            }
            
            const location = await response.json();
            
            // Modal befüllen
            selectedLocationId = id;
            document.getElementById('detail-title').textContent = location.title;
            document.getElementById('detail-image').src = \`/direct-image/\${id}?sessionId=\${sessionId}&t=\${Date.now()}\`;
            document.getElementById('detail-description').textContent = location.description || 'Keine Beschreibung vorhanden';
            
            // Karte auf den Ort zentrieren
            map.setView([location.latitude, location.longitude], 8);
            
            // Modal anzeigen
            document.getElementById('location-detail-modal').style.display = 'flex';
            
            hideLoading();
          } catch (error) {
            console.error('Fehler beim Laden der Ort-Details:', error);
            hideLoading();
            alert('Fehler beim Laden der Ort-Details: ' + error.message);
          }
        }
        
        // Formular zum Hinzufügen eines Ortes anzeigen
        function showAddLocationForm(lat, lng) {
          // Wenn bereits ein temporärer Marker existiert, entfernen
          if (tempMarker) {
            map.removeLayer(tempMarker);
          }
          
          // Temporären Marker setzen
          const customIcon = L.divIcon({
            className: 'custom-marker',
            html: '<div class="marker-pin"></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
          });
          
          tempMarker = L.marker([lat, lng], {
            icon: customIcon
          }).addTo(map);
          
          // Formular zurücksetzen
          document.getElementById('location-form').reset();
          document.getElementById('form-location-id').value = '';
          document.getElementById('form-lat').value = lat;
          document.getElementById('form-lng').value = lng;
          document.getElementById('form-image').required = true;
          
          // Titel anpassen
          document.querySelector('.form-box h2').textContent = 'Ort hinzufügen';
          
          // Formular anzeigen
          document.getElementById('location-form-container').style.display = 'flex';
        }
        
        // Formular zum Bearbeiten eines Ortes anzeigen
        async function showEditLocationForm(id) {
          try {
            showLoading('Daten werden geladen...');
            
            const response = await fetch(\`/api/locations/\${id}?sessionId=\${sessionId}\`);
            
            if (!response.ok) {
              throw new Error('Fehler beim Laden der Ort-Daten');
            }
            
            const location = await response.json();
            
            // Wenn bereits ein temporärer Marker existiert, entfernen
            if (tempMarker) {
              map.removeLayer(tempMarker);
            }
            
            // Formular befüllen
            document.getElementById('form-location-id').value = id;
            document.getElementById('form-lat').value = location.latitude;
            document.getElementById('form-lng').value = location.longitude;
            document.getElementById('form-title').value = location.title;
            document.getElementById('form-description').value = location.description || '';
            
            // Bild ist beim Bearbeiten optional
            document.getElementById('form-image').required = false;
            
            // Titel anpassen
            document.querySelector('.form-box h2').textContent = 'Ort bearbeiten';
            
            // Formular anzeigen
            document.getElementById('location-form-container').style.display = 'flex';
            
            hideLoading();
          } catch (error) {
            console.error('Fehler beim Laden der Ort-Daten:', error);
            hideLoading();
            alert('Fehler beim Laden der Ort-Daten: ' + error.message);
          }
        }
        
        // Ort löschen
        async function deleteLocation(id) {
          try {
            showLoading('Ort wird gelöscht...');
            
            const response = await fetch(\`/api/locations/\${id}?sessionId=\${sessionId}\`, {
              method: 'DELETE'
            });
            
            if (!response.ok) {
              throw new Error('Fehler beim Löschen des Ortes');
            }
            
            const result = await response.json();
            
            if (result.success) {
              // Detailansicht schließen
              document.getElementById('location-detail-modal').style.display = 'none';
              
              // Bestätigungsdialog schließen
              document.getElementById('delete-confirm-modal').style.display = 'none';
              
              // Orte neu laden
              loadLocations();
              
              selectedLocationId = null;
            } else {
              throw new Error(result.message || 'Unbekannter Fehler');
            }
            
            hideLoading();
          } catch (error) {
            console.error('Fehler beim Löschen des Ortes:', error);
            hideLoading();
            alert('Fehler beim Löschen des Ortes: ' + error.message);
          }
        }
        
        // Event-Listener einrichten
        function setupEventListeners() {
          // Toggle Edit-Mode
          document.getElementById('toggle-edit-mode').addEventListener('click', function() {
            editMode = !editMode;
            
            if (editMode) {
              this.textContent = 'Bearbeitungsmodus beenden';
              this.style.backgroundColor = '#e08800';
            } else {
              this.textContent = 'Bearbeitungsmodus';
              this.style.backgroundColor = '#f2960c';
              
              // Temporären Marker entfernen, falls vorhanden
              if (tempMarker) {
                map.removeLayer(tempMarker);
                tempMarker = null;
              }
            }
          });
          
          // Neuen Ort hinzufügen Button
          document.getElementById('add-location-btn').addEventListener('click', function() {
            if (!editMode) {
              // Automatisch in den Edit-Modus wechseln
              editMode = true;
              document.getElementById('toggle-edit-mode').textContent = 'Bearbeitungsmodus beenden';
              document.getElementById('toggle-edit-mode').style.backgroundColor = '#e08800';
            }
            
            alert('Klicke nun auf die Karte, um einen neuen Ort hinzuzufügen');
          });
          
          // Formular abbrechen
          document.getElementById('cancel-form').addEventListener('click', function() {
            document.getElementById('location-form-container').style.display = 'none';
            
            // Temporären Marker entfernen
            if (tempMarker) {
              map.removeLayer(tempMarker);
              tempMarker = null;
            }
          });
          
          // Formular absenden
          document.getElementById('location-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const locationId = document.getElementById('form-location-id').value;
            
            showLoading('Ort wird gespeichert...');
            
            try {
              let url, method;
              
              if (locationId) {
                // Ort bearbeiten
                url = \`/api/locations/\${locationId}?sessionId=\${sessionId}\`;
                method = 'PUT';
              } else {
                // Neuen Ort erstellen
                url = \`/api/locations?sessionId=\${sessionId}\`;
                method = 'POST';
              }
              
              const response = await fetch(url, {
                method: method,
                body: formData
              });
              
              if (!response.ok) {
                throw new Error('Fehler beim Speichern');
              }
              
              const result = await response.json();
              
              if (result.success) {
                // Formular schließen
                document.getElementById('location-form-container').style.display = 'none';
                
                // Temporären Marker entfernen
                if (tempMarker) {
                  map.removeLayer(tempMarker);
                  tempMarker = null;
                }
                
                // Orte neu laden
                loadLocations();
              } else {
                throw new Error(result.message || 'Unbekannter Fehler');
              }
            } catch (error) {
              console.error('Fehler beim Speichern des Ortes:', error);
              alert('Fehler beim Speichern des Ortes: ' + error.message);
            }
            
            hideLoading();
          });
          
          // Detail-Modal schließen
          document.getElementById('detail-close-btn').addEventListener('click', function() {
            document.getElementById('location-detail-modal').style.display = 'none';
            selectedLocationId = null;
          });
          
          // Ort bearbeiten Button (im Detail-Modal)
          document.getElementById('detail-edit-btn').addEventListener('click', function() {
            if (selectedLocationId) {
              document.getElementById('location-detail-modal').style.display = 'none';
              showEditLocationForm(selectedLocationId);
            }
          });
          
          // Ort löschen Button (im Detail-Modal)
          document.getElementById('detail-delete-btn').addEventListener('click', function() {
            if (selectedLocationId) {
              document.getElementById('location-detail-modal').style.display = 'none';
              document.getElementById('delete-confirm-modal').style.display = 'flex';
            }
          });
          
          // Löschen bestätigen
          document.getElementById('confirm-delete-btn').addEventListener('click', function() {
            if (selectedLocationId) {
              deleteLocation(selectedLocationId);
            }
          });
          
          // Löschen abbrechen
          document.getElementById('cancel-delete-btn').addEventListener('click', function() {
            document.getElementById('delete-confirm-modal').style.display = 'none';
            document.getElementById('location-detail-modal').style.display = 'flex';
          });
          
          // Logout
          document.getElementById('logout-btn').addEventListener('click', function() {
            window.location.href = '/logout';
          });
        }
        
        // Lade-Indikator anzeigen
        function showLoading(text = 'Wird geladen...') {
          document.getElementById('loading-text').textContent = text;
          document.getElementById('loading-indicator').style.display = 'flex';
        }
        
        // Lade-Indikator verbergen
        function hideLoading() {
          document.getElementById('loading-indicator').style.display = 'none';
        }
      </script>
    </body>
    </html>
  `);
});

// Abmelden
app.get('/logout', (req, res) => {
  const sessionId = req.cookies.sessionId;
  
  if (sessionId && sessions.has(sessionId)) {
    // Session auf nicht authentifiziert setzen
    sessions.set(sessionId, { 
      createdAt: new Date(),
      authenticated: false 
    });
  }
  
  res.redirect('/login');
});

// Bild komprimieren
async function compressImage(buffer, mimeType) {
  console.log(`Komprimiere Bild (${buffer.length} Bytes, Typ: ${mimeType})`);
  
  try {
    // Wenn es ein HEIC/HEIF Format ist, zu JPEG konvertieren
    if (mimeType.includes('heic') || mimeType.includes('heif')) {
      console.log('HEIC/HEIF Bild erkannt, konvertiere zu JPEG');
      
      const convertedBuffer = await sharp(buffer)
        .jpeg({ quality: 80 })
        .toBuffer();
      
      console.log(`HEIC/HEIF konvertiert zu JPEG (${convertedBuffer.length} Bytes)`);
      return {
        buffer: convertedBuffer,
        mimeType: 'image/jpeg'
      };
    }
    
    // Für JPEGs, optimieren wir die Qualität
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      const optimizedBuffer = await sharp(buffer)
        .jpeg({ quality: 80 })
        .toBuffer();
      
      console.log(`JPEG komprimiert von ${buffer.length} auf ${optimizedBuffer.length} Bytes`);
      return {
        buffer: optimizedBuffer,
        mimeType: mimeType
      };
    }
    
    // Für PNGs, konvertieren wir zu JPEG wenn sie größer als 1MB sind
    if (mimeType.includes('png') && buffer.length > 1024 * 1024) {
      const convertedBuffer = await sharp(buffer)
        .jpeg({ quality: 80 })
        .toBuffer();
      
      console.log(`Großes PNG zu JPEG konvertiert: ${buffer.length} → ${convertedBuffer.length} Bytes`);
      return {
        buffer: convertedBuffer,
        mimeType: 'image/jpeg'
      };
    }
    
    // Für alle anderen Formate, geben wir das Original zurück
    return {
      buffer: buffer,
      mimeType: mimeType
    };
  } catch (error) {
    console.error('Fehler bei der Bildkompression:', error);
    return {
      buffer: buffer,
      mimeType: mimeType
    }; // Fallback auf Original bei Fehler
  }
}

// API-Routen

// Direktes Bild abrufen
app.get('/direct-image/:id', async (req, res) => {
  console.log(`Bild mit ID ${req.params.id} angefordert`);
  try {
    const id = req.params.id;
    
    // Datenbank-Verbindung herstellen
    const client = await pool.connect();
    
    // Bild abrufen
    const result = await client.query('SELECT image, image_type FROM locations WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      client.release();
      return res.status(404).send('Bild nicht gefunden');
    }
    
    // Bild-Daten
    const imageBase64 = result.rows[0].image;
    const imageType = result.rows[0].image_type || 'image/jpeg';
    
    if (!imageBase64) {
      client.release();
      return res.status(404).send('Bild ist leer');
    }
    
    // Buffer erstellen
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    
    // Content-Type setzen
    res.set('Content-Type', imageType);
    
    // Cache verhindern
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    
    // Bild direkt senden
    client.release();
    res.end(imageBuffer);
    
  } catch (err) {
    console.error('Fehler beim Abrufen des Bildes:', err);
    res.status(500).send(`Fehler: ${err.message}`);
  }
});

// Alle Locations abrufen
app.get('/api/locations', requireAuth, async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT id, title, latitude, longitude FROM locations ORDER BY id DESC');
    client.release();
    
    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der Locations:', error);
    res.status(500).json({ success: false, message: 'Datenbankfehler' });
  }
});

// Location abrufen
app.get('/api/locations/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const client = await pool.connect();
    const result = await client.query('SELECT id, title, description, latitude, longitude FROM locations WHERE id = $1', [id]);
    client.release();
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ort nicht gefunden' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fehler beim Abrufen der Location:', error);
    res.status(500).json({ success: false, message: 'Datenbankfehler' });
  }
});

// Location erstellen
app.post('/api/locations', requireAuth, upload.single('image'), async (req, res) => {
  console.log('POST /api/locations aufgerufen');
  console.log('Request Body:', req.body);
  console.log('File:', req.file ? `Vorhanden (${req.file.size} Bytes, ${req.file.mimetype})` : 'Nicht vorhanden');
  
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Bild ist erforderlich' });
    }
    
    const { title, description, latitude, longitude } = req.body;
    
    console.log(`Titel: ${title}, Lat: ${latitude}, Lng: ${longitude}, Beschreibung: ${description}`);
    
    if (!title || !latitude || !longitude) {
      return res.status(400).json({ success: false, message: 'Titel, Breitengrad und Längengrad sind erforderlich' });
    }
    
    // Bild verarbeiten
    const imageBuffer = req.file.buffer;
    const imageType = req.file.mimetype;
    
    console.log(`Originalbild: ${imageBuffer.length} Bytes, Typ: ${imageType}`);
    
    // Bild komprimieren
    const compressedImage = await compressImage(imageBuffer, imageType);
    
    // Base64-Kodierung
    const imageBase64 = compressedImage.buffer.toString('base64');
    
    // In Datenbank speichern
    const client = await pool.connect();
    const result = await client.query(
      'INSERT INTO locations (title, description, latitude, longitude, image, image_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [title, description, latitude, longitude, imageBase64, compressedImage.mimeType]
    );
    client.release();
    
    console.log(`Location erstellt mit ID: ${result.rows[0].id}`);
    
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Fehler beim Erstellen der Location:', error);
    res.status(500).json({ success: false, message: 'Serverfehler: ' + error.message });
  }
});

// Location aktualisieren
app.put('/api/locations/:id', requireAuth, upload.single('image'), async (req, res) => {
  console.log(`PUT /api/locations/${req.params.id} aufgerufen`);
  console.log('Request Body:', req.body);
  console.log('File:', req.file ? `Vorhanden (${req.file.size} Bytes, ${req.file.mimetype})` : 'Nicht vorhanden');
  
  try {
    const { id } = req.params;
    const { title, description, latitude, longitude } = req.body;
    
    if (!title || !latitude || !longitude) {
      return res.status(400).json({ success: false, message: 'Titel, Breitengrad und Längengrad sind erforderlich' });
    }
    
    const client = await pool.connect();
    
    // Prüfen, ob Location existiert
    const checkResult = await client.query('SELECT id FROM locations WHERE id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      client.release();
      return res.status(404).json({ success: false, message: 'Ort nicht gefunden' });
    }
    
    // Wenn ein neues Bild hochgeladen wurde, verarbeiten
    if (req.file) {
      const imageBuffer = req.file.buffer;
      const imageType = req.file.mimetype;
      
      // Bild komprimieren
      const compressedImage = await compressImage(imageBuffer, imageType);
      
      // Base64-Kodierung
      const imageBase64 = compressedImage.buffer.toString('base64');
      
      // Mit neuem Bild aktualisieren
      await client.query(
        'UPDATE locations SET title = $1, description = $2, latitude = $3, longitude = $4, image = $5, image_type = $6 WHERE id = $7',
        [title, description, latitude, longitude, imageBase64, compressedImage.mimeType, id]
      );
    } else {
      // Ohne Bild aktualisieren
      await client.query(
        'UPDATE locations SET title = $1, description = $2, latitude = $3, longitude = $4 WHERE id = $5',
        [title, description, latitude, longitude, id]
      );
    }
    
    client.release();
    
    console.log(`Location ${id} aktualisiert`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Location:', error);
    res.status(500).json({ success: false, message: 'Serverfehler: ' + error.message });
  }
});

// Location löschen
app.delete('/api/locations/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const client = await pool.connect();
    
    // Prüfen, ob Location existiert
    const checkResult = await client.query('SELECT id FROM locations WHERE id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      client.release();
      return res.status(404).json({ success: false, message: 'Ort nicht gefunden' });
    }
    
    // Location löschen
    await client.query('DELETE FROM locations WHERE id = $1', [id]);
    
    client.release();
    
    res.json({ success: true });
  } catch (error) {
    console.error('Fehler beim Löschen der Location:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// Server starten
async function startServer() {
  try {
    // Verbindung zur Datenbank testen
    const client = await pool.connect();
    console.log('✅ Datenbank-Verbindung erfolgreich');
    
    // Tabellen-Existenz prüfen
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'locations'
      );
    `);
    
    const tableExists = tableCheck.rows[0].exists;
    console.log(`Tabelle 'locations' existiert: ${tableExists}`);
    
    // Tabelle erstellen, falls sie nicht existiert
    if (!tableExists) {
      console.log('Erstelle Tabelle "locations"...');
      
      await client.query(`
        CREATE TABLE locations (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          latitude DECIMAL(9,6) NOT NULL,
          longitude DECIMAL(9,6) NOT NULL,
          image TEXT,
          image_type VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      console.log('Tabelle "locations" wurde erstellt');
    } else {
      // Prüfen, ob die image_type-Spalte existiert
      const columnCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'locations' AND column_name = 'image_type'
        );
      `);
      
      const columnExists = columnCheck.rows[0].exists;
      
      if (!columnExists) {
        console.log('Füge Spalte "image_type" zur Tabelle "locations" hinzu...');
        
        await client.query(`
          ALTER TABLE locations 
          ADD COLUMN image_type VARCHAR(50);
        `);
        
        console.log('Spalte "image_type" wurde hinzugefügt');
      }
    }
    
    client.release();
    
    // Server starten
    app.listen(port, () => {
      console.log(`
      ===================================
      🌍 Susibert Karten-Server ohne Thumbnail läuft auf Port ${port}
      ===================================
      `);
    });
  } catch (err) {
    console.error('❌ Fehler beim Starten des Servers:', err);
    process.exit(1);
  }
}

// Server starten
startServer();