const express = require('express');
const GuidedMarketService = require('../services/guided-market-service');
const { ethers } = require('ethers');

const router = express.Router();
const guidedMarketService = new GuidedMarketService();

/**
 * POST /api/guided-markets/football
 * Create a guided football market
 */
router.post('/football', async (req, res) => {
  try {
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
    } = req.body;

    // Validate required fields
    if (!fixtureId || !homeTeam || !awayTeam || !league || !matchDate || !outcome || !predictedOutcome || !odds || !creatorStake) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: fixtureId, homeTeam, awayTeam, league, matchDate, outcome, predictedOutcome, odds, creatorStake'
      });
    }

    // Validate odds format (should be in contract format: 101 = 1.01x)
    if (odds < 101 || odds > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Odds must be between 101 and 10000 (1.01x to 100.0x in contract format)'
      });
    }

    // Validate stake amounts
    const minStake = useBitr ? 1000 : 5; // 1000 BITR or 5 STT
    const maxStake = 1000000; // 1M tokens

    if (creatorStake < minStake) {
      return res.status(400).json({
        success: false,
        error: `Creator stake must be at least ${minStake} ${useBitr ? 'BITR' : 'STT'}`
      });
    }

    if (creatorStake > maxStake) {
      return res.status(400).json({
        success: false,
        error: 'Creator stake cannot exceed 1,000,000 tokens'
      });
    }

    // Validate match date
    const matchTime = new Date(matchDate);
    const now = new Date();
    const bettingGracePeriod = 60; // 60 seconds

    if (matchTime <= new Date(now.getTime() + bettingGracePeriod * 1000)) {
      return res.status(400).json({
        success: false,
        error: 'Match must start at least 1 minute from now'
      });
    }

    if (matchTime > new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)) {
      return res.status(400).json({
        success: false,
        error: 'Match cannot be more than 365 days in the future'
      });
    }

    console.log('🎯 Creating guided football market:', {
      fixtureId,
      homeTeam,
      awayTeam,
      league,
      outcome,
      predictedOutcome,
      odds: odds / 100,
      creatorStake,
      useBitr
    });

    const result = await guidedMarketService.createFootballMarket({
      fixtureId,
      homeTeam,
      awayTeam,
      league,
      matchDate,
      outcome,
      predictedOutcome,
      odds,
      creatorStake,
      useBitr,
      description,
      isPrivate,
      maxBetPerUser
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Error creating football market:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/guided-markets/cryptocurrency
 * Create a guided cryptocurrency market
 */
router.post('/cryptocurrency', async (req, res) => {
  try {
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
    } = req.body;

    // Validate required fields
    if (!cryptocurrency || !targetPrice || !direction || !timeframe || !eventStartTime || !predictedOutcome || !odds || !creatorStake) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: cryptocurrency, targetPrice, direction, timeframe, eventStartTime, predictedOutcome, odds, creatorStake'
      });
    }

    // Validate cryptocurrency object
    if (!cryptocurrency.symbol || !cryptocurrency.name) {
      return res.status(400).json({
        success: false,
        error: 'Cryptocurrency must have symbol and name properties'
      });
    }

    // Validate target price
    if (targetPrice <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Target price must be greater than 0'
      });
    }

    // Validate direction
    if (!['above', 'below'].includes(direction)) {
      return res.status(400).json({
        success: false,
        error: 'Direction must be either "above" or "below"'
      });
    }

    // Validate timeframe using shared parser to keep logic consistent with service
    try {
      guidedMarketService.parseTimeframe(timeframe);
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: parseError.message
      });
    }

    // Validate odds format
    if (odds < 101 || odds > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Odds must be between 101 and 10000 (1.01x to 100.0x in contract format)'
      });
    }

    // Validate stake amounts
    const minStake = useBitr ? 1000 : 5; // 1000 BITR or 5 STT
    const maxStake = 1000000; // 1M tokens

    if (creatorStake < minStake) {
      return res.status(400).json({
        success: false,
        error: `Creator stake must be at least ${minStake} ${useBitr ? 'BITR' : 'STT'}`
      });
    }

    if (creatorStake > maxStake) {
      return res.status(400).json({
        success: false,
        error: 'Creator stake cannot exceed 1,000,000 tokens'
      });
    }

    console.log('💰 Creating guided cryptocurrency market:', {
      cryptocurrency: cryptocurrency.symbol,
      targetPrice,
      direction,
      timeframe,
      predictedOutcome,
      odds: odds / 100,
      creatorStake,
      useBitr
    });

    const result = await guidedMarketService.createCryptoMarket({
      cryptocurrency,
      targetPrice,
      direction,
      timeframe,
      eventStartTime, // Pass event start time to service
      predictedOutcome,
      odds,
      creatorStake,
      useBitr,
      description,
      isPrivate,
      maxBetPerUser
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Error creating cryptocurrency market:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/guided-markets/pools
 * Get all pools with pagination
 */
router.get('/pools', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const pools = await guidedMarketService.getPools(parseInt(limit), parseInt(offset));

    res.json({
      success: true,
      data: {
        pools,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: pools.length
        }
      }
    });

  } catch (error) {
    console.error('❌ Error getting pools:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/guided-markets/pools/:poolId
 * Get pool information
 * Also handles /api/pools/:poolId for backward compatibility
 */
router.get('/pools/:poolId', async (req, res) => {
  try {
    const { poolId } = req.params;
    
    console.log(`📝 GET /api/guided-markets/pools/${poolId} - ${req.ip}`);

    if (!poolId || isNaN(poolId)) {
      console.log(`❌ Invalid pool ID: ${poolId}`);
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }

    const poolInfo = await guidedMarketService.getPoolInfo(parseInt(poolId));

    if (!poolInfo) {
      console.log(`❌ Pool ${poolId} not found in database`);
      return res.status(404).json({
        success: false,
        error: 'Pool not found',
        message: `The requested prediction pool with ID ${poolId} could not be found.`
      });
    }

    console.log(`✅ Pool ${poolId} found: ${poolInfo.predictedOutcome}`);
    res.json({
      success: true,
      data: {
        pool: poolInfo
      }
    });

  } catch (error) {
    console.error('❌ Error getting pool info:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/guided-markets/pools/:poolId/bet
 * Place a bet on a pool
 */
router.post('/pools/:poolId/bet', async (req, res) => {
  try {
    const { poolId } = req.params;
    const { amount } = req.body;

    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid bet amount is required'
      });
    }

    const result = await guidedMarketService.placeBet(parseInt(poolId), amount);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Error placing bet:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/guided-markets/pools/:poolId/liquidity
 * Add liquidity to a pool
 */
router.post('/pools/:poolId/liquidity', async (req, res) => {
  try {
    const { poolId } = req.params;
    const { amount } = req.body;

    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid liquidity amount is required'
      });
    }

    const result = await guidedMarketService.addLiquidity(parseInt(poolId), amount);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Error adding liquidity:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/guided-markets/pools/:poolId/progress
 * Get pool progress metrics for UI
 */
router.get('/pools/:poolId/progress', async (req, res) => {
  try {
    const { poolId } = req.params;

    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }

    const progress = await guidedMarketService.getPoolProgress(parseInt(poolId));

    res.json({
      success: true,
      data: progress
    });

  } catch (error) {
    console.error('❌ Error getting pool progress:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/guided-markets/pools/:poolId/settle
 * Settle a pool automatically
 */
router.post('/pools/:poolId/settle', async (req, res) => {
  try {
    const { poolId } = req.params;

    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }

    const result = await guidedMarketService.settlePoolAutomatically(parseInt(poolId));

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Error settling pool:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/guided-markets/pools/:poolId/claim
 * Claim rewards from a pool
 */
router.post('/pools/:poolId/claim', async (req, res) => {
  try {
    const { poolId } = req.params;

    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }

    const result = await guidedMarketService.claimRewards(parseInt(poolId));

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Error claiming rewards:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/guided-markets/pools/category/:category
 * Get pools by category
 */
router.get('/pools/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    if (!category) {
      return res.status(400).json({
        success: false,
        error: 'Category is required'
      });
    }

    const pools = await guidedMarketService.getPoolsByCategory(category, parseInt(limit), parseInt(offset));

    res.json({
      success: true,
      data: {
        pools,
        category,
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: pools.length
      }
    });

  } catch (error) {
    console.error('❌ Error getting pools by category:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/guided-markets/pools/:poolId/boost
 * Boost pool visibility
 */
router.post('/pools/:poolId/boost', async (req, res) => {
  try {
    const { poolId } = req.params;
    const { tier } = req.body;

    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }

    if (!tier || !['BRONZE', 'SILVER', 'GOLD'].includes(tier)) {
      return res.status(400).json({
        success: false,
        error: 'Valid boost tier (BRONZE, SILVER, GOLD) is required'
      });
    }

    const result = await guidedMarketService.boostPool(parseInt(poolId), tier);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Error boosting pool:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/guided-markets/pools/creator/:address
 * Get active pools by creator
 */
router.get('/pools/creator/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({
        success: false,
        error: 'Valid creator address is required'
      });
    }

    const pools = await guidedMarketService.getActivePoolsByCreator(address, parseInt(limit), parseInt(offset));

    res.json({
      success: true,
      data: {
        pools,
        creator: address,
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: pools.length
      }
    });

  } catch (error) {
    console.error('❌ Error getting pools by creator:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/guided-markets/analyze-cost
 * Analyze gas cost for pool creation
 */
router.post('/analyze-cost', async (req, res) => {
  try {
    const poolData = req.body;

    // Validate required fields for cost analysis
    if (!poolData.predictedOutcome || !poolData.odds || !poolData.creatorStake || 
        !poolData.eventStartTime || !poolData.eventEndTime || !poolData.league || 
        !poolData.category || !poolData.region || !poolData.marketId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields for cost analysis'
      });
    }

    const costAnalysis = await guidedMarketService.analyzePoolCreationCost(poolData);

    res.json({
      success: true,
      data: costAnalysis
    });

  } catch (error) {
    console.error('❌ Error analyzing cost:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/guided-markets/validate-oracle/:marketId
 * Validate guided oracle integration
 */
router.get('/validate-oracle/:marketId', async (req, res) => {
  try {
    const { marketId } = req.params;

    if (!marketId) {
      return res.status(400).json({
        success: false,
        error: 'Market ID is required'
      });
    }

    const validation = await guidedMarketService.validateGuidedOracle(marketId);

    res.json({
      success: true,
      data: validation
    });

  } catch (error) {
    console.error('❌ Error validating oracle:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/guided-markets/stats
 * Get guided markets statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await guidedMarketService.getPoolStats();

    res.json({
      success: true,
      data: {
        stats
      }
    });

  } catch (error) {
    console.error('❌ Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health endpoint removed - use /api/unified-stats/health instead

/**
 * POST /api/guided-markets/football/prepare
 * Prepare guided football market transaction data for frontend
 */
router.post('/football/prepare', async (req, res) => {
  try {
    console.log('🎯 Football market prepare request received:', {
      body: req.body,
      headers: req.headers['content-type'],
      method: req.method,
      url: req.url
    });
    const {
      fixtureId,
      homeTeam,
      awayTeam,
      league,
      matchDate,
      outcome,
      predictedOutcome,
      selection, // Binary choice (YES/NO, OVER/UNDER, HOME/DRAW/AWAY)
      odds,
      creatorStake,
      useBitr = false,
      description = '',
      isPrivate = false,
      maxBetPerUser = 0
    } = req.body;

    // Map predictedOutcome to selection if selection is not provided
    const finalSelection = selection || predictedOutcome;

    // Validate required fields with detailed error messages
    const missingFields = [];
    if (!fixtureId) missingFields.push('fixtureId');
    if (!homeTeam) missingFields.push('homeTeam');
    if (!awayTeam) missingFields.push('awayTeam');
    if (!league) missingFields.push('league');
    if (!matchDate) missingFields.push('matchDate');
    if (!outcome) missingFields.push('outcome');
    if (!finalSelection) missingFields.push('selection/predictedOutcome');
    if (!odds) missingFields.push('odds');
    if (!creatorStake) missingFields.push('creatorStake');
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
        receivedData: {
          fixtureId,
          homeTeam,
          awayTeam,
          league,
          matchDate,
          outcome,
          predictedOutcome,
          selection,
          odds,
          creatorStake
        }
      });
    }

    // Validate selection based on outcome type
    const validSelections = {
      'Over/Under 2.5': ['OVER', 'UNDER'],
      'Over/Under 3.5': ['OVER', 'UNDER'],
      'Over/Under 1.5': ['OVER', 'UNDER'],
      'Both Teams To Score': ['YES', 'NO'],
      'Full Time Result': ['HOME', 'DRAW', 'AWAY'],
      'Half Time Result': ['HOME', 'DRAW', 'AWAY']
    };

    if (validSelections[outcome] && !validSelections[outcome].includes(finalSelection.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid selection "${finalSelection}" for outcome type "${outcome}". Valid selections: ${validSelections[outcome].join(', ')}`
      });
    }

    // Validate odds format (should be in contract format: 101 = 1.01x)
    if (odds < 101 || odds > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Odds must be between 101 and 10000 (1.01x to 100.0x in contract format)'
      });
    }

    // Validate stake amounts
    const minStake = useBitr ? 1000 : 5; // 1000 BITR or 5 STT
    const maxStake = 1000000; // 1M tokens

    if (creatorStake < minStake) {
      return res.status(400).json({
        success: false,
        error: `Creator stake must be at least ${minStake} ${useBitr ? 'BITR' : 'STT'}`
      });
    }

    if (creatorStake > maxStake) {
      return res.status(400).json({
        success: false,
        error: 'Creator stake cannot exceed 1,000,000 tokens'
      });
    }

    // Validate match date
    const matchTime = new Date(matchDate);
    const now = new Date();
    const bettingGracePeriod = 60; // 60 seconds

    if (matchTime <= new Date(now.getTime() + bettingGracePeriod * 1000)) {
      return res.status(400).json({
        success: false,
        error: 'Match must start at least 1 minute from now'
      });
    }

    if (matchTime > new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)) {
      return res.status(400).json({
        success: false,
        error: 'Match cannot be more than 365 days in the future'
      });
    }

    // Calculate event times
    const eventStartTime = Math.floor(matchTime.getTime() / 1000);
    const eventEndTime = eventStartTime + (2 * 60 * 60); // 2 hours after match starts

    // Create market ID using keccak256(abi.encodePacked(fixtureId))
    // This creates a bytes32 hash that the contract expects
    // The fixture ID is stored separately for easy oracle result fetching
    const marketId = ethers.keccak256(ethers.solidityPacked(['uint256'], [fixtureId]));

    // Convert amounts to wei
    const stakeAmountWei = ethers.parseEther(creatorStake.toString());
    const maxBetPerUserWei = ethers.parseEther(maxBetPerUser.toString());

    // Calculate total required amount including creation fee
    const creationFeeBITR = ethers.parseEther('50'); // 50 BITR creation fee
    const creationFeeSTT = ethers.parseEther('1');   // 1 STT creation fee
    const totalRequiredWei = useBitr ? 
      stakeAmountWei + creationFeeBITR : // creatorStake + 50 BITR fee
      stakeAmountWei + creationFeeSTT;   // creatorStake + 1 STT fee

    // Map outcome to MarketType enum
    // MarketType enum: 0=MONEYLINE, 1=OVER_UNDER, 2=SPREAD, 3=PROPOSITION, 4=CORRECT_SCORE, 5=CUSTOM
    const mapOutcomeToMarketType = (outcomeStr, predictedOutcomeStr, selectionStr) => {
      const outcome = (outcomeStr || '').toLowerCase().trim();
      const predictedOutcome = (predictedOutcomeStr || '').toLowerCase();
      const selection = (selectionStr || '').toLowerCase();
      
      // ✅ BTTS (Both Teams To Score) - Check multiple fields for robustness
      // Explicit check for exact match first (most reliable)
      if (outcome === 'both teams to score' || outcome === 'btts') {
        console.log(`✅ BTTS detected from exact outcome match: "${outcomeStr}"`);
        return 3; // PROPOSITION
      }
      
      // Check outcome field for partial matches
      if (outcome.includes('both teams') || outcome.includes('btts')) {
        console.log(`✅ BTTS detected from outcome field: "${outcomeStr}"`);
        return 3; // PROPOSITION
      }
      
      // Also check if predictedOutcome is "Yes"/"No" AND outcome is BTTS-related
      // This handles cases where outcome might be empty or incorrectly formatted
      if ((predictedOutcome === 'yes' || predictedOutcome === 'no' || 
           selection === 'yes' || selection === 'no') &&
          (outcome.includes('both') || outcome.includes('btts') || 
           outcome.includes('score') || outcome === '')) {
        // Additional check: if we have "Yes"/"No" and no clear moneyline indicators, it's likely BTTS
        if (!outcome.includes('home') && !outcome.includes('away') && 
            !outcome.includes('draw') && !outcome.includes('win')) {
          console.log(`✅ BTTS detected from predictedOutcome/selection: "${predictedOutcome}" / "${selection}"`);
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
    
    const marketType = mapOutcomeToMarketType(outcome, predictedOutcome, finalSelection);
    console.log(`📊 Mapped outcome "${outcome}" (predictedOutcome: "${predictedOutcome}", selection: "${finalSelection}") to MarketType: ${marketType}`);

    // Hash predicted outcome
    const predictedOutcomeHash = ethers.keccak256(ethers.toUtf8Bytes(predictedOutcome));

    // Get contract address from config
    const config = require('../config');
    const contractAddress = config.blockchain.contractAddresses.bitredictPool;

    // Store fixture mapping data EARLY - during prepare phase, not just after confirmation
    try {
      await guidedMarketService.storeFixtureMapping(marketId, fixtureId, homeTeam, awayTeam, league, {
        predictedOutcome: predictedOutcome,
        readableOutcome: `${homeTeam} vs ${awayTeam}`,
        marketType: outcome, // This is the exact market type like "Over/Under 2.5"
        binarySelection: finalSelection.toUpperCase(), // The binary choice (OVER/UNDER, YES/NO, etc.)
        oddsDecimal: odds / 100,
        creatorStakeWei: stakeAmountWei.toString(),
        paymentToken: useBitr ? 'BITR' : 'STT',
        useBitr: useBitr,
        description: description,
        userPosition: predictedOutcome, // The exact user choice like "Over 2.5 goals"
        matchDate: new Date(eventStartTime * 1000).toISOString()
      });
      console.log('✅ Fixture mapping stored during prepare phase');
    } catch (mappingError) {
      console.warn('⚠️ Could not store fixture mapping during prepare:', mappingError.message);
    }

    // Prepare transaction data for frontend (convert BigInt to string for JSON serialization)
    const transactionData = {
      contractAddress: contractAddress,
      functionName: 'createPool', // Use main createPool function
      parameters: [
        predictedOutcomeHash,
        odds,
        stakeAmountWei.toString(), // Convert BigInt to string (creator stake only)
        eventStartTime,
        eventEndTime,
        league,
        'football',
        'Global',
        homeTeam,
        awayTeam,
        `${homeTeam} vs ${awayTeam} - ${outcome}`, // title
        isPrivate,
        maxBetPerUserWei.toString(), // Convert BigInt to string
        useBitr,
        0, // GUIDED oracle type
        marketType, // ✅ FIXED: Use mapped marketType (must be at index 14, before marketId)
        marketId // ✅ FIXED: marketId must be at index 15 (last parameter)
      ],
      value: useBitr ? '0' : totalRequiredWei.toString(), // ETH value if using STT (includes fee)
      gasEstimate: '9000000', // Updated gas estimate for pool creation (increased from 2M to 9M)
      totalRequiredWei: totalRequiredWei.toString(), // Total amount needed for approval/transfer
      creationFeeWei: useBitr ? creationFeeBITR.toString() : creationFeeSTT.toString(), // Fee amount
      marketId: marketId, // ✅ FIXED: Include marketId in response so frontend has it
      marketDetails: {
        fixtureId,
        homeTeam,
        awayTeam,
        league,
        outcome, // The market type like "Over/Under 2.5"
        predictedOutcome, // The exact user choice like "Over 2.5 goals"
        selection: finalSelection.toUpperCase(), // The binary choice (OVER/UNDER, YES/NO, etc.)
        odds: odds / 100,
        creatorStake,
        useBitr,
        marketId,
        eventStartTime: new Date(eventStartTime * 1000).toISOString(),
        eventEndTime: new Date(eventEndTime * 1000).toISOString()
      }
    };

    console.log('🎯 Prepared guided football market transaction:', {
      fixtureId,
      homeTeam,
      awayTeam,
      league,
      outcome,
      predictedOutcome,
      odds: odds / 100,
      creatorStake,
      useBitr,
      marketId,
      contractAddress
    });

    res.json({
      success: true,
      data: transactionData
    });

  } catch (error) {
    console.error('❌ Error preparing football market:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/guided-markets/football/confirm
 * Confirm and index a successful market creation transaction
 */
router.post('/football/confirm', async (req, res) => {
  try {
    const { transactionHash, marketDetails } = req.body;

    if (!transactionHash || !marketDetails) {
      return res.status(400).json({
        success: false,
        error: 'Transaction hash and market details are required'
      });
    }

    console.log('✅ Market creation confirmed:', {
      transactionHash,
      fixtureId: marketDetails.fixtureId,
      homeTeam: marketDetails.homeTeam,
      awayTeam: marketDetails.awayTeam
    });

    // Store fixture mapping for future reference
    try {
      await guidedMarketService.storeFixtureMapping(
        marketDetails.marketId,
        marketDetails.fixtureId,
        marketDetails.homeTeam,
        marketDetails.awayTeam,
        marketDetails.league
      );
      console.log('✅ Fixture mapping stored successfully');
    } catch (mappingError) {
      console.warn('⚠️ Could not store fixture mapping:', mappingError.message);
    }

    // The indexer will automatically process this transaction
    // We just need to acknowledge the confirmation
    res.json({
      success: true,
      message: 'Market creation confirmed. The indexer will process the transaction.',
      transactionHash,
      marketId: marketDetails.marketId
    });

  } catch (error) {
    console.error('❌ Error confirming market creation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/guided-markets/football/markets/:fixtureId
 * Get available betting markets for a specific fixture
 */
router.get('/football/markets/:fixtureId', async (req, res) => {
  try {
    const { fixtureId } = req.params;
    
    if (!fixtureId) {
      return res.status(400).json({
        success: false,
        error: 'Fixture ID is required'
      });
    }

    const db = require('../db/db');
    
    // Get fixture details and odds
    const fixtureQuery = `
      SELECT 
        f.id,
        f.home_team,
        f.away_team,
        f.league_name,
        f.match_date,
        f.status
      FROM oracle.fixtures f
      WHERE f.id = $1
    `;
    
    const oddsQuery = `
      SELECT 
        fo.market_id,
        fo.market_description,
        fo.label,
        fo.value,
        fo.total,
        fo.bookmaker_name
      FROM oracle.fixture_odds fo
      WHERE fo.fixture_id = $1
      ORDER BY fo.market_id, fo.sort_order
    `;

    const [fixtureResult, oddsResult] = await Promise.all([
      db.query(fixtureQuery, [fixtureId]),
      db.query(oddsQuery, [fixtureId])
    ]);

    if (fixtureResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Fixture not found'
      });
    }

    const fixture = fixtureResult.rows[0];
    const odds = oddsResult.rows;

    // Group odds by market
    const marketOdds = {};
    odds.forEach(odd => {
      if (!marketOdds[odd.market_id]) {
        marketOdds[odd.market_id] = {
          marketId: odd.market_id,
          description: odd.market_description,
          bookmaker: odd.bookmaker_name,
          options: []
        };
      }
      
      marketOdds[odd.market_id].options.push({
        label: odd.label,
        value: parseFloat(odd.value),
        total: odd.total
      });
    });

    // Define available guided markets with enhanced options
    const availableMarkets = [
      {
        id: 'ft_1x2',
        name: 'Full Time Result',
        description: 'Match winner after 90 minutes',
        type: '1X2',
        category: 'fulltime',
        options: [
          { key: 'home', label: `${fixture.home_team} Win`, outcome: '1' },
          { key: 'draw', label: 'Draw', outcome: 'X' },
          { key: 'away', label: `${fixture.away_team} Win`, outcome: '2' }
        ],
        odds: marketOdds['1'] || null
      },
      {
        id: 'ht_1x2',
        name: 'Half Time Result',
        description: 'Leading team at half-time',
        type: '1X2',
        category: 'halftime',
        options: [
          { key: 'home', label: `${fixture.home_team} Leading`, outcome: '1' },
          { key: 'draw', label: 'Draw at HT', outcome: 'X' },
          { key: 'away', label: `${fixture.away_team} Leading`, outcome: '2' }
        ],
        odds: marketOdds['31'] || null
      },
      {
        id: 'ou_25',
        name: 'Total Goals Over/Under 2.5',
        description: 'Total goals scored in the match',
        type: 'OU',
        category: 'fulltime',
        threshold: 2.5,
        options: [
          { key: 'over', label: 'Over 2.5 Goals', outcome: 'Over' },
          { key: 'under', label: 'Under 2.5 Goals', outcome: 'Under' }
        ],
        odds: marketOdds['80']?.options?.filter(o => o.total === '2.5') || null
      },
      {
        id: 'ou_35',
        name: 'Total Goals Over/Under 3.5',
        description: 'Total goals scored in the match',
        type: 'OU',
        category: 'fulltime',
        threshold: 3.5,
        options: [
          { key: 'over', label: 'Over 3.5 Goals', outcome: 'Over' },
          { key: 'under', label: 'Under 3.5 Goals', outcome: 'Under' }
        ],
        odds: marketOdds['80']?.options?.filter(o => o.total === '3.5') || null
      },
      {
        id: 'ht_ou_15',
        name: '1st Half Over/Under 1.5',
        description: 'Goals scored in first half',
        type: 'OU',
        category: 'halftime',
        threshold: 1.5,
        options: [
          { key: 'over', label: 'Over 1.5 Goals (1st Half)', outcome: 'Over' },
          { key: 'under', label: 'Under 1.5 Goals (1st Half)', outcome: 'Under' }
        ],
        odds: marketOdds['28']?.options?.filter(o => o.total === '1.5') || null
      },
      {
        id: 'btts',
        name: 'Both Teams To Score',
        description: 'Both teams score at least one goal',
        type: 'BTTS',
        category: 'fulltime',
        options: [
          { key: 'yes', label: 'Both Teams Score', outcome: 'Yes' }
          // Note: Omitting 'No' option as requested
        ],
        odds: marketOdds['14']?.options?.filter(o => o.label.toLowerCase() === 'yes') || null
      }
    ];

    // Filter out markets without odds (optional - you might want to show all markets)
    const marketsWithOdds = availableMarkets.filter(market => market.odds && market.odds.length > 0);

    res.json({
      success: true,
      fixture: {
        id: fixture.id,
        homeTeam: fixture.home_team,
        awayTeam: fixture.away_team,
        league: fixture.league_name,
        matchDate: fixture.match_date,
        status: fixture.status
      },
      markets: availableMarkets, // Return all markets, frontend can decide what to show
      marketsWithOdds: marketsWithOdds.length,
      totalMarkets: availableMarkets.length
    });

  } catch (error) {
    console.error('❌ Error fetching fixture markets:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/guided-markets/recent-bets
 * Get the 10 most recent bets and pool creations across all pools for the moving lane
 */
router.get('/recent-bets', async (req, res) => {
  try {
    const { cache } = require('../config/redis');
    
    // Check cache first
    const cacheKey = 'recent_bets:latest';
    const cachedData = await cache.get(cacheKey);
    
    if (cachedData) {
      console.log('📦 Cache hit for recent bets');
      return res.json({
        success: true,
        data: cachedData
      });
    }
    
    console.log('💾 Cache miss for recent bets, fetching from database');
    const db = require('../db/db');
    
    // Get the 10 most recent bets with pool and user information
    const recentBetsQuery = `
      SELECT 
        b.transaction_hash as id,
        b.pool_id,
        b.bettor_address,
        b.amount,
        b.is_for_outcome,
        b.created_at,
        p.predicted_outcome,
        p.league,
        p.category,
        p.home_team,
        p.away_team,
        p.title,
        p.use_bitr,
        p.odds,
        p.creator_address,
        'bet' as event_type
      FROM oracle.bets b
      INNER JOIN oracle.pools p ON b.pool_id::bigint = p.pool_id
      ORDER BY b.created_at DESC
      LIMIT 10
    `;
    
    // Get the 10 most recent pool creations
    const recentPoolsQuery = `
      SELECT 
        p.pool_id as id,
        p.pool_id,
        p.creator_address as bettor_address,
        p.creator_stake as amount,
        false as is_for_outcome,
        p.created_at,
        p.predicted_outcome,
        p.league,
        p.category,
        p.home_team,
        p.away_team,
        p.title,
        p.use_bitr,
        p.odds,
        p.creator_address,
        'pool_created' as event_type
      FROM oracle.pools p
      ORDER BY p.created_at DESC
      LIMIT 10
    `;
    
    const [betsResult, poolsResult] = await Promise.all([
      db.query(recentBetsQuery),
      db.query(recentPoolsQuery)
    ]);
    
    // Combine and sort all events by creation time
    const allEvents = [...betsResult.rows, ...poolsResult.rows]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10);
    
    const recentBets = allEvents;
    
    // Format the response for the frontend
    const formattedBets = recentBets.map(event => ({
      id: event.id,
      poolId: event.pool_id,
      bettorAddress: event.bettor_address,
      amount: event.amount,
      amountFormatted: (parseFloat(event.amount) / 1e18).toFixed(2),
      isForOutcome: event.is_for_outcome,
      createdAt: event.created_at,
      timeAgo: getTimeAgo(event.created_at),
      eventType: event.event_type,
      pool: {
        predictedOutcome: event.predicted_outcome,
        league: event.league,
        category: event.category,
        homeTeam: event.home_team,
        awayTeam: event.away_team,
        title: event.title,
        useBitr: event.use_bitr,
        odds: event.odds,
        creatorAddress: event.creator_address
      }
    }));
    
    const responseData = {
      recentBets: formattedBets,
      count: formattedBets.length
    };
    
    // Cache the result for 1 minute
    await cache.set(cacheKey, responseData, 60);
    console.log('💾 Cached recent bets data for 1 minute');
    
    // Broadcast real-time update via WebSocket
    const websocketService = require('../services/websocket-service');
    websocketService.updateRecentBets(responseData);
    
    res.json({
      success: true,
      data: responseData
    });
    
  } catch (error) {
    console.error('❌ Error fetching recent bets:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Helper function to calculate time ago
 */
function getTimeAgo(dateString) {
  const now = new Date();
  const betTime = new Date(dateString);
  const diffMs = now - betTime;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${diffDays}d ago`;
  }
}

module.exports = router;
