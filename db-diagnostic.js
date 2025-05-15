// Diagnostik-Tool für die Datenbank
const { Pool } = require('pg');

async function runDiagnostic() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL ist nicht gesetzt');
    return;
  }
  
  console.log('Starting DB diagnostic...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Verbindung testen
    console.log('Testing connection...');
    const client = await pool.connect();
    console.log('✅ Connected to database');
    
    // Schemas anzeigen
    console.log('\nListing schemas:');
    const schemas = await client.query(`
      SELECT schema_name FROM information_schema.schemata
    `);
    schemas.rows.forEach(row => console.log(`  - ${row.schema_name}`));
    
    // Tabellen anzeigen
    console.log('\nListing tables:');
    const tables = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    `);
    tables.rows.forEach(row => console.log(`  - ${row.table_schema}.${row.table_name}`));
    
    // Untersuche die Locations-Tabelle, wenn sie existiert
    console.log('\nChecking for "locations" table:');
    const locationsCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'locations'
      )
    `);
    
    if (locationsCheck.rows[0].exists) {
      console.log('✅ "locations" table exists');
      
      // Spalten anzeigen
      console.log('\n"locations" table columns:');
      const columns = await client.query(`
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'locations'
      `);
      
      columns.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type}, ${col.is_nullable === 'YES' ? 'nullable' : 'not null'}${col.column_default ? ', default: ' + col.column_default : ''})`);
      });
      
      // Anzahl der Datensätze
      const countResult = await client.query('SELECT COUNT(*) FROM locations');
      console.log(`\nTotal records in locations: ${countResult.rows[0].count}`);
      
      // Liste der ersten 5 Datensätze mit allen Spalten
      console.log('\nSample records (first 5):');
      try {
        const records = await client.query('SELECT * FROM locations LIMIT 5');
        
        if (records.rows.length === 0) {
          console.log('  (no records found)');
        } else {
          records.rows.forEach((record, i) => {
            console.log(`  Record #${i+1}:`);
            
            // Für jeden datensatz alle Spalten ausgeben (binarydaten verkürzt)
            Object.keys(record).forEach(key => {
              let value = record[key];
              
              // Binary data kürzen
              if (value instanceof Buffer) {
                value = `<Binary data: ${value.length} bytes>`;
              }
              
              console.log(`    ${key}: ${value}`);
            });
          });
        }
      } catch (e) {
        console.log(`  Error listing records: ${e.message}`);
      }
    } else {
      console.log('❌ "locations" table does not exist');
    }
    
    client.release();
  } catch (error) {
    console.error('Error during diagnostic:', error);
  } finally {
    await pool.end();
    console.log('\nDiagnostic complete');
  }
}

runDiagnostic().catch(console.error);