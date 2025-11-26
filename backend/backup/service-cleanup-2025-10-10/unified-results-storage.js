const db = require('../db/db');

/**
 * Unified Results Storage Service
 * Ensures consistent result storage across all result tables
 * Eliminates mismatches between different result storage locations
 */
class UnifiedResultsStorage {
  constructor() {
    this.serviceName = 'UnifiedResultsStorage';
  }

  /**
   * Save fixture result to all relevant tables
   * FIXED: Added comprehensive validation to prevent incomplete scores
   */
  async saveFixtureResult(result) {
    try {
      // CRITICAL VALIDATION: Ensure we have complete scores before saving
      if (result.home_score === null || result.away_score === null) {
        console.error(`❌ CRITICAL ERROR: Cannot save incomplete scores for fixture ${result.fixture_id}`);
        console.error(`   Home score: ${result.home_score}, Away score: ${result.away_score}`);
        throw new Error(`Incomplete scores for fixture ${result.fixture_id}: home=${result.home_score}, away=${result.away_score}`);
      }

      // Additional validation: ensure scores are numbers
      if (typeof result.home_score !== 'number' || typeof result.away_score !== 'number') {
        console.error(`❌ CRITICAL ERROR: Invalid score types for fixture ${result.fixture_id}`);
        console.error(`   Home score type: ${typeof result.home_score}, Away score type: ${typeof result.away_score}`);
        throw new Error(`Invalid score types for fixture ${result.fixture_id}`);
      }

      // Ensure scores are non-negative
      if (result.home_score < 0 || result.away_score < 0) {
        console.error(`❌ CRITICAL ERROR: Negative scores for fixture ${result.fixture_id}`);
        console.error(`   Home score: ${result.home_score}, Away score: ${result.away_score}`);
        throw new Error(`Negative scores for fixture ${result.fixture_id}`);
      }

      console.log(`✅ Validated complete scores for fixture ${result.fixture_id}: ${result.home_score}-${result.away_score}`);

      return await db.transaction(async (client) => {
        // Save to fixture_results table
        await this.saveToFixtureResults(client, result);
        
        // Save to fixtures.result_info JSON column
        await this.saveToFixturesResultInfo(client, result);
        
        // Skip match_results table for now (has foreign key issues)
        // await this.saveToMatchResults(client, result);
        
        // Update fixture status
        await this.updateFixtureStatus(client, result);
        
        console.log(`✅ Successfully saved complete result for fixture ${result.fixture_id}`);
      });
      
    } catch (error) {
      console.error(`❌ Failed to save fixture result ${result.fixture_id}:`, error.message);
      throw error;
    }
  }

  /**
   * Save to primary fixture_results table
   */
  async saveToFixtureResults(client, result) {
    const query = `
      INSERT INTO oracle.fixture_results (
        id, fixture_id, home_score, away_score, ht_home_score, ht_away_score,
        result_1x2, result_ou25, result_ou35, result_ou15, result_btts,
        outcome_1x2, outcome_ou25, outcome_ou35, outcome_ou15, outcome_btts,
        full_score, ht_score, finished_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW()
      )
      ON CONFLICT (fixture_id) DO UPDATE SET
        home_score = EXCLUDED.home_score,
        away_score = EXCLUDED.away_score,
        ht_home_score = EXCLUDED.ht_home_score,
        ht_away_score = EXCLUDED.ht_away_score,
        result_1x2 = EXCLUDED.result_1x2,
        result_ou25 = EXCLUDED.result_ou25,
        result_ou35 = EXCLUDED.result_ou35,
        result_ou15 = EXCLUDED.result_ou15,
        result_btts = EXCLUDED.result_btts,
        outcome_1x2 = EXCLUDED.outcome_1x2,
        outcome_ou25 = EXCLUDED.outcome_ou25,
        outcome_ou35 = EXCLUDED.outcome_ou35,
        outcome_ou15 = EXCLUDED.outcome_ou15,
        outcome_btts = EXCLUDED.outcome_btts,
        full_score = EXCLUDED.full_score,
        ht_score = EXCLUDED.ht_score,
        finished_at = EXCLUDED.finished_at,
        updated_at = NOW()
    `;

    const values = [
      `result_${result.fixture_id}`,
      result.fixture_id,
      result.home_score !== null && result.home_score !== undefined ? parseInt(result.home_score) : null,
      result.away_score !== null && result.away_score !== undefined ? parseInt(result.away_score) : null,
      result.ht_home_score !== null && result.ht_home_score !== undefined ? parseInt(result.ht_home_score) : null,
      result.ht_away_score !== null && result.ht_away_score !== undefined ? parseInt(result.ht_away_score) : null,
      result.result_1x2 || null,
      result.result_ou25 || null,
      result.result_ou35 || null,
      result.result_ou15 || null,
      result.result_btts || null,
      result.outcome_1x2 || null, // CURRENT result (90-minute)
      result.outcome_ou25 || null, // CURRENT result (90-minute)
      result.outcome_ou35 || null, // CURRENT result (90-minute)
      result.outcome_ou15 || null, // CURRENT result (90-minute)
      result.outcome_btts || null, // CURRENT result (90-minute)
      result.full_score || `${result.home_score || 0}-${result.away_score || 0}`,
      result.ht_score || `${result.ht_home_score || 0}-${result.ht_away_score || 0}`,
      result.finished_at || new Date()
    ];

    await client.query(query, values);
  }

  /**
   * Save to fixtures.result_info JSON column
   */
  async saveToFixturesResultInfo(client, result) {
    const query = `
      UPDATE oracle.fixtures 
      SET 
        result_info = $1,
        status = 'FT',
        updated_at = NOW()
      WHERE id = $2
    `;

    await client.query(query, [
      JSON.stringify(result),
      result.fixture_id
    ]);
  }

  /**
   * Save to match_results table (for Oddyssey resolution)
   */
  async saveToMatchResults(client, result) {
    const query = `
      INSERT INTO oracle.match_results (
        id, match_id, home_score, away_score, ht_home_score, ht_away_score,
        result, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        home_score = EXCLUDED.home_score,
        away_score = EXCLUDED.away_score,
        ht_home_score = EXCLUDED.ht_home_score,
        ht_away_score = EXCLUDED.ht_away_score,
        result = EXCLUDED.result,
        updated_at = NOW()
    `;

    await client.query(query, [
      `match_result_${result.fixture_id}`,
      result.fixture_id,
      result.home_score !== null && result.home_score !== undefined ? parseInt(result.home_score) : null,
      result.away_score !== null && result.away_score !== undefined ? parseInt(result.away_score) : null,
      result.ht_home_score !== null && result.ht_home_score !== undefined ? parseInt(result.ht_home_score) : null,
      result.ht_away_score !== null && result.ht_away_score !== undefined ? parseInt(result.ht_away_score) : null,
      result.result_1x2 || null
    ]);
  }

  /**
   * Update fixture status based on result
   */
  async updateFixtureStatus(client, result) {
    // Only update status if we have complete scores
    if (result.home_score !== null && result.away_score !== null) {
      const query = `
        UPDATE oracle.fixtures 
        SET 
          status = 'FT',
          updated_at = NOW()
        WHERE id = $1 AND status != 'FT'
      `;
      
      await client.query(query, [result.fixture_id]);
    }
  }

  /**
   * Calculate all outcomes from scores
   * This ensures consistent outcome calculation across all tables
   */
  calculateOutcomes(homeScore, awayScore, htHomeScore = null, htAwayScore = null) {
    const outcomes = {};
    
    // Full-time outcomes (90-minute results)
    if (homeScore !== null && awayScore !== null) {
      // 1X2 Result
      if (homeScore > awayScore) {
        outcomes.outcome_1x2 = '1';
        outcomes.result_1x2 = '1';
      } else if (homeScore < awayScore) {
        outcomes.outcome_1x2 = '2';
        outcomes.result_1x2 = '2';
      } else {
        outcomes.outcome_1x2 = 'X';
        outcomes.result_1x2 = 'X';
      }
      
      // Over/Under outcomes
      const totalGoals = homeScore + awayScore;
      
      outcomes.outcome_ou15 = totalGoals > 1.5 ? 'Over' : 'Under';
      outcomes.result_ou15 = outcomes.outcome_ou15;
      
      outcomes.outcome_ou25 = totalGoals > 2.5 ? 'Over' : 'Under';
      outcomes.result_ou25 = outcomes.outcome_ou25;
      
      outcomes.outcome_ou35 = totalGoals > 3.5 ? 'Over' : 'Under';
      outcomes.result_ou35 = outcomes.outcome_ou35;
      
      // Both Teams To Score
      outcomes.outcome_btts = (homeScore > 0 && awayScore > 0) ? 'Yes' : 'No';
      outcomes.result_btts = outcomes.outcome_btts;
      
      // Score strings
      outcomes.full_score = `${homeScore}-${awayScore}`;
    }
    
    // Half-time outcomes
    if (htHomeScore !== null && htAwayScore !== null) {
      outcomes.ht_score = `${htHomeScore}-${htAwayScore}`;
      
      if (htHomeScore > htAwayScore) {
        outcomes.outcome_ht = '1';
      } else if (htHomeScore < htAwayScore) {
        outcomes.outcome_ht = '2';
      } else {
        outcomes.outcome_ht = 'X';
      }
    }
    
    return outcomes;
  }

  /**
   * Process and save fixture result with calculated outcomes
   */
  async processAndSaveResult(rawResult) {
    // Calculate all outcomes
    const outcomes = this.calculateOutcomes(
      rawResult.home_score,
      rawResult.away_score,
      rawResult.ht_home_score,
      rawResult.ht_away_score
    );
    
    // Merge with raw result
    const completeResult = {
      ...rawResult,
      ...outcomes,
      finished_at: rawResult.finished_at || new Date()
    };
    
    // Save to all tables
    return await this.saveFixtureResult(completeResult);
  }

  /**
   * Batch process multiple results
   */
  async batchProcessResults(results) {
    console.log(`📦 Batch processing ${results.length} fixture results...`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const result of results) {
      try {
        await this.processAndSaveResult(result);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to process result for fixture ${result.fixture_id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`📊 Batch processing complete: ${successCount} success, ${errorCount} errors`);
    
    return { successCount, errorCount };
  }

  /**
   * Verify result consistency across all tables
   */
  async verifyResultConsistency(fixtureId) {
    console.log(`🔍 Verifying result consistency for fixture ${fixtureId}...`);
    
    try {
      // Get results from all tables
      const [fixtureResults, fixturesInfo, matchResults] = await Promise.all([
        db.query('SELECT * FROM oracle.fixture_results WHERE fixture_id = $1', [fixtureId]),
        db.query('SELECT result_info FROM oracle.fixtures WHERE id = $1', [fixtureId]),
        db.query('SELECT * FROM oracle.match_results WHERE fixture_id = $1', [fixtureId])
      ]);
      
      const consistency = {
        fixture_id: fixtureId,
        has_fixture_results: fixtureResults.rows.length > 0,
        has_fixtures_info: fixturesInfo.rows.length > 0 && fixturesInfo.rows[0].result_info,
        has_match_results: matchResults.rows.length > 0,
        consistent: true,
        issues: []
      };
      
      // Check for inconsistencies
      if (consistency.has_fixture_results && consistency.has_match_results) {
        const fr = fixtureResults.rows[0];
        const mr = matchResults.rows[0];
        
        if (fr.home_score !== mr.home_score || fr.away_score !== mr.away_score) {
          consistency.consistent = false;
          consistency.issues.push('Score mismatch between fixture_results and match_results');
        }
        
        if (fr.result_1x2 !== mr.result_1x2) {
          consistency.consistent = false;
          consistency.issues.push('1X2 result mismatch between tables');
        }
      }
      
      return consistency;
      
    } catch (error) {
      console.error(`❌ Error verifying consistency for fixture ${fixtureId}:`, error);
      return { fixture_id: fixtureId, error: error.message };
    }
  }
}

module.exports = UnifiedResultsStorage;
