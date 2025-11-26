/**
 * Test Oddyssey Contract Method Availability
 */

const Web3Service = require('../services/web3-service');

async function testContractMethods() {
  const web3Service = new Web3Service();
  
  try {
    console.log('🔍 Testing Oddyssey Contract Methods...\n');
    
    await web3Service.initialize();
    const contract = await web3Service.getOddysseyContract();
    
    console.log('Contract address:', contract.target || contract.address);
    console.log('Contract has wallet?', contract.runner !== null);
    
    // Check if evaluateSlip exists
    console.log('\n📊 Checking evaluateSlip method:');
    console.log('  typeof contract.evaluateSlip:', typeof contract.evaluateSlip);
    console.log('  contract.evaluateSlip:', contract.evaluateSlip);
    
    if (contract.evaluateSlip) {
      console.log('  ✅ evaluateSlip method exists');
      console.log('  Function details:', contract.evaluateSlip.fragment);
    } else {
      console.log('  ❌ evaluateSlip method does NOT exist!');
      console.log('\n📋 Available methods:');
      const methods = Object.keys(contract).filter(k => typeof contract[k] === 'function' && !k.startsWith('_'));
      methods.slice(0, 20).forEach(m => console.log(`    - ${m}`));
      if (methods.length > 20) {
        console.log(`    ... and ${methods.length - 20} more`);
      }
    }
    
    // Try to call the method with test parameters
    if (contract.evaluateSlip) {
      console.log('\n🔧 Testing method call encoding:');
      try {
        // Get the encoded function data without sending transaction
        const iface = contract.interface;
        const encoded = iface.encodeFunctionData('evaluateSlip', [6]);
        console.log('  ✅ Function encodes correctly');
        console.log('  Encoded data:', encoded);
        console.log('  Data length:', encoded.length, 'chars');
      } catch (error) {
        console.log('  ❌ Function encoding failed:', error.message);
      }
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testContractMethods();

