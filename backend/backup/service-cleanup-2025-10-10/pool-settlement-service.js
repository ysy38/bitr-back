const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

/**
 * Pool Settlement Service
 * Listens for oracle resolution events and automatically settles pools
 */
class PoolSettlementService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    // Initialize wallet with proper private key handling
    const privateKey = process.env.PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY;
    if (!privateKey || privateKey === 'undefined' || privateKey.trim() === '') {
      throw new Error('No valid private key found. Please set PRIVATE_KEY, ORACLE_PRIVATE_KEY, or ORACLE_SIGNER_PRIVATE_KEY environment variable.');
    }
    this.wallet = new ethers.Wallet(privateKey.trim(), this.provider);
    
    // Try to load contract ABIs with multiple path attempts
    let PoolCoreABI, GuidedOracleABI;
    
    // Try multiple possible paths for PoolCore ABI
    const poolPaths = [
      '../solidity/BitredictPoolCore.json',
      './solidity/BitredictPoolCore.json',
      '../../solidity/BitredictPoolCore.json'
    ];
    
    PoolCoreABI = null;
    for (const path of poolPaths) {
      try {
        const artifact = require(path);
        PoolCoreABI = artifact.abi || artifact;
        console.log(`✅ PoolCore ABI loaded successfully from: ${path}`);
        break;
      } catch (error) {
        // Continue to next path
      }
    }
    
    if (!PoolCoreABI) {
      console.warn('⚠️ PoolCore ABI not found in any path, using minimal ABI');
      PoolCoreABI = [
        'event MarketResolved(uint256 indexed marketId, string outcome)',
        'function resolveMarket(uint256 marketId, string outcome) external'
      ];
    }
    
    // Try multiple possible paths for GuidedOracle ABI
    const oraclePaths = [
      '../solidity/GuidedOracle.json',
      './solidity/GuidedOracle.json',
      '../../solidity/GuidedOracle.json'
    ];
    
    GuidedOracleABI = null;
    for (const path of oraclePaths) {
      try {
        const artifact = require(path);
        GuidedOracleABI = artifact.abi || artifact;
        console.log(`✅ GuidedOracle ABI loaded successfully from: ${path}`);
        break;
      } catch (error) {
        // Continue to next path
      }
    }
    
    if (!GuidedOracleABI) {
      console.warn('⚠️ GuidedOracle ABI not found in any path, using minimal ABI');
      GuidedOracleABI = [
        'event OutcomeSubmitted(string indexed marketId, bytes resultData, uint256 timestamp)',
        'function submitOutcome(uint256 marketId, string resultData) external'
      ];
    }
    
    // Initialize contracts only if addresses are available
    if (config.blockchain.contractAddresses?.poolCore) {
      this.poolContract = new ethers.Contract(
        config.blockchain.contractAddresses.poolCore,
        PoolCoreABI,
        this.wallet
      );
    } else {
      console.warn('⚠️ PoolCore contract address not configured');
      this.poolContract = null;
    }
    
    if (config.blockchain.contractAddresses?.guidedOracle) {
      this.oracleContract = new ethers.Contract(
        config.blockchain.contractAddresses.guidedOracle,
        GuidedOracleABI,
        this.provider
      );
      this.guidedOracleContract = new ethers.Contract(
        config.blockchain.contractAddresses.guidedOracle,
        GuidedOracleABI,
        this.wallet
      );
    } else {
      console.warn('⚠️ GuidedOracle contract address not configured');
      this.oracleContract = null;
      this.guidedOracleContract = null;
    }
    
    this.isRunning = false;
    this.lastProcessedBlock = 0;
  }

  /**
   * Start the settlement service
   */
  async start() {
    if (this.isRunning) {
      console.log('Pool Settlement Service is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting Pool Settlement Service...');

    try {
      // Check if contracts are available
      if (!this.oracleContract) {
        console.log('⚠️ Oracle contract not available, skipping event listening');
        console.log('✅ Pool Settlement Service started (limited functionality)');
        return;
      }

      // Get current block
      const currentBlock = await this.provider.getBlockNumber();
      this.lastProcessedBlock = currentBlock - 10000; // Start from 10000 blocks ago to catch older events
      
      console.log(`Starting from block: ${this.lastProcessedBlock}`);
      console.log(`Current block: ${currentBlock}`);

      // Start listening for new events
      this.startEventListener();
      
      // Process any missed events
      await this.processHistoricalEvents();
      
      console.log('✅ Pool Settlement Service started successfully');
    } catch (error) {
      console.error('❌ Failed to start Pool Settlement Service:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the settlement service
   */
  async stop() {
    this.isRunning = false;
    
    // Clear polling interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    // Remove all listeners if contract exists
    if (this.oracleContract) {
      this.oracleContract.removeAllListeners();
    }
    
    console.log('🛑 Pool Settlement Service stopped');
  }

  /**
   * Start listening for real-time events using HTTP polling (ANKR-safe)
   */
  startEventListener() {
    if (!this.oracleContract) {
      console.log('⚠️ Oracle contract not available, skipping event listener');
      return;
    }

    console.log('👂 Starting HTTP polling event listener (ANKR-safe)...');
    
    // Use HTTP polling instead of WebSocket to avoid eth_newFilter issues
    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollForNewEvents();
      } catch (error) {
        console.error('Error polling for events:', error);
      }
    }, 30000); // Poll every 30 seconds
  }

  /**
   * Poll for new events using HTTP (ANKR-safe)
   */
  async pollForNewEvents() {
    if (!this.oracleContract) {
      return;
    }

    try {
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = this.lastProcessedBlock + 1;
      
      if (fromBlock > currentBlock) {
        return; // No new blocks
      }

      // Query for OutcomeSubmitted events in the new blocks
      const filter = {
        address: this.oracleContract.target,
        topics: [ethers.id('OutcomeSubmitted(string,bytes,uint256)')],
        fromBlock: fromBlock,
        toBlock: currentBlock
      };

      const events = await this.provider.getLogs(filter);
      
      for (const event of events) {
        try {
          const decoded = this.oracleContract.interface.parseLog(event);
          const marketIdArg = decoded.args[0];
          const resultData = decoded.args[1];
          const timestamp = decoded.args[2];
          
          console.log(`🔍 Raw event args:`, decoded.args);
          console.log(`🔍 Market ID arg:`, marketIdArg);
          console.log(`🔍 Market ID arg type:`, typeof marketIdArg);
          
          // Handle indexed string parameter - it comes as a hash
          let marketIdHash, marketIdString;
          if (marketIdArg && marketIdArg._isIndexed) {
            marketIdHash = marketIdArg.hash;
            console.log(`🔍 Market ID is indexed, using hash: ${marketIdHash}`);
            
            // We need to find the pool by comparing the hash of market_id from database
            marketIdString = await this.findMarketIdByHash(marketIdHash);
            if (!marketIdString) {
              console.log(`⚠️ Could not find market ID for hash: ${marketIdHash}`);
              return;
            }
          } else {
            // Non-indexed case (shouldn't happen with current contract)
            try {
              marketIdString = marketIdArg.toString();
            } catch {
              marketIdString = String(marketIdArg);
            }
          }
          
          console.log(`\\n🎯 New OutcomeSubmitted event detected via polling!`);
          console.log(`Market ID (hash): ${marketIdHash}`);
          console.log(`Market ID (string): ${marketIdString}`);
          console.log(`Block: ${event.blockNumber}`);
          
          await this.handleOutcomeSubmitted(marketIdString, resultData, event, marketIdHash);
        } catch (error) {
          console.error('Error processing polled event:', error);
        }
      }
      
      this.lastProcessedBlock = currentBlock;
    } catch (error) {
      console.error('Error polling for new events:', error);
    }
  }

  /**
   * Process historical events that might have been missed
   */
  async processHistoricalEvents() {
    if (!this.oracleContract) {
      console.log('⚠️ Oracle contract not available, skipping historical events processing');
      return;
    }

    try {
      console.log('🔍 Processing historical OutcomeSubmitted events...');
      
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(this.lastProcessedBlock, currentBlock - 10000); // Expanded to 10000 blocks to catch older events
      
      // Process in chunks of 500 blocks to avoid RPC limits
      const chunkSize = 100;
      let totalEvents = 0;
      
      for (let startBlock = fromBlock; startBlock < currentBlock; startBlock += chunkSize) {
        const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
        
        try {
          console.log(`📦 Processing blocks ${startBlock} to ${endBlock}...`);
          
          // Query for OutcomeSubmitted events in this chunk
          const filter = this.oracleContract.filters.OutcomeSubmitted();
          const events = await this.oracleContract.queryFilter(filter, startBlock, endBlock);
          
          console.log(`Found ${events.length} events in blocks ${startBlock}-${endBlock}`);
          totalEvents += events.length;
          
          for (const event of events) {
            const marketIdArg = event.args[0];
            const resultData = event.args[1];
            
            console.log(`🔍 Historical event raw args:`, event.args);
            console.log(`🔍 Historical Market ID arg:`, marketIdArg);
            console.log(`🔍 Historical Market ID arg type:`, typeof marketIdArg);
            
            // Handle indexed string parameter - it comes as a hash
            let marketIdHash, marketIdString;
            if (marketIdArg && marketIdArg._isIndexed) {
              marketIdHash = marketIdArg.hash;
              console.log(`🔍 Historical Market ID is indexed, using hash: ${marketIdHash}`);
              
              // We need to find the pool by comparing the hash of market_id from database
              marketIdString = await this.findMarketIdByHash(marketIdHash);
              if (!marketIdString) {
                console.log(`⚠️ Could not find market ID for hash: ${marketIdHash}`);
                continue;
              }
            } else {
              // Non-indexed case (shouldn't happen with current contract)
              try {
                marketIdString = marketIdArg.toString();
              } catch {
                marketIdString = String(marketIdArg);
              }
            }
            
            console.log(`📋 Processing historical event - Market ID (hash): ${marketIdHash}`);
            console.log(`📋 Processing historical event - Market ID (string): ${marketIdString}`);
            
            await this.handleOutcomeSubmitted(marketIdString, resultData, event, marketIdHash);
          }
          
          // Small delay to avoid overwhelming the RPC
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (chunkError) {
          console.error(`Error processing blocks ${startBlock}-${endBlock}:`, chunkError);
          // Continue with next chunk instead of failing completely
        }
      }
      
      console.log(`✅ Processed ${totalEvents} total historical events`);
      this.lastProcessedBlock = currentBlock;
      
    } catch (error) {
      console.error('Error processing historical events:', error);
    }
  }

  /**
   * Handle OutcomeSubmitted event and settle the corresponding pool
   * Uses GuidedOracle executeCall to trigger pool settlement
   */
  async handleOutcomeSubmitted(marketId, resultData, event, rawMarketId = null) {
    try {
      console.log(`🔄 Handling outcome submission for market: ${marketId}`);
      
      // Find the pool ID associated with this market
      const poolId = await this.findPoolIdByMarketId(marketId, rawMarketId);
      
      if (!poolId) {
        console.log(`⚠️ No pool found for market ID: ${marketId}`);
        return;
      }
      
      console.log(`📍 Found pool ID: ${poolId} for market: ${marketId}`);
      
      // Check if pool is already settled
      const pool = await this.poolContract.pools(poolId);
      if (pool.isSettled) {
        console.log(`✅ Pool ${poolId} is already settled, skipping`);
        return;
      }
      
      console.log(`🎯 Settling pool ${poolId} using GuidedOracle executeCall...`);
      
      try {
        // Use the raw resultData as bytes32, same as contract's settlePoolAutomatically
        const outcomeBytes32 = ethers.zeroPadValue(resultData, 32);
        const decodedResult = ethers.toUtf8String(resultData);
        
        console.log(`📊 Oracle result: ${decodedResult}`);
        console.log(`📝 Outcome bytes32: ${outcomeBytes32}`);
        
        // Create the settlePool call data
        const settlePoolInterface = new ethers.Interface([
          'function settlePool(uint256 poolId, bytes32 outcome) external'
        ]);
        const callData = settlePoolInterface.encodeFunctionData('settlePool', [poolId, outcomeBytes32]);
        
        console.log(`📝 Call data: ${callData}`);
        
        // Use GuidedOracle executeCall to trigger pool settlement
        const tx = await this.guidedOracleContract.executeCall(
          this.poolContract.target,
          callData,
          {
            gasLimit: 2000000  // Increased from 1M to 2M based on gas estimation
          }
        );
        
        console.log(`📤 Settlement transaction submitted: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`✅ Pool ${poolId} settled with outcome '${decodedResult}' in block ${receipt.blockNumber}`);
        
      } catch (settlementError) {
        console.error(`❌ Settlement failed for pool ${poolId}:`, settlementError.message);
        
        // Log detailed error information
        if (settlementError.message.includes('Only guided oracle')) {
          console.error(`❌ Pool ${poolId}: Oracle type mismatch - pool is not GUIDED type`);
        } else if (settlementError.message.includes('Event not ended yet')) {
          console.error(`❌ Pool ${poolId}: Event has not ended yet`);
        } else if (settlementError.message.includes('Already settled')) {
          console.error(`❌ Pool ${poolId}: Pool is already settled`);
        } else {
          console.error(`❌ Pool ${poolId}: Unknown settlement error:`, settlementError.message);
        }
      }
      
    } catch (error) {
      console.error(`❌ Error handling outcome submission:`, error);
    }
  }

  /**
   * Find pool ID by market ID
   * This searches through pools to find the one with matching market ID
   */
  async findMarketIdByHash(targetHash) {
    try {
      console.log(`🔍 Finding market ID for hash: ${targetHash}`);
      
      // Get all pools and check which market_id hashes to the target
      const result = await db.query(`
        SELECT pool_id, market_id 
        FROM oracle.pools 
        WHERE market_id IS NOT NULL
        ORDER BY pool_id
      `);
      
      for (const pool of result.rows) {
        try {
          const marketId = pool.market_id;
          
          // Try the market_id as-is
          const directHash = ethers.id(marketId);
          console.log(`🔍 Pool ${pool.pool_id}: market_id="${marketId}" -> hash=${directHash}`);
          
          if (directHash === targetHash) {
            console.log(`✅ Found matching pool: ${pool.pool_id} with market_id="${marketId}"`);
            return marketId;
          }
          
          // Also try without binary prefixes (common issue with stored data)
          const cleanMarketId = marketId.replace(/^[\x00-\x1F]+/, ''); // Remove leading control characters
          if (cleanMarketId !== marketId) {
            const cleanHash = ethers.id(cleanMarketId);
            console.log(`🔍 Pool ${pool.pool_id}: clean_market_id="${cleanMarketId}" -> hash=${cleanHash}`);
            
            if (cleanHash === targetHash) {
              console.log(`✅ Found matching pool: ${pool.pool_id} with clean_market_id="${cleanMarketId}"`);
              return cleanMarketId; // Return the clean version for settlement
            }
          }
          
        } catch (error) {
          console.log(`⚠️ Error hashing market_id for pool ${pool.pool_id}:`, error.message);
        }
      }
      
      console.log(`❌ No pool found with market ID hash: ${targetHash}`);
      return null;
    } catch (error) {
      console.error('Error finding market ID by hash:', error);
      return null;
    }
  }

  async findPoolIdByMarketId(targetMarketId, rawMarketId = null) {
    try {
      // Get total pool count
      const poolCount = await this.poolContract.poolCount();
      console.log(`🔍 Searching through ${poolCount} pools for market ID: ${targetMarketId}`);
      
      // Search through pools (start from recent ones)
      for (let i = Number(poolCount) - 1; i >= 0; i--) {
        try {
          const pool = await this.poolContract.pools(i);
          
          // Convert pool.marketId from bytes32 to string for comparison
          let poolMarketId;
          try {
            poolMarketId = ethers.toUtf8String(pool.marketId).replace(/\0/g, '');
          } catch {
            // If conversion fails, use hex representation
            poolMarketId = pool.marketId;
          }
          
          // Also check the database to get the stored market_id
          const dbResult = await require('../db/db').query(
            'SELECT market_id FROM oracle.pools WHERE pool_id = $1',
            [i.toString()]
          );
          
          let dbMarketId = null;
          if (dbResult.rows.length > 0) {
            dbMarketId = dbResult.rows[0].market_id;
          }
          
          // Compare market IDs (multiple formats)
          const matches = [
            poolMarketId === targetMarketId,
            pool.marketId === targetMarketId,
            pool.marketId === rawMarketId,
            dbMarketId === targetMarketId,
            dbMarketId === rawMarketId
          ];
          
          // Also try clean version of database market ID
          if (dbMarketId) {
            const cleanDbMarketId = dbMarketId.replace(/^[\x00-\x1F]+/, ''); // Remove leading control characters
            matches.push(cleanDbMarketId === targetMarketId);
            matches.push(cleanDbMarketId === rawMarketId);
          }
          
          if (matches.some(match => match)) {
            console.log(`✅ Found matching pool ${i} for market ID: ${targetMarketId}`);
            console.log(`   - Contract marketId: ${poolMarketId}`);
            console.log(`   - Database marketId: ${dbMarketId}`);
            if (dbMarketId) {
              const cleanDbMarketId = dbMarketId.replace(/^[\x00-\x1F]+/, '');
              console.log(`   - Clean DB marketId: ${cleanDbMarketId}`);
            }
            return i;
          }
        } catch (error) {
          // Skip pools that can't be read
          continue;
        }
      }
      
      console.log(`❌ No pool found with market ID: ${targetMarketId}`);
      return null;
      
    } catch (error) {
      console.error('Error finding pool by market ID:', error);
      return null;
    }
  }
}

module.exports = PoolSettlementService;
