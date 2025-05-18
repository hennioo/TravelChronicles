import { pool, db } from './server/db';

async function testDatabase() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('Database connection test successful:', result.rows[0]);

    await pool.end();
  } catch (error) {
    console.error('Database test failed:', error);
    process.exit(1);
  }
}

testDatabase();