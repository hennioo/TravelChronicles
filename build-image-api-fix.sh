#!/bin/bash

echo "Erstelle Build mit Image-API Fix..."

# Verzeichnisstruktur erstellen
mkdir -p dist/uploads dist/public

# Server-Code kopieren
cp final-image-fix.js dist/index.js
chmod +x dist/index.js

# Neue Image-API hinzufügen
echo "
// Bild eines Ortes als Base64 im JSON-Format abrufen
app.get('/api/locations/:id/image/base64', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    console.log(\`Bild für Ort \${id} als Base64 angefordert\`);
    
    // Direkter und vereinfachter Abruf der Bilddaten aus der Datenbank
    const result = await pool.query('SELECT image_data, image_type FROM locations WHERE id = \$1', [id]);
    
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
});

// Funktion zum Anzeigen der Detailansicht im Frontend überschreiben
const mapHtml = fs.readFileSync(path.join(__dirname, 'map.html'), 'utf-8');
const updatedMapHtml = mapHtml.replace(
  'function showLocationDetail(location) {',
  \`function showLocationDetail(location) {
    selectedLocation = location;
    
    const detailTitleEl = document.getElementById('detailTitle');
    const detailContentEl = document.getElementById('detailContent');
    const overlayEl = document.getElementById('overlay');
    const detailViewEl = document.getElementById('detailView');
    
    detailTitleEl.textContent = location.title;
    
    // Basis-HTML für die Detailansicht
    detailContentEl.innerHTML = \\\`
      <div id="imageLoadingContainer" style="width: 100%; height: 300px; background-color: #222; display: flex; justify-content: center; align-items: center; border-radius: 4px; margin-bottom: 15px;">
        <div>Bild wird geladen...</div>
      </div>
      <div>\\\${location.description || 'Keine Beschreibung vorhanden.'}</div>
      <div class="form-actions" style="margin-top: 20px;">
        <button id="deleteLocationBtn" class="btn delete-btn">Löschen</button>
      </div>
    \\\`;
    
    // Bild direkt als Base64 vom Server abrufen
    fetch(\\\`/api/locations/\\\${location.id}/image/base64?sessionId=\\\${sessionId}&t=\\\${Date.now()}\\\`)
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
          img.src = \\\`data:\\\${data.imageType || 'image/jpeg'};base64,\\\${data.imageData}\\\`;
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
          document.getElementById('imageLoadingContainer').innerHTML = \\\`
            <img src="/uploads/couple.jpg" alt="Pärchenbild" style="width: 100%; max-height: 300px; object-fit: cover; border-radius: 4px;">
          \\\`;
        }
      })
      .catch(error => {
        console.error('Fehler beim Laden des Bildes:', error);
        // Fallback zum Pärchenbild
        document.getElementById('imageLoadingContainer').innerHTML = \\\`
          <img src="/uploads/couple.jpg" alt="Pärchenbild" style="width: 100%; max-height: 300px; object-fit: cover; border-radius: 4px;">
        \\\`;
      });
    
    // EventListener für Lösch-Button
    document.getElementById('deleteLocationBtn').addEventListener('click', function() {
      deleteLocation(location.id);
    });
    
    // Detail-Ansicht anzeigen
    overlayEl.style.display = 'block';
    detailViewEl.style.display = 'block';
  }\`
);

fs.writeFileSync(path.join(__dirname, 'dist/index.js'), fs.readFileSync(path.join(__dirname, 'dist/index.js'), 'utf-8') + "\n" + 
\`
// Bild eines Ortes als Base64 im JSON-Format abrufen
app.get('/api/locations/:id/image/base64', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    console.log(\\\`Bild für Ort \\\${id} als Base64 angefordert\\\`);
    
    // Cache-Control Header setzen
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Direkter und vereinfachter Abruf der Bilddaten aus der Datenbank
    const result = await pool.query('SELECT image_data, image_type FROM locations WHERE id = \\\$1', [id]);
    
    if (result.rows.length === 0 || !result.rows[0].image_data) {
      console.log(\\\`Ort \\\${id} nicht gefunden oder hat keine Bilddaten\\\`);
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
});
\`);

// Aktualisierte map.html schreiben
fs.writeFileSync(path.join(__dirname, 'dist/map.html'), updatedMapHtml);

# Uploads kopieren
cp -r uploads/* dist/uploads/ 2>/dev/null || :

# Stelle sicher, dass couple.jpg existiert
if [ ! -f "dist/uploads/couple.jpg" ]; then
  cp client/couple.jpg dist/uploads/ 2>/dev/null || :
fi

# Erstelle package.json
cat > dist/package.json << 'EOF'
{
  "name": "rest-express",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "NODE_ENV=production node index.js"
  },
  "dependencies": {
    "cookie-parser": "^1.4.6",
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "pg": "^8.11.3"
  }
}
EOF

# Installiere Abhängigkeiten
cd dist && npm install

echo "=== Build erfolgreich abgeschlossen ==="