const { ethers } = require('ethers');
const config = require('./config');
const RpcManager = require('./utils/rpc-manager');
const db = require('./db/db');
const EnhancedAnalyticsService = require('./services/enhanced-analytics-service');
const reputationManager = require('./utils/reputationManager');
const badgeManager = require('./utils/badgeManager');
const notificationService = require('./services/notification-service');
const { safeStringify } = require('./utils/bigint-serializer');

// Set worker mode for indexer process (disable leaderboard service)
process.env.WORKER_MODE = 'true';

/**
 * 🧠 SMART ANALYTICS INDEXER
 * 
 *
 * - SKIPS events available from contracts (90% reduction)
 * - INDEXES only strategically valuable data
 * - GENERATES AI-powered insights and analytics
 * - TRACKS user behavior for predictive modeling
 * - CREATES market intelligence and social metrics
 * - OPTIMIZES for business value, not raw data storage
 */

class SmartAnalyticsIndexer {
  constructor() {
    // Initialize analytics service for real-time updates
    this.analyticsService = new EnhancedAnalyticsService();
    
    // RPC Manager with optimized endpoints
    this.rpcManager = new RpcManager([
      'https://dream-rpc.somnia.network/',
      'https://rpc.ankr.com/somnia_testnet/c8e336679a7fe85909f310fbbdd5fbb18d3b7560b1d3eca7aa97874b0bb81e97',
      'https://somnia-testnet.rpc.thirdweb.com',
      'https://testnet-rpc.somnia.network'
    ], {
      maxRetries: 3,
      baseDelay: 200,
      maxDelay: 5000,
      circuitBreakerThreshold: 2,
      circuitBreakerTimeout: 15000
    });

    this.isRunning = false;
    this.isProcessing = false;
    this.currentBlock = 0;
    this.lastProcessedBlock = 0;
    this.isCatchingUp = false;
    
    // Smart hybrid polling settings - OPTIMIZED
    this.basePollInterval = 45000; // 45 seconds base polling (increased from 30)
    this.activePollInterval = 10000; // 10 seconds during high activity (increased from 5)
    this.pollInterval = this.basePollInterval;
    this.catchUpBatchSize = 25; // Reduced batch size for better performance
    this.maxLagBlocks = 20; // Increased threshold to reduce unnecessary catch-ups
    
    // Activity detection for dynamic polling
    this.activityThreshold = 3; // Events per minute to trigger active mode
    this.recentEvents = [];
    this.isHighActivity = false;
    
    // Contract addresses (updated for split contracts)
    this.contractAddresses = {
      poolCore: config.blockchain.contractAddresses.poolCore,
      boostSystem: config.blockchain.contractAddresses.boostSystem,
      comboPools: config.blockchain.contractAddresses.comboPools,
      oracle: config.blockchain.contractAddresses.guidedOracle,
      oddyssey: config.blockchain.contractAddresses.oddyssey,
      reputation: config.blockchain.contractAddresses.reputationSystem,
      // Airdrop contracts
      bitrToken: config.contracts?.bitrToken,
      bitrFaucet: config.contracts?.bitrFaucet,
      staking: config.contracts?.staking
    };

    // SMART INDEXING STRATEGY
    this.indexingStrategy = {
      // ❌ SKIP: Available from contracts (90% reduction)
      skipEvents: [
        // DISABLED: All events are now critical for analytics and real-time sync
        // 'SlipPlaced',        // ✅ ENABLED: Critical for Oddyssey analytics and event-driven sync
        // 'SlipEvaluated',     // ✅ ENABLED: Critical for slip evaluation tracking
        // 'PoolCreated',       // ✅ ENABLED: Need to index for database analytics
        // 'BetPlaced',         // ✅ ENABLED: Critical for pool analytics and user tracking
        // 'ReputationUpdated', // ✅ ENABLED: Critical for reputation system
        // 'UserStatsUpdated'   // ✅ ENABLED: Critical for user analytics
      ],
      
      // ✅ INDEX: Strategic business value (REAL-TIME PRIORITY)
      criticalEvents: [
        'SlipPlaced',           // Oddyssey slip creation - CRITICAL for analytics
        'SlipEvaluated',        // Oddyssey slip evaluation - CRITICAL for results
        'BetPlaced',            // Pool betting activity - CRITICAL for analytics
        'ReputationUpdated',    // Reputation changes - CRITICAL for social features
        'ReputationActionOccurred', // Reputation actions - CRITICAL for reputation tracking
        'UserStatsUpdated',     // User activity - CRITICAL for analytics
        'PrizeClaimed',         // Payment tracking - IMMEDIATE processing
        'MarketResolved',       // Oracle finality - IMMEDIATE processing  
        'SystemAlert',          // Platform health - IMMEDIATE processing
        'PoolCreated',          // Pool creation for analytics
        'LiquidityAdded',       // Economic activity
        'BoostActivated'        // Premium features
      ],
      
      // 🧠 SMART INDEX: AI/Analytics insights
      intelligenceEvents: [
        'HighValueBet',         // Whale activity
        'ViralPool',            // Social amplification
        'StreakAchieved',       // Gamification milestones
        'InfluenceGained',      // Social network effects
        'MarketTrend'           // Behavioral patterns
      ],
      
      // 🎁 AIRDROP INDEX: Critical for eligibility tracking
      airdropEvents: [
        'FaucetClaimed',        // Faucet claims for airdrop eligibility
        'BITRTransfer',         // BITR activity tracking
        'Staked',               // Staking activity
        'Unstaked',             // Unstaking activity
        'RewardsClaimed'        // Reward claims
      ]
    };

    // Contract instances
    this.provider = null;
    this.contracts = {};
    
    // Event ABIs - using available ABI files
    this.eventABIs = {
      poolCore: require('./solidity/BitredictPoolCore.json').abi,
      boostSystem: require('./solidity/BitredictBoostSystem.json').abi,
      comboPools: require('./solidity/BitredictComboPools.json').abi,
      oracle: require('./solidity/GuidedOracle.json').abi,
      oddyssey: require('./solidity/Oddyssey.json').abi,
      reputation: require('./solidity/ReputationSystem.json').abi,
      factory: require('./solidity/BitredictPoolFactory.json').abi
    };

    // Performance tracking
    this.stats = {
      startTime: Date.now(),
      totalEvents: 0,
      totalBlocks: 0,
      lastEventTime: null,
      errors: 0
    };
  }

  async initialize() {
    try {
      console.log('🧠 Initializing Smart Analytics Indexer...');
      console.log('📊 Strategy: Skip 90% of events, Index only strategic value');
      
      // Get RPC provider
      this.provider = await this.rpcManager.getProvider();
      console.log('✅ RPC Provider connected');

      // Initialize contract instances for split architecture
      this.contracts.poolCore = new ethers.Contract(this.contractAddresses.poolCore, this.eventABIs.poolCore, this.provider);
      this.contracts.boostSystem = new ethers.Contract(this.contractAddresses.boostSystem, this.eventABIs.boostSystem, this.provider);
      this.contracts.comboPools = new ethers.Contract(this.contractAddresses.comboPools, this.eventABIs.comboPools, this.provider);
      this.contracts.oracle = new ethers.Contract(this.contractAddresses.oracle, this.eventABIs.oracle, this.provider);
      this.contracts.oddyssey = new ethers.Contract(this.contractAddresses.oddyssey, this.eventABIs.oddyssey, this.provider);
      this.contracts.reputation = new ethers.Contract(this.contractAddresses.reputation, this.eventABIs.reputation, this.provider);
      this.contracts.factory = new ethers.Contract(config.blockchain.contractAddresses.factory, this.eventABIs.factory, this.provider);
      
      console.log('✅ Split contract instances initialized');

      // Get current block
      this.currentBlock = await this.provider.getBlockNumber();
      this.lastProcessedBlock = this.currentBlock;
      
      console.log(`📊 Starting from block ${this.currentBlock}`);
      console.log(`🎯 Skipping events: ${this.indexingStrategy.skipEvents.join(', ')}`);
      console.log(`✅ Indexing events: ${this.indexingStrategy.criticalEvents.join(', ')}`);
      console.log('🧠 Smart Analytics Indexer initialized');
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize smart indexer:', error);
      throw error;
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️ Indexer already running');
      return;
    }

    try {
      await this.initialize();
      this.isRunning = true;
      
      console.log('🎯 Starting real-time indexing...');
      console.log(`⏱️ Polling every ${this.pollInterval}ms`);
      
      // Start the main loop
      this.mainLoop();
      
    } catch (error) {
      console.error('❌ Failed to start indexer:', error);
      this.isRunning = false;
    }
  }

  async mainLoop() {
    while (this.isRunning) {
      try {
        // Get latest block
        const latestBlock = await this.provider.getBlockNumber();
        
        // Check if we need to catch up
        const blocksBehind = latestBlock - this.lastProcessedBlock;
        
        if (blocksBehind > this.maxLagBlocks) {
          console.log(`🔄 Catching up: ${blocksBehind} blocks behind`);
          await this.catchUp(latestBlock);
        } else if (blocksBehind > 0) {
          // Process new blocks in real-time
          const result = await this.processBlocks(this.lastProcessedBlock + 1, latestBlock);
          
          // Check for critical events that need immediate processing
          if (this.shouldForceRealTime(result?.events)) {
            console.log('🚨 Critical events detected - forcing real-time mode');
            this.isHighActivity = true;
            this.pollInterval = this.activePollInterval;
          }
          
          // Update activity detection
          this.updateActivityDetection(result);
        }
        
        // Update current block
        this.currentBlock = latestBlock;
        
        // Adjust polling based on activity
        this.adjustPollingFrequency();
        
        // Wait before next poll
        await this.sleep(this.pollInterval);
        
      } catch (error) {
        console.error('❌ Error in main loop:', error);
        this.stats.errors++;
        
        // Wait longer on error
        await this.sleep(this.pollInterval * 2);
      }
    }
  }

  async catchUp(targetBlock) {
    this.isCatchingUp = true;
    const startBlock = this.lastProcessedBlock + 1;
    const totalBlocks = targetBlock - startBlock + 1;
    
    console.log(`🏃 Catching up ${totalBlocks} blocks from ${startBlock} to ${targetBlock}`);
    
    let processed = 0;
    for (let from = startBlock; from <= targetBlock; from += this.catchUpBatchSize) {
      const to = Math.min(from + this.catchUpBatchSize - 1, targetBlock);
      
      try {
        await this.processBlocks(from, to);
        processed += (to - from + 1);
        
        const progress = Math.round((processed / totalBlocks) * 100);
        console.log(`📈 Catch-up progress: ${progress}% (${processed}/${totalBlocks} blocks)`);
        
        // Adaptive delay between batches based on performance
        const delay = this.isHighActivity ? 200 : 100;
        await this.sleep(delay);
        
      } catch (error) {
        console.error(`❌ Error catching up blocks ${from}-${to}:`, error);
        this.stats.errors++;
      }
    }
    
    this.isCatchingUp = false;
    console.log('✅ Catch-up completed');
  }

  async processBlocks(fromBlock, toBlock) {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    const startTime = Date.now();
    
    try {
      console.log(`🧠 Smart processing blocks ${fromBlock} to ${toBlock} (filtering contract-available events)...`);
      
      // Process only strategically valuable events from split contracts
      const eventPromises = [
        this.processStrategicPoolEvents(fromBlock, toBlock),
        this.processOracleEvents(fromBlock, toBlock),
        this.processStrategicOddysseyEvents(fromBlock, toBlock),
        this.processStrategicReputationEvents(fromBlock, toBlock),
        this.processAirdropEvents(fromBlock, toBlock)
      ];
      
      const results = await Promise.allSettled(eventPromises);
      
      // Count total events processed vs skipped
      let totalEventsProcessed = 0;
      let totalEventsSkipped = 0;
      
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          totalEventsProcessed += result.value.processed || 0;
          totalEventsSkipped += result.value.skipped || 0;
        } else {
          console.error('❌ Event processing failed:', result.reason);
        }
      });
      
      // Update stats
      this.stats.totalEvents += totalEventsProcessed;
      this.stats.totalBlocks += (toBlock - fromBlock + 1);
      this.stats.lastEventTime = new Date();
      
      // Update last processed block
      this.lastProcessedBlock = toBlock;
      
      // Save indexed block to database
      await this.saveIndexedBlock(toBlock);
      
      const duration = Date.now() - startTime;
      const reductionPercent = totalEventsSkipped > 0 ? ((totalEventsSkipped / (totalEventsProcessed + totalEventsSkipped)) * 100).toFixed(1) : 0;
      
      console.log(`✅ Smart processed ${totalEventsProcessed} events, skipped ${totalEventsSkipped} (${reductionPercent}% reduction) from ${toBlock - fromBlock + 1} blocks in ${duration}ms`);
      
    } catch (error) {
      console.error('❌ Error processing blocks:', error);
      this.stats.errors++;
    } finally {
      this.isProcessing = false;
    }
  }

  async processStrategicPoolEvents(fromBlock, toBlock) {
    try {
      // Get logs from split pool contracts (updated for new architecture)
      const contractAddresses = [
        this.contractAddresses.poolCore,
        this.contractAddresses.boostSystem, 
        this.contractAddresses.comboPools
      ].filter(addr => addr); // Filter out undefined addresses

      let totalProcessed = 0;
      let totalSkipped = 0;
      let totalErrors = 0; // ✅ FIX: Initialize totalErrors counter

      
      for (const contractAddress of contractAddresses) {
        // ✅ FIX: Determine contractType BEFORE processing logs
        let contractType = 'unknown';
        if (contractAddress === this.contractAddresses.poolCore) {
          contractType = 'poolCore';
        } else if (contractAddress === this.contractAddresses.boostSystem) {
          contractType = 'boostSystem';
        } else if (contractAddress === this.contractAddresses.comboPools) {
          contractType = 'comboPools';
        } else if (contractAddress === this.contractAddresses.oracle) {
          contractType = 'oracle';
        } else if (contractAddress === this.contractAddresses.oddyssey) {
          contractType = 'oddyssey';
        } else if (contractAddress === this.contractAddresses.reputation) {
          contractType = 'reputation';
        } else if (contractAddress === this.contractAddresses.factory) {
          contractType = 'factory';
        }
        
        const logs = await this.provider.getLogs({
          address: contractAddress,
          fromBlock: fromBlock,
          toBlock: toBlock
        });
        
        // Get the contract interface for this contract
        let contractInterface = null;
        if (contractAddress === this.contractAddresses.poolCore) {
          contractInterface = this.contracts.poolCore;
        } else if (contractAddress === this.contractAddresses.boostSystem) {
          contractInterface = this.contracts.boostSystem;
        } else if (contractAddress === this.contractAddresses.comboPools) {
          contractInterface = this.contracts.comboPools;
        } else if (contractAddress === this.contractAddresses.oracle) {
          contractInterface = this.contracts.oracle;
        } else if (contractAddress === this.contractAddresses.oddyssey) {
          contractInterface = this.contracts.oddyssey;
        } else if (contractAddress === this.contractAddresses.reputation) {
          contractInterface = this.contracts.reputation;
        } else if (contractAddress === this.contractAddresses.factory) {
          contractInterface = this.contracts.factory;
        }
        
        if (!contractInterface) {
          console.log(`⚠️  No interface found for contract ${contractAddress}`);
          continue;
        }
        
        for (let i = 0; i < logs.length; i++) {
          const log = logs[i];
          try {
            
            // Parse the log using the appropriate contract interface
            const parsedLog = contractInterface.interface.parseLog({
              topics: log.topics,
              data: log.data
            });
            
            if (parsedLog) {
              // SMART FILTERING: Skip events available from contracts
              if (this.indexingStrategy.skipEvents.includes(parsedLog.name)) {
                console.log(`⏭️  Skipping ${parsedLog.name} (available from contract)`);
                totalSkipped++;
                continue;
              }

              // INDEX: Only strategic events for analytics
              if (this.indexingStrategy.criticalEvents.includes(parsedLog.name)) {
                // Handle PoolCreated events specifically
                if (parsedLog.name === 'PoolCreated') {
                  // ✅ Delegating to event-driven-pool-sync.js (has complete schema)
                  console.log(`✅ PoolCreated event - delegated to event-driven-pool-sync service`);
                } else if (parsedLog.name === 'BetPlaced') {
                  // ✅ Award reputation for pool participation
                  try {
                    const bettor = parsedLog.args.bettor || parsedLog.args.user;
                    const poolId = parsedLog.args.poolId?.toString();
                    if (bettor && poolId) {
                      await reputationManager.recordAction(
                        bettor,
                        'BET_PLACED',
                        `Bet on pool ${poolId}`,
                        poolId
                      );
                      console.log(`🌟 Recorded BET_PLACED reputation action for ${bettor}`);
                    }
                  } catch (repError) {
                    console.error('❌ Error recording bet placed reputation:', repError.message);
                  }
                  
                  await this.saveStrategicEvent({
                    ...log,
                    logIndex: log.logIndex ?? log.log_index ?? i,
                    event: parsedLog.name,
                    args: parsedLog.args,
                    contract_type: contractType
                  });
                } else {
                  await this.saveStrategicEvent({
                    ...log,
                    logIndex: log.logIndex ?? log.log_index ?? i,
                    event: parsedLog.name,
                    args: parsedLog.args,
                    contract_type: contractType
                  });
                }
                totalProcessed++;
                console.log(`✅ Indexed ${parsedLog.name} from ${contractAddress}`);
              } else {
                console.log(`⏭️  Skipping ${parsedLog.name} (not critical)`);
                totalSkipped++;
              }
            }
          } catch (error) {
            console.error(`❌ Error parsing log from ${contractAddress}:`, error.message);
            totalErrors++;
          }
        }
        
        for (let j = 0; j < logs.length; j++) {
          const log = logs[j];
          try {
            // Parse the log using the correct contract interface
            const parsedLog = contractInterface.parseLog({
              topics: log.topics,
              data: log.data
            });
            
            if (parsedLog) {
              // SMART FILTERING: Skip events available from contracts
              if (this.indexingStrategy.skipEvents.includes(parsedLog.name)) {
                console.log(`⏭️  Skipping ${parsedLog.name} (available from contract)`);
                totalSkipped++;
                continue;
              }

              // INDEX: Only strategic events
              // Use array index as fallback for logIndex if missing (getLogs() doesn't always include it)
              await this.saveStrategicEvent({
                ...log,
                logIndex: log.logIndex ?? log.log_index ?? j,
                event: parsedLog.name,
                args: parsedLog.args,
                contract_type: contractType
              });
              
              console.log(`💾 Indexed strategic ${contractType} event: ${parsedLog.name}`);
              totalProcessed++;
            }
          } catch (parseError) {
            // Skip logs that can't be parsed (might be from other contracts)
            continue;
          }
        }
      }
      
      return { processed: totalProcessed, skipped: totalSkipped };
    } catch (error) {
      console.error('❌ Error processing strategic pool events:', error);
      return { processed: 0, skipped: 0 };
    }
  }

  // Legacy compatibility function
  async processPoolEvents(fromBlock, toBlock) {
    const result = await this.processStrategicPoolEvents(fromBlock, toBlock);
    return result.processed + result.skipped;
  }

  async processStrategicOddysseyEvents(fromBlock, toBlock) {
    try {
      const logs = await this.provider.getLogs({
        address: this.contractAddresses.oddyssey,
        fromBlock: fromBlock,
        toBlock: toBlock
      });
      
      let totalProcessed = 0;
      let totalSkipped = 0;
      
      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        try {
          const parsedLog = this.contracts.oddyssey.interface.parseLog({
            topics: log.topics,
            data: log.data
          });
          
          if (parsedLog) {
            // Handle reputation for Oddyssey events
            if (parsedLog.name === 'SlipPlaced') {
              try {
                const user = parsedLog.args.user || parsedLog.args.player;
                const slipId = parsedLog.args.slipId?.toString();
                if (user && slipId) {
                  await reputationManager.recordAction(
                    user,
                    'ODDYSSEY_PARTICIPATION',
                    `Oddyssey slip ${slipId}`,
                    slipId
                  );
                  console.log(`🌟 Recorded ODDYSSEY_PARTICIPATION reputation action for ${user}`);
                }
              } catch (repError) {
                console.error('❌ Error recording Oddyssey slip reputation:', repError.message);
              }
              console.log(`⏭️  Skipping Oddyssey ${parsedLog.name} (using direct contract queries)`);
              totalSkipped++;
              continue;
            } else if (parsedLog.name === 'SlipEvaluated') {
              try {
                const slipId = parsedLog.args.slipId?.toString();
                const score = parsedLog.args.score || parsedLog.args.correctPredictions;
                if (slipId && score !== undefined) {
                  // Get user address from database
                  const slipResult = await db.query(
                    'SELECT player_address FROM oracle.oddyssey_slips WHERE slip_id = $1',
                    [slipId]
                  );
                  if (slipResult.rows.length > 0) {
                    const user = slipResult.rows[0].player_address;
                    
                    // Get rank for notification
                    const rankResult = await db.query(
                      'SELECT leaderboard_rank FROM oracle.oddyssey_slips WHERE slip_id = $1',
                      [slipId]
                    );
                    const rank = rankResult.rows[0]?.leaderboard_rank || null;
                    
                    // Award reputation based on score
                    let action = 'ODDYSSEY_PARTICIPATION';
                    if (score >= 10) {
                      action = 'ODDYSSEY_PERFECT';
                    } else if (score >= 9) {
                      action = 'ODDYSSEY_OUTSTANDING';
                    } else if (score >= 8) {
                      action = 'ODDYSSEY_EXCELLENT';
                    } else if (score >= 7) {
                      action = 'ODDYSSEY_QUALIFYING';
                    }
                    
                    await reputationManager.recordAction(
                      user,
                      action,
                      `Oddyssey slip ${slipId} score: ${score}`,
                      slipId
                    );
                    console.log(`🌟 Recorded ${action} reputation action for ${user} (score: ${score})`);
                    
                    // Check for badge awards
                    await badgeManager.checkOddysseyBadges(user);
                    
                    // Send notification
                    const cycleId = parsedLog.args.cycleId?.toString() || 'Unknown';
                    await notificationService.notifySlipEvaluated(user, {
                      slipId,
                      cycleId,
                      score: parseInt(score),
                      rank: rank
                    });
                  }
                }
              } catch (repError) {
                console.error('❌ Error recording Oddyssey evaluation reputation:', repError.message);
              }
              console.log(`⏭️  Skipping Oddyssey ${parsedLog.name} (using direct contract queries)`);
              totalSkipped++;
              continue;
            } else if (parsedLog.name === 'PrizeClaimed') {
              try {
                const user = parsedLog.args.user || parsedLog.args.claimer;
                const slipId = parsedLog.args.slipId?.toString();
                if (user && slipId) {
                  // Prize claims don't have specific reputation in the documentation
                  // but we can check for ODDYSSEY_WINNER if they're in top 5
                  await badgeManager.checkOddysseyBadges(user);
                  console.log(`🏆 Checked badges for prize claim by ${user}`);
                }
              } catch (repError) {
                console.error('❌ Error checking badges for prize claim:', repError.message);
              }
            } else if (parsedLog.name === 'UserStatsUpdated') {
              console.log(`⏭️  Skipping Oddyssey ${parsedLog.name} (using direct contract queries)`);
              totalSkipped++;
              continue;
            }

            // INDEX: Only critical Oddyssey events (prizes, etc.)
            // Use array index as fallback for logIndex if missing (getLogs() doesn't always include it)
            await this.saveStrategicEvent({
              ...log,
              logIndex: log.logIndex ?? log.log_index ?? i,
              event: parsedLog.name,
              args: parsedLog.args,
              contract_type: 'oddyssey'
            });
            
            console.log(`💾 Indexed strategic Oddyssey event: ${parsedLog.name}`);
            totalProcessed++;
          }
        } catch (parseError) {
          continue;
        }
      }
      
      return { processed: totalProcessed, skipped: totalSkipped };
    } catch (error) {
      console.error('❌ Error processing strategic Oddyssey events:', error);
      return { processed: 0, skipped: 0 };
    }
  }

  async processStrategicReputationEvents(fromBlock, toBlock) {
    try {
      const logs = await this.provider.getLogs({
        address: this.contractAddresses.reputation,
        fromBlock: fromBlock,
        toBlock: toBlock
      });
      
      let totalProcessed = 0;
      let totalSkipped = 0;
      
      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        try {
          const parsedLog = this.contracts.reputation.interface.parseLog({
            topics: log.topics,
            data: log.data
          });
          
          if (parsedLog) {
            // SMART FILTERING: Skip reputation events available from contracts
            if (['ReputationUpdated', 'InfluenceUpdated'].includes(parsedLog.name)) {
              console.log(`⏭️  Skipping Reputation ${parsedLog.name} (available from contract)`);
              totalSkipped++;
              continue;
            }

            // INDEX: Only critical reputation events (verifications, etc.)
            // Use array index as fallback for logIndex if missing (getLogs() doesn't always include it)
            await this.saveStrategicEvent({
              ...log,
              logIndex: log.logIndex ?? log.log_index ?? i,
              event: parsedLog.name,
              args: parsedLog.args,
              contract_type: 'reputation'
            });
            
            console.log(`💾 Indexed strategic Reputation event: ${parsedLog.name}`);
            totalProcessed++;
          }
        } catch (parseError) {
          continue;
        }
      }
      
      return { processed: totalProcessed, skipped: totalSkipped };
    } catch (error) {
      console.error('❌ Error processing strategic Reputation events:', error);
      return { processed: 0, skipped: 0 };
    }
  }

  async saveStrategicEvent(eventData) {
    try {
      // Validate required fields before saving
      const blockNumber = eventData.blockNumber || eventData.block_number || null;
      const transactionHash = eventData.transactionHash || eventData.transaction_hash || null;
      const logIndex = eventData.logIndex || eventData.log_index || null;
      const eventName = eventData.event || eventData.name || null;
      const contractAddress = eventData.address || eventData.contract_address || null;
      const contractType = eventData.contract_type || 'unknown';
      const eventArgs = eventData.args || eventData.event_args || {};

      // Skip if critical fields are missing
      if (!blockNumber || !transactionHash || logIndex === null || !eventName || !contractAddress) {
        console.warn(`⚠️ Skipping strategic event due to missing required fields:`, {
          blockNumber: !!blockNumber,
          transactionHash: !!transactionHash,
          logIndex: logIndex !== null,
          eventName: !!eventName,
          contractAddress: !!contractAddress
        });
        return { success: false, error: 'Missing required fields' };
      }

      // Save only strategically valuable events to analytics.strategic_events
      try {
        await db.query(`
          INSERT INTO analytics.strategic_events (
            block_number, transaction_hash, log_index, event_name, 
            contract_address, contract_type, event_args, indexed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (transaction_hash, log_index, event_name) DO NOTHING
        `, [
          blockNumber,
          transactionHash,
          logIndex,
          eventName,
          contractAddress,
          contractType,
          safeStringify(eventArgs)
        ]);
        
        return { success: true };
      } catch (dbError) {
        console.error('❌ Database error saving strategic event:', {
          error: dbError.message,
          code: dbError.code,
          eventName,
          blockNumber
        });
        return { success: false, error: dbError.message };
      }
      
    } catch (error) {
      console.error('❌ Error saving strategic event:', {
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      });
      return { success: false, error: error.message };
    }
  }

  // Keep legacy functions for backward compatibility
  async processOddysseyEvents(fromBlock, toBlock) {
    const result = await this.processStrategicOddysseyEvents(fromBlock, toBlock);
    return result.processed + result.skipped;
  }

  async processReputationEvents(fromBlock, toBlock) {
    const result = await this.processStrategicReputationEvents(fromBlock, toBlock);
    return result.processed + result.skipped;
  }

  async processOracleEvents(fromBlock, toBlock) {
    try {
      const logs = await this.provider.getLogs({
        address: this.contractAddresses.oracle,
        fromBlock: fromBlock,
        toBlock: toBlock
      });
      
      let processed = 0;
      for (const log of logs) {
        try {
          const parsedLog = this.contracts.oracle.interface.parseLog({
            topics: log.topics,
            data: log.data
          });
          
          if (parsedLog) {
            await this.saveOracleEvent({
              ...log,
              event: parsedLog.name,
              args: parsedLog.args
            });
            processed++;
          }
        } catch (parseError) {
          continue;
        }
      }
      
      if (processed > 0) {
        console.log(`🔮 Processed ${processed} oracle events`);
      }
      
      return processed;
    } catch (error) {
      console.error('❌ Error processing oracle events:', error);
      return 0;
    }
  }

  async processOddysseyEvents(fromBlock, toBlock) {
    try {
      const logs = await this.provider.getLogs({
        address: this.contractAddresses.oddyssey,
        fromBlock: fromBlock,
        toBlock: toBlock
      });
      
      let processed = 0;
      for (const log of logs) {
        try {
          const parsedLog = this.contracts.oddyssey.interface.parseLog({
            topics: log.topics,
            data: log.data
          });
          
          if (parsedLog) {
            await this.saveOddysseyEvent({
              ...log,
              event: parsedLog.name,
              args: parsedLog.args
            });
            processed++;
          }
        } catch (parseError) {
          continue;
        }
      }
      
      if (processed > 0) {
        console.log(`🎯 Processed ${processed} oddyssey events`);
      }
      
      return processed;
    } catch (error) {
      console.error('❌ Error processing oddyssey events:', error);
      return 0;
    }
  }

  async processReputationEvents(fromBlock, toBlock) {
    try {
      const logs = await this.provider.getLogs({
        address: this.contractAddresses.reputation,
        fromBlock: fromBlock,
        toBlock: toBlock
      });
      
      let processed = 0;
      for (const log of logs) {
        try {
          const parsedLog = this.contracts.reputation.interface.parseLog({
            topics: log.topics,
            data: log.data
          });
          
          if (parsedLog) {
            await this.saveReputationEvent({
              ...log,
              event: parsedLog.name,
              args: parsedLog.args
            });
            processed++;
          }
        } catch (parseError) {
          continue;
        }
      }
      
      if (processed > 0) {
        console.log(`⭐ Processed ${processed} reputation events`);
      }
      
      return processed;
    } catch (error) {
      console.error('❌ Error processing reputation events:', error);
      return 0;
    }
  }

  async processPoolCreatedEvent(parsedLog, log) {
    try {
      console.log('🏊 Processing PoolCreated event...');
      
      // Extract pool data from the event
      const poolId = parsedLog.args.poolId?.toString();
      const creator = parsedLog.args.creator;
      const eventStartTime = parsedLog.args.eventStartTime?.toString();
      const eventEndTime = parsedLog.args.eventEndTime?.toString();
      const oracleType = parsedLog.args.oracleType?.toString();
      const marketId = parsedLog.args.marketId;
      const marketType = parsedLog.args.marketType?.toString();
      const league = parsedLog.args.league;
      const category = parsedLog.args.category;
      
      // Convert bytes32 to readable strings
      const convertBytes32ToString = (bytes32Value) => {
        if (!bytes32Value || bytes32Value === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          return '';
        }
        try {
          const hex = bytes32Value.replace(/0x/, '');
          const str = Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '');
          return str.trim();
        } catch (error) {
          return bytes32Value;
        }
      };
      
      // Get pool data from contract
      const poolContract = this.contracts.poolCore;
      const poolData = await poolContract.pools(poolId);
      
      // Convert bytes32 fields to readable strings
      const readableOutcome = convertBytes32ToString(poolData.predictedOutcome);
      const readableLeague = convertBytes32ToString(league);
      const readableCategory = convertBytes32ToString(category);
      const readableMarketId = convertBytes32ToString(marketId);
      
      // Save pool to database
      await db.query(`
        INSERT INTO oracle.pools (
          pool_id, creator_address, predicted_outcome, readable_outcome, odds, creator_stake,
          event_start_time, event_end_time, league, category, oracle_type, market_id, market_type,
          tx_hash, block_number, status, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW()
        )
        ON CONFLICT (pool_id) DO UPDATE SET
          predicted_outcome = EXCLUDED.predicted_outcome,
          readable_outcome = EXCLUDED.readable_outcome,
          updated_at = NOW()
      `, [
        Number(poolId),
        creator,
        poolData.predictedOutcome,
        readableOutcome,
        Number(poolData.odds),
        poolData.creatorStake.toString(),
        Number(eventStartTime),
        Number(eventEndTime),
        readableLeague,
        readableCategory,
        Number(oracleType),
        readableMarketId,
        Number(marketType),
        log.transactionHash,
        log.blockNumber,
        'active'
      ]);
      
      console.log(`✅ Pool ${poolId} saved to database: ${readableOutcome}`);
      
      // 🌟 Award reputation points for pool creation using ReputationSystem.sol
      try {
        await reputationManager.recordAction(
          creator,
          'POOL_CREATED',
          `Pool ${poolId}`,
          poolId
        );
        console.log(`🌟 Recorded POOL_CREATED reputation action for ${creator}`);
      } catch (repError) {
        console.error('❌ Error recording pool creation reputation:', repError.message);
      }
      
    } catch (error) {
      console.error('❌ Error processing PoolCreated event:', error);
    }
  }

  async savePoolEvent(event) {
    try {
      const eventData = {
        block_number: event.blockNumber,
        transaction_hash: event.transactionHash,
        log_index: event.logIndex,
        event_name: event.event,
        contract_address: event.address,
        data: event.args,
        created_at: new Date()
      };

      await db.query(`
        INSERT INTO oracle.pool_events (
          block_number, transaction_hash, log_index, event_name, contract_address, data, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        eventData.block_number,
        eventData.transaction_hash,
        eventData.log_index,
        eventData.event_name,
        eventData.contract_address,
        safeStringify(eventData.data),
        eventData.created_at
      ]);

    } catch (error) {
      console.error('❌ Error saving pool event:', error);
    }
  }

  async saveOracleEvent(event) {
    try {
      const eventData = {
        block_number: event.blockNumber,
        transaction_hash: event.transactionHash,
        log_index: event.logIndex,
        event_name: event.event,
        contract_address: event.address,
        data: event.args,
        created_at: new Date()
      };

      await db.query(`
        INSERT INTO oracle.oracle_events (
          block_number, transaction_hash, log_index, event_name, contract_address, data, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        eventData.block_number,
        eventData.transaction_hash,
        eventData.log_index,
        eventData.event_name,
        eventData.contract_address,
        safeStringify(eventData.data),
        eventData.created_at
      ]);

    } catch (error) {
      console.error('❌ Error saving oracle event:', error);
    }
  }

  // Slip indexing methods removed - using direct contract queries instead

  async saveOddysseyEvent(event) {
    try {
      const eventData = {
        block_number: event.blockNumber,
        transaction_hash: event.transactionHash,
        log_index: event.logIndex,
        event_name: event.event,
        contract_address: event.address,
        data: event.args,
        created_at: new Date()
      };

      await db.query(`
        INSERT INTO oddyssey.oddyssey_events (
          block_number, transaction_hash, log_index, event_name, contract_address, data, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        eventData.block_number,
        eventData.transaction_hash,
        eventData.log_index,
        eventData.event_name,
        eventData.contract_address,
        safeStringify(eventData.data),
        eventData.created_at
      ]);

    } catch (error) {
      console.error('❌ Error saving oddyssey event:', error);
    }
  }

  async saveReputationEvent(event) {
    try {
      const eventData = {
        block_number: event.blockNumber,
        transaction_hash: event.transactionHash,
        log_index: event.logIndex,
        event_name: event.event,
        contract_address: event.address,
        data: event.args,
        created_at: new Date()
      };

      await db.query(`
        INSERT INTO core.reputation_events (
          block_number, transaction_hash, log_index, event_name, contract_address, data, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        eventData.block_number,
        eventData.transaction_hash,
        eventData.log_index,
        eventData.event_name,
        eventData.contract_address,
        safeStringify(eventData.data),
        eventData.created_at
      ]);

    } catch (error) {
      console.error('❌ Error saving reputation event:', error);
    }
  }

  async processAirdropEvents(fromBlock, toBlock) {
    try {
      let totalProcessed = 0;
      
      // Process FaucetClaimed events
      if (this.contractAddresses.bitrFaucet) {
        const faucetLogs = await this.provider.getLogs({
          address: this.contractAddresses.bitrFaucet,
          fromBlock,
          toBlock
        });
        
        for (const log of faucetLogs) {
          try {
            await this.indexFaucetClaim(log);
            totalProcessed++;
          } catch (error) {
            console.error('Error processing faucet claim:', error);
          }
        }
      }
      
      // Process BITR Transfer events
      if (this.contractAddresses.bitrToken) {
        const transferLogs = await this.provider.getLogs({
          address: this.contractAddresses.bitrToken,
          topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'], // Transfer event signature
          fromBlock,
          toBlock
        });
        
        for (const log of transferLogs) {
          try {
            await this.indexBITRTransfer(log);
            totalProcessed++;
          } catch (error) {
            console.error('Error processing BITR transfer:', error);
          }
        }
      }
      
      // Process Staking events
      if (this.contractAddresses.staking) {
        const stakingLogs = await this.provider.getLogs({
          address: this.contractAddresses.staking,
          fromBlock,
          toBlock
        });
        
        for (const log of stakingLogs) {
          try {
            await this.indexStakingEvent(log);
            totalProcessed++;
          } catch (error) {
            console.error('Error processing staking event:', error);
          }
        }
      }
      
      console.log(`🎁 Processed ${totalProcessed} airdrop events from blocks ${fromBlock}-${toBlock}`);
      return { processed: totalProcessed, skipped: 0 };
    } catch (error) {
      console.error('Error processing airdrop events:', error);
      return { processed: 0, skipped: 0 };
    }
  }

  async indexFaucetClaim(log) {
    try {
      // Parse FaucetClaimed event
      const iface = new ethers.Interface([
        "event FaucetClaimed(address indexed user, uint256 amount, uint256 timestamp)"
      ]);
      const parsed = iface.parseLog({
        topics: log.topics,
        data: log.data
      });
      
      if (parsed && parsed.name === 'FaucetClaimed') {
        const { user, amount, timestamp } = parsed.args;
        const block = await this.provider.getBlock(log.blockNumber);
        
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
          log.blockNumber,
          log.transactionHash,
          sttActivity
        ]);
        
        console.log(`🎁 Indexed faucet claim for ${user}`);
      }
    } catch (error) {
      console.error('Error indexing faucet claim:', error);
    }
  }

  async indexBITRTransfer(log) {
    try {
      // Parse Transfer event
      const iface = new ethers.Interface([
        "event Transfer(address indexed from, address indexed to, uint256 value)"
      ]);
      const parsed = iface.parseLog({
        topics: log.topics,
        data: log.data
      });
      
      if (parsed && parsed.name === 'Transfer') {
        const { from, to, value } = parsed.args;
        const block = await this.provider.getBlock(log.blockNumber);
        
        // Skip zero transfers
        if (value.toString() === '0') return;
        
        // Record transfer out for sender
        if (from !== ethers.ZeroAddress) {
          await this.recordBITRActivity(from, 'TRANSFER_OUT', value, null, from, to, log, block);
        }
        
        // Record transfer in for recipient
        if (to !== ethers.ZeroAddress) {
          await this.recordBITRActivity(to, 'TRANSFER_IN', value, null, from, to, log, block);
        }
      }
    } catch (error) {
      console.error('Error indexing BITR transfer:', error);
    }
  }

  async indexStakingEvent(log) {
    try {
      const block = await this.provider.getBlock(log.blockNumber);
      
      // Try to parse different staking events
      const stakingEvents = [
        "event Staked(address indexed user, uint256 amount, uint256 tier, uint256 duration)",
        "event Unstaked(address indexed user, uint256 amount, uint256 timestamp)",
        "event RewardsClaimed(address indexed user, uint256 amount, uint256 timestamp)"
      ];
      
      for (const eventSig of stakingEvents) {
        try {
          const iface = new ethers.Interface([eventSig]);
          const parsed = iface.parseLog({
            topics: log.topics,
            data: log.data
          });
          
          if (parsed) {
            const { user, amount } = parsed.args;
            let actionType = 'STAKE';
            
            if (parsed.name === 'Unstaked') actionType = 'UNSTAKE';
            else if (parsed.name === 'RewardsClaimed') actionType = 'CLAIM_REWARDS';
            
            await db.query(`
              INSERT INTO airdrop.staking_activities (
                user_address, action_type, amount, transaction_hash, block_number, timestamp
              ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [
              user,
              actionType,
              amount.toString(),
              log.transactionHash,
              log.blockNumber,
              new Date(block.timestamp * 1000)
            ]);
            
            // Also record as BITR activity for eligibility
            await this.recordBITRActivity(user, 'STAKING', amount, null, null, null, log, block);
            
            console.log(`🔒 Indexed staking ${actionType} for ${user}`);
            break;
          }
        } catch (e) {
          // Try next event signature
          continue;
        }
      }
    } catch (error) {
      console.error('Error indexing staking event:', error);
    }
  }

  async recordBITRActivity(userAddress, activityType, amount, poolId, fromAddress, toAddress, log, block) {
    try {
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
        log.transactionHash,
        log.blockNumber,
        new Date(block.timestamp * 1000)
      ]);
    } catch (error) {
      console.error('Error recording BITR activity:', error);
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
      console.error('Error checking STT activity:', error);
      return false;
    }
  }

  async stop() {
    console.log('🛑 Stopping Unified Real-Time Indexer...');
    this.isRunning = false;
    console.log('✅ Indexer stopped');
  }

  getStatus() {
    const uptime = Date.now() - this.stats.startTime;
    const blocksBehind = this.currentBlock - this.lastProcessedBlock;
    
    return {
      isRunning: this.isRunning,
      isProcessing: this.isProcessing,
      isCatchingUp: this.isCatchingUp,
      currentBlock: this.currentBlock,
      lastProcessedBlock: this.lastProcessedBlock,
      blocksBehind: blocksBehind,
      stats: {
        ...this.stats,
        uptime: uptime,
        eventsPerSecond: this.stats.totalEvents / (uptime / 1000),
        blocksPerSecond: this.stats.totalBlocks / (uptime / 1000)
      }
    };
  }

  async saveIndexedBlock(blockNumber) {
    try {
      await db.query(`
        INSERT INTO oracle.indexed_blocks (block_number, indexed_at) 
        VALUES ($1, NOW()) 
        ON CONFLICT ON CONSTRAINT indexed_blocks_pkey 
        DO UPDATE SET indexed_at = NOW()
      `, [blockNumber]);
    } catch (error) {
      console.error('❌ Error saving indexed block:', error);
    }
  }

  // Smart activity detection for dynamic polling
  updateActivityDetection(result) {
    const now = Date.now();
    const eventsProcessed = result?.processed || 0;
    
    // Track recent events (last 2 minutes)
    this.recentEvents.push({
      timestamp: now,
      events: eventsProcessed
    });
    
    // Clean old events (older than 2 minutes)
    this.recentEvents = this.recentEvents.filter(
      event => now - event.timestamp < 120000
    );
    
    // Calculate events per minute
    const totalRecentEvents = this.recentEvents.reduce(
      (sum, event) => sum + event.events, 0
    );
    const eventsPerMinute = totalRecentEvents / 2; // 2-minute window
    
    // Update high activity status
    const wasHighActivity = this.isHighActivity;
    this.isHighActivity = eventsPerMinute >= this.activityThreshold;
    
    if (this.isHighActivity && !wasHighActivity) {
      console.log(`🔥 High activity detected: ${eventsPerMinute.toFixed(1)} events/min - switching to real-time mode`);
    } else if (!this.isHighActivity && wasHighActivity) {
      console.log(`💤 Activity normalized: ${eventsPerMinute.toFixed(1)} events/min - switching to efficient mode`);
    }
  }
  
  adjustPollingFrequency() {
    const newInterval = this.isHighActivity ? this.activePollInterval : this.basePollInterval;
    
    if (newInterval !== this.pollInterval) {
      this.pollInterval = newInterval;
      console.log(`⏱️ Polling interval adjusted to ${this.pollInterval}ms (${this.isHighActivity ? 'active' : 'efficient'} mode)`);
    }
  }
  
  // Check if events contain critical business events that need immediate processing
  hasCriticalEvents(events) {
    if (!events || events.length === 0) return false;
    
    const criticalEventTypes = this.indexingStrategy.criticalEvents;
    return events.some(event => 
      criticalEventTypes.includes(event.event) || 
      event.event === 'PrizeClaimed' || 
      event.event === 'MarketResolved' ||
      event.event === 'SystemAlert'
    );
  }
  
  // Force real-time mode when critical events are detected
  shouldForceRealTime(events) {
    return this.hasCriticalEvents(events);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton
const indexer = new SmartAnalyticsIndexer();
module.exports = indexer;

// Start if run directly
if (require.main === module) {
  indexer.start().catch(console.error);
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    await indexer.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    await indexer.stop();
    process.exit(0);
  });
}
