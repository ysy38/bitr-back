/**
 * Run migration to change pool_liquidity_providers.stake from BIGINT to NUMERIC(78,0)
 */

const db = require('../db/db');

async function runMigration() {
  try {
    console.log('🔄 Running migration: Changing stake column from BIGINT to NUMERIC(78,0)...');
    
    // Check current column type
    const checkResult = await db.query(`
      SELECT column_name, data_type, numeric_precision, numeric_scale 
      FROM information_schema.columns 
      WHERE table_schema = 'oracle' 
        AND table_name = 'pool_liquidity_providers' 
        AND column_name = 'stake'
    `);
    
    if (checkResult.rows.length === 0) {
      throw new Error('Column stake not found in pool_liquidity_providers table');
    }
    
    const currentType = checkResult.rows[0];
    console.log(`📊 Current column type: ${currentType.data_type}${currentType.numeric_precision ? `(${currentType.numeric_precision},${currentType.numeric_scale})` : ''}`);
    
    if (currentType.data_type === 'numeric' && currentType.numeric_precision === 78) {
      console.log('✅ Column is already NUMERIC(78,0) - no migration needed');
      return;
    }
    
    // Run migration
    console.log('🔄 Altering column type...');
    await db.query(`
      ALTER TABLE oracle.pool_liquidity_providers 
      ALTER COLUMN stake TYPE NUMERIC(78, 0) USING stake::NUMERIC(78, 0)
    `);
    
    // Verify the change
    const verifyResult = await db.query(`
      SELECT column_name, data_type, numeric_precision, numeric_scale 
      FROM information_schema.columns 
      WHERE table_schema = 'oracle' 
        AND table_name = 'pool_liquidity_providers' 
        AND column_name = 'stake'
    `);
    
    const newType = verifyResult.rows[0];
    console.log(`✅ Migration complete! New column type: ${newType.data_type}(${newType.numeric_precision},${newType.numeric_scale})`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

runMigration()
  .then(() => {
    console.log('\n✅ Migration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  });

