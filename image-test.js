// Super-einfacher Image Upload Test
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Speichern der Bilder auf der Festplatte statt in der Datenbank
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'image-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB Limit
});

// Uploads-Verzeichnis erstellen, falls nicht vorhanden
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  console.log(`Erstelle Uploads-Verzeichnis: ${uploadsDir}`);
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Statische Dateien bereitstellen
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Einfache HTML-Seite mit Bildupload-Formular
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bildupload Test</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          line-height: 1.6;
        }
        h1 {
          margin-bottom: 30px;
        }
        .form-group {
          margin-bottom: 20px;
        }
        label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        input[type="file"] {
          display: block;
          margin-top: 5px;
        }
        button {
          padding: 10px 15px;
          background: #4caf50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
        }
        .image-preview {
          margin-top: 30px;
        }
        .image-preview img {
          max-width: 100%;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 5px;
        }
      </style>
    </head>
    <body>
      <h1>Bildupload Test</h1>
      
      <form action="/upload" method="post" enctype="multipart/form-data">
        <div class="form-group">
          <label for="title">Titel:</label>
          <input type="text" id="title" name="title" required>
        </div>
        
        <div class="form-group">
          <label for="image">Bild auswählen (max. 2MB):</label>
          <input type="file" id="image" name="image" accept="image/*" required>
        </div>
        
        <button type="submit">Hochladen</button>
      </form>
      
      <div class="image-preview" id="uploadedImages">
        <h2>Hochgeladene Bilder:</h2>
        <div id="imageList">
          <!-- Bilder werden hier angezeigt -->
          Lade Bilder...
        </div>
      </div>
      
      <script>
        // Bilder laden
        function loadImages() {
          fetch('/images')
            .then(response => response.json())
            .then(data => {
              const imageList = document.getElementById('imageList');
              
              if (data.length === 0) {
                imageList.innerHTML = '<p>Keine Bilder vorhanden.</p>';
                return;
              }
              
              let html = '';
              data.forEach(image => {
                html += \`
                  <div style="margin-bottom: 20px;">
                    <h3>\${image.title}</h3>
                    <img src="\${image.path}" alt="\${image.title}" style="max-width: 100%; max-height: 300px;">
                    <p>Größe: \${image.size} Bytes</p>
                    <p>Hochgeladen: \${new Date(image.timestamp).toLocaleString()}</p>
                  </div>
                \`;
              });
              
              imageList.innerHTML = html;
            })
            .catch(error => {
              console.error('Fehler beim Laden der Bilder:', error);
              document.getElementById('imageList').innerHTML = '<p>Fehler beim Laden der Bilder.</p>';
            });
        }
        
        // Bei Seitenladung Bilder anzeigen
        loadImages();
        
        // Nach erfolgreichem Upload aktualisieren
        document.querySelector('form').addEventListener('submit', function(e) {
          e.preventDefault();
          
          const formData = new FormData(this);
          
          fetch('/upload', {
            method: 'POST',
            body: formData
          })
          .then(response => {
            if (!response.ok) {
              return response.text().then(text => {
                throw new Error(text || 'Unbekannter Fehler');
              });
            }
            return response.json();
          })
          .then(data => {
            alert('Bild erfolgreich hochgeladen!');
            this.reset();
            loadImages();
          })
          .catch(error => {
            alert('Fehler beim Hochladen: ' + error.message);
          });
        });
      </script>
    </body>
    </html>
  `);
});

// Verarbeiten des Uploads
app.post('/upload', upload.single('image'), (req, res) => {
  try {
    console.log('Upload-Anfrage erhalten');
    
    if (!req.file) {
      console.log('Kein Bild im Request');
      return res.status(400).json({ error: 'Kein Bild hochgeladen' });
    }
    
    console.log('Bild hochgeladen:', req.file);
    
    const title = req.body.title || 'Unbetiteltes Bild';
    
    // Speichern der Informationen (in der Praxis würde man das in einer Datenbank tun)
    const imageInfo = {
      id: Date.now(),
      title: title,
      path: '/uploads/' + req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      timestamp: Date.now()
    };
    
    // In einer realen Anwendung würden wir hier die Informationen in eine Datenbank schreiben
    // Für diesen Test speichern wir sie in einer Datei
    const imagesFile = path.join(__dirname, 'images.json');
    
    let images = [];
    if (fs.existsSync(imagesFile)) {
      const data = fs.readFileSync(imagesFile, 'utf8');
      try {
        images = JSON.parse(data);
      } catch (e) {
        console.error('Fehler beim Parsen der vorhandenen Bilder:', e);
      }
    }
    
    images.push(imageInfo);
    fs.writeFileSync(imagesFile, JSON.stringify(images, null, 2));
    
    res.status(201).json(imageInfo);
  } catch (error) {
    console.error('Fehler beim Verarbeiten des Uploads:', error);
    res.status(500).json({ error: 'Serverfehler beim Hochladen des Bildes' });
  }
});

// Liste der Bilder abrufen
app.get('/images', (req, res) => {
  try {
    const imagesFile = path.join(__dirname, 'images.json');
    
    if (fs.existsSync(imagesFile)) {
      const data = fs.readFileSync(imagesFile, 'utf8');
      const images = JSON.parse(data);
      res.json(images);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Fehler beim Abrufen der Bilder:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Bilder' });
  }
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log(`Bildupload-Test verfügbar unter: http://localhost:${PORT}`);
});