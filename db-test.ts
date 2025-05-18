
import { pool } from './server/db';

async function testDatabase() {
  try {
    const client = await pool.connect();
    console.log('✅ Datenbankverbindung erfolgreich hergestellt');
    
    const result = await client.query('SELECT NOW()');
    console.log('🕒 Aktuelle Datenbankzeit:', result.rows[0].now);
    
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('\n📋 Verfügbare Tabellen:');
    tablesResult.rows.forEach(row => console.log(`- ${row.table_name}`));
    
    client.release();
  } catch (error) {
    console.error('❌ Datenbankfehler:', error);
    console.error('Details:', {
      message: error.message,
      code: error.code,
      detail: error.detail
    });
  } finally {
    await pool.end();
  }
}

testDatabase();
