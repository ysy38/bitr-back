#!/usr/bin/env node

/**
 * Airdrop Event Indexer
 * 
 * Indexes blockchain events for airdrop eligibility tracking:
 * - FaucetClaimed events
 * - BITR Transfer events (for activity tracking)
 * - Staking events (Staked, Unstaked, Claimed)
 * - Pool/Betting events with BITR
 */

require('dotenv').config();
const { ethers } = require('ethers');
const db = require('../db/db');
const config = require('../config');

class AirdropIndexer {
  constructor() {
    this.provider = null;
    this.bitrTokenContract = null;
    this.faucetContract = null;
    this.stakingContract = null;
    this.isRunning = false;
    this.lastProcessedBlock = 0;
  }

  async initialize() {
    try {
      console.log('🎁 Initializing Airdrop Indexer...');
      
      // Initialize Web3 provider
      this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
      
      // Initialize contracts
      await this.initializeContracts();
      
      // Get last processed block
      await this.getLastProcessedBlock();
      
      console.log('✅ Airdrop Indexer initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Airdrop Indexer:', error);
      throw error;
    }
  }

  async initializeContracts() {
    try {
      // BITR Token Contract
      if (config.contracts.bitrToken) {
        const bitrTokenABI = [
          "event Transfer(address indexed from, address indexed to, uint256 value)",
          "function balanceOf(address owner) view returns (uint256)"
        ];
        this.bitrTokenContract = new ethers.Contract(
          config.contracts.bitrToken,
          bitrTokenABI,
          this.provider
        );
        console.log('✅ BITR Token contract initialized');
      }

      // Faucet Contract
      if (config.contracts.bitrFaucet) {
        const faucetABI = [
          "event FaucetClaimed(address indexed user, uint256 amount, uint256 timestamp)"
        ];
        this.faucetContract = new ethers.Contract(
          config.contracts.bitrFaucet,
          faucetABI,
          this.provider
        );
        console.log('✅ Faucet contract initialized');
      }

      // Staking Contract
      if (config.contracts.staking) {
        const stakingABI = [
          "event Staked(address indexed user, uint256 amount, uint256 tier, uint256 duration)",
          "event Unstaked(address indexed user, uint256 amount, uint256 timestamp)",
          "event RewardsClaimed(address indexed user, uint256 amount, uint256 timestamp)"
        ];
        this.stakingContract = new ethers.Contract(
          config.contracts.staking,
          stakingABI,
          this.provider
        );
        console.log('✅ Staking contract initialized');
      }
    } catch (error) {
      console.error('❌ Failed to initialize contracts:', error);
      throw error;
    }
  }

  async getLastProcessedBlock() {
    try {
      const result = await db.query(`
        SELECT MAX(block_number) as last_block FROM airdrop.bitr_activities
        UNION
        SELECT MAX(block_number) as last_block FROM airdrop.faucet_claims
        UNION
        SELECT MAX(block_number) as last_block FROM airdrop.staking_activities
      `);
      
      const maxBlock = Math.max(...result.rows.map(r => parseInt(r.last_block || 0)));
      this.lastProcessedBlock = maxBlock || 0;
      
      console.log(`📊 Last processed block: ${this.lastProcessedBlock}`);
    } catch (error) {
      console.error('❌ Failed to get last processed block:', error);
      this.lastProcessedBlock = 0;
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('Airdrop indexer already running');
      return;
    }

    console.log('🚀 Starting Airdrop Indexer...');
    this.isRunning = true;

    // Process historical events first
    await this.processHistoricalEvents();

    // Start real-time monitoring
    this.startRealTimeMonitoring();
  }

  async processHistoricalEvents() {
    try {
      console.log('📚 Processing historical airdrop events...');
      
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(this.lastProcessedBlock + 1, currentBlock - 1000); // Last 1k blocks to avoid range limit
      
      if (fromBlock > currentBlock) {
        console.log('✅ No new blocks to process');
        return;
      }

      console.log(`📊 Processing blocks ${fromBlock} to ${currentBlock}`);

      // Process in batches of 100 blocks to avoid "block range exceeds 1000" error
      const batchSize = 100;
      let processedBlock = fromBlock;
      
      while (processedBlock <= currentBlock) {
        const batchEndBlock = Math.min(processedBlock + batchSize - 1, currentBlock);
        
        console.log(`🔄 Processing batch: blocks ${processedBlock} to ${batchEndBlock}`);
        
        // Process FaucetClaimed events
        if (this.faucetContract) {
          await this.processFaucetEvents(processedBlock, batchEndBlock);
        }

        // Process BITR Transfer events
        if (this.bitrTokenContract) {
          await this.processBITRTransfers(processedBlock, batchEndBlock);
        }

        // Process Staking events
        if (this.stakingContract) {
          await this.processStakingEvents(processedBlock, batchEndBlock);
        }
        
        processedBlock = batchEndBlock + 1;
        
        // Small delay between batches to avoid overwhelming the RPC
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      this.lastProcessedBlock = currentBlock;
      console.log('✅ Historical events processed');
    } catch (error) {
      console.error('❌ Failed to process historical events:', error);
    }
  }

  async processFaucetEvents(fromBlock, toBlock) {
    try {
      console.log('🚰 Processing FaucetClaimed events...');
      
      const filter = this.faucetContract.filters.FaucetClaimed();
      const events = await this.faucetContract.queryFilter(filter, fromBlock, toBlock);
      
      for (const event of events) {
        await this.indexFaucetClaim(event);
      }
      
      console.log(`✅ Processed ${events.length} FaucetClaimed events`);
    } catch (error) {
      console.error('❌ Failed to process faucet events:', error);
    }
  }

  async indexFaucetClaim(event) {
    try {
      const { user, amount, timestamp } = event.args;
      const block = await this.provider.getBlock(event.blockNumber);
      
      // Check if user had STT activity before faucet claim
      const sttActivity = await this.checkSTTActivityBeforeFaucet(user, block.timestamp);
      
      await db.query(`
        INSERT INTO airdrop.faucet_claims (
          user_address, amount, claimed_at, block_number, 
          transaction_hash, had_stt_activity
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_address) DO NOTHING
      `, [
        user,
        amount.toString(),
        new Date(parseInt(timestamp) * 1000),
        event.blockNumber,
        event.transactionHash,
        sttActivity
      ]);
      
      console.log(`🎁 Indexed faucet claim for ${user}`);
    } catch (error) {
      console.error(`❌ Failed to index faucet claim:`, error);
    }
  }

  async checkSTTActivityBeforeFaucet(userAddress, faucetTimestamp) {
    try {
      const result = await db.query(`
        SELECT EXISTS(
          SELECT 1 FROM prediction.bets 
          WHERE user_address = $1 AND created_at < $2
          UNION
          SELECT 1 FROM prediction.pools 
          WHERE creator_address = $1 AND creation_time < $2
        ) as had_activity
      `, [userAddress, new Date(faucetTimestamp * 1000)]);
      
      return result.rows[0].had_activity;
    } catch (error) {
      console.error('❌ Failed to check STT activity:', error);
      return false;
    }
  }

  async processBITRTransfers(fromBlock, toBlock) {
    try {
      console.log('💸 Processing BITR Transfer events...');
      
      const filter = this.bitrTokenContract.filters.Transfer();
      const events = await this.bitrTokenContract.queryFilter(filter, fromBlock, toBlock);
      
      for (const event of events) {
        await this.indexBITRTransfer(event);
      }
      
      console.log(`✅ Processed ${events.length} BITR Transfer events`);
    } catch (error) {
      console.error('❌ Failed to process BITR transfers:', error);
    }
  }

  async indexBITRTransfer(event) {
    try {
      const { from, to, value } = event.args;
      const block = await this.provider.getBlock(event.blockNumber);
      
      // Skip zero transfers
      if (value.toString() === '0') return;
      
      // Determine activity type
      let activityType = 'TRANSFER_IN';
      let userAddress = to;
      
      if (from !== ethers.ZeroAddress) {
        // This is a transfer between users
        activityType = 'TRANSFER_OUT';
        userAddress = from;
        
        // Also record as transfer in for recipient
        await this.recordBITRActivity(to, 'TRANSFER_IN', value, null, from, to, event);
      }
      
      await this.recordBITRActivity(userAddress, activityType, value, null, from, to, event);
      
    } catch (error) {
      console.error(`❌ Failed to index BITR transfer:`, error);
    }
  }

  async recordBITRActivity(userAddress, activityType, amount, poolId, fromAddress, toAddress, event) {
    try {
      const block = await this.provider.getBlock(event.blockNumber);
      
      await db.query(`
        INSERT INTO airdrop.bitr_activities (
          user_address, activity_type, amount, pool_id,
          from_address, to_address, transaction_hash, block_number, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        userAddress,
        activityType,
        amount.toString(),
        poolId,
        fromAddress,
        toAddress,
        event.transactionHash,
        event.blockNumber,
        new Date(block.timestamp * 1000)
      ]);
      
    } catch (error) {
      console.error(`❌ Failed to record BITR activity:`, error);
    }
  }

  async processStakingEvents(fromBlock, toBlock) {
    try {
      console.log('🔒 Processing Staking events...');
      
      // Process Staked events
      const stakedFilter = this.stakingContract.filters.Staked();
      const stakedEvents = await this.stakingContract.queryFilter(stakedFilter, fromBlock, toBlock);
      
      for (const event of stakedEvents) {
        await this.indexStakingEvent(event, 'STAKE');
      }
      
      // Process Unstaked events
      const unstakedFilter = this.stakingContract.filters.Unstaked();
      const unstakedEvents = await this.stakingContract.queryFilter(unstakedFilter, fromBlock, toBlock);
      
      for (const event of unstakedEvents) {
        await this.indexStakingEvent(event, 'UNSTAKE');
      }
      
      // Process RewardsClaimed events
      const claimedFilter = this.stakingContract.filters.RewardsClaimed();
      const claimedEvents = await this.stakingContract.queryFilter(claimedFilter, fromBlock, toBlock);
      
      for (const event of claimedEvents) {
        await this.indexStakingEvent(event, 'CLAIM_REWARDS');
      }
      
      console.log(`✅ Processed ${stakedEvents.length + unstakedEvents.length + claimedEvents.length} staking events`);
    } catch (error) {
      console.error('❌ Failed to process staking events:', error);
    }
  }

  async indexStakingEvent(event, actionType) {
    try {
      const { user, amount } = event.args;
      const block = await this.provider.getBlock(event.blockNumber);
      
      await db.query(`
        INSERT INTO airdrop.staking_activities (
          user_address, action_type, amount, transaction_hash, block_number, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        user,
        actionType,
        amount.toString(),
        event.transactionHash,
        event.blockNumber,
        new Date(block.timestamp * 1000)
      ]);
      
      // Also record as BITR activity for eligibility
      await this.recordBITRActivity(user, 'STAKING', amount, null, null, null, event);
      
      console.log(`🔒 Indexed staking ${actionType} for ${user}`);
    } catch (error) {
      console.error(`❌ Failed to index staking event:`, error);
    }
  }

  startRealTimeMonitoring() {
    console.log('👁️ Starting real-time airdrop monitoring...');
    
    // Monitor FaucetClaimed events
    if (this.faucetContract) {
      this.faucetContract.on('FaucetClaimed', async (user, amount, timestamp, event) => {
        console.log(`🎁 Real-time FaucetClaimed: ${user}`);
        await this.indexFaucetClaim(event);
      });
    }
    
    // Monitor BITR Transfer events
    if (this.bitrTokenContract) {
      this.bitrTokenContract.on('Transfer', async (from, to, value, event) => {
        if (value.toString() !== '0') {
          console.log(`💸 Real-time BITR Transfer: ${from} → ${to}`);
          await this.indexBITRTransfer(event);
        }
      });
    }
    
    // Monitor Staking events
    if (this.stakingContract) {
      this.stakingContract.on('Staked', async (user, amount, tier, duration, event) => {
        console.log(`🔒 Real-time Staked: ${user}`);
        await this.indexStakingEvent(event, 'STAKE');
      });
      
      this.stakingContract.on('Unstaked', async (user, amount, timestamp, event) => {
        console.log(`🔓 Real-time Unstaked: ${user}`);
        await this.indexStakingEvent(event, 'UNSTAKE');
      });
      
      this.stakingContract.on('RewardsClaimed', async (user, amount, timestamp, event) => {
        console.log(`💰 Real-time RewardsClaimed: ${user}`);
        await this.indexStakingEvent(event, 'CLAIM_REWARDS');
      });
    }
    
    console.log('✅ Real-time monitoring started');
  }

  async stop() {
    if (!this.isRunning) {
      console.log('Airdrop indexer not running');
      return;
    }

    console.log('🛑 Stopping Airdrop Indexer...');
    this.isRunning = false;
    
    // Remove event listeners
    if (this.faucetContract) {
      this.faucetContract.removeAllListeners();
    }
    if (this.bitrTokenContract) {
      this.bitrTokenContract.removeAllListeners();
    }
    if (this.stakingContract) {
      this.stakingContract.removeAllListeners();
    }
    
    console.log('✅ Airdrop Indexer stopped');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastProcessedBlock: this.lastProcessedBlock,
      contracts: {
        bitrToken: !!this.bitrTokenContract,
        faucet: !!this.faucetContract,
        staking: !!this.stakingContract
      }
    };
  }
}

// Export singleton instance
const airdropIndexer = new AirdropIndexer();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down Airdrop Indexer gracefully...');
  await airdropIndexer.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down Airdrop Indexer gracefully...');
  await airdropIndexer.stop();
  process.exit(0);
});

// Start if run directly
if (require.main === module) {
  airdropIndexer.initialize()
    .then(() => airdropIndexer.start())
    .catch(error => {
      console.error('Failed to start Airdrop Indexer:', error);
      process.exit(1);
    });
}

module.exports = airdropIndexer;
