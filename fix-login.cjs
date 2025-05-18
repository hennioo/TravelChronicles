// Fix für die Login-Probleme
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
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

// Erstes Bild aus der Datenbank als Pärchenbild verwenden
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

// Hauptseite mit Map - hier nur eine einfache Weiterleitung zum Original-Endpoint
app.get('/', requireAuth, (req, res) => {
  const sessionId = req.query.sessionId || req.cookies.sessionId;
  
  res.send(`
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Susibert</title>
      <style>
        body, html {
          margin: 0;
          padding: 0;
          height: 100%;
          background-color: #000;
          color: white;
          font-family: Arial, sans-serif;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        h1 {
          color: #f2960c;
          font-size: 2rem;
          margin-bottom: 30px;
        }
        p {
          margin-bottom: 20px;
          text-align: center;
          max-width: 600px;
          line-height: 1.6;
        }
        .message {
          background-color: #333;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
          margin-bottom: 20px;
          text-align: center;
        }
        img {
          max-width: 300px;
          height: auto;
          border-radius: 10px;
          margin-bottom: 20px;
        }
        .button {
          background-color: #f2960c;
          color: white;
          border: none;
          padding: 12px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 1rem;
          text-decoration: none;
          display: inline-block;
          margin-top: 20px;
          transition: background-color 0.3s;
        }
        .button:hover {
          background-color: #e08800;
        }
      </style>
    </head>
    <body>
      <div class="message">
        <h1>Erfolgreich angemeldet!</h1>
        <p>Du bist jetzt eingeloggt, ${sessionId}.</p>
        
        <img src="/first-image" alt="Reisebild">
        
        <p>Bald wird hier die interaktive Weltkarte verfügbar sein.</p>
        
        <a href="/logout" class="button">Abmelden</a>
      </div>
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

// Bild aus der Datenbank abrufen
app.get('/direct-image/:id', async (req, res) => {
  try {
    const id = req.params.id;
    
    const client = await pool.connect();
    
    const result = await client.query('SELECT image, image_type FROM locations WHERE id = $1', [id]);
    
    if (result.rows.length === 0 || !result.rows[0].image) {
      client.release();
      return res.status(404).send('Bild nicht gefunden');
    }
    
    const imageBase64 = result.rows[0].image;
    const imageType = result.rows[0].image_type || 'image/jpeg';
    
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    
    res.set('Content-Type', imageType);
    client.release();
    res.end(imageBuffer);
    
  } catch (err) {
    console.error('Fehler beim Abrufen des Bildes:', err);
    res.status(500).send('Fehler: ' + err.message);
  }
});

// API für alle Locations
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
    
    client.release();
    
    // Server starten
    app.listen(port, () => {
      console.log(`
      ===================================
      🔑 Login-Fix Server läuft auf Port ${port}
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