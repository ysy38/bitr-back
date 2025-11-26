const db = require('../db/db');

/**
 * Schema Sync Bridge
 * 
 * Bridges data between oracle schema (contract integration) and oddyssey schema (frontend)
 * This ensures both systems stay in sync while maintaining their specific purposes:
 * - Oracle schema: Contract integration, oracle bot operations
 * - Oddyssey schema: Frontend APIs, user interface
 */
class SchemaSyncBridge {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Sync cycle data from oracle to oddyssey schema
   * Called after oracle-bot creates a new cycle
   */
  async syncCycleFromOracle(oracleCycleId) {
    try {
      console.log(`🔄 Syncing cycle ${oracleCycleId} from oracle to oddyssey schema...`);

      // Get cycle data from oracle schema
      const oracleResult = await db.query(`
        SELECT 
          cycle_id,
          matches_data,
          tx_hash,
          cycle_end_time,
          created_at,
          is_resolved,
          resolved_at
        FROM oracle.oddyssey_cycles 
        WHERE cycle_id = $1
      `, [oracleCycleId]);

      if (oracleResult.rows.length === 0) {
        throw new Error(`Oracle cycle ${oracleCycleId} not found`);
      }

      const oracleCycle = oracleResult.rows[0];
      const matchIds = Array.isArray(oracleCycle.matches_data) 
        ? oracleCycle.matches_data.map(m => m.id)
        : JSON.parse(oracleCycle.matches_data || '[]');

      // Calculate start and end dates
      const startDate = new Date(oracleCycle.created_at);
      const endDate = new Date(oracleCycle.cycle_end_time || startDate);

      // Insert/update in oddyssey schema
      await db.query(`
        INSERT INTO oracle.oddyssey_cycles (
          cycle_id, cycle_start_time, cycle_end_time, is_resolved, 
          created_at, updated_at, matches_data, matches_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (cycle_id) DO UPDATE SET
          cycle_start_time = EXCLUDED.cycle_start_time,
          cycle_end_time = EXCLUDED.cycle_end_time,
          is_resolved = EXCLUDED.is_resolved,
          updated_at = EXCLUDED.updated_at,
          matches_data = EXCLUDED.matches_data,
          matches_count = EXCLUDED.matches_count
      `, [
        parseInt(oracleCycleId),
        startDate,
        endDate,
        oracleCycle.is_resolved,
        oracleCycle.created_at,
        new Date(),
        oracleCycle.matches_data,
        Array.isArray(oracleCycle.matches_data) ? oracleCycle.matches_data.length : 0
      ]);

      // Get the oddyssey cycle ID (primary key)
      const oddysseyCycleResult = await db.query(`
        SELECT cycle_id FROM oracle.oddyssey_cycles WHERE cycle_id = $1
      `, [parseInt(oracleCycleId)]);

      const oddysseyCycleId = oddysseyCycleResult.rows[0].cycle_id;

      // Sync match data if available
      if (matchIds.length > 0) {
        await this.syncMatchesFromOracle(matchIds, oddysseyCycleId, startDate);
      }

      console.log(`✅ Successfully synced cycle ${oracleCycleId} to oddyssey schema`);
      return { success: true, oddysseyCycleId };

    } catch (error) {
      console.error(`❌ Failed to sync cycle ${oracleCycleId}:`, error);
      throw error;
    }
  }

  /**
   * Sync match data from oracle fixtures to oddyssey daily_game_matches
   */
  async syncMatchesFromOracle(matchIds, oddysseyCycleId, gameDate) {
    try {
      console.log(`🔄 Syncing ${matchIds.length} matches to oddyssey schema...`);

      for (let i = 0; i < matchIds.length; i++) {
        const fixtureId = matchIds[i];
        
        // Get fixture data from oracle schema
        const fixtureResult = await db.query(`
          SELECT 
            f.id as fixture_id,
            f.home_team,
            f.away_team,
            f.league_name,
            f.match_date,
            l.country,
            l.country_code
          FROM oracle.fixtures f
          LEFT JOIN oracle.leagues l ON f.league_id = l.league_id
          WHERE f.id = $1
        `, [fixtureId]);

        if (fixtureResult.rows.length === 0) {
          console.warn(`⚠️ Fixture ${fixtureId} not found in oracle.fixtures`);
          continue;
        }

        const fixture = fixtureResult.rows[0];

        // Get odds data
        const oddsResult = await db.query(`
          SELECT market_id, label, value, total
          FROM oracle.fixture_odds 
          WHERE fixture_id = $1 
            AND market_id IN ('1', '80', '14') -- 1X2, Over/Under 2.5, BTTS
            AND (
              (market_id = '1' AND label IN ('Home', 'Draw', 'Away')) OR
              (market_id = '80' AND total = 2.5 AND label IN ('Over', 'Under')) OR
              (market_id = '14' AND label IN ('Yes', 'No'))
            )
        `, [fixtureId]);

        // Process odds
        let homeOdds = null, drawOdds = null, awayOdds = null;
        let over25Odds = null, under25Odds = null;

        oddsResult.rows.forEach(odd => {
          if (odd.market_id === '1') {
            if (odd.label === 'Home') homeOdds = parseFloat(odd.value);
            else if (odd.label === 'Draw') drawOdds = parseFloat(odd.value);
            else if (odd.label === 'Away') awayOdds = parseFloat(odd.value);
          } else if (odd.market_id === '80' && parseFloat(odd.total) === 2.5) {
            if (odd.label === 'Over') over25Odds = parseFloat(odd.value);
            else if (odd.label === 'Under') under25Odds = parseFloat(odd.value);
          }
        });

        // Create display league name with country prefix
        let displayLeagueName = fixture.league_name;
        if (fixture.country && !fixture.league_name.toLowerCase().includes(fixture.country.toLowerCase())) {
          displayLeagueName = `${fixture.country} ${fixture.league_name}`;
        }

        // Insert into oracle.daily_game_matches
        await db.query(`
          INSERT INTO oracle.daily_game_matches (
            fixture_id, home_team, away_team, league_name, 
            match_date, game_date, home_odds, draw_odds, away_odds,
            over_25_odds, under_25_odds, display_order, cycle_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (fixture_id, cycle_id) DO UPDATE SET
            home_team = EXCLUDED.home_team,
            away_team = EXCLUDED.away_team,
            league_name = EXCLUDED.league_name,
            match_date = EXCLUDED.match_date,
            home_odds = EXCLUDED.home_odds,
            draw_odds = EXCLUDED.draw_odds,
            away_odds = EXCLUDED.away_odds,
            over_25_odds = EXCLUDED.over_25_odds,
            under_25_odds = EXCLUDED.under_25_odds
        `, [
          fixtureId,
          fixture.home_team,
          fixture.away_team,
          displayLeagueName,
          fixture.match_date,
          gameDate,
          homeOdds,
          drawOdds,
          awayOdds,
          over25Odds,
          under25Odds,
          i + 1, // display_order
          parseInt(oddysseyCycleId) // Ensure it's an integer
        ]);
      }

      console.log(`✅ Successfully synced ${matchIds.length} matches to oddyssey schema`);

    } catch (error) {
      console.error(`❌ Failed to sync matches:`, error);
      throw error;
    }
  }

  /**
   * Sync cycle resolution from oracle to oddyssey
   */
  async syncCycleResolution(oracleCycleId) {
    try {
      console.log(`🔄 Syncing cycle ${oracleCycleId} resolution...`);

      // Update oddyssey cycle status
      await db.query(`
        UPDATE oracle.oddyssey_cycles 
        SET is_resolved = TRUE, resolved_at = NOW(), updated_at = NOW()
        WHERE cycle_id = $1
      `, [parseInt(oracleCycleId)]);

      console.log(`✅ Successfully synced cycle ${oracleCycleId} resolution`);

    } catch (error) {
      console.error(`❌ Failed to sync cycle resolution:`, error);
      throw error;
    }
  }

  /**
   * Full sync - sync all oracle cycles to oddyssey schema
   */
  async fullSync() {
    try {
      console.log('🔄 Starting full schema sync...');

      // Get all oracle cycles
      const oracleResult = await db.query(`
        SELECT cycle_id FROM oracle.oddyssey_cycles ORDER BY cycle_id
      `);

      for (const row of oracleResult.rows) {
        await this.syncCycleFromOracle(row.cycle_id);
      }

      console.log('✅ Full schema sync completed');

    } catch (error) {
      console.error('❌ Full sync failed:', error);
      throw error;
    }
  }

  /**
   * Get sync status
   */
  async getSyncStatus() {
    try {
      const [oracleCount, oddysseyCount] = await Promise.all([
        db.query('SELECT COUNT(*) as count FROM oracle.oddyssey_cycles'),
        db.query('SELECT COUNT(*) as count FROM oracle.oddyssey_cycles')
      ]);

      return {
        oracleCycles: parseInt(oracleCount.rows[0].count),
        oddysseyCycles: parseInt(oddysseyCount.rows[0].count),
        inSync: oracleCount.rows[0].count === oddysseyCount.rows[0].count
      };

    } catch (error) {
      console.error('❌ Failed to get sync status:', error);
      return { error: error.message };
    }
  }
}

module.exports = SchemaSyncBridge;
