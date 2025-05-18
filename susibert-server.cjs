// Optimierter Server für Susibert (vereinfacht aus dem original TravelChronicles)
// CommonJS Format (.cjs) für Kompatibilität mit "type": "module" in package.json
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const sharp = require('sharp');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

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
          <img src="/couple-image" alt="Pärchenbild" class="couple-image" onerror="this.src='/direct-image/26'">
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
            const response = await fetch('/verify-access', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ accessCode })
            });
            
            const data = await response.json();
            
            if (data.success) {
              window.location.href = '/?sessionId=' + data.sessionId;
            } else {
              document.getElementById('error-message').textContent = 'Falscher Zugangscode';
            }
          } catch (error) {
            document.getElementById('error-message').textContent = 'Ein Fehler ist aufgetreten';
            console.error('Login error:', error);
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Pärchenbild Route
app.get('/couple-image', async (req, res) => {
  try {
    // Versuche zuerst ein Bild aus der Datenbank zu laden
    const client = await pool.connect();
    
    // Prüfe, ob Tabelle couple_image existiert
    try {
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'couple_image'
        );
      `);
      
      if (tableCheck.rows[0].exists) {
        const result = await client.query('SELECT * FROM couple_image LIMIT 1');
        
        if (result.rows.length > 0 && result.rows[0].image) {
          const imageBase64 = result.rows[0].image;
          const imageType = result.rows[0].image_type || 'image/jpeg';
          
          const imageBuffer = Buffer.from(imageBase64, 'base64');
          
          res.set('Content-Type', imageType);
          res.set('Cache-Control', 'public, max-age=86400'); // 1 Tag Caching
          client.release();
          return res.end(imageBuffer);
        }
      }
    } catch (err) {
      console.error('Fehler beim Prüfen der couple_image Tabelle:', err);
    }
    
    // Plan B: Versuche ein Bild aus der locations Tabelle zu holen
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
      console.error('Fehler beim Abrufen eines Backup-Bildes:', err);
    }
    
    client.release();
    
    // Kein Bild gefunden
    res.status(404).send('Kein Pärchenbild gefunden');
  } catch (error) {
    console.error('Fehler beim Laden des Pärchenbilds:', error);
    res.status(500).send('Fehler beim Laden des Bildes');
  }
});

// Zugangscode prüfen
app.post('/verify-access', express.json(), (req, res) => {
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

// Hauptseite (Map)
app.get('/', requireAuth, async (req, res) => {
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
          overflow: hidden;
        }
        .container {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 20px;
          background-color: #333;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
          z-index: 1000;
        }
        .logo {
          font-size: 1.5rem;
          font-weight: bold;
          color: #f2960c;
        }
        .header-actions {
          display: flex;
          gap: 10px;
        }
        .button {
          background-color: #444;
          color: white;
          border: none;
          padding: 8px 15px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: background-color 0.3s;
        }
        .button:hover {
          background-color: #555;
        }
        .button.primary {
          background-color: #f2960c;
        }
        .button.primary:hover {
          background-color: #e08800;
        }
        .button.danger {
          background-color: #e74c3c;
        }
        .button.danger:hover {
          background-color: #c0392b;
        }
        .map-container {
          flex: 1;
          width: 90%;
          margin: 0 auto;
          position: relative;
          overflow: hidden;
          border-radius: 10px;
          margin-top: 20px;
          margin-bottom: 20px;
          border: 2px solid #444;
        }
        #map {
          height: 100%;
          z-index: 1;
          background-color: #333;
        }
        .sidebar {
          position: fixed;
          top: 0;
          right: -320px;
          width: 320px;
          height: 100%;
          background-color: #333;
          box-shadow: -2px 0 5px rgba(0, 0, 0, 0.3);
          transition: right 0.3s ease;
          z-index: 2000;
          overflow-y: auto;
          padding-bottom: 120px;
        }
        .sidebar.open {
          right: 0;
        }
        .sidebar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px;
          background-color: #444;
          border-bottom: 1px solid #555;
        }
        .sidebar-title {
          font-size: 1.2rem;
          font-weight: bold;
          color: #f2960c;
        }
        .sidebar-close {
          background: none;
          border: none;
          color: white;
          font-size: 1.5rem;
          cursor: pointer;
        }
        .location-list {
          padding: 15px;
        }
        .location-item {
          margin-bottom: 15px;
          padding: 10px;
          background-color: #444;
          border-radius: 5px;
          cursor: pointer;
          transition: transform 0.2s;
        }
        .location-item:hover {
          transform: translateY(-2px);
          background-color: #555;
        }
        .location-item h3 {
          margin: 0 0 5px 0;
          color: #f2960c;
        }
        .location-thumbnail {
          width: 100%;
          height: 120px;
          object-fit: cover;
          border-radius: 5px;
          margin-top: 5px;
        }
        .hamburger {
          cursor: pointer;
          font-size: 1.5rem;
        }
        .form-container {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.7);
          z-index: 3000;
          justify-content: center;
          align-items: center;
        }
        .form-box {
          background-color: #333;
          padding: 20px;
          border-radius: 10px;
          width: 90%;
          max-width: 400px;
        }
        .form-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }
        .form-title {
          font-size: 1.2rem;
          color: #f2960c;
        }
        .form-close {
          background: none;
          border: none;
          color: white;
          font-size: 1.5rem;
          cursor: pointer;
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
          padding: 10px;
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
        .form-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
        .edit-mode-indicator {
          display: none;
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background-color: rgba(242, 150, 12, 0.8);
          color: white;
          padding: 10px 20px;
          border-radius: 20px;
          font-weight: bold;
          z-index: 1500;
        }
        .location-detail {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.7);
          z-index: 3000;
          justify-content: center;
          align-items: center;
        }
        .detail-box {
          background-color: #333;
          padding: 20px;
          border-radius: 10px;
          width: 90%;
          max-width: 600px;
          max-height: 80vh;
          overflow-y: auto;
        }
        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }
        .detail-title {
          font-size: 1.5rem;
          color: #f2960c;
        }
        .detail-close {
          background: none;
          border: none;
          color: white;
          font-size: 1.5rem;
          cursor: pointer;
        }
        .detail-image {
          width: 100%;
          max-height: 400px;
          object-fit: contain;
          border-radius: 5px;
          margin-bottom: 15px;
        }
        .detail-description {
          margin-bottom: 20px;
          line-height: 1.5;
        }
        .detail-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
        .sidebar-actions {
          padding: 15px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        /* Leaflet-spezifische Anpassungen */
        .leaflet-container {
          background-color: #2d3439;
        }
        .leaflet-control-zoom a {
          background-color: #444;
          color: #fff;
        }
        .leaflet-control-zoom a:hover {
          background-color: #555;
        }
        .leaflet-control-layers {
          background-color: #333;
          color: #fff;
        }
        .leaflet-control-layers-toggle {
          background-color: #444;
        }
        .leaflet-control-attribution {
          background-color: rgba(51, 51, 51, 0.8) !important;
          color: #aaa !important;
        }
        .confirmation-dialog {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.7);
          z-index: 4000;
          justify-content: center;
          align-items: center;
        }
        .confirmation-box {
          background-color: #333;
          padding: 20px;
          border-radius: 10px;
          width: 90%;
          max-width: 400px;
        }
        .confirmation-title {
          font-size: 1.2rem;
          color: #e74c3c;
          margin-bottom: 15px;
        }
        .confirmation-message {
          margin-bottom: 20px;
        }
        .confirmation-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
        /* Markierungs-Stil */
        .location-marker {
          filter: hue-rotate(25deg);
        }
        .marker-pin {
          border-radius: 50% 50% 50% 0;
          background-color: #f2960c;
          width: 30px;
          height: 30px;
          position: absolute;
          transform: rotate(-45deg);
          left: 50%;
          top: 50%;
          margin: -15px 0 0 -15px;
        }
        .marker-pin::after {
          content: '';
          width: 18px;
          height: 18px;
          margin: 6px 0 0 6px;
          background-color: #444;
          position: absolute;
          border-radius: 50%;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Susibert</div>
          <div class="header-actions">
            <button id="toggle-edit-mode" class="button">Bearbeiten</button>
            <button id="toggle-sidebar" class="hamburger">☰</button>
          </div>
        </div>
        
        <div class="map-container">
          <div id="map"></div>
        </div>
        
        <div class="edit-mode-indicator">
          Bearbeitungsmodus aktiv
        </div>
      </div>
      
      <div class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-title">Orte</div>
          <button class="sidebar-close">×</button>
        </div>
        
        <div class="location-list" id="location-list">
          <!-- Wird dynamisch gefüllt -->
        </div>
        
        <div class="sidebar-actions">
          <button id="add-location-button" class="button primary">Neuen Ort hinzufügen</button>
          <button id="logout-button" class="button">Abmelden</button>
          <button id="admin-button" class="button">Admin-Bereich</button>
        </div>
      </div>
      
      <div class="form-container" id="location-form-container">
        <div class="form-box">
          <div class="form-header">
            <div class="form-title">Ort hinzufügen</div>
            <button class="form-close">×</button>
          </div>
          
          <form id="location-form" enctype="multipart/form-data">
            <input type="hidden" id="form-lat" name="latitude">
            <input type="hidden" id="form-lng" name="longitude">
            <input type="hidden" id="form-location-id" name="id">
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
            
            <div class="form-buttons">
              <button type="button" class="button" id="cancel-form">Abbrechen</button>
              <button type="submit" class="button primary">Speichern</button>
            </div>
          </form>
        </div>
      </div>
      
      <div class="location-detail" id="location-detail">
        <div class="detail-box">
          <div class="detail-header">
            <div class="detail-title" id="detail-title">Ortsname</div>
            <button class="detail-close">×</button>
          </div>
          
          <img class="detail-image" id="detail-image" src="" alt="Ortsbild">
          
          <div class="detail-description" id="detail-description">
            Beschreibung wird hier angezeigt...
          </div>
          
          <div class="detail-actions">
            <button class="button" id="detail-edit">Bearbeiten</button>
            <button class="button danger" id="detail-delete">Löschen</button>
          </div>
        </div>
      </div>
      
      <div class="confirmation-dialog" id="delete-confirmation">
        <div class="confirmation-box">
          <div class="confirmation-title">Ort löschen</div>
          <div class="confirmation-message">
            Bist du sicher, dass du diesen Ort löschen möchtest? Diese Aktion kann nicht rückgängig gemacht werden.
          </div>
          <div class="confirmation-buttons">
            <button class="button" id="cancel-delete">Abbrechen</button>
            <button class="button danger" id="confirm-delete">Löschen</button>
          </div>
        </div>
      </div>
      
      <script>
        // Sessionverwaltung
        const sessionId = "${sessionId}";
        let editMode = false;
        let selectedLocationId = null;
        let map, locationsLayer, tempMarker;
        
        // Karte initialisieren
        function initMap() {
          map = L.map('map', {
            center: [20, 0],
            zoom: 2,
            minZoom: 2,
            maxBounds: [
              [-90, -180],
              [90, 180]
            ],
            maxBoundsViscosity: 1.0
          });
          
          // Dunkler Kartenstil
          L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            subdomains: 'abcd',
          }).addTo(map);
          
          // Layer für Locations
          locationsLayer = L.layerGroup().addTo(map);
          
          // Klick-Handler für Kartenklicks
          map.on('click', function(e) {
            if (editMode) {
              showAddLocationForm(e.latlng.lat, e.latlng.lng);
            }
          });
          
          // Alle vorhandenen Locations laden
          loadLocations();
        }
        
        // Locations von der API laden
        async function loadLocations() {
          try {
            const response = await fetch(\`/api/locations?sessionId=\${sessionId}\`);
            if (!response.ok) throw new Error('Fehler beim Laden der Orte');
            
            const locations = await response.json();
            
            // Sidebar-Liste leeren
            document.getElementById('location-list').innerHTML = '';
            
            // Locations-Layer leeren
            locationsLayer.clearLayers();
            
            // Locations anzeigen
            locations.forEach(location => {
              addLocationToMap(location);
              addLocationToSidebar(location);
            });
          } catch (error) {
            console.error('Fehler beim Laden der Locations:', error);
            alert('Fehler beim Laden der Orte. Bitte später erneut versuchen.');
          }
        }
        
        // Location zur Karte hinzufügen
        function addLocationToMap(location) {
          // Custom Icon für den Marker
          const customIcon = L.divIcon({
            className: 'location-marker',
            html: '<div class="marker-pin"></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
          });
          
          // Marker erstellen
          const marker = L.marker([location.latitude, location.longitude], {
            icon: customIcon
          }).addTo(locationsLayer);
          
          // Gradient-Kreis um den Ort (50km)
          const circle = L.circle([location.latitude, location.longitude], {
            radius: 50000, // 50km
            color: '#f2960c',
            fillColor: '#f2960c',
            fillOpacity: 0.2,
            weight: 1
          }).addTo(locationsLayer);
          
          // Klick-Handler für Marker
          marker.on('click', () => {
            showLocationDetail(location.id);
          });
        }
        
        // Location zur Sidebar hinzufügen
        function addLocationToSidebar(location) {
          const locationList = document.getElementById('location-list');
          
          const locationItem = document.createElement('div');
          locationItem.className = 'location-item';
          locationItem.innerHTML = \`
            <h3>\${location.title}</h3>
            <img src="/direct-image/\${location.id}?sessionId=\${sessionId}" 
                 alt="\${location.title}" 
                 class="location-thumbnail">
          \`;
          
          locationItem.addEventListener('click', () => {
            showLocationDetail(location.id);
          });
          
          locationList.appendChild(locationItem);
        }
        
        // Location-Detail anzeigen
        async function showLocationDetail(id) {
          try {
            selectedLocationId = id;
            
            const response = await fetch(\`/api/locations/\${id}?sessionId=\${sessionId}\`);
            if (!response.ok) throw new Error('Fehler beim Laden der Ort-Details');
            
            const location = await response.json();
            
            document.getElementById('detail-title').textContent = location.title;
            document.getElementById('detail-image').src = \`/direct-image/\${id}?sessionId=\${sessionId}&t=\${Date.now()}\`;
            document.getElementById('detail-description').textContent = location.description || 'Keine Beschreibung vorhanden';
            
            document.getElementById('location-detail').style.display = 'flex';
            
            // Karte auf den Ort zentrieren, aber nicht zoomen
            map.panTo([location.latitude, location.longitude]);
          } catch (error) {
            console.error('Fehler beim Laden der Location-Details:', error);
            alert('Fehler beim Laden der Ort-Details.');
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
            className: 'location-marker',
            html: '<div class="marker-pin"></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
          });
          
          tempMarker = L.marker([lat, lng], {
            icon: customIcon
          }).addTo(map);
          
          // Formularfelder zurücksetzen
          document.getElementById('form-location-id').value = '';
          document.getElementById('form-lat').value = lat;
          document.getElementById('form-lng').value = lng;
          document.getElementById('form-title').value = '';
          document.getElementById('form-description').value = '';
          document.getElementById('form-image').value = '';
          document.getElementById('form-session-id').value = sessionId;
          
          // Formular anzeigen
          document.getElementById('location-form-container').style.display = 'flex';
        }
        
        // Event-Listener registrieren
        document.addEventListener('DOMContentLoaded', function() {
          // Karte initialisieren
          initMap();
          
          // Sidebar Toggle
          document.getElementById('toggle-sidebar').addEventListener('click', function() {
            document.querySelector('.sidebar').classList.add('open');
          });
          
          document.querySelector('.sidebar-close').addEventListener('click', function() {
            document.querySelector('.sidebar').classList.remove('open');
          });
          
          // Bearbeitungsmodus Toggle
          document.getElementById('toggle-edit-mode').addEventListener('click', function() {
            editMode = !editMode;
            
            if (editMode) {
              this.textContent = 'Bearbeiten beenden';
              this.classList.add('primary');
              document.querySelector('.edit-mode-indicator').style.display = 'block';
            } else {
              this.textContent = 'Bearbeiten';
              this.classList.remove('primary');
              document.querySelector('.edit-mode-indicator').style.display = 'none';
              
              // Temporären Marker entfernen, falls vorhanden
              if (tempMarker) {
                map.removeLayer(tempMarker);
                tempMarker = null;
              }
            }
          });
          
          // Neuer Ort Button (Sidebar)
          document.getElementById('add-location-button').addEventListener('click', function() {
            if (!editMode) {
              editMode = true;
              document.getElementById('toggle-edit-mode').textContent = 'Bearbeiten beenden';
              document.getElementById('toggle-edit-mode').classList.add('primary');
              document.querySelector('.edit-mode-indicator').style.display = 'block';
            }
            
            // Sidebar schließen
            document.querySelector('.sidebar').classList.remove('open');
            
            alert('Klicke nun auf die Karte, um einen neuen Ort hinzuzufügen.');
          });
          
          // Formular schließen
          document.querySelector('#location-form-container .form-close').addEventListener('click', function() {
            document.getElementById('location-form-container').style.display = 'none';
            
            // Temporären Marker entfernen
            if (tempMarker) {
              map.removeLayer(tempMarker);
              tempMarker = null;
            }
          });
          
          document.getElementById('cancel-form').addEventListener('click', function() {
            document.getElementById('location-form-container').style.display = 'none';
            
            // Temporären Marker entfernen
            if (tempMarker) {
              map.removeLayer(tempMarker);
              tempMarker = null;
            }
          });
          
          // Detail-Ansicht schließen
          document.querySelector('#location-detail .detail-close').addEventListener('click', function() {
            document.getElementById('location-detail').style.display = 'none';
            selectedLocationId = null;
          });
          
          // Bearbeiten-Button in der Detail-Ansicht
          document.getElementById('detail-edit').addEventListener('click', function() {
            if (!selectedLocationId) return;
            
            fetch(\`/api/locations/\${selectedLocationId}?sessionId=\${sessionId}\`)
              .then(response => response.json())
              .then(location => {
                // Detail-Ansicht schließen
                document.getElementById('location-detail').style.display = 'none';
                
                // Formular mit Daten füllen
                document.getElementById('form-location-id').value = location.id;
                document.getElementById('form-lat').value = location.latitude;
                document.getElementById('form-lng').value = location.longitude;
                document.getElementById('form-title').value = location.title;
                document.getElementById('form-description').value = location.description || '';
                document.getElementById('form-session-id').value = sessionId;
                
                // Bild ist optional beim Bearbeiten
                document.getElementById('form-image').removeAttribute('required');
                
                // Formular anzeigen
                document.getElementById('location-form-container').style.display = 'flex';
              })
              .catch(error => {
                console.error('Fehler beim Laden der Location-Daten:', error);
                alert('Fehler beim Laden der Ort-Daten.');
              });
          });
          
          // Löschen-Button in der Detail-Ansicht
          document.getElementById('detail-delete').addEventListener('click', function() {
            if (!selectedLocationId) return;
            
            // Bestätigungsdialog anzeigen
            document.getElementById('delete-confirmation').style.display = 'flex';
          });
          
          // Löschen abbrechen
          document.getElementById('cancel-delete').addEventListener('click', function() {
            document.getElementById('delete-confirmation').style.display = 'none';
          });
          
          // Löschen bestätigen
          document.getElementById('confirm-delete').addEventListener('click', function() {
            if (!selectedLocationId) return;
            
            fetch(\`/api/locations/\${selectedLocationId}?sessionId=\${sessionId}\`, {
              method: 'DELETE'
            })
              .then(response => {
                if (!response.ok) throw new Error('Fehler beim Löschen');
                return response.json();
              })
              .then(data => {
                if (data.success) {
                  // Bestätigungsdialog schließen
                  document.getElementById('delete-confirmation').style.display = 'none';
                  
                  // Detail-Ansicht schließen
                  document.getElementById('location-detail').style.display = 'none';
                  
                  // Locations neu laden
                  loadLocations();
                  
                  selectedLocationId = null;
                } else {
                  throw new Error(data.message || 'Unbekannter Fehler');
                }
              })
              .catch(error => {
                console.error('Fehler beim Löschen der Location:', error);
                alert('Fehler beim Löschen des Ortes: ' + error.message);
              });
          });
          
          // Abmelden-Button
          document.getElementById('logout-button').addEventListener('click', function() {
            window.location.href = '/logout';
          });
          
          // Admin-Button
          document.getElementById('admin-button').addEventListener('click', function() {
            window.location.href = \`/admin?sessionId=\${sessionId}\`;
          });
          
          // Formular-Submission
          document.getElementById('location-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            console.log('Formular wird abgesendet, sessionId:', sessionId);
            
            const formData = new FormData(this);
            
            // Debug-Ausgabe
            console.log('FormData-Felder:');
            for (let [key, value] of formData.entries()) {
              console.log(key, value instanceof File ? 'Datei' : value);
            }
            
            try {
              const locationId = document.getElementById('form-location-id').value;
              
              let response;
              
              if (locationId) {
                // Bestehenden Ort aktualisieren
                response = await fetch(\`/api/locations/\${locationId}?sessionId=\${sessionId}\`, {
                  method: 'PUT',
                  body: formData
                });
              } else {
                // Neuen Ort erstellen
                response = await fetch(\`/api/locations?sessionId=\${sessionId}\`, {
                  method: 'POST',
                  body: formData
                });
              }
              
              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Fehler beim Speichern');
              }
              
              const data = await response.json();
              
              if (data.success) {
                // Formular schließen
                document.getElementById('location-form-container').style.display = 'none';
                
                // Temporären Marker entfernen
                if (tempMarker) {
                  map.removeLayer(tempMarker);
                  tempMarker = null;
                }
                
                // Locations neu laden
                loadLocations();
              } else {
                throw new Error(data.message || 'Unbekannter Fehler');
              }
            } catch (error) {
              console.error('Fehler beim Speichern des Ortes:', error);
              alert('Fehler beim Speichern des Ortes: ' + error.message);
            }
          });
        });
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

// Admin-Bereich
app.get('/admin', requireAuth, (req, res) => {
  const sessionId = req.query.sessionId || req.cookies.sessionId;
  
  res.send(`
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Susibert - Admin</title>
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
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        h1 {
          color: #f2960c;
          border-bottom: 2px solid #444;
          padding-bottom: 10px;
        }
        .section {
          margin-bottom: 30px;
          background-color: #333;
          padding: 20px;
          border-radius: 10px;
        }
        .section-title {
          color: #f2960c;
          margin-top: 0;
        }
        .button {
          background-color: #444;
          color: white;
          border: none;
          padding: 10px 15px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: background-color 0.3s;
          display: inline-block;
          margin-right: 10px;
          text-decoration: none;
        }
        .button:hover {
          background-color: #555;
        }
        .button.primary {
          background-color: #f2960c;
        }
        .button.primary:hover {
          background-color: #e08800;
        }
        .button.danger {
          background-color: #e74c3c;
        }
        .button.danger:hover {
          background-color: #c0392b;
        }
        .form-group {
          margin-bottom: 15px;
        }
        .form-group label {
          display: block;
          margin-bottom: 5px;
        }
        .form-group input, .form-group textarea, .form-group select {
          width: 100%;
          padding: 10px;
          border-radius: 5px;
          border: 1px solid #555;
          background-color: #444;
          color: white;
          box-sizing: border-box;
        }
        .confirmation-dialog {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.7);
          z-index: 4000;
          justify-content: center;
          align-items: center;
        }
        .confirmation-box {
          background-color: #333;
          padding: 20px;
          border-radius: 10px;
          width: 90%;
          max-width: 400px;
        }
        .confirmation-title {
          font-size: 1.2rem;
          color: #e74c3c;
          margin-bottom: 15px;
        }
        .confirmation-message {
          margin-bottom: 20px;
        }
        .confirmation-input {
          width: 100%;
          padding: 10px;
          margin-bottom: 15px;
          background-color: #444;
          border: 1px solid #555;
          color: white;
          border-radius: 5px;
        }
        .confirmation-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
        .stats {
          margin-top: 20px;
          background-color: #444;
          padding: 15px;
          border-radius: 5px;
        }
        .stats-item {
          margin-bottom: 10px;
          display: flex;
          justify-content: space-between;
        }
        .stats-label {
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Susibert Admin</h1>
        
        <div class="section">
          <h2 class="section-title">Navigation</h2>
          <a href="/?sessionId=${sessionId}" class="button">Zurück zur Karte</a>
          <a href="/logout" class="button">Abmelden</a>
        </div>
        
        <div class="section">
          <h2 class="section-title">Systemverwaltung</h2>
          
          <div id="stats-container" class="stats">
            <div class="stats-item">
              <span class="stats-label">Datenbank-Status:</span>
              <span id="db-status">Wird geladen...</span>
            </div>
            <div class="stats-item">
              <span class="stats-label">Anzahl Orte:</span>
              <span id="location-count">Wird geladen...</span>
            </div>
            <div class="stats-item">
              <span class="stats-label">Speichernutzung:</span>
              <span id="storage-usage">Wird geladen...</span>
            </div>
          </div>
        </div>
        
        <div class="section">
          <h2 class="section-title">Datenbank-Aktionen</h2>
          <button id="reset-db-button" class="button danger">Datenbank zurücksetzen</button>
          <button id="optimize-images-button" class="button primary">Bilder optimieren</button>
        </div>
        
        <div class="section">
          <h2 class="section-title">Pärchenbild ändern</h2>
          <form id="couple-image-form" enctype="multipart/form-data">
            <input type="hidden" name="sessionId" value="${sessionId}">
            <div class="form-group">
              <label for="couple-image">Neues Pärchenbild</label>
              <input type="file" id="couple-image" name="image" accept="image/*" required>
            </div>
            
            <button type="submit" class="button primary">Bild hochladen</button>
          </form>
        </div>
      </div>
      
      <!-- Bestätigungsdialog für Datenbank-Reset -->
      <div class="confirmation-dialog" id="reset-confirmation">
        <div class="confirmation-box">
          <div class="confirmation-title">Datenbank zurücksetzen</div>
          <div class="confirmation-message">
            <p><strong>WARNUNG:</strong> Alle Orte, Bilder und Daten werden unwiderruflich gelöscht!</p>
            <p>Gib "RESET" ein, um zu bestätigen:</p>
          </div>
          <input type="text" class="confirmation-input" id="reset-confirmation-input" placeholder="RESET">
          <div class="confirmation-message" id="reset-confirmation-error" style="color: #e74c3c; display: none;">
            Falsche Eingabe! Bitte gib genau "RESET" ein.
          </div>
          <div class="confirmation-buttons">
            <button class="button" id="cancel-reset">Abbrechen</button>
            <button class="button danger" id="confirm-reset">Zurücksetzen</button>
          </div>
        </div>
      </div>
      
      <script>
        // Sessionverwaltung
        const sessionId = "${sessionId}";
        
        // Event-Listener registrieren
        document.addEventListener('DOMContentLoaded', function() {
          // Statistiken laden
          loadStats();
          
          // Reset-Button
          document.getElementById('reset-db-button').addEventListener('click', function() {
            // Reset-Bestätigungsdialog anzeigen
            document.getElementById('reset-confirmation').style.display = 'flex';
            document.getElementById('reset-confirmation-input').value = '';
            document.getElementById('reset-confirmation-error').style.display = 'none';
          });
          
          // Reset abbrechen
          document.getElementById('cancel-reset').addEventListener('click', function() {
            document.getElementById('reset-confirmation').style.display = 'none';
          });
          
          // Reset bestätigen
          document.getElementById('confirm-reset').addEventListener('click', function() {
            const confirmationInput = document.getElementById('reset-confirmation-input').value;
            
            if (confirmationInput !== 'RESET') {
              document.getElementById('reset-confirmation-error').style.display = 'block';
              return;
            }
            
            // Reset durchführen
            fetch(\`/api/admin/reset-database?sessionId=\${sessionId}\`, {
              method: 'POST'
            })
              .then(response => response.json())
              .then(data => {
                if (data.success) {
                  // Dialog schließen
                  document.getElementById('reset-confirmation').style.display = 'none';
                  
                  // Statistiken neu laden
                  loadStats();
                  
                  alert('Datenbank erfolgreich zurückgesetzt.');
                } else {
                  throw new Error(data.message || 'Unbekannter Fehler');
                }
              })
              .catch(error => {
                console.error('Fehler beim Zurücksetzen der Datenbank:', error);
                alert('Fehler beim Zurücksetzen der Datenbank: ' + error.message);
              });
          });
          
          // Bilder optimieren
          document.getElementById('optimize-images-button').addEventListener('click', function() {
            if (!confirm('Alle Bilder werden neu komprimiert. Dieser Vorgang kann einige Zeit dauern. Fortfahren?')) {
              return;
            }
            
            fetch(\`/api/admin/optimize-images?sessionId=\${sessionId}\`, {
              method: 'POST'
            })
              .then(response => response.json())
              .then(data => {
                if (data.success) {
                  // Statistiken neu laden
                  loadStats();
                  
                  alert(\`Bildoptimierung abgeschlossen: \${data.optimizedCount} Bilder optimiert.\`);
                } else {
                  throw new Error(data.message || 'Unbekannter Fehler');
                }
              })
              .catch(error => {
                console.error('Fehler bei der Bildoptimierung:', error);
                alert('Fehler bei der Bildoptimierung: ' + error.message);
              });
          });
          
          // Pärchenbild-Formular
          document.getElementById('couple-image-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            
            try {
              const response = await fetch(\`/api/admin/couple-image?sessionId=\${sessionId}\`, {
                method: 'POST',
                body: formData
              });
              
              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Fehler beim Hochladen');
              }
              
              const data = await response.json();
              
              if (data.success) {
                alert('Pärchenbild erfolgreich aktualisiert.');
                document.getElementById('couple-image').value = '';
              } else {
                throw new Error(data.message || 'Unbekannter Fehler');
              }
            } catch (error) {
              console.error('Fehler beim Hochladen des Pärchenbilds:', error);
              alert('Fehler beim Hochladen des Pärchenbilds: ' + error.message);
            }
          });
        });
        
        // Statistiken laden
        async function loadStats() {
          try {
            const response = await fetch(\`/api/admin/stats?sessionId=\${sessionId}\`);
            if (!response.ok) throw new Error('Fehler beim Laden der Statistiken');
            
            const stats = await response.json();
            
            document.getElementById('db-status').textContent = stats.dbStatus;
            document.getElementById('location-count').textContent = stats.locationCount;
            document.getElementById('storage-usage').textContent = stats.storageUsage;
          } catch (error) {
            console.error('Fehler beim Laden der Statistiken:', error);
            document.getElementById('db-status').textContent = 'Fehler';
            document.getElementById('location-count').textContent = 'Fehler';
            document.getElementById('storage-usage').textContent = 'Fehler';
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Direktes Bild abrufen
app.get('/direct-image/:id', async (req, res) => {
  console.log(`Bild mit ID ${req.params.id} angefordert`);
  try {
    const id = req.params.id;
    
    // Datenbank-Verbindung herstellen
    const client = await pool.connect();
    console.log('DB-Verbindung hergestellt für Bild ' + id);
    
    // Bild abrufen
    const result = await client.query('SELECT image, image_type FROM locations WHERE id = $1', [id]);
    console.log(`Abfrageergebnis: ${result.rowCount} Zeilen gefunden`);
    
    if (result.rows.length === 0) {
      client.release();
      console.log(`Bild ${id} nicht gefunden`);
      return res.status(404).send('Bild nicht gefunden');
    }
    
    // Bild-Daten
    const imageBase64 = result.rows[0].image;
    const imageType = result.rows[0].image_type || 'image/jpeg';
    console.log(`Bild ${id} gefunden: Typ ${imageType}, Base64-Länge: ${imageBase64 ? imageBase64.length : 0}`);
    
    if (!imageBase64) {
      client.release();
      return res.status(404).send('Bild ist leer');
    }
    
    // Buffer erstellen
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    console.log(`Bild ${id} in Buffer konvertiert: ${imageBuffer.length} Bytes`);
    
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
      return convertedBuffer;
    }
    
    // Für JPEGs, optimieren wir die Qualität
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      const optimizedBuffer = await sharp(buffer)
        .jpeg({ quality: 80 })
        .toBuffer();
      
      console.log(`JPEG komprimiert von ${buffer.length} auf ${optimizedBuffer.length} Bytes`);
      return optimizedBuffer;
    }
    
    // Für PNGs, konvertieren wir zu JPEG wenn sie größer als 1MB sind
    if (mimeType.includes('png') && buffer.length > 1024 * 1024) {
      const convertedBuffer = await sharp(buffer)
        .jpeg({ quality: 80 })
        .toBuffer();
      
      console.log(`Großes PNG zu JPEG konvertiert: ${buffer.length} → ${convertedBuffer.length} Bytes`);
      return convertedBuffer;
    }
    
    // Für alle anderen Formate, geben wir das Original zurück
    return buffer;
  } catch (error) {
    console.error('Fehler bei der Bildkompression:', error);
    return buffer; // Fallback auf Original bei Fehler
  }
}

// Thumbnail erstellen
async function createThumbnail(buffer) {
  try {
    const thumbnail = await sharp(buffer)
      .resize(200) // Maximal 200px Breite/Höhe
      .jpeg({ quality: 70 })
      .toBuffer();
    
    return thumbnail;
  } catch (error) {
    console.error('Fehler bei der Thumbnail-Erstellung:', error);
    return null;
  }
}

// API-Routen

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
  console.log('File:', req.file ? 'Vorhanden' : 'Nicht vorhanden');
  
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
    
    // Thumbnail erstellen
    const thumbnailBuffer = await createThumbnail(compressedImage);
    
    // Base64-Kodierung
    const imageBase64 = compressedImage.toString('base64');
    const thumbnailBase64 = thumbnailBuffer ? thumbnailBuffer.toString('base64') : null;
    
    // In Datenbank speichern
    const client = await pool.connect();
    const result = await client.query(
      'INSERT INTO locations (title, description, latitude, longitude, image, thumbnail, image_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [title, description, latitude, longitude, imageBase64, thumbnailBase64, imageType]
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
  console.log('File:', req.file ? 'Vorhanden' : 'Nicht vorhanden');
  
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
      
      // Thumbnail erstellen
      const thumbnailBuffer = await createThumbnail(compressedImage);
      
      // Base64-Kodierung
      const imageBase64 = compressedImage.toString('base64');
      const thumbnailBase64 = thumbnailBuffer ? thumbnailBuffer.toString('base64') : null;
      
      // Mit neuem Bild aktualisieren
      await client.query(
        'UPDATE locations SET title = $1, description = $2, latitude = $3, longitude = $4, image = $5, thumbnail = $6, image_type = $7 WHERE id = $8',
        [title, description, latitude, longitude, imageBase64, thumbnailBase64, imageType, id]
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

// Admin-API: Statistiken abrufen
app.get('/api/admin/stats', requireAuth, async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Anzahl Locations
    const locationCountResult = await client.query('SELECT COUNT(*) FROM locations');
    const locationCount = locationCountResult.rows[0].count;
    
    // Speichernutzung (grobe Schätzung)
    const storageResult = await client.query('SELECT SUM(LENGTH(image)) AS total_size FROM locations');
    const totalSize = storageResult.rows[0].total_size || 0;
    const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
    
    client.release();
    
    res.json({
      dbStatus: 'Verbunden',
      locationCount,
      storageUsage: `${sizeInMB} MB`
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Statistiken:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// Admin-API: Datenbank zurücksetzen
app.post('/api/admin/reset-database', requireAuth, async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Locations-Tabelle leeren
    await client.query('DELETE FROM locations');
    
    // Couple-Image Tabelle leeren
    try {
      await client.query('DELETE FROM couple_image');
    } catch (error) {
      // Ignorieren, falls die Tabelle nicht existiert
      console.log('couple_image Tabelle existiert nicht, wird übersprungen');
    }
    
    client.release();
    
    res.json({ success: true });
  } catch (error) {
    console.error('Fehler beim Zurücksetzen der Datenbank:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// Admin-API: Bilder optimieren
app.post('/api/admin/optimize-images', requireAuth, async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Alle Bilder holen
    const result = await client.query('SELECT id, image, image_type FROM locations');
    
    let optimizedCount = 0;
    
    // Jedes Bild optimieren
    for (const row of result.rows) {
      try {
        if (!row.image) continue;
        
        const imageBuffer = Buffer.from(row.image, 'base64');
        const imageType = row.image_type || 'image/jpeg';
        
        // Bild komprimieren
        const compressedImage = await compressImage(imageBuffer, imageType);
        
        // Thumbnail erstellen
        const thumbnailBuffer = await createThumbnail(compressedImage);
        
        // Base64-Kodierung
        const imageBase64 = compressedImage.toString('base64');
        const thumbnailBase64 = thumbnailBuffer ? thumbnailBuffer.toString('base64') : null;
        
        // In Datenbank aktualisieren
        await client.query(
          'UPDATE locations SET image = $1, thumbnail = $2 WHERE id = $3',
          [imageBase64, thumbnailBase64, row.id]
        );
        
        optimizedCount++;
      } catch (error) {
        console.error(`Fehler bei der Optimierung des Bildes ${row.id}:`, error);
      }
    }
    
    client.release();
    
    res.json({ success: true, optimizedCount });
  } catch (error) {
    console.error('Fehler bei der Bildoptimierung:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// Admin-API: Pärchenbild aktualisieren
app.post('/api/admin/couple-image', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Bild ist erforderlich' });
    }
    
    const imageBuffer = req.file.buffer;
    const imageType = req.file.mimetype;
    
    // Bild komprimieren
    const compressedImage = await compressImage(imageBuffer, imageType);
    
    // Base64-Kodierung
    const imageBase64 = compressedImage.toString('base64');
    
    const client = await pool.connect();
    
    // Prüfen, ob Tabelle existiert
    try {
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'couple_image'
        );
      `);
      
      if (!tableCheck.rows[0].exists) {
        // Tabelle erstellen, falls sie nicht existiert
        await client.query(`
          CREATE TABLE couple_image (
            id SERIAL PRIMARY KEY,
            image TEXT NOT NULL,
            image_type VARCHAR(50) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
      }
    } catch (error) {
      console.error('Fehler beim Überprüfen der Tabelle:', error);
      // Tabelle erstellen, Fall A (vorheriger Fehler)
      await client.query(`
        CREATE TABLE IF NOT EXISTS couple_image (
          id SERIAL PRIMARY KEY,
          image TEXT NOT NULL,
          image_type VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
    
    // Alle vorhandenen Einträge löschen
    await client.query('DELETE FROM couple_image');
    
    // Neues Bild einfügen
    await client.query(
      'INSERT INTO couple_image (image, image_type) VALUES ($1, $2)',
      [imageBase64, imageType]
    );
    
    client.release();
    
    res.json({ success: true });
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Pärchenbilds:', error);
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
          thumbnail TEXT,
          image_type VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      console.log('Tabelle "locations" wurde erstellt');
    } else {
      // Anzahl der Bilder checken
      const countResult = await client.query('SELECT COUNT(*) FROM locations');
      console.log(`Anzahl Einträge in locations: ${countResult.rows[0].count}`);
    }
    
    client.release();
    
    // Server starten
    app.listen(port, () => {
      console.log(`
      ===================================
      🌍 Susibert Server läuft auf Port ${port}
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