// Automatischer Upload-Fix, wird beim Laden der Seite ausgeführt
(function() {
  console.log('Upload-Fix geladen, warte auf DOM-Bereitschaft...');
  
  // Funktion zur Korrektur des Upload-Formular-Handlers
  function fixUploadForm() {
    console.log('Suche Upload-Formular...');
    
    // Prüfe, ob wir auf der Karten-Seite sind
    if (!window.location.href.includes('/map')) {
      console.log('Nicht auf der Karten-Seite, nichts zu tun.');
      return;
    }
    
    // Kurz warten, bis die Seite vollständig geladen ist
    setTimeout(() => {
      const locationForm = document.getElementById('locationForm');
      
      if (!locationForm) {
        console.log('Formular nicht gefunden, versuche es später erneut.');
        // Noch einmal versuchen, wenn Formular nicht sofort gefunden wird
        setTimeout(fixUploadForm, 1000);
        return;
      }
      
      console.log('Formular gefunden, ersetze den Submit-Handler');
      
      // Ersetze den Formular-Handler
      locationForm.onsubmit = function(e) {
        e.preventDefault();
        console.log('Verbesserter Submit-Handler wurde ausgelöst');
        
        // Session-ID aus URL holen
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('sessionId');
        
        if (!sessionId) {
          alert('Keine Session-ID gefunden! Bitte melde dich erneut an.');
          window.location.href = '/';
          return;
        }
        
        console.log('Gefundene Session-ID:', sessionId);
        
        // Formular-Daten sammeln
        const title = document.getElementById('locationTitle').value;
        const lat = document.getElementById('locationLat').value;
        const lng = document.getElementById('locationLng').value;
        const desc = document.getElementById('locationDesc').value || '';
        const file = document.getElementById('locationImage').files[0];
        
        if (!title || !lat || !lng || !file) {
          alert('Bitte fülle alle Pflichtfelder aus.');
          return;
        }
        
        // Prüfe Bildgröße (max 15MB)
        if (file.size > 15 * 1024 * 1024) {
          alert(`Das Bild ist zu groß: ${(file.size / (1024 * 1024)).toFixed(2)} MB. Maximal erlaubt sind 15 MB.`);
          return;
        }
        
        console.log('Alle Eingaben validiert, bereite FormData vor', {
          title, lat, lng, desc, fileName: file.name, fileSize: file.size
        });
        
        // Button-Zustand ändern während des Uploads
        const submitButton = document.querySelector('#locationForm button[type="submit"]');
        const originalText = submitButton.textContent;
        submitButton.textContent = 'Speichern...';
        submitButton.disabled = true;
        
        // Lade-Anzeige einblenden
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) loadingIndicator.style.display = 'block';
        
        // FormData erstellen
        const formData = new FormData();
        formData.append('title', title);
        formData.append('latitude', lat);
        formData.append('longitude', lng);
        formData.append('description', desc);
        formData.append('image', file);
        formData.append('sessionId', sessionId);
        
        console.log('Sende Anfrage mit Session-ID in URL und FormData');
        
        // Anfrage senden
        fetch('/api/locations?sessionId=' + sessionId, {
          method: 'POST',
          body: formData
        })
        .then(response => {
          console.log('Antwort Status:', response.status);
          
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.indexOf('application/json') === -1) {
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
          
          // Funktion zum Laden der Orte aufrufen (falls vorhanden)
          if (typeof loadLocations === 'function') {
            loadLocations();
          } else {
            window.location.reload(); // Fallback: Seite neu laden
          }
          
          // Bearbeitungsmodus beenden (falls vorhanden)
          if (typeof toggleEditMode === 'function' && window.editMode) {
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
      
      // Bilddetails-Fix 
      // Suche nach der Funktion, die Bilddetails anzeigt
      if (typeof window.showLocationDetail === 'function') {
        const originalShowDetail = window.showLocationDetail;
        
        window.showLocationDetail = function(location) {
          // Original-Funktion aufrufen
          originalShowDetail(location);
          
          // Sicherstellen, dass Session-ID im Bild-URL enthalten ist
          setTimeout(() => {
            const detailImage = document.getElementById('detailImage');
            if (detailImage) {
              // Session-ID aus URL holen
              const urlParams = new URLSearchParams(window.location.search);
              const sessionId = urlParams.get('sessionId');
              
              // Bild-URL mit Session-ID ergänzen
              let currentSrc = detailImage.src;
              if (!currentSrc.includes('sessionId=')) {
                detailImage.src = currentSrc + (currentSrc.includes('?') ? '&' : '?') + 'sessionId=' + sessionId + '&t=' + new Date().getTime();
                console.log('Bild-URL mit Session-ID ergänzt');
              }
            }
          }, 100);
        };
      }
      
      console.log('Upload-Fix erfolgreich installiert! Bild-Upload sollte jetzt funktionieren.');
    }, 500);
  }
  
  // Einen MutationObserver verwenden, um sicherzustellen, dass der Fix auch funktioniert,
  // wenn die Seite dynamisch geladen wird
  function initObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          // Neue Elemente wurden hinzugefügt, prüfe, ob das Formular dabei ist
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1 && node.id === 'locationForm') {
              fixUploadForm();
              return;
            }
          }
        }
      }
    });
    
    // Gesamtes Dokument beobachten
    observer.observe(document.body, { childList: true, subtree: true });
    console.log('MutationObserver gestartet');
  }
  
  // Start, wenn DOM geladen ist
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('DOM geladen, starte Fix');
      fixUploadForm();
      initObserver();
    });
  } else {
    console.log('DOM bereits geladen, starte Fix sofort');
    fixUploadForm();
    initObserver();
  }
})();