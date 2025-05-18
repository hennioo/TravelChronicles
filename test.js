// Führe dieses Skript in der Browser-Konsole auf deiner Webseite aus
// sobald die Detailansicht eines Ortes geöffnet ist

const locationId = 22; // Passe dies an die ID des Ortes an, den du anzeigst
const sessionId = document.cookie.split(';').find(c => c.trim().startsWith('sessionId=')).split('=')[1];

fetch(`/api/locations/${locationId}/image/base64?sessionId=${sessionId}&t=${Date.now()}`)
  .then(response => response.json())
  .then(data => {
    if (data.success && data.imageData) {
      console.log('Bild erfolgreich geladen!');
      
      // Ersetze das Bild in der Detailansicht
      const img = document.createElement('img');
      img.src = `data:${data.imageType || 'image/jpeg'};base64,${data.imageData}`;
      img.alt = 'Ortsbild';
      img.style.width = '100%';
      img.style.maxHeight = '300px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '4px';
      
      // Suche nach dem Bild-Container in der Detailansicht
      const existingImg = document.querySelector('.detail-view img');
      if (existingImg) {
        existingImg.parentNode.replaceChild(img, existingImg);
        console.log('Bild erfolgreich ersetzt!');
      } else {
        console.error('Kein Bild-Element in der Detailansicht gefunden');
      }
    } else {
      console.error('Keine Bilddaten gefunden:', data);
    }
  })
  .catch(error => {
    console.error('Fehler beim Laden des Bildes:', error);
  });