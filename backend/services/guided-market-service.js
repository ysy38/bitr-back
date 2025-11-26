const Web3Service = require('./web3-service');
const { ethers } = require('ethers');
const { safeBigInt } = require('../utils/bigint-serializer');

class GuidedMarketService {
  constructor() {
    this.web3Service = new Web3Service();
    this.isInitialized = false;
  }

  /**
   * Initialize the guided market service
   */
  async initialize() {
    if (!this.web3Service.isInitialized) {
      await this.web3Service.initialize();
      console.log('✅ GuidedMarketService initialized');
    }
  }

  /**
   * Decode predicted outcome hash to readable text and get team names
   */
  async decodePredictedOutcome(predictedOutcomeHash, category, odds, marketId = null) {
    let readableOutcome = predictedOutcomeHash;
    let betMarketType = null;
    let homeTeam = null;
    let awayTeam = null;
    
    try {
      // First, try to get team names from fixture mapping table if marketId is available
      if (marketId && category === 'football') {
        try {
          const db = require('../db/db');
          
          // Look up the fixture mapping using the marketId hash
          const mappingResult = await db.query(`
            SELECT fixture_id, home_team, away_team, league_name, predicted_outcome
            FROM oracle.fixture_mappings 
            WHERE market_id_hash = $1
          `, [marketId]);
          
          if (mappingResult.rows.length > 0) {
            const mapping = mappingResult.rows[0];
            homeTeam = mapping.home_team;
            awayTeam = mapping.away_team;
            
            // If we have a decoded outcome in the fixture mapping, use it
            if (mapping.predicted_outcome) {
              readableOutcome = mapping.predicted_outcome;
              betMarketType = this.determineBetMarketType(mapping.predicted_outcome);
              return { readableOutcome, betMarketType, homeTeam, awayTeam };
            }
            
            // Now create a meaningful outcome description
            if (predictedOutcomeHash.startsWith('0x')) {
              // Try to decode the hash to get the actual prediction
              const decodedOutcome = await this.decodeHash(predictedOutcomeHash);
              
              if (decodedOutcome) {
                const outcome = decodedOutcome.toLowerCase();
                
                // Create readable outcome based on the prediction
                if (['1', 'home'].includes(outcome)) {
                  readableOutcome = `${homeTeam} wins`;
                  betMarketType = "Match Result";
                } else if (['2', 'away'].includes(outcome)) {
                  readableOutcome = `${awayTeam} wins`;
                  betMarketType = "Match Result";
                } else if (['x', 'draw'].includes(outcome)) {
                  readableOutcome = `Draw between ${homeTeam} and ${awayTeam}`;
                  betMarketType = "Match Result";
                } else if (['o', 'over'].some(term => outcome.includes(term))) {
                  readableOutcome = `Over 2.5 goals in ${homeTeam} vs ${awayTeam}`;
                  betMarketType = "Goals Over/Under";
                } else if (['u', 'under'].some(term => outcome.includes(term))) {
                  readableOutcome = `Under 2.5 goals in ${homeTeam} vs ${awayTeam}`;
                  betMarketType = "Goals Over/Under";
                } else if (['btts', 'both teams'].some(term => outcome.includes(term))) {
                  if (outcome.includes('yes')) {
                    readableOutcome = `Both teams to score in ${homeTeam} vs ${awayTeam}`;
                  } else {
                    readableOutcome = `Not both teams to score in ${homeTeam} vs ${awayTeam}`;
                  }
                  betMarketType = "Both Teams To Score";
                } else {
                  // Generic outcome with team names
                  readableOutcome = `${decodedOutcome} in ${homeTeam} vs ${awayTeam}`;
                  betMarketType = "Other";
                }
              } else {
                // Fallback to generic outcome with team names
                readableOutcome = `${homeTeam} vs ${awayTeam}`;
                betMarketType = "Match Result";
              }
            } else {
              // Not a hash, use as-is with team names
              readableOutcome = `${predictedOutcomeHash} in ${homeTeam} vs ${awayTeam}`;
              betMarketType = "Match Result";
            }
          }
        } catch (dbError) {
          console.warn('Could not fetch fixture mapping data:', dbError.message);
        }
      }
      
      // If we couldn't get team names, fall back to the original logic
      if (!homeTeam || !awayTeam) {
        if (predictedOutcomeHash.startsWith('0x')) {
          try {
            // FIXED: Use proper keccak256 hash reversal instead of toUtf8String
            const decodedOutcome = await this.decodeKeccak256Hash(predictedOutcomeHash);
            if (decodedOutcome) {
              readableOutcome = decodedOutcome;
              
              // Determine bet market type based on the decoded outcome
              if (category === 'football') {
                const outcome = decodedOutcome.toLowerCase();
                if (['1', '2', 'x', 'home', 'away', 'draw'].includes(outcome)) {
                  betMarketType = "Match Result";
                } else if (['o', 'u', 'over', 'under'].some(term => outcome.includes(term))) {
                  betMarketType = "Goals Over/Under";
                } else if (['btts', 'both teams', 'yes', 'no'].some(term => outcome.includes(term))) {
                  betMarketType = "Both Teams To Score";
                } else if (['ht', 'half', 'first half'].some(term => outcome.includes(term))) {
                  betMarketType = "Half-time Result";
                } else {
                  betMarketType = "Other";
                }
              } else if (category === 'crypto') {
                betMarketType = "Price Target";
              } else {
                betMarketType = "General";
              }
            } else {
              // Fallback to generic outcome
              readableOutcome = `Prediction ${predictedOutcomeHash.substring(0, 8)}...`;
              betMarketType = "Other";
            }
          } catch (decodeError) {
            console.warn('Could not decode predicted outcome hash:', decodeError.message);
            readableOutcome = `Prediction ${predictedOutcomeHash.substring(0, 8)}...`;
            betMarketType = "Other";
          }
        } else {
          // Not a hash, use as-is
          readableOutcome = predictedOutcomeHash;
          betMarketType = "Other";
        }
      }
    } catch (error) {
      console.warn('Could not decode predicted outcome hash:', error);
      readableOutcome = "Prediction outcome";
      betMarketType = "General";
    }
    
    return { readableOutcome, betMarketType, homeTeam, awayTeam };
  }

  /**
   * Create a guided football market
   */
  async createFootballMarket(marketData) {
    await this.initialize();

    const {
      fixtureId,
      homeTeam,
      awayTeam,
      league,
      matchDate,
      outcome,
      predictedOutcome,
      odds,
      creatorStake,
      useBitr = false,
      description = '',
      isPrivate = false,
      maxBetPerUser = 0
    } = marketData;

    // Validate required fields
    if (!fixtureId || !homeTeam || !awayTeam || !league || !matchDate || !outcome || !predictedOutcome || !odds || !creatorStake) {
      throw new Error('Missing required football market parameters');
    }

    // Validate odds range
    if (odds < 101 || odds > 10000) {
      throw new Error('Odds must be between 1.01x and 100.0x (101-10000 in contract format)');
    }

    // Validate stake amounts
    const minStake = useBitr ? 1000n * 10n ** 18n : 5n * 10n ** 18n; // 1000 BITR or 5 MON
    const maxStake = 1000000n * 10n ** 18n; // 1M tokens
    const stakeAmount = BigInt(creatorStake) * 10n ** 18n;

    if (stakeAmount < minStake) {
      throw new Error(`Creator stake must be at least ${useBitr ? '1000 BITR' : '5 MON'}`);
    }

    if (stakeAmount > maxStake) {
      throw new Error('Creator stake cannot exceed 1,000,000 tokens');
    }

    // Calculate event times
    const matchTime = new Date(matchDate);
    const eventStartTime = Math.floor(matchTime.getTime() / 1000);
    const eventEndTime = eventStartTime + (2 * 60 * 60); // 2 hours after match starts

    // Validate timing
    const now = Math.floor(Date.now() / 1000);
    const bettingGracePeriod = 60; // 60 seconds
    const maxEventTime = 365 * 24 * 3600; // 365 days

    if (eventStartTime <= now + bettingGracePeriod) {
      throw new Error('Event must start at least 1 minute from now');
    }

    if (eventStartTime > now + maxEventTime) {
      throw new Error('Event cannot be more than 365 days in the future');
    }

    // Create market ID using keccak256(abi.encodePacked(fixtureId))
    // Contract expects a string, so we convert the bytes32 hash to hex string
    // The fixture ID is stored separately for easy oracle result fetching
    const marketIdHash = ethers.keccak256(ethers.solidityPacked(['uint256'], [fixtureId]));
    const marketId = marketIdHash; // Keep as hex string for contract

    // Map outcome to MarketType enum
    // MarketType enum: 0=MONEYLINE, 1=OVER_UNDER, 2=SPREAD, 3=PROPOSITION, 4=CORRECT_SCORE, 5=CUSTOM
    const mapOutcomeToMarketType = (outcomeStr, predictedOutcomeStr) => {
      if (!outcomeStr) return 0; // Default to MONEYLINE
      const outcome = outcomeStr.toLowerCase().trim();
      const predictedOutcome = (predictedOutcomeStr || '').toLowerCase();
      
      // ✅ BTTS (Both Teams To Score) - Check multiple fields for robustness
      // Explicit check for exact match first (most reliable)
      if (outcome === 'both teams to score' || outcome === 'btts') {
        console.log(`✅ [GuidedMarketService] BTTS detected from exact outcome match: "${outcomeStr}"`);
        return 3; // PROPOSITION
      }
      
      // Check outcome field for partial matches
      if (outcome.includes('both teams') || outcome.includes('btts')) {
        console.log(`✅ [GuidedMarketService] BTTS detected from outcome field: "${outcomeStr}"`);
        return 3; // PROPOSITION
      }
      
      // Also check if predictedOutcome is "Yes"/"No" AND outcome is BTTS-related
      // This handles cases where outcome might be empty or incorrectly formatted
      if ((predictedOutcome === 'yes' || predictedOutcome === 'no') &&
          (outcome.includes('both') || outcome.includes('btts') || 
           outcome.includes('score') || outcome === '')) {
        // Additional check: if we have "Yes"/"No" and no clear moneyline indicators, it's likely BTTS
        if (!outcome.includes('home') && !outcome.includes('away') && 
            !outcome.includes('draw') && !outcome.includes('win')) {
          console.log(`✅ [GuidedMarketService] BTTS detected from predictedOutcome: "${predictedOutcome}"`);
          return 3; // PROPOSITION
        }
      }
      
      // Over/Under markets
      if (outcome.includes('over/under') || outcome.includes('over under') || 
          outcome.includes('total goals') || outcome.includes('total points')) {
        return 1; // OVER_UNDER
      }
      
      // Half Time Result
      if (outcome.includes('half time') || outcome.includes('halftime') || 
          (outcome.includes('ht') && outcome.includes('result'))) {
        return 0; // MONEYLINE (treated as a 1X2 market)
      }
      
      // Full Time Result / 1X2
      if (outcome.includes('full time') || outcome.includes('result') ||
          outcome === '1x2' || outcome.includes('match result')) {
        return 0; // MONEYLINE
      }
      
      // Correct Score
      if (outcome.includes('correct score') || /\d+-\d+/.test(outcome)) {
        return 4; // CORRECT_SCORE
      }
      
      // Spread markets
      if (outcome.includes('spread') || outcome.includes('handicap')) {
        return 2; // SPREAD
      }
      
      // Default to MONEYLINE for unhandled cases
      return 0;
    };
    
    const marketType = mapOutcomeToMarketType(outcome, predictedOutcome);
    console.log(`📊 [GuidedMarketService] Mapped outcome "${outcome}" (predictedOutcome: "${predictedOutcome}") to MarketType: ${marketType}`);

    // Prepare pool data
    const poolData = {
      predictedOutcome: predictedOutcome, // Don't hash here - web3 service will hash it
      odds: odds,
      creatorStake: stakeAmount,
      eventStartTime: eventStartTime,
      eventEndTime: eventEndTime,
      league: league,
      category: 'football',
      region: 'Global', // Could be enhanced to extract from fixture data
      homeTeam: homeTeam,
      awayTeam: awayTeam,
      title: `${homeTeam} vs ${awayTeam}`,
      isPrivate: isPrivate,
      maxBetPerUser: BigInt(maxBetPerUser) * 10n ** 18n,
      useBitr: useBitr,
      oracleType: 0, // GUIDED oracle
      marketType: marketType, // ✅ FIXED: Use mapped marketType instead of hardcoded 0
      marketId: marketId
    };

    console.log('🎯 Creating guided football market:', {
      fixtureId,
      homeTeam,
      awayTeam,
      league,
      outcome,
      predictedOutcome,
      odds: odds / 100,
      creatorStake: ethers.formatEther(stakeAmount),
      eventStartTime: new Date(eventStartTime * 1000).toISOString(),
      eventEndTime: new Date(eventEndTime * 1000).toISOString(),
      useBitr,
      marketId: marketId
    });

    // Create the pool using gas-optimized web3 service
    const tx = await this.web3Service.createPool(poolData);

    // Store fixture mapping for future reference (enriched)
    await this.storeFixtureMapping({
      marketId,
      fixtureId,
      homeTeam,
      awayTeam,
      league,
      matchDate: matchTime,
      predictedOutcome, // original hash/string
      readableOutcome: (await this.decodePredictedOutcome(predictedOutcome, 'football', odds, marketId)).readableOutcome,
      marketType: (await this.decodePredictedOutcome(predictedOutcome, 'football', odds, marketId)).betMarketType,
      oddsDecimal: odds / 100,
      creatorStakeWei: stakeAmount.toString(),
      paymentToken: useBitr ? 'BITR' : 'MON',
      useBitr,
      description,
      userPosition: 'YES - Challenge Supporters'
    });

    return {
      success: true,
      transactionHash: tx.hash,
      poolId: null, // Will be available after transaction confirmation
      marketId: marketId,
      fixtureId: fixtureId,
      details: {
        homeTeam,
        awayTeam,
        league,
        outcome,
        predictedOutcome,
        odds: odds / 100,
        creatorStake: ethers.formatEther(stakeAmount),
        useBitr
      }
    };
  }

  /**
   * Create a guided cryptocurrency market
   */
  async createCryptoMarket(marketData) {
    await this.initialize();

    const {
      cryptocurrency,
      targetPrice,
      direction,
      timeframe,
      eventStartTime, // NEW: Accept event start time from frontend
      predictedOutcome,
      odds,
      creatorStake,
      useBitr = false,
      description = '',
      isPrivate = false,
      maxBetPerUser = 0
    } = marketData;

    // Validate required fields
    if (!cryptocurrency || !targetPrice || !direction || !timeframe || !eventStartTime || !predictedOutcome || !odds || !creatorStake) {
      throw new Error('Missing required cryptocurrency market parameters');
    }

    // Validate odds range
    if (odds < 101 || odds > 10000) {
      throw new Error('Odds must be between 1.01x and 100.0x (101-10000 in contract format)');
    }

    // Validate stake amounts
    const minStake = useBitr ? 1000n * 10n ** 18n : 5n * 10n ** 18n; // 1000 BITR or 5 MON
    const maxStake = 1000000n * 10n ** 18n; // 1M tokens
    const stakeAmount = BigInt(creatorStake) * 10n ** 18n;

    if (stakeAmount < minStake) {
      throw new Error(`Creator stake must be at least ${useBitr ? '1000 BITR' : '5 MON'}`);
    }

    if (stakeAmount > maxStake) {
      throw new Error('Creator stake cannot exceed 1,000,000 tokens');
    }

    // Calculate event times based on user-selected start time and timeframe duration
    const now = Math.floor(Date.now() / 1000);
    const timeframeInSeconds = this.parseTimeframe(timeframe);
    
    // ✅ ENHANCED LOGGING: Log input values for debugging
    console.log('📅 Crypto Pool Creation - Time Calculation:');
    console.log(`  Input timeframe: "${timeframe}"`);
    console.log(`  Parsed timeframe: ${timeframeInSeconds} seconds (${timeframeInSeconds / 3600} hours)`);
    console.log(`  Input eventStartTime: ${eventStartTime} (type: ${typeof eventStartTime})`);
    
    // Convert eventStartTime to Unix timestamp if it's a Date object or ISO string
    let eventStartTimestamp;
    if (typeof eventStartTime === 'string') {
      const parsedDate = new Date(eventStartTime);
      eventStartTimestamp = Math.floor(parsedDate.getTime() / 1000);
      console.log(`  Parsed eventStartTime (string): ${eventStartTimestamp} (${parsedDate.toISOString()})`);
    } else if (eventStartTime instanceof Date) {
      eventStartTimestamp = Math.floor(eventStartTime.getTime() / 1000);
      console.log(`  Parsed eventStartTime (Date): ${eventStartTimestamp} (${eventStartTime.toISOString()})`);
    } else {
      eventStartTimestamp = eventStartTime; // Assume it's already a Unix timestamp
      console.log(`  Using eventStartTime as-is (Unix timestamp): ${eventStartTimestamp} (${new Date(eventStartTimestamp * 1000).toISOString()})`);
    }
    
    const eventEndTime = eventStartTimestamp + timeframeInSeconds;
    
    // ✅ ENHANCED LOGGING: Log calculated values
    console.log(`  Calculated eventStartTime: ${eventStartTimestamp} (${new Date(eventStartTimestamp * 1000).toISOString()})`);
    console.log(`  Calculated eventEndTime: ${eventEndTime} (${new Date(eventEndTime * 1000).toISOString()})`);
    console.log(`  Timeframe duration: ${eventEndTime - eventStartTimestamp} seconds (${(eventEndTime - eventStartTimestamp) / 3600} hours)`);

    // Validate timing
    const bettingGracePeriod = 60; // 60 seconds
    const maxEventTime = 365 * 24 * 3600; // 365 days

    if (eventStartTimestamp <= now + bettingGracePeriod) {
      throw new Error('Event must start at least 1 minute from now');
    }

    if (eventStartTimestamp > now + maxEventTime) {
      throw new Error('Event cannot be more than 365 days in the future');
    }

    // Create market ID using keccak256(abi.encodePacked(crypto_symbol, targetPrice, direction, eventStartTime))
    const marketIdData = ethers.solidityPacked(
      ['string', 'uint256', 'string', 'uint256'],
      [cryptocurrency.symbol, Math.floor(targetPrice * 100), direction, eventStartTimestamp]
    );
    const marketId = ethers.keccak256(marketIdData);

    // Prepare pool data
    const poolData = {
      predictedOutcome: predictedOutcome, // Don't hash here - web3 service will hash it
      odds: odds,
      creatorStake: stakeAmount,
      eventStartTime: eventStartTimestamp,
      eventEndTime: eventEndTime,
      league: cryptocurrency.name,
      category: 'cryptocurrency',
      marketType: 5, // MarketType.CUSTOM for cryptocurrency markets
      isPrivate: isPrivate,
      maxBetPerUser: BigInt(maxBetPerUser) * 10n ** 18n,
      useBitr: useBitr,
      oracleType: 0, // GUIDED oracle
      marketId: marketId
    };

    console.log('💰 Creating guided cryptocurrency market:', {
      cryptocurrency: cryptocurrency.symbol,
      targetPrice,
      direction,
      timeframe,
      predictedOutcome,
      odds: odds / 100,
      creatorStake: ethers.formatEther(stakeAmount),
      eventStartTime: new Date(eventStartTimestamp * 1000).toISOString(),
      eventEndTime: new Date(eventEndTime * 1000).toISOString(),
      useBitr,
      marketId: marketId
    });

    // Create the pool using gas-optimized web3 service
    const tx = await this.web3Service.createPool(poolData);

    return {
      success: true,
      transactionHash: tx.hash,
      poolId: null, // Will be available after transaction confirmation
      marketId: marketId,
      details: {
        cryptocurrency: cryptocurrency.symbol,
        targetPrice,
        direction,
        timeframe,
        predictedOutcome,
        odds: odds / 100,
        creatorStake: ethers.formatEther(stakeAmount),
        useBitr
      }
    };
  }

  /**
   * Parse timeframe string to seconds
   */
  parseTimeframe(timeframe) {
    if (!timeframe) {
      throw new Error('Timeframe is required');
    }

    const normalizedInput = timeframe.toLowerCase().replace(/\s+/g, '');
    const aliasMap = {
      '1hour': '1h',
      '1hours': '1h',
      '4hour': '4h',
      '4hours': '4h',
      '1day': '1d',
      '1days': '1d',
      '3day': '3d',
      '3days': '3d',
      '7day': '7d',
      '7days': '7d',
      '1week': '1w',
      'oneweek': '1w',
      '1month': '1m',
      '30day': '1m',
      '30days': '1m'
    };

    const canonical = aliasMap[normalizedInput] || normalizedInput;

    const timeframes = {
      '1h': 60 * 60,
      '4h': 4 * 60 * 60,
      '1d': 24 * 60 * 60,
      '2d': 2 * 24 * 60 * 60,
      '3d': 3 * 24 * 60 * 60,
      '7d': 7 * 24 * 60 * 60,
      '1w': 7 * 24 * 60 * 60,
      '30d': 30 * 24 * 60 * 60,
      '1m': 30 * 24 * 60 * 60
    };

    if (timeframes[canonical]) {
      return timeframes[canonical];
    }

    // Try to parse custom timeframe (e.g., "2h", "3d", "1w")
    const match = canonical.match(/^(\d+)([hdwm])$/);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];
      const multipliers = { 
        h: 60 * 60, 
        d: 24 * 60 * 60, 
        w: 7 * 24 * 60 * 60,
        m: 30 * 24 * 60 * 60
      };
      return value * multipliers[unit];
    }

    throw new Error(`Invalid timeframe: ${timeframe}. Valid formats include 1h, 4h, 1d, 3d, 1w, 1m (and their long forms), or custom like 2h, 3d, 2w`);
  }

  /**
   * DEPRECATED: Pool statuses are now read directly from contract
   * Contract handles pool state transitions automatically
   */
  async updatePoolStatuses() {
    // No longer needed - contract handles state transitions
    console.log('🔗 Pool statuses are now read directly from contract (no database updates needed)');
    return 0;
  }

  /**
   * Get pool information - DIRECT CONTRACT IMPLEMENTATION
   */
  async getPoolInfo(poolId) {
    await this.initialize();

    try {
      console.log(`🔍 Fetching pool ${poolId} directly from contract...`);
      
      // Get pool data directly from contract
      const poolCoreContract = await this.web3Service.getPoolCoreContract();
      const poolData = await poolCoreContract.getPool(poolId);
      
      // Convert to frontend format
      let pool = await this.convertContractPoolToFrontend(poolData, poolId);
      
      // CRITICAL FIX: Fetch fixtureId from database and add it to pool data
      try {
        const db = require('../db/db');
        const dbResult = await db.query(`
          SELECT fixture_id, market_id FROM oracle.pools WHERE pool_id = $1
        `, [poolId]);
        
        if (dbResult.rows.length > 0) {
          const dbPool = dbResult.rows[0];
          // Add fixtureId: use fixture_id if available, fallback to market_id (original fixture ID)
          pool.fixtureId = dbPool.fixture_id || dbPool.market_id;
        }
      } catch (dbErr) {
        console.warn(`⚠️ Could not fetch fixtureId from DB for pool ${poolId}:`, dbErr.message);
      }
      
      // Decode hex-encoded fields for consistency with optimized-pools endpoint
      if (pool.category && typeof pool.category === 'string' && pool.category.startsWith('0x')) {
        pool.category = Buffer.from(pool.category.slice(2), 'hex').toString('utf8').replace(/\0/g, '').trim();
      }
      if (pool.homeTeam && typeof pool.homeTeam === 'string' && pool.homeTeam.startsWith('0x')) {
        pool.homeTeam = Buffer.from(pool.homeTeam.slice(2), 'hex').toString('utf8').replace(/\0/g, '').trim();
      }
      if (pool.awayTeam && typeof pool.awayTeam === 'string' && pool.awayTeam.startsWith('0x')) {
        pool.awayTeam = Buffer.from(pool.awayTeam.slice(2), 'hex').toString('utf8').replace(/\0/g, '').trim();
      }
      if (pool.league && typeof pool.league === 'string' && pool.league.startsWith('0x')) {
        pool.league = Buffer.from(pool.league.slice(2), 'hex').toString('utf8').replace(/\0/g, '').trim();
      }
      
      console.log(`✅ Pool ${poolId} fetched from contract: ${pool.title}`);
      return pool;
      
    } catch (error) {
      console.error(`❌ Error getting pool ${poolId} from contract:`, error);
      return null;
    }
  }

  /**
   * Place a bet on a pool
   */
  async placeBet(poolId, amount, options = {}) {
    await this.initialize();

    // Validate amount
    const minBet = 1n * 10n ** 18n; // 1 token minimum
    const maxBet = 100000n * 10n ** 18n; // 100K tokens maximum
    const betAmount = BigInt(amount) * 10n ** 18n;

    if (betAmount < minBet) {
      throw new Error('Bet amount must be at least 1 token');
    }

    if (betAmount > maxBet) {
      throw new Error('Bet amount cannot exceed 100,000 tokens');
    }

    console.log(`🎲 Placing bet on pool ${poolId}:`, {
      amount: ethers.formatEther(betAmount),
      options
    });

    const tx = await this.web3Service.placeBet(poolId, betAmount, options);

    // Invalidate cache for this pool's progress data
    try {
      const { delCache } = require('../config/redis');
      const cacheKey = `pool_progress:${poolId}`;
      await delCache(cacheKey);
      console.log(`🗑️ Invalidated cache for pool ${poolId} progress after bet placement`);
    } catch (error) {
      console.error('Error invalidating cache:', error);
      // Don't fail the bet placement if cache invalidation fails
    }

    return {
      success: true,
      transactionHash: tx.hash,
      poolId: poolId,
      amount: ethers.formatEther(betAmount)
    };
  }

  /**
   * Add liquidity to a pool
   */
  async addLiquidity(poolId, amount, options = {}) {
    await this.initialize();

    // Validate amount
    const minLiquidity = 1n * 10n ** 18n; // 1 token minimum
    const maxLiquidity = 500000n * 10n ** 18n; // 500K tokens maximum
    const liquidityAmount = BigInt(amount) * 10n ** 18n;

    if (liquidityAmount < minLiquidity) {
      throw new Error('Liquidity amount must be at least 1 token');
    }

    if (liquidityAmount > maxLiquidity) {
      throw new Error('Liquidity amount cannot exceed 500,000 tokens');
    }

    console.log(`💧 Adding liquidity to pool ${poolId}:`, {
      amount: ethers.formatEther(liquidityAmount),
      options
    });

    const tx = await this.web3Service.addLiquidity(poolId, liquidityAmount, options);

    // Invalidate cache for this pool's progress data
    try {
      const { delCache } = require('../config/redis');
      const cacheKey = `pool_progress:${poolId}`;
      await delCache(cacheKey);
      console.log(`🗑️ Invalidated cache for pool ${poolId} progress after liquidity addition`);
    } catch (error) {
      console.error('Error invalidating cache:', error);
      // Don't fail the liquidity addition if cache invalidation fails
    }

    return {
      success: true,
      transactionHash: tx.hash,
      poolId: poolId,
      amount: ethers.formatEther(liquidityAmount)
    };
  }

  /**
   * Settle a guided pool automatically
   */
  async settlePoolAutomatically(poolId) {
    await this.initialize();

    console.log(`🔍 Settling pool ${poolId} automatically...`);

    const contract = await this.web3Service.getPoolCoreContract();
    const tx = await contract.settlePoolAutomatically(poolId, {
      gasLimit: 1000000
    });

    return {
      success: true,
      transactionHash: tx.hash,
      poolId: poolId
    };
  }

  /**
   * Claim rewards from a pool
   */
  async claimRewards(poolId) {
    await this.initialize();

    console.log(`💰 Claiming rewards from pool ${poolId}...`);

    const tx = await this.web3Service.claimPoolRewards(poolId);

    return {
      success: true,
      transactionHash: tx.hash,
      poolId: poolId
    };
  }

  /**
   * Get pool progress metrics for UI - calculated from database with Redis caching
   */
  async getPoolProgress(poolId) {
    try {
      const { cache } = require('../config/redis');
      
      // Check cache first with longer TTL for better performance
      const cacheKey = `pool_progress:${poolId}`;
      const cachedData = await cache.get(cacheKey);
      
      if (cachedData) {
        console.log(`📦 Cache hit for pool ${poolId} progress`);
        return cachedData;
      }
      
      console.log(`💾 Cache miss for pool ${poolId} progress, fetching from database`);
      const db = require('../db/db');
      
      // Get pool data
      const poolQuery = `
        SELECT 
          pool_id, creator_address, predicted_outcome, odds, creator_stake,
          event_start_time, event_end_time, league, category, region,
          is_private, max_bet_per_user, use_bitr, oracle_type, market_id,
          status, created_at
        FROM oracle.pools 
        WHERE pool_id = $1
      `;
      
      const poolResult = await db.query(poolQuery, [poolId]);
      
      if (poolResult.rows.length === 0) {
        throw new Error('Pool not found');
      }
      
      const pool = poolResult.rows[0];
      
      // Get all bets for this pool
      const betsQuery = `
        SELECT 
          bettor_address, amount, is_for_outcome, created_at
        FROM oracle.bets 
        WHERE pool_id = $1
        ORDER BY created_at ASC
      `;
      
      const betsResult = await db.query(betsQuery, [poolId]);
      const bets = betsResult.rows;
      
      // Calculate pool progress metrics
      const totalBettorStake = bets
        .reduce((sum, bet) => sum + BigInt(bet.amount), 0n);
      
      const totalCreatorSideStake = safeBigInt(pool.creator_stake);
      
      // Calculate max bettor capacity based on odds
      const odds = BigInt(pool.odds);
      const denominator = odds - 100n;
      const maxBettorCapacity = (totalCreatorSideStake * 100n) / denominator;
      
      // Calculate total pool size
      const totalPoolSize = totalCreatorSideStake + maxBettorCapacity;
      
      // Calculate fill percentage including creator stake and LP stakes
      const totalCurrentStake = totalCreatorSideStake + totalBettorStake;
      const fillPercentage = totalPoolSize > 0n 
        ? Number((totalCurrentStake * 10000n) / totalPoolSize) / 100
        : 0;
      
      // Get participant counts
      const uniqueBettors = new Set(
        bets.map(bet => bet.bettor_address)
      );
      
      const uniqueLPs = new Set([pool.creator_address]); // Only creator for now
      
      // Calculate total volume (creator + bettors + LPs)
      const totalVolume = totalCreatorSideStake + totalBettorStake;
      
      const participantCount = uniqueBettors.size;
      const betCount = bets.length;
      const avgBetSize =
        betCount > 0 ? (Number(totalBettorStake) / betCount).toString() : '0';
      
      const progressData = {
        totalPoolSize: totalPoolSize.toString(),
        currentBettorStake: totalBettorStake.toString(),
        maxBettorCapacity: maxBettorCapacity.toString(),
        creatorSideStake: totalCreatorSideStake.toString(),
        fillPercentage: fillPercentage,
        bettorCount: participantCount,
        participantCount,
        lpCount: uniqueLPs.size,
        totalVolume: totalVolume.toString(),
        creatorStake: pool.creator_stake.toString(),
        totalCreatorSideStake: totalCreatorSideStake.toString(),
        totalBettorStake: totalBettorStake.toString(),
        maxBettorStake: maxBettorCapacity.toString(),
        betCount,
        totalBets: betCount,
        avgBetSize,
        avgBet: avgBetSize,
        odds: Number(odds) / 100, // Convert from basis points to decimal
        usesBitr: pool.use_bitr,
        poolData: {
          id: pool.pool_id,
          creator: pool.creator_address,
          predictedOutcome: pool.predicted_outcome,
          league: pool.league,
          category: pool.category,
          region: pool.region,
          isPrivate: pool.is_private,
          status: pool.status,
          createdAt: pool.created_at
        }
      };
      
      // Cache the result for 2 minutes
      await cache.set(cacheKey, progressData, 120);
      console.log(`💾 Cached pool ${poolId} progress data for 2 minutes`);
      
      // Broadcast real-time update via WebSocket
      const websocketService = require('./websocket-service');
      websocketService.updatePoolProgress(poolId, progressData);
      
      return progressData;
    } catch (error) {
      console.error('Error getting pool progress:', error);
      throw error;
    }
  }

  /**
   * Get pools by category
   */
  async getPoolsByCategory(category, limit = 20, offset = 0) {
    await this.initialize();

    try {
      // FIXED: Read from database instead of blockchain for better performance
      const db = require('../db/db');
      
      let query;
      let params;
      
      if (category === 'all') {
        // For 'all' category, get all pools (active, closed, settled)
        query = `
          SELECT 
            pool_id, creator_address, predicted_outcome, odds, creator_stake,
            event_start_time, event_end_time, league, category, region,
            is_private, max_bet_per_user, use_bitr, oracle_type, market_id,
            fixture_id, status, tx_hash, block_number, created_at
          FROM oracle.pools 
          WHERE status IN ('active', 'closed', 'settled')
          ORDER BY created_at DESC
          LIMIT $1 OFFSET $2
        `;
        params = [limit, offset];
      } else {
        // For specific category, filter by category
        query = `
          SELECT 
            pool_id, creator_address, predicted_outcome, odds, creator_stake,
            event_start_time, event_end_time, league, category, region,
            is_private, max_bet_per_user, use_bitr, oracle_type, market_id,
            fixture_id, status, tx_hash, block_number, created_at
          FROM oracle.pools 
          WHERE status IN ('active', 'closed', 'settled') AND category = $1
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3
        `;
        params = [category, limit, offset];
      }
      
      const result = await db.query(query, params);
      
      const pools = result.rows.map(row => ({
        poolId: parseInt(row.pool_id),
        pool_id: parseInt(row.pool_id), // Alternative field name
        number: parseInt(row.pool_id), // Common field name for display
        pool_number: parseInt(row.pool_id), // Another common field name
        creator: row.creator_address,
        odds: parseFloat(row.odds) / 100, // Convert from basis points
        settled: row.status === 'settled',
        creatorSideWon: row.creator_side_won || null,
        isPrivate: row.is_private,
        usesBitr: row.use_bitr,
        filledAbove60: false, // Default
        oracleType: row.oracle_type === 0 ? 'GUIDED' : 'OPEN',
        creatorStake: row.creator_stake,
        totalCreatorSideStake: row.creator_stake, // Same as creator stake for now
        maxBettorStake: row.max_bet_per_user,
        totalBettorStake: '0', // No bets yet
        predictedOutcome: row.predicted_outcome,
        result: null, // Not settled
        marketId: row.market_id,
        eventStartTime: new Date(parseInt(row.event_start_time) * 1000).toISOString(),
        eventEndTime: new Date(parseInt(row.event_end_time) * 1000).toISOString(),
        bettingEndTime: new Date(parseInt(row.event_end_time) * 1000).toISOString(), // Same as event end
        resultTimestamp: null, // Not settled
        arbitrationDeadline: null, // Not applicable
        league: row.league,
        category: row.category,
        region: row.region,
        maxBetPerUser: row.max_bet_per_user,
        txHash: row.tx_hash,
        blockNumber: parseInt(row.block_number),
        createdAt: row.created_at
      }));
      
      return pools;
    } catch (error) {
      console.error('Error getting pools by category:', error);
      return [];
    }
  }

  /**
   * Get all pools with pagination - DIRECT CONTRACT IMPLEMENTATION
   */
  async getPools(limit = 50, offset = 0) {
    await this.initialize();

    try {
      console.log('🔗 Fetching pools directly from contract (no indexing dependency)');
      
      // Get pool count from contract
      const poolCoreContract = await this.web3Service.getPoolCoreContract();
      const poolCount = await poolCoreContract.poolCount();
      const totalPools = Number(poolCount);
      
      console.log(`📊 Total pools in contract: ${totalPools}`);
      
      if (totalPools === 0) {
        return [];
      }
      
      // Calculate which pools to fetch based on pagination
      const startIndex = Math.max(0, totalPools - offset - limit);
      const endIndex = Math.max(0, totalPools - offset);
      
      const pools = [];
      
      // Fetch pools directly from contract in reverse order (newest first)
      for (let i = endIndex - 1; i >= startIndex; i--) {
        try {
          console.log(`📥 Fetching pool ${i} from contract...`);
          const poolData = await poolCoreContract.getPool(i);
          
          // Convert contract data to frontend format
          const pool = await this.convertContractPoolToFrontend(poolData, i);
          pools.push(pool);
        } catch (error) {
          console.warn(`⚠️ Could not fetch pool ${i}:`, error.message);
          continue;
        }
      }
      
      console.log(`✅ Fetched ${pools.length} pools directly from contract`);
      return pools;
      
    } catch (error) {
      console.error('❌ Error getting pools from contract:', error);
      throw error;
    }
  }

  /**
   * Convert contract pool data to frontend format
   */
  async convertContractPoolToFrontend(poolData, poolId) {
    try {
      // Extract data from contract pool struct
      const {
        creator,
        odds,
        flags,
        oracleType,
        creatorStake,
        totalCreatorSideStake,
        maxBettorStake,
        totalBettorStake,
        predictedOutcome,
        result,
        marketId,
        eventStartTime,
        eventEndTime,
        bettingEndTime,
        resultTimestamp,
        arbitrationDeadline,
        league,
        category,
        region,
        homeTeam,
        awayTeam,
        title,
        maxBetPerUser
      } = poolData;

      // Decode flags
      const settled = (Number(flags) & 1) !== 0;
      const creatorSideWon = (Number(flags) & 2) !== 0;
      const isPrivate = (Number(flags) & 4) !== 0;
      const usesBitr = (Number(flags) & 8) !== 0;
      const filledAbove60 = (Number(flags) & 16) !== 0;

      // Format amounts
      const formattedCreatorStake = ethers.formatEther(creatorStake);
      const formattedTotalBettorStake = ethers.formatEther(totalBettorStake);
      const formattedMaxBetPerUser = ethers.formatEther(maxBetPerUser);

      // Convert timestamps
      const eventStartTimeISO = new Date(Number(eventStartTime) * 1000).toISOString();
      const eventEndTimeISO = new Date(Number(eventEndTime) * 1000).toISOString();
      const bettingEndTimeISO = new Date(Number(bettingEndTime) * 1000).toISOString();
      const resultTimestampISO = Number(resultTimestamp) > 0 ? new Date(Number(resultTimestamp) * 1000).toISOString() : null;
      const arbitrationDeadlineISO = new Date(Number(arbitrationDeadline) * 1000).toISOString();

      // Decode predicted outcome for display
      const { readableOutcome, betMarketType } = await this.decodePredictedOutcome(
        predictedOutcome, 
        category, 
        Number(odds), 
        marketId
      );

      // Create structured pool object
      return {
        id: poolId,
        poolId: poolId,
        creator: creator,
        odds: Number(odds) / 100, // Convert from basis points
        settled: settled,
        creatorSideWon: creatorSideWon,
        isPrivate: isPrivate,
        usesBitr: usesBitr,
        filledAbove60: filledAbove60,
        oracleType: Number(oracleType) === 0 ? 'GUIDED' : 'OPEN',
        
        // Stake information
        creatorStake: formattedCreatorStake,
        totalCreatorSideStake: ethers.formatEther(totalCreatorSideStake),
        maxBettorStake: ethers.formatEther(maxBettorStake),
        totalBettorStake: formattedTotalBettorStake,
        
        // Outcome information
        predictedOutcome: readableOutcome,
        result: result || null,
        marketId: marketId,
        
        // Timing information
        eventStartTime: eventStartTimeISO,
        eventEndTime: eventEndTimeISO,
        bettingEndTime: bettingEndTimeISO,
        resultTimestamp: resultTimestampISO,
        arbitrationDeadline: arbitrationDeadlineISO,
        
        // Market information
        league: league,
        category: category,
        region: region,
        homeTeam: homeTeam || null,
        awayTeam: awayTeam || null,
        title: (() => {
          // Decode hex-encoded title if needed
          if (title && typeof title === 'string' && title.startsWith('0x')) {
            try {
              return Buffer.from(title.slice(2), 'hex').toString('utf8').replace(/\0/g, '').trim();
            } catch (e) {
              return title;
            }
          }
          return title || readableOutcome;
        })(),
        betMarketType: betMarketType,
        
        // Betting limits
        maxBetPerUser: formattedMaxBetPerUser,
        
        // Calculate pool metrics
        maxPoolSize: (() => {
          const creatorStakeNum = parseFloat(formattedCreatorStake);
          const decimalOdds = Number(odds) / 100;
          const maxBettorStake = creatorStakeNum / (decimalOdds - 1);
          return (creatorStakeNum + maxBettorStake).toFixed(2);
        })(),
        fillPercentage: (() => {
          const creatorStakeNum = parseFloat(formattedCreatorStake);
          const totalBettorStakeNum = parseFloat(formattedTotalBettorStake);
          const decimalOdds = Number(odds) / 100;
          const maxBettorStake = creatorStakeNum / (decimalOdds - 1);
          const maxPoolSizeNum = creatorStakeNum + maxBettorStake;
          const totalFilled = creatorStakeNum + totalBettorStakeNum;
          return maxPoolSizeNum > 0 ? (totalFilled / maxPoolSizeNum) * 100 : 0;
        })(),
        
        // Default values for compatibility
        boostTier: 'NONE',
        boostExpiry: 0,
        trending: false,
        socialStats: { likes: 0, comments: 0, views: 0 },
        change24h: 0
      };
    } catch (error) {
      console.error(`Error converting pool ${poolId}:`, error);
      throw error;
    }
  }

  /**
   * Get active pools by creator
   */
  async getActivePoolsByCreator(creatorAddress, limit = 20, offset = 0) {
    await this.initialize();

    try {
      // FIXED: Read from database instead of blockchain for better performance
      const db = require('../db/db');
      
      const query = `
        SELECT 
          pool_id, creator_address, predicted_outcome, odds, creator_stake,
          event_start_time, event_end_time, league, category, region,
          is_private, max_bet_per_user, use_bitr, oracle_type, market_id,
          fixture_id, status, tx_hash, block_number, created_at
        FROM oracle.pools 
        WHERE status = 'active' AND creator_address = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;
      
      const result = await db.query(query, [creatorAddress, limit, offset]);
      
      const pools = result.rows.map(row => {
        // Decode predicted outcome hash to readable text
        let readableOutcome = row.predicted_outcome;
        let betMarketType = null;
        
        try {
          if (row.predicted_outcome.startsWith('0x')) {
            // This is a hash, create a readable format
            if (row.category === 'football') {
              const oddsDecimal = parseFloat(row.odds) / 100;
              if (oddsDecimal >= 2.0) {
                readableOutcome = "High odds outcome";
                betMarketType = "Match Result";
              } else if (oddsDecimal >= 1.5) {
                readableOutcome = "Medium odds outcome";
                betMarketType = "Goals Over/Under";
              } else {
                readableOutcome = "Low odds outcome";
                betMarketType = "Double Chance";
              }
            } else if (row.category === 'crypto') {
              readableOutcome = "Price movement prediction";
              betMarketType = "Price Target";
            } else {
              readableOutcome = "Prediction outcome";
              betMarketType = "General";
            }
          }
        } catch (error) {
          console.warn('Could not decode predicted outcome hash:', error);
          readableOutcome = "Prediction outcome";
          betMarketType = "General";
        }

        return {
          poolId: parseInt(row.pool_id),
          pool_id: parseInt(row.pool_id), // Alternative field name
          number: parseInt(row.pool_id), // Common field name for display
          pool_number: parseInt(row.pool_id), // Another common field name
          creator: row.creator_address,
          odds: parseFloat(row.odds) / 100, // Convert from basis points
          settled: row.status === 'settled',
          creatorSideWon: row.creator_side_won || null,
          isPrivate: row.is_private,
          usesBitr: row.use_bitr,
          filledAbove60: false, // Default
          oracleType: row.oracle_type === 0 ? 'GUIDED' : 'OPEN',
          creatorStake: row.creator_stake,
          totalCreatorSideStake: row.creator_stake, // Same as creator stake for now
          maxBettorStake: row.max_bet_per_user,
          totalBettorStake: '0', // No bets yet
          predictedOutcome: readableOutcome,
          originalPredictedOutcome: row.predicted_outcome, // Keep original hash
          betMarketType: betMarketType,
          result: null, // Not settled
          marketId: row.market_id,
          eventStartTime: new Date(parseInt(row.event_start_time) * 1000).toISOString(),
          eventEndTime: new Date(parseInt(row.event_end_time) * 1000).toISOString(),
          bettingEndTime: new Date(parseInt(row.event_end_time) * 1000).toISOString(), // Same as event end
          resultTimestamp: null, // Not settled
          arbitrationDeadline: null, // Not applicable
          league: row.league,
          category: row.category,
          region: row.region,
          maxBetPerUser: row.max_bet_per_user,
          txHash: row.tx_hash,
          blockNumber: parseInt(row.block_number),
          createdAt: row.created_at
        };
      });
      
      return pools;
    } catch (error) {
      console.error('Error getting pools by creator:', error);
      return [];
    }
  }

  /**
   * Store fixture mapping for future reference
   */
  async storeFixtureMapping(marketId, fixtureId, homeTeam, awayTeam, league, additionalData = {}) {
    try {
      const db = require('../db/db');
      
      // Prepare data object with all the information
      const data = {
        marketId: marketId,
        fixtureId: fixtureId,
        homeTeam: homeTeam,
        awayTeam: awayTeam,
        league: league,
        // Merge additional data
        ...additionalData
      };

      // Ensure columns exist (idempotent ALTERs)
      await db.query(`
        DO $$ BEGIN
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS predicted_outcome TEXT;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS readable_outcome TEXT;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS market_type TEXT;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS binary_selection TEXT;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS odds_decimal NUMERIC;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS creator_stake_wei NUMERIC;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS payment_token TEXT;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS use_bitr BOOLEAN;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS description TEXT;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS user_position TEXT;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS match_date TIMESTAMP;
        EXCEPTION WHEN duplicate_column THEN NULL; END $$;
      `);
      
      // Upsert enriched mapping
      const insertQuery = `
        INSERT INTO oracle.fixture_mappings (
          market_id_hash, fixture_id, home_team, away_team, league_name,
          predicted_outcome, readable_outcome, market_type, binary_selection, odds_decimal,
          creator_stake_wei, payment_token, use_bitr, description, user_position, match_date
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
        )
        ON CONFLICT (market_id_hash) DO UPDATE SET
          fixture_id = EXCLUDED.fixture_id,
          home_team = EXCLUDED.home_team,
          away_team = EXCLUDED.away_team,
          league_name = EXCLUDED.league_name,
          predicted_outcome = COALESCE(EXCLUDED.predicted_outcome, oracle.fixture_mappings.predicted_outcome),
          readable_outcome = COALESCE(EXCLUDED.readable_outcome, oracle.fixture_mappings.readable_outcome),
          market_type = COALESCE(EXCLUDED.market_type, oracle.fixture_mappings.market_type),
          binary_selection = COALESCE(EXCLUDED.binary_selection, oracle.fixture_mappings.binary_selection),
          odds_decimal = COALESCE(EXCLUDED.odds_decimal, oracle.fixture_mappings.odds_decimal),
          creator_stake_wei = COALESCE(EXCLUDED.creator_stake_wei, oracle.fixture_mappings.creator_stake_wei),
          payment_token = COALESCE(EXCLUDED.payment_token, oracle.fixture_mappings.payment_token),
          use_bitr = COALESCE(EXCLUDED.use_bitr, oracle.fixture_mappings.use_bitr),
          description = COALESCE(EXCLUDED.description, oracle.fixture_mappings.description),
          user_position = COALESCE(EXCLUDED.user_position, oracle.fixture_mappings.user_position),
          match_date = COALESCE(EXCLUDED.match_date, oracle.fixture_mappings.match_date)
      `;
      
      await db.query(insertQuery, [
        data.marketId,
        data.fixtureId,
        data.homeTeam,
        data.awayTeam,
        data.league,
        data.predictedOutcome || null,
        data.readableOutcome || null,
        data.marketType || null,
        data.binarySelection || null,
        data.oddsDecimal || null,
        data.creatorStakeWei || null,
        data.paymentToken || null,
        data.useBitr ?? null,
        data.description || null,
        data.userPosition || null,
        data.matchDate || null
      ]);
      console.log(`✅ Stored fixture mapping: ${data.marketId} -> ${data.fixtureId} (${data.homeTeam} vs ${data.awayTeam})`);
      
      // Update the pools table with fixture_id if it exists
      const updatePoolQuery = `
        UPDATE oracle.pools 
        SET fixture_id = $1 
        WHERE market_id = $2 AND (fixture_id IS NULL OR fixture_id = '')
      `;
      
      const updateResult = await db.query(updatePoolQuery, [data.fixtureId, data.marketId]);
      if (updateResult.rowCount > 0) {
        console.log(`✅ Updated pool with fixture_id: ${data.fixtureId}`);
      }
      
    } catch (error) {
      console.warn('Could not store fixture mapping:', error.message);
    }
  }

  /**
   * Get gas cost analysis for pool creation
   */
  async analyzePoolCreationCost(poolData) {
    await this.initialize();

    return await this.web3Service.gasEstimator.analyzeGasCost('createPool', [
      poolData.predictedOutcome,
      poolData.odds,
      poolData.creatorStake,
      poolData.eventStartTime,
      poolData.eventEndTime,
      poolData.league,
      poolData.category,
      poolData.region,
      poolData.isPrivate,
      poolData.maxBetPerUser,
      poolData.useBitr,
      poolData.oracleType,
      poolData.marketId
    ], {
      value: poolData.useBitr ? 0n : poolData.creatorStake + 1n * 10n ** 18n
    });
  }

  /**
   * Validate guided oracle integration
   */
  async validateGuidedOracle(marketId) {
    await this.initialize();

    try {
      const guidedOracle = await this.web3Service.getGuidedOracleContract();
      const outcome = await guidedOracle.getOutcome(marketId);
      
      return {
        isValid: true,
        isSet: outcome.isSet,
        resultData: outcome.resultData,
        marketId: marketId
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message,
        marketId: marketId
      };
    }
  }

  /**
   * Get pool statistics - DIRECT CONTRACT IMPLEMENTATION
   */
  async getPoolStats() {
    try {
      await this.initialize();
      
      console.log('📊 Calculating pool statistics directly from contract...');
      
      // Get pool count from contract
      const poolCoreContract = await this.web3Service.getPoolCoreContract();
      const poolCount = await poolCoreContract.poolCount();
      const totalPools = Number(poolCount);
      
      if (totalPools === 0) {
        return {
          totalVolume: "0",
          bitrVolume: "0",
          sttVolume: "0",
          activeMarkets: 0,
          participants: 0,
          totalPools: 0,
          boostedPools: 0,
          comboPools: 0,
          privatePools: 0,
          bitrPools: 0
        };
      }
      
      // Sample a subset of pools for statistics (for performance)
      const sampleSize = Math.min(totalPools, 100);
      const sampleIndexes = [];
      
      // Get recent pools for sampling
      for (let i = Math.max(0, totalPools - sampleSize); i < totalPools; i++) {
        sampleIndexes.push(i);
      }
      
      let bitrVolume = 0n;
      let sttVolume = 0n;
      let privatePools = 0;
      let bitrPools = 0;
      let activePools = 0;
      
      console.log(`🔍 Sampling ${sampleSize} pools for statistics...`);
      
      for (const poolId of sampleIndexes) {
        try {
          const poolData = await poolCoreContract.getPool(poolId);
          const flags = Number(poolData.flags);
          const settled = (flags & 1) !== 0;
          const isPrivate = (flags & 4) !== 0;
          const usesBitr = (flags & 8) !== 0;
          
          // Count active pools
          if (!settled && Number(poolData.bettingEndTime) > Math.floor(Date.now() / 1000)) {
            activePools++;
          }
          
          // Count private pools
          if (isPrivate) {
            privatePools++;
          }
          
          // Count BITR pools and accumulate volume
          if (usesBitr) {
            bitrPools++;
            bitrVolume += BigInt(poolData.creatorStake);
          } else {
            sttVolume += BigInt(poolData.creatorStake);
          }
        } catch (error) {
          console.warn(`⚠️ Could not fetch pool ${poolId} for stats:`, error.message);
          continue;
        }
      }
      
      // Extrapolate from sample to total
      const extrapolationFactor = totalPools / sampleSize;
      
      const stats = {
        totalVolume: ethers.formatEther(bitrVolume + sttVolume),
        bitrVolume: ethers.formatEther(bitrVolume),
        sttVolume: ethers.formatEther(sttVolume),
        activeMarkets: Math.round(activePools * extrapolationFactor),
        participants: Math.round(totalPools * 0.8), // Estimate
        totalPools: totalPools,
        boostedPools: Math.round(totalPools * 0.1), // Estimate
        comboPools: 0, // Not implemented yet
        privatePools: Math.round(privatePools * extrapolationFactor),
        bitrPools: Math.round(bitrPools * extrapolationFactor)
      };
      
      console.log('✅ Pool statistics calculated from contract:', stats);
      return stats;
    } catch (error) {
      console.error('❌ Error getting pool stats from contract:', error);
      return {
        totalVolume: "0",
        bitrVolume: "0",
        sttVolume: "0",
        activeMarkets: 0,
        participants: 0,
        totalPools: 0,
        boostedPools: 0,
        comboPools: 0,
        privatePools: 0,
        bitrPools: 0
      };
    }
  }

  /**
   * Get service health status
   */
  async getHealthStatus() {
    try {
      await this.initialize();
      const health = await this.web3Service.healthCheck();
      
      return {
        status: 'healthy',
        web3Service: health,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Decode hash to find the original value
   */
  async decodeHash(hash) {
    const { ethers } = require('ethers');
    
    // Test common prediction values
    const testValues = [
      '1', '2', 'x', 'home', 'away', 'draw', 
      'over', 'under', 'o', 'u',
      'btts', 'both teams to score',
      'yes', 'no', 'y', 'n',
      'over_25_goals', 'under_25_goals',
      'over_15_goals', 'under_15_goals',
      'over_35_goals', 'under_35_goals'
    ];
    
    for (const value of testValues) {
      const testHash = ethers.keccak256(ethers.toUtf8Bytes(value));
      if (testHash.toLowerCase() === hash.toLowerCase()) {
        return value;
      }
    }
    
    // Test numbers
    for (let i = 0; i <= 10; i++) {
      const testHash = ethers.keccak256(ethers.toUtf8Bytes(i.toString()));
      if (testHash.toLowerCase() === hash.toLowerCase()) {
        return i.toString();
      }
    }
    
    return null;
  }

  /**
   * Boost pool visibility
   */
  async boostPool(poolId, tier) {
    try {
      await this.initialize();
      
      console.log(`🚀 Boosting pool ${poolId} with tier ${tier}`);
      
      // Convert tier to numeric value for contract
      const tierMap = {
        'BRONZE': 1,
        'SILVER': 2,
        'GOLD': 3
      };
      
      const tierValue = tierMap[tier];
      if (!tierValue) {
        throw new Error(`Invalid boost tier: ${tier}`);
      }
      
      // Call the web3 service to boost the pool
      const result = await this.web3Service.boostPool(poolId, tierValue);
      
      console.log(`✅ Pool ${poolId} boosted successfully with tier ${tier}`);
      
      return {
        poolId,
        tier,
        tierValue,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        boostExpiry: result.boostExpiry
      };
      
    } catch (error) {
      console.error(`❌ Error boosting pool ${poolId}:`, error);
      throw error;
    }
  }

  /**
   * Determine bet market type from outcome
   */
  determineBetMarketType(outcome) {
    const outcomeLower = outcome.toLowerCase();
    
    if (['wins', 'draw', '1', '2', 'x', 'home', 'away'].some(term => outcomeLower.includes(term))) {
      return "Match Result";
    } else if (['over', 'under', 'goals'].some(term => outcomeLower.includes(term))) {
      return "Goals Over/Under";
    } else if (['both teams', 'btts'].some(term => outcomeLower.includes(term))) {
      return "Both Teams To Score";
    } else if (['half', 'ht'].some(term => outcomeLower.includes(term))) {
      return "Half-time Result";
    } else {
      return "Other";
    }
  }

  /**
   * Decode keccak256 hash by testing common prediction values
   * This is the correct way to reverse keccak256 hashes
   */
  async decodeKeccak256Hash(hash) {
    if (!hash || !hash.startsWith('0x')) {
      return null;
    }

    // Test common prediction values
    const testValues = [
      // Match results
      '1', '2', 'x', 'home', 'away', 'draw',
      // Over/Under
      'over', 'under', 'o', 'u',
      'over_2.5', 'under_2.5', 'over_1.5', 'under_1.5', 'over_3.5', 'under_3.5',
      'over_25_goals', 'under_25_goals', 'over_15_goals', 'under_15_goals', 'over_35_goals', 'under_35_goals',
      // Both teams to score
      'btts', 'both teams to score', 'both teams', 'yes', 'no', 'y', 'n',
      // Half-time results
      'ht_1', 'ht_2', 'ht_x', 'ht_home', 'ht_away', 'ht_draw',
      'half_time_1', 'half_time_2', 'half_time_x',
      // Common variations
      'win', 'lose', 'tie', 'victory', 'defeat',
      'goals', 'score', 'points'
    ];
    
    for (const value of testValues) {
      const testHash = ethers.keccak256(ethers.toUtf8Bytes(value));
      if (testHash.toLowerCase() === hash.toLowerCase()) {
        return value;
      }
    }
    
    // Test numbers 0-10
    for (let i = 0; i <= 10; i++) {
      const testHash = ethers.keccak256(ethers.toUtf8Bytes(i.toString()));
      if (testHash.toLowerCase() === hash.toLowerCase()) {
        return i.toString();
      }
    }
    
    // Test decimal numbers (common in sports betting)
    const decimalValues = ['0.5', '1.5', '2.5', '3.5', '4.5', '5.5'];
    for (const value of decimalValues) {
      const testHash = ethers.keccak256(ethers.toUtf8Bytes(value));
      if (testHash.toLowerCase() === hash.toLowerCase()) {
        return value;
      }
    }
    
    return null;
  }
}

module.exports = GuidedMarketService;
