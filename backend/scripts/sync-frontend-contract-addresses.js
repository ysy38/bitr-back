const fs = require('fs');
const path = require('path');

/**
 * Sync Frontend Contract Addresses
 * 
 * This script updates the frontend .env.local file to match
 * the backend contract addresses from .env
 */

console.log('🔄 Syncing frontend contract addresses with backend...\n');

// Read backend .env file
const backendEnvPath = path.join(__dirname, '../.env');
const frontendEnvPath = '/home/leon/predict-linux/.env.local';

if (!fs.existsSync(backendEnvPath)) {
  console.error('❌ Backend .env file not found:', backendEnvPath);
  process.exit(1);
}

if (!fs.existsSync(frontendEnvPath)) {
  console.error('❌ Frontend .env.local file not found:', frontendEnvPath);
  process.exit(1);
}

// Read backend env
const backendEnv = fs.readFileSync(backendEnvPath, 'utf8');
const frontendEnv = fs.readFileSync(frontendEnvPath, 'utf8');

// Extract contract addresses from backend
const contractAddresses = {};
const backendLines = backendEnv.split('\n');

backendLines.forEach(line => {
  if (line.includes('_ADDRESS=') && line.startsWith('#') === false) {
    const [key, value] = line.split('=');
    if (key && value && value.startsWith('0x')) {
      // Convert backend env key to frontend format
      const frontendKey = `NEXT_PUBLIC_${key}`;
      contractAddresses[frontendKey] = value;
    }
  }
});

console.log('📋 Contract addresses from backend:');
Object.entries(contractAddresses).forEach(([key, value]) => {
  console.log(`   ${key}=${value}`);
});

// Update frontend env
let updatedFrontendEnv = frontendEnv;
let changesCount = 0;

Object.entries(contractAddresses).forEach(([frontendKey, backendValue]) => {
  const regex = new RegExp(`^${frontendKey}=.*$`, 'm');
  
  if (regex.test(updatedFrontendEnv)) {
    // Replace existing value
    const oldMatch = updatedFrontendEnv.match(regex);
    if (oldMatch && oldMatch[0] !== `${frontendKey}=${backendValue}`) {
      console.log(`🔄 Updating ${frontendKey}:`);
      console.log(`   Old: ${oldMatch[0]}`);
      console.log(`   New: ${frontendKey}=${backendValue}`);
      updatedFrontendEnv = updatedFrontendEnv.replace(regex, `${frontendKey}=${backendValue}`);
      changesCount++;
    }
  } else {
    // Add new value
    console.log(`➕ Adding ${frontendKey}=${backendValue}`);
    updatedFrontendEnv += `\n${frontendKey}=${backendValue}`;
    changesCount++;
  }
});

if (changesCount > 0) {
  // Write updated frontend env
  fs.writeFileSync(frontendEnvPath, updatedFrontendEnv);
  console.log(`\n✅ Updated ${changesCount} contract addresses in frontend .env.local`);
  
  // Show the critical update
  console.log('\n🎯 CRITICAL UPDATE:');
  console.log('   Frontend Oddyssey address updated to match backend');
  console.log('   This should fix the "no active matches" error');
  
  console.log('\n📋 Next steps:');
  console.log('   1. Restart the frontend development server');
  console.log('   2. Clear browser cache/localStorage');
  console.log('   3. Test Oddyssey slip submission');
  
} else {
  console.log('\n✅ All contract addresses are already in sync');
}

console.log('\n🎉 Contract address sync completed!');


