#!/usr/bin/env node

const db = require('../db/db');

/**
 * Fix the settlement chain by creating missing football prediction markets
 */
async function fixSettlementChain() {
  try {
    console.log('🔧 Fixing settlement chain for pools 0 and 1...');
    
    // Check current pool status
    const pools = await db.query(`
      SELECT pool_id, title, oracle_type, is_settled, result, category, home_team, away_team, predicted_outcome, event_end_time
      FROM oracle.pools 
      WHERE pool_id IN (0, 1) 
      ORDER BY pool_id
    `);
    
    console.log(`📊 Found ${pools.rows.length} pools to check:`);
    pools.rows.forEach(pool => {
      console.log(`Pool ${pool.pool_id}: ${pool.title} | Oracle: ${pool.oracle_type} | Settled: ${pool.is_settled}`);
    });
    
    // Check existing football markets
    const existingMarkets = await db.query(`
      SELECT pool_id, market_id, outcome_type, resolved 
      FROM oracle.football_prediction_markets 
      WHERE pool_id IN (0, 1)
      ORDER BY pool_id
    `);
    
    console.log(`\n📊 Found ${existingMarkets.rows.length} existing football markets:`);
    existingMarkets.rows.forEach(market => {
      console.log(`Pool ${market.pool_id}: Market ${market.market_id} | Type: ${market.outcome_type} | Resolved: ${market.resolved}`);
    });
    
    // Create missing football markets for GUIDED pools
    for (const pool of pools.rows) {
      if (pool.oracle_type !== 0) {
        console.log(`⚠️ Pool ${pool.pool_id}: Not a GUIDED pool (oracle_type: ${pool.oracle_type})`);
        continue;
      }
      
      // Check if football market already exists
      const existingMarket = existingMarkets.rows.find(m => m.pool_id === pool.pool_id);
      if (existingMarket) {
        console.log(`✅ Pool ${pool.pool_id}: Football market already exists`);
        continue;
      }
      
      // Check if it's a football pool
      const category = pool.category ? pool.category.toLowerCase() : '';
      if (!category.includes('football') && !category.includes('soccer')) {
        console.log(`⚠️ Pool ${pool.pool_id}: Not a football pool (category: ${pool.category})`);
        continue;
      }
      
      // Determine outcome type
      const outcomeType = determineOutcomeType(pool.predicted_outcome);
      
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
        `market_${pool.pool_id}`, // Use pool_id as market_id for now
        `market_${pool.pool_id}`,
        outcomeType,
        pool.predicted_outcome,
        pool.event_end_time
      ]);
      
      console.log(`✅ Pool ${pool.pool_id}: Created football market entry (${outcomeType})`);
    }
    
    // Check fixture results for these pools
    console.log('\n🔍 Checking fixture results...');
    const fixtures = await db.query(`
      SELECT match_id, home_team, away_team, home_score, away_score, outcome_1x2, outcome_ou25, result_info
      FROM oracle.fixture_results 
      WHERE match_id IN (
        SELECT DISTINCT fixture_id 
        FROM oracle.football_prediction_markets 
        WHERE pool_id IN (0, 1)
      )
    `);
    
    console.log(`📊 Found ${fixtures.rows.length} fixture results:`);
    fixtures.rows.forEach(fixture => {
      console.log(`Match ${fixture.match_id}: ${fixture.home_team} vs ${fixture.away_team} | Score: ${fixture.home_score}-${fixture.away_score} | 1X2: ${fixture.outcome_1x2} | OU2.5: ${fixture.outcome_ou25}`);
    });
    
    console.log('\n🎉 Settlement chain fix completed!');
    console.log('📋 Next steps:');
    console.log('1. Football Oracle Bot should now detect these markets');
    console.log('2. It will submit outcomes to GuidedOracle contract');
    console.log('3. Pool Settlement Service will detect OutcomeSubmitted events');
    console.log('4. Pools will be automatically settled');
    
  } catch (error) {
    console.error('❌ Error fixing settlement chain:', error);
    throw error;
  }
}

function determineOutcomeType(predictedOutcome) {
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

// Run the fix
async function main() {
  await fixSettlementChain();
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { fixSettlementChain, determineOutcomeType };
