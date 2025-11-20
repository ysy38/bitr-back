const { ethers } = require('ethers');
const config = require('../config');

async function checkOddysseyReputationConfig() {
  try {
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const wallet = new ethers.Wallet(config.blockchain.privateKey, provider);
    
    const ODDYSSEY_ADDRESS = config.blockchain.contractAddresses.oddyssey;
    const REPUTATION_SYSTEM_ADDRESS = config.blockchain.contractAddresses.reputationSystem;
    
    console.log('🔍 Checking Oddyssey-ReputationSystem Configuration');
    console.log('');
    console.log('📊 Addresses:');
    console.log(`   Oddyssey: ${ODDYSSEY_ADDRESS}`);
    console.log(`   ReputationSystem: ${REPUTATION_SYSTEM_ADDRESS}`);
    console.log('');
    
    // Oddyssey ABI (minimal for checking)
    const OddysseyABI = [
      "function reputationSystem() external view returns (address)",
      "function setReputationSystem(address _reputationSystem) external",
      "function owner() external view returns (address)"
    ];
    
    // ReputationSystem ABI (minimal for checking)
    const ReputationSystemABI = [
      "function authorizedContracts(address) external view returns (bool)",
      "function setAuthorizedContract(address contractAddr, bool authorized) external",
      "function owner() external view returns (address)"
    ];
    
    const oddyssey = new ethers.Contract(ODDYSSEY_ADDRESS, OddysseyABI, wallet);
    const reputationSystem = new ethers.Contract(REPUTATION_SYSTEM_ADDRESS, ReputationSystemABI, wallet);
    
    // Check 1: Does Oddyssey have ReputationSystem address set?
    console.log('✅ Check 1: Oddyssey → ReputationSystem');
    const oddysseyReputationSystem = await oddyssey.reputationSystem();
    console.log(`   Current value: ${oddysseyReputationSystem}`);
    
    if (oddysseyReputationSystem.toLowerCase() === REPUTATION_SYSTEM_ADDRESS.toLowerCase()) {
      console.log('   ✅ CORRECT: Oddyssey is configured with ReputationSystem');
    } else {
      console.log('   ❌ MISMATCH: Oddyssey is NOT configured correctly!');
      console.log(`   Expected: ${REPUTATION_SYSTEM_ADDRESS}`);
      console.log(`   Actual: ${oddysseyReputationSystem}`);
      console.log('');
      console.log('   🔧 Fix: Call oddyssey.setReputationSystem(ReputationSystem)');
    }
    console.log('');
    
    // Check 2: Is Oddyssey authorized in ReputationSystem?
    console.log('✅ Check 2: ReputationSystem → Oddyssey Authorization');
    const isOddysseyAuthorized = await reputationSystem.authorizedContracts(ODDYSSEY_ADDRESS);
    console.log(`   Current value: ${isOddysseyAuthorized}`);
    
    if (isOddysseyAuthorized) {
      console.log('   ✅ CORRECT: Oddyssey is authorized in ReputationSystem');
    } else {
      console.log('   ❌ NOT AUTHORIZED: Oddyssey is NOT authorized in ReputationSystem!');
      console.log('');
      console.log('   🔧 Fix: Call reputationSystem.setAuthorizedContract(Oddyssey, true)');
    }
    console.log('');
    
    // Summary
    const oddysseyConfigured = oddysseyReputationSystem.toLowerCase() === REPUTATION_SYSTEM_ADDRESS.toLowerCase();
    const reputationSystemAuthorized = isOddysseyAuthorized;
    
    console.log('📋 Configuration Summary:');
    console.log(`   Oddyssey → ReputationSystem: ${oddysseyConfigured ? '✅ OK' : '❌ NEEDS FIX'}`);
    console.log(`   ReputationSystem → Oddyssey: ${reputationSystemAuthorized ? '✅ OK' : '❌ NEEDS FIX'}`);
    console.log('');
    
    if (oddysseyConfigured && reputationSystemAuthorized) {
      console.log('✅ All configurations are correct!');
      process.exit(0);
    } else {
      console.log('❌ Configuration issues detected!');
      console.log('');
      console.log('🔧 To fix, run:');
      if (!oddysseyConfigured) {
        console.log(`   oddyssey.setReputationSystem('${REPUTATION_SYSTEM_ADDRESS}')`);
      }
      if (!reputationSystemAuthorized) {
        console.log(`   reputationSystem.setAuthorizedContract('${ODDYSSEY_ADDRESS}', true)`);
      }
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

checkOddysseyReputationConfig();

