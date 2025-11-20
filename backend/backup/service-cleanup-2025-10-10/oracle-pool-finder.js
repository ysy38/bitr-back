/**
 * Oracle Pool Finder Service
 * Helps oracle bot find pools that need results and provides necessary data
 */

const db = require('../db/db');

class OraclePoolFinderService {
  /**
   * Get all pools that need results (event has ended but not settled)
   */
  async getPoolsNeedingResults() {
    try {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const query = `
        SELECT 
          p.pool_id,
          p.market_id,
          p.fixture_id,
          p.home_team,
          p.away_team,
          p.readable_outcome,
          p.market_type,
          p.binary_selection,
          p.league,
          p.category,
          p.oracle_type,
          p.event_end_time,
          p.created_at
        FROM oracle.pools p
        WHERE p.pool_id IS NOT NULL
        AND p.event_end_time <= $1
        AND p.result IS NULL
        AND p.fixture_id IS NOT NULL
        ORDER BY p.event_end_time ASC
      `;
      
      const result = await db.query(query, [currentTime]);
      
      console.log(`🔍 Found ${result.rows.length} pools needing results`);
      
      return result.rows.map(row => ({
        poolId: parseInt(row.pool_id),
        marketId: row.market_id,
        fixtureId: row.fixture_id,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        readableOutcome: row.readable_outcome,
        marketType: row.market_type,
        binarySelection: row.binary_selection,
        league: row.league,
        category: row.category,
        oracleType: row.oracle_type,
        eventEndTime: parseInt(row.event_end_time),
        createdAt: new Date(row.created_at),
        // Calculate how long ago the event ended
        endedAgo: Math.floor((currentTime - parseInt(row.event_end_time)) / 60) // minutes
      }));
      
    } catch (error) {
      console.error('❌ Error getting pools needing results:', error);
      throw error;
    }
  }

  /**
   * Get pools by fixture ID (for batch processing)
   */
  async getPoolsByFixtureId(fixtureId) {
    try {
      const query = `
        SELECT 
          p.pool_id,
          p.market_id,
          p.fixture_id,
          p.home_team,
          p.away_team,
          p.readable_outcome,
          p.market_type,
          p.binary_selection,
          p.league,
          p.category,
          p.oracle_type,
          p.event_end_time,
          p.status
        FROM oracle.pools p
        WHERE p.fixture_id = $1
        AND p.pool_id IS NOT NULL
        ORDER BY p.created_at ASC
      `;
      
      const result = await db.query(query, [fixtureId]);
      
      return result.rows.map(row => ({
        poolId: parseInt(row.pool_id),
        marketId: row.market_id,
        fixtureId: row.fixture_id,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        readableOutcome: row.readable_outcome,
        marketType: row.market_type,
        binarySelection: row.binary_selection,
        league: row.league,
        category: row.category,
        oracleType: row.oracle_type,
        eventEndTime: parseInt(row.event_end_time),
        status: row.status
      }));
      
    } catch (error) {
      console.error(`❌ Error getting pools for fixture ${fixtureId}:`, error);
      throw error;
    }
  }

  /**
   * Get pools by market ID (for specific market processing)
   */
  async getPoolsByMarketId(marketId) {
    try {
      const query = `
        SELECT 
          p.pool_id,
          p.market_id,
          p.fixture_id,
          p.home_team,
          p.away_team,
          p.readable_outcome,
          p.market_type,
          p.binary_selection,
          p.league,
          p.category,
          p.oracle_type,
          p.event_end_time,
          p.status
        FROM oracle.pools p
        WHERE p.market_id = $1
        AND p.pool_id IS NOT NULL
        ORDER BY p.created_at ASC
      `;
      
      const result = await db.query(query, [marketId]);
      
      return result.rows.map(row => ({
        poolId: parseInt(row.pool_id),
        marketId: row.market_id,
        fixtureId: row.fixture_id,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        readableOutcome: row.readable_outcome,
        marketType: row.market_type,
        binarySelection: row.binary_selection,
        league: row.league,
        category: row.category,
        oracleType: row.oracle_type,
        eventEndTime: parseInt(row.event_end_time),
        status: row.status
      }));
      
    } catch (error) {
      console.error(`❌ Error getting pools for market ${marketId}:`, error);
      throw error;
    }
  }

  /**
   * Get summary of pools needing results
   */
  async getPoolsNeedingResultsSummary() {
    try {
      const currentTime = Math.floor(Date.now() / 1000);
      
      const query = `
        SELECT 
          COUNT(*) as total_pools,
          COUNT(DISTINCT fixture_id) as unique_fixtures,
          COUNT(DISTINCT market_type) as market_types,
          MIN(event_end_time) as earliest_end,
          MAX(event_end_time) as latest_end
        FROM oracle.pools p
        WHERE p.pool_id IS NOT NULL
        AND p.event_end_time <= $1
        AND p.result IS NULL
        AND p.fixture_id IS NOT NULL
      `;
      
      const result = await db.query(query, [currentTime]);
      
      if (result.rows.length > 0) {
        const summary = result.rows[0];
        return {
          totalPools: parseInt(summary.total_pools),
          uniqueFixtures: parseInt(summary.unique_fixtures),
          marketTypes: parseInt(summary.market_types),
          earliestEnd: summary.earliest_end ? new Date(parseInt(summary.earliest_end) * 1000) : null,
          latestEnd: summary.latest_end ? new Date(parseInt(summary.latest_end) * 1000) : null,
          oldestWaiting: summary.earliest_end ? Math.floor((currentTime - parseInt(summary.earliest_end)) / 3600) : 0 // hours
        };
      }
      
      return {
        totalPools: 0,
        uniqueFixtures: 0,
        marketTypes: 0,
        earliestEnd: null,
        latestEnd: null,
        oldestWaiting: 0
      };
      
    } catch (error) {
      console.error('❌ Error getting pools summary:', error);
      throw error;
    }
  }

  /**
   * Mark pool as having result submitted
   */
  async markPoolResultSubmitted(poolId, result, resultTimestamp) {
    try {
      const query = `
        UPDATE oracle.pools 
        SET 
          result = $1,
          result_timestamp = $2,
          updated_at = NOW()
        WHERE pool_id = $3
      `;
      
      await db.query(query, [result, resultTimestamp, poolId]);
      
      console.log(`✅ Marked pool ${poolId} as having result: ${result}`);
      
    } catch (error) {
      console.error(`❌ Error marking pool ${poolId} result submitted:`, error);
      throw error;
    }
  }

  /**
   * Get pools that have been waiting too long for results
   */
  async getOverduePools(hoursThreshold = 2) {
    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const thresholdTime = currentTime - (hoursThreshold * 3600);
      
      const query = `
        SELECT 
          p.pool_id,
          p.market_id,
          p.fixture_id,
          p.home_team,
          p.away_team,
          p.readable_outcome,
          p.market_type,
          p.league,
          p.event_end_time,
          EXTRACT(EPOCH FROM (NOW() - to_timestamp(p.event_end_time))) / 3600 as hours_waiting
        FROM oracle.pools p
        WHERE p.pool_id IS NOT NULL
        AND p.event_end_time <= $1
        AND p.result IS NULL
        AND p.fixture_id IS NOT NULL
        ORDER BY p.event_end_time ASC
      `;
      
      const result = await db.query(query, [thresholdTime]);
      
      return result.rows.map(row => ({
        poolId: parseInt(row.pool_id),
        marketId: row.market_id,
        fixtureId: row.fixture_id,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        readableOutcome: row.readable_outcome,
        marketType: row.market_type,
        league: row.league,
        eventEndTime: parseInt(row.event_end_time),
        hoursWaiting: parseFloat(row.hours_waiting)
      }));
      
    } catch (error) {
      console.error('❌ Error getting overdue pools:', error);
      throw error;
    }
  }
}

module.exports = OraclePoolFinderService;
