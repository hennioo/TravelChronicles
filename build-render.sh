#!/bin/bash

# Dieses Skript ist für den Build-Prozess auf Render
# Es installiert alle dev-dependencies vor dem Build-Prozess
echo "Installing all dependencies for Render..."

# Install production dependencies
npm install

# Install development dependencies explicitly
npm install --no-save @vitejs/plugin-react autoprefixer postcss tailwindcss esbuild typescript vite

# Kopiere die Render-optimierte Vite-Konfiguration
cp vite.config.render.ts vite.config.ts

# Run the build
echo "Building the application..."
npm run build

echo "Build completed!"