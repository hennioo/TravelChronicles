import sharp from 'sharp';

/**
 * Komprimiert ein Bild für die optimale Anzeige im Frontend
 * Reduziert Größe, Qualität und Dimensionen, um Datenbankgröße und Ladezeiten zu verbessern
 */
export async function compressImage(buffer: Buffer, imageType: string): Promise<{
  data: Buffer;
  mimeType: string;
}> {
  try {
    // Bestimme das richtige Ausgabeformat basierend auf dem Eingabetyp
    let outputFormat: 'jpeg' | 'png' | 'webp' = 'jpeg';
    
    if (imageType.includes('png')) {
      outputFormat = 'png';
    } else if (imageType.includes('webp')) {
      outputFormat = 'webp';
    }
    
    // Reduziere die Bildgröße auf maximal 800x800 Pixel
    const compressedImage = await sharp(buffer)
      .resize({
        width: 800,
        height: 800,
        fit: 'inside',
        withoutEnlargement: true
      });
    
    // Speichere mit reduzierter Qualität
    let processedBuffer: Buffer;
    let outputMimeType: string;
    
    if (outputFormat === 'jpeg') {
      processedBuffer = await compressedImage.jpeg({ quality: 80 }).toBuffer();
      outputMimeType = 'image/jpeg';
    } else if (outputFormat === 'png') {
      processedBuffer = await compressedImage.png({ compressionLevel: 7 }).toBuffer();
      outputMimeType = 'image/png';
    } else {
      processedBuffer = await compressedImage.webp({ quality: 80 }).toBuffer();
      outputMimeType = 'image/webp';
    }
    
    console.log(`Bild komprimiert: ${buffer.length} → ${processedBuffer.length} Bytes (${Math.round(processedBuffer.length / buffer.length * 100)}%)`);
    
    return {
      data: processedBuffer,
      mimeType: outputMimeType
    };
  } catch (error) {
    console.error('Fehler bei der Bildkompression:', error);
    // Im Fehlerfall das Originalbild zurückgeben
    return {
      data: buffer,
      mimeType: imageType
    };
  }
}

/**
 * Erstellt ein Thumbnail für die Anzeige in der Sidebar
 */
export async function createThumbnail(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .resize(100, 100, { fit: 'cover' })
      .jpeg({ quality: 70 })
      .toBuffer();
  } catch (error) {
    console.error('Fehler bei der Thumbnail-Erstellung:', error);
    throw error;
  }
}