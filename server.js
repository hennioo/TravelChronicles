// Finale Render-kompatible Version
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

// Express-App und Port
const app = express();
const port = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Globale Variablen
let pool;
let dbConnected = false;
const sessions = {};
const ACCESS_CODE = process.env.ACCESS_CODE || 'suuuu';

// Verschiedene mögliche Uploads-Verzeichnisse einrichten für unterschiedliche Umgebungen
const uploadsDirectories = [
  path.join(__dirname, 'uploads'),  // Standard
  path.join(__dirname, 'dist', 'uploads'),  // Für Render
  path.join(__dirname, 'dist', 'public', 'uploads'),  // Alternative für Render
  path.join(__dirname, '..', 'uploads'),  // Für relative Pfade
  path.join(__dirname, '..', 'dist', 'uploads')  // Weitere Alternative
];

let uploadsDir = '';

// Versuche alle möglichen Verzeichnisse
for (const dir of uploadsDirectories) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log('Uploads-Verzeichnis erstellt: ' + dir);
    } else {
      console.log('Uploads-Verzeichnis existiert: ' + dir);
      
      // Überprüfe, ob das couple.jpg hier existiert
      const couplePath = path.join(dir, 'couple.jpg');
      if (fs.existsSync(couplePath)) {
        console.log('GEFUNDEN: couple.jpg existiert in: ' + dir);
      } else {
        console.log('couple.jpg fehlt in: ' + dir);
      }
    }
    
    // Verwende das erste erfolgreiche Verzeichnis
    if (!uploadsDir) {
      uploadsDir = dir;
    }
  } catch (error) {
    console.error('Fehler beim Prüfen des Verzeichnisses ' + dir + ':', error);
  }
}

if (!uploadsDir) {
  console.error('KRITISCH: Kein Uploads-Verzeichnis konnte erstellt werden!');
  // Verwende Standard als Fallback
  uploadsDir = path.join(__dirname, 'uploads');
}

// Statische Dateien und Uploads - mehrere Pfade für verschiedene Umgebungen
app.use('/uploads', express.static(uploadsDir));

// Zusätzliche Pfade für Render-Umgebung (für Fallback)
if (process.env.RENDER === 'true') {
  // Wenn auf Render ausgeführt, versuche auch diese Verzeichnisse
  const distUploadsDir = path.join(__dirname, 'dist', 'uploads');
  const publicUploadsDir = path.join(__dirname, 'dist', 'public', 'uploads');
  
  console.log('Render-Umgebung erkannt. Füge zusätzliche Upload-Pfade hinzu:');
  console.log('- ' + distUploadsDir);
  console.log('- ' + publicUploadsDir);
  
  app.use('/uploads', express.static(distUploadsDir));
  app.use('/uploads', express.static(publicUploadsDir));
  app.use('/public/uploads', express.static(publicUploadsDir));
}

// Datenbankverbindung initialisieren
try {
  if (process.env.DATABASE_URL) {
    console.log('Verbinde mit Datenbank über DATABASE_URL...');
    
    // Robustere DB-Verbindung für Render
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    // Teste die Verbindung
    pool.query('SELECT NOW() as now')
      .then(function(result) {
        console.log('Datenbankverbindung erfolgreich:', result.rows[0]);
        dbConnected = true;
        
        // Modifiziere die Tabelle um fehlende Spalten hinzuzufügen
        console.log('Prüfe Tabellenstruktur...');
        
        // Erste Abfrage: Überprüfe, ob highlight-Spalte ein NOT NULL Constraint hat
        return pool.query(`
          SELECT 
            column_name, is_nullable
          FROM 
            information_schema.columns 
          WHERE 
            table_name = 'locations' AND 
            column_name = 'highlight'
        `);
      })
      .then(function(result) {
        if (result.rows.length > 0 && result.rows[0].is_nullable === 'NO') {
          console.log('Aktualisiere "highlight" Spalte um NULL-Werte zu erlauben...');
          return pool.query(`ALTER TABLE locations ALTER COLUMN highlight DROP NOT NULL`);
        } else {
          console.log('Die Spalte "highlight" akzeptiert bereits NULL-Werte oder existiert nicht.');
          return Promise.resolve();
        }
      })
      .then(function() {
        console.log('Datenbankstruktur aktualisiert.');
      })
      .catch(function(err) {
        console.error('Fehler bei der Datenbankaktualisierung:', err);
      });
  } else {
    console.log('DATABASE_URL nicht vorhanden, starte im Offline-Modus');
  }
} catch (error) {
  console.error('Fehler beim Datenbankverbindungsaufbau:', error);
}

// Session Management
function createSession() {
  const sessionId = crypto.randomBytes(16).toString('hex');
  const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 Stunden
  sessions[sessionId] = { expires };
  return sessionId;
}

function isValidSession(sessionId) {
  if (!sessionId || !sessions[sessionId]) return false;
  
  if (sessions[sessionId].expires <= Date.now()) {
    delete sessions[sessionId];
    return false;
  }
  
  return true;
}

function requireAuth(req, res, next) {
  var sessionId = req.query.session;
  
  // Versuche, Session aus Cookies zu extrahieren
  if (!sessionId && req.headers.cookie) {
    var cookies = req.headers.cookie.split(';');
    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i].trim();
      if (cookie.startsWith('sessionId=')) {
        sessionId = cookie.split('=')[1];
        break;
      }
    }
  }
  
  if (isValidSession(sessionId)) {
    next();
  } else {
    res.redirect('/?error=auth');
  }
}

// Multer für Datei-Uploads konfigurieren
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'image-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: function(req, file, cb) {
    // HEIC, PNG und JPG/JPEG zulassen
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.heic'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Nur JPG, PNG und HEIC Bilder sind erlaubt'));
    }
  }
});

// Admin-Route für Datenbankübersicht
app.get('/admin', requireAuth, function(req, res) {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verbunden' });
  }

  pool.query('SELECT * FROM locations ORDER BY id DESC')
    .then(function(result) {
      const locations = result.rows;
      
      // Nachricht wenn die Datenbank geleert wurde
      const clearedMessage = req.query.cleared ? '<div style="background-color: rgba(0, 255, 0, 0.1); border: 1px solid #00aa00; color: #00cc00; padding: 10px; border-radius: 4px; margin-bottom: 20px;">Alle Orte wurden erfolgreich gelöscht.</div>' : '';
      const errorMessage = req.query.error ? `<div style="background-color: rgba(255, 0, 0, 0.1); border: 1px solid #aa0000; color: #ff4d4d; padding: 10px; border-radius: 4px; margin-bottom: 20px;">Fehler: ${req.query.error}</div>` : '';
      
      res.send(`
        <!DOCTYPE html>
        <html lang="de">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Datenbank-Admin - Susibert</title>
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
              border-bottom: 1px solid #333;
              padding-bottom: 10px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th, td {
              border: 1px solid #333;
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: #222;
            }
            tr:nth-child(even) {
              background-color: #222;
            }
            .actions {
              display: flex;
              gap: 10px;
            }
            .btn {
              display: inline-block;
              padding: 5px 10px;
              background-color: #f59a0c;
              color: black;
              border-radius: 4px;
              text-decoration: none;
              cursor: pointer;
              border: none;
              font-size: 14px;
              font-family: inherit;
            }
            .btn-danger {
              background-color: #d33;
              color: white;
            }
            .btn-nav {
              margin-right: 10px;
            }
            .warning {
              background-color: rgba(255, 0, 0, 0.1);
              padding: 10px;
              border-radius: 5px;
              margin-bottom: 20px;
            }
            
            /* Modaler Dialog */
            .modal {
              display: none;
              position: fixed;
              z-index: 1000;
              left: 0;
              top: 0;
              width: 100%;
              height: 100%;
              background-color: rgba(0,0,0,0.7);
            }
            
            .modal-content {
              background-color: #333;
              margin: 15% auto;
              padding: 20px;
              border-radius: 8px;
              width: 80%;
              max-width: 500px;
              text-align: center;
            }
            
            .modal-footer {
              display: flex;
              justify-content: center;
              gap: 10px;
              margin-top: 20px;
            }
            
            .close {
              color: #aaa;
              float: right;
              font-size: 28px;
              font-weight: bold;
              cursor: pointer;
            }
            
            .close:hover {
              color: white;
            }
            
            /* Zusätzliche Stile für die dreifache Bestätigung */
            .confirmation-step {
              display: none;
              margin-top: 15px;
            }
            
            .confirmation-step.active {
              display: block;
            }
            
            .confirmation-checkbox {
              margin-bottom: 15px;
            }
            
            .reset-progress {
              height: 10px;
              background-color: #444;
              border-radius: 5px;
              margin-top: 15px;
              overflow: hidden;
            }
            
            .reset-progress-bar {
              height: 100%;
              background-color: #d33;
              width: 0%;
              transition: width 0.3s;
            }
          </style>
        </head>
        <body>
          <h1>Datenbank-Admin</h1>
          
          ${clearedMessage}
          ${errorMessage}
          
          <a href="/map" class="btn btn-nav">Zurück zur Karte</a>
          <button id="resetDbBtn" class="btn btn-danger btn-nav">Datenbank zurücksetzen</button>
          
          <h2>Gespeicherte Orte (${locations.length})</h2>
          
          ${locations.length === 0 ? '<p>Keine Orte in der Datenbank.</p>' : ''}
          
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Datum</th>
                <th>Bild</th>
                <th>Beschreibung</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              ${locations.map(loc => `
                <tr>
                  <td>${loc.id}</td>
                  <td>${loc.name || ''}</td>
                  <td>${loc.date ? new Date(loc.date).toLocaleDateString() : '-'}</td>
                  <td>${loc.image ? 'Ja' : 'Nein'}</td>
                  <td>${loc.description || '-'}</td>
                  <td>
                    <div class="actions">
                      <a href="/api/locations/${loc.id}/delete" class="btn btn-danger" onclick="return confirm('Diesen Ort löschen?')">Löschen</a>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <!-- Modaler Dialog für die dreifache Bestätigung -->
          <div id="resetModal" class="modal">
            <div class="modal-content">
              <span class="close">&times;</span>
              <h2 style="color: #d33;">Datenbank vollständig zurücksetzen</h2>
              
              <div id="step1" class="confirmation-step active">
                <p><strong>WARNUNG:</strong> Diese Aktion wird <strong>alle</strong> Orte und Bilder unwiderruflich löschen.</p>
                <p>Diese Aktion kann nicht rückgängig gemacht werden.</p>
                <div class="modal-footer">
                  <button class="btn" id="cancelReset">Abbrechen</button>
                  <button class="btn btn-danger" id="confirmStep1">Weiter</button>
                </div>
              </div>
              
              <div id="step2" class="confirmation-step">
                <p><strong>Zweite Warnung:</strong> Du bist dabei, <strong>${locations.length} Orte</strong> zu löschen!</p>
                <p>Bitte bestätige, dass du dir der Konsequenzen bewusst bist.</p>
                <div class="confirmation-checkbox">
                  <input type="checkbox" id="confirmCheckbox">
                  <label for="confirmCheckbox">Ich verstehe, dass alle Daten verloren gehen werden</label>
                </div>
                <div class="modal-footer">
                  <button class="btn" id="backToStep1">Zurück</button>
                  <button class="btn btn-danger" id="confirmStep2" disabled>Weiter</button>
                </div>
              </div>
              
              <div id="step3" class="confirmation-step">
                <p><strong>Letzte Warnung:</strong> Gib "RESET" ein, um zu bestätigen:</p>
                <input type="text" id="resetText" placeholder="RESET" style="width: 100%; padding: 8px; margin: 10px 0; background: #222; border: 1px solid #444; color: white; border-radius: 4px;">
                <div class="reset-progress">
                  <div class="reset-progress-bar" id="resetProgressBar"></div>
                </div>
                <div class="modal-footer">
                  <button class="btn" id="backToStep2">Zurück</button>
                  <button class="btn btn-danger" id="finalReset" disabled>Datenbank zurücksetzen</button>
                </div>
              </div>
            </div>
          </div>
          
          <script>
            // Modal-Elemente
            const modal = document.getElementById("resetModal");
            const resetBtn = document.getElementById("resetDbBtn");
            const span = document.getElementsByClassName("close")[0];
            const cancelBtn = document.getElementById("cancelReset");
            
            // Bestätigungsschritte
            const step1 = document.getElementById("step1");
            const step2 = document.getElementById("step2");
            const step3 = document.getElementById("step3");
            
            // Schaltflächen
            const confirmStep1 = document.getElementById("confirmStep1");
            const backToStep1 = document.getElementById("backToStep1");
            const confirmStep2 = document.getElementById("confirmStep2");
            const backToStep2 = document.getElementById("backToStep2");
            const finalReset = document.getElementById("finalReset");
            
            // Eingabeelemente
            const confirmCheckbox = document.getElementById("confirmCheckbox");
            const resetText = document.getElementById("resetText");
            const resetProgressBar = document.getElementById("resetProgressBar");
            
            // Öffne Modal
            resetBtn.onclick = function() {
              modal.style.display = "block";
              showStep(1);
            }
            
            // Schließe Modal
            span.onclick = closeModal;
            cancelBtn.onclick = closeModal;
            
            function closeModal() {
              modal.style.display = "none";
              resetForm();
            }
            
            // Navigiere zwischen Schritten
            confirmStep1.onclick = function() {
              showStep(2);
            }
            
            backToStep1.onclick = function() {
              showStep(1);
            }
            
            confirmStep2.onclick = function() {
              showStep(3);
            }
            
            backToStep2.onclick = function() {
              showStep(2);
            }
            
            // Checkbox-Validierung
            confirmCheckbox.onchange = function() {
              confirmStep2.disabled = !this.checked;
            }
            
            // Text-Eingabe-Validierung mit Fortschrittsanzeige
            resetText.oninput = function() {
              const expectedText = "RESET";
              const currentText = this.value;
              const progress = (currentText.length / expectedText.length) * 100;
              
              resetProgressBar.style.width = progress + "%";
              
              if (currentText === expectedText) {
                finalReset.disabled = false;
                resetProgressBar.style.width = "100%";
              } else {
                finalReset.disabled = true;
              }
            }
            
            // Endgültiges Zurücksetzen
            finalReset.onclick = function() {
              window.location.href = "/admin/complete-reset";
            }
            
            // Helfer-Funktionen
            function showStep(stepNumber) {
              // Verstecke alle Schritte
              step1.classList.remove("active");
              step2.classList.remove("active");
              step3.classList.remove("active");
              
              // Zeige aktuellen Schritt
              if (stepNumber === 1) step1.classList.add("active");
              if (stepNumber === 2) step2.classList.add("active");
              if (stepNumber === 3) step3.classList.add("active");
            }
            
            function resetForm() {
              confirmCheckbox.checked = false;
              confirmStep2.disabled = true;
              resetText.value = "";
              finalReset.disabled = true;
              resetProgressBar.style.width = "0%";
              showStep(1);
            }
            
            // Klick außerhalb des Modals schließt es
            window.onclick = function(event) {
              if (event.target == modal) {
                closeModal();
              }
            }
          </script>
        </body>
        </html>
      `);
    })
    .catch(function(error) {
      res.status(500).send(`
        <h1>Fehler</h1>
        <p>Fehler beim Laden der Datenbank: ${error.message}</p>
        <a href="/map">Zurück zur Karte</a>
      `);
    });
});

// Vollständiger Datenbank-Reset (nach dreifacher Bestätigung)
app.get('/admin/complete-reset', requireAuth, function(req, res) {
  if (!dbConnected) {
    return res.redirect('/admin?error=' + encodeURIComponent('Datenbank nicht verbunden'));
  }

  pool.query('DELETE FROM locations')
    .then(function() {
      // Lösche auch alle Bilddateien im uploads-Verzeichnis, außer couple.jpg
      try {
        const files = fs.readdirSync(uploadsDir);
        for (const file of files) {
          if (file !== 'couple.jpg') {
            fs.unlinkSync(path.join(uploadsDir, file));
          }
        }
        console.log('Alle Bilder gelöscht (außer couple.jpg)');
      } catch (err) {
        console.error('Fehler beim Löschen der Bilder:', err);
      }
      
      res.redirect('/admin?cleared=true');
    })
    .catch(function(error) {
      console.error('Fehler beim Zurücksetzen der Datenbank:', error);
      res.redirect('/admin?error=' + encodeURIComponent('Fehler beim Zurücksetzen: ' + error.message));
    });
});

// Datenbank leeren
app.get('/admin/clear', requireAuth, function(req, res) {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verbunden' });
  }

  pool.query('DELETE FROM locations')
    .then(function() {
      res.redirect('/admin?cleared=true');
    })
    .catch(function(error) {
      res.status(500).send(`
        <h1>Fehler</h1>
        <p>Fehler beim Leeren der Datenbank: ${error.message}</p>
        <a href="/admin">Zurück zur Admin-Seite</a>
      `);
    });
});

// API-Routen

// Login-Check direkt
app.get('/login-check', function(req, res) {
  var inputCode = req.query.code;
  
  if (inputCode === ACCESS_CODE) {
    // Erstelle Session
    var sessionId = createSession();
    res.cookie('sessionId', sessionId, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    res.redirect('/map');
  } else {
    res.redirect('/?error=wrong-code');
  }
});

// Abmelden
app.get('/logout', function(req, res) {
  var sessionId = null;
  if (req.headers.cookie) {
    var cookies = req.headers.cookie.split(';');
    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i].trim();
      if (cookie.startsWith('sessionId=')) {
        sessionId = cookie.split('=')[1];
        break;
      }
    }
  }
  
  // Entferne Session
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
  }
  
  // Lösche Cookie
  res.clearCookie('sessionId');
  res.redirect('/');
});

// Locations API
app.get('/api/locations', requireAuth, function(req, res) {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verbunden' });
  }

  console.log("API: Lade Locations aus der Datenbank...");
  pool.query('SELECT * FROM locations ORDER BY id DESC')
    .then(function(result) {
      console.log("Locations geladen, Anzahl:", result.rows.length);
      
      var baseUrl = req.protocol + '://' + req.get('host');
      var locations = [];
      
      for (var i = 0; i < result.rows.length; i++) {
        var row = result.rows[i];
        
        // Speichere den Originaldateinamen für den Fallback-Mechanismus
        var originalFilename = row.image || '';
        var imagePath = originalFilename;
        
        // Verarbeite den Bildpfad nur für direkte Anzeige (Frontend kümmert sich um Fallbacks)
        if (imagePath && !imagePath.startsWith('http') && !imagePath.startsWith('/')) {
          imagePath = '/uploads/' + imagePath;
        }
        
        if (imagePath && imagePath.startsWith('/')) {
          imagePath = baseUrl + imagePath;
        }
        
        console.log('Location geladen:', {
          id: row.id,
          name: row.name,
          file: originalFilename,
          imagePath: imagePath
        });
        
        locations.push({
          id: row.id,
          name: row.name || "Unbenannter Ort",
          date: row.date ? new Date(row.date).toISOString().split('T')[0] : null,
          description: row.description || "",
          highlight: row.highlight || "",
          latitude: row.latitude || "0",
          longitude: row.longitude || "0",
          countryCode: row.country_code || "",
          image: originalFilename // Wir senden nur den Dateinamen, die Bildpfade werden im Frontend konstruiert
        });
      }
      
      res.json(locations);
    })
    .catch(function(error) {
      console.error('Fehler beim Abrufen der Locations:', error);
      res.status(500).json({ error: 'Datenbankfehler', details: error.message });
    });
});

// Neuen Ort hinzufügen
app.post('/api/locations', requireAuth, upload.single('image'), function(req, res) {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verbunden' });
  }

  try {
    console.log('Neuer Ort wird erstellt:', req.body);
    
    // Die Daten aus dem Formular extrahieren
    var name = req.body.name || '';
    var description = req.body.description || '';
    
    // Koordinaten
    var latitude = req.body.latitude || '';
    var longitude = req.body.longitude || '';
    
    // Validierung
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Titel ist erforderlich' });
    }
    
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Bitte wähle einen Ort auf der Karte' });
    }
    
    // Bild ist jetzt erforderlich
    if (!req.file) {
      return res.status(400).json({ error: 'Bitte füge ein Bild hinzu (JPG, PNG oder HEIC)' });
    }
    
    // Speichere das Bild
    var imagePath = req.file.filename;
    console.log('Bildpfad:', imagePath);
    
    // Setze aktuelles Datum
    const currentDate = new Date();
    
    // Einfacher Insert mit expliziten Werten für alle benötigten Felder
    pool.query(`
      INSERT INTO locations 
        (name, date, description, latitude, longitude, image, highlight, country_code) 
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING *`,
      [name, currentDate, description, latitude, longitude, imagePath, '', ''] // Leere Strings für highlight und country_code
    )
    .then(function(result) {
      if (result.rows.length === 0) {
        throw new Error('Fehler beim Erstellen des Standorts');
      }
      
      console.log('Ort erstellt:', result.rows[0]);
      
      // Bereite die Antwort vor mit vollständiger Bild-URL
      var location = result.rows[0];
      var baseUrl = req.protocol + '://' + req.get('host');
      location.image = baseUrl + '/uploads/' + location.image;
      
      res.status(201).json(location);
    })
    .catch(function(error) {
      console.error('Fehler beim Erstellen des Standorts in DB:', error);
      res.status(500).json({ error: 'Datenbankfehler', details: error.message });
    });
  } catch (error) {
    console.error('Allgemeiner Fehler:', error);
    res.status(500).json({ error: 'Serverfehler', details: error.message });
  }
});

// Ort löschen (API-Endpunkt)
app.delete('/api/locations/:id', requireAuth, function(req, res) {
  deleteLocation(req.params.id, res);
});

// Ort löschen (Link-Version für einfacheren Aufruf)
app.get('/api/locations/:id/delete', requireAuth, function(req, res) {
  deleteLocation(req.params.id, res, '/admin');
});

// Hilfsfunktion zum Löschen von Orten
function deleteLocation(id, res, redirectUrl = null) {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Datenbank nicht verbunden' });
  }

  const numId = parseInt(id);
  if (isNaN(numId)) {
    return res.status(400).json({ error: 'Ungültige ID' });
  }

  // Hole zuerst den Ort, um das Bild zu identifizieren
  pool.query('SELECT * FROM locations WHERE id = $1', [numId])
    .then(function(result) {
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Ort nicht gefunden' });
      }
      
      const location = result.rows[0];
      
      // Lösche aus der Datenbank
      return pool.query('DELETE FROM locations WHERE id = $1', [numId])
        .then(function() {
          // Wenn der Ort ein Bild hatte, lösche es auch (optional)
          if (location.image && !location.image.startsWith('http')) {
            try {
              const imagePath = path.join(uploadsDir, location.image);
              if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
              }
            } catch (err) {
              // Nur loggen, nicht abbrechen
              console.error('Fehler beim Löschen der Bilddatei:', err);
            }
          }
          
          if (redirectUrl) {
            res.redirect(redirectUrl);
          } else {
            res.json({ success: true, message: 'Ort erfolgreich gelöscht' });
          }
        });
    })
    .catch(function(error) {
      console.error('Fehler beim Löschen des Ortes:', error);
      
      if (redirectUrl) {
        res.redirect(redirectUrl + '?error=' + encodeURIComponent('Fehler beim Löschen: ' + error.message));
      } else {
        res.status(500).json({ error: 'Datenbankfehler', details: error.message });
      }
    });
}

// Login-Seite
app.get('/', function(req, res) {
  // Prüfe, ob bereits eingeloggt
  var sessionId = null;
  if (req.headers.cookie) {
    var cookies = req.headers.cookie.split(';');
    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i].trim();
      if (cookie.startsWith('sessionId=')) {
        sessionId = cookie.split('=')[1];
        break;
      }
    }
  }
  
  if (isValidSession(sessionId)) {
    return res.redirect('/map');
  }
  
  // Fehlertext, falls vorhanden
  var errorText = '';
  if (req.query.error === 'auth') {
    errorText = 'Bitte melde dich an, um auf die Karte zuzugreifen.';
  } else if (req.query.error === 'wrong-code') {
    errorText = 'Ungültiger Zugangscode. Bitte versuche es erneut.';
  }
  
  // Überprüfung, ob Bilder existieren, und Bestimmung des richtigen Bildpfads
  let coupleImagePath = '/uploads/couple.jpg'; // Standard-Pfad
  
  // Log für einfacheres Debugging auf Render
  console.log('Generiere Login-Seite mit Pärchenbild im Container');
  
  res.send(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Susibert</title>
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
      height: 100vh;
      background-color: #1a1a1a; /* Schwarzer Hintergrund */
    }
    .login-container {
      text-align: center;
      width: 400px;
      max-width: 90%;
      background-color: #222;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }
    
    .couple-image {
      width: 100%;
      height: 300px;
      overflow: hidden;
      position: relative;
    }
    
    .couple-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
    }
    .login-form {
      padding: 20px;
    }
    h1 {
      color: #2196f3;
      font-size: 2rem;
      margin: 0 0 1rem 0;
    }
    p {
      margin-bottom: 1.5rem;
      font-size: 0.9rem;
    }
    input {
      display: block;
      width: 100%;
      padding: 10px;
      margin: 1rem 0;
      background-color: #333;
      border: none;
      border-radius: 4px;
      color: white;
      box-sizing: border-box;
    }
    button {
      background-color: #2196f3;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      width: 100%;
      transition: background-color 0.2s;
    }
    button:hover {
      background-color: #1976d2;
    }
    #message {
      color: #ff4d4d;
      margin-top: 1rem;
      font-size: 0.8rem;
      min-height: 20px;
    }
    .bypass-link {
      margin-top: 20px;
      font-size: 0.8rem;
      color: #777;
    }
    .bypass-link a {
      color: #999;
      text-decoration: none;
    }
    .bypass-link a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="couple-image">
      <img src="${coupleImagePath}" alt="Pärchenbild" onerror="this.onerror=null; checkAlternativeImages();">
    </div>
    <div class="login-form">
      <h1>Susibert</h1>
      <p>Bitte gib den Zugangscode ein, um die Reisekarte zu sehen.</p>
      <form action="/login-check" method="get">
        <input type="password" name="code" id="accessCode" placeholder="Zugangscode" required>
        <button type="submit">Enter Susibert</button>
      </form>
      <div id="message">${errorText}</div>
      <div class="bypass-link">
        <a href="/login-check?code=suuuu">[Direktzugriff für Tests]</a>
      </div>
    </div>
  </div>
  <script>
    // Versuche alternative Bildpfade, falls das Hauptbild nicht lädt
    function checkAlternativeImages() {
      console.log('Versuche alternative Bildpfade zu laden...');
      
      // Liste möglicher alternativer Pfade für das Pärchenbild
      const imagePaths = [
        '/uploads/couple.jpg',
        '/dist/uploads/couple.jpg',
        '/public/uploads/couple.jpg',
        '/dist/public/uploads/couple.jpg'
      ];
      
      // Versuche alle Alternativen
      const img = document.querySelector('.couple-image img');
      let imageLoaded = false;
      
      function tryNextPath(index) {
        if (index >= imagePaths.length || imageLoaded) return;
        
        img.onload = function() {
          console.log('Bild erfolgreich geladen von: ' + imagePaths[index]);
          imageLoaded = true;
        };
        
        img.onerror = function() {
          console.log('Bild konnte nicht geladen werden von: ' + imagePaths[index]);
          tryNextPath(index + 1);
        };
        
        img.src = imagePaths[index];
      }
      
      // Starte den Versuch mit dem ersten Pfad
      tryNextPath(0);
    }
    
    // Prüfe nach dem Laden der Seite, ob das Bild geladen werden konnte
    window.addEventListener('load', function() {
      const img = document.querySelector('.couple-image img');
      if (!img.complete || img.naturalHeight === 0) {
        checkAlternativeImages();
      }
    });
  </script>
</body>
</html>`);
});

// Geschützte Kartenansicht mit Leaflet
app.get('/map', requireAuth, function(req, res) {
  if (!dbConnected) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="de">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Susibert</title>
        <style>
          body { font-family: sans-serif; background: #1a1a1a; color: #fff; margin: 0; padding: 20px; }
          h1 { color: #f59a0c; }
          .error { background: #ff5555; color: white; padding: 10px; border-radius: 5px; }
          a { color: #f59a0c; }
        </style>
      </head>
      <body>
        <h1>Susibert</h1>
        <div class="error">
          <p>Datenbankverbindung nicht verfügbar. Bitte versuche es später erneut.</p>
        </div>
        <p><a href="/">Zurück zur Anmeldung</a></p>
      </body>
      </html>
    `);
  }

  // Pfad zum Pärchenbild
  const coupleImageUrl = '/uploads/couple.jpg';

  // HTML für die Kartenansicht
  res.send(`
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
        
        h1 {
          margin: 0;
          font-size: 1.3rem;
          color: #f59a0c;
        }
        
        .app-container {
          display: flex;
          height: calc(100vh - 56px); /* abzüglich Header-Höhe */
        }
        
        .location-list {
          width: 300px;
          background-color: #222;
          overflow-y: auto;
          padding: 15px;
          display: none; /* standardmäßig ausgeblendet auf mobilen Geräten */
        }
        
        .map-container {
          flex-grow: 1;
          position: relative;
        }
        
        #map {
          height: 100%;
          width: 100%;
          background-color: #333;
        }
        
        /* Verbesserte Button-Styling */
        .button {
          background-color: #333;
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 4px;
          text-decoration: none;
          transition: background-color 0.2s;
          font-size: 0.9rem;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        
        .button:hover {
          background-color: #444;
        }
        
        .button.primary {
          background-color: #f59a0c;
          color: black;
        }
        
        .button.primary:hover {
          background-color: #e08900;
        }

        .button.danger {
          background-color: #d33;
          color: white;
        }
        
        .button.danger:hover {
          background-color: #c22;
        }
        
        /* Location Card */
        .location-card {
          background-color: #333;
          border-radius: 8px;
          margin-bottom: 15px;
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.2s;
        }
        
        .location-card:hover {
          transform: translateY(-2px);
        }
        
        .location-card img {
          width: 100%;
          height: 140px;
          object-fit: cover;
        }
        
        .location-card-content {
          padding: 10px;
        }
        
        .location-card h3 {
          margin: 0 0 5px;
          color: #f59a0c;
          font-size: 1rem;
        }
        
        .location-meta {
          font-size: 0.8rem;
          color: #aaa;
          margin-bottom: 5px;
        }
        
        /* Location Detail Popup */
        .location-detail {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 90%;
          max-width: 500px;
          background-color: #222;
          border-radius: 8px;
          box-shadow: 0 0 20px rgba(0,0,0,0.5);
          z-index: 2000;
          display: none;
          max-height: 90vh;
          overflow-y: auto;
        }
        
        .location-detail-header {
          padding: 15px;
          background-color: #333;
          border-top-left-radius: 8px;
          border-top-right-radius: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .location-detail-content {
          padding: 15px;
        }
        
        .location-detail-content img {
          width: 100%;
          max-height: 300px;
          object-fit: cover;
          border-radius: 4px;
          margin-bottom: 15px;
        }
        
        .location-detail h2 {
          margin: 0;
          color: #f59a0c;
        }
        
        .location-close {
          background: none;
          border: none;
          color: white;
          font-size: 1.5rem;
          cursor: pointer;
        }

        .location-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 15px;
          padding: 0 15px 15px;
        }
        
        /* Form zum Hinzufügen neuer Orte */
        .add-location-form {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 90%;
          max-width: 500px;
          background-color: #222;
          border-radius: 8px;
          box-shadow: 0 0 20px rgba(0,0,0,0.5);
          z-index: 2000;
          display: none;
          max-height: 90vh;
          overflow-y: auto;
        }
        
        .form-header {
          padding: 15px;
          background-color: #333;
          border-top-left-radius: 8px;
          border-top-right-radius: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .form-content {
          padding: 15px;
        }
        
        .form-group {
          margin-bottom: 15px;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 5px;
        }
        
        .form-control {
          width: 100%;
          padding: 8px;
          border-radius: 4px;
          border: 1px solid #444;
          background-color: #333;
          color: white;
          box-sizing: border-box;
        }
        
        textarea.form-control {
          min-height: 80px;
          resize: vertical;
        }
        
        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 15px;
        }
        
        /* Overlay für Popups */
        .overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0,0,0,0.5);
          z-index: 1500;
          display: none;
        }
        
        /* Edit-Mode Button */
        .edit-toggle {
          position: absolute;
          bottom: 20px;
          left: 20px;
          z-index: 1000;
          padding: 10px 15px;
        }

        .admin-link {
          margin-left: 10px;
          font-size: 0.8em;
          opacity: 0.7;
        }
        
        /* Responsive Design */
        @media (min-width: 768px) {
          .location-list {
            display: block;
          }
          
          .toggle-list-button {
            display: none;
          }
        }
        
        @media (max-width: 767px) {
          .toggle-list-button {
            display: inline-flex;
          }
          
          .location-list.active {
            display: block;
            position: absolute;
            top: 56px;
            left: 0;
            height: calc(100% - 56px);
            z-index: 1000;
            width: 80%;
            max-width: 300px;
          }
        }

        /* Confirmation Dialog */
        .confirm-dialog {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 300px;
          background-color: #333;
          border-radius: 8px;
          box-shadow: 0 0 20px rgba(0,0,0,0.5);
          z-index: 2100;
          display: none;
          padding: 20px;
          text-align: center;
        }
        
        .confirm-dialog p {
          margin-top: 0;
          margin-bottom: 20px;
        }
        
        .confirm-dialog-buttons {
          display: flex;
          justify-content: center;
          gap: 10px;
        }

        /* Error message styling */
        .error-message {
          background-color: rgba(255, 0, 0, 0.1);
          border: 1px solid #aa0000;
          color: #ff4d4d;
          padding: 10px;
          border-radius: 4px;
          margin-bottom: 15px;
          display: none;
        }

        .success-message {
          background-color: rgba(0, 255, 0, 0.1);
          border: 1px solid #00aa00;
          color: #00cc00;
          padding: 10px;
          border-radius: 4px;
          margin-bottom: 15px;
          display: none;
        }

        .required-mark {
          color: #f59a0c;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <a href="/map" class="logo">
          <div class="logo-circle">
            <img src="${coupleImageUrl}" alt="Pärchenbild" onerror="this.parentNode.innerHTML='S'; this.parentNode.style.backgroundColor='#f59a0c'; this.parentNode.style.color='black';">
          </div>
          <h1>Susibert</h1>
        </a>
        <div>
          <button class="button toggle-list-button" id="toggleListBtn">
            <span>Orte anzeigen</span>
          </button>
          <button class="button primary" id="toggleEditMode">
            <span>Bearbeiten</span>
          </button>
          <a href="/logout" class="button">Abmelden</a>
          <a href="/admin" class="admin-link">Admin</a>
        </div>
      </div>
      
      <div class="app-container">
        <div class="location-list" id="locationList">
          <h2>Besuchte Orte</h2>
          <div id="locationCards"></div>
        </div>
        
        <div class="map-container">
          <div id="map"></div>
          <div class="edit-mode-info" style="display: none; position: absolute; bottom: 70px; left: 20px; background: rgba(34,34,34,0.8); padding: 10px; border-radius: 5px; z-index: 1000;">
            Bearbeitungsmodus aktiv. Klicke auf die Karte, um einen neuen Ort hinzuzufügen.
          </div>
        </div>
      </div>
      
      <div class="overlay" id="overlay"></div>
      
      <!-- Location Detail Popup -->
      <div class="location-detail" id="locationDetail">
        <div class="location-detail-header">
          <h2 id="detailTitle">Ortsname</h2>
          <button class="location-close" id="closeDetailBtn">&times;</button>
        </div>
        <div class="location-detail-content" id="detailContent">
          <!-- Wird dynamisch gefüllt -->
        </div>
        <div class="location-actions">
          <button class="button danger" id="deleteLocationBtn">Löschen</button>
        </div>
      </div>
      
      <!-- Add Location Form -->
      <div class="add-location-form" id="addLocationForm">
        <div class="form-header">
          <h2>Neuen Ort hinzufügen</h2>
          <button class="location-close" id="closeFormBtn">&times;</button>
        </div>
        <div class="form-content">
          <div id="errorMessage" class="error-message"></div>
          <div id="successMessage" class="success-message"></div>
          
          <form id="newLocationForm" enctype="multipart/form-data">
            <input type="hidden" id="latitude" name="latitude">
            <input type="hidden" id="longitude" name="longitude">
            
            <div class="form-group">
              <label for="name">Titel <span class="required-mark">*</span></label>
              <input type="text" class="form-control" id="name" name="name" required>
            </div>
            
            <div class="form-group">
              <label for="description">Beschreibung (optional)</label>
              <textarea class="form-control" id="description" name="description"></textarea>
            </div>
            
            <div class="form-group">
              <label for="image">Bild <span class="required-mark">*</span></label>
              <input type="file" class="form-control" id="image" name="image" accept=".jpg,.jpeg,.png,.heic" required>
              <small style="color:#aaa; display:block; margin-top:5px">JPG, PNG oder HEIC (max. 20MB)</small>
            </div>
            
            <div class="form-actions">
              <button type="button" class="button" id="cancelLocationBtn">Abbrechen</button>
              <button type="submit" class="button primary">Speichern</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Confirmation Dialog -->
      <div class="confirm-dialog" id="confirmDialog">
        <p id="confirmMessage">Möchtest du diesen Ort wirklich löschen?</p>
        <div class="confirm-dialog-buttons">
          <button class="button" id="cancelConfirmBtn">Abbrechen</button>
          <button class="button danger" id="confirmActionBtn">Löschen</button>
        </div>
      </div>
      
      <!-- Leaflet JS -->
      <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
      <script>
        // DOM-Elemente
        const map = document.getElementById('map');
        const locationList = document.getElementById('locationList');
        const locationCards = document.getElementById('locationCards');
        const locationDetail = document.getElementById('locationDetail');
        const detailTitle = document.getElementById('detailTitle');
        const detailContent = document.getElementById('detailContent');
        const addLocationForm = document.getElementById('addLocationForm');
        const overlay = document.getElementById('overlay');
        const toggleListBtn = document.getElementById('toggleListBtn');
        const toggleEditModeBtn = document.getElementById('toggleEditMode');
        const closeDetailBtn = document.getElementById('closeDetailBtn');
        const closeFormBtn = document.getElementById('closeFormBtn');
        const cancelLocationBtn = document.getElementById('cancelLocationBtn');
        const newLocationForm = document.getElementById('newLocationForm');
        const errorMessage = document.getElementById('errorMessage');
        const successMessage = document.getElementById('successMessage');
        const latitudeInput = document.getElementById('latitude');
        const longitudeInput = document.getElementById('longitude');
        const editModeInfo = document.querySelector('.edit-mode-info');
        const deleteLocationBtn = document.getElementById('deleteLocationBtn');
        const confirmDialog = document.getElementById('confirmDialog');
        const confirmMessage = document.getElementById('confirmMessage');
        const cancelConfirmBtn = document.getElementById('cancelConfirmBtn');
        const confirmActionBtn = document.getElementById('confirmActionBtn');
        
        // Zustandsvariablen
        let isEditMode = false;
        let locations = [];
        let leafletMap = null;
        let markers = [];
        let currentLocationId = null;
        
        // Toggle-Funktionen
        function toggleLocationList() {
          locationList.classList.toggle('active');
        }
        
        function toggleEditMode() {
          isEditMode = !isEditMode;
          toggleEditModeBtn.innerHTML = isEditMode ? '<span>Beenden</span>' : '<span>Bearbeiten</span>';
          editModeInfo.style.display = isEditMode ? 'block' : 'none';
        }
        
        // Formatiert das Datum als Monat/Jahr
        function formatMonthYear(dateString) {
          if (!dateString) return '';
          
          const date = new Date(dateString);
          const month = date.getMonth() + 1;
          const year = date.getFullYear();
          
          // Erstelle Format MM.YYYY
          return month + '.' + year;
        }
        
        // Popup-Funktionen
        function showLocationDetail(location) {
          currentLocationId = location.id;
          detailTitle.textContent = location.name;
          
          // Konstruiere den vollständigen Bildpfad
          const baseUrl = window.location.protocol + '//' + window.location.host;
          const imagePath = location.image ? (baseUrl + '/uploads/' + location.image) : '';
          console.log('Zeige Location-Details:', { id: location.id, name: location.name, bildpfad: imagePath });
          
          let content = '';
          
          // Zuerst das Bild, wenn vorhanden
          if (location.image) {
            content += \`<div class="location-image">
              <img src="\${imagePath}" alt="\${location.name}" 
                onerror="this.onerror=null; this.style.display='none'; tryAlternativeImagePaths(this, '\${location.image}');">
            </div>\`;
          }
          
          // Dann die Beschreibung, wenn vorhanden
          if (location.description) {
            content += \`<p>\${location.description}</p>\`;
          }
          
          detailContent.innerHTML = content;
          locationDetail.style.display = 'block';
          overlay.style.display = 'block';
        }
        
        function hideLocationDetail() {
          locationDetail.style.display = 'none';
          overlay.style.display = 'none';
          currentLocationId = null;
        }
        
        function showAddLocationForm(lat, lng) {
          // Form zurücksetzen
          newLocationForm.reset();
          errorMessage.style.display = 'none';
          successMessage.style.display = 'none';
          
          // Koordinaten setzen
          latitudeInput.value = lat;
          longitudeInput.value = lng;
          
          // Anzeigen
          addLocationForm.style.display = 'block';
          overlay.style.display = 'block';
        }
        
        function hideAddLocationForm() {
          addLocationForm.style.display = 'none';
          overlay.style.display = 'none';
        }

        // Bestätigungsdialog anzeigen
        function showConfirmDialog(message, actionCallback) {
          confirmMessage.textContent = message;
          confirmDialog.style.display = 'block';
          overlay.style.display = 'block';
          
          // Event-Handler für Bestätigung
          confirmActionBtn.onclick = function() {
            hideConfirmDialog();
            actionCallback();
          };
        }
        
        function hideConfirmDialog() {
          confirmDialog.style.display = 'none';
          overlay.style.display = 'none';
        }
        
        // Karte initialisieren
        function initializeMap(locations) {
          try {
            // Karte erstellen
            leafletMap = L.map('map').setView([30, 5], 2);
            
            // Kartenlayer hinzufügen (dunkler Stil)
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
              attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
              subdomains: 'abcd',
              maxZoom: 19
            }).addTo(leafletMap);
            
            // Marker hinzufügen
            addMarkersToMap(locations);
            
            // Klick-Event für die Karte
            leafletMap.on('click', function(e) {
              if (isEditMode) {
                showAddLocationForm(e.latlng.lat, e.latlng.lng);
              }
            });
            
            // Karte auf alle Marker zentrieren, wenn vorhanden
            if (markers.length > 0) {
              const group = L.featureGroup(markers);
              leafletMap.fitBounds(group.getBounds(), { padding: [50, 50] });
            }
          } catch (error) {
            console.error('Fehler bei der Karteninitialisierung:', error);
            map.innerHTML = '<div style="padding: 20px; text-align: center;"><p>Fehler beim Laden der Karte: ' + error.message + '</p></div>';
          }
        }
        
        // Marker zur Karte hinzufügen
        function addMarkersToMap(locations) {
          // Bestehende Marker entfernen
          markers.forEach(marker => leafletMap.removeLayer(marker));
          markers = [];
          
          // Neue Marker hinzufügen
          locations.forEach(location => {
            try {
              const lat = parseFloat(location.latitude);
              const lng = parseFloat(location.longitude);
              
              if (isNaN(lat) || isNaN(lng)) {
                console.error('Ungültige Koordinaten für:', location.name);
                return;
              }
              
              // Benutzerdefiniertes Icon für Marker
              const icon = L.divIcon({
                className: 'custom-marker',
                html: '<div style="background-color: #f59a0c; border-radius: 50%; width: 12px; height: 12px; border: 2px solid #fff;"></div>',
                iconSize: [18, 18],
                iconAnchor: [9, 9]
              });
              
              // Marker-Radius (Hervorhebungseffekt)
              const radius = L.circle([lat, lng], {
                radius: 50000, // 50km
                color: '#f59a0c',
                fillColor: '#f59a0c',
                fillOpacity: 0.2,
                weight: 0
              }).addTo(leafletMap);
              
              // Marker mit Popup
              const marker = L.marker([lat, lng], { icon: icon }).addTo(leafletMap);
              marker.bindPopup(location.name);
              
              // Click-Event für Marker
              marker.on('click', function() {
                showLocationDetail(location);
              });
              
              markers.push(marker);
              markers.push(radius);
            } catch (error) {
              console.error('Fehler beim Hinzufügen des Markers:', error);
            }
          });
        }
        
        // Orte laden
        function loadLocations() {
          fetch('/api/locations')
            .then(response => {
              if (!response.ok) {
                throw new Error('Fehler beim Laden der Orte');
              }
              return response.json();
            })
            .then(data => {
              locations = data;
              renderLocationList(locations);
              initializeMap(locations);
            })
            .catch(error => {
              console.error('Fehler beim Laden der Orte:', error);
              locationCards.innerHTML = '<p>Fehler beim Laden der Orte: ' + error.message + '</p>';
            });
        }
        
        // Orte in der Seitenleiste anzeigen
        function renderLocationList(locations) {
          if (locations.length === 0) {
            locationCards.innerHTML = '<p>Keine Orte gefunden.</p>';
            return;
          }
          
          let html = '';
          locations.forEach(location => {
            // Basispfad für das Bild
            const baseUrl = window.location.protocol + '//' + window.location.host;
            const imagePath = location.image ? (baseUrl + '/uploads/' + location.image) : '';
            
            const imageHtml = location.image 
              ? \`<img src="\${imagePath}" alt="\${location.name}" 
                    onerror="this.onerror=null; tryAlternativeImagePaths(this, '\${location.image}');">\`
              : '';
            
            html += \`
              <div class="location-card" data-id="\${location.id}">
                \${imageHtml}
                <div class="location-card-content">
                  <h3>\${location.name}</h3>
                </div>
              </div>
            \`;
          });
          
          locationCards.innerHTML = html;
          
          // Event-Listener für Karten
          document.querySelectorAll('.location-card').forEach(card => {
            card.addEventListener('click', function() {
              const id = parseInt(this.getAttribute('data-id'));
              const location = locations.find(loc => loc.id === id);
              if (location) {
                showLocationDetail(location);
                
                // Wenn Karte initialisiert wurde, zentriere sie auf den Ort
                if (leafletMap) {
                  leafletMap.setView([location.latitude, location.longitude], 10);
                }
              }
            });
          });
        }
        
        // Neuen Ort speichern
        function saveLocation(formData) {
          // Nachrichten zurücksetzen
          errorMessage.style.display = 'none';
          successMessage.style.display = 'none';
          successMessage.textContent = 'Speichere Ort...';
          successMessage.style.display = 'block';
          
          fetch('/api/locations', {
            method: 'POST',
            body: formData
          })
          .then(response => {
            if (!response.ok) {
              return response.json().then(data => {
                throw new Error(data.error || \`HTTP-Fehler: \${response.status}\`);
              });
            }
            return response.json();
          })
          .then(data => {
            successMessage.textContent = 'Ort erfolgreich gespeichert!';
            
            // Neuen Ort zur Liste hinzufügen und Marker erstellen
            locations.unshift(data);
            renderLocationList(locations);
            
            if (leafletMap) {
              addMarkersToMap(locations);
            }
            
            // Form nach kurzer Verzögerung schließen
            setTimeout(() => {
              hideAddLocationForm();
            }, 1500);
          })
          .catch(error => {
            successMessage.style.display = 'none';
            errorMessage.style.display = 'block';
            errorMessage.textContent = 'Fehler beim Speichern: ' + error.message;
            console.error('Fehler beim Speichern:', error);
          });
        }

        // Ort löschen
        function deleteLocation(id) {
          fetch(\`/api/locations/\${id}\`, {
            method: 'DELETE'
          })
          .then(response => {
            if (!response.ok) {
              return response.json().then(data => {
                throw new Error(data.error || \`HTTP-Fehler: \${response.status}\`);
              });
            }
            return response.json();
          })
          .then(data => {
            // Ort aus der lokalen Liste entfernen
            locations = locations.filter(loc => loc.id !== id);
            renderLocationList(locations);
            
            if (leafletMap) {
              addMarkersToMap(locations);
            }
            
            // Detail-Popup schließen
            hideLocationDetail();
          })
          .catch(error => {
            console.error('Fehler beim Löschen des Ortes:', error);
            alert('Fehler beim Löschen: ' + error.message);
          });
        }
        
        // Event-Listener
        document.addEventListener('DOMContentLoaded', function() {
          // Orte laden
          loadLocations();
          
          // Toggle Location List
          toggleListBtn.addEventListener('click', toggleLocationList);
          
          // Toggle Edit Mode
          toggleEditModeBtn.addEventListener('click', toggleEditMode);
          
          // Close-Buttons
          closeDetailBtn.addEventListener('click', hideLocationDetail);
          closeFormBtn.addEventListener('click', hideAddLocationForm);
          cancelLocationBtn.addEventListener('click', hideAddLocationForm);
          
          // Form-Handling
          newLocationForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveLocation(new FormData(this));
          });

          // Delete Location Button
          deleteLocationBtn.addEventListener('click', function() {
            if (currentLocationId) {
              showConfirmDialog('Möchtest du diesen Ort wirklich löschen?', function() {
                deleteLocation(currentLocationId);
              });
            }
          });

          // Cancel Confirm Button
          cancelConfirmBtn.addEventListener('click', hideConfirmDialog);
          
          // Klick auf Overlay schließt alle Popups
          overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
              hideLocationDetail();
              hideAddLocationForm();
              hideConfirmDialog();
            }
          });

          // Hilfsfunktion für alternative Bildpfade
          function tryAlternativeImagePaths(imgElement, originalFilename) {
            console.log('Versuche alternative Bildpfade für:', originalFilename);
            
            // Mögliche Pfade für das Bild
            const basePaths = [
              '/uploads/',
              '/dist/uploads/',
              './uploads/',
              '../uploads/',
              '/'
            ];
            
            // Versuche alle Pfade nacheinander
            let found = false;
            
            function tryNextPath(index) {
              if (index >= basePaths.length || found) return;
              
              const fullPath = basePaths[index] + originalFilename;
              console.log('Versuche Pfad:', fullPath);
              
              const testImg = new Image();
              testImg.onload = function() {
                console.log('Bild gefunden unter:', fullPath);
                imgElement.src = fullPath;
                imgElement.style.display = 'block';
                found = true;
              };
              
              testImg.onerror = function() {
                console.log('Bild nicht gefunden unter:', fullPath);
                tryNextPath(index + 1);
              };
              
              testImg.src = fullPath;
            }
            
            // Starte mit dem ersten Pfad
            tryNextPath(0);
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Fehler-Route für nicht vorhandene Pfade
app.use(function(req, res) {
  res.status(404).send('<!DOCTYPE html>\
    <html lang="de">\
    <head>\
      <meta charset="UTF-8">\
      <meta name="viewport" content="width=device-width, initial-scale=1.0">\
      <title>Nicht gefunden - Susibert</title>\
      <style>\
        body {\
          font-family: system-ui, -apple-system, sans-serif;\
          background-color: #1a1a1a;\
          color: #f5f5f5;\
          margin: 0;\
          padding: 0;\
          display: flex;\
          justify-content: center;\
          align-items: center;\
          height: 100vh;\
          text-align: center;\
        }\
        .error-container {\
          max-width: 500px;\
          padding: 2rem;\
          background-color: #222;\
          border-radius: 8px;\
        }\
        h1 {\
          color: #f59a0c;\
          font-size: 2rem;\
          margin-bottom: 1rem;\
        }\
        a {\
          color: #f59a0c;\
          text-decoration: none;\
        }\
        a:hover {\
          text-decoration: underline;\
        }\
      </style>\
    </head>\
    <body>\
      <div class="error-container">\
        <h1>Seite nicht gefunden</h1>\
        <p>Die angeforderte Seite existiert nicht.</p>\
        <p><a href="/">Zurück zur Startseite</a></p>\
      </div>\
    </body>\
    </html>');
});

// Server starten
const server = app.listen(port, function() {
  console.log('Susibert Server läuft auf Port ' + port);
  console.log('Umgebung: ' + (process.env.NODE_ENV || 'development'));
  console.log('Datenbankverbindung: ' + (dbConnected ? 'Erfolgreich' : 'Nicht verbunden'));
  console.log('Datum/Zeit: ' + new Date().toISOString());
});

// Fehlerbehandlung
process.on('unhandledRejection', function(reason, promise) {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', function(error) {
  console.error('Uncaught Exception:', error);
});

// Graceful Shutdown
process.on('SIGTERM', function() {
  console.log('SIGTERM Signal erhalten, beende Server...');
  server.close(function() {
    if (pool) {
      pool.end();
    }
    console.log('Server beendet');
    process.exit(0);
  });
});