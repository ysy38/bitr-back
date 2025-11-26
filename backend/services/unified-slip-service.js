const Web3Service = require('./web3-service');
const { cache } = require('../config/redis');
const db = require('../db/db');
const EnhancedAnalyticsService = require('./enhanced-analytics-service');

/**
 * Unified Slip Service - Hybrid Approach
 * 
 * Contract-first with analytics support:
 * - Primary: Direct contract queries (real-time, cached)
 * - Secondary: Database saves for analytics (async, non-blocking)
 * 
 * Benefits:
 * - Always real-time data from contract
 * - High-performance Redis caching
 * - Analytics and historical data support
 * - Non-blocking database saves
 * - Best of both worlds
 */
class UnifiedSlipService {
  constructor() {
    this.web3Service = new Web3Service();
    this.redisCache = cache;
    this.memoryCache = new Map(); // Fallback cache
    this.cacheTTL = 30; // 30 seconds for Redis
    this.memoryCacheTTL = 15000; // 15 seconds for memory fallback
    this.useRedis = true;
    this.enableAnalytics = true; // Enable database saves for analytics
    this.analyticsService = new EnhancedAnalyticsService();
  }

  /**
   * Initialize the service
   */
  async initialize() {
    if (!this.web3Service.isInitialized) {
      await this.web3Service.initialize();
    }
    
    // Initialize Redis cache
    try {
      const redisInitialized = await this.redisCache.initialize();
      if (!redisInitialized) {
        console.warn('⚠️ Redis not available, using memory cache only');
        this.useRedis = false;
      }
    } catch (error) {
      console.warn('⚠️ Redis initialization failed, using memory cache:', error.message);
      this.useRedis = false;
    }
  }

  /**
   * Get slip by ID with Redis caching
   */
  async getSlip(slipId) {
    await this.initialize();
    
    const cacheKey = `slip:${slipId}`;
    
    // Try Redis cache first
    if (this.useRedis) {
      try {
        const cached = await this.redisCache.get(cacheKey);
        if (cached) {
          return cached;
        }
      } catch (error) {
        console.warn('Redis get error, falling back to memory cache:', error.message);
      }
    }
    
    // Fallback to memory cache
    const memoryCached = this.memoryCache.get(cacheKey);
    if (memoryCached && Date.now() - memoryCached.timestamp < this.memoryCacheTTL) {
      return memoryCached.data;
    }
    
    try {
      const contract = await this.web3Service.getOddysseyContract();
      const slip = await contract.getSlip(slipId);
      
      // Format slip data
      const formattedSlip = this.formatSlipData(slip, slipId);
      
      // Cache in Redis
      if (this.useRedis) {
        try {
          await this.redisCache.set(cacheKey, formattedSlip, this.cacheTTL);
        } catch (error) {
          console.warn('Redis set error:', error.message);
        }
      }
      
      // Cache in memory as fallback
      this.memoryCache.set(cacheKey, {
        data: formattedSlip,
        timestamp: Date.now()
      });
      
      // Save to database for analytics (async, non-blocking)
      if (this.enableAnalytics) {
        this.saveSlipForAnalytics(formattedSlip, slip).then(() => {
          // Trigger analytics update after slip save
          this.analyticsService.populateOddysseyAnalytics().catch(error => {
            console.warn('Analytics aggregation failed (non-critical):', error.message);
          });
        }).catch(error => {
          console.warn('Analytics save failed (non-critical):', error.message);
        });
      }
      
      return formattedSlip;
    } catch (error) {
      // Return cached data if available during errors
      if (memoryCached) return memoryCached.data;
      throw error;
    }
  }

  /**
   * Get user slips for a specific cycle
   */
  async getUserSlipsForCycle(userAddress, cycleId) {
    await this.initialize();
    
    const cacheKey = `user-slips:${userAddress}:${cycleId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    
    try {
      const contract = await this.web3Service.getOddysseyContract();
      
      // Get slip IDs for user in cycle
      const slipIds = await contract.getUserSlipsForCycle(userAddress, cycleId);
      
      // Fetch all slips in parallel
      const slips = await Promise.all(
        slipIds.map(async (slipId) => {
          try {
            const slip = await contract.getSlip(Number(slipId));
            return this.formatSlipData(slip, Number(slipId));
          } catch (error) {
            console.warn(`Could not fetch slip ${slipId}:`, error.message);
            return null;
          }
        })
      );
      
      // Filter out failed fetches and sort by placement time
      const validSlips = slips
        .filter(slip => slip !== null)
        .sort((a, b) => b.placedAt - a.placedAt);
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: validSlips,
        timestamp: Date.now()
      });
      
      return validSlips;
    } catch (error) {
      if (cached) return cached.data;
      throw error;
    }
  }

  /**
   * Get all user slips across all cycles (paginated)
   */
  async getAllUserSlips(userAddress, limit = 50, offset = 0) {
    await this.initialize();
    
    try {
      const contract = await this.web3Service.getOddysseyContract();
      const totalSlips = await contract.slipCount();
      
      const userSlips = [];
      let found = 0;
      let skipped = 0;
      
      // Search backwards through slips (newest first)
      for (let slipId = Number(totalSlips) - 1; slipId >= 0 && found < limit + offset; slipId--) {
        try {
          const slip = await contract.getSlip(slipId);
          
          if (slip.player.toLowerCase() === userAddress.toLowerCase()) {
            if (skipped >= offset) {
              const formattedSlip = this.formatSlipData(slip, slipId);
              userSlips.push(formattedSlip);
              found++;
            } else {
              skipped++;
            }
          }
        } catch (error) {
          // Skip invalid slips
          continue;
        }
      }
      
      return userSlips;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get cycle leaderboard
   */
  async getCycleLeaderboard(cycleId) {
    await this.initialize();
    
    const cacheKey = `leaderboard:${cycleId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    
    try {
      const contract = await this.web3Service.getOddysseyContract();
      const leaderboard = await contract.getDailyLeaderboard(cycleId);
      
      // Format leaderboard data
      const formattedLeaderboard = leaderboard.map((entry, index) => ({
        rank: index + 1,
        player: entry.player,
        slipId: Number(entry.slipId),
        finalScore: entry.finalScore.toString(),
        correctCount: Number(entry.correctCount)
      })).filter(entry => entry.player !== '0x0000000000000000000000000000000000000000');
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: formattedLeaderboard,
        timestamp: Date.now()
      });
      
      return formattedLeaderboard;
    } catch (error) {
      if (cached) return cached.data;
      throw error;
    }
  }

  /**
   * Get current cycle info
   */
  async getCurrentCycleInfo() {
    await this.initialize();
    
    try {
      const contract = await this.web3Service.getOddysseyContract();
      const cycleInfo = await contract.getCurrentCycleInfo();
      
      return {
        cycleId: Number(cycleInfo.cycleId),
        state: Number(cycleInfo.state),
        endTime: Number(cycleInfo.endTime),
        prizePool: cycleInfo.prizePool.toString(),
        slipCount: Number(cycleInfo.cycleSlipCount)
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get cycle matches
   */
  async getCycleMatches(cycleId) {
    await this.initialize();
    
    const cacheKey = `matches:${cycleId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL * 2) { // Cache matches longer
      return cached.data;
    }
    
    try {
      const contract = await this.web3Service.getOddysseyContract();
      const matches = await contract.getDailyMatches(cycleId);
      
      // Format matches data
      const formattedMatches = matches.map((match, index) => ({
        id: Number(match.id),
        startTime: Number(match.startTime),
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        leagueName: match.leagueName,
        odds: {
          home: Number(match.oddsHome),
          draw: Number(match.oddsDraw),
          away: Number(match.oddsAway),
          over: Number(match.oddsOver),
          under: Number(match.oddsUnder)
        },
        result: {
          moneyline: Number(match.result.moneyline),
          overUnder: Number(match.result.overUnder)
        }
      }));
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: formattedMatches,
        timestamp: Date.now()
      });
      
      return formattedMatches;
    } catch (error) {
      if (cached) return cached.data;
      throw error;
    }
  }

  /**
   * Format slip data for consistent API responses
   */
  formatSlipData(slip, slipId) {
    return {
      slipId: Number(slipId),
      player: slip.player,
      cycleId: Number(slip.cycleId),
      placedAt: Number(slip.placedAt),
      predictions: slip.predictions.map(pred => ({
        matchId: Number(pred.matchId),
        betType: Number(pred.betType), // Keep as number for evaluation
        selection: pred.selection,
        selectedOdd: Number(pred.selectedOdd),
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        leagueName: pred.leagueName
      })),
      finalScore: slip.finalScore.toString(),
      correctCount: Number(slip.correctCount),
      isEvaluated: slip.isEvaluated,
      // Additional computed fields
      totalOdds: slip.predictions.reduce((total, pred) => 
        total * (Number(pred.selectedOdd) / 1000), 1
      ),
      placedAtDate: new Date(Number(slip.placedAt) * 1000).toISOString()
    };
  }

  /**
   * Save slip to database for analytics (async, non-blocking)
   */
  async saveSlipForAnalytics(formattedSlip, rawSlip) {
    try {
      // Check if slip already exists
      const existing = await db.query(
        'SELECT slip_id FROM oracle.oddyssey_slips WHERE slip_id = $1',
        [formattedSlip.slipId]
      );

      if (existing.rows.length > 0) {
        // Update evaluation status if changed
        if (formattedSlip.isEvaluated) {
          await db.query(`
            UPDATE oracle.oddyssey_slips SET
              is_evaluated = $1,
              correct_count = $2,
              final_score = $3,
              updated_at = NOW()
            WHERE slip_id = $4
          `, [
            formattedSlip.isEvaluated,
            formattedSlip.correctCount,
            formattedSlip.finalScore,
            formattedSlip.slipId
          ]);
        }
        return;
      }

      // Insert new slip for analytics
      await db.query(`
        INSERT INTO oracle.oddyssey_slips (
          slip_id, cycle_id, player_address, placed_at, predictions,
          final_score, correct_count, is_evaluated, 
          creator_address, category, uses_bitr, creator_stake, odds,
          pool_id, notification_type, message, is_read, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $2, 'oddyssey', FALSE, 0.5, $9, $1, 'slip_placed', 'Slip tracked for analytics', FALSE, NOW())
        ON CONFLICT (slip_id) DO NOTHING
      `, [
        formattedSlip.slipId,
        formattedSlip.cycleId,
        formattedSlip.player,
        new Date(formattedSlip.placedAt * 1000),
        JSON.stringify(formattedSlip.predictions),
        formattedSlip.finalScore,
        formattedSlip.correctCount,
        formattedSlip.isEvaluated,
        formattedSlip.totalOdds
      ]);

    } catch (error) {
      // Don't throw - this is non-critical analytics data
      console.warn(`Analytics save failed for slip ${formattedSlip.slipId}:`, error.message);
    }
  }

  /**
   * Clear cache (useful for testing or forced refresh)
   */
  clearCache() {
    if (this.useRedis) {
      // Clear Redis cache patterns
      this.redisCache.deletePattern('slip:*').catch(console.warn);
      this.redisCache.deletePattern('user-slips:*').catch(console.warn);
      this.redisCache.deletePattern('leaderboard:*').catch(console.warn);
      this.redisCache.deletePattern('matches:*').catch(console.warn);
    }
    this.memoryCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      memorySize: this.memoryCache.size,
      redisTTL: this.cacheTTL,
      memoryTTL: this.memoryCacheTTL,
      useRedis: this.useRedis,
      enableAnalytics: this.enableAnalytics,
      memoryKeys: Array.from(this.memoryCache.keys())
    };
  }
}

module.exports = UnifiedSlipService;
