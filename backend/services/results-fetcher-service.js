const SportMonksService = require('./sportmonks');
const db = require('../db/db');

/**
 * Results Fetcher Service
 * 
 * This service handles automated fetching and saving of match results.
 * It runs periodically to ensure all completed matches have their results saved.
 */
class ResultsFetcherService {
  constructor() {
    this.sportMonks = new SportMonksService();
    this.isRunning = false;
  }

  /**
   * Main method to fetch and save results for completed matches
   */
  async fetchAndSaveResults() {
    if (this.isRunning) {
      console.log('⚠️ Results fetcher already running, skipping...');
      return { status: 'skipped', reason: 'already_running' };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('🚀 Starting results fetch and save process...');

      // Get completed matches without results
      const completedMatches = await this.getCompletedMatchesWithoutResults();
      
      if (completedMatches.length === 0) {
        console.log('✅ No completed matches without results found');
        
        // Log successful operation with 0 matches
        await this.logOperation('fetch_results', 0, true, Date.now() - startTime);
        
        return { 
          status: 'success', 
          fetched: 0, 
          saved: 0, 
          duration: Date.now() - startTime 
        };
      }

      console.log(`📊 Found ${completedMatches.length} completed matches without results`);

      // Fetch results from API
      const fixtureIds = completedMatches.map(match => match.id);
      const results = await this.sportMonks.fetchFixtureResults(fixtureIds);

      if (results.length === 0) {
        console.log('⚠️ No results fetched from API');
        return { 
          status: 'warning', 
          fetched: 0, 
          saved: 0, 
          duration: Date.now() - startTime,
          reason: 'no_results_fetched'
        };
      }

      // Save results to database
      const savedCount = await this.saveResultsToFixtures(results);

      const duration = Date.now() - startTime;
      console.log(`🎉 Results fetch and save completed in ${duration}ms: ${results.length} fetched, ${savedCount} saved`);

      // Log successful operation
      await this.logOperation('fetch_results', results.length, true, duration);

      return { 
        status: 'success', 
        fetched: results.length, 
        saved: savedCount, 
        duration,
        matches: completedMatches.length
      };

    } catch (error) {
      console.error('❌ Error in fetchAndSaveResults:', error);
      
      // Log failed operation
      await this.logOperation('fetch_results', 0, false, Date.now() - startTime, error.message);
      
      return { 
        status: 'error', 
        error: error.message, 
        duration: Date.now() - startTime 
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get completed matches that don't have results in database
   */
  
  /**
   * Get completed matches that don't have results in database
   */
  async getCompletedMatchesWithoutResults() {
    const query = `
      SELECT f.id, f.home_team, f.away_team, f.match_date, f.status, f.result_info
      FROM oracle.fixtures f
      WHERE (
        -- Option 1: Matches with finished status but no result_info
        (f.status IN ('FT', 'AET', 'PEN') AND (f.result_info IS NULL OR f.result_info = '{}' OR f.result_info = 'null'))
        OR
        -- Option 2: Matches that should be finished based on time (fallback)
        (f.match_date < NOW() - INTERVAL '3 hours' 
         AND f.status = 'NS' 
         AND (f.result_info IS NULL OR f.result_info = '{}' OR f.result_info = 'null')
         AND f.match_date > NOW() - INTERVAL '24 hours')  -- Only recent matches
      )
      ORDER BY f.match_date DESC
      LIMIT 50  -- Process in batches
    `;
    
    const result = await db.query(query);
    return result.rows;
  }

  /**
   * Log operation to database for monitoring
   */
  async logOperation(operationType, fixtureCount, success, processingTimeMs, errorMessage = null) {
    try {
      await db.query(`
        INSERT INTO oracle.results_fetching_logs (
          operation_type, fixture_count, success, processing_time_ms, error_message
        ) VALUES ($1, $2, $3, $4, $5)
      `, [operationType, fixtureCount, success, processingTimeMs, errorMessage]);
    } catch (error) {
      console.error('Failed to log operation:', error);
    }
  }

  /**
   * Get statistics about results fetching
   */
  async getResultsStats() {
    try {
      // Total completed matches
      const totalCompletedQuery = `
        SELECT COUNT(*) as total_completed
        FROM oracle.fixtures 
        WHERE status IN ('FT', 'AET', 'PEN')
      `;
      const totalCompleted = await db.query(totalCompletedQuery);

      // Matches with results
      const withResultsQuery = `
        SELECT COUNT(*) as with_results
        FROM oracle.fixtures f
        INNER JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.status IN ('FT', 'AET', 'PEN')
      `;
      const withResults = await db.query(withResultsQuery);

      // Matches without results
      const withoutResultsQuery = `
        SELECT COUNT(*) as without_results
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.status IN ('FT', 'AET', 'PEN')
          AND fr.fixture_id IS NULL
      `;
      const withoutResults = await db.query(withoutResultsQuery);

      // Recent results (last 24 hours)
      const recentResultsQuery = `
        SELECT COUNT(*) as recent_results
        FROM oracle.fixture_results 
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `;
      const recentResults = await db.query(recentResultsQuery);

      return {
        total_completed: parseInt(totalCompleted.rows[0].total_completed),
        with_results: parseInt(withResults.rows[0].with_results),
        without_results: parseInt(withoutResults.rows[0].without_results),
        recent_results: parseInt(recentResults.rows[0].recent_results),
        coverage_percentage: Math.round((parseInt(withResults.rows[0].with_results) / parseInt(totalCompleted.rows[0].total_completed)) * 100)
      };

    } catch (error) {
      console.error('❌ Error getting results stats:', error);
      return null;
    }
  }

  /**
   * Backfill missing results for past matches
   */
  async backfillMissingResults(limit = 100) {
    console.log(`🔄 Starting backfill of missing results (limit: ${limit})...`);

    try {
      const query = `
        SELECT f.id, f.home_team, f.away_team, f.match_date, f.status
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.status IN ('FT', 'AET', 'PEN')
          AND fr.fixture_id IS NULL
        ORDER BY f.match_date DESC
        LIMIT $1
      `;
      
      const result = await db.query(query, [limit]);
      const matches = result.rows;

      if (matches.length === 0) {
        console.log('✅ No missing results to backfill');
        return { status: 'success', processed: 0 };
      }

      console.log(`📊 Found ${matches.length} matches to backfill`);

      // Process in smaller batches to avoid rate limiting
      const batchSize = 10;
      let totalProcessed = 0;

      for (let i = 0; i < matches.length; i += batchSize) {
        const batch = matches.slice(i, i + batchSize);
        const fixtureIds = batch.map(match => match.id);

        console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(matches.length / batchSize)}`);

        // Fetch results for this batch
        const results = await this.sportMonks.fetchFixtureResults(fixtureIds);
        
        if (results.length > 0) {
          // Save results
          const savedCount = await this.sportMonks.saveFixtureResults(results);
          totalProcessed += savedCount;
          console.log(`✅ Batch processed: ${results.length} fetched, ${savedCount} saved`);
        }

        // Rate limiting between batches
        if (i + batchSize < matches.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      console.log(`🎉 Backfill completed: ${totalProcessed} results processed`);
      return { status: 'success', processed: totalProcessed };

    } catch (error) {
      console.error('❌ Error in backfillMissingResults:', error);
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Validate existing results in database
   */
  async validateExistingResults() {
    console.log('🔍 Validating existing results...');

    try {
      const query = `
        SELECT 
          fr.fixture_id,
          fr.home_score,
          fr.away_score,
          fr.outcome_1x2,
          fr.outcome_ou25,
          f.home_team,
          f.away_team
        FROM oracle.fixture_results fr
        INNER JOIN oracle.fixtures f ON fr.fixture_id::VARCHAR = f.id::VARCHAR
        WHERE fr.home_score IS NOT NULL 
          AND fr.away_score IS NOT NULL
        ORDER BY fr.created_at DESC
        LIMIT 20
      `;

      const result = await db.query(query);
      const results = result.rows;

      console.log(`📊 Validating ${results.length} recent results...`);

      const validationResults = results.map(row => {
        const homeScore = row.home_score;
        const awayScore = row.away_score;
        const totalGoals = homeScore + awayScore;

        // Validate 1X2 result
        let expected1x2;
        if (homeScore > awayScore) expected1x2 = '1';
        else if (homeScore === awayScore) expected1x2 = 'X';
        else expected1x2 = '2';

        // Validate Over/Under 2.5
        let expectedOU25;
        if (totalGoals > 2.5) expectedOU25 = 'Over';
        else if (totalGoals < 2.5) expectedOU25 = 'Under';
        else expectedOU25 = 'Push';

        const is1x2Valid = row.outcome_1x2 === expected1x2;
        const isOU25Valid = row.outcome_ou25 === expectedOU25;

        return {
          fixture_id: row.fixture_id,
          home_team: row.home_team,
          away_team: row.away_team,
          score: `${homeScore}-${awayScore}`,
          outcome_1x2: {
            stored: row.outcome_1x2,
            expected: expected1x2,
            valid: is1x2Valid
          },
          outcome_ou25: {
            stored: row.outcome_ou25,
            expected: expectedOU25,
            valid: isOU25Valid
          },
          is_valid: is1x2Valid && isOU25Valid
        };
      });

      const validCount = validationResults.filter(r => r.is_valid).length;
      const invalidCount = validationResults.length - validCount;

      console.log(`✅ Validation completed: ${validCount} valid, ${invalidCount} invalid`);

      return {
        total_checked: validationResults.length,
        valid_count: validCount,
        invalid_count: invalidCount,
        results: validationResults
      };

    } catch (error) {
      console.error('❌ Error validating results:', error);
      return null;
    }
  }

  /**
   * Save results directly to fixtures table result_info column
   */
  async saveResultsToFixtures(results) {
    let savedCount = 0;
    
    for (const result of results) {
      try {
        // Update the result_info column in fixtures table
        await db.query(`
          UPDATE oracle.fixtures 
          SET result_info = $1, updated_at = NOW()
          WHERE id = $2
        `, [JSON.stringify(result), result.fixture_id]);
        
        savedCount++;
        console.log(`✅ Saved result for fixture ${result.fixture_id}`);
        
      } catch (error) {
        console.error(`❌ Failed to save result for fixture ${result.fixture_id}:`, error.message);
      }
    }
    
    return savedCount;
  }
}

module.exports = ResultsFetcherService;
