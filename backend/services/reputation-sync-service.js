const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

/**
 * Reputation Sync Service
 * Syncs reputation scores from backend database to on-chain ReputationSystem contract
 */
class ReputationSyncService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    
    // Check for valid private key
    let privateKey = process.env.REPUTATION_UPDATER_PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY;
    
    // Clean up private key - remove any quotes, whitespace, or 'undefined' strings
    if (privateKey) {
      privateKey = privateKey.trim().replace(/^["']|["']$/g, '');
    }
    
    if (!privateKey || privateKey === '' || privateKey === 'undefined' || privateKey === 'null') {
      console.log('ℹ️ ReputationSyncService: No private key configured. Service disabled.');
      console.log('   To enable: Set REPUTATION_UPDATER_PRIVATE_KEY or ORACLE_PRIVATE_KEY in environment');
      console.log('   This service syncs database reputation to blockchain (required for on-chain reputation checks)');
      this.wallet = null;
      this.isDisabled = true;
    } else {
      try {
        // Debug: Check key format (first 10 chars only for security)
        console.log(`🔍 ReputationSyncService: Private key format check`);
        console.log(`   Length: ${privateKey.length} characters`);
        console.log(`   Starts with: ${privateKey.substring(0, 10)}...`);
        console.log(`   Contains only hex: ${/^[0-9a-fA-Fx]+$/.test(privateKey)}`);
        
        // Ensure private key has 0x prefix
        if (!privateKey.startsWith('0x')) {
          privateKey = '0x' + privateKey;
        }
        
        // Validate length (should be 66 chars with 0x prefix, or 64 without)
        if (privateKey.length !== 66) {
          throw new Error(`Invalid private key length: ${privateKey.length} (expected 66 with 0x prefix)`);
        }
        
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        this.isDisabled = false;
        console.log('✅ ReputationSyncService wallet initialized:', this.wallet.address);
      } catch (error) {
        console.error('❌ ReputationSyncService: Failed to initialize wallet');
        console.error('   Error:', error.shortMessage || error.message);
        console.error('   This service is CRITICAL - users cannot create pools without on-chain reputation sync');
        console.error('   FIX: Set valid Ethereum private key in Fly.io secrets:');
        console.error('   fly secrets set ORACLE_PRIVATE_KEY=0x<your-64-char-hex-key> --app bitredict-backend');
        this.wallet = null;
        this.isDisabled = true;
      }
    }
    
    this.reputationContract = null;
    this.isRunning = false;
    this.syncInterval = 5 * 60 * 1000; // 5 minutes
  }

  async initialize() {
    if (this.isDisabled) {
      console.warn('⚠️ ReputationSyncService is disabled - users may not be able to create pools!');
      console.warn('   Database reputation will not sync to blockchain');
      return false;
    }
    
    try {
      // Load ReputationSystem contract ABI
      const path = require('path');
      
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/artifacts/contracts/ReputationSystem.sol/ReputationSystem.json',
        '../solidity/artifacts/contracts/ReputationSystem.sol/ReputationSystem.json',
        '../../solidity/artifacts/contracts/ReputationSystem.sol/ReputationSystem.json',
        './abis/ReputationSystem.json',
        '../abis/ReputationSystem.json',
        './solidity/ReputationSystem.json',
        '../solidity/ReputationSystem.json',
        path.join(__dirname, '../solidity/artifacts/contracts/ReputationSystem.sol/ReputationSystem.json'),
        path.join(__dirname, '../../solidity/artifacts/contracts/ReputationSystem.sol/ReputationSystem.json'),
        path.join(__dirname, '../abis/ReputationSystem.json'),
        path.join(__dirname, '../solidity/ReputationSystem.json')
      ];
      
      let reputationABI = null;
      for (const abiPath of possiblePaths) {
        try {
          const abiData = require(abiPath);
          // Handle both formats: direct ABI array or object with .abi property
          reputationABI = Array.isArray(abiData) ? abiData : abiData.abi;
          console.log(`✅ ReputationSystem ABI loaded from: ${abiPath}`);
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      console.log(`🔍 ABI loading result: ${reputationABI ? 'SUCCESS' : 'FAILED'}`);
      if (!reputationABI) {
        throw new Error('Could not load ReputationSystem ABI from any path');
      }
      const reputationAddress = config.blockchain.contractAddresses?.reputationSystem;
      console.log(`🔍 Contract address: ${reputationAddress || 'NOT FOUND'}`);
      
      if (!reputationAddress) {
        console.warn('⚠️ ReputationSystem contract address not configured');
        return;
      }

      this.reputationContract = new ethers.Contract(reputationAddress, reputationABI, this.wallet);
      console.log('✅ ReputationSyncService initialized');
    } catch (error) {
      console.error('❌ Failed to initialize ReputationSyncService:', error);
      throw error;
    }
  }

  async start() {
    if (this.isDisabled) {
      console.warn('⚠️ ReputationSyncService cannot start - users may not be able to create pools!');
      return;
    }
    
    if (this.isRunning) {
      console.log('ReputationSyncService is already running');
      return;
    }

    if (!this.reputationContract) {
      const initialized = await this.initialize();
      if (!initialized) {
        return;
      }
    }

    this.isRunning = true;
    console.log('🔄 Starting ReputationSyncService...');

    // Initial sync
    await this.syncReputationScores();

    // Set up periodic sync
    this.syncTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.syncReputationScores();
      }
    }, this.syncInterval);
  }

  async stop() {
    this.isRunning = false;
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    console.log('⏹️ ReputationSyncService stopped');
  }

  /**
   * Sync reputation scores from database to smart contract
   */
  async syncReputationScores() {
    try {
      console.log('🔄 Syncing reputation scores to blockchain...');

      // Get users with reputation changes since last sync
      const users = await db.query(`
        SELECT address, reputation, last_active
        FROM core.users 
        WHERE reputation > 0 
        AND (last_synced_at IS NULL OR last_active > last_synced_at)
        ORDER BY last_active DESC
        LIMIT 50
      `);

      if (users.rows.length === 0) {
        console.log('✅ No reputation updates needed');
        return;
      }

      console.log(`📊 Found ${users.rows.length} users with reputation updates`);

      // Batch update reputation scores
      const addresses = users.rows.map(user => user.address);
      const reputations = users.rows.map(user => user.reputation);

      // Check if we're authorized to update
      const isAuthorized = await this.reputationContract.authorizedUpdaters(this.wallet.address);
      if (!isAuthorized) {
        console.warn('⚠️ Wallet not authorized to update reputation. Please authorize:', this.wallet.address);
        return;
      }

      // Estimate gas for batch update
      const gasEstimate = await this.reputationContract.batchUpdateReputation.estimateGas(addresses, reputations);
      console.log(`⛽ Estimated gas: ${gasEstimate.toString()}`);

      // Execute batch update
      const tx = await this.reputationContract.batchUpdateReputation(addresses, reputations, {
        gasLimit: gasEstimate + BigInt(50000) // Add buffer
      });

      console.log(`🚀 Reputation sync transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      console.log(`✅ Reputation sync confirmed in block ${receipt.blockNumber}`);

      // Update last_synced_at for these users
      await db.query(`
        UPDATE core.users 
        SET last_synced_at = NOW() 
        WHERE address = ANY($1)
      `, [addresses]);

      console.log(`✅ Synced ${addresses.length} reputation scores to blockchain`);

    } catch (error) {
      console.error('❌ Error syncing reputation scores:', error);
      
      // If it's a gas estimation error, the contract might not be deployed
      if (error.message && error.message.includes('execution reverted')) {
        console.warn('⚠️ Contract execution reverted - check if ReputationSystem is deployed and configured');
      }
    }
  }

  /**
   * Sync a single user's reputation immediately
   */
  async syncUserReputation(userAddress) {
    try {
      if (!this.reputationContract) {
        console.warn('⚠️ ReputationSystem not initialized');
        return;
      }

      // Get user's current reputation from database
      const result = await db.query(
        'SELECT reputation FROM core.users WHERE address = $1',
        [userAddress]
      );

      if (result.rows.length === 0) {
        console.log(`ℹ️ User ${userAddress} not found in database`);
        return;
      }

      const reputation = result.rows[0].reputation;

      // Update on-chain
      const tx = await this.reputationContract.updateReputation(userAddress, reputation);
      console.log(`🚀 Individual reputation sync for ${userAddress}: ${tx.hash}`);

      await tx.wait();
      console.log(`✅ Synced reputation for ${userAddress}: ${reputation}`);

      // Update sync timestamp
      await db.query(
        'UPDATE core.users SET last_synced_at = NOW() WHERE address = $1',
        [userAddress]
      );

    } catch (error) {
      console.error(`❌ Error syncing reputation for ${userAddress}:`, error);
    }
  }

  /**
   * Get reputation sync status
   */
  async getSyncStatus() {
    try {
      const pendingSync = await db.query(`
        SELECT COUNT(*) as count
        FROM core.users 
        WHERE reputation > 0 
        AND (last_synced_at IS NULL OR last_active > last_synced_at)
      `);

      const totalUsers = await db.query(`
        SELECT COUNT(*) as count
        FROM core.users 
        WHERE reputation > 0
      `);

      return {
        isRunning: this.isRunning,
        pendingSyncCount: parseInt(pendingSync.rows[0].count),
        totalUsersWithReputation: parseInt(totalUsers.rows[0].count),
        contractAddress: this.reputationContract?.address || 'Not configured',
        walletAddress: this.wallet.address,
        isAuthorized: this.reputationContract ? await this.reputationContract.authorizedUpdaters(this.wallet.address) : false
      };
    } catch (error) {
      console.error('Error getting sync status:', error);
      return { error: error.message };
    }
  }
}

module.exports = ReputationSyncService;
