#!/bin/bash

# Verbesserter Build-Prozess für Render-Deployment
set -ex
echo "=== Optimierter Build für Render ==="

# 1. Installiere alle benötigten Pakete
echo "Installiere benötigte Pakete..."
npm install express pg multer sharp fs-extra

# 2. Benötigte Verzeichnisse erstellen
echo "Erstelle Verzeichnisstruktur..."
mkdir -p dist/uploads
mkdir -p dist/public/uploads
mkdir -p public/uploads

# 3. Bereinige server.js und erstelle eine optimierte Version
echo "Erstelle optimierte Server-Version für Render..."

# Erstelle eine vereinfachte Version von server.js für Render
cat > dist/index.js << 'EOF'
const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const crypto = require('crypto');

// Konfiguration
const PORT = process.env.PORT || 3000;
const ACCESS_CODE = process.env.ACCESS_CODE || 'suuuu';
const DATABASE_URL = process.env.DATABASE_URL;

// App initialisieren
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Statische Dateien
app.use('/uploads', express.static('uploads'));
app.use('/public', express.static('public'));
app.use(express.static('public'));

// Uploads Konfiguration
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Speicher für Sessions
const sessions = {};

// Datenbank-Verbindung
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

let dbConnected = false;

// Verbindung zur Datenbank herstellen
async function connectToDatabase() {
  try {
    const client = await pool.connect();
    const now = new Date();
    console.log('Datenbankverbindung erfolgreich hergestellt:', { now });
    client.release();
    
    // Prüfen, ob die Tabellen existieren
    const tableExists = await checkTablesExist();
    console.log('Tabelle locations existiert:', tableExists);
    
    if (!tableExists) {
      await createTables();
      console.log('Tabellen erstellt');
    }
    
    return true;
  } catch (error) {
    console.error('Fehler bei der Datenbankverbindung:', error.message);
    return false;
  }
}

// Prüfen, ob die Tabellen existieren
async function checkTablesExist() {
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
      )
    `);
    return result.rows[0].exists;
  } catch (error) {
    console.error('Fehler beim Prüfen der Tabellen:', error);
    return false;
  }
}

// Tabellen erstellen, falls sie nicht existieren
async function createTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        description TEXT,
        image_data BYTEA,
        image_type VARCHAR(50),
        thumbnail_data BYTEA,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return true;
  } catch (error) {
    console.error('Fehler beim Erstellen der Tabellen:', error);
    return false;
  }
}

// Session-Verwaltung
function createSession() {
  const sessionId = crypto.randomBytes(16).toString('hex');
  sessions[sessionId] = {
    created: Date.now(),
    authenticated: false
  };
  return sessionId;
}

function isValidSession(sessionId) {
  return sessions[sessionId] && sessions[sessionId].authenticated;
}

// Auth-Middleware
function requireAuth(req, res, next) {
  const sessionId = req.query.sessionId;
  
  if (!sessionId || !sessions[sessionId] || !sessions[sessionId].authenticated) {
    return res.redirect('/');
  }
  
  next();
}

// Ort löschen 
async function deleteLocation(id, res, redirectUrl = null) {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
  try {
    await pool.query('DELETE FROM locations WHERE id = $1', [id]);
    console.log(`Ort mit ID ${id} wurde gelöscht`);
    
    if (redirectUrl) {
      res.redirect(redirectUrl);
    } else {
      res.json({ success: true, message: 'Ort erfolgreich gelöscht' });
    }
  } catch (error) {
    console.error('Fehler beim Löschen des Ortes:', error);
    
    if (redirectUrl) {
      res.redirect(`${redirectUrl}?error=Fehler beim Löschen des Ortes: ${error.message}`);
    } else {
      res.status(500).json({ error: error.message });
    }
  }
}

// Prüfen und ggf. generieren von Thumbnails für bestehende Orte
async function ensureThumbnailExists(id, imageData, imageType) {
  try {
    // Prüfen, ob bereits ein Thumbnail existiert
    const thumbResult = await pool.query('SELECT thumbnail_data FROM locations WHERE id = $1', [id]);
    
    if (thumbResult.rows.length > 0 && thumbResult.rows[0].thumbnail_data) {
      // Thumbnail existiert bereits
      return;
    }
    
    if (!imageData) {
      console.log(`Kein Bild für Ort ${id} vorhanden, kann kein Thumbnail generieren.`);
      return;
    }
    
    // Thumbnail mit Sharp generieren
    const thumbnailBuffer = await sharp(imageData)
      .resize(60, 60, { fit: 'cover' })
      .toBuffer();
    
    // Thumbnail in der Datenbank speichern
    await pool.query('UPDATE locations SET thumbnail_data = $1 WHERE id = $2', [thumbnailBuffer, id]);
    console.log(`Thumbnail für Ort ${id} nachträglich generiert.`);
  } catch (error) {
    console.error(`Fehler beim Generieren des Thumbnails für Ort ${id}:`, error);
  }
}

// Funktion zum Generieren von Thumbnails für alle bestehenden Orte ohne Thumbnails
async function generateAllMissingThumbnails() {
  try {
    if (!dbConnected) {
      console.log('Datenbank nicht verbunden, überspringe Thumbnail-Generierung');
      return;
    }
    
    console.log('Prüfe auf fehlende Thumbnails für bestehende Orte...');
    
    // Hole alle Orte, die ein Bild aber kein Thumbnail haben
    const result = await pool.query(
      'SELECT id, image_data, image_type FROM locations WHERE image_data IS NOT NULL AND thumbnail_data IS NULL'
    );
    
    if (result.rows.length === 0) {
      console.log('Alle Orte haben bereits Thumbnails');
      return;
    }
    
    console.log(`${result.rows.length} Orte ohne Thumbnails gefunden, generiere Thumbnails...`);
    
    // Generiere Thumbnails für jeden Ort
    for (const location of result.rows) {
      await ensureThumbnailExists(location.id, location.image_data, location.image_type);
    }
    
    console.log('Alle fehlenden Thumbnails wurden generiert');
  } catch (error) {
    console.error('Fehler beim Generieren der Thumbnails:', error);
  }
}

// Helper-Funktion zum Laden der Map-Ansicht
function generateMapView(coupleImageUrl) {
  return `<!DOCTYPE html>
  <html lang="de">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Susibert - Weltkarte</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
      body {
        font-family: system-ui, -apple-system, sans-serif;
        background-color: #1a1a1a;
        color: #f5f5f5;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        height: 100vh;
      }
      
      .header {
        background-color: #222;
        padding: 15px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #333;
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
      
      .content {
        display: flex;
        flex: 1;
        overflow: hidden;
      }
      
      .sidebar {
        width: 300px;
        background-color: #222;
        border-right: 1px solid #333;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        transition: transform 0.3s;
      }
      
      .sidebar-header {
        padding: 15px;
        border-bottom: 1px solid #333;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .sidebar-title {
        font-size: 1.2rem;
        font-weight: bold;
        color: #f59a0c;
        margin: 0;
      }
      
      .locations-list {
        flex: 1;
        overflow-y: auto;
      }
      
      .location-item {
        padding: 12px 15px;
        border-bottom: 1px solid #333;
        cursor: pointer;
        transition: background-color 0.2s;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .location-item:hover {
        background-color: #2a2a2a;
      }
      
      .location-thumbnail {
        width: 40px;
        height: 40px;
        border-radius: 6px;
        object-fit: cover;
        border: 1px solid #444;
      }
      
      .location-info {
        flex: 1;
      }
      
      .location-title {
        font-weight: bold;
        margin-bottom: 3px;
      }
      
      .location-coords {
        font-size: 0.8rem;
        color: #aaa;
      }
      
      .sidebar-footer {
        padding: 15px;
        border-top: 1px solid #333;
        display: flex;
        justify-content: space-between;
      }
      
      .add-button, .mode-toggle, .logout-button {
        background-color: #f59a0c;
        color: black;
        border: none;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        transition: background-color 0.2s;
      }
      
      .add-button:hover, .mode-toggle:hover, .logout-button:hover {
        background-color: #e08a00;
      }
      
      .map-container {
        flex: 1;
        position: relative;
        overflow: hidden;
      }
      
      #map {
        height: 100%;
        width: 100%;
        background-color: #333;
      }
      
      .location-detail {
        position: absolute;
        top: 20px;
        right: 20px;
        width: 320px;
        background-color: rgba(34, 34, 34, 0.9);
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 1000;
        display: none;
        max-height: calc(100% - 80px);
        overflow-y: auto;
      }
      
      .detail-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 15px;
      }
      
      .detail-title {
        font-size: 1.4rem;
        font-weight: bold;
        color: #f59a0c;
        margin: 0;
      }
      
      .detail-close {
        background: none;
        border: none;
        color: #aaa;
        cursor: pointer;
        font-size: 1.5rem;
        line-height: 1;
        padding: 0;
      }
      
      .detail-image {
        width: 100%;
        border-radius: 6px;
        margin-bottom: 15px;
      }
      
      .detail-coords {
        font-size: 0.85rem;
        color: #aaa;
        margin-bottom: 15px;
      }
      
      .detail-description {
        margin-bottom: 20px;
        line-height: 1.5;
      }
      
      .detail-actions {
        display: flex;
        justify-content: space-between;
      }
      
      .detail-delete {
        background-color: #e53935;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      
      .detail-delete:hover {
        background-color: #c62828;
      }
      
      .leaflet-container {
        font-family: system-ui, -apple-system, sans-serif;
      }
      
      .leaflet-popup-content-wrapper {
        background-color: #222;
        color: #f5f5f5;
        border-radius: 8px;
      }
      
      .leaflet-popup-tip {
        background-color: #222;
      }
      
      .leaflet-popup-content {
        margin: 12px;
      }
      
      .popup-title {
        font-weight: bold;
        color: #f59a0c;
        margin-bottom: 5px;
      }
      
      .popup-link {
        color: #f59a0c;
        text-decoration: none;
        margin-top: 5px;
        display: inline-block;
      }
      
      .popup-link:hover {
        text-decoration: underline;
      }
      
      .hamburger-menu {
        display: none;
        cursor: pointer;
        background: none;
        border: none;
        color: #f59a0c;
        font-size: 1.5rem;
      }
      
      .location-form {
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        width: 320px;
        background-color: rgba(34, 34, 34, 0.95);
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 1000;
        display: none;
      }
      
      .form-title {
        font-size: 1.2rem;
        font-weight: bold;
        color: #f59a0c;
        margin: 0 0 15px 0;
      }
      
      .form-group {
        margin-bottom: 15px;
      }
      
      .form-label {
        display: block;
        margin-bottom: 5px;
        font-weight: bold;
      }
      
      .form-input, .form-textarea {
        width: 100%;
        padding: 8px 12px;
        border-radius: 4px;
        background-color: #333;
        border: 1px solid #444;
        color: #f5f5f5;
      }
      
      .form-textarea {
        min-height: 100px;
        resize: vertical;
      }
      
      .form-coords {
        display: flex;
        gap: 10px;
      }
      
      .form-coords .form-group {
        flex: 1;
      }
      
      .form-actions {
        display: flex;
        justify-content: space-between;
        margin-top: 20px;
      }
      
      .form-submit {
        background-color: #4caf50;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
      }
      
      .form-cancel {
        background-color: #757575;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
      }
      
      .tooltip {
        position: fixed;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 5px 10px;
        border-radius: 4px;
        z-index: 2000;
        pointer-events: none;
        font-size: 0.9rem;
      }
      
      @media (max-width: 768px) {
        .sidebar {
          position: absolute;
          height: calc(100% - 71px);
          transform: translateX(-100%);
          z-index: 1000;
        }
        
        .sidebar.open {
          transform: translateX(0);
        }
        
        .hamburger-menu {
          display: block;
        }
        
        .location-detail {
          width: 280px;
          right: 10px;
          top: 10px;
        }
      }
    </style>
  </head>
  <body>
    <div class="header">
      <a href="/" class="logo">
        <div class="logo-circle">
          <img src="${coupleImageUrl}" alt="Pärchenbild" onerror="this.src='/uploads/couple.png'">
        </div>
        <span class="logo-text">Susibert</span>
      </a>
      <button class="hamburger-menu">☰</button>
    </div>
    
    <div class="content">
      <div class="sidebar">
        <div class="sidebar-header">
          <h2 class="sidebar-title">Besuchte Orte</h2>
        </div>
        <div class="locations-list" id="locationsList">
          <!-- Hier werden die Orte dynamisch eingefügt -->
        </div>
        <div class="sidebar-footer">
          <button class="add-button" id="addLocationBtn">Ort hinzufügen</button>
          <button class="mode-toggle" id="toggleEditMode">Bearbeiten</button>
          <button class="logout-button" id="logoutBtn">Abmelden</button>
        </div>
      </div>
      
      <div class="map-container">
        <div id="map"></div>
        
        <div class="location-detail" id="locationDetail">
          <div class="detail-header">
            <h3 class="detail-title" id="detailTitle"></h3>
            <button class="detail-close" id="detailClose">&times;</button>
          </div>
          <img class="detail-image" id="detailImage" src="" alt="Ortsbild">
          <div class="detail-coords" id="detailCoords"></div>
          <div class="detail-description" id="detailDescription"></div>
          <div class="detail-actions">
            <button class="detail-delete" id="detailDelete">Löschen</button>
          </div>
        </div>
        
        <form class="location-form" id="locationForm" enctype="multipart/form-data">
          <h3 class="form-title">Neuen Ort hinzufügen</h3>
          
          <div class="form-group">
            <label class="form-label" for="locationTitle">Titel*</label>
            <input type="text" class="form-input" id="locationTitle" name="title" required>
          </div>
          
          <div class="form-coords">
            <div class="form-group">
              <label class="form-label" for="locationLat">Breitengrad</label>
              <input type="number" step="0.000001" class="form-input" id="locationLat" name="latitude" readonly>
            </div>
            <div class="form-group">
              <label class="form-label" for="locationLng">Längengrad</label>
              <input type="number" step="0.000001" class="form-input" id="locationLng" name="longitude" readonly>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label" for="locationDescription">Beschreibung</label>
            <textarea class="form-textarea" id="locationDescription" name="description"></textarea>
          </div>
          
          <div class="form-group">
            <label class="form-label" for="locationImage">Bild*</label>
            <input type="file" class="form-input" id="locationImage" name="image" accept="image/*" required>
          </div>
          
          <input type="hidden" id="sessionIdInput" name="sessionId">
          
          <div class="form-actions">
            <button type="button" class="form-cancel" id="formCancel">Abbrechen</button>
            <button type="submit" class="form-submit">Speichern</button>
          </div>
        </form>
      </div>
    </div>

    <div class="tooltip" id="tooltip" style="display: none;"></div>
    
    <script>
      // DOM-Elemente
      const map = L.map('map').setView([20, 0], 2);
      const locationsList = document.getElementById('locationsList');
      const locationDetail = document.getElementById('locationDetail');
      const detailTitle = document.getElementById('detailTitle');
      const detailImage = document.getElementById('detailImage');
      const detailCoords = document.getElementById('detailCoords');
      const detailDescription = document.getElementById('detailDescription');
      const detailClose = document.getElementById('detailClose');
      const detailDelete = document.getElementById('detailDelete');
      const addLocationBtn = document.getElementById('addLocationBtn');
      const toggleEditModeBtn = document.getElementById('toggleEditMode');
      const logoutBtn = document.getElementById('logoutBtn');
      const locationForm = document.getElementById('locationForm');
      const formCancel = document.getElementById('formCancel');
      const hamburgerMenu = document.querySelector('.hamburger-menu');
      const sidebar = document.querySelector('.sidebar');
      const tooltip = document.getElementById('tooltip');
      const sessionIdInput = document.getElementById('sessionIdInput');
      
      // Parameter aus der URL lesen
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('sessionId');
      sessionIdInput.value = sessionId;
      
      // Karteneinstellungen
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      
      // Variablen
      let locations = [];
      let markers = {};
      let editMode = false;
      let tempMarker = null;
      let activeLocationId = null;
      
      // Eventlistener
      detailClose.addEventListener('click', closeLocationDetail);
      addLocationBtn.addEventListener('click', startAddLocation);
      formCancel.addEventListener('click', cancelAddLocation);
      toggleEditModeBtn.addEventListener('click', toggleEditMode);
      detailDelete.addEventListener('click', deleteActiveLocation);
      logoutBtn.addEventListener('click', logout);
      hamburgerMenu.addEventListener('click', toggleSidebar);
      locationForm.addEventListener('submit', handleFormSubmit);
      
      // Initialisierung
      loadLocations();
      
      // Funktionen
      function loadLocations() {
        fetch('/api/locations?sessionId=' + sessionId)
          .then(response => response.json())
          .then(data => {
            locations = data;
            renderLocations();
            renderMarkersOnMap();
          })
          .catch(error => console.error('Fehler beim Laden der Orte:', error));
      }
      
      function renderLocations() {
        locationsList.innerHTML = '';
        
        if (locations.length === 0) {
          locationsList.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: #999;">Keine Orte vorhanden.<br>Klicke auf "Ort hinzufügen" um zu starten.</div>';
          return;
        }
        
        locations.forEach(location => {
          const item = document.createElement('div');
          item.className = 'location-item';
          item.dataset.id = location.id;
          
          const thumbnail = document.createElement('img');
          thumbnail.className = 'location-thumbnail';
          thumbnail.src = '/api/thumbnails/' + location.id + '?sessionId=' + sessionId;
          thumbnail.alt = location.title;
          thumbnail.onerror = function() {
            this.src = '/uploads/couple.jpg';
          };
          
          const info = document.createElement('div');
          info.className = 'location-info';
          
          const title = document.createElement('div');
          title.className = 'location-title';
          title.textContent = location.title;
          
          const coords = document.createElement('div');
          coords.className = 'location-coords';
          coords.textContent = `${parseFloat(location.latitude).toFixed(4)}, ${parseFloat(location.longitude).toFixed(4)}`;
          
          info.appendChild(title);
          info.appendChild(coords);
          item.appendChild(thumbnail);
          item.appendChild(info);
          
          item.addEventListener('click', () => showLocationDetail(location.id));
          
          locationsList.appendChild(item);
        });
      }
      
      function renderMarkersOnMap() {
        // Bestehende Marker entfernen
        Object.values(markers).forEach(marker => map.removeLayer(marker));
        markers = {};
        
        // Neue Marker hinzufügen
        locations.forEach(location => {
          const marker = L.marker([location.latitude, location.longitude])
            .addTo(map)
            .bindPopup(`<div class="popup-title">${location.title}</div><a href="#" class="popup-link" onclick="showLocationDetail(${location.id}); return false;">Details anzeigen</a>`);
          
          // Marker speichern
          markers[location.id] = marker;
          
          // Radius um den Marker zeichnen (50km)
          const circle = L.circle([location.latitude, location.longitude], {
            color: '#f59a0c',
            fillColor: '#f59a0c',
            fillOpacity: 0.2,
            radius: 50000  // 50km in Metern
          }).addTo(map);
          
          // Circle zum Marker hinzufügen
          marker.circle = circle;
        });
      }
      
      function showLocationDetail(id) {
        const location = locations.find(loc => loc.id === id);
        if (!location) return;
        
        activeLocationId = id;
        detailTitle.textContent = location.title;
        detailImage.src = '/api/images/' + id + '?sessionId=' + sessionId;
        detailCoords.textContent = `Koordinaten: ${parseFloat(location.latitude).toFixed(6)}, ${parseFloat(location.longitude).toFixed(6)}`;
        detailDescription.textContent = location.description || 'Keine Beschreibung vorhanden.';
        
        locationDetail.style.display = 'block';
        
        // Karte auf den Marker zentrieren
        map.setView([location.latitude, location.longitude], 10);
        
        // Marker hervorheben
        if (markers[id]) {
          markers[id].openPopup();
        }
        
        // Bei mobilen Geräten das Seitenmenü schließen
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('open');
        }
      }
      
      function closeLocationDetail() {
        locationDetail.style.display = 'none';
        activeLocationId = null;
      }
      
      function startAddLocation() {
        if (!editMode) {
          toggleEditMode();
        }
        
        showTooltip('Klicke auf die Karte, um einen Ort zu markieren');
      }
      
      function toggleEditMode() {
        editMode = !editMode;
        toggleEditModeBtn.textContent = editMode ? 'Beenden' : 'Bearbeiten';
        toggleEditModeBtn.style.backgroundColor = editMode ? '#e53935' : '#f59a0c';
        
        if (editMode) {
          map.on('click', handleMapClick);
          showTooltip('Bearbeitungsmodus aktiviert - Klicke auf die Karte, um einen Ort hinzuzufügen');
        } else {
          map.off('click', handleMapClick);
          if (tempMarker) {
            map.removeLayer(tempMarker);
            tempMarker = null;
          }
          locationForm.style.display = 'none';
          hideTooltip();
        }
      }
      
      function handleMapClick(e) {
        if (!editMode) return;
        
        const latlng = e.latlng;
        
        // Wenn bereits ein temporärer Marker existiert, entferne ihn
        if (tempMarker) {
          map.removeLayer(tempMarker);
        }
        
        // Neuen temporären Marker setzen
        tempMarker = L.marker(latlng).addTo(map);
        
        // Formular anzeigen und mit Koordinaten füllen
        document.getElementById('locationLat').value = latlng.lat;
        document.getElementById('locationLng').value = latlng.lng;
        locationForm.style.display = 'block';
        hideTooltip();
      }
      
      function cancelAddLocation() {
        locationForm.style.display = 'none';
        
        if (tempMarker) {
          map.removeLayer(tempMarker);
          tempMarker = null;
        }
      }
      
      function handleFormSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(locationForm);
        
        fetch('/api/locations', {
          method: 'POST',
          body: formData
        })
          .then(response => response.json())
          .then(data => {
            if (data.error) {
              alert('Fehler: ' + data.error);
              return;
            }
            
            // Formular zurücksetzen und ausblenden
            locationForm.reset();
            locationForm.style.display = 'none';
            
            // Temporären Marker entfernen
            if (tempMarker) {
              map.removeLayer(tempMarker);
              tempMarker = null;
            }
            
            // Liste der Orte neu laden
            loadLocations();
          })
          .catch(error => {
            console.error('Fehler beim Speichern des Ortes:', error);
            alert('Fehler beim Speichern: ' + error.message);
          });
      }
      
      function deleteActiveLocation() {
        if (!activeLocationId) return;
        
        if (!confirm('Möchtest du diesen Ort wirklich löschen?')) {
          return;
        }
        
        fetch('/api/locations/' + activeLocationId + '?sessionId=' + sessionId, {
          method: 'DELETE'
        })
          .then(response => response.json())
          .then(data => {
            if (data.error) {
              alert('Fehler: ' + data.error);
              return;
            }
            
            // Location Detail schließen
            closeLocationDetail();
            
            // Liste der Orte neu laden
            loadLocations();
          })
          .catch(error => {
            console.error('Fehler beim Löschen des Ortes:', error);
            alert('Fehler beim Löschen: ' + error.message);
          });
      }
      
      function logout() {
        if (confirm('Möchtest du dich wirklich abmelden?')) {
          window.location.href = '/logout?sessionId=' + sessionId;
        }
      }
      
      function toggleSidebar() {
        sidebar.classList.toggle('open');
      }
      
      function showTooltip(text) {
        tooltip.textContent = text;
        tooltip.style.display = 'block';
        
        document.addEventListener('mousemove', moveTooltip);
        
        // Tooltip nach 5 Sekunden ausblenden
        setTimeout(hideTooltip, 5000);
      }
      
      function moveTooltip(e) {
        tooltip.style.left = (e.pageX + 10) + 'px';
        tooltip.style.top = (e.pageY + 10) + 'px';
      }
      
      function hideTooltip() {
        tooltip.style.display = 'none';
        document.removeEventListener('mousemove', moveTooltip);
      }
      
      // Global-Funktion für Popup-Links
      window.showLocationDetail = showLocationDetail;
    </script>
  </body>
  </html>`;
}

// Haupt-Routes

// Login-Seite
app.get('/', function(req, res) {
  // Erstellt eine neue Session
  const sessionId = createSession();
  
  res.send(`
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Susibert - Login</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          background-color: #1a1a1a;
          color: #f5f5f5;
          margin: 0;
          padding: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
        }
        
        .login-container {
          width: 90%;
          max-width: 400px;
          background-color: #222;
          border-radius: 12px;
          padding: 30px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        }
        
        .login-title {
          text-align: center;
          margin-bottom: 30px;
        }
        
        .login-title h1 {
          font-size: 2.5rem;
          margin: 0;
          background: linear-gradient(45deg, #f59a0c, #ffbf49);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        
        .couple-photo {
          width: 150px;
          height: 150px;
          border-radius: 50%;
          object-fit: cover;
          margin: 0 auto 30px;
          display: block;
          border: 3px solid #f59a0c;
        }
        
        .login-form .form-group {
          margin-bottom: 20px;
        }
        
        .login-form label {
          display: block;
          margin-bottom: 8px;
          font-weight: bold;
        }
        
        .login-form input {
          width: 100%;
          padding: 12px;
          background-color: #333;
          border: 1px solid #444;
          border-radius: 6px;
          color: white;
          font-size: 1rem;
        }
        
        .login-form button {
          width: 100%;
          padding: 12px;
          background: linear-gradient(45deg, #f59a0c, #ffbf49);
          border: none;
          border-radius: 6px;
          color: black;
          font-size: 1rem;
          font-weight: bold;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        
        .login-form button:hover {
          opacity: 0.9;
        }
        
        .error-message {
          background-color: #ff5252;
          color: white;
          padding: 10px;
          border-radius: 6px;
          margin-bottom: 20px;
          display: none;
        }
      </style>
    </head>
    <body>
      <div class="login-container">
        <div class="login-title">
          <h1>Susibert</h1>
        </div>
        
        <img src="/uploads/couple.jpg" alt="Pärchen" class="couple-photo" onerror="this.src='/uploads/couple.png'">
        
        <div class="error-message" id="errorMessage"></div>
        
        <form class="login-form" id="loginForm">
          <div class="form-group">
            <label for="accessCode">Zugriffscode</label>
            <input type="password" id="accessCode" name="accessCode" placeholder="Bitte Code eingeben..." required>
          </div>
          
          <button type="submit">Anmelden</button>
        </form>
      </div>
      
      <script>
        // Login-Formular
        const loginForm = document.getElementById('loginForm');
        const errorMessage = document.getElementById('errorMessage');
        
        loginForm.addEventListener('submit', function(e) {
          e.preventDefault();
          
          const accessCode = document.getElementById('accessCode').value;
          
          fetch('/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              accessCode: accessCode,
              sessionId: '${sessionId}'
            })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              window.location.href = data.redirect;
            } else {
              errorMessage.textContent = data.message;
              errorMessage.style.display = 'block';
            }
          })
          .catch(error => {
            console.error('Fehler:', error);
            errorMessage.textContent = 'Ein Fehler ist aufgetreten. Bitte versuche es später erneut.';
            errorMessage.style.display = 'block';
          });
        });
      </script>
    </body>
    </html>
  `);
});

// Login-Verarbeitung
app.post('/login', express.json(), (req, res) => {
  const { accessCode, sessionId } = req.body;
  
  if (!sessionId || !sessions[sessionId]) {
    return res.json({ success: false, message: 'Ungültige Session. Bitte lade die Seite neu.' });
  }
  
  if (accessCode === ACCESS_CODE) {
    sessions[sessionId].authenticated = true;
    res.json({ success: true, redirect: `/map?sessionId=${sessionId}` });
  } else {
    res.json({ success: false, message: 'Falscher Zugriffscode. Bitte versuche es erneut.' });
  }
});

// Logout
app.get('/logout', (req, res) => {
  const sessionId = req.query.sessionId;
  
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
  }
  
  res.redirect('/');
});

// Geschützte Kartenansicht mit Leaflet
app.get('/map', requireAuth, function(req, res) {
  // Prüfe, ob die Datenbankverbindung aktiv ist
  if (!dbConnected) {
    return res.send(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Susibert - Datenbankfehler</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background-color: #1a1a1a;
      color: #f5f5f5;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    
    .header {
      background-color: #222;
      padding: 15px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
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
    
    .error-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 2rem;
      text-align: center;
    }
    
    .error-message {
      background-color: #ff5252;
      color: white;
      padding: 1rem 2rem;
      border-radius: 8px;
      margin-bottom: 2rem;
      max-width: 600px;
    }
    
    .btn {
      background-color: #f59a0c;
      color: black;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      font-size: 1rem;
      cursor: pointer;
      text-decoration: none;
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <div class="header">
    <a href="/" class="logo">
      <div class="logo-circle">
        <img src="/uploads/couple.jpg" alt="Pärchenbild" onerror="this.src='/uploads/couple.png'">
      </div>
      <span class="logo-text">Susibert</span>
    </a>
  </div>
  
  <div class="error-container">
    <div class="error-message">
      <h2>Datenbankverbindung nicht verfügbar</h2>
      <p>Die Verbindung zur Datenbank konnte nicht hergestellt werden. Bitte versuche es später erneut.</p>
    </div>
    <a href="/" class="btn">Zurück zur Anmeldung</a>
  </div>
</body>
</html>`);
  }

  // Pfad zum Pärchenbild
  const coupleImageUrl = '/uploads/couple.jpg';
  
  // Kartenansicht laden
  return res.send(generateMapView(coupleImageUrl));
});

// Admin-Bereich
app.get('/admin', requireAuth, function(req, res) {
  res.send(`
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Susibert Admin</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          background-color: #1a1a1a;
          color: #f5f5f5;
          margin: 0;
          padding: 20px;
        }
        
        h1 {
          color: #f59a0c;
        }
        
        .container {
          max-width: 800px;
          margin: 0 auto;
        }
        
        .card {
          background-color: #222;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
        }
        
        h2 {
          margin-top: 0;
          color: #f59a0c;
        }
        
        .button {
          display: inline-block;
          background-color: #f59a0c;
          color: black;
          border: none;
          padding: 10px 16px;
          border-radius: 4px;
          cursor: pointer;
          text-decoration: none;
          font-weight: bold;
          margin-right: 10px;
        }
        
        .button-danger {
          background-color: #e53935;
          color: white;
        }
        
        .confirmation-box {
          background-color: #333;
          border-radius: 8px;
          padding: 15px;
          margin-top: 15px;
          display: none;
        }
        
        .checkbox-label {
          display: flex;
          align-items: center;
          margin-bottom: 10px;
        }
        
        .checkbox-label input {
          margin-right: 10px;
        }
        
        #resetDbBtn {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        #resetDbBtn.active {
          opacity: 1;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Susibert Administration</h1>
        
        <div class="card">
          <h2>Navigation</h2>
          <a href="/map?sessionId=${req.query.sessionId}" class="button">Zurück zur Karte</a>
          <a href="/" class="button">Zur Startseite</a>
        </div>
        
        <div class="card">
          <h2>Datenbank-Verwaltung</h2>
          <p>ACHTUNG: Das Zurücksetzen der Datenbank löscht alle gespeicherten Orte und Bilder!</p>
          
          <button id="showResetConfirmationBtn" class="button button-danger">Datenbank zurücksetzen</button>
          
          <div id="resetConfirmation" class="confirmation-box">
            <p><strong>Bitte bestätige, dass du die Datenbank wirklich zurücksetzen möchtest:</strong></p>
            
            <label class="checkbox-label">
              <input type="checkbox" id="confirmReset1"> Ich verstehe, dass alle Orte gelöscht werden
            </label>
            
            <label class="checkbox-label">
              <input type="checkbox" id="confirmReset2"> Ich verstehe, dass alle Bilder gelöscht werden
            </label>
            
            <label class="checkbox-label">
              <input type="checkbox" id="confirmReset3"> Ich bestätige, dass ich die Datenbank zurücksetzen möchte
            </label>
            
            <button id="resetDbBtn" class="button button-danger">Datenbank jetzt zurücksetzen</button>
          </div>
        </div>
        
        <div class="card">
          <h2>Thumbnails</h2>
          <p>Aktionen für die Verwaltung von Thumbnails:</p>
          <button id="generateThumbnailsBtn" class="button">Alle fehlenden Thumbnails generieren</button>
        </div>
      </div>
      
      <script>
        // DOM-Elemente
        const showResetConfirmationBtn = document.getElementById('showResetConfirmationBtn');
        const resetConfirmation = document.getElementById('resetConfirmation');
        const confirmReset1 = document.getElementById('confirmReset1');
        const confirmReset2 = document.getElementById('confirmReset2');
        const confirmReset3 = document.getElementById('confirmReset3');
        const resetDbBtn = document.getElementById('resetDbBtn');
        const generateThumbnailsBtn = document.getElementById('generateThumbnailsBtn');
        
        // Eventlistener
        showResetConfirmationBtn.addEventListener('click', () => {
          resetConfirmation.style.display = 'block';
        });
        
        [confirmReset1, confirmReset2, confirmReset3].forEach(checkbox => {
          checkbox.addEventListener('change', updateResetButtonState);
        });
        
        resetDbBtn.addEventListener('click', resetDatabase);
        generateThumbnailsBtn.addEventListener('click', generateThumbnails);
        
        // Funktionen
        function updateResetButtonState() {
          const allChecked = confirmReset1.checked && confirmReset2.checked && confirmReset3.checked;
          
          if (allChecked) {
            resetDbBtn.classList.add('active');
          } else {
            resetDbBtn.classList.remove('active');
          }
        }
        
        function resetDatabase() {
          if (!confirmReset1.checked || !confirmReset2.checked || !confirmReset3.checked) {
            return;
          }
          
          fetch('/api/admin/reset-database?sessionId=${req.query.sessionId}', {
            method: 'POST'
          })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                alert('Datenbank erfolgreich zurückgesetzt');
                resetConfirmation.style.display = 'none';
                confirmReset1.checked = false;
                confirmReset2.checked = false;
                confirmReset3.checked = false;
                updateResetButtonState();
              } else {
                alert('Fehler: ' + data.error);
              }
            })
            .catch(error => {
              console.error('Fehler:', error);
              alert('Ein Fehler ist aufgetreten: ' + error.message);
            });
        }
        
        function generateThumbnails() {
          fetch('/api/admin/generate-thumbnails?sessionId=${req.query.sessionId}', {
            method: 'POST'
          })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                alert('Thumbnails erfolgreich generiert');
              } else {
                alert('Fehler: ' + data.error);
              }
            })
            .catch(error => {
              console.error('Fehler:', error);
              alert('Ein Fehler ist aufgetreten: ' + error.message);
            });
        }
      </script>
    </body>
    </html>
  `);
});

// API-Endpunkte

// Thumbnail aus der Datenbank abrufen
app.get('/api/thumbnails/:id', async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
  try {
    const id = req.params.id;
    const result = await pool.query('SELECT thumbnail_data, image_type FROM locations WHERE id = $1', [id]);
    
    if (result.rows.length === 0 || !result.rows[0].thumbnail_data) {
      // Fallback auf das Pärchenbild, wenn kein Thumbnail gefunden wurde
      const defaultImagePath = path.join(uploadsDir, 'couple.jpg');
      if (fs.existsSync(defaultImagePath)) {
        // Verkleinertes Thumbnail vom Pärchenbild erstellen
        const thumbnailBuffer = await sharp(defaultImagePath)
          .resize(60, 60, { fit: 'cover' })
          .toBuffer();
        
        res.contentType('image/jpeg');
        return res.send(thumbnailBuffer);
      } else {
        return res.status(404).send('Thumbnail nicht gefunden');
      }
    }
    
    // Setze den korrekten Content-Type
    const imageType = result.rows[0].image_type || 'image/jpeg';
    res.contentType(imageType);
    
    // Sende das Thumbnail als Binärdaten
    res.send(result.rows[0].thumbnail_data);
  } catch (error) {
    console.error('Fehler beim Abrufen des Thumbnails:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bild aus der Datenbank abrufen
app.get('/api/images/:id', async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
  try {
    const id = req.params.id;
    const result = await pool.query('SELECT image_data, image_type FROM locations WHERE id = $1', [id]);
    
    if (result.rows.length === 0 || !result.rows[0].image_data) {
      // Fallback auf das Pärchenbild, wenn kein Bild gefunden wurde
      const defaultImagePath = path.join(uploadsDir, 'couple.jpg');
      if (fs.existsSync(defaultImagePath)) {
        const defaultImage = fs.readFileSync(defaultImagePath);
        res.contentType('image/jpeg');
        return res.send(defaultImage);
      } else {
        return res.status(404).send('Bild nicht gefunden');
      }
    }
    
    // Setze den korrekten Content-Type
    const imageType = result.rows[0].image_type || 'image/jpeg';
    res.contentType(imageType);
    
    // Stelle sicher, dass ein Thumbnail existiert, falls es noch nicht erstellt wurde
    await ensureThumbnailExists(id, result.rows[0].image_data, imageType);
    
    // Sende das Bild als Binärdaten
    res.send(result.rows[0].image_data);
  } catch (error) {
    console.error('Fehler beim Abrufen des Bildes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Alle Orte abrufen
app.get('/api/locations', requireAuth, async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
  try {
    const result = await pool.query('SELECT id, title, latitude, longitude, description FROM locations ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der Orte:', error);
    res.status(500).json({ error: error.message });
  }
});

// Neuen Ort hinzufügen
app.post('/api/locations', upload.single('image'), async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
  try {
    // Prüfe, ob ein Bild hochgeladen wurde
    if (!req.file) {
      return res.status(400).json({ error: 'Kein Bild hochgeladen' });
    }
    
    // Parameter aus dem Request
    const { title, latitude, longitude, description, sessionId } = req.body;
    
    // Prüfe, ob alle erforderlichen Felder vorhanden sind
    if (!title || !latitude || !longitude) {
      return res.status(400).json({ error: 'Titel und Koordinaten sind erforderlich' });
    }
    
    // Prüfe die Session
    if (!sessionId || !sessions[sessionId] || !sessions[sessionId].authenticated) {
      return res.status(401).json({ error: 'Nicht authentifiziert' });
    }
    
    // Verarbeite das Bild mit Sharp
    const imageBuffer = req.file.buffer;
    const imageType = req.file.mimetype;
    
    // Erstelle ein Thumbnail
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(60, 60, { fit: 'cover' })
      .toBuffer();
    
    // Füge den Ort zur Datenbank hinzu
    const result = await pool.query(
      'INSERT INTO locations (title, latitude, longitude, description, image_data, image_type, thumbnail_data) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [title, latitude, longitude, description, imageBuffer, imageType, thumbnailBuffer]
    );
    
    const newLocationId = result.rows[0].id;
    
    res.json({ success: true, id: newLocationId });
  } catch (error) {
    console.error('Fehler beim Hinzufügen des Ortes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Ort löschen
app.delete('/api/locations/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  await deleteLocation(id, res);
});

// Admin: Datenbank zurücksetzen
app.post('/api/admin/reset-database', requireAuth, async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
  try {
    await pool.query('DELETE FROM locations');
    res.json({ success: true });
  } catch (error) {
    console.error('Fehler beim Zurücksetzen der Datenbank:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Alle fehlenden Thumbnails generieren
app.post('/api/admin/generate-thumbnails', requireAuth, async (req, res) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verfügbar' });
  }
  
  try {
    await generateAllMissingThumbnails();
    res.json({ success: true });
  } catch (error) {
    console.error('Fehler beim Generieren der Thumbnails:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verbindung zur Datenbank herstellen
connectToDatabase().then(connected => {
  dbConnected = connected;
  console.log('Datenbankverbindung Status:', dbConnected);
  
  // Nach erfolgreicher Verbindung alle fehlenden Thumbnails generieren
  if (dbConnected) {
    generateAllMissingThumbnails();
  }
}).catch(error => {
  console.error('Fehler bei der Datenbankverbindung:', error);
});

// Server starten
const server = app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
EOF

# 4. Kopiere wichtige Dateien für das Deployment
echo "Kopiere wichtige Dateien..."
mkdir -p dist/uploads
cp -rv uploads/* dist/uploads/ || echo "Warnung: Keine Uploads-Dateien gefunden"

# 5. Kopiere couple.jpg in verschiedene Verzeichnisse
echo "Kopiere Pärchenbild..."
cp -v uploads/couple.jpg dist/uploads/ || echo "Warnung: couple.jpg nicht gefunden"
cp -v uploads/couple.png dist/uploads/ || echo "Warnung: couple.png nicht gefunden"

# 6. package.json für Produktion erstellen
echo "Erstelle package.json für Produktion..."
cat > package.json << 'EOF'
{
  "name": "travelchronicles",
  "version": "1.0.0",
  "type": "commonjs",
  "license": "MIT",
  "scripts": {
    "start": "NODE_ENV=production node dist/index.js",
    "dev": "NODE_ENV=development node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.3",
    "pg": "^8.11.3",
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.33.2",
    "fs-extra": "^11.2.0"
  }
}
EOF

echo "=== Build für Render erfolgreich abgeschlossen ==="