#!/usr/bin/env node

/**
 * Wait and Resolve Pool 3
 * 
 * Waits for Pool 3 event to end and then resolves it
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function waitAndResolvePool3() {
  console.log('⏰ Waiting for Pool 3 event to end...');
  
  try {
    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://dream-rpc.somnia.network/');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log(`Wallet: ${wallet.address}`);
    
    // Load contract ABIs
    const PoolCoreABI = require('../../solidity/artifacts/contracts/PoolCore.sol/PoolCore.json').abi;
    
    // Initialize contract
    const bitredictPool = new ethers.Contract(process.env.BITREDICT_POOL_ADDRESS, PoolCoreABI, wallet);
    
    console.log('Contract initialized');
    
    const poolId = 3;
    
    // Get pool details
    const pool = await bitredictPool.pools(poolId);
    const eventEndTime = Number(pool.eventEndTime);
    const currentTime = Math.floor(Date.now() / 1000);
    
    console.log(`\n📊 Pool 3 Details:`);
    console.log(`Event Start: ${new Date(Number(pool.eventStartTime) * 1000).toLocaleString()}`);
    console.log(`Event End: ${new Date(eventEndTime * 1000).toLocaleString()}`);
    console.log(`Current Time: ${new Date(currentTime * 1000).toLocaleString()}`);
    
    const timeUntilEnd = eventEndTime - currentTime;
    console.log(`Time until event ends: ${Math.floor(timeUntilEnd / 60)} minutes`);
    
    if (timeUntilEnd > 0) {
      console.log(`\n⏳ Waiting ${Math.floor(timeUntilEnd / 60)} minutes for event to end...`);
      
      // Wait for event to end
      const waitTime = (timeUntilEnd + 10) * 1000; // Add 10 seconds buffer
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      console.log('✅ Event should have ended, checking...');
    }
    
    // Check if event has ended
    const newCurrentTime = Math.floor(Date.now() / 1000);
    console.log(`\n⏰ New Current Time: ${new Date(newCurrentTime * 1000).toLocaleString()}`);
    console.log(`Event Ended: ${newCurrentTime > eventEndTime ? '✅ Yes' : '❌ No'}`);
    
    if (newCurrentTime > eventEndTime) {
      console.log('\n🎯 Resolving Pool 3...');
      try {
        // Resolve with 2-1 home win (Udinese wins)
        const outcome = ethers.encodeBytes32String("Udinese Wins");
        
        const gasEstimate = await bitredictPool.settlePool.estimateGas(poolId, outcome);
        
        const tx = await bitredictPool.settlePool(poolId, outcome, { gasLimit: gasEstimate + BigInt(50000) });
        console.log(`Transaction hash: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`✅ Pool 3 resolved! Block: ${receipt.blockNumber}`);
        
        // Check pool state after resolution
        const poolAfter = await bitredictPool.pools(poolId);
        console.log(`\n📊 Pool State After Resolution:`);
        console.log(`Pool Settled: ${poolAfter.settled ? '✅ Yes' : '❌ No'}`);
        console.log(`Result: ${ethers.decodeBytes32String(poolAfter.result)}`);
        console.log(`Creator Side Won: ${poolAfter.creatorSideWon ? '✅ Yes' : '❌ No'}`);
        
        // Test claiming
        console.log('\n💰 Testing Claim...');
        try {
          const claimed = await bitredictPool.claimed(poolId, wallet.address);
          console.log(`Already Claimed: ${claimed ? '✅ Yes' : '❌ No'}`);
          
          if (!claimed) {
            const claimGasEstimate = await bitredictPool.claim.estimateGas(poolId);
            
            const claimTx = await bitredictPool.claim(poolId, { gasLimit: claimGasEstimate + BigInt(50000) });
            console.log(`Claim transaction hash: ${claimTx.hash}`);
            
            const claimReceipt = await claimTx.wait();
            console.log(`✅ Claim successful! Block: ${claimReceipt.blockNumber}`);
            
            // Check what was claimed
            const finalPool = await bitredictPool.pools(poolId);
            console.log(`Pool Creator Side Won: ${finalPool.creatorSideWon ? '✅ Yes' : '❌ No'}`);
            console.log(`Pool Result: ${ethers.decodeBytes32String(finalPool.result)}`);
            
            // Check our stakes
            const lpStake = await bitredictPool.lpStakes(poolId, wallet.address);
            const bettorStake = await bitredictPool.bettorStakes(poolId, wallet.address);
            console.log(`Our LP Stake: ${ethers.formatEther(lpStake)} BITR`);
            console.log(`Our Bettor Stake: ${ethers.formatEther(bettorStake)} BITR`);
            
          } else {
            console.log('ℹ️ Already claimed for this pool');
          }
          
        } catch (error) {
          console.error(`❌ Claim failed: ${error.message}`);
        }
        
      } catch (error) {
        console.error(`❌ Pool 3 resolution failed: ${error.message}`);
      }
    } else {
      console.log('❌ Event has not ended yet');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

waitAndResolvePool3();
