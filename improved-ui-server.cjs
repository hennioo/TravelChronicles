// Verbesserte Susibert-Karten-App mit Admin-Funktionen und verbesserter UI
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const sharp = require('sharp');
const fs = require('fs');

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
          <img src="/couple-image" alt="Pärchenbild" class="couple-image" onerror="this.src='/couple-image'">
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

// Pärchenbild abrufen
app.get('/couple-image', async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Versuche ein Bild aus der couple_image Tabelle zu holen
    try {
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'couple_image'
        );
      `);
      
      if (tableCheck.rows[0].exists) {
        const result = await client.query('SELECT image, image_type FROM couple_image LIMIT 1');
        
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
    
    // Fallback: Ein Bild aus der locations Tabelle
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
          overflow: hidden;
        }
        
        /* Hauptcontainer */
        .app-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          width: 100%;
        }
        
        /* Header-Bereich */
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 20px;
          background-color: #333;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
          position: sticky;
          top: 0;
          z-index: 1000;
        }
        
        /* Titelbereich mit Pärchenbild */
        .title-container {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        
        .couple-image {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #f2960c;
        }
        
        .app-title {
          font-size: 1.5rem;
          font-weight: bold;
          color: #f2960c;
          margin: 0;
        }
        
        /* Header-Aktionen */
        .header-actions {
          display: flex;
          gap: 15px;
          align-items: center;
        }
        
        /* Buttons */
        .button {
          background-color: #444;
          color: white;
          border: none;
          padding: 8px 15px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: background-color 0.3s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
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
        
        .menu-button {
          background: none;
          border: none;
          color: white;
          font-size: 1.5rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          padding: 0;
        }
        
        /* Hauptinhaltsbereich */
        .main-content {
          flex: 1;
          display: flex;
          position: relative;
          overflow: hidden;
        }
        
        /* Kartencontainer */
        .map-container {
          flex: 1;
          padding: 15px;
          box-sizing: border-box;
          height: 100%;
          position: relative;
        }
        
        .map-wrapper {
          height: 100%;
          border-radius: 15px;
          overflow: hidden;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        }
        
        #map {
          height: 100%;
          width: 100%;
          background-color: #333;
        }
        
        /* Seitenleiste */
        .sidebar {
          position: fixed;
          top: 0;
          right: -350px; /* Versteckt außerhalb des Bildschirms */
          width: 350px;
          height: 100%;
          background-color: #333;
          box-shadow: -2px 0 10px rgba(0, 0, 0, 0.3);
          transition: right 0.3s ease;
          z-index: 2000;
          display: flex;
          flex-direction: column;
        }
        
        .sidebar.open {
          right: 0; /* Seitenleiste einblenden */
        }
        
        .sidebar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          background-color: #444;
          border-bottom: 1px solid #555;
        }
        
        .sidebar-title {
          font-size: 1.2rem;
          font-weight: bold;
          color: #f2960c;
          margin: 0;
        }
        
        .sidebar-close {
          background: none;
          border: none;
          color: white;
          font-size: 1.8rem;
          cursor: pointer;
          line-height: 1;
        }
        
        .sidebar-content {
          flex: 1;
          overflow-y: auto;
          padding: 15px;
        }
        
        .sidebar-footer {
          padding: 15px;
          border-top: 1px solid #555;
        }
        
        /* Standortliste */
        .location-list {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }
        
        .location-item {
          background-color: #444;
          border-radius: 8px;
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s;
          cursor: pointer;
        }
        
        .location-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
          background-color: #555;
        }
        
        .location-info {
          padding: 12px;
        }
        
        .location-title {
          font-weight: bold;
          color: #f2960c;
          margin: 0 0 5px 0;
        }
        
        .location-date {
          font-size: 0.8rem;
          opacity: 0.8;
          margin-bottom: 5px;
        }
        
        .location-thumbnail {
          width: 100%;
          height: 150px;
          object-fit: cover;
        }
        
        /* Overlay für Bearbeitungsmodus */
        .edit-mode-overlay {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background-color: rgba(242, 150, 12, 0.9);
          color: white;
          padding: 10px 20px;
          border-radius: 30px;
          font-weight: bold;
          z-index: 1500;
          display: none;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        }
        
        /* Formulare und Modals */
        .overlay {
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
        
        .modal-box {
          background-color: #333;
          border-radius: 15px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
          width: 90%;
          max-width: 550px;
          max-height: 85vh;
          overflow-y: auto;
          padding: 25px;
        }
        
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        
        .modal-title {
          font-size: 1.5rem;
          font-weight: bold;
          color: #f2960c;
          margin: 0;
        }
        
        .modal-close {
          background: none;
          border: none;
          color: white;
          font-size: 1.8rem;
          cursor: pointer;
          line-height: 1;
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: bold;
        }
        
        .form-group input, .form-group textarea, .form-group select {
          width: 100%;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #555;
          background-color: #444;
          color: white;
          box-sizing: border-box;
          font-size: 1rem;
        }
        
        .form-group textarea {
          min-height: 120px;
          resize: vertical;
        }
        
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 15px;
          margin-top: 25px;
        }
        
        .detail-image {
          width: 100%;
          max-height: 350px;
          object-fit: contain;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        
        .detail-description {
          line-height: 1.6;
          margin-bottom: 25px;
        }
        
        .location-info-detail {
          margin-bottom: 20px;
        }
        
        .location-date-detail {
          opacity: 0.8;
          margin-bottom: 15px;
          font-size: 0.9rem;
        }
        
        /* Ladeindikator */
        .loading-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.7);
          display: none;
          justify-content: center;
          align-items: center;
          z-index: 4000;
        }
        
        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          background-color: #333;
          padding: 25px;
          border-radius: 15px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        }
        
        .spinner {
          border: 4px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top: 4px solid #f2960c;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin-bottom: 15px;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .loading-text {
          font-size: 1.1rem;
          color: white;
        }
        
        /* Leaflet-Anpassungen */
        .leaflet-container {
          background-color: #2d3439;
        }
        
        .leaflet-control-zoom a {
          background-color: #444;
          color: #fff;
          border-color: #555;
        }
        
        .leaflet-control-zoom a:hover {
          background-color: #555;
        }
        
        .leaflet-control-attribution {
          background-color: rgba(51, 51, 51, 0.8) !important;
          color: #aaa !important;
          font-size: 10px !important;
        }
        
        /* Benutzerdefinierter Marker */
        .custom-marker {
          filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.5));
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
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .marker-pin::after {
          content: '';
          width: 20px;
          height: 20px;
          margin: auto;
          background-color: #444;
          position: absolute;
          border-radius: 50%;
        }
        
        /* Responsive-Design */
        @media (max-width: 768px) {
          .sidebar {
            width: 85%;
            max-width: 350px;
          }
          
          .header {
            padding: 10px;
          }
          
          .map-container {
            padding: 10px;
          }
          
          .couple-image {
            width: 35px;
            height: 35px;
          }
          
          .modal-box {
            width: 95%;
            padding: 20px;
          }
        }
      </style>
    </head>
    <body>
      <div class="app-container">
        <!-- Header -->
        <header class="header">
          <div class="title-container">
            <img src="/couple-image" alt="Pärchenbild" class="couple-image">
            <h1 class="app-title">Susibert</h1>
          </div>
          
          <div class="header-actions">
            <button id="edit-mode-toggle" class="button">Bearbeiten</button>
            <button id="menu-toggle" class="menu-button">☰</button>
          </div>
        </header>
        
        <!-- Hauptinhalt -->
        <main class="main-content">
          <!-- Kartenbereich -->
          <div class="map-container">
            <div class="map-wrapper">
              <div id="map"></div>
            </div>
          </div>
        </main>
      </div>
      
      <!-- Seitenleiste -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <h2 class="sidebar-title">Unsere Orte</h2>
          <button class="sidebar-close">×</button>
        </div>
        
        <div class="sidebar-content">
          <div id="location-list" class="location-list">
            <!-- Wird dynamisch gefüllt -->
            <div style="text-align: center; padding: 20px;">
              <div class="spinner"></div>
              <p>Orte werden geladen...</p>
            </div>
          </div>
        </div>
        
        <div class="sidebar-footer">
          <button id="add-location-btn" class="button primary" style="width: 100%; margin-bottom: 10px;">Neuen Ort hinzufügen</button>
          <div style="display: flex; gap: 10px;">
            <button id="logout-btn" class="button" style="flex: 1;">Abmelden</button>
            <a href="/admin?sessionId=${sessionId}" class="button" style="flex: 1; text-align: center; text-decoration: none;">Admin</a>
          </div>
        </div>
      </aside>
      
      <!-- Overlay für Bearbeitungsmodus -->
      <div class="edit-mode-overlay" id="edit-mode-indicator">
        Bearbeitungsmodus aktiv - Klicke auf die Karte, um einen Ort hinzuzufügen
      </div>
      
      <!-- Formular zum Hinzufügen/Bearbeiten eines Ortes -->
      <div class="overlay" id="location-form-container">
        <div class="modal-box">
          <div class="modal-header">
            <h2 class="modal-title" id="form-heading">Ort hinzufügen</h2>
            <button class="modal-close" id="form-close">×</button>
          </div>
          
          <form id="location-form">
            <input type="hidden" id="form-location-id" name="id">
            <input type="hidden" id="form-lat" name="latitude">
            <input type="hidden" id="form-lng" name="longitude">
            <input type="hidden" id="form-session-id" name="sessionId" value="${sessionId}">
            
            <div class="form-group">
              <label for="form-title">Titel</label>
              <input type="text" id="form-title" name="title" required>
            </div>
            
            <div class="form-group">
              <label for="form-date">Datum (Monat/Jahr)</label>
              <input type="month" id="form-date" name="date">
            </div>
            
            <div class="form-group">
              <label for="form-description">Beschreibung (optional)</label>
              <textarea id="form-description" name="description"></textarea>
            </div>
            
            <div class="form-group">
              <label for="form-image">Bild</label>
              <input type="file" id="form-image" name="image" accept="image/*" required>
            </div>
            
            <div class="modal-footer">
              <button type="button" class="button" id="form-cancel">Abbrechen</button>
              <button type="submit" class="button primary">Speichern</button>
            </div>
          </form>
        </div>
      </div>
      
      <!-- Modal für Ortsdetails -->
      <div class="overlay" id="location-detail-container">
        <div class="modal-box">
          <div class="modal-header">
            <h2 class="modal-title" id="detail-title">Ortsname</h2>
            <button class="modal-close" id="detail-close">×</button>
          </div>
          
          <div class="location-info-detail">
            <div id="detail-date" class="location-date-detail"></div>
          </div>
          
          <img id="detail-image" src="" alt="Ortsbild" class="detail-image">
          
          <div id="detail-description" class="detail-description">
            Beschreibung wird hier angezeigt...
          </div>
          
          <div class="modal-footer">
            <button id="detail-edit" class="button">Bearbeiten</button>
            <button id="detail-delete" class="button" style="background-color: #e74c3c;">Löschen</button>
          </div>
        </div>
      </div>
      
      <!-- Lösch-Bestätigungsdialog -->
      <div class="overlay" id="delete-confirmation">
        <div class="modal-box" style="max-width: 450px;">
          <div class="modal-header">
            <h2 class="modal-title" style="color: #e74c3c;">Ort löschen?</h2>
            <button class="modal-close" id="delete-cancel-x">×</button>
          </div>
          
          <p style="margin-bottom: 20px;">Bist du sicher, dass du diesen Ort löschen möchtest? Diese Aktion kann nicht rückgängig gemacht werden.</p>
          
          <div class="modal-footer">
            <button id="delete-cancel" class="button">Abbrechen</button>
            <button id="delete-confirm" class="button" style="background-color: #e74c3c;">Löschen</button>
          </div>
        </div>
      </div>
      
      <!-- Ladeindikator -->
      <div class="loading-overlay" id="loading-overlay">
        <div class="loading-container">
          <div class="spinner"></div>
          <div class="loading-text" id="loading-text">Wird geladen...</div>
        </div>
      </div>
      
      <script>
        // Globale Variablen
        const sessionId = '${sessionId}';
        let map, editMode = false;
        let markers = [];
        let tempMarker;
        let selectedLocationId = null;
        
        // Beim Laden der Seite
        document.addEventListener('DOMContentLoaded', function() {
          // Karte initialisieren
          initMap();
          
          // Event-Listener registrieren
          setupEventListeners();
          
          // Orte laden
          loadLocations();
        });
        
        // Karte initialisieren
        function initMap() {
          map = L.map('map', {
            center: [20, 0],
            zoom: 2,
            minZoom: 2,
            maxZoom: 18,
            maxBounds: [[-85, -180], [85, 180]], // Beschränkung auf sinnvolle Grenzen
            maxBoundsViscosity: 1.0 // Verhindert Überschreiten der Grenzen
          });
          
          // Dunkler Kartenstil
          L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            subdomains: 'abcd',
          }).addTo(map);
          
          // Klick-Event für Karte
          map.on('click', function(e) {
            if (editMode) {
              showAddLocationForm(e.latlng.lat, e.latlng.lng);
            }
          });
        }
        
        // Formatiert das Datum im Format MM/YYYY auf Deutsch (z.B. "Mai 2023")
        function formatDate(dateString) {
          if (!dateString) return '';
          
          try {
            // Falls es schon im Format "Mai 2023" ist
            if (dateString.includes(' ') && !dateString.includes('-')) {
              return dateString;
            }
            
            // Falls wir ein Datum im HTML5 month-Format haben (YYYY-MM)
            let date;
            if (dateString.includes('-')) {
              const [year, month] = dateString.split('-');
              date = new Date(parseInt(year), parseInt(month) - 1);
            } else {
              date = new Date(dateString);
            }
            
            if (isNaN(date.getTime())) return dateString; // Fallback auf Original
            
            const months = [
              'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 
              'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
            ];
            
            return months[date.getMonth()] + ' ' + date.getFullYear();
          } catch (error) {
            console.error('Fehler beim Formatieren des Datums:', error);
            return dateString; // Fallback auf Original
          }
        }
        
        // HTML5 month-Format (YYYY-MM) erzeugen
        function toMonthInputFormat(dateString) {
          if (!dateString) return '';
          
          try {
            // Schon im richtigen Format?
            if (dateString.match(/^\d{4}-\d{2}$/)) {
              return dateString;
            }
            
            // Format "Mai 2023" in "2023-05" umwandeln
            const parts = dateString.split(' ');
            if (parts.length === 2) {
              const month = parts[0];
              const year = parts[1];
              
              const months = [
                'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 
                'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
              ];
              
              const monthIndex = months.findIndex(m => m === month);
              if (monthIndex !== -1) {
                // Monat mit führender Null (01-12)
                const monthNumber = (monthIndex + 1).toString().padStart(2, '0');
                return \`\${year}-\${monthNumber}\`;
              }
            }
            
            // Sonst versuchen wir ein Date-Objekt zu erstellen
            const date = new Date(dateString);
            if (!isNaN(date.getTime())) {
              const year = date.getFullYear();
              // Monat mit führender Null (01-12)
              const month = (date.getMonth() + 1).toString().padStart(2, '0');
              return \`\${year}-\${month}\`;
            }
            
            return '';
          } catch (error) {
            console.error('Fehler beim Konvertieren des Datums:', error);
            return '';
          }
        }
        
        // Orte laden
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
              locationList.innerHTML = '<div style="text-align: center; padding: 20px;">Noch keine Orte hinzugefügt</div>';
            } else {
              // Nach Datum sortieren (neueste zuerst)
              locations.sort((a, b) => {
                // Wenn kein Datum, dann ans Ende
                if (!a.date) return 1;
                if (!b.date) return -1;
                
                // Versuchen wir, die Daten zu vergleichen
                try {
                  const dateA = new Date(a.date);
                  const dateB = new Date(b.date);
                  
                  // Wenn beide gültige Daten, nach Datum sortieren
                  if (!isNaN(dateA) && !isNaN(dateB)) {
                    return dateB - dateA;
                  }
                } catch (e) {
                  console.error('Fehler beim Sortieren:', e);
                }
                
                // Sonst nach Titel
                return a.title.localeCompare(b.title);
              });
              
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
          
          let dateDisplay = '';
          if (location.date) {
            dateDisplay = \`<div class="location-date">\${formatDate(location.date)}</div>\`;
          }
          
          locationItem.innerHTML = \`
            <img src="/direct-image/\${location.id}?sessionId=\${sessionId}" alt="\${location.title}" class="location-thumbnail">
            <div class="location-info">
              <h3 class="location-title">\${location.title}</h3>
              \${dateDisplay}
            </div>
          \`;
          
          locationItem.addEventListener('click', () => {
            showLocationDetail(location.id);
            // Für mobile Geräte die Seitenleiste schließen
            document.querySelector('.sidebar').classList.remove('open');
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
            
            // Datum anzeigen wenn vorhanden
            const dateElement = document.getElementById('detail-date');
            if (location.date) {
              dateElement.textContent = formatDate(location.date);
              dateElement.style.display = 'block';
            } else {
              dateElement.style.display = 'none';
            }
            
            document.getElementById('detail-image').src = \`/direct-image/\${id}?sessionId=\${sessionId}&t=\${Date.now()}\`;
            document.getElementById('detail-description').textContent = location.description || 'Keine Beschreibung vorhanden';
            
            // Karte auf den Ort zentrieren
            map.setView([location.latitude, location.longitude], 8);
            
            // Modal anzeigen
            document.getElementById('location-detail-container').style.display = 'flex';
            
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
          document.getElementById('form-heading').textContent = 'Ort hinzufügen';
          
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
            
            // Datum im richtigen Format (YYYY-MM)
            if (location.date) {
              document.getElementById('form-date').value = toMonthInputFormat(location.date);
            } else {
              document.getElementById('form-date').value = '';
            }
            
            // Bild ist beim Bearbeiten optional
            document.getElementById('form-image').required = false;
            
            // Titel anpassen
            document.getElementById('form-heading').textContent = 'Ort bearbeiten';
            
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
              document.getElementById('location-detail-container').style.display = 'none';
              
              // Bestätigungsdialog schließen
              document.getElementById('delete-confirmation').style.display = 'none';
              
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
          // Seitenleiste ein-/ausblenden
          document.getElementById('menu-toggle').addEventListener('click', function() {
            document.querySelector('.sidebar').classList.add('open');
          });
          
          document.querySelector('.sidebar-close').addEventListener('click', function() {
            document.querySelector('.sidebar').classList.remove('open');
          });
          
          // Bearbeitungsmodus umschalten
          document.getElementById('edit-mode-toggle').addEventListener('click', function() {
            editMode = !editMode;
            
            if (editMode) {
              this.textContent = 'Fertig';
              this.classList.add('primary');
              document.getElementById('edit-mode-indicator').style.display = 'block';
            } else {
              this.textContent = 'Bearbeiten';
              this.classList.remove('primary');
              document.getElementById('edit-mode-indicator').style.display = 'none';
              
              // Temporären Marker entfernen, falls vorhanden
              if (tempMarker) {
                map.removeLayer(tempMarker);
                tempMarker = null;
              }
            }
          });
          
          // Neuen Ort hinzufügen
          document.getElementById('add-location-btn').addEventListener('click', function() {
            if (!editMode) {
              // Automatisch in den Edit-Modus wechseln
              editMode = true;
              document.getElementById('edit-mode-toggle').textContent = 'Fertig';
              document.getElementById('edit-mode-toggle').classList.add('primary');
              document.getElementById('edit-mode-indicator').style.display = 'block';
            }
            
            // Seitenleiste schließen
            document.querySelector('.sidebar').classList.remove('open');
            
            alert('Klicke nun auf die Karte, um einen neuen Ort hinzuzufügen');
          });
          
          // Formular-Schließen-Buttons
          document.getElementById('form-close').addEventListener('click', closeLocationForm);
          document.getElementById('form-cancel').addEventListener('click', closeLocationForm);
          
          // Detail-Schließen-Button
          document.getElementById('detail-close').addEventListener('click', function() {
            document.getElementById('location-detail-container').style.display = 'none';
            selectedLocationId = null;
          });
          
          // Ort bearbeiten
          document.getElementById('detail-edit').addEventListener('click', function() {
            if (selectedLocationId) {
              document.getElementById('location-detail-container').style.display = 'none';
              showEditLocationForm(selectedLocationId);
            }
          });
          
          // Ort löschen Dialog
          document.getElementById('detail-delete').addEventListener('click', function() {
            if (selectedLocationId) {
              document.getElementById('location-detail-container').style.display = 'none';
              document.getElementById('delete-confirmation').style.display = 'flex';
            }
          });
          
          // Löschen bestätigen
          document.getElementById('delete-confirm').addEventListener('click', function() {
            if (selectedLocationId) {
              deleteLocation(selectedLocationId);
            }
          });
          
          // Löschen abbrechen
          document.getElementById('delete-cancel').addEventListener('click', function() {
            document.getElementById('delete-confirmation').style.display = 'none';
            document.getElementById('location-detail-container').style.display = 'flex';
          });
          
          document.getElementById('delete-cancel-x').addEventListener('click', function() {
            document.getElementById('delete-confirmation').style.display = 'none';
            document.getElementById('location-detail-container').style.display = 'flex';
          });
          
          // Abmelden
          document.getElementById('logout-btn').addEventListener('click', function() {
            window.location.href = '/logout';
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
                closeLocationForm();
                
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
        }
        
        // Formular schließen und temporären Marker entfernen
        function closeLocationForm() {
          document.getElementById('location-form-container').style.display = 'none';
          
          if (tempMarker) {
            map.removeLayer(tempMarker);
            tempMarker = null;
          }
        }
        
        // Ladeindikator anzeigen
        function showLoading(text) {
          document.getElementById('loading-text').textContent = text || 'Wird geladen...';
          document.getElementById('loading-overlay').style.display = 'flex';
        }
        
        // Ladeindikator verbergen
        function hideLoading() {
          document.getElementById('loading-overlay').style.display = 'none';
        }
      </script>
    </body>
    </html>
  `);
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
          font-family: Arial, sans-serif;
          background-color: #222;
          color: white;
          min-height: 100%;
        }
        
        .admin-container {
          max-width: 900px;
          margin: 0 auto;
          padding: 30px 20px;
        }
        
        .page-title {
          color: #f2960c;
          font-size: 2rem;
          margin-bottom: 30px;
          border-bottom: 2px solid #444;
          padding-bottom: 15px;
        }
        
        .card {
          background-color: #333;
          border-radius: 10px;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
          padding: 25px;
          margin-bottom: 30px;
        }
        
        .card-title {
          color: #f2960c;
          font-size: 1.5rem;
          margin-top: 0;
          margin-bottom: 20px;
          border-bottom: 1px solid #444;
          padding-bottom: 10px;
        }
        
        .button {
          background-color: #444;
          color: white;
          border: none;
          padding: 10px 18px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 1rem;
          transition: background-color 0.3s, transform 0.2s;
          display: inline-block;
          margin-right: 10px;
          margin-bottom: 10px;
          text-decoration: none;
        }
        
        .button:hover {
          background-color: #555;
          transform: translateY(-2px);
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
        
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 20px;
          margin-top: 25px;
        }
        
        .stat-card {
          background-color: #444;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
        }
        
        .stat-value {
          font-size: 2rem;
          font-weight: bold;
          color: #f2960c;
          margin-bottom: 10px;
        }
        
        .stat-label {
          font-size: 1rem;
          opacity: 0.8;
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: bold;
        }
        
        .form-group input, .form-group textarea, .form-group select {
          width: 100%;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #555;
          background-color: #444;
          color: white;
          box-sizing: border-box;
          font-size: 1rem;
        }
        
        .confirmation-dialog {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.7);
          z-index: 1000;
          justify-content: center;
          align-items: center;
        }
        
        .dialog-content {
          background-color: #333;
          border-radius: 10px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          padding: 30px;
          width: 90%;
          max-width: 500px;
        }
        
        .dialog-title {
          color: #e74c3c;
          font-size: 1.5rem;
          margin-top: 0;
          margin-bottom: 20px;
          border-bottom: 1px solid #444;
          padding-bottom: 10px;
        }
        
        .dialog-message {
          margin-bottom: 25px;
          line-height: 1.5;
        }
        
        .confirmation-input {
          width: 100%;
          padding: 15px;
          margin-bottom: 25px;
          background-color: #444;
          border: 1px solid #555;
          color: white;
          border-radius: 8px;
          font-size: 1rem;
        }
        
        .dialog-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 15px;
        }
        
        .loading-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.7);
          display: none;
          justify-content: center;
          align-items: center;
          z-index: 2000;
        }
        
        .loading-container {
          background-color: #333;
          border-radius: 10px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          padding: 30px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }
        
        .spinner {
          border: 5px solid rgba(255, 255, 255, 0.2);
          border-top: 5px solid #f2960c;
          border-radius: 50%;
          width: 50px;
          height: 50px;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .loading-text {
          font-size: 1.2rem;
        }
        
        @media (max-width: 768px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
          
          .admin-container {
            padding: 20px 15px;
          }
          
          .dialog-content {
            width: 95%;
            padding: 20px;
          }
        }
      </style>
    </head>
    <body>
      <div class="admin-container">
        <h1 class="page-title">Susibert Administrations-Bereich</h1>
        
        <div class="card">
          <h2 class="card-title">Navigation</h2>
          <a href="/?sessionId=${sessionId}" class="button primary">Zurück zur Karte</a>
          <a href="/logout" class="button">Abmelden</a>
        </div>
        
        <div class="card">
          <h2 class="card-title">Systemstatus</h2>
          
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value" id="db-status">-</div>
              <div class="stat-label">Datenbank-Status</div>
            </div>
            
            <div class="stat-card">
              <div class="stat-value" id="location-count">-</div>
              <div class="stat-label">Anzahl Orte</div>
            </div>
            
            <div class="stat-card">
              <div class="stat-value" id="storage-usage">-</div>
              <div class="stat-label">Speichernutzung</div>
            </div>
          </div>
        </div>
        
        <div class="card">
          <h2 class="card-title">Datenbank-Operationen</h2>
          <button id="reset-db-button" class="button danger">Datenbank zurücksetzen</button>
          <button id="optimize-images-button" class="button primary">Bilder optimieren</button>
          <button id="generate-thumbnails-button" class="button primary">Thumbnails generieren</button>
          <button id="fix-database-button" class="button primary">Datenbank reparieren</button>
        </div>
        
        <div class="card">
          <h2 class="card-title">Pärchenbild ändern</h2>
          <form id="couple-image-form" enctype="multipart/form-data">
            <input type="hidden" name="sessionId" value="${sessionId}">
            <div class="form-group">
              <label for="couple-image">Neues Pärchenbild auswählen</label>
              <input type="file" id="couple-image" name="image" accept="image/*" required>
            </div>
            
            <button type="submit" class="button primary">Bild hochladen</button>
          </form>
        </div>
      </div>
      
      <!-- Bestätigungsdialog für Datenbank-Reset -->
      <div class="confirmation-dialog" id="reset-confirmation">
        <div class="dialog-content">
          <h2 class="dialog-title">Datenbank zurücksetzen</h2>
          <div class="dialog-message">
            <p><strong>WARNUNG:</strong> Alle Orte, Bilder und Daten werden unwiderruflich gelöscht!</p>
            <p>Gib "RESET" ein, um zu bestätigen:</p>
          </div>
          <input type="text" class="confirmation-input" id="reset-confirmation-input" placeholder="RESET">
          <div class="dialog-message" id="reset-confirmation-error" style="color: #e74c3c; display: none; margin-top: -15px;">
            Falsche Eingabe! Bitte gib genau "RESET" ein.
          </div>
          <div class="dialog-buttons">
            <button class="button" id="cancel-reset">Abbrechen</button>
            <button class="button danger" id="confirm-reset">Zurücksetzen</button>
          </div>
        </div>
      </div>
      
      <!-- Ladeindikator -->
      <div class="loading-overlay" id="loading-overlay">
        <div class="loading-container">
          <div class="spinner"></div>
          <div class="loading-text" id="loading-text">Wird geladen...</div>
        </div>
      </div>
      
      <script>
        // Sessionverwaltung
        const sessionId = "${sessionId}";
        
        // Bei Seitenladung
        document.addEventListener('DOMContentLoaded', function() {
          // Statistiken laden
          loadStats();
          
          // Event-Listener registrieren
          setupEventListeners();
        });
        
        // Event-Listener
        function setupEventListeners() {
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
            showLoading('Datenbank wird zurückgesetzt...');
            
            fetch(\`/api/admin/reset-database?sessionId=\${sessionId}\`, {
              method: 'POST'
            })
              .then(response => response.json())
              .then(data => {
                hideLoading();
                
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
                hideLoading();
                console.error('Fehler beim Zurücksetzen der Datenbank:', error);
                alert('Fehler beim Zurücksetzen der Datenbank: ' + error.message);
              });
          });
          
          // Bilder optimieren
          document.getElementById('optimize-images-button').addEventListener('click', function() {
            if (!confirm('Alle Bilder werden neu komprimiert. Dieser Vorgang kann einige Zeit dauern. Fortfahren?')) {
              return;
            }
            
            showLoading('Bilder werden optimiert...');
            
            fetch(\`/api/admin/optimize-images?sessionId=\${sessionId}\`, {
              method: 'POST'
            })
              .then(response => response.json())
              .then(data => {
                hideLoading();
                
                if (data.success) {
                  // Statistiken neu laden
                  loadStats();
                  
                  alert(\`Bildoptimierung abgeschlossen: \${data.optimizedCount} Bilder optimiert.\`);
                } else {
                  throw new Error(data.message || 'Unbekannter Fehler');
                }
              })
              .catch(error => {
                hideLoading();
                console.error('Fehler bei der Bildoptimierung:', error);
                alert('Fehler bei der Bildoptimierung: ' + error.message);
              });
          });
          
          // Thumbnails generieren
          document.getElementById('generate-thumbnails-button').addEventListener('click', function() {
            if (!confirm('Für alle Bilder werden neue Thumbnails generiert. Dieser Vorgang kann einige Zeit dauern. Fortfahren?')) {
              return;
            }
            
            showLoading('Thumbnails werden generiert...');
            
            fetch(\`/api/admin/generate-thumbnails?sessionId=\${sessionId}\`, {
              method: 'POST'
            })
              .then(response => response.json())
              .then(data => {
                hideLoading();
                
                if (data.success) {
                  alert(\`Thumbnail-Generierung abgeschlossen: \${data.generatedCount} Thumbnails erstellt.\`);
                } else {
                  throw new Error(data.message || 'Unbekannter Fehler');
                }
              })
              .catch(error => {
                hideLoading();
                console.error('Fehler bei der Thumbnail-Generierung:', error);
                alert('Fehler bei der Thumbnail-Generierung: ' + error.message);
              });
          });
          
          // Datenbank reparieren
          document.getElementById('fix-database-button').addEventListener('click', function() {
            if (!confirm('Die Datenbank wird auf Fehler überprüft und repariert. Dieser Vorgang kann einige Zeit dauern. Fortfahren?')) {
              return;
            }
            
            showLoading('Datenbank wird repariert...');
            
            fetch(\`/api/admin/fix-database?sessionId=\${sessionId}\`, {
              method: 'POST'
            })
              .then(response => response.json())
              .then(data => {
                hideLoading();
                
                if (data.success) {
                  // Statistiken neu laden
                  loadStats();
                  
                  let message = 'Datenbank erfolgreich repariert.\\n\\n';
                  if (data.fixedColumns > 0) message += \`- \${data.fixedColumns} fehlende Spalten hinzugefügt\\n\`;
                  if (data.fixedImageTypes > 0) message += \`- \${data.fixedImageTypes} Bildtypen korrigiert\\n\`;
                  if (data.missingThumbnails > 0) message += \`- \${data.missingThumbnails} fehlende Thumbnails gefunden\`;
                  
                  alert(message);
                } else {
                  throw new Error(data.message || 'Unbekannter Fehler');
                }
              })
              .catch(error => {
                hideLoading();
                console.error('Fehler bei der Datenbankreperation:', error);
                alert('Fehler bei der Datenbankreperation: ' + error.message);
              });
          });
          
          // Pärchenbild-Formular
          document.getElementById('couple-image-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            
            showLoading('Pärchenbild wird hochgeladen...');
            
            try {
              const response = await fetch(\`/api/admin/couple-image?sessionId=\${sessionId}\`, {
                method: 'POST',
                body: formData
              });
              
              hideLoading();
              
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
              hideLoading();
              console.error('Fehler beim Hochladen des Pärchenbilds:', error);
              alert('Fehler beim Hochladen des Pärchenbilds: ' + error.message);
            }
          });
        }
        
        // Statistiken laden
        async function loadStats() {
          try {
            showLoading('Statistiken werden geladen...');
            
            const response = await fetch(\`/api/admin/stats?sessionId=\${sessionId}\`);
            
            hideLoading();
            
            if (!response.ok) throw new Error('Fehler beim Laden der Statistiken');
            
            const stats = await response.json();
            
            document.getElementById('db-status').textContent = stats.dbStatus;
            document.getElementById('location-count').textContent = stats.locationCount;
            document.getElementById('storage-usage').textContent = stats.storageUsage;
          } catch (error) {
            hideLoading();
            console.error('Fehler beim Laden der Statistiken:', error);
            document.getElementById('db-status').textContent = 'Fehler';
            document.getElementById('location-count').textContent = 'Fehler';
            document.getElementById('storage-usage').textContent = 'Fehler';
          }
        }
        
        // Ladeindikator anzeigen
        function showLoading(text) {
          document.getElementById('loading-text').textContent = text || 'Wird geladen...';
          document.getElementById('loading-overlay').style.display = 'flex';
        }
        
        // Ladeindikator verbergen
        function hideLoading() {
          document.getElementById('loading-overlay').style.display = 'none';
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

// Thumbnail erstellen
async function createThumbnail(buffer) {
  try {
    const thumbnail = await sharp(buffer)
      .resize(200) // Maximal 200px Breite/Höhe
      .jpeg({ quality: 70 })
      .toBuffer();
    
    return thumbnail.toString('base64');
  } catch (error) {
    console.error('Fehler bei der Thumbnail-Erstellung:', error);
    return null;
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
    const result = await client.query('SELECT id, title, latitude, longitude, date FROM locations ORDER BY id DESC');
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
    const result = await client.query('SELECT id, title, description, latitude, longitude, date FROM locations WHERE id = $1', [id]);
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
    
    const { title, description, latitude, longitude, date } = req.body;
    
    console.log(`Titel: ${title}, Lat: ${latitude}, Lng: ${longitude}, Datum: ${date}, Beschreibung: ${description}`);
    
    if (!title || !latitude || !longitude) {
      return res.status(400).json({ success: false, message: 'Titel, Breitengrad und Längengrad sind erforderlich' });
    }
    
    // Bild verarbeiten
    const imageBuffer = req.file.buffer;
    const imageType = req.file.mimetype;
    
    console.log(`Originalbild: ${imageBuffer.length} Bytes, Typ: ${imageType}`);
    
    // Bild komprimieren
    const compressedImage = await compressImage(imageBuffer, imageType);
    
    // Base64-Kodierung für Bild
    const imageBase64 = compressedImage.buffer.toString('base64');
    
    // Thumbnail erstellen
    const thumbnailBase64 = await createThumbnail(compressedImage.buffer);
    
    // In Datenbank speichern
    const client = await pool.connect();
    const result = await client.query(
      'INSERT INTO locations (title, description, latitude, longitude, date, image, thumbnail, image_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [title, description, latitude, longitude, date, imageBase64, thumbnailBase64, compressedImage.mimeType]
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
    const { title, description, latitude, longitude, date } = req.body;
    
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
      
      // Base64-Kodierung für Bild
      const imageBase64 = compressedImage.buffer.toString('base64');
      
      // Thumbnail erstellen
      const thumbnailBase64 = await createThumbnail(compressedImage.buffer);
      
      // Mit neuem Bild aktualisieren
      await client.query(
        'UPDATE locations SET title = $1, description = $2, latitude = $3, longitude = $4, date = $5, image = $6, thumbnail = $7, image_type = $8 WHERE id = $9',
        [title, description, latitude, longitude, date, imageBase64, thumbnailBase64, compressedImage.mimeType, id]
      );
    } else {
      // Ohne Bild aktualisieren
      await client.query(
        'UPDATE locations SET title = $1, description = $2, latitude = $3, longitude = $4, date = $5 WHERE id = $6',
        [title, description, latitude, longitude, date, id]
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
        
        // Nur aktualisieren, wenn die Kompression einen Effekt hatte
        if (compressedImage.buffer.length < imageBuffer.length) {
          // Base64-Kodierung
          const imageBase64 = compressedImage.buffer.toString('base64');
          
          // In Datenbank aktualisieren
          await client.query(
            'UPDATE locations SET image = $1, image_type = $2 WHERE id = $3',
            [imageBase64, compressedImage.mimeType, row.id]
          );
          
          optimizedCount++;
        }
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

// Admin-API: Thumbnails generieren
app.post('/api/admin/generate-thumbnails', requireAuth, async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Alle Bilder holen
    const result = await client.query('SELECT id, image, image_type FROM locations');
    
    let generatedCount = 0;
    
    // Thumbnails für alle Bilder generieren
    for (const row of result.rows) {
      try {
        if (!row.image) continue;
        
        const imageBuffer = Buffer.from(row.image, 'base64');
        
        // Thumbnail erstellen
        const thumbnailBase64 = await createThumbnail(imageBuffer);
        
        if (thumbnailBase64) {
          // In Datenbank aktualisieren
          await client.query(
            'UPDATE locations SET thumbnail = $1 WHERE id = $2',
            [thumbnailBase64, row.id]
          );
          
          generatedCount++;
        }
      } catch (error) {
        console.error(`Fehler bei der Thumbnail-Generierung für Bild ${row.id}:`, error);
      }
    }
    
    client.release();
    
    res.json({ success: true, generatedCount });
  } catch (error) {
    console.error('Fehler bei der Thumbnail-Generierung:', error);
    res.status(500).json({ success: false, message: 'Serverfehler' });
  }
});

// Admin-API: Datenbank reparieren
app.post('/api/admin/fix-database', requireAuth, async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Prüfen, ob die Spalten existieren
    const checkColumns = async (table, columns) => {
      const existingColumns = [];
      const missingColumns = [];
      
      for (const column of columns) {
        const columnCheck = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = $1 AND column_name = $2
          );
        `, [table, column]);
        
        if (columnCheck.rows[0].exists) {
          existingColumns.push(column);
        } else {
          missingColumns.push(column);
        }
      }
      
      return { existingColumns, missingColumns };
    };
    
    // Locations-Tabelle überprüfen
    const { existingColumns, missingColumns } = await checkColumns('locations', ['thumbnail', 'image_type', 'date']);
    
    console.log(`Vorhandene Spalten in locations: ${existingColumns.join(', ')}`);
    console.log(`Fehlende Spalten in locations: ${missingColumns.join(', ')}`);
    
    // Fehlende Spalten hinzufügen
    for (const column of missingColumns) {
      if (column === 'thumbnail') {
        await client.query('ALTER TABLE locations ADD COLUMN thumbnail TEXT');
        console.log('Spalte "thumbnail" hinzugefügt');
      } else if (column === 'image_type') {
        await client.query('ALTER TABLE locations ADD COLUMN image_type VARCHAR(50)');
        console.log('Spalte "image_type" hinzugefügt');
      } else if (column === 'date') {
        await client.query('ALTER TABLE locations ADD COLUMN date TEXT');
        console.log('Spalte "date" hinzugefügt');
      }
    }
    
    // Überprüfen, ob Bilder vorhanden sind und image_type gesetzt ist
    const locations = await client.query('SELECT id, image, image_type FROM locations WHERE image IS NOT NULL');
    let fixedCount = 0;
    
    for (const location of locations.rows) {
      if (!location.image_type) {
        // image_type anhand der Bilddaten bestimmen
        await client.query('UPDATE locations SET image_type = $1 WHERE id = $2', ['image/jpeg', location.id]);
        fixedCount++;
      }
    }
    
    console.log(`${fixedCount} Einträge mit fehlendem image_type repariert`);
    
    // Überprüfen, ob Thumbnails vorhanden sind
    const missingThumbnails = await client.query('SELECT COUNT(*) FROM locations WHERE image IS NOT NULL AND (thumbnail IS NULL OR thumbnail = \'\')');
    const missingCount = parseInt(missingThumbnails.rows[0].count);
    
    console.log(`${missingCount} Einträge ohne Thumbnails gefunden`);
    
    client.release();
    
    res.json({ 
      success: true, 
      fixedColumns: missingColumns.length,
      fixedImageTypes: fixedCount,
      missingThumbnails: missingCount
    });
  } catch (error) {
    console.error('Fehler bei der Datenbankreperation:', error);
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
    const imageBase64 = compressedImage.buffer.toString('base64');
    
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
      [imageBase64, compressedImage.mimeType]
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
          date TEXT,
          image TEXT,
          thumbnail TEXT,
          image_type VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      console.log('Tabelle "locations" wurde erstellt');
    } else {
      // Prüfen, ob die date-Spalte existiert
      const dateColumnCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'locations' AND column_name = 'date'
        );
      `);
      
      const dateColumnExists = dateColumnCheck.rows[0].exists;
      
      if (!dateColumnExists) {
        console.log('Füge Spalte "date" zur Tabelle "locations" hinzu...');
        
        await client.query(`
          ALTER TABLE locations 
          ADD COLUMN date TEXT;
        `);
        
        console.log('Spalte "date" wurde hinzugefügt');
      }
    }
    
    client.release();
    
    // Server starten
    app.listen(port, () => {
      console.log(`
      ===================================
      🌍 Susibert - Verbesserte UI läuft auf Port ${port}
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