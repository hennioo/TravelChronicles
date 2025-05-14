// Hilfsskript, das den Start an den Wartungsserver delegiert
// wird von 'npm start' ausgeführt
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const serverPath = path.join(__dirname, 'dist', 'server.js');
const publicPath = path.join(__dirname, 'dist', 'public');

// Prüfe, ob der Wartungsserver existiert
if (fs.existsSync(serverPath)) {
  console.log('Starte Wartungsserver...');
  
  const server = spawn('node', [serverPath], {
    cwd: path.join(__dirname, 'dist'),
    stdio: 'inherit',
    env: process.env
  });
  
  server.on('error', (err) => {
    console.error('Fehler beim Starten des Wartungsservers:', err);
    process.exit(1);
  });
  
  process.on('SIGINT', () => {
    server.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    server.kill('SIGTERM');
  });
} else {
  console.error('Fehler: Wartungsserver nicht gefunden unter ' + serverPath);
  process.exit(1);
}