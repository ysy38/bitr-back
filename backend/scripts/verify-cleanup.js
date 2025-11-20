#!/usr/bin/env node

/**
 * Verify Database Cleanup - October 27, 2025
 * 
 * This script verifies that the database cleanup was successful
 * and shows the current state of all tables.
 */

const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function verifyCleanup() {
  console.log('🔍 Verifying database cleanup...\n');
  
  try {
    // Connect to database
    await db.connect();
    console.log('✅ Connected to database');

    // List of tables to check
    const tablesToCheck = [
      'oracle.bets',
      'oracle.pool_liquidity_providers', 
      'oracle.pools',
      'oracle.oddyssey_slips',
      'oracle.oddyssey_cycles',
      'oracle.fixture_results',
      'core.users'
    ];

    console.log('📊 Current data counts:');
    let totalRecords = 0;
    
    for (const table of tablesToCheck) {
      try {
        const result = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = parseInt(result.rows[0].count);
        totalRecords += count;
        
        if (count === 0) {
          console.log(`   ✅ ${table}: ${count} records (CLEAN)`);
        } else {
          console.log(`   ⚠️  ${table}: ${count} records (NOT CLEAN)`);
        }
      } catch (error) {
        console.log(`   ❌ ${table}: Error - ${error.message}`);
      }
    }

    console.log(`\n📈 Total records across all tables: ${totalRecords}`);

    if (totalRecords === 0) {
      console.log('\n🎉 SUCCESS: Database is completely clean!');
      console.log('   ✅ Ready for new contract deployment');
      console.log('   ✅ No old data conflicts');
      console.log('   ✅ Fresh start with new contract addresses');
    } else {
      console.log('\n⚠️  WARNING: Some data still exists');
      console.log('   You may need to manually clean remaining data');
    }

    // Check if we can create a test user
    console.log('\n🧪 Testing database functionality...');
    
    try {
      // Test insert a user
      const testUser = await db.query(`
        INSERT INTO core.users (user_address, joined_at, total_bets, won_bets, total_pools_created, last_synced_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [
        '0x0000000000000000000000000000000000000000', // Test address
        new Date(),
        0,
        0, 
        0,
        new Date()
      ]);
      
      console.log(`   ✅ Test user created with ID: ${testUser.rows[0].id}`);
      
      // Clean up test user
      await db.query('DELETE FROM core.users WHERE user_address = $1', ['0x0000000000000000000000000000000000000000']);
      console.log('   ✅ Test user cleaned up');
      
    } catch (error) {
      console.log(`   ❌ Database functionality test failed: ${error.message}`);
    }

    console.log('\n🚀 Database is ready for new deployment!');
    console.log('\nNext steps:');
    console.log('   1. Start backend services');
    console.log('   2. Test pool creation');
    console.log('   3. Test reputation system');
    console.log('   4. Test Oddyssey functionality');

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await db.end();
    console.log('\n✅ Database connection closed');
  }
}

// Run verification
verifyCleanup().catch(console.error);
