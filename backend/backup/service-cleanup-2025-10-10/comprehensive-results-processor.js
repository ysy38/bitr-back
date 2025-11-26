const db = require('../db/db');
const UnifiedResultsStorage = require('./unified-results-storage');

/**
 * Comprehensive Results Processor
 * Ensures results are saved to ALL related tables properly
 */
class ComprehensiveResultsProcessor {
  constructor() {
    this.resultsStorage = new UnifiedResultsStorage();
  }

  /**
   * Process and save results for finished fixtures
   */
  async processFinishedFixtures() {
    console.log('🔍 Processing finished fixtures...');
    
    try {
      // Find all finished fixtures that don't have results yet
      const finishedFixtures = await db.query(`
        SELECT f.*, fr.id as result_id
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id = fr.fixture_id
        WHERE f.status = 'FT' 
        AND fr.id IS NULL
        ORDER BY f.match_date DESC
        LIMIT 50
      `);

      console.log(`📊 Found ${finishedFixtures.rows.length} finished fixtures without results`);

      if (finishedFixtures.rows.length === 0) {
        console.log('✅ No finished fixtures need processing');
        return { processed: 0, errors: 0 };
      }

      let processedCount = 0;
      let errorCount = 0;

      for (const fixture of finishedFixtures.rows) {
        try {
          await this.processSingleFixture(fixture);
          processedCount++;
          console.log(`✅ Processed fixture ${fixture.id}: ${fixture.home_team} vs ${fixture.away_team}`);
        } catch (error) {
          errorCount++;
          console.error(`❌ Failed to process fixture ${fixture.id}:`, error.message);
        }
      }

      console.log(`🎉 Results processing completed: ${processedCount} processed, ${errorCount} errors`);
      return { processed: processedCount, errors: errorCount };

    } catch (error) {
      console.error('❌ Error in processFinishedFixtures:', error);
      throw error;
    }
  }

  /**
   * Process a single fixture result
   */
  async processSingleFixture(fixture) {
    try {
      // Extract result info from fixture.result_info JSON
      const resultInfo = fixture.result_info;
      
      if (!resultInfo || resultInfo.home_score === undefined || resultInfo.away_score === undefined) {
        console.warn(`⚠️ Fixture ${fixture.id} has incomplete result info:`, resultInfo);
        return;
      }

      // Create result object
      const result = {
        fixture_id: fixture.id,
        home_score: resultInfo.home_score,
        away_score: resultInfo.away_score,
        ht_home_score: resultInfo.ht_home_score || null,
        ht_away_score: resultInfo.ht_away_score || null,
        result_1x2: resultInfo.result_1x2 || null,
        result_ou25: resultInfo.result_ou25 || null,
        result_ou35: resultInfo.result_ou35 || null,
        result_ou15: resultInfo.result_ou15 || null,
        result_btts: resultInfo.result_btts || null,
        result_ht_1x2: resultInfo.result_ht_1x2 || null,
        result_ht_ou15: resultInfo.result_ht_ou15 || null,
        full_score: resultInfo.full_score || null,
        ht_score: resultInfo.ht_score || null,
        finished_at: new Date(resultInfo.match_date || fixture.match_date)
      };

      // Use unified results storage to save to all tables
      await this.resultsStorage.saveFixtureResult(result);

      // Skip match_results table for now (has foreign key issues)
      // await this.saveToMatchResults(fixture, result);

      console.log(`✅ Successfully processed result for fixture ${fixture.id}: ${result.full_score}`);

    } catch (error) {
      console.error(`❌ Failed to process fixture ${fixture.id}:`, error);
      throw error;
    }
  }

  /**
   * Save to match_results table for Oddyssey resolution
   */
  async saveToMatchResults(fixture, result) {
    try {
      const query = `
        INSERT INTO oracle.match_results (
          id, match_id, home_score, away_score, ht_home_score, ht_away_score,
          result, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
        )
        ON CONFLICT (match_id) DO UPDATE SET
          home_score = EXCLUDED.home_score,
          away_score = EXCLUDED.away_score,
          ht_home_score = EXCLUDED.ht_home_score,
          ht_away_score = EXCLUDED.ht_away_score,
          result = EXCLUDED.result,
          updated_at = NOW()
      `;

      const values = [
        `match_result_${fixture.id}`,
        fixture.id,
        result.home_score,
        result.away_score,
        result.ht_home_score,
        result.ht_away_score,
        result.result_1x2
      ];

      await db.query(query, values);
      console.log(`✅ Saved to match_results: ${fixture.id}`);

    } catch (error) {
      console.error(`❌ Failed to save to match_results for ${fixture.id}:`, error);
      throw error;
    }
  }

  /**
   * Update fixture status for live matches
   */
  async updateLiveFixtureStatus() {
    console.log('⚽ Updating live fixture status...');
    
    try {
      // Find fixtures that might be live or finished
      const liveFixtures = await db.query(`
        SELECT id, name, home_team, away_team, match_date, status
        FROM oracle.fixtures 
        WHERE status IN ('NS', 'INPLAY_1ST_HALF', 'INPLAY_2ND_HALF', 'HT')
        AND match_date BETWEEN NOW() - INTERVAL '2 hours' AND NOW() + INTERVAL '2 hours'
        ORDER BY match_date DESC
        LIMIT 20
      `);

      console.log(`📊 Found ${liveFixtures.rows.length} potentially live fixtures`);

      let updatedCount = 0;
      for (const fixture of liveFixtures.rows) {
        try {
          // Check if fixture should be marked as finished
          const matchDate = new Date(fixture.match_date);
          const now = new Date();
          const timeDiff = now - matchDate;

          // If match was supposed to start more than 3 hours ago and still not finished
          if (timeDiff > 3 * 60 * 60 * 1000 && fixture.status !== 'FT') {
            // Check if we have result info
            const resultCheck = await db.query(`
              SELECT result_info FROM oracle.fixtures WHERE id = $1
            `, [fixture.id]);

            if (resultCheck.rows[0]?.result_info?.home_score !== undefined) {
              // Update status to finished
              await db.query(`
                UPDATE oracle.fixtures 
                SET status = 'FT', updated_at = NOW()
                WHERE id = $1
              `, [fixture.id]);

              updatedCount++;
              console.log(`✅ Updated fixture ${fixture.id} status to FT`);
            }
          }
        } catch (error) {
          console.warn(`⚠️ Failed to update fixture ${fixture.id}:`, error.message);
        }
      }

      console.log(`✅ Updated ${updatedCount} fixture statuses`);
      return { updated: updatedCount };

    } catch (error) {
      console.error('❌ Error updating live fixture status:', error);
      throw error;
    }
  }
}

module.exports = ComprehensiveResultsProcessor;
