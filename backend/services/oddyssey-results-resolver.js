const SportMonksService = require('./sportmonks');
const db = require('../db/db');

class OddysseyResultsResolver {
  constructor() {
    this.sportmonksService = new SportMonksService();
    this.isRunning = false;
    this.resolutionInterval = null;
  }

  /**
   * Start the results resolver service
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ OddysseyResultsResolver: Already running');
      return;
    }

    try {
      console.log('🚀 Starting OddysseyResultsResolver...');
      
      this.isRunning = true;
      
      // Run resolution every 10 minutes
      this.resolutionInterval = setInterval(async () => {
        if (!this.isRunning) return;
        
        try {
          await this.resolveAllPendingCycles();
        } catch (error) {
          console.error('❌ Error during automatic cycle resolution:', error);
        }
      }, 10 * 60 * 1000); // 10 minutes
      
      // Run initial resolution after 30 seconds
      setTimeout(async () => {
        try {
          await this.resolveAllPendingCycles();
        } catch (error) {
          console.error('❌ Error during initial cycle resolution:', error);
        }
      }, 30000);
      
      console.log('✅ OddysseyResultsResolver started successfully');
      
    } catch (error) {
      console.error('❌ Failed to start OddysseyResultsResolver:', error);
      throw error;
    }
  }

  /**
   * Stop the results resolver service
   */
  async stop() {
    if (!this.isRunning) {
      console.log('⚠️ OddysseyResultsResolver: Not running');
      return;
    }

    this.isRunning = false;
    
    if (this.resolutionInterval) {
      clearInterval(this.resolutionInterval);
      this.resolutionInterval = null;
    }
    
    console.log('🛑 OddysseyResultsResolver stopped');
  }

  /**
   * SMART RESOLUTION: Check and resolve all pending Oddyssey cycles
   * Only resolves cycles where matches have actually started
   */
  async resolveAllPendingCycles() {
    try {
      console.log('🔍 SMART RESOLUTION: Checking for Oddyssey cycles needing resolution...');

      // CRITICAL FIX: Check BOTH tables for unresolved cycles
      // current_oddyssey_cycle: Active cycle
      // oddyssey_cycles: All cycles including past ones
      const result = await db.query(`
        SELECT 
          cycle_id, 
          matches_data, 
          matches_count,
          cycle_end_time as end_time,
          created_at
        FROM oracle.oddyssey_cycles 
        WHERE is_resolved = false 
          AND cycle_end_time < NOW()
          AND cycle_end_time > NOW() - INTERVAL '7 days'
        ORDER BY cycle_id ASC
      `);

      if (result.rows.length === 0) {
        console.log('ℹ️ No cycles pending resolution');
        return [];
      }

      console.log(`📋 Found ${result.rows.length} cycles pending resolution`);

      const resolutionResults = [];

      for (const cycle of result.rows) {
        try {
          console.log(`🎯 Processing cycle ${cycle.cycle_id}...`);
          
          // SMART CHECK: Only resolve if all matches have finished and have results
          const shouldResolve = await this.shouldResolveCycle(cycle);
          
          if (!shouldResolve) {
            console.log(`⏳ Cycle ${cycle.cycle_id} matches haven't finished yet, skipping resolution`);
            resolutionResults.push({
              cycleId: cycle.cycle_id,
              success: false,
              reason: 'matches_not_finished',
              message: 'Waiting for all matches to finish with results'
            });
            continue;
          }
          
          const resolution = await this.resolveSingleCycle(cycle);
          resolutionResults.push(resolution);
          
        } catch (error) {
          console.error(`❌ Failed to resolve cycle ${cycle.cycle_id}:`, error);
          resolutionResults.push({
            cycleId: cycle.cycle_id,
            success: false,
            error: error.message
          });
        }
      }

      return resolutionResults;

    } catch (error) {
      console.error('❌ Error resolving pending cycles:', error);
      throw error;
    }
  }

  /**
   * Resolve a single Oddyssey cycle
   */
  async resolveSingleCycle(cycle) {
    const cycleId = cycle.cycle_id;
    
    // FIXED: Extract match IDs from matches_data correctly
    const matchData = cycle.matches_data;
    
    if (!matchData || !Array.isArray(matchData)) {
      console.error(`❌ Invalid match data format for cycle ${cycleId}:`, { 
        matches_data: cycle.matches_data
      });
      throw new Error(`Invalid match data format for cycle ${cycleId} - expected matches_data array`);
    }
    
    // Extract fixture IDs from the actual data structure
    const matchIds = matchData.map(match => {
      let id;
      
      // Handle both object format {id: "123"} and string format "123"
      if (typeof match === 'object' && match.id) {
        id = match.id;
      } else if (typeof match === 'string') {
        id = match;
      } else {
        console.error(`❌ Invalid match format:`, match);
        return null;
      }
      
      const numId = parseInt(id, 10);
      console.log(`🔍 Converting ID "${id}" to ${numId} (isNaN: ${isNaN(numId)})`);
      return isNaN(numId) ? null : numId;
    }).filter(id => id !== null);
    
    console.log(`🔍 Extracted match IDs for cycle ${cycleId}:`, matchIds);
    
    if (!Array.isArray(matchIds) || matchIds.length === 0) {
      console.error(`❌ No valid match IDs found for cycle ${cycleId}`);
      throw new Error(`No valid match IDs found for cycle ${cycleId}`);
    }
    
    console.log(`📊 Resolving cycle ${cycleId} with ${matchIds.length} matches...`);

    // Fetch results for all matches in this cycle
    const matchResults = await this.fetchMatchResults(matchIds);
    
    // Check if all matches are resolved
    const resolvedCount = matchResults.filter(r => r.isResolved).length;
    
    if (resolvedCount < matchIds.length) {
      console.log(`⏳ Cycle ${cycleId}: Only ${resolvedCount}/${matchIds.length} matches resolved, waiting...`);
      return {
        cycleId,
        success: false,
        reason: 'incomplete_results',
        resolvedMatches: resolvedCount,
        totalMatches: matchIds.length
      };
    }

    console.log(`✅ All ${matchIds.length} matches resolved for cycle ${cycleId}`);

    // Format results for contract and database
    const formattedResults = this.formatResults(matchResults);
    
    // Store results in database (for oracle bot to pick up)
    await this.storeResolutionData(cycleId, matchResults, formattedResults);

    return {
      cycleId,
      success: true,
      resolvedMatches: resolvedCount,
      totalMatches: matchIds.length,
      results: formattedResults,
      matchDetails: matchResults.map(m => ({
        fixtureId: m.fixtureId,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        score: m.score,
        outcome_1x2: m.outcome_1x2,
        outcome_ou25: m.outcome_ou25
      }))
    };
  }

  /**
   * Fetch results for specific match IDs
   */
  async fetchMatchResults(matchIds) {
    const results = [];

    for (const fixtureId of matchIds) {
      try {
        // ALWAYS use database results first - no external fetching unless absolutely necessary
        const matchResult = await this.getResultFromDatabase(fixtureId);
        
        // Only fetch from external API if we have NO result at all (not just unresolved)
        if (!matchResult || matchResult.error === 'Fixture not found') {
          console.log(`🔄 No database result for fixture ${fixtureId}, fetching from API...`);
          try {
            await this.fetchAndStoreResult(fixtureId);
            const freshResult = await this.getResultFromDatabase(fixtureId);
            results.push(freshResult);
          } catch (fetchError) {
            console.warn(`⚠️ Failed to fetch from API for ${fixtureId}:`, fetchError.message);
            results.push({
              fixtureId,
              isResolved: false,
              error: `No database result and API fetch failed: ${fetchError.message}`
            });
          }
        } else {
          // Use database result as-is (resolved or not)
          results.push(matchResult);
        }

      } catch (error) {
        console.warn(`⚠️ Failed to get result for fixture ${fixtureId}:`, error.message);
        results.push({
          fixtureId,
          isResolved: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get match result from our database
   * 
   * CRITICAL FIX: Use SINGLE QUERY that merges both tables,
   * prioritizing fixture_results (most reliable source)
   */
  async getResultFromDatabase(fixtureId) {
    // UNIFIED QUERY: Join both tables and prefer fixture_results data
    const result = await db.query(`
      SELECT 
        f.id as fixture_id,
        f.home_team,
        f.away_team,
        f.league_name,
        f.status,
        -- Prefer fixture_results data over match_results
        COALESCE(fr.home_score, mr.home_score) as home_score,
        COALESCE(fr.away_score, mr.away_score) as away_score,
        COALESCE(fr.outcome_1x2, mr.outcome_1x2) as outcome_1x2,
        COALESCE(fr.outcome_ou25, mr.outcome_ou25) as outcome_ou25,
        COALESCE(fr.finished_at, mr.finished_at) as finished_at
      FROM oracle.fixtures f
      LEFT JOIN oracle.fixture_results fr ON f.id::TEXT = fr.fixture_id::TEXT
      LEFT JOIN oracle.match_results mr ON f.id::TEXT = mr.match_id::TEXT
      WHERE f.id = $1
    `, [fixtureId]);

    if (result.rows.length === 0) {
      return {
        fixtureId,
        isResolved: false,
        error: 'Fixture not found'
      };
    }

    const match = result.rows[0];
    
    // Validation: A match is only resolved if it has BOTH scores AND outcomes
    // IMPORTANT: A score of 0 is VALID (e.g., 0-0 is a valid Draw result)
    // Only null/undefined indicates missing data
    const hasScores = match.home_score !== null && match.home_score !== undefined && 
                      match.away_score !== null && match.away_score !== undefined;
    const hasOutcomes = match.outcome_1x2 !== null && match.outcome_ou25 !== null;
    const isFinished = ['FT', 'AET', 'PEN', 'FT_PEN'].includes(match.status);
    const isCancelledOrPostponed = ['CANC', 'POST', 'CANCELLED', 'POSTPONED'].includes(match.status);
    
    // A match is resolved if:
    // 1. It's finished AND has BOTH scores AND outcomes, OR
    // 2. It's cancelled/postponed (regardless of outcomes)
    const isResolved = (isFinished && hasScores && hasOutcomes) || isCancelledOrPostponed;

    return {
      fixtureId: match.fixture_id,
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      league: match.league_name,
      status: match.status,
      isResolved: isResolved,
      homeScore: match.home_score,
      awayScore: match.away_score,
      score: hasScores ? `${match.home_score}-${match.away_score}` : null,
      outcome_1x2: match.outcome_1x2,
      outcome_ou25: match.outcome_ou25,
      finishedAt: match.finished_at
    };
  }

  /**
   * Fetch result from SportMonks and store in database
   */
  async fetchAndStoreResult(fixtureId) {
    try {
      const results = await this.sportmonksService.fetchFixtureResults([fixtureId]);
      
      if (results.length > 0) {
        await this.sportmonksService.saveFixtureResults(results);
        console.log(`✅ Stored result for fixture ${fixtureId}`);
      } else {
        console.log(`ℹ️ No result available yet for fixture ${fixtureId}`);
      }

    } catch (error) {
      console.warn(`⚠️ Failed to fetch result for fixture ${fixtureId}:`, error.message);
    }
  }

  /**
   * Format results for Oddyssey contract with strict validation
   */
  formatResults(matchResults) {
    if (!matchResults || matchResults.length !== 10) {
      throw new Error('Must provide exactly 10 match results');
    }

    return matchResults.map((match, index) => {
      if (!match.isResolved) {
        return {
          moneyline: 0, // NotSet
          overUnder: 0  // NotSet
        };
      }

      return {
        moneyline: this.convertMoneylineResult(match.outcome_1x2),
        overUnder: this.convertOverUnderResult(match.outcome_ou25),
        fixtureId: match.fixtureId,
        score: match.score
      };
    });
  }

  /**
   * Convert database result to contract enum values
   * CRITICAL: Must handle both "1/X/2" AND "Home/Draw/Away" formats
   */
  convertMoneylineResult(result1x2) {
    switch (result1x2) {
      case '1':
      case 'Home':  // Database format
        return 1; // HomeWin
      case 'X':
      case 'Draw':  // Database format
        return 2; // Draw
      case '2':
      case 'Away':  // Database format
        return 3; // AwayWin
      default: 
        console.warn(`Unknown moneyline result: ${result1x2}, defaulting to NotSet`);
        return 0;  // NotSet
    }
  }

  /**
   * Convert database result to contract enum values
   * CRITICAL: Must handle both "Over/Under" AND "O/U" formats
   */
  convertOverUnderResult(resultOU25) {
    switch (resultOU25) {
      case 'Over':
      case 'O':  // Short format
        return 1; // Over
      case 'Under':
      case 'U':  // Short format
        return 2; // Under
      default:
        console.warn(`Unknown over/under result: ${resultOU25}, defaulting to NotSet`);
        return 0;  // NotSet
    }
  }

  /**
   * Calculate 1X2 result from actual scores
   */
  calculateMoneylineResult(homeScore, awayScore) {
    // ✅ VALIDATION: Scores must exist (NOT null/undefined)
    // IMPORTANT: A score of 0 is VALID (e.g., 0-0 is a valid Draw result)
    // Only null/undefined indicates missing data
    if (homeScore === null || homeScore === undefined || 
        awayScore === null || awayScore === undefined) {
      return null; // NotSet
    }
    
    // Calculate 1X2 result (0-0 is a valid Draw)
    if (homeScore > awayScore) {
      return '1'; // HomeWin
    } else if (awayScore > homeScore) {
      return '2'; // AwayWin
    } else {
      return 'X'; // Draw (includes 0-0)
    }
  }

  /**
   * Calculate Over/Under 2.5 result from actual scores
   */
  calculateOverUnderResult(homeScore, awayScore) {
    if (homeScore === null || awayScore === null) {
      return null; // NotSet
    }
    
    const totalGoals = homeScore + awayScore;
    
    if (totalGoals > 2.5) {
      return 'Over';
    } else if (totalGoals < 2.5) {
      return 'Under';
    } else {
      // Exactly 2.5 goals - this should be Under (2.5 is the threshold)
      return 'Under';
    }
  }

  // Note: Oddyssey only supports 1X2 and O/U 2.5 markets
  // BTTS and 3.5 O/U are only for guided markets, not Oddyssey

  /**
   * Validate and update match results with proper score calculation
   */
  async validateAndUpdateResults(fixtureId) {
    try {
      const result = await db.query(`
        SELECT 
          f.id as fixture_id,
          f.home_team,
          f.away_team,
          fr.home_score,
          fr.away_score,
          fr.outcome_1x2,
          fr.outcome_ou25
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.id = $1
      `, [fixtureId]);

      if (result.rows.length === 0) {
        return null;
      }

      const match = result.rows[0];
      
      // Only process if we have actual scores
      if (match.home_score === null || match.away_score === null) {
        return null;
      }

      // Calculate correct results based on actual scores (Oddyssey only needs 1X2 and O/U 2.5)
      const calculated1x2 = this.calculateMoneylineResult(match.home_score, match.away_score);
      const calculatedOU25 = this.calculateOverUnderResult(match.home_score, match.away_score);

      // Update database with calculated results if they differ
      if (match.outcome_1x2 !== calculated1x2 || 
          match.outcome_ou25 !== calculatedOU25) {
        await db.query(`
          UPDATE oracle.fixture_results 
          SET 
            outcome_1x2 = $1,
            outcome_ou25 = $2,
            updated_at = NOW()
          WHERE fixture_id = $3
        `, [calculated1x2, calculatedOU25, fixtureId]);

        console.log(`✅ Updated results for fixture ${fixtureId}: ${calculated1x2} ${calculatedOU25} (${match.home_score}-${match.away_score})`);
      }

      return {
        fixtureId: match.fixture_id,
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        homeScore: match.home_score,
        awayScore: match.away_score,
        score: `${match.home_score}-${match.away_score}`,
        outcome_1x2: calculated1x2,
        outcome_ou25: calculatedOU25,
        isResolved: true
      };

    } catch (error) {
      console.error(`❌ Failed to validate results for fixture ${fixtureId}:`, error);
      return null;
    }
  }

  /**
   * Store resolution data for oracle bot to process
   */
  async storeResolutionData(cycleId, matchResults, formattedResults) {
    try {
      // STEP 1: Build updated matches_data with results
      // CRITICAL FIX: Query from oddyssey_cycles (not current_oddyssey_cycle)
      const cycleResult = await db.query(`
        SELECT matches_data FROM oracle.oddyssey_cycles WHERE cycle_id = $1
      `, [cycleId]);
      
      if (!cycleResult.rows[0]) {
        throw new Error(`Cycle ${cycleId} not found in oddyssey_cycles table`);
      }
      
      const currentMatches = cycleResult.rows[0].matches_data || [];
      
      // STEP 2: Map results to matches and convert to correct format
      const updatedMatches = currentMatches.map((match, idx) => {
        const result = matchResults[idx];
        if (!result) return match;
        
        return {
          ...match,
          result: {
            outcome_1x2: result.outcome_1x2 || null,
            outcome_ou25: result.outcome_ou25 || null,
            home_score: result.homeScore || null,
            away_score: result.awayScore || null,
            finished_at: result.finishedAt || new Date().toISOString()
          }
        };
      });
      
      // STEP 3: Update BOTH cycle tables with matches_data + resolution_data (but NOT resolved yet)
      await db.query(`
        UPDATE oracle.oddyssey_cycles 
        SET 
          matches_data = $1,                            -- ✅ SYNC MATCHES WITH RESULTS
          resolution_data = $2,
          ready_for_resolution = true,
          resolution_prepared_at = NOW()
          -- ❌ DO NOT mark as resolved yet - wait for blockchain transaction
        WHERE cycle_id = $3
      `, [
        JSON.stringify(updatedMatches),
        JSON.stringify({
          matchResults,
          formattedResults,
          preparedAt: new Date().toISOString()
        }),
        cycleId
      ]);

      // Also update current_oddyssey_cycle (but NOT resolved yet)
      await db.query(`
        UPDATE oracle.current_oddyssey_cycle 
        SET 
          matches_data = $1,
          resolution_data = $2,
          ready_for_resolution = true,
          resolution_prepared_at = NOW()
          -- ❌ DO NOT mark as resolved yet - wait for blockchain transaction
        WHERE cycle_id = $3
      `, [
        JSON.stringify(updatedMatches),
        JSON.stringify({
          matchResults,
          formattedResults,
          preparedAt: new Date().toISOString()
        }),
        cycleId
      ]);

      console.log(`✅ SYNCED: Updated matches_data with results for cycle ${cycleId} in both tables`);

    } catch (error) {
      // Add column if it doesn't exist
      if (error.message.includes('column "resolution_data" of relation "oddyssey_cycles" does not exist')) {
        await this.addResolutionColumns();
        // Retry
        await this.storeResolutionData(cycleId, matchResults, formattedResults);
      } else {
        throw error;
      }
    }
  }

  /**
   * Add resolution tracking columns to existing table
   */
  async addResolutionColumns() {
    try {
      await db.query(`
        ALTER TABLE oddyssey_cycles 
        ADD COLUMN IF NOT EXISTS resolution_data JSONB,
        ADD COLUMN IF NOT EXISTS ready_for_resolution BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS resolution_prepared_at TIMESTAMPTZ
      `);

      console.log('✅ Added resolution tracking columns');

    } catch (error) {
      console.warn('⚠️ Failed to add resolution columns:', error);
    }
  }

  /**
   * Get resolution status for all cycles
   */
  async getResolutionStatus() {
    try {
      const result = await db.query(`
        SELECT 
          cycle_id,
          resolved,
          end_time,
          ready_for_resolution,
          resolution_prepared_at,
          created_at,
          CASE 
            WHEN resolved THEN 'resolved'
            WHEN ready_for_resolution THEN 'ready_for_blockchain'
            WHEN end_time < NOW() THEN 'pending_results'
            ELSE 'active'
          END as status
        FROM oracle.oddyssey_cycles 
        ORDER BY cycle_id DESC
        LIMIT 10
      `);

      return result.rows.map(row => ({
        cycleId: row.cycle_id,
        status: row.status,
        resolved: row.resolved,
        endTime: row.end_time,
        readyForResolution: row.ready_for_resolution,
        resolutionPreparedAt: row.resolution_prepared_at,
        createdAt: row.created_at
      }));

    } catch (error) {
      console.error('❌ Error getting resolution status:', error);
      return [];
    }
  }

  /**
   * Manual resolution trigger for specific cycle
   */
  async manualResolveCycle(cycleId) {
    console.log(`🔧 Manual resolution triggered for cycle ${cycleId}...`);

    const result = await db.query(`
      SELECT cycle_id, matches_data, cycle_end_time as end_time
      FROM oracle.oddyssey_cycles 
      WHERE cycle_id = $1
    `, [cycleId]);

    if (result.rows.length === 0) {
      throw new Error(`Cycle ${cycleId} not found`);
    }

    return await this.resolveSingleCycle(result.rows[0]);
  }

  /**
   * Get detailed match results for a cycle
   */
  async getCycleMatchDetails(cycleId) {
    try {
      const result = await db.query(`
        SELECT matches_data as match_ids 
        FROM oracle.oddyssey_cycles 
        WHERE cycle_id = $1
      `, [cycleId]);

      if (result.rows.length === 0) {
        throw new Error(`Cycle ${cycleId} not found`);
      }

      // match_ids is already a JavaScript object from JSONB column
      const matchIds = result.rows[0].match_ids;
      
      if (!Array.isArray(matchIds)) {
        console.error(`❌ Invalid match_ids format for cycle ${cycleId}:`, matchIds);
        throw new Error(`Invalid match_ids format for cycle ${cycleId} - expected array`);
      }
      
      const matchResults = await this.fetchMatchResults(matchIds);

      return {
        cycleId,
        totalMatches: matchIds.length,
        resolvedMatches: matchResults.filter(r => r.isResolved).length,
        matches: matchResults
      };

    } catch (error) {
      console.error(`❌ Error getting cycle ${cycleId} details:`, error);
      throw error;
    }
  }

  /**
   * PRECISE RESOLUTION: Check if a cycle should be resolved
   * Only resolves when ALL 10 matches have ended and their 90-minute results are fetched
   */
  async shouldResolveCycle(cycle) {
    try {
      // FIXED: Use matches_data instead of match_ids
      const matchData = cycle.matches_data;
      
      if (!matchData || !Array.isArray(matchData)) {
        console.log(`⚠️ Cycle ${cycle.cycle_id} has no valid match data`);
        return false;
      }

      if (matchData.length !== cycle.matches_count) {
        console.log(`⚠️ Cycle ${cycle.cycle_id} has ${matchData.length} matches, expected ${cycle.matches_count}`);
        return false;
      }

      // FIXED: Extract fixture IDs correctly from the actual data structure
      // Handle both array of strings and array of objects
      const fixtureIds = matchData.map(match => {
        if (typeof match === 'string') {
          return match; // Direct fixture ID
        } else if (typeof match === 'object' && match.id) {
          return match.id; // Object with id property
        }
        return null;
      }).filter(id => id);
      
      console.log(`🔍 Cycle ${cycle.cycle_id} fixture IDs:`, fixtureIds);
      
      // Check that ALL 10 matches have ended and have results/outcomes
      const matchStatusQuery = `
        SELECT 
          f.id,
          f.home_team || ' vs ' || f.away_team as name,
          f.match_date,
          f.status,
          fr.home_score,
          fr.away_score,
          fr.outcome_1x2,
          fr.outcome_ou25,
          CASE 
            WHEN f.status IN ('FT', 'AET', 'PEN', 'FT_PEN') THEN true
            ELSE false
          END as is_finished,
          CASE 
            WHEN fr.home_score IS NOT NULL AND fr.away_score IS NOT NULL THEN true
            ELSE false
          END as has_score,
          CASE 
            WHEN fr.outcome_1x2 IS NOT NULL AND fr.outcome_ou25 IS NOT NULL THEN true
            ELSE false
          END as has_outcomes,
          CASE 
            WHEN f.status IN ('CANC', 'POST', 'CANCELLED', 'POSTPONED') THEN true
            ELSE false
          END as is_cancelled_or_postponed,
          CASE 
            WHEN (f.status IN ('FT', 'AET', 'PEN', 'FT_PEN') AND fr.outcome_1x2 IS NOT NULL AND fr.outcome_ou25 IS NOT NULL) 
                 OR (fr.home_score IS NOT NULL AND fr.away_score IS NOT NULL)
                 OR f.status IN ('CANC', 'POST', 'CANCELLED', 'POSTPONED') THEN true
            ELSE false
          END as is_resolved
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.id = ANY($1)
        ORDER BY f.match_date ASC
      `;
      
      const result = await db.query(matchStatusQuery, [fixtureIds]);
      
      if (result.rows.length !== 10) {
        console.log(`⚠️ Cycle ${cycle.cycle_id} missing fixture data: found ${result.rows.length}/10 fixtures`);
        return false;
      }

      const matches = result.rows;
      const finishedMatches = matches.filter(m => m.is_finished);
      const matchesWithScore = matches.filter(m => m.has_score);
      const matchesWithOutcomes = matches.filter(m => m.has_outcomes);
      const cancelledOrPostponedMatches = matches.filter(m => m.is_cancelled_or_postponed);
      const resolvedMatches = matches.filter(m => m.is_resolved);
      
      console.log(`📊 Cycle ${cycle.cycle_id} status check:`);
      console.log(`   • Total matches: ${matches.length}/10`);
      console.log(`   • Finished matches: ${finishedMatches.length}/10`);
      console.log(`   • Matches with scores: ${matchesWithScore.length}/10`);
      console.log(`   • Matches with outcomes: ${matchesWithOutcomes.length}/10`);
      console.log(`   • Cancelled/Postponed matches: ${cancelledOrPostponedMatches.length}/10`);
      console.log(`   • Resolved matches: ${resolvedMatches.length}/10`);
      
      // Log individual match status for debugging
      matches.forEach((match, index) => {
        const statusEmoji = match.is_finished ? '✅' : (match.is_cancelled_or_postponed ? '🚫' : '⏳');
        const resolvedEmoji = match.is_resolved ? '✅' : '❌';
        const scoreText = match.has_score ? `${match.home_score}-${match.away_score}` : 'No score';
        const outcomeText = match.has_outcomes ? `${match.outcome_1x2}/${match.outcome_ou25}` : (match.is_cancelled_or_postponed ? 'CANCELLED/POSTPONED' : 'No outcomes');
        console.log(`   ${statusEmoji}${resolvedEmoji} Match ${index + 1}: ${match.name} [${match.status}] ${scoreText} → ${outcomeText}`);
      });

      // FIXED: Auto-mark matches as cancelled if they're past scheduled time by 2+ hours and still NS
      const now = new Date();
      const matchesToMarkCancelled = matches.filter(match => {
        if (match.status === 'NS' && match.match_date) {
          const matchTime = new Date(match.match_date);
          const hoursSinceScheduled = (now - matchTime) / (1000 * 60 * 60);
          return hoursSinceScheduled > 2; // More than 2 hours past scheduled time
        }
        return false;
      });

      if (matchesToMarkCancelled.length > 0) {
        console.log(`🔄 Auto-marking ${matchesToMarkCancelled.length} matches as cancelled (past scheduled time by 2+ hours)`);
        
        for (const match of matchesToMarkCancelled) {
          try {
            await db.query(`
              UPDATE oracle.fixtures 
              SET status = 'CANC' 
              WHERE id = $1
            `, [match.id]);
            console.log(`   ✅ Marked ${match.name} as cancelled`);
          } catch (error) {
            console.error(`   ❌ Failed to mark ${match.name} as cancelled:`, error.message);
          }
        }
        
        // Re-run the status check after marking matches as cancelled
        console.log(`🔄 Re-checking cycle status after marking matches as cancelled...`);
        return await this.shouldResolveCycle(cycle);
      }

      // FIXED: Check if all matches are resolved (finished + outcomes OR scores OR cancelled/postponed)
      const shouldResolve = resolvedMatches.length === cycle.matches_count;
      
      if (shouldResolve) {
        console.log(`🎯 Cycle ${cycle.cycle_id}: ALL ${cycle.matches_count} matches resolved ✅ READY FOR RESOLUTION`);
      } else {
        console.log(`⏳ Cycle ${cycle.cycle_id}: Waiting for all matches to be resolved (${resolvedMatches.length}/${cycle.matches_count} resolved, ${finishedMatches.length}/${cycle.matches_count} finished, ${matchesWithOutcomes.length}/${cycle.matches_count} with outcomes, ${cancelledOrPostponedMatches.length}/${cycle.matches_count} cancelled/postponed)`);
        
        // 🚨 CRITICAL FIX: UTC-based timing validation
        if (finishedMatches.length < cycle.matches_count) {
          // Force UTC timezone for all calculations
          const originalTZ = process.env.TZ;
          process.env.TZ = 'UTC';
          
          try {
            // Get the latest match date from the database results
            const matchDates = matches.map(m => new Date(m.match_date)).filter(d => !isNaN(d));
            if (matchDates.length > 0) {
              const now = new Date(); // This will be UTC due to TZ=UTC
              const lastMatchTime = new Date(Math.max(...matchDates));
              const timeSinceLastMatch = now.getTime() - lastMatchTime.getTime();
              
              // 🚨 CRITICAL: Check if latest match start time + 105 minutes has passed (90 + 15 extra time)
              const MATCH_DURATION_MS = 105 * 60 * 1000; // 105 minutes in milliseconds
              const earliestResolutionTime = new Date(lastMatchTime.getTime() + MATCH_DURATION_MS);
              
              console.log(`⏱️  UTC Match timing validation:`);
              console.log(`   • Latest match start time (UTC): ${lastMatchTime.toISOString()}`);
              console.log(`   • Earliest allowed resolution time (UTC): ${earliestResolutionTime.toISOString()} (start + 105 min)`);
              console.log(`   • Current time (UTC): ${now.toISOString()}`);
              console.log(`   • Timezone: ${process.env.TZ || 'Not set'}`);
              console.log(`   • Time since latest match start: ${Math.round(timeSinceLastMatch / (60 * 60 * 1000))} hours ${Math.round((timeSinceLastMatch % (60 * 60 * 1000)) / (60 * 1000))} minutes`);
              
              if (now.getTime() < earliestResolutionTime.getTime()) {
                const minutesUntilAllowed = Math.ceil((earliestResolutionTime.getTime() - now.getTime()) / (60 * 1000));
                console.log(`❌ Cannot resolve yet! Must wait ${minutesUntilAllowed} more minutes for latest match start + 105 min to pass`);
                return false;
              }
            
              // If the last match started more than 3 hours ago, try to fetch missing results
              if (timeSinceLastMatch > 3 * 60 * 60 * 1000) {
                console.log(`🔄 Last match started ${Math.round(timeSinceLastMatch / (60 * 60 * 1000))} hours ago, attempting to fetch missing results...`);
              
                // Try to fetch results for unfinished matches
                const unfinishedMatches = matches.filter(m => !m.is_finished);
                for (const match of unfinishedMatches) {
                  try {
                    await this.fetchAndStoreResult(match.id);
                  } catch (error) {
                    console.warn(`⚠️ Failed to fetch result for match ${match.id}:`, error.message);
                  }
                }
                
                // Wait a moment for results to be processed, then return false to try again next cycle
                console.log(`⏳ Results fetch attempted, will retry on next cycle`);
              }
            }
          } finally {
            // Restore original timezone
            if (originalTZ) {
              process.env.TZ = originalTZ;
            } else {
              delete process.env.TZ;
            }
          }
        }
      }
      
      return shouldResolve;
      
    } catch (error) {
      console.error(`❌ Error checking if cycle ${cycle.cycle_id} should resolve:`, error);
      // Default to false on error to prevent premature resolution
      return false;
    }
  }

  /**
   * Test method to verify resolution system works correctly
   * This can be called manually to test the resolution logic
   */
  async testResolutionSystem() {
    try {
      console.log('🧪 Testing Oddyssey resolution system...');
      
      // Test 1: Check current cycle status
      const currentCycle = await db.query(`
        SELECT cycle_id, cycle_end_time, is_resolved, created_at
        FROM oracle.oddyssey_cycles 
        WHERE cycle_id = 1
      `);
      
      if (currentCycle.rows.length === 0) {
        console.log('❌ No current cycle found');
        return;
      }
      
      const cycle = currentCycle.rows[0];
      console.log(`📊 Current cycle ${cycle.cycle_id}:`);
      console.log(`   • Betting deadline: ${cycle.cycle_end_time}`);
      console.log(`   • Past deadline: ${cycle.cycle_end_time < new Date()}`);
      console.log(`   • Is resolved: ${cycle.is_resolved}`);
      
      // Test 2: Check if cycle would be found by resolution query
      const pendingCycles = await db.query(`
        SELECT cycle_id, cycle_end_time
        FROM oracle.oddyssey_cycles 
        WHERE is_resolved = false 
          AND cycle_end_time < NOW()
          AND cycle_end_time > NOW() - INTERVAL '7 days'
      `);
      
      console.log(`📋 Cycles past betting deadline: ${pendingCycles.rows.length}`);
      
      // Test 3: Check match status for current cycle
      const matchData = cycle.matches_data || [];
      if (matchData.length > 0) {
        const fixtureIds = matchData.map(match => match.id).filter(id => id);
        
        const matchStatus = await db.query(`
          SELECT 
            f.id,
            f.home_team || ' vs ' || f.away_team as name,
            f.match_date,
            f.status,
            fr.home_score,
            fr.away_score,
            CASE WHEN f.status IN ('FT', 'AET', 'PEN') THEN true ELSE false END as is_finished,
            CASE WHEN fr.home_score IS NOT NULL AND fr.away_score IS NOT NULL THEN true ELSE false END as has_score
          FROM oracle.fixtures f
          LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
          WHERE f.id = ANY($1)
          ORDER BY f.match_date ASC
        `, [fixtureIds]);
        
        console.log(`📊 Match status for cycle ${cycle.cycle_id}:`);
        console.log(`   • Total matches: ${matchStatus.rows.length}/10`);
        console.log(`   • Finished matches: ${matchStatus.rows.filter(m => m.is_finished).length}/10`);
        console.log(`   • Matches with scores: ${matchStatus.rows.filter(m => m.has_score).length}/10`);
        
        // Show individual match status
        matchStatus.rows.forEach((match, index) => {
          const statusEmoji = match.is_finished ? '✅' : '⏳';
          const scoreText = match.has_score ? `${match.home_score}-${match.away_score}` : 'No score';
          console.log(`   ${statusEmoji} Match ${index + 1}: ${match.name} [${match.status}] ${scoreText}`);
        });
      }
      
      console.log('✅ Resolution system test completed');
      
    } catch (error) {
      console.error('❌ Error testing resolution system:', error);
    }
  }
}

module.exports = OddysseyResultsResolver;