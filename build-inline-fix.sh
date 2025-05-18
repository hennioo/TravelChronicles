#!/bin/bash

# Build-Skript für die eingebettete Fix-Version der TravelChronicles-App
echo "Erstelle Build mit eingebetteter Detailansicht-Fix..."

# Verzeichnisstruktur erstellen
echo "Erstelle Verzeichnisstruktur..."
mkdir -p dist/uploads

# Fix-Code aus location-detail-fix.js extrahieren
echo "Extrahiere Fix-Code..."
FIX_CODE=$(cat location-detail-fix.js)

# Server-Code kopieren und modifizieren
echo "Kopiere und modifiziere Server-Code..."
cp working-server.js dist/index.js

# Uploads kopieren
echo "Kopiere Uploads..."
cp -r uploads/* dist/uploads/ 2>/dev/null || :

# package.json erstellen
echo "Erstelle package.json..."
cat > dist/package.json << EOF
{
  "name": "rest-express",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "NODE_ENV=production node index.js"
  },
  "dependencies": {
    "cookie-parser": "^1.4.6",
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "pg": "^8.11.3",
    "sharp": "^0.33.2"
  }
}
EOF

# Fix direkt in den Server-Code integrieren (direkt vor dem schließenden </script> Tag)
echo "Integriere den Detailansicht-Fix direkt in den Server-Code..."
sed -i 's|// Ende des Scripts|// Detailansicht Fix - Anfang\n\nfunction showLocationDetailFixed(locationId) {\n  console.log("Zeige Details für Ort:", locationId);\n  \n  // Mit ID suchen, falls ID übergeben wurde\n  if (typeof locationId === "number") {\n    var location = locations.find(function(loc) {\n      return loc.id === locationId;\n    });\n    \n    if (!location) {\n      showError("Ort nicht gefunden");\n      return;\n    }\n  } else {\n    var location = locationId;\n  }\n  \n  // Lösche vorherige Detailansicht falls vorhanden\n  var existingDetail = document.getElementById("locationDetailFixed");\n  if (existingDetail) {\n    existingDetail.remove();\n  }\n  \n  // Erstelle neues Detailfenster\n  var detailView = document.createElement("div");\n  detailView.id = "locationDetailFixed";\n  detailView.style.position = "fixed";\n  detailView.style.top = "50%";\n  detailView.style.left = "50%";\n  detailView.style.transform = "translate(-50%, -50%)";\n  detailView.style.width = "90%";\n  detailView.style.maxWidth = "450px";\n  detailView.style.backgroundColor = "#222";\n  detailView.style.color = "white";\n  detailView.style.padding = "20px";\n  detailView.style.borderRadius = "8px";\n  detailView.style.boxShadow = "0 0 20px rgba(0,0,0,0.5)";\n  detailView.style.zIndex = "9999";\n  detailView.style.display = "flex";\n  detailView.style.flexDirection = "column";\n  \n  // Header mit Titel und Schließen-Button\n  var header = document.createElement("div");\n  header.style.display = "flex";\n  header.style.justifyContent = "space-between";\n  header.style.alignItems = "center";\n  header.style.marginBottom = "15px";\n  \n  var title = document.createElement("h3");\n  title.textContent = location.title || "Unbenannter Ort";\n  title.style.margin = "0";\n  title.style.color = "#fff";\n  title.style.fontSize = "18px";\n  \n  var closeButton = document.createElement("button");\n  closeButton.innerHTML = "&times;";\n  closeButton.style.background = "none";\n  closeButton.style.border = "none";\n  closeButton.style.color = "white";\n  closeButton.style.fontSize = "24px";\n  closeButton.style.cursor = "pointer";\n  closeButton.style.padding = "0 5px";\n  closeButton.onclick = function() {\n    detailView.remove();\n  };\n  \n  header.appendChild(title);\n  header.appendChild(closeButton);\n  \n  // Bild\n  var image = document.createElement("img");\n  image.src = "/api/locations/" + location.id + "/image?sessionId=" + sessionId + "&t=" + new Date().getTime();\n  image.alt = location.title || "Ortsbild";\n  image.style.width = "100%";\n  image.style.maxHeight = "300px";\n  image.style.objectFit = "cover";\n  image.style.borderRadius = "4px";\n  image.style.marginBottom = "15px";\n  image.onerror = function() {\n    image.src = "/uploads/couple.jpg";\n    console.error("Fehler beim Laden des Bildes");\n  };\n  \n  // Beschreibung\n  var description = document.createElement("div");\n  description.textContent = location.description || "Keine Beschreibung vorhanden.";\n  description.style.marginBottom = "15px";\n  description.style.lineHeight = "1.4";\n  \n  // Löschen-Button\n  var deleteButton = document.createElement("button");\n  deleteButton.textContent = "Löschen";\n  deleteButton.style.backgroundColor = "#e74c3c";\n  deleteButton.style.color = "white";\n  deleteButton.style.border = "none";\n  deleteButton.style.padding = "8px 15px";\n  deleteButton.style.borderRadius = "4px";\n  deleteButton.style.cursor = "pointer";\n  deleteButton.style.alignSelf = "flex-start";\n  deleteButton.style.marginTop = "10px";\n  deleteButton.onclick = function() {\n    if (confirm("Ort wirklich löschen?")) {\n      window.location.href = "/delete-location?id=" + location.id + "&sessionId=" + sessionId;\n    }\n  };\n  \n  // Alles zusammenfügen\n  detailView.appendChild(header);\n  detailView.appendChild(image);\n  detailView.appendChild(description);\n  detailView.appendChild(deleteButton);\n  \n  // Zum Body hinzufügen\n  document.body.appendChild(detailView);\n  \n  console.log("Detailansicht sollte jetzt sichtbar sein");\n}\n\n// Original-Funktion überschreiben\nwindow.originalShowLocationDetail = showLocationDetail;\nshowLocationDetail = showLocationDetailFixed;\n\n// Ende des Scripts|g' dist/index.js

# Installiere Abhängigkeiten
echo "Installiere Abhängigkeiten..."
cd dist && npm install

echo "=== Build erfolgreich abgeschlossen ==="