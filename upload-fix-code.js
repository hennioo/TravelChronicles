(function() {
  console.log("UPLOAD FIX WIRD AUSGEFÜHRT");
  
  const form = document.getElementById("locationForm");
  
  if (form) {
    form.addEventListener("submit", function(e) {
      e.preventDefault();
      
      const sessionId = new URLSearchParams(window.location.search).get("sessionId");
      
      if (!sessionId) {
        alert("Keine Session-ID gefunden. Bitte lade die Seite neu.");
        return;
      }
      
      const title = document.getElementById("locationTitle").value;
      const lat = document.getElementById("locationLat").value;
      const lng = document.getElementById("locationLng").value;
      const desc = document.getElementById("locationDesc").value || "";
      const file = document.getElementById("locationImage").files[0];
      
      if (!title || !lat || !lng || !file) {
        alert("Bitte fülle alle Pflichtfelder aus.");
        return;
      }
      
      // FormData erstellen
      const formData = new FormData();
      formData.append("title", title);
      formData.append("latitude", lat);
      formData.append("longitude", lng);
      formData.append("description", desc);
      formData.append("image", file);
      formData.append("sessionId", sessionId);
      
      // Lade-Anzeige einblenden
      const loadingIndicator = document.getElementById("loadingIndicator");
      if (loadingIndicator) loadingIndicator.style.display = "block";
      
      // Anfrage senden
      fetch("/api/locations?sessionId=" + sessionId, {
        method: "POST",
        body: formData
      })
      .then(response => {
        // Wenn die Antwort kein JSON ist, zeigt das ein Session-Problem an
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          return response.json();
        } else {
          // Wenn keine JSON-Antwort, dann Text zurückgeben und prüfen
          return response.text().then(text => {
            if (text.includes("<title>Susibert</title>") || text.includes("login")) {
              alert("Session abgelaufen. Bitte melde dich neu an.");
              window.location.href = "/";
              throw new Error("Session abgelaufen");
            }
            throw new Error("Unerwartete Antwort vom Server");
          });
        }
      })
      .then(data => {
        if (loadingIndicator) loadingIndicator.style.display = "none";
        
        if (data.error) {
          alert("Fehler: " + data.error);
          return;
        }
        
        alert("Ort wurde erfolgreich gespeichert!");
        
        // Form zurücksetzen und schließen
        form.reset();
        document.getElementById("addLocationForm").style.display = "none";
        
        // Orte neu laden
        if (typeof loadLocations === "function") {
          loadLocations();
        } else {
          window.location.reload();
        }
      })
      .catch(error => {
        if (loadingIndicator) loadingIndicator.style.display = "none";
        
        if (!error.message.includes("Session abgelaufen")) {
          alert("Fehler beim Speichern: " + error.message);
        }
      });
    });
    
    console.log("UPLOAD FIX ERFOLGREICH INSTALLIERT");
  } else {
    console.log("FEHLER: Formular nicht gefunden");
  }
})();
