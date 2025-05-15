#!/bin/bash

# Ultra-Simple Build Script for Render
set -ex

echo "=== Ultra Simple Build Script ==="

# 1. Installiere notwendige Pakete
npm install express pg multer sharp fs-extra

# 2. Erstelle Verzeichnisstruktur
mkdir -p dist/uploads

# 3. Kopiere Bilder
cp -rv uploads/* dist/uploads/ || echo "Keine Bilder gefunden"

# 4. Erstelle ultra-einfachen Server
cat > dist/index.js << 'EOF'
// Ultra Simple Server für Render
const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Konfiguration
const PORT = process.env.PORT || 10000;
const ACCESS_CODE = process.env.ACCESS_CODE || 'suuuu';
const DATABASE_URL = process.env.DATABASE_URL;

// App initialisieren
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Statische Dateien
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Sessions
const sessions = {};

// Datenbank-Verbindung
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Verbindung prüfen
async function checkDatabaseConnection() {
  try {
    const client = await pool.connect();
    console.log('Datenbankverbindung hergestellt');
    
    // Tabelle locations prüfen
    const tablesCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
      );
    `);
    
    const tableExists = tablesCheck.rows[0].exists;
    console.log('Tabelle locations existiert:', tableExists);
    
    if (tableExists) {
      // Spalten prüfen
      const columnsResult = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
        ORDER BY ordinal_position;
      `);
      
      const columns = columnsResult.rows.map(row => row.column_name);
      console.log('Vorhandene Spalten:', columns);
    }
    
    client.release();
    return true;
  } catch (error) {
    console.error('Fehler bei Datenbankverbindung:', error);
    return false;
  }
}

// Session erstellen
function createSession() {
  const sessionId = crypto.randomBytes(16).toString('hex');
  sessions[sessionId] = {
    created: Date.now(),
    authenticated: false
  };
  return sessionId;
}

// Session prüfen
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

// Login-Seite
app.get('/', (req, res) => {
  const sessionId = createSession();
  
  // Login-HTML
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
        const loginForm = document.getElementById("loginForm");
        const errorMessage = document.getElementById("errorMessage");
        
        loginForm.addEventListener("submit", function(e) {
          e.preventDefault();
          
          const accessCode = document.getElementById("accessCode").value;
          
          fetch("/login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
              accessCode: accessCode,
              sessionId: "${sessionId}"
            })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              window.location.href = data.redirect;
            } else {
              errorMessage.textContent = data.message;
              errorMessage.style.display = "block";
            }
          })
          .catch(error => {
            console.error("Fehler:", error);
            errorMessage.textContent = "Ein Fehler ist aufgetreten. Bitte versuche es später erneut.";
            errorMessage.style.display = "block";
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
    res.json({ success: true, redirect: '/map?sessionId=' + sessionId });
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

// Admin-Bereich
app.get('/admin', requireAuth, async (req, res) => {
  const sessionId = req.query.sessionId;
  
  try {
    // Spalten abfragen
    const client = await pool.connect();
    const columnsResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'locations'
      ORDER BY ordinal_position;
    `);
    
    const columns = columnsResult.rows.map(row => `${row.column_name} (${row.data_type})`);
    
    // Orte zählen
    const countResult = await client.query('SELECT COUNT(*) FROM locations;');
    const locationCount = countResult.rows[0].count;
    
    client.release();
    
    // Admin-HTML
    res.send(`
      <!DOCTYPE html>
      <html lang="de">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Susibert - Admin</title>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            background-color: #1a1a1a;
            color: #f5f5f5;
            margin: 0;
            padding: 0;
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
          
          .content {
            max-width: 800px;
            margin: 30px auto;
            padding: 0 20px;
          }
          
          .admin-title {
            font-size: 2rem;
            color: #f59a0c;
            margin-bottom: 30px;
            text-align: center;
          }
          
          .admin-section {
            background-color: #222;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
          }
          
          .section-title {
            font-size: 1.4rem;
            margin-top: 0;
            margin-bottom: 15px;
            color: #f59a0c;
          }
          
          .info-box {
            background-color: #333;
            border: 1px solid #444;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
            font-family: monospace;
            white-space: pre-wrap;
            max-height: 200px;
            overflow-y: auto;
          }
          
          .warning {
            background-color: rgba(229, 57, 53, 0.2);
            border: 1px solid #e53935;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
          }
          
          .success-box {
            background-color: rgba(76, 175, 80, 0.2);
            border: 1px solid #4caf50;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
          }
          
          .admin-button {
            background-color: #e53935;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            margin-right: 10px;
          }
          
          .back-link {
            display: inline-block;
            margin-top: 20px;
            color: #f59a0c;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <a href="/map?sessionId=${sessionId}" class="logo">
            <div class="logo-circle">
              <img src="/uploads/couple.jpg" alt="Pärchenbild" onerror="this.src='/uploads/couple.png'">
            </div>
            <span class="logo-text">Susibert</span>
          </a>
        </div>
        
        <div class="content">
          <h1 class="admin-title">Administrator-Bereich</h1>
          
          <div class="admin-section">
            <h2 class="section-title">Datenbankstatus</h2>
            <div class="success-box">
              <strong>Anzahl der Orte:</strong> ${locationCount}<br>
            </div>
            <p><strong>Vollständige Spalteninformationen:</strong></p>
            <div class="info-box">${columns.join('\n')}</div>
          </div>
          
          <div class="admin-section">
            <h2 class="section-title">Hinweis</h2>
            <div class="warning">
              <strong>Wichtig:</strong> Diese vereinfachte Version zeigt nur grundlegende Informationen.
              <p>Die Datenbank verwendet vermutlich <strong>name</strong> statt <strong>title</strong>.</p>
            </div>
          </div>
          
          <a href="/map?sessionId=${sessionId}" class="back-link">← Zurück zur Karte</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Fehler beim Laden des Admin-Bereichs:', error);
    res.send(`
      <h1>Fehler beim Laden der Admin-Seite</h1>
      <p>${error.message}</p>
      <a href="/map?sessionId=${sessionId}">Zurück zur Karte</a>
    `);
  }
});

// Kartenansicht
app.get('/map', requireAuth, (req, res) => {
  const sessionId = req.query.sessionId;
  
  // Map-HTML
  res.send(`
    <!DOCTYPE html>
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
          height: 100vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        
        .header {
          background-color: #222;
          padding: 15px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
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
        
        .map-container {
          flex: 1;
          position: relative;
        }
        
        #map {
          width: 100%;
          height: 100%;
        }
        
        .controls {
          position: absolute;
          top: 20px;
          right: 20px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        
        .control-btn {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background-color: #222;
          color: #f59a0c;
          border: 1px solid #444;
          font-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }
        
        .sidebar {
          position: fixed;
          top: 70px;
          right: -300px;
          width: 300px;
          height: calc(100vh - 70px);
          background-color: rgba(34, 34, 34, 0.95);
          z-index: 1000;
          transition: right 0.3s ease;
          display: flex;
          flex-direction: column;
        }
        
        .sidebar.open {
          right: 0;
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
        
        .sidebar-close {
          background: none;
          border: none;
          color: #aaa;
          font-size: 1.5rem;
          cursor: pointer;
        }
        
        .locations-list {
          flex: 1;
          overflow-y: auto;
        }
        
        .sidebar-footer {
          padding: 15px;
          border-top: 1px solid #333;
        }
        
        .sidebar-btn {
          display: block;
          width: 100%;
          padding: 10px;
          text-align: center;
          background-color: #f59a0c;
          color: black;
          border: none;
          border-radius: 4px;
          font-weight: bold;
          cursor: pointer;
          margin-bottom: 10px;
          text-decoration: none;
        }
        
        .sidebar-btn.admin {
          background-color: #2196f3;
          color: white;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <a href="#" class="logo">
          <div class="logo-circle">
            <img src="/uploads/couple.jpg" alt="Pärchenbild" onerror="this.src='/uploads/couple.png'">
          </div>
          <span class="logo-text">Susibert</span>
        </a>
      </div>
      
      <div class="map-container">
        <div id="map"></div>
        
        <div class="controls">
          <button class="control-btn" id="menuBtn">☰</button>
          <button class="control-btn" id="logoutBtn">🚪</button>
        </div>
        
        <div class="sidebar" id="sidebar">
          <div class="sidebar-header">
            <h2 class="sidebar-title">Besuchte Orte</h2>
            <button class="sidebar-close" id="closeBtn">&times;</button>
          </div>
          
          <div class="locations-list" id="locationsList">
            <div style="padding: 20px; text-align: center; color: #999;">
              Lade Orte...
            </div>
          </div>
          
          <div class="sidebar-footer">
            <a href="/admin?sessionId=${sessionId}" class="sidebar-btn admin">Admin-Bereich</a>
            <button class="sidebar-btn" id="logoutBtn2">Abmelden</button>
          </div>
        </div>
      </div>
      
      <script>
        // Karte initialisieren
        const map = L.map('map').setView([30, 0], 2);
        
        // Kartenlayer hinzufügen
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        
        // DOM-Elemente
        const sidebar = document.getElementById('sidebar');
        const menuBtn = document.getElementById('menuBtn');
        const closeBtn = document.getElementById('closeBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const logoutBtn2 = document.getElementById('logoutBtn2');
        const locationsList = document.getElementById('locationsList');
        
        // Sidebar öffnen/schließen
        menuBtn.addEventListener('click', () => {
          sidebar.classList.add('open');
        });
        
        closeBtn.addEventListener('click', () => {
          sidebar.classList.remove('open');
        });
        
        // Abmelden
        logoutBtn.addEventListener('click', logout);
        logoutBtn2.addEventListener('click', logout);
        
        function logout() {
          if (confirm('Möchtest du dich wirklich abmelden?')) {
            window.location.href = '/logout?sessionId=${sessionId}';
          }
        }
        
        // Orte laden
        loadLocations();
        
        function loadLocations() {
          fetch('/api/locations?sessionId=${sessionId}')
            .then(response => {
              if (!response.ok) {
                throw new Error('Fehler beim Laden der Orte');
              }
              return response.json();
            })
            .then(locations => {
              if (locations.length === 0) {
                locationsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">Keine Orte vorhanden</div>';
                return;
              }
              
              let html = '';
              locations.forEach(location => {
                const title = location.name || location.title || 'Unbenannter Ort';
                
                html += \`
                  <div style="padding: 12px 15px; border-bottom: 1px solid #333; display: flex; flex-direction: column;">
                    <div style="font-weight: bold;">\${title}</div>
                    <div style="font-size: 0.8rem; color: #aaa;">\${location.latitude.toFixed(4)}, \${location.longitude.toFixed(4)}</div>
                  </div>
                \`;
                
                // Marker hinzufügen
                const marker = L.marker([location.latitude, location.longitude]).addTo(map);
                marker.bindPopup(\`<div style="font-weight: bold;">\${title}</div>\`);
                
                // Radius hinzufügen
                L.circle([location.latitude, location.longitude], {
                  color: '#f59a0c',
                  fillColor: '#f59a0c',
                  fillOpacity: 0.2,
                  radius: 50000 // 50km
                }).addTo(map);
              });
              
              locationsList.innerHTML = html;
            })
            .catch(error => {
              console.error('Fehler:', error);
              locationsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">Fehler beim Laden der Orte:<br>' + error.message + '</div>';
            });
        }
      </script>
    </body>
    </html>
  `);
});

// API-Endpunkte
app.get('/api/locations', requireAuth, async (req, res) => {
  try {
    // Spalten prüfen - versuche mit name
    const result = await pool.query('SELECT id, name, latitude, longitude, description FROM locations ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Fehler beim Abrufen der Orte:', error);
    
    // Versuche mit title, falls name nicht funktioniert
    try {
      const result = await pool.query('SELECT id, title, latitude, longitude, description FROM locations ORDER BY id DESC');
      res.json(result.rows);
    } catch (error2) {
      console.error('Fehler beim Abrufen der Orte (zweiter Versuch):', error2);
      res.status(500).json({ error: 'Fehler beim Abrufen der Orte' });
    }
  }
});

// Server starten
checkDatabaseConnection().then(connected => {
  console.log('Datenbankverbindung Status:', connected);
}).catch(err => {
  console.error('Fehler bei Datenbankverbindung:', err);
});

app.listen(PORT, () => {
  console.log('Server laeuft auf Port ' + PORT);
});
EOF

# 5. package.json erstellen
cat > dist/package.json << EOF
{
  "name": "susibert-map",
  "version": "1.0.0",
  "private": true,
  "engines": {
    "node": ">=14"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "fs-extra": "^11.2.0"
  },
  "scripts": {
    "start": "node index.js"
  }
}
EOF

echo "=== Ultra-Simple Build abgeschlossen ==="