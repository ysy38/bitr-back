const db = require('./backend/db/db');
const { enrichPoolWithArbitrationInfo } = require('./backend/utils/arbitration-helper');

(async () => {
  try {
    console.log('🔍 Testing fixture_id issue...');
    
    // Get pool data with the exact same query as the API
    const poolResult = await db.query(`
      SELECT 
        p.*,
        -- Calculate effective creator side stake (matches contract logic)
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            p.total_creator_side_stake
          ELSE p.creator_stake
        END as effective_creator_side_stake,
        -- Calculate current max bettor stake dynamically (matches contract logic)
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            (p.total_creator_side_stake::numeric * 100) / (p.odds - 100)
          ELSE 
            (p.creator_stake::numeric * 100) / (p.odds - 100)
        END as current_max_bettor_stake,
        -- Calculate fill percentage including creator stake and LP stakes
        CASE 
          WHEN (p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake) AND p.total_creator_side_stake > 0 THEN 
            LEAST(100, ((p.total_creator_side_stake::numeric + p.total_bettor_stake::numeric) / (p.total_creator_side_stake::numeric + ((p.total_creator_side_stake::numeric * 100) / (p.odds - 100))) * 100))
          WHEN p.total_bettor_stake <= p.creator_stake AND p.creator_stake > 0 THEN 
            LEAST(100, ((p.creator_stake::numeric + p.total_bettor_stake::numeric) / (p.creator_stake::numeric + ((p.creator_stake::numeric * 100) / (p.odds - 100))) * 100))
          ELSE 0 
        END as fill_percentage,
        -- Calculate max pool size dynamically
        CASE 
          WHEN p.total_bettor_stake = 0 OR p.total_bettor_stake > p.creator_stake THEN 
            p.total_creator_side_stake::numeric + ((p.total_creator_side_stake::numeric * 100) / (p.odds - 100))
          ELSE 
            p.creator_stake::numeric + ((p.creator_stake::numeric * 100) / (p.odds - 100))
        END as max_pool_size
      FROM oracle.pools p
      WHERE p.pool_id = $1
    `, ['0']);
    
    const pool = poolResult.rows[0];
    console.log('✅ Raw pool.fixture_id:', pool.fixture_id);
    console.log('✅ Raw pool.category:', pool.category);
    
    // Test the poolData creation logic
    const poolData = {
      id: pool.pool_id,
      category: pool.category,
      homeTeam: pool.home_team,
      awayTeam: pool.away_team,
      league: pool.league,
      region: pool.region,
      predictedOutcome: pool.predicted_outcome,
      marketId: pool.market_id || pool.pool_id.toString(),
      marketType: pool.market_type || 'CUSTOM',
      fixtureId: pool.fixture_id,
      oracleType: 'GUIDED'
    };
    
    console.log('✅ poolData.fixtureId:', poolData.fixtureId);
    console.log('✅ poolData.category:', poolData.category);
    
    // Test the enrichment function
    const enrichedPool = enrichPoolWithArbitrationInfo(poolData);
    console.log('✅ enrichedPool.fixtureId:', enrichedPool.fixtureId);
    console.log('✅ enrichedPool.category:', enrichedPool.category);
    
    console.log('🎯 Keys in enrichedPool:', Object.keys(enrichedPool).sort());
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
