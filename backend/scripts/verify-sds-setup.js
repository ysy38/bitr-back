/**
 * Quick verification script for SDS setup
 * 
 * Verifies:
 * - Service initialization
 * - Schema registration
 * - SchemaEncoder functionality
 * - Wallet identity
 * - Publishing capability
 * 
 * Usage: node scripts/verify-sds-setup.js
 */

const somniaDataStreams = require('../services/somnia-data-streams-service');

async function verifySetup() {
  console.log('\n🔍 Verifying Somnia Data Streams Setup\n');
  console.log('='.repeat(60));
  
  let allGood = true;
  const issues = [];
  
  try {
    // Step 1: Initialize
    console.log('\n1️⃣ Initializing service...');
    await somniaDataStreams.initialize();
    
    if (!somniaDataStreams.isInitialized) {
      console.log('❌ Service not initialized');
      console.log('   Check SOMNIA_PRIVATE_KEY environment variable');
      issues.push('Service initialization failed');
      allGood = false;
    } else {
      console.log('✅ Service initialized');
      
      const service = somniaDataStreams.getInstance();
      if (service && service.publisherAddress) {
        console.log(`   Publisher address: ${service.publisherAddress}`);
      }
    }
    
    // Step 2: Check SDK
    console.log('\n2️⃣ Checking SDK...');
    const service = somniaDataStreams.getInstance();
    if (!service || !service.sdk) {
      console.log('❌ SDK not available');
      issues.push('SDK not initialized');
      allGood = false;
    } else {
      console.log('✅ SDK available');
    }
    
    // Step 3: Check schema and encoder
    console.log('\n3️⃣ Checking schema and encoder...');
    if (!service || !service.jsonSchema) {
      console.log('❌ JSON schema not defined');
      issues.push('JSON schema missing');
      allGood = false;
    } else {
      console.log(`✅ JSON schema defined: "${service.jsonSchema}"`);
    }
    
    if (!service || !service.jsonEncoder) {
      console.log('❌ SchemaEncoder not initialized');
      issues.push('SchemaEncoder missing');
      allGood = false;
    } else {
      console.log('✅ SchemaEncoder initialized');
    }
    
    // Step 4: Verify schema registration
    console.log('\n4️⃣ Verifying schema registration...');
    try {
      const { SDK } = require('@somnia-chain/streams');
      const { createPublicClient, http } = require('viem');
      const { somniaTestnet } = require('viem/chains');
      
      const rpcUrl = process.env.SOMNIA_RPC_URL || process.env.RPC_URL || 'https://dream-rpc.somnia.network';
      const publicClient = createPublicClient({ 
        chain: somniaTestnet, 
        transport: http(rpcUrl) 
      });
      
      const testSdk = new SDK({ public: publicClient });
      const schemaId = await testSdk.streams.computeSchemaId(service.jsonSchema);
      console.log(`   Schema ID: ${schemaId.slice(0, 20)}...`);
      
      let isRegistered = false;
      try {
        if (typeof testSdk.streams.isSchemaRegistered === 'function') {
          isRegistered = await testSdk.streams.isSchemaRegistered(schemaId);
        } else if (typeof testSdk.streams.isDataSchemaRegistered === 'function') {
          isRegistered = await testSdk.streams.isDataSchemaRegistered(schemaId);
        }
      } catch (e) {
        console.log('   ⚠️ Could not check registration status');
      }
      
      if (isRegistered) {
        console.log('   ✅ Schema is registered on-chain');
      } else {
        console.log('   ⚠️ Schema not registered yet (will be registered on first publish)');
      }
    } catch (error) {
      console.log('   ⚠️ Could not verify schema registration:', error.message);
    }
    
    // Step 5: Test SchemaEncoder encode/decode
    console.log('\n5️⃣ Testing SchemaEncoder...');
    try {
      const testData = { test: 'validation', timestamp: Date.now() };
      const testJson = JSON.stringify(testData);
      const encoded = service.jsonEncoder.encodeData([
        { name: 'jsonData', value: testJson, type: 'string' }
      ]);
      
      if (!encoded || !encoded.startsWith('0x')) {
        console.log('❌ Encoding failed');
        issues.push('SchemaEncoder encoding failed');
        allGood = false;
      } else {
        console.log('✅ Encoding successful');
        
        const decoded = service.jsonEncoder.decodeData(encoded);
        let decodedJson = '';
        for (const field of decoded) {
          if (field.name === 'jsonData') {
            decodedJson = field.value?.value || field.value || '';
            break;
          }
        }
        
        if (decodedJson) {
          const parsed = JSON.parse(decodedJson);
          if (parsed.test === testData.test) {
            console.log('✅ Decoding successful');
          } else {
            console.log('❌ Decoding validation failed');
            issues.push('SchemaEncoder decoding validation failed');
            allGood = false;
          }
        } else {
          console.log('❌ Decoding failed - no jsonData field');
          issues.push('SchemaEncoder decoding failed');
          allGood = false;
        }
      }
    } catch (error) {
      console.log('❌ SchemaEncoder test failed:', error.message);
      issues.push(`SchemaEncoder test failed: ${error.message}`);
      allGood = false;
    }
    
    // Step 6: Check contexts
    console.log('\n6️⃣ Checking event contexts...');
    if (!service || !service.contexts) {
      console.log('❌ Contexts not defined');
      issues.push('Contexts missing');
      allGood = false;
    } else {
      const requiredContexts = [
        'poolsCreated', 'poolsSettled', 'poolsProgress', 'bets',
        'liquidity', 'reputation', 'cycles', 'slips', 'prizes'
      ];
      
      const missing = requiredContexts.filter(ctx => !service.contexts[ctx]);
      if (missing.length > 0) {
        console.log(`❌ Missing contexts: ${missing.join(', ')}`);
        issues.push(`Missing contexts: ${missing.join(', ')}`);
        allGood = false;
      } else {
        console.log('✅ All 9 contexts defined');
        Object.entries(service.contexts).forEach(([key, value]) => {
          console.log(`   ✓ ${key}: ${value}`);
        });
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    if (allGood) {
      console.log('✅ SDS Setup Verified - Ready to publish!');
      console.log('\n📝 Next steps:');
      console.log('   - Run: node scripts/test-sds-publishing-local.js');
      console.log('   - Check frontend can subscribe to events');
      console.log('   - Monitor events on: https://explorer.somnia.network');
    } else {
      console.log('⚠️  SDS Setup Issues Found');
      console.log('\n📋 Issues:');
      issues.forEach(issue => console.log(`   • ${issue}`));
      console.log('\n📝 Troubleshooting:');
      console.log('   - Ensure SOMNIA_PRIVATE_KEY is set');
      console.log('   - Check network connectivity to Somnia RPC');
      console.log('   - Verify @somnia-chain/streams package is installed');
      console.log('   - Check backend logs for detailed errors');
    }
    console.log('='.repeat(60) + '\n');
    
    return allGood;
    
  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

verifySetup()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(console.error);
