// Extrem vereinfachter Starter - startet direkt server.js im Hauptverzeichnis
// Dieser sollte definitiv funktionieren, egal wie die Konfiguration ist
console.log('Starte die Server-Anwendung...');

// Versuche zuerst, server.js zu starten
try {
  console.log('Versuche server.js zu laden...');
  require('./server');
} catch (err) {
  console.error('Fehler beim Laden von server.js:', err);
  
  // Versuche als Fallback dist/index.js zu starten
  try {
    console.log('Versuche dist/index.js zu laden...');
    require('./dist/index');
  } catch (err2) {
    console.error('Auch dist/index.js konnte nicht geladen werden:', err2);
    
    // Probiere alle anderen Versionen
    try {
      console.log('Versuche render-final.js zu laden...');
      require('./render-final');
    } catch (err3) {
      console.error('Kritischer Fehler: Keine Server-Datei konnte geladen werden');
      console.error('Bitte stelle sicher, dass mindestens eine der folgenden Dateien existiert:');
      console.error('server.js, dist/index.js, render-final.js');
      process.exit(1);
    }
  }
}