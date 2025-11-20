const SportMonksService = require('../services/sportmonks');
const db = require('../db/db');

// Import fetchMatchResults from sportmonks service
async function fetchMatchResults(matchIds) {
  try {
    const sportMonksService = new SportMonksService();
    const results = await sportMonksService.fetchFixtureResults(matchIds);
    return results;
  } catch (error) {
    console.error('Error fetching match results:', error);
    return [];
  }
}

class GuidedFetcher {
  constructor() {
    this.isRunning = false;
    this.sportMonksService = new SportMonksService();
  }

  async start() {
    if (this.isRunning) {
      console.log('GuidedFetcher is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting GuidedFetcher service...');

    try {
      // Quick database connection check with timeout
      await Promise.race([
        db.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DB connection timeout')), 3000))
      ]);

      // Start periodic fetching immediately (non-blocking)
      this.startPeriodicFetch();
      console.log('✅ GuidedFetcher started successfully');
    } catch (error) {
      console.error('❌ GuidedFetcher start failed:', error.message);
      this.isRunning = false;
      throw error;
    }
  }

  async stop() {
    this.isRunning = false;
    console.log('GuidedFetcher stopped');
  }

  startPeriodicFetch() {
    // Fetch upcoming matches every 30 minutes
    this.matchFetchInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.fetchAndStoreUpcomingMatches();
      } catch (error) {
        console.error('Error fetching upcoming matches:', error);
      }
    }, 30 * 60 * 1000); // 30 minutes

    // Check for completed matches every 5 minutes
    this.resultFetchInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.fetchAndStoreResults();
      } catch (error) {
        console.error('Error fetching match results:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Initial fetch
    setTimeout(() => {
      this.fetchAndStoreUpcomingMatches();
      this.fetchAndStoreResults();
    }, 5000);
  }

  async fetchAndStoreUpcomingMatches() {
    console.log('📥 Fetching upcoming matches...');
    
    try {
              const matches = await this.sportMonksService.fetchOddysseyFixtures();
      if (!matches || matches.length === 0) {
        console.log('No upcoming matches found');
        return;
      }

      let savedCount = 0;
      for (const match of matches) {
        try {
          await db.saveMatch(
            match.id,
            match.home_team,
            match.away_team,
            new Date(match.match_date), // Use match_date directly
            match.league_name || 'Unknown'
          );
          savedCount++;
        } catch (error) {
          console.error(`Failed to save match ${match.id}:`, error);
        }
      }

      console.log(`✅ Saved ${savedCount}/${matches.length} upcoming matches to database`);
    } catch (error) {
      console.error('❌ Failed to fetch upcoming matches:', error);
    }
  }

  async fetchAndStoreResults() {
    console.log('📥 Fetching match results...');
    
    try {
      // Get matches that need results (completed but not resolved)
      const query = `
        SELECT f.id as match_id, f.home_team, f.away_team, f.match_date as match_time
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.match_date < NOW() - INTERVAL '1 hour'  -- Match finished at least 1 hour ago (for result fetching)
        AND fr.fixture_id IS NULL  -- No results yet
        ORDER BY f.match_date DESC
        LIMIT 50
      `;
      
      const result = await db.query(query);
      const matchesNeedingResults = result.rows;

      if (matchesNeedingResults.length === 0) {
        console.log('No matches need result updates');
        return;
      }

      console.log(`Found ${matchesNeedingResults.length} matches needing results`);

      const matchIds = matchesNeedingResults.map(m => m.match_id);
      const results = await fetchMatchResults(matchIds);

      if (!results || results.length === 0) {
        console.log('No results returned from API');
        return;
      }

      let savedCount = 0;
      
      // CRITICAL FIX: Match results by fixture_id, not by array index!
      // The API may return results in a different order or skip some matches
      for (const result of results) {
        try {
          if (!result || !result.fixture_id) {
            console.warn('⚠️ Skipping invalid result object:', result);
            continue;
          }
          
          // Match by fixture_id, not by index position
          await db.saveMatchResult(result.fixture_id, result);
          savedCount++;
          console.log(`✅ Saved result for match ${result.fixture_id}: ${result.home_score}-${result.away_score}`);
        } catch (error) {
          console.error(`Failed to save result for match ${result.fixture_id}:`, error);
        }
      }

      console.log(`✅ Saved ${savedCount}/${results.length} match results to database`);
    } catch (error) {
      console.error('❌ Failed to fetch match results:', error);
    }
  }

  async getMatchesForOddyssey(date) {
    console.log(`🎯 Getting matches for Oddyssey game on ${date}`);
    
    try {
      // Get 10 matches for the given date that have odds available
      const query = `
        SELECT f.*, 
               CASE WHEN fr.fixture_id IS NOT NULL THEN true ELSE false END as has_result
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE DATE(f.match_date) = $1
        AND f.match_date > NOW() + INTERVAL '1 hour'  -- At least 1 hour in future
        ORDER BY f.match_date ASC
        LIMIT 10
      `;
      
      const result = await db.query(query, [date]);
      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get matches for Oddyssey:', error);
      return [];
    }
  }

  async getCompletedMatches(matchIds) {
    console.log(`🔍 Getting results for ${matchIds.length} matches`);
    
    try {
      const query = `
        SELECT f.id as match_id, f.home_team, f.away_team, fr.*
        FROM oracle.fixtures f
        JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.id = ANY($1)
      `;
      
      const result = await db.query(query, [matchIds]);
      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get completed matches:', error);
      return [];
    }
  }
}

// Initialize and export
const guidedFetcher = new GuidedFetcher();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await guidedFetcher.stop();
  await db.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await guidedFetcher.stop();
  await db.disconnect();
  process.exit(0);
});

module.exports = guidedFetcher; 