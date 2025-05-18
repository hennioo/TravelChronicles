import sharp from 'sharp';

/**
 * Komprimiert ein Bild für optimale Speicherung in der Datenbank
 * Reduziert die Dateigröße ohne sichtbare Qualitätsverluste
 */
export async function compressImage(buffer: Buffer, mimeType: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
}> {
  try {
    console.log(`Komprimiere Bild vom Typ ${mimeType}...`);
    const originalSize = buffer.length;
    let compressedBuffer: Buffer;
    let finalMimeType = mimeType;
    
    // JPEG/JPG komprimieren
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      compressedBuffer = await sharp(buffer)
        .jpeg({ quality: 60, mozjpeg: true })
        .toBuffer();
      
      // JPEG-Typ beibehalten
      finalMimeType = 'image/jpeg';
    }
    // PNG komprimieren
    else if (mimeType.includes('png')) {
      compressedBuffer = await sharp(buffer)
        .png({ quality: 60, compressionLevel: 9 })
        .toBuffer();
      
      // PNG-Typ beibehalten
      finalMimeType = 'image/png';
    }
    // HEIC zu JPEG konvertieren (für iOS Fotos)
    else if (mimeType.includes('heic') || mimeType.includes('heif')) {
      compressedBuffer = await sharp(buffer)
        .jpeg({ quality: 60, mozjpeg: true })
        .toBuffer();
      
      // Zu JPEG konvertieren
      finalMimeType = 'image/jpeg';
    }
    // Andere Bildformate zu JPEG konvertieren
    else if (mimeType.startsWith('image/')) {
      compressedBuffer = await sharp(buffer)
        .jpeg({ quality: 60, mozjpeg: true })
        .toBuffer();
      
      // Zu JPEG konvertieren für maximale Kompatibilität
      finalMimeType = 'image/jpeg';
    }
    // Kein bekanntes Bildformat - Original zurückgeben
    else {
      compressedBuffer = buffer;
    }
    
    const compressedSize = compressedBuffer.length;
    const savingsPercent = ((1 - compressedSize / originalSize) * 100).toFixed(2);
    
    console.log(`Bild komprimiert: ${formatBytes(originalSize)} → ${formatBytes(compressedSize)} (${savingsPercent}% gespart)`);
    
    return {
      buffer: compressedBuffer,
      mimeType: finalMimeType,
      originalSize,
      compressedSize
    };
  } catch (err) {
    console.error('Fehler bei Bildkompression:', err);
    
    // Bei Fehler Original zurückgeben
    return {
      buffer,
      mimeType,
      originalSize: buffer.length,
      compressedSize: buffer.length
    };
  }
}

/**
 * Formatiert Bytes in menschenlesbare Größen (KB, MB, etc.)
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}