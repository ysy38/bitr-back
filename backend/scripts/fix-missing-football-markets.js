#!/usr/bin/env node

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

/**
 * Fix missing football prediction markets for existing pools
 */
class FootballMarketFixer {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    
    // Load contract ABI
    let PoolCoreABI;
    try {
      PoolCoreABI = require('../solidity/BitredictPoolCore.json').abi;
    } catch (error) {
      console.warn('⚠️ PoolCore ABI not found, using minimal ABI');
      PoolCoreABI = [
        'function pools(uint256) external view returns (tuple(uint256 creatorStake, uint256 totalStake, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 arbitrationDeadline, uint256 oracleType, uint256 marketId, bytes32 predictedOutcome, bytes32 result, uint256 flags, uint256 resultTimestamp, bytes32 league, bytes32 category, bytes32 region, bytes32 homeTeam, bytes32 awayTeam, bytes32 title, bool isPrivate, uint256 maxBetPerUser, bool useBitr, uint256 totalCreatorSideStake, uint256 maxBettorStake, uint256 totalBettorStake, uint256 odds))'
      ];
    }
    
    this.contract = new ethers.Contract(
      config.blockchain.contractAddresses.poolCore,
      PoolCoreABI,
      this.provider
    );
  }

  async fixMissingMarkets() {
    try {
      console.log('🔍 Checking for missing football prediction markets...');
      
      // Get all GUIDED pools (oracle_type = 0) from database
      const pools = await db.query(`
        SELECT pool_id, title, oracle_type, category, home_team, away_team, predicted_outcome, event_end_time
        FROM oracle.pools 
        WHERE oracle_type = 0 
        ORDER BY pool_id
      `);
      
      console.log(`📊 Found ${pools.rows.length} GUIDED pools`);
      
      for (const pool of pools.rows) {
        console.log(`\n🔍 Checking Pool ${pool.pool_id}: ${pool.title}`);
        
        // Check if football prediction market already exists
        const existingMarket = await db.query(`
          SELECT id FROM oracle.football_prediction_markets 
          WHERE pool_id = $1
        `, [pool.pool_id]);
        
        if (existingMarket.rows.length > 0) {
          console.log(`✅ Pool ${pool.pool_id}: Football market already exists`);
          continue;
        }
        
        // Check if it's a football pool
        const category = pool.category ? pool.category.toLowerCase() : '';
        if (!category.includes('football') && !category.includes('soccer')) {
          console.log(`⚠️ Pool ${pool.pool_id}: Not a football pool (category: ${pool.category})`);
          continue;
        }
        
        // Get market_id from contract
        const contractPool = await this.contract.pools(pool.pool_id);
        const marketId = contractPool.marketId;
        
        if (!marketId || marketId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          console.log(`⚠️ Pool ${pool.pool_id}: No market_id in contract`);
          continue;
        }
        
        // Determine outcome type from predicted outcome
        const outcomeType = this.determineOutcomeType(pool.predicted_outcome);
        
        // Create football prediction market entry
        await db.query(`
          INSERT INTO oracle.football_prediction_markets (
            id, pool_id, fixture_id, market_id, outcome_type, predicted_outcome,
            end_time, resolved, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, to_timestamp($7), false, NOW(), NOW()
          )
        `, [
          `pool_${pool.pool_id}_${Date.now()}`,
          pool.pool_id.toString(),
          marketId,
          marketId,
          outcomeType,
          pool.predicted_outcome,
          pool.event_end_time
        ]);
        
        console.log(`✅ Pool ${pool.pool_id}: Created football market entry (${outcomeType})`);
      }
      
      console.log('\n🎉 Football market fix completed!');
      
    } catch (error) {
      console.error('❌ Error fixing football markets:', error);
      throw error;
    }
  }

  determineOutcomeType(predictedOutcome) {
    if (!predictedOutcome) return '1X2';
    
    const outcome = predictedOutcome.toLowerCase();
    
    if (outcome.includes('over') || outcome.includes('under')) {
      if (outcome.includes('0.5')) return 'OU05';
      if (outcome.includes('1.5')) return 'OU15';
      if (outcome.includes('2.5')) return 'OU25';
      if (outcome.includes('3.5')) return 'OU35';
      return 'OU25'; // Default
    }
    
    if (outcome.includes('btts') || outcome.includes('both teams')) {
      return 'BTTS';
    }
    
    if (outcome.includes('half') || outcome.includes('ht')) {
      if (outcome.includes('over') || outcome.includes('under')) {
        if (outcome.includes('0.5')) return 'HT_OU05';
        if (outcome.includes('1.5')) return 'HT_OU15';
      }
      return 'HT_1X2';
    }
    
    // Default to 1X2 for team vs team predictions
    return '1X2';
  }
}

// Run the fix
async function main() {
  const fixer = new FootballMarketFixer();
  await fixer.fixMissingMarkets();
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = FootballMarketFixer;
