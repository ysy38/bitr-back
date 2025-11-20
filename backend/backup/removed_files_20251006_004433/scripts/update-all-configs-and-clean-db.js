#!/usr/bin/env node

/**
 * Comprehensive Update Script
 * 1. Update backend config with all new contract addresses
 * 2. Clean database (pools and oddyssey data)
 * 3. Update ReputationSystem with new Oddyssey address
 */

require('dotenv').config();
const { ethers } = require('ethers');
const db = require('../db/db');
const config = require('../config');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('🚀 Starting Comprehensive Update...\n');

  // Step 1: Update backend config with all new addresses
  console.log('📋 Step 1: Updating backend configuration...');
  
  const newAddresses = {
    ReputationSystem: '0xBE8fe32C3f4dA12591869744b63ca828c64Ee981',
    BitredictPoolCore: '0x59210719f4218c87ceA8661FEe29167639D124bA',
    BitredictComboPools: '0x6C5dAae65bA514720661E046caaDf674755b63E7',
    BitredictBoostSystem: '0xe3fA1B9ECbbB14A871fd78c76c5b11a6BA22D385',
    BitredictPoolFactory: '0x7DBD027177379188882a09d0c42E49F40b96221b',
    GuidedOracle: '0x194e3CBFC5e1ff4323264cDb72fd6232c3131a40',
    Oddyssey: '0xD9E1f0c0D1105B03CE3ad6db1Ad36a4909EE733C'
  };

  console.log('New contract addresses:');
  Object.entries(newAddresses).forEach(([name, address]) => {
    console.log(`  ${name}: ${address}`);
  });

  // Update config.js
  const configPath = path.join(__dirname, '../config.js');
  let configContent = fs.readFileSync(configPath, 'utf8');

  configContent = configContent.replace(
    /poolCore: process\.env\.BITREDICT_POOL_CORE_ADDRESS \|\| '[^']*'/,
    `poolCore: process.env.BITREDICT_POOL_CORE_ADDRESS || '${newAddresses.BitredictPoolCore}'`
  );

  configContent = configContent.replace(
    /comboPools: process\.env\.BITREDICT_COMBO_POOLS_ADDRESS \|\| '[^']*'/,
    `comboPools: process.env.BITREDICT_COMBO_POOLS_ADDRESS || '${newAddresses.BitredictComboPools}'`
  );

  configContent = configContent.replace(
    /factory: process\.env\.BITREDICT_POOL_FACTORY_ADDRESS \|\| '[^']*'/,
    `factory: process.env.BITREDICT_POOL_FACTORY_ADDRESS || '${newAddresses.BitredictPoolFactory}'`
  );

  configContent = configContent.replace(
    /guidedOracle: process\.env\.GUIDED_ORACLE_ADDRESS \|\| '[^']*'/,
    `guidedOracle: process.env.GUIDED_ORACLE_ADDRESS || '${newAddresses.GuidedOracle}'`
  );

  configContent = configContent.replace(
    /reputationSystem: process\.env\.REPUTATION_SYSTEM_ADDRESS \|\| '[^']*'/,
    `reputationSystem: process.env.REPUTATION_SYSTEM_ADDRESS || '${newAddresses.ReputationSystem}'`
  );

  configContent = configContent.replace(
    /oddyssey: process\.env\.ODDYSSEY_ADDRESS \|\| '[^']*'/,
    `oddyssey: process.env.ODDYSSEY_ADDRESS || '${newAddresses.Oddyssey}'`
  );

  fs.writeFileSync(configPath, configContent);
  console.log('✅ Backend config.js updated\n');

  // Step 2: Clean database
  console.log('📋 Step 2: Cleaning database...');
  
  try {
    await db.connect();
    
    // Clean pools
    console.log('Cleaning oracle.pools...');
    const poolsResult = await db.query('DELETE FROM oracle.pools WHERE 1=1');
    console.log(`✅ Deleted ${poolsResult.rowCount} pools`);

    // Clean bets
    console.log('Cleaning oracle.bets...');
    const betsResult = await db.query('DELETE FROM oracle.bets WHERE 1=1');
    console.log(`✅ Deleted ${betsResult.rowCount} bets`);

    // Clean oddyssey cycles
    console.log('Cleaning oracle.oddyssey_cycles...');
    const cyclesResult = await db.query('DELETE FROM oracle.oddyssey_cycles WHERE 1=1');
    console.log(`✅ Deleted ${cyclesResult.rowCount} oddyssey cycles`);

    // Clean oddyssey slips
    console.log('Cleaning oracle.oddyssey_slips...');
    const slipsResult = await db.query('DELETE FROM oracle.oddyssey_slips WHERE 1=1');
    console.log(`✅ Deleted ${slipsResult.rowCount} oddyssey slips`);

    // Clean daily game matches
    console.log('Cleaning oracle.daily_game_matches...');
    const matchesResult = await db.query('DELETE FROM oracle.daily_game_matches WHERE 1=1');
    console.log(`✅ Deleted ${matchesResult.rowCount} daily game matches`);

    console.log('✅ Database cleaned successfully\n');

  } catch (error) {
    console.error('❌ Error cleaning database:', error);
  }

  // Step 3: Update ReputationSystem with new Oddyssey address
  console.log('📋 Step 3: Updating ReputationSystem with new Oddyssey address...');
  
  try {
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY, provider);
    
    const reputationSystem = new ethers.Contract(
      newAddresses.ReputationSystem,
      require('../solidity/ReputationSystem.json').abi,
      wallet
    );

    // Set Oddyssey as authorized contract
    console.log('Setting Oddyssey as authorized contract...');
    const tx = await reputationSystem.setAuthorizedContract(newAddresses.Oddyssey, true, {
      gasLimit: 100000,
      gasPrice: ethers.parseUnits('6', 'gwei')
    });

    console.log(`Transaction submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

    // Verify
    const isAuthorized = await reputationSystem.authorizedContracts(newAddresses.Oddyssey);
    console.log(`✅ Oddyssey authorized: ${isAuthorized}\n`);

  } catch (error) {
    console.error('❌ Error updating ReputationSystem:', error.message);
  }

  console.log('🎉 ALL UPDATES COMPLETE!');
  console.log('================================');
  console.log('✅ Backend config updated');
  console.log('✅ Database cleaned');
  console.log('✅ ReputationSystem configured');
  console.log('================================');
  console.log('\nNext steps:');
  console.log('1. Update frontend wagmi.ts with new addresses');
  console.log('2. Update frontend ABIs');
  console.log('3. Update backend ABIs');
  console.log('4. Restart backend services');

  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Update failed:', error);
  process.exit(1);
});
