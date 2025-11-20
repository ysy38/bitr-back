#!/usr/bin/env node

/**
 * Fix Table References Script
 * 
 * This script fixes all references from oracle.pool_bets to oracle.bets
 * and updates column names from user_address to bettor_address
 */

const db = require('../db/db');

async function fixTableReferences() {
  console.log('🔧 Fixing table references from oracle.pool_bets to oracle.bets...');
  
  try {
    // Check if oracle.bets table exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'oracle' 
        AND table_name = 'bets'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ oracle.bets table does not exist! Creating it...');
      
      // Create oracle.bets table
      await db.query(`
        CREATE TABLE IF NOT EXISTS oracle.bets (
          id SERIAL PRIMARY KEY,
          pool_id VARCHAR NOT NULL,
          bettor_address VARCHAR(42) NOT NULL,
          amount VARCHAR NOT NULL,
          is_for_outcome BOOLEAN DEFAULT false,
          transaction_hash VARCHAR(66),
          block_number VARCHAR,
          event_start_time TIMESTAMP,
          event_end_time TIMESTAMP,
          betting_end_time TIMESTAMP,
          league VARCHAR,
          category VARCHAR,
          home_team VARCHAR,
          away_team VARCHAR,
          title VARCHAR,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      
      console.log('✅ oracle.bets table created');
    } else {
      console.log('✅ oracle.bets table exists');
    }
    
    // Check if oracle.pool_bets table exists and migrate data
    const poolBetsCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'oracle' 
        AND table_name = 'pool_bets'
      );
    `);
    
    if (poolBetsCheck.rows[0].exists) {
      console.log('📦 Migrating data from oracle.pool_bets to oracle.bets...');
      
      // Check if oracle.bets is empty
      const betsCount = await db.query('SELECT COUNT(*) FROM oracle.bets');
      
      if (betsCount.rows[0].count === '0') {
        // Migrate data from pool_bets to bets
        await db.query(`
          INSERT INTO oracle.bets (
            pool_id, bettor_address, amount, is_for_outcome, 
            transaction_hash, block_number, created_at
          )
          SELECT 
            pool_id::VARCHAR,
            COALESCE(user_address, bettor_address) as bettor_address,
            amount::VARCHAR,
            COALESCE(is_for_outcome, is_creator_side, false) as is_for_outcome,
            COALESCE(transaction_hash, tx_hash) as transaction_hash,
            block_number::VARCHAR,
            created_at
          FROM oracle.pool_bets
          WHERE NOT EXISTS (
            SELECT 1 FROM oracle.bets b2 
            WHERE b2.pool_id = oracle.pool_bets.pool_id::VARCHAR 
            AND b2.bettor_address = COALESCE(oracle.pool_bets.user_address, oracle.pool_bets.bettor_address)
            AND b2.transaction_hash = COALESCE(oracle.pool_bets.transaction_hash, oracle.pool_bets.tx_hash)
          );
        `);
        
        console.log('✅ Data migrated from oracle.pool_bets to oracle.bets');
      } else {
        console.log('⚠️ oracle.bets already has data, skipping migration');
      }
    } else {
      console.log('ℹ️ oracle.pool_bets table does not exist, no migration needed');
    }
    
    console.log('✅ Table reference fixes completed');
    
  } catch (error) {
    console.error('❌ Error fixing table references:', error);
    throw error;
  }
}

// Run the fix
if (require.main === module) {
  fixTableReferences()
    .then(() => {
      console.log('🎉 All table references fixed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed to fix table references:', error);
      process.exit(1);
    });
}

module.exports = { fixTableReferences };
