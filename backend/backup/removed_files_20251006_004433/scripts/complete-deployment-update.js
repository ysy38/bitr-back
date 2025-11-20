#!/usr/bin/env node

/**
 * Complete Deployment Update
 * Handles all post-deployment tasks
 */

require('dotenv').config();
const { ethers } = require('ethers');
const db = require('../db/db');
const config = require('../config');
const fs = require('fs');
const path = require('path');

const NEW_ADDRESSES = {
  ReputationSystem: '0xBE8fe32C3f4dA12591869744b63ca828c64Ee981',
  BitredictPoolCore: '0x59210719f4218c87ceA8661FEe29167639D124bA',
  BitredictComboPools: '0x6C5dAae65bA514720661E046caaDf674755b63E7',
  BitredictBoostSystem: '0xe3fA1B9ECbbB14A871fd78c76c5b11a6BA22D385',
  BitredictPoolFactory: '0x7DBD027177379188882a09d0c42E49F40b96221b',
  GuidedOracle: '0x194e3CBFC5e1ff4323264cDb72fd6232c3131a40',
  Oddyssey: '0xD9E1f0c0D1105B03CE3ad6db1Ad36a4909EE733C'
};

async function cleanDatabase() {
  console.log('\\n🗑️  CLEANING DATABASE...');
  
  try {
    await db.connect();
    
    const tables = [
      { name: 'pools', description: 'Prediction pools' },
      { name: 'oddyssey_cycles', description: 'Oddyssey cycles' },
      { name: 'oddyssey_slips', description: 'Oddyssey slips' },
      { name: 'daily_game_matches', description: 'Daily game matches' },
      { name: 'oddyssey_prize_claims', description: 'Prize claims' },
      { name: 'oddyssey_prize_rollovers', description: 'Prize rollovers' }
    ];

    for (const table of tables) {
      try {
        const result = await db.query(`DELETE FROM oracle.${table.name}`);
        console.log(`  ✅ Cleaned ${table.description}: ${result.rowCount} rows deleted`);
      } catch (error) {
        console.log(`  ⚠️  Table oracle.${table.name} might not exist or is empty`);
      }
    }

    console.log('✅ Database cleaned successfully');
    return true;

  } catch (error) {
    console.error('❌ Error cleaning database:', error.message);
    return false;
  }
}

async function updateReputationSystem() {
  console.log('\\n⚙️  UPDATING REPUTATION SYSTEM...');
  
  try {
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY, provider);
    
    const reputationABI = require('../../solidity/artifacts/contracts/ReputationSystem.sol/ReputationSystem.json').abi;
    
    const reputationSystem = new ethers.Contract(
      NEW_ADDRESSES.ReputationSystem,
      reputationABI,
      wallet
    );

    // Set Oddyssey as authorized contract
    console.log('  Setting Oddyssey as authorized contract...');
    const tx = await reputationSystem.setAuthorizedContract(NEW_ADDRESSES.Oddyssey, true, {
      gasLimit: 150000,
      gasPrice: ethers.parseUnits('6', 'gwei')
    });

    console.log(`  Transaction: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✅ Oddyssey authorized in block ${receipt.blockNumber}`);

    return true;

  } catch (error) {
    console.error('❌ Error updating ReputationSystem:', error.message);
    return false;
  }
}

async function updateBackendABIs() {
  console.log('\\n📦 UPDATING BACKEND ABIs...');
  
  const contracts = [
    'ReputationSystem',
    'BitredictPoolCore',
    'BitredictComboPools',
    'BitredictBoostSystem',
    'BitredictPoolFactory',
    'GuidedOracle',
    'Oddyssey'
  ];

  const backendABIDir = path.join(__dirname, '../solidity');
  fs.mkdirSync(backendABIDir, { recursive: true });

  for (const contractName of contracts) {
    const sourcePath = path.join(__dirname, `../../solidity/artifacts/contracts/${contractName}.sol/${contractName}.json`);
    const destPath = path.join(backendABIDir, `${contractName}.json`);

    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`  ✅ ${contractName}.json`);
    } else {
      console.log(`  ⚠️  ${contractName}.json not found`);
    }
  }

  console.log('✅ Backend ABIs updated');
  return true;
}

async function main() {
  console.log('🚀 COMPLETE DEPLOYMENT UPDATE');
  console.log('='.repeat(60));
  
  console.log('\n📋 NEW CONTRACT ADDRESSES:');
  Object.entries(NEW_ADDRESSES).forEach(([name, address]) => {
    console.log(`  ${name.padEnd(25)}: ${address}`);
  });

  // Step 1: Clean database
  await cleanDatabase();

  // Step 2: Update ReputationSystem
  await updateReputationSystem();

  // Step 3: Update backend ABIs
  await updateBackendABIs();

  console.log('\n' + '='.repeat(60));
  console.log('🎉 BACKEND UPDATE COMPLETE!');
  console.log('='.repeat(60));
  
  console.log('\n📋 NEXT STEPS:');
  console.log('1. Update frontend wagmi.ts with new addresses');
  console.log('2. Update frontend ABIs');
  console.log('3. Restart backend services');
  console.log('4. Test pool creation');
  console.log('5. Test Oddyssey cycle creation');

  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Update failed:', error);
  process.exit(1);
});
