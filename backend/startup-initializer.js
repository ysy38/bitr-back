#!/usr/bin/env node

/**
 * Backend Startup Initializer
 * Initializes all necessary services and checks system health
 */

require('dotenv').config();
const { scanForIssues } = require('./scan-missing-files');

async function initializeBackend() {
  console.log('🚀 Initializing Backend...');
  
  try {
    // Scan for missing files and issues
    console.log('🔍 Running system health check...');
    const scanResult = scanForIssues();
    
    if (scanResult.totalIssues > 0) {
      console.log(`⚠️  Found ${scanResult.totalIssues} issues. Please fix them before starting.`);
      process.exit(1);
    }
    
    console.log('✅ System health check passed');
    
    // Test database connection
    console.log('🗄️ Testing database connection...');
    const db = require('./db/db');
    await db.query('SELECT NOW()');
    console.log('✅ Database connection successful');
    
    // Test blockchain connection
    console.log('⛓️ Testing blockchain connection...');
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const blockNumber = await provider.getBlockNumber();
    console.log(`✅ Blockchain connection successful (block: ${blockNumber})`);
    
    // Test contract connection
    console.log('📋 Testing contract connections...');
    const path = require('path');
    
    // Try multiple possible paths for the ABI (Docker container paths)
    const possiblePaths = [
      './solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json',
      '../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json',
      '../../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json',
      path.join(__dirname, '../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json'),
      path.join(__dirname, '../../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json')
    ];
    
    let abi = null;
    for (const abiPath of possiblePaths) {
      try {
        abi = require(abiPath).abi;
        console.log(`✅ Oddyssey ABI loaded from: ${abiPath}`);
        break;
      } catch (pathError) {
        // Continue to next path
      }
    }
    
    if (!abi) {
      throw new Error('Could not load Oddyssey ABI from any path');
    }
    const config = require('./config');
    const contract = new ethers.Contract(config.blockchain.contractAddresses.oddyssey, abi, provider);
    const currentCycle = await contract.dailyCycleId();
    console.log(`✅ Contract connection successful (current cycle: ${currentCycle})`);
    
    console.log('🎉 Backend initialization completed successfully!');
    console.log('📋 Next steps:');
    console.log('  1. Start the main server: npm start');
    console.log('  2. Start background workers: npm run workers');
    console.log('  3. Monitor logs for any issues');
    
  } catch (error) {
    console.error('❌ Backend initialization failed:', error.message);
    process.exit(1);
  }
}

// Run initialization
if (require.main === module) {
  initializeBackend();
}

module.exports = { initializeBackend };
