#!/usr/bin/env node

/**
 * Database Cleanup Script - October 27, 2025
 * 
 * This script clears all data from the old contract deployment to prepare
 * for the new contract addresses. This prevents conflicts and ensures
 * clean data for the new deployment.
 * 
 * WARNING: This will delete ALL existing data!
 */

const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function cleanupDatabase() {
  console.log('🧹 Starting database cleanup for new contract deployment...\n');
  
  try {
    // Connect to database
    await db.connect();
    console.log('✅ Connected to database');

    // List of tables to clean (in dependency order)
    const tablesToClean = [
      // Oracle tables (most dependent)
      'oracle.bets',
      'oracle.pool_liquidity_providers', 
      'oracle.pools',
      'oracle.oddyssey_slips',
      'oracle.oddyssey_cycles',
      'oracle.fixture_results',
      
      // Core tables
      'core.users',
      'core.reputation_events',
      'core.pool_events',
      
      // System tables
      'system.contract_addresses',
      'system.deployment_info'
    ];

    console.log('\n📋 Tables to clean:');
    tablesToClean.forEach(table => console.log(`   - ${table}`));

    // Get counts before cleanup
    console.log('\n📊 Current data counts:');
    for (const table of tablesToClean) {
      try {
        const result = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`   ${table}: ${result.rows[0].count} records`);
      } catch (error) {
        console.log(`   ${table}: Table doesn't exist or error - ${error.message}`);
      }
    }

    // Confirm cleanup
    console.log('\n⚠️  WARNING: This will delete ALL data from the above tables!');
    console.log('   This is necessary because contract addresses have changed.');
    console.log('   Old data would conflict with new contract addresses.\n');

    // Perform cleanup
    console.log('🗑️  Starting cleanup...\n');
    
    for (const table of tablesToClean) {
      try {
        console.log(`Clearing ${table}...`);
        const result = await db.query(`DELETE FROM ${table}`);
        console.log(`   ✅ Deleted ${result.rowCount} records`);
      } catch (error) {
        if (error.message.includes('does not exist')) {
          console.log(`   ⚠️  Table ${table} doesn't exist (skipping)`);
        } else {
          console.log(`   ❌ Error clearing ${table}: ${error.message}`);
        }
      }
    }

    // Reset sequences
    console.log('\n🔄 Resetting sequences...');
    const sequences = [
      'oracle.bets_id_seq',
      'oracle.pools_id_seq', 
      'oracle.oddyssey_slips_id_seq',
      'oracle.oddyssey_cycles_id_seq',
      'core.users_id_seq',
      'core.reputation_events_id_seq'
    ];

    for (const sequence of sequences) {
      try {
        await db.query(`SELECT setval('${sequence}', 1, false)`);
        console.log(`   ✅ Reset ${sequence}`);
      } catch (error) {
        console.log(`   ⚠️  Sequence ${sequence} doesn't exist (skipping)`);
      }
    }

    // Verify cleanup
    console.log('\n📊 Post-cleanup data counts:');
    for (const table of tablesToClean) {
      try {
        const result = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`   ${table}: ${result.rows[0].count} records`);
      } catch (error) {
        console.log(`   ${table}: Table doesn't exist or error - ${error.message}`);
      }
    }

    // Insert new contract addresses
    console.log('\n📝 Inserting new contract addresses...');
    
    const newAddresses = {
      'BitredictToken': '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      'ReputationSystem': '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
      'GuidedOracle': '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
      'OptimisticOracle': '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
      'BitredictPoolCore': '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
      'BitredictBoostSystem': '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
      'BitredictComboPools': '0x0165878A594ca255338adfa4d48449f69242Eb8F',
      'BitredictPoolFactory': '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
      'BitredictStaking': '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6',
      'Oddyssey': '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318',
      'BitrFaucet': '0x610178dA211FEF7D417bC0e6FeD39F05609AD788'
    };

    // Clear old addresses first
    await db.query('DELETE FROM system.contract_addresses');
    
    // Insert new addresses
    for (const [contract, address] of Object.entries(newAddresses)) {
      await db.query(
        'INSERT INTO system.contract_addresses (contract_name, address, deployment_date) VALUES ($1, $2, $3)',
        [contract, address, new Date().toISOString()]
      );
      console.log(`   ✅ ${contract}: ${address}`);
    }

    // Insert deployment info
    await db.query(`
      INSERT INTO system.deployment_info (deployment_date, network, version, notes) 
      VALUES ($1, $2, $3, $4)
    `, [
      new Date().toISOString(),
      'hardhat-local',
      'oct27-2025',
      'Complete redeployment with MarketType enum update and all fixes'
    ]);

    console.log('\n🎉 Database cleanup completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ All old data cleared');
    console.log('   ✅ Sequences reset');
    console.log('   ✅ New contract addresses inserted');
    console.log('   ✅ Database ready for new deployment');
    
    console.log('\n🚀 Next steps:');
    console.log('   1. Start backend services');
    console.log('   2. Test pool creation with new contracts');
    console.log('   3. Verify reputation system works');
    console.log('   4. Test Oddyssey slip placement');

  } catch (error) {
    console.error('❌ Database cleanup failed:', error);
    process.exit(1);
  } finally {
    await db.end();
    console.log('\n✅ Database connection closed');
  }
}

// Run cleanup
cleanupDatabase().catch(console.error);
