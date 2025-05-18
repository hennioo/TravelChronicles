import { pool } from './server/db';
import fs from 'fs';
import path from 'path';

async function testLocationUpload() {
  try {
    // Test image (using the existing animal eye image)
    const imagePath = path.join(process.cwd(), 'animal-eye-staring-close-up-watch-nature-generative-ai.jpg');
    const imageBuffer = fs.readFileSync(imagePath);
    const imageBase64 = imageBuffer.toString('base64');

    // Insert test location with image
    const result = await pool.query(`
      INSERT INTO locations 
      (name, description, date, highlight, latitude, longitude, image, image_type) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      'Test Location',
      'This is a test location',
      'Mai 2025',
      'Test highlight',
      '48.1351',
      '11.5820',
      imageBase64,
      'image/jpeg'
    ]);

    const locationId = result.rows[0].id;
    console.log('✅ Location uploaded with ID:', locationId);

    // Download and verify the image
    const downloadResult = await pool.query(`
      SELECT image, image_type 
      FROM locations 
      WHERE id = $1
    `, [locationId]);

    if (downloadResult.rows[0].image) {
      console.log('✅ Image successfully retrieved from database');
      console.log('Image type:', downloadResult.rows[0].image_type);
      console.log('Base64 length:', downloadResult.rows[0].image.length);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testLocationUpload();