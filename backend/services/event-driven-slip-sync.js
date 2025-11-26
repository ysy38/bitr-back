const db = require('../db/db');
const Web3Service = require('./web3-service');
const { safeStringify } = require('../utils/bigint-serializer');
const websocketService = require('./websocket-service');

/**
 * Event-Driven Slip Sync Service
 * 
 * This service listens to Oddyssey contract events in real-time and immediately
 * syncs new slips to the database. This is much more efficient than polling
 * and provides instant updates for analytics.
 * 
 * Features:
 * - Real-time event listening (no polling)
 * - Immediate slip sync on SlipPlaced events
 * - Automatic retry and error handling
 * - Fallback to periodic sync if events fail
 * - Cost-effective (only runs when needed)
 */
class EventDrivenSlipSync {
  constructor() {
    this.web3Service = new Web3Service();
    this.isRunning = false;
    this.oddysseyContract = null;
    this.eventListeners = [];
    this.serviceName = 'EventDrivenSlipSync';
    
    // Configuration
    this.config = {
      maxRetries: 3,
      retryDelayMs: 5000,
      fallbackSyncInterval: 300000, // 5 minutes fallback
      batchSize: 10
    };
    
    // Fallback sync timer
    this.fallbackTimer = null;
  }


  /**
   * Serialize predictions data for WebSocket transmission
   * Converts contract array format [matchId, betType, selection, selectedOdd] to object format
   */
  serializePredictions(predictions) {
    if (!Array.isArray(predictions)) {
      return [];
    }
    
    return predictions.map(prediction => {
      // Contract returns predictions as arrays: [matchId, betType, selection, selectedOdd]
      if (Array.isArray(prediction)) {
        return {
          matchId: prediction[0]?.toString() || '0',
          betType: prediction[1]?.toString() || '0',
          selection: prediction[2] || '',
          selectedOdd: prediction[3]?.toString() || '0'
        };
      }
      
      // If it's already an object, just convert BigInts
      if (typeof prediction === 'object' && prediction !== null) {
        const serialized = {};
        for (const [key, value] of Object.entries(prediction)) {
          if (typeof value === 'bigint') {
            serialized[key] = value.toString();
          } else {
            serialized[key] = value;
          }
        }
        return serialized;
      }
      
      return prediction;
    });
  }

  /**
   * Broadcast slip event to WebSocket subscribers
   */
  async broadcastSlipEvent(eventType, data) {
    try {
      const playerAddress = (data.playerAddress || data.userAddress || data.player || '').toLowerCase();
      const cycleChannel = data.cycleId ? `slips:cycle:${data.cycleId}` : null;
      const baseChannels = new Set([
        'slips:all',
        cycleChannel,
        playerAddress ? `slips:user:${playerAddress}` : null,
        data.slipId ? `slips:${data.slipId}:updated` : null
      ]);

      // Event-specific channels
      if (eventType === 'slip:placed') {
        if (playerAddress) {
          baseChannels.add(`slip:placed:user:${playerAddress}`);
        }
        baseChannels.add('oddyssey:slip:placed');
      } else if (eventType === 'slip:evaluated') {
        if (playerAddress) {
          baseChannels.add(`slip:evaluated:user:${playerAddress}`);
        }
        baseChannels.add('oddyssey:slip:evaluated');
      } else if (eventType === 'slip:prize_claimed') {
        if (playerAddress) {
          baseChannels.add(`slip:prize_claimed:user:${playerAddress}`);
        }
        baseChannels.add('oddyssey:slip:prize_claimed');
      }
      
      const channels = Array.from(baseChannels).filter(Boolean);
      
      for (const channel of channels) {
        if (websocketService && websocketService.broadcastToChannel) {
          const broadcastData = {
            type: eventType,
            ...data,
            broadcastedAt: new Date().toISOString()
          };
          websocketService.broadcastToChannel(channel, broadcastData);
        }
      }
      
      console.log(`📡 ${this.serviceName}: Broadcast ${eventType} for slip ${data.slipId} to ${channels.length} channels`);
    } catch (error) {
      console.warn(`⚠️ ${this.serviceName}: Failed to broadcast slip event:`, error.message);
    }
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      console.log(`🚀 ${this.serviceName}: Initializing...`);
      
      if (!this.web3Service.isInitialized) {
        await this.web3Service.initialize();
      }
      
      this.oddysseyContract = await this.web3Service.getOddysseyContract();
      if (!this.oddysseyContract) {
        throw new Error('Oddyssey contract not available');
      }
      
      console.log(`✅ ${this.serviceName}: Initialized successfully`);
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Initialization failed:`, error);
      throw error;
    }
  }

  /**
   * Start the event-driven sync service
   */
  async start() {
    if (this.isRunning) {
      console.log(`⚠️ ${this.serviceName}: Already running`);
      return;
    }

    try {
      await this.initialize();
      
      this.isRunning = true;
      console.log(`🚀 ${this.serviceName}: Starting event-driven slip sync...`);
      
      // Setup event listeners
      await this.setupEventListeners();
      
      // Start fallback sync timer
      this.startFallbackSync();
      
      console.log(`✅ ${this.serviceName}: Event-driven slip sync active`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to start:`, error);
      throw error;
    }
  }

  /**
   * Stop the service
   */
  async stop() {
    if (!this.isRunning) {
      console.log(`⚠️ ${this.serviceName}: Not running`);
      return;
    }

    try {
      console.log(`🛑 ${this.serviceName}: Stopping event-driven slip sync...`);
      
      // Remove event listeners
      this.removeEventListeners();
      
      // Clear fallback timer
      if (this.fallbackTimer) {
        clearInterval(this.fallbackTimer);
        this.fallbackTimer = null;
      }
      
      this.isRunning = false;
      console.log(`✅ ${this.serviceName}: Stopped successfully`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error stopping service:`, error);
    }
  }

  /**
   * Setup contract event listeners
   */
  async setupEventListeners() {
    try {
      console.log(`👂 ${this.serviceName}: Setting up event listeners...`);
      
      // Listen to SlipPlaced events
      const slipPlacedListener = this.oddysseyContract.on('SlipPlaced', async (
        cycleId,
        player,
        slipId,
        event
      ) => {
        console.log(`🎯 ${this.serviceName}: SlipPlaced event detected - Slip ID: ${slipId}, Cycle: ${cycleId}`);
        await this.handleSlipPlaced(cycleId, player, slipId, event);
      });
      
      this.eventListeners.push(slipPlacedListener);
      
      // Listen to SlipEvaluated events
      const slipEvaluatedListener = this.oddysseyContract.on('SlipEvaluated', async (
        slipId,
        isWinner,
        correctPredictions,
        totalPredictions,
        event
      ) => {
        console.log(`🏆 ${this.serviceName}: SlipEvaluated event detected - Slip ID: ${slipId}`);
        await this.handleSlipEvaluated(slipId, isWinner, correctPredictions, totalPredictions, event);
      });
      
      this.eventListeners.push(slipEvaluatedListener);
      
      // Listen to PrizeClaimed events
      const prizeClaimedListener = this.oddysseyContract.on('PrizeClaimed', async (
        player,
        slipId,
        prizeAmount,
        event
      ) => {
        console.log(`💰 ${this.serviceName}: PrizeClaimed event detected - Slip ID: ${slipId}`);
        await this.handlePrizeClaimed(player, slipId, prizeAmount, event);
      });
      
      this.eventListeners.push(prizeClaimedListener);
      
      console.log(`✅ ${this.serviceName}: Event listeners setup complete`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to setup event listeners:`, error);
      throw error;
    }
  }

  /**
   * Remove all event listeners
   */
  removeEventListeners() {
    try {
      console.log(`🔇 ${this.serviceName}: Removing event listeners...`);
      
      this.eventListeners.forEach((listener, index) => {
        if (listener && typeof listener.removeAllListeners === 'function') {
          listener.removeAllListeners();
        }
      });
      
      this.eventListeners = [];
      console.log(`✅ ${this.serviceName}: Event listeners removed`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error removing event listeners:`, error);
    }
  }

  /**
   * Handle SlipPlaced event
   */
  async handleSlipPlaced(cycleId, player, slipId, event) {
    try {
      console.log(`🔄 ${this.serviceName}: Processing SlipPlaced event for slip ${slipId}...`);
      
      // Get full slip data from contract
      const slipData = await this.oddysseyContract.getSlip(slipId);
      
      // Save to database - pass event to get transaction hash
      await this.saveSlipToDatabase(slipData, slipId, cycleId, player, event);
      
      // Broadcast slip placed event to WebSocket clients
      await this.broadcastSlipEvent('slip:placed', {
        slipId: Number(slipId),
        cycleId: Number(cycleId),
        playerAddress: player ? player.toLowerCase() : '',
        predictions: this.serializePredictions(slipData.predictions || []),
        placedAt: new Date().toISOString()
      });
      
      console.log(`✅ ${this.serviceName}: Slip ${slipId} synced successfully`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to handle SlipPlaced event:`, error);
      
      // Retry mechanism
      await this.retrySlipSync(slipId, cycleId, player);
    }
  }

  /**
   * Handle SlipEvaluated event
   */
  async handleSlipEvaluated(slipId, isWinner, correctPredictions, totalPredictions, event) {
    try {
      console.log(`🏆 ${this.serviceName}: Updating evaluation for slip ${slipId}...`);
      
      // Update database with evaluation data
      await this.updateSlipEvaluation(slipId, isWinner, correctPredictions, totalPredictions);
      
      // Fetch slip data for SDS publishing
      const slipResult = await db.query(`
        SELECT cycle_id, player_address, leaderboard_rank, prize_amount, evaluated_at
        FROM oracle.oddyssey_slips
        WHERE slip_id = $1
      `, [slipId.toString()]);
      
      // Publish to Somnia Data Streams
      if (slipResult.rows.length > 0) {
        const slip = slipResult.rows[0];
        try {
          const somniaDataStreams = require('./somnia-data-streams-service');
          // ✅ CRITICAL: Use actual timestamp from database or current time, not block number
          const timestamp = slip.evaluated_at 
            ? Math.floor(new Date(slip.evaluated_at).getTime() / 1000)
            : Math.floor(Date.now() / 1000);
          
          await somniaDataStreams.publishSlipEvaluated(
            slipId,
            slip.cycle_id,
            slip.player_address,
            Boolean(isWinner),
            Number(correctPredictions),
            Number(totalPredictions),
            slip.leaderboard_rank || 0,
            slip.prize_amount || 0,
            timestamp
          );
        } catch (sdsError) {
          console.warn(`⚠️ ${this.serviceName}: Failed to publish slip evaluated to SDS (non-critical):`, sdsError.message);
        }
      }
      
      // ✅ CRITICAL: Broadcast WebSocket update for Live Activity feed (standard channel)
      try {
        const wsService = require('./websocket-service');
        if (slipResult.rows.length > 0) {
          const slip = slipResult.rows[0];
          wsService.broadcastSlipEvaluated({
            slipId: slipId.toString(),
            cycleId: slip.cycle_id?.toString() || '',
            player: slip.player_address || '',
            isWinner: Boolean(isWinner),
            correctPredictions: Number(correctPredictions),
            totalPredictions: Number(totalPredictions),
            rank: slip.leaderboard_rank || 0,
            prizeAmount: (slip.prize_amount || 0).toString(),
            timestamp: Date.now()
          });
          console.log(`📡 ${this.serviceName}: WebSocket slip:evaluated broadcast sent for slip ${slipId}`);
        }
      } catch (wsError) {
        console.warn(`⚠️ ${this.serviceName}: WebSocket broadcast failed (non-critical):`, wsError.message);
      }
      
      // Broadcast slip evaluated event to WebSocket clients (custom channels)
      const slipDataForBroadcast = slipResult.rows[0] || {};
      const broadcastPlayer = (slipDataForBroadcast.player_address || '').toLowerCase();
      await this.broadcastSlipEvent('slip:evaluated', {
        slipId: Number(slipId),
        cycleId: Number(slipDataForBroadcast.cycle_id || 0),
        playerAddress: broadcastPlayer,
        isWinner: Boolean(isWinner),
        correctPredictions: Number(correctPredictions),
        totalPredictions: Number(totalPredictions),
        evaluatedAt: new Date().toISOString()
      });
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to handle SlipEvaluated event:`, error);
    }
  }

  /**
   * Handle PrizeClaimed event
   */
  async handlePrizeClaimed(player, slipId, prizeAmount, event) {
    try {
      console.log(`💰 ${this.serviceName}: Updating prize claim for slip ${slipId}...`);
      
      // Update database with prize claim data
      await this.updateSlipPrizeClaim(slipId, prizeAmount);
      
      // Fetch slip data for SDS publishing
      const slipResult = await db.query(`
        SELECT cycle_id, leaderboard_rank, claimed_at, player_address
        FROM oracle.oddyssey_slips
        WHERE slip_id = $1
      `, [slipId.toString()]);
      
      // Publish to Somnia Data Streams
      if (slipResult.rows.length > 0) {
        const slip = slipResult.rows[0];
        try {
          const somniaDataStreams = require('./somnia-data-streams-service');
          // ✅ CRITICAL: Use actual timestamp from database or current time, not block number
          const timestamp = slip.claimed_at 
            ? Math.floor(new Date(slip.claimed_at).getTime() / 1000)
            : Math.floor(Date.now() / 1000);
          
          await somniaDataStreams.publishPrizeClaimed(
            player,
            slipId,
            slip.cycle_id,
            prizeAmount || 0,
            slip.leaderboard_rank || 0,
            timestamp
          );
        } catch (sdsError) {
          console.warn(`⚠️ ${this.serviceName}: Failed to publish prize claimed to SDS (non-critical):`, sdsError.message);
        }
      }
      
      // ✅ CRITICAL: Broadcast WebSocket update for Live Activity feed (standard channel)
      try {
        const wsService = require('./websocket-service');
        if (slipResult.rows.length > 0) {
          const slip = slipResult.rows[0];
          wsService.broadcastPrizeClaimed({
            player: player,
            slipId: slipId.toString(),
            cycleId: slip.cycle_id?.toString() || '',
            prizeAmount: prizeAmount.toString(),
            rank: slip.leaderboard_rank || 0,
            timestamp: Date.now()
          });
          console.log(`📡 ${this.serviceName}: WebSocket prize:claimed broadcast sent for slip ${slipId}`);
        }
      } catch (wsError) {
        console.warn(`⚠️ ${this.serviceName}: WebSocket broadcast failed (non-critical):`, wsError.message);
      }
      
      // Broadcast prize claimed event to WebSocket clients (custom channels)
      const slipDataForBroadcast = slipResult.rows[0] || {};
      await this.broadcastSlipEvent('slip:prize_claimed', {
        slipId: Number(slipId),
        cycleId: Number(slipDataForBroadcast.cycle_id || 0),
        playerAddress: (player || slipDataForBroadcast.player_address || '').toLowerCase(),
        prizeAmount: prizeAmount.toString(),
        claimedAt: new Date().toISOString()
      });
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to handle PrizeClaimed event:`, error);
    }
  }

  /**
   * Retry slip sync with exponential backoff
   */
  async retrySlipSync(slipId, cycleId, player, attempt = 1) {
    if (attempt > this.config.maxRetries) {
      console.error(`❌ ${this.serviceName}: Max retries exceeded for slip ${slipId}`);
      return;
    }

    try {
      console.log(`🔄 ${this.serviceName}: Retrying slip sync for ${slipId} (attempt ${attempt})...`);
      
      const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      const slipData = await this.oddysseyContract.getSlip(slipId);
      await this.saveSlipToDatabase(slipData, slipId, cycleId, player);
      
      console.log(`✅ ${this.serviceName}: Slip ${slipId} synced on retry ${attempt}`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Retry ${attempt} failed for slip ${slipId}:`, error);
      await this.retrySlipSync(slipId, cycleId, player, attempt + 1);
    }
  }

  /**
   * Save slip data to database
   */
  async saveSlipToDatabase(slipData, slipId, cycleId, player, event = null) {
    try {
      // Check if slip already exists
      const existingSlip = await db.query(
        'SELECT slip_id FROM oracle.oddyssey_slips WHERE slip_id = $1',
        [slipId]
      );

      // Parse slip data - Contract Slip struct: {player, cycleId, placedAt, predictions, finalScore, correctCount, isEvaluated}
      const parsedSlip = {
        slipId: Number(slipId),
        cycleId: Number(cycleId),
        playerAddress: player,
        predictions: this.serializePredictions(slipData.predictions || []),
        isEvaluated: slipData.isEvaluated || false,
        correctCount: Number(slipData.correctCount || 0), // ✅ FIX: Use correctCount not correctPredictions
        finalScore: slipData.finalScore?.toString() || '0', // ✅ FIX: Use finalScore from contract
        placedAt: new Date(Number(slipData.placedAt || 0) * 1000), // ✅ FIX: Extract placedAt from contract data
        txHash: event?.transactionHash || null // ✅ FIX: Get txHash from event, not slipData
      };

      // Check if cycle exists, if not skip slip sync
      const cycleCheck = await db.query(
        'SELECT cycle_id FROM oracle.oddyssey_cycles WHERE cycle_id = $1',
        [parsedSlip.cycleId]
      );

      if (cycleCheck.rows.length === 0) {
        console.log(`⚠️ ${this.serviceName}: Cycle ${parsedSlip.cycleId} does not exist in database, skipping slip ${slipId}`);
        return;
      }

      if (existingSlip.rows.length > 0) {
        // Update existing slip
        await this.updateSlipInDatabase(parsedSlip);
      } else {
        // Insert new slip
        await this.insertSlipInDatabase(parsedSlip);
      }

    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to save slip ${slipId}:`, error);
      throw error;
    }
  }


  /**
   * Insert new slip into database
   */
  async insertSlipInDatabase(parsedSlip) {
    await db.query(`
      INSERT INTO oracle.oddyssey_slips (
        slip_id, cycle_id, player_address, predictions, is_evaluated,
        final_score, correct_count, placed_at, tx_hash, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
      )
    `, [
      parsedSlip.slipId, parsedSlip.cycleId, parsedSlip.playerAddress,
      safeStringify(parsedSlip.predictions), parsedSlip.isEvaluated,
      parsedSlip.finalScore || 0, parsedSlip.correctCount || 0, 
      parsedSlip.placedAt, parsedSlip.txHash
    ]);
  }

  /**
   * Update existing slip in database
   */
  async updateSlipInDatabase(parsedSlip) {
    await db.query(`
      UPDATE oracle.oddyssey_slips SET
        cycle_id = $2, player_address = $3, predictions = $4, is_evaluated = $5,
        final_score = $6, correct_count = $7, placed_at = $8,
        tx_hash = $9, updated_at = NOW()
      WHERE slip_id = $1
    `, [
      parsedSlip.slipId, parsedSlip.cycleId, parsedSlip.playerAddress,
      safeStringify(parsedSlip.predictions), parsedSlip.isEvaluated,
      parsedSlip.finalScore || 0, parsedSlip.correctCount || 0, 
      parsedSlip.placedAt, parsedSlip.txHash
    ]);
  }

  /**
   * Update slip evaluation
   */
  async updateSlipEvaluation(slipId, isWinner, correctPredictions, totalPredictions) {
    try {
      await db.query(`
        UPDATE oracle.oddyssey_slips SET
          is_evaluated = true,
          correct_count = $2,
          updated_at = NOW()
        WHERE slip_id = $1
      `, [slipId, correctPredictions]);
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to update evaluation for slip ${slipId}:`, error);
    }
  }

  /**
   * Update slip prize claim
   */
  async updateSlipPrizeClaim(slipId, prizeAmount) {
    try {
      await db.query(`
        UPDATE oracle.oddyssey_slips SET
          prize_claimed = true,
          updated_at = NOW()
        WHERE slip_id = $1
      `, [slipId]);
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Failed to update prize claim for slip ${slipId}:`, error);
    }
  }

  /**
   * Start fallback sync timer (in case events fail)
   */
  startFallbackSync() {
    this.fallbackTimer = setInterval(async () => {
      try {
        console.log(`🔄 ${this.serviceName}: Running fallback sync...`);
        await this.fallbackSync();
      } catch (error) {
        console.error(`❌ ${this.serviceName}: Fallback sync failed:`, error);
      }
    }, this.config.fallbackSyncInterval);
  }

  /**
   * Fallback sync (check for missed slips)
   */
  async fallbackSync() {
    try {
      // Get current cycle
      const currentCycle = await this.oddysseyContract.getCurrentCycle();
      
      // Get last synced slip from database
      const lastSyncResult = await db.query(`
        SELECT COALESCE(MAX(slip_id), -1) as last_slip_id 
        FROM oracle.oddyssey_slips
      `);
      
      const lastSlipId = Number(lastSyncResult.rows[0]?.last_slip_id || -1);
      
      // Check for new slips by getting total slip count
      const slipCount = await this.oddysseyContract.slipCount();
      const totalSlips = Number(slipCount);
      
      if (totalSlips > lastSlipId + 1) {
        console.log(`🔄 ${this.serviceName}: Fallback sync found ${totalSlips - (lastSlipId + 1)} missed slips`);
        
        // Sync slips from lastSlipId + 1 to totalSlips - 1 (0-indexed)
        const newSlipIds = [];
        for (let i = lastSlipId + 1; i < totalSlips; i++) {
          newSlipIds.push(i);
        }
        
        await this.syncSlipRange(newSlipIds);
      }
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Fallback sync failed:`, error);
    }
  }

  /**
   * Sync a range of slips (fallback method)
   */
  async syncSlipRange(slipIds) {
    for (const slipId of slipIds) {
      try {
        const slipData = await this.oddysseyContract.getSlip(slipId);
        
        // Extract data from slip object
        const cycleId = slipData.cycleId;
        const player = slipData.player;
        
        await this.saveSlipToDatabase(slipData, slipId, cycleId, player);
        console.log(`✅ ${this.serviceName}: Fallback synced slip ${slipId}`);
      } catch (error) {
        console.error(`❌ ${this.serviceName}: Failed to fallback sync slip ${slipId}:`, error);
      }
    }
  }
}

module.exports = EventDrivenSlipSync;
