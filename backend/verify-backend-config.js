#!/usr/bin/env node

/**
 * Backend Deployment Verification
 * Verifies that the backend is properly configured for the new contract architecture
 */

const config = require('./config');
const fs = require('fs');

console.log('🔍 Verifying Backend Configuration...');

// Check contract addresses
const requiredAddresses = [
  'poolCore',
  'boostSystem', 
  'comboPools',
  'guidedOracle',
  'oddyssey',
  'reputationSystem',
  'factory'
];

console.log('📋 Contract Addresses:');
let allAddressesPresent = true;
for (const address of requiredAddresses) {
  const addr = config.blockchain.contractAddresses[address];
  if (addr && addr !== '0x0000000000000000000000000000000000000000') {
    console.log(`✅ ${address}: ${addr}`);
  } else {
    console.log(`❌ ${address}: Not configured`);
    allAddressesPresent = false;
  }
}

// Check ABI files
const requiredABIs = [
  'solidity/BitredictPoolCore.json',
  'solidity/BitredictBoostSystem.json',
  'solidity/BitredictComboPools.json',
  'solidity/BitredictPoolFactory.json',
  'solidity/GuidedOracle.json',
  'solidity/Oddyssey.json',
  'solidity/ReputationSystem.json'
];

console.log('\n📋 ABI Files:');
let allABIsPresent = true;
for (const abiFile of requiredABIs) {
  if (fs.existsSync(abiFile)) {
    console.log(`✅ ${abiFile}`);
  } else {
    console.log(`❌ ${abiFile}: Missing`);
    allABIsPresent = false;
  }
}

// Check environment variables
console.log('\n📋 Environment Variables:');
const requiredEnvVars = [
  'RPC_URL',
  'DATABASE_URL',
  'ORACLE_PRIVATE_KEY'
];

let allEnvVarsPresent = true;
for (const envVar of requiredEnvVars) {
  if (process.env[envVar]) {
    console.log(`✅ ${envVar}: Set`);
  } else {
    console.log(`❌ ${envVar}: Not set`);
    allEnvVarsPresent = false;
  }
}

// Final status
console.log('\n🎯 Verification Summary:');
if (allAddressesPresent && allABIsPresent && allEnvVarsPresent) {
  console.log('✅ Backend is properly configured for new contract architecture!');
  process.exit(0);
} else {
  console.log('❌ Backend configuration needs attention.');
  process.exit(1);
}
