// Direkter Frontend-Fix für das Session-Problem

// Öffne die Browser-Entwicklertools (F12)
// Kopiere diesen Code und führe ihn in der Konsole aus

// Finde das Formular
const locationForm = document.getElementById('locationForm');
if (!locationForm) {
  console.error('Formular nicht gefunden!');
} else {
  console.log('Formular gefunden, füge Event-Listener hinzu');
  
  // Überschreibe das bestehende Formular-Event
  locationForm.onsubmit = function(e) {
    e.preventDefault();
    console.log('Neuer Submit-Handler wird ausgeführt');
    
    // Hole die aktuelle Session-ID aus der URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');
    console.log('Session-ID aus URL:', sessionId);
    
    // Hole Formularwerte
    const title = document.getElementById('locationTitle').value;
    const lat = document.getElementById('locationLat').value;
    const lng = document.getElementById('locationLng').value;
    const desc = document.getElementById('locationDesc').value || '';
    const file = document.getElementById('locationImage').files[0];
    
    if (!title || !lat || !lng || !file) {
      alert('Bitte fülle alle Pflichtfelder aus.');
      return;
    }
    
    console.log('Formularwerte:', { title, lat, lng, desc, fileName: file.name, fileSize: file.size });
    
    // Button-Zustand ändern während des Uploads
    const submitButton = locationForm.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Speichern...';
    submitButton.disabled = true;
    
    // Lade-Anzeige
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    
    // FormData erstellen
    const formData = new FormData();
    formData.append('title', title);
    formData.append('latitude', lat);
    formData.append('longitude', lng);
    formData.append('description', desc);
    formData.append('image', file);
    
    // WICHTIG: Füge Session-ID zum FormData und zur URL hinzu
    formData.append('sessionId', sessionId);
    
    console.log('Sende Anfrage mit Session-ID:', sessionId);
    
    // Sende Anfrage mit der Session-ID in der URL
    fetch('/api/locations?sessionId=' + sessionId, {
      method: 'POST',
      body: formData
    })
    .then(response => {
      console.log('Antwort erhalten, Status:', response.status);
      
      // Prüfe, ob HTML oder JSON zurückkommt
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") === -1) {
        return response.text().then(html => {
          if (html.includes('<title>Susibert</title>') || html.includes('login')) {
            console.error('Session-Fehler: Login-Seite wurde zurückgegeben');
            alert('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');
            window.location.href = '/';
            throw new Error('Session abgelaufen');
          } else {
            throw new Error('Unerwartete Antwort vom Server');
          }
        });
      }
      
      return response.json();
    })
    .then(data => {
      // Button zurücksetzen
      submitButton.textContent = originalText;
      submitButton.disabled = false;
      if (loadingIndicator) loadingIndicator.style.display = 'none';
      
      console.log('Erfolgreiche Antwort:', data);
      
      if (data.error) {
        alert('Fehler: ' + data.error);
        return;
      }
      
      // Formular schließen und Orte neu laden
      document.getElementById('addLocationForm').style.display = 'none';
      locationForm.reset();
      
      // Funktion zum Laden der Orte aufrufen
      loadLocations();
      
      // Bearbeitungsmodus beenden
      if (typeof toggleEditMode === 'function' && editMode) {
        toggleEditMode();
      }
    })
    .catch(error => {
      // Button zurücksetzen
      submitButton.textContent = originalText;
      submitButton.disabled = false;
      if (loadingIndicator) loadingIndicator.style.display = 'none';
      
      console.error('Fehler bei fetch:', error);
      
      if (!error.message.includes('Session abgelaufen')) {
        alert('Fehler beim Speichern: ' + error.message);
      }
    });
  };
  
  console.log('Neuer Event-Handler installiert. Probiere jetzt das Hochladen!');
}