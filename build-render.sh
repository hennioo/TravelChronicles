#!/bin/bash

# Absolut minimaler Build für Render - tut nichts außer express zu installieren
set -ex
echo "=== Minimal Build für Render ==="

# Installiere Express für unseren Server
echo "Installiere Express..."
npm install express

echo "=== Build abgeschlossen ==="