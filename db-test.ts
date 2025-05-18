
import { pool, db } from './server/db';

async function testDatabase() {
  try {
    console.log('Starting database connection test...');
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful:', result.rows[0]);
    
    console.log('Testing locations table...');
    const locationsTest = await pool.query('SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = \'public\' AND table_name = \'locations\')');
    console.log('Locations table exists:', locationsTest.rows[0].exists);

    console.log('Testing access_codes table...');
    const accessCodesTest = await pool.query('SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = \'public\' AND table_name = \'access_codes\')');
    console.log('Access codes table exists:', accessCodesTest.rows[0].exists);

    await pool.end();
  } catch (error) {
    console.error('Database connection error details:');
    console.error('Message:', error.message);
    console.error('Code:', error.code);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testDatabase();
