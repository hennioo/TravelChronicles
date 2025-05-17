// Upload-Form-Fix
(function() {
  console.log('UPLOAD FIX AKTIVIERT');
  
  // Warte bis das Dokument geladen ist
  function startFix() {
    console.log('Versuche Upload-Fix zu starten...');
    const form = document.getElementById('locationForm');
    
    if (!form) {
      console.log('Formular noch nicht gefunden, warte...');
      setTimeout(startFix, 1000);
      return;
    }
    
    console.log('Formular gefunden, überschreibe onsubmit...');
    
    form.onsubmit = function(e) {
      e.preventDefault();
      console.log('ANGEPASSTER SUBMIT HANDLER AKTIV');
      
      const sessionId = new URLSearchParams(window.location.search).get('sessionId');
      
      if (!sessionId) {
        alert('Keine Session-ID gefunden. Bitte lade die Seite neu.');
        return;
      }
      
      console.log('Session-ID:', sessionId);
      
      // Formular-Daten sammeln
      const title = document.getElementById('locationTitle').value;
      const lat = document.getElementById('locationLat').value;
      const lng = document.getElementById('locationLng').value;
      const desc = document.getElementById('locationDesc').value || '';
      const fileInput = document.getElementById('locationImage');
      
      if (!title || !lat || !lng || !fileInput.files.length) {
        alert('Bitte fülle alle Pflichtfelder aus.');
        return;
      }
      
      const file = fileInput.files[0];
      
      // Bildgröße prüfen (15MB maximal)
      const maxSize = 15 * 1024 * 1024;
      if (file.size > maxSize) {
        alert(`Das Bild ist zu groß: ${(file.size / (1024 * 1024)).toFixed(2)} MB. Maximal erlaubt sind 15 MB.`);
        return;
      }
      
      // FormData erstellen
      const formData = new FormData();
      formData.append('title', title);
      formData.append('latitude', lat);
      formData.append('longitude', lng);
      formData.append('description', desc);
      formData.append('image', file);
      formData.append('sessionId', sessionId);
      
      console.log('Sende Anfrage mit sessionId in URL UND FormData');
      
      // Lade-Anzeige
      const loadingIndicator = document.getElementById('loadingIndicator');
      if (loadingIndicator) loadingIndicator.style.display = 'block';
      
      // Anfrage senden
      fetch('/api/locations?sessionId=' + sessionId, {
        method: 'POST',
        body: formData
      })
      .then(response => {
        console.log('Antwort erhalten, Status:', response.status);
        
        // Prüfe, ob die Antwort JSON ist
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.indexOf('application/json') !== -1) {
          return response.json();
        } else {
          // Wenn keine JSON-Antwort, dann Text zurückgeben
          return response.text().then(text => {
            console.error('Keine JSON-Antwort erhalten:', text.substring(0, 200) + '...');
            
            // Prüfe, ob die Antwort die Login-Seite ist
            if (text.includes('<title>Susibert</title>') || text.includes('loginForm')) {
              console.error('Session-Fehler: Login-Seite wurde zurückgegeben');
              alert('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');
              window.location.href = '/';
              throw new Error('Session abgelaufen');
            }
            
            throw new Error('Unerwartete Antwort vom Server');
          });
        }
      })
      .then(data => {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        
        if (data.error) {
          alert('Fehler: ' + data.error);
          return;
        }
        
        console.log('Erfolgreiche Antwort:', data);
        
        // Erfolgsmeldung
        alert('Ort wurde erfolgreich gespeichert!');
        
        // Formular zurücksetzen und schließen
        document.getElementById('locationForm').reset();
        document.getElementById('addLocationForm').style.display = 'none';
        
        // Orte neu laden
        if (typeof loadLocations === 'function') {
          loadLocations();
        } else {
          window.location.reload();
        }
      })
      .catch(error => {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        
        console.error('Fehler beim Upload:', error);
        
        if (!error.message.includes('Session abgelaufen')) {
          alert('Fehler beim Speichern: ' + error.message);
        }
      });
    };
    
    console.log('Upload-Fix erfolgreich installiert!');
    alert('Upload-Fix installiert. Du kannst jetzt Bilder hochladen!');
  }
  
  // Start mit etwas Verzögerung, um sicherzustellen, dass die Seite geladen ist
  setTimeout(startFix, 1000);
})();