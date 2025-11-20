#!/usr/bin/env node

/**
 * Verify Contract Deployment
 * 
 * This script verifies the contract is deployed and has the expected interface
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function verifyContract() {
  console.log('🔍 Verifying Contract Deployment...');
  
  try {
    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://dream-rpc.somnia.network/');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log(`Wallet: ${wallet.address}`);
    console.log(`PoolCore Address: ${process.env.BITREDICT_POOL_ADDRESS}`);
    
    // Check if contract exists
    const code = await provider.getCode(process.env.BITREDICT_POOL_ADDRESS);
    if (code === '0x') {
      console.log('❌ No contract deployed at this address');
      return;
    }
    console.log(`✅ Contract deployed (code length: ${code.length})`);
    
    // Load contract ABI
    const PoolCoreABI = require('../../solidity/artifacts/contracts/PoolCore.sol/PoolCore.json').abi;
    
    // Initialize contract
    const bitredictPool = new ethers.Contract(process.env.BITREDICT_POOL_ADDRESS, PoolCoreABI, wallet);
    
    console.log('\n📋 Testing Contract Interface:');
    
    // Test basic functions
    try {
      const poolCount = await bitredictPool.poolCount();
      console.log(`✅ poolCount(): ${poolCount}`);
    } catch (e) {
      console.log(`❌ poolCount() failed: ${e.message}`);
    }
    
    try {
      const creationFee = await bitredictPool.creationFee();
      console.log(`✅ creationFee(): ${ethers.formatEther(creationFee)}`);
    } catch (e) {
      console.log(`❌ creationFee() failed: ${e.message}`);
    }
    
    try {
      const minPoolStake = await bitredictPool.minPoolStake();
      console.log(`✅ minPoolStake(): ${ethers.formatEther(minPoolStake)}`);
    } catch (e) {
      console.log(`❌ minPoolStake() failed: ${e.message}`);
    }
    
    try {
      const bitrToken = await bitredictPool.bitrToken();
      console.log(`✅ bitrToken(): ${bitrToken}`);
    } catch (e) {
      console.log(`❌ bitrToken() failed: ${e.message}`);
    }
    
    try {
      const guidedOracle = await bitredictPool.guidedOracle();
      console.log(`✅ guidedOracle(): ${guidedOracle}`);
    } catch (e) {
      console.log(`❌ guidedOracle() failed: ${e.message}`);
    }
    
    try {
      const optimisticOracle = await bitredictPool.optimisticOracle();
      console.log(`✅ optimisticOracle(): ${optimisticOracle}`);
    } catch (e) {
      console.log(`❌ optimisticOracle() failed: ${e.message}`);
    }
    
    // Test if createPool function exists
    console.log('\n🔧 Testing createPool function:');
    
    const createPoolFunction = PoolCoreABI.find(item => 
      item.type === 'function' && item.name === 'createPool'
    );
    
    if (createPoolFunction) {
      console.log('✅ createPool function found in ABI');
      console.log(`   Inputs: ${createPoolFunction.inputs.length} parameters`);
      createPoolFunction.inputs.forEach((input, index) => {
        console.log(`   ${index}: ${input.name} (${input.type})`);
      });
    } else {
      console.log('❌ createPool function not found in ABI');
    }
    
    // Test function encoding
    console.log('\n🔧 Testing function encoding:');
    
    const testParams = {
      predictedOutcome: ethers.encodeBytes32String("YES"),
      odds: 150,
      creatorStake: ethers.parseEther("20"),
      eventStartTime: Math.floor(Date.now() / 1000) + 120,
      eventEndTime: Math.floor(Date.now() / 1000) + 1800,
      league: "Test League",
      category: "test",
      region: "Test",
      isPrivate: false,
      maxBetPerUser: ethers.parseEther("100"),
      useBitr: true,
      oracleType: 0,
      marketId: ethers.encodeBytes32String("TEST_MARKET")
    };
    
    try {
      const encodedData = bitredictPool.interface.encodeFunctionData('createPool', [
        testParams.predictedOutcome,
        testParams.odds,
        testParams.creatorStake,
        testParams.eventStartTime,
        testParams.eventEndTime,
        testParams.league,
        testParams.category,
        testParams.region,
        testParams.isPrivate,
        testParams.maxBetPerUser,
        testParams.useBitr,
        testParams.oracleType,
        testParams.marketId
      ]);
      
      console.log(`✅ Function encoding successful`);
      console.log(`   Encoded data length: ${encodedData.length}`);
      console.log(`   Function selector: ${encodedData.substring(0, 10)}`);
      
      // Test a simple call to see if the function exists on the contract
      console.log('\n🔧 Testing function existence on contract:');
      
      try {
        // Try to call the function with a static call to see if it exists
        const result = await bitredictPool.createPool.staticCall(
          testParams.predictedOutcome,
          testParams.odds,
          testParams.creatorStake,
          testParams.eventStartTime,
          testParams.eventEndTime,
          testParams.league,
          testParams.category,
          testParams.region,
          testParams.isPrivate,
          testParams.maxBetPerUser,
          testParams.useBitr,
          testParams.oracleType,
          testParams.marketId
        );
        console.log('✅ Function exists and can be called');
      } catch (e) {
        console.log(`❌ Function call failed: ${e.message}`);
        console.log('This might indicate the contract at this address is not the expected PoolCore contract');
      }
      
    } catch (e) {
      console.log(`❌ Function encoding failed: ${e.message}`);
    }
    
  } catch (error) {
    console.error('❌ Verification error:', error.message);
  }
}

verifyContract();
