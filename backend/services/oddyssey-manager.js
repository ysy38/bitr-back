const SportMonksService = require('./sportmonks');
const Web3Service = require('./web3-service');
const PersistentDailyGameManager = require('./persistent-daily-game-manager');
const db = require('../db/db');

class OddysseyManager {
  constructor() {
    this.sportMonks = new SportMonksService();
    this.web3 = new Web3Service();
    this.persistentManager = new PersistentDailyGameManager();
    this.oddysseyContract = null;
    
    // Minimum time before first match (must be after 11:00 AM UTC)
    this.MIN_FIRST_MATCH_HOUR_UTC = 11; // Must be after 11:00 AM UTC
    
    // Required number of matches per daily cycle
    this.MATCHES_PER_CYCLE = 10;
    
    // Preferred leagues for better odds and interest (priority order)
    this.PREFERRED_LEAGUES = [
      // Top Tier European Leagues
      8,   // Premier League (England)
      82,  // Bundesliga (Germany)
      564, // La Liga (Spain)
      301, // Serie A (Italy)
      501, // Ligue 1 (France)
      
      // UEFA Competitions
      2,   // UEFA Champions League
      5,   // UEFA Europa League
      848, // UEFA Europa Conference League
      
      // Other European Top Leagues
      119, // Eredivisie (Netherlands)
      94,  // Primeira Liga (Portugal)
      203, // Super Lig (Turkey)
      197, // Super League (Greece)
      113, // HNL (Croatia)
      103, // Eliteserien (Norway)
      95,  // Superliga (Denmark)
      106, // Veikkausliiga (Finland)
      113, // Allsvenskan (Sweden)
      244, // Super League (Switzerland)
      106, // Ekstraklasa (Poland)
      218, // NB I (Hungary)
      
      // Americas
      384, // MLS (USA)
      71,  // Brasileirão (Brazil)
      26,  // Primera División (Argentina)
      564, // Liga MX (Mexico)
      
      // Asia
      570, // Saudi Pro League
      
      // South American Competitions
      1031, // Copa Libertadores
      1032, // Copa Sudamericana
    ];
    
    // League name keywords for better matching
    this.LEAGUE_KEYWORDS = {
      'premier league': 50,
      'bundesliga': 50,
      'la liga': 50,
      'serie a': 50,
      'ligue 1': 50,
      'champions league': 45,
      'europa league': 45,
      'eredivisie': 40,
      'primeira liga': 40,
      'super lig': 40,
      'super league': 35,
      'mls': 35,
      'brasileirão': 35,
      'primera división': 35,
      'liga mx': 35,
      'saudi pro league': 30,
      'copa libertadores': 40,
      'copa sudamericana': 40
    };
  }

  /**
   * Initialize the service with contract instances
   */
  async initialize() {
    try {
      this.oddysseyContract = await this.web3.getOddysseyContract();
      console.log('✅ OddysseyManager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize OddysseyManager:', error);
      throw error;
    }
  }

  /**
   * Get daily matches for Oddyssey - called once per day
   * FIXED: Now uses pre-selected matches from oracle.daily_game_matches
   */
  async getDailyMatches() {
    try {
      console.log('🎯 Getting daily Oddyssey matches from oracle.daily_game_matches...');

      // Get today's date
      const today = new Date().toISOString().split('T')[0];
      
      // Get pre-selected matches from oracle.daily_game_matches (selected at 10:47 UTC)
      const matches = await this.getMatchesFromDailyGameMatches(today);
      
      if (matches.length === 0) {
        throw new Error(`No pre-selected matches found for ${today} in oracle.daily_game_matches. Make sure match selection ran at 10:47 UTC.`);
      }

      if (matches.length !== this.MATCHES_PER_CYCLE) {
        throw new Error(`Expected ${this.MATCHES_PER_CYCLE} pre-selected matches, found ${matches.length} for ${today}`);
      }

      // Convert database matches to contract format
      const contractMatches = this.formatDatabaseMatchesForContract(matches);
      
      console.log(`✅ Retrieved ${contractMatches.length} pre-selected matches from oracle.daily_game_matches for Oddyssey cycle`);
      return contractMatches;

    } catch (error) {
      console.error('❌ Error getting daily matches:', error);
      throw error;
    }
  }

  /**
   * Get pre-selected matches from oracle.daily_game_matches table
   * FIXED: This method reads the matches selected at 10:47 UTC
   */
  async getMatchesFromDailyGameMatches(targetDate) {
    try {
      console.log(`🔍 Getting pre-selected matches from oracle.daily_game_matches for ${targetDate}...`);
      
      const query = `
        SELECT 
          dgm.fixture_id,
          dgm.home_team,
          dgm.away_team,
          dgm.league_name,
          dgm.match_date,
          dgm.home_odds,
          dgm.draw_odds,
          dgm.away_odds,
          dgm.over_25_odds,
          dgm.under_25_odds,
          dgm.display_order,
          dgm.cycle_id,
          
          -- Get additional fixture data
          f.id as fixture_id_from_fixtures,
          f.match_date as fixture_match_date,
          f.status,
          f.league_id,
          f.league_name as fixture_league_name
          
        FROM oracle.daily_game_matches dgm
        LEFT JOIN oracle.fixtures f ON dgm.fixture_id::text = f.id
        WHERE dgm.game_date = $1
        ORDER BY dgm.display_order ASC
        LIMIT $2
      `;

      const result = await db.query(query, [targetDate, this.MATCHES_PER_CYCLE]);
      
      if (result.rows.length === 0) {
        throw new Error(`No pre-selected matches found for ${targetDate} in oracle.daily_game_matches`);
      }

      console.log(`📊 Found ${result.rows.length} pre-selected matches for ${targetDate}`);
      
      // Validate that we have the required odds data
      const validMatches = result.rows.filter(match => 
        match.home_odds && match.draw_odds && match.away_odds && 
        match.over_25_odds && match.under_25_odds
      );
      
      if (validMatches.length !== result.rows.length) {
        console.warn(`⚠️ Some matches missing odds data: ${validMatches.length}/${result.rows.length} valid`);
      }
      
      return validMatches;

    } catch (error) {
      console.error('❌ Error getting matches from daily_game_matches:', error);
      throw error;
    }
  }

  /**
   * Get matches directly from oracle.fixtures table (LEGACY - kept for fallback)
   */
  async getMatchesFromFixtures(targetDate) {
    try {
      const startDate = new Date(targetDate);
      startDate.setUTCHours(this.MIN_FIRST_MATCH_HOUR_UTC, 0, 0, 0); // 11:00 AM UTC
      
      const endDate = new Date(targetDate);
      endDate.setUTCHours(23, 59, 59, 999);

      const query = `
        SELECT 
          f.id as fixture_id,
          f.match_date as match_date,
          f.home_team,
          f.away_team,
          f.league_id,
          f.league_name,
          COALESCE(l.name, f.league_name) as league_full_name,
          COALESCE(l.is_popular, false) as is_popular,
          
          -- Get odds data using subqueries
          ft.home_odds,
          ft.draw_odds,
          ft.away_odds,
          ou.over_odds,
          ou.under_odds
          
        FROM oracle.fixtures f
        LEFT JOIN oracle.leagues l ON f.league_id = l.league_id
        LEFT JOIN (
          SELECT 
            fixture_id,
            MAX(CASE WHEN label = 'Home' THEN value END) as home_odds,
            MAX(CASE WHEN label = 'Draw' THEN value END) as draw_odds,
            MAX(CASE WHEN label = 'Away' THEN value END) as away_odds
          FROM oracle.fixture_odds 
          WHERE market_id = '1'
          GROUP BY fixture_id
        ) ft ON f.id::VARCHAR = ft.fixture_id::VARCHAR
        LEFT JOIN (
          SELECT 
            fixture_id,
            MAX(CASE WHEN label = 'Over' THEN value END) as over_odds,
            MAX(CASE WHEN label = 'Under' THEN value END) as under_odds
          FROM oracle.fixture_odds 
          WHERE market_id = '80' AND total = '2.5'
          GROUP BY fixture_id
        ) ou ON f.id::VARCHAR = ou.fixture_id::VARCHAR
        
        WHERE f.match_date >= $1 
          AND f.match_date <= $2
          AND f.match_date > NOW() + INTERVAL '1 hour'
          AND f.status IN ('NS', 'Fixture')
          AND f.home_team IS NOT NULL 
          AND f.away_team IS NOT NULL
          AND ft.home_odds IS NOT NULL
          AND ft.draw_odds IS NOT NULL
          AND ft.away_odds IS NOT NULL
          AND f.league_name NOT ILIKE '%women%'
          AND f.league_name NOT ILIKE '%female%'
          AND f.league_name NOT ILIKE '%ladies%'
          AND f.home_team NOT ILIKE '%women%'
          AND f.away_team NOT ILIKE '%women%'
          AND f.home_team NOT ILIKE '%female%'
          AND f.away_team NOT ILIKE '%female%'
          AND f.home_team NOT ILIKE '%ladies%'
          AND f.away_team NOT ILIKE '%ladies%'
          AND ft.home_odds > 1.0 AND ft.home_odds < 50.0
          AND ft.draw_odds > 1.0 AND ft.draw_odds < 50.0
          AND ft.away_odds > 1.0 AND ft.away_odds < 50.0
          AND ou.over_odds IS NOT NULL
          AND ou.under_odds IS NOT NULL
          AND ou.over_odds > 1.0 AND ou.over_odds < 50.0
          AND ou.under_odds > 1.0 AND ou.under_odds < 50.0
        
        ORDER BY 
          COALESCE(l.is_popular, false) DESC,
          CASE 
            WHEN f.league_name ILIKE '%premier league%' THEN 100
            WHEN f.league_name ILIKE '%bundesliga%' THEN 95
            WHEN f.league_name ILIKE '%la liga%' THEN 90
            WHEN f.league_name ILIKE '%serie a%' THEN 85
            WHEN f.league_name ILIKE '%ligue 1%' THEN 80
            WHEN f.league_name ILIKE '%champions league%' THEN 75
            WHEN f.league_name ILIKE '%europa league%' THEN 70
            WHEN f.league_name ILIKE '%eredivisie%' THEN 65
            WHEN f.league_name ILIKE '%primeira liga%' THEN 60
            WHEN f.league_name ILIKE '%super lig%' THEN 55
            WHEN f.league_name ILIKE '%mls%' THEN 50
            WHEN f.league_name ILIKE '%brasileirão%' THEN 45
            WHEN f.league_name ILIKE '%primera división%' THEN 40
            WHEN f.league_name ILIKE '%liga mx%' THEN 35
            WHEN f.league_name ILIKE '%saudi pro league%' THEN 30
            WHEN f.league_name ILIKE '%copa libertadores%' THEN 25
            WHEN f.league_name ILIKE '%copa sudamericana%' THEN 20
            ELSE 10
          END DESC,
          f.match_date ASC
        LIMIT $3
      `;

      const result = await db.query(query, [
        startDate.toISOString(),
        endDate.toISOString(),
        this.MATCHES_PER_CYCLE
      ]);

      console.log(`📊 Found ${result.rows.length} matches for ${targetDate}`);
      return result.rows;

    } catch (error) {
      console.error('❌ Error getting matches from fixtures:', error);
      throw error;
    }
  }

  /**
   * Get match candidates for a specific date
   */
  async getMatchCandidates(targetDate) {
    try {
      const startDate = new Date(targetDate);
      startDate.setUTCHours(this.MIN_FIRST_MATCH_HOUR_UTC, 0, 0, 0); // 11:00 AM UTC
      
      const endDate = new Date(targetDate);
      endDate.setUTCHours(23, 59, 59, 999);

      const query = `
        SELECT DISTINCT
          f.id as fixture_id,
          f.match_date as starting_at,
          f.home_team,
          f.away_team,
          f.league_id,
          f.league_name,
          COALESCE(l.name, f.league_name) as league_full_name,
          COALESCE(l.is_popular, false) as is_popular,
          
          -- Get odds data using subqueries
          ft.home_odds,
          ft.draw_odds,
          ft.away_odds,
          ou.over_odds,
          ou.under_odds
          
        FROM oracle.fixtures f
        LEFT JOIN oracle.leagues l ON f.league_id = l.league_id
        LEFT JOIN (
          SELECT 
            fixture_id,
            MAX(CASE WHEN label = 'Home' THEN value END) as home_odds,
            MAX(CASE WHEN label = 'Draw' THEN value END) as draw_odds,
            MAX(CASE WHEN label = 'Away' THEN value END) as away_odds
          FROM oracle.fixture_odds 
          WHERE market_id = '1'
          GROUP BY fixture_id
        ) ft ON f.id::VARCHAR = ft.fixture_id::VARCHAR
        LEFT JOIN (
          SELECT 
            fixture_id,
            MAX(CASE WHEN label = 'Over' THEN value END) as over_odds,
            MAX(CASE WHEN label = 'Under' THEN value END) as under_odds
          FROM oracle.fixture_odds 
          WHERE market_id = '80' AND total = '2.5'
          GROUP BY fixture_id
        ) ou ON f.id::VARCHAR = ou.fixture_id::VARCHAR
        
        WHERE f.match_date >= $1 
          AND f.match_date <= $2
          AND f.status IN ('NS', 'Fixture')
          AND f.home_team IS NOT NULL 
          AND f.away_team IS NOT NULL
          AND ft.home_odds IS NOT NULL
          AND ft.draw_odds IS NOT NULL
          AND ft.away_odds IS NOT NULL
          AND f.league_name NOT ILIKE '%women%'
          AND f.league_name NOT ILIKE '%female%'
          AND f.league_name NOT ILIKE '%ladies%'
          AND f.home_team NOT ILIKE '%women%'
          AND f.away_team NOT ILIKE '%women%'
          AND f.home_team NOT ILIKE '%female%'
          AND f.away_team NOT ILIKE '%female%'
          AND f.home_team NOT ILIKE '%ladies%'
          AND f.away_team NOT ILIKE '%ladies%'
          AND ft.home_odds > 1.0 AND ft.home_odds < 50.0
          AND ft.draw_odds > 1.0 AND ft.draw_odds < 50.0
          AND ft.away_odds > 1.0 AND ft.away_odds < 50.0
          
        ORDER BY 
          COALESCE(l.is_popular, false) DESC,
          f.match_date ASC
      `;

      const result = await db.query(query, [startDate, endDate]);
      return result.rows;

    } catch (error) {
      console.error('❌ Error getting match candidates:', error);
      throw error;
    }
  }

  /**
   * Select the best matches based on various criteria
   */
  selectBestMatches(candidates, count) {
    // Score each match
    const scoredMatches = candidates.map(match => ({
      ...match,
      score: this.calculateMatchScore(match)
    }));

    // Sort by score (highest first)
    scoredMatches.sort((a, b) => b.score - a.score);

    // Take top matches, ensuring good distribution across time
    const selected = [];
    const timeSlots = new Map();

    for (const match of scoredMatches) {
      if (selected.length >= count) break;

      const hourSlot = new Date(match.starting_at).getUTCHours();
      const slotCount = timeSlots.get(hourSlot) || 0;

      // Limit matches per hour slot to ensure distribution
      if (slotCount < 3) {
        selected.push(match);
        timeSlots.set(hourSlot, slotCount + 1);
      }
    }

    // If we don't have enough, fill with remaining high-scored matches
    if (selected.length < count) {
      for (const match of scoredMatches) {
        if (selected.length >= count) break;
        if (!selected.find(s => s.fixture_id === match.fixture_id)) {
          selected.push(match);
        }
      }
    }

    return selected.slice(0, count);
  }

  /**
   * Calculate match quality score for selection
   */
  calculateMatchScore(match) {
    let score = 0;

    // League preference (higher score for popular/preferred leagues)
    if (match.is_popular) score += 30;
    if (this.PREFERRED_LEAGUES.includes(match.league_id)) score += 20;

    // Enhanced league scoring using keywords
    const leagueName = (match.league_full_name || match.league_name || '').toLowerCase();
    for (const [keyword, points] of Object.entries(this.LEAGUE_KEYWORDS)) {
      if (leagueName.includes(keyword)) {
        score += points;
        break; // Use the highest scoring keyword found
      }
    }

    // Odds quality (prefer competitive matches)
    const oddsHome = parseFloat(match.home_odds) || 0;
    const oddsDraw = parseFloat(match.draw_odds) || 0;
    const oddsAway = parseFloat(match.away_odds) || 0;
    
    if (oddsHome > 0 && oddsDraw > 0 && oddsAway > 0) {
      // Balanced odds get higher score
      const maxOdd = Math.max(oddsHome, oddsDraw, oddsAway);
      const minOdd = Math.min(oddsHome, oddsDraw, oddsAway);
      const oddsBalance = minOdd / maxOdd;
      score += oddsBalance * 25; // 0-25 points for balance

      // Prefer matches with odds in reasonable range (1.2 to 5.0)
      const avgOdd = (oddsHome + oddsDraw + oddsAway) / 3;
      if (avgOdd >= 1.2 && avgOdd <= 5.0) score += 15;
    }

    // Time preference (prefer 15:00-21:00 UTC)
    const matchHour = new Date(match.starting_at).getUTCHours();
    if (matchHour >= 15 && matchHour <= 21) score += 10;

    // Add random factor to ensure variety
    score += Math.random() * 5;

    return score;
  }

  /**
   * Format matches for smart contract
   */
  formatMatchesForContract(matches) {
    return matches.map(match => {
      const startTime = Math.floor(new Date(match.starting_at).getTime() / 1000);
      
      // Parse odds from database columns
      let oddsHome = parseFloat(match.home_odds) || 1.5;
      let oddsDraw = parseFloat(match.draw_odds) || 3.0;
      let oddsAway = parseFloat(match.away_odds) || 2.5;
      let oddsOver = parseFloat(match.over_odds) || 1.8;
      let oddsUnder = parseFloat(match.under_odds) || 2.0;
      
      // Convert odds to contract format (scaled by 1000)
      const oddsHomeScaled = Math.round(oddsHome * 1000);
      const oddsDrawScaled = Math.round(oddsDraw * 1000);
      const oddsAwayScaled = Math.round(oddsAway * 1000);
      const oddsOverScaled = Math.round(oddsOver * 1000);
      const oddsUnderScaled = Math.round(oddsUnder * 1000);

      return {
        id: BigInt(match.fixture_id), // Contract expects uint64, use BigInt for safety
        startTime: startTime,
        oddsHome: oddsHomeScaled,
        oddsDraw: oddsDrawScaled,
        oddsAway: oddsAwayScaled,
        oddsOver: oddsOverScaled,
        oddsUnder: oddsUnderScaled,
        result: {
          moneyline: 0, // NotSet
          overUnder: 0  // NotSet
        }
      };
    });
  }

  /**
   * Format database matches for contract (from persistent storage)
   */
  formatDatabaseMatchesForContract(matches) {
    return matches.map(match => {
      const startTime = Math.floor(new Date(match.match_date).getTime() / 1000);
      
      // Parse odds from database columns (already in correct format)
      let oddsHome = parseFloat(match.home_odds) || 1.5;
      let oddsDraw = parseFloat(match.draw_odds) || 3.0;
      let oddsAway = parseFloat(match.away_odds) || 2.5;
      let oddsOver = parseFloat(match.over_25_odds) || 1.8;
      let oddsUnder = parseFloat(match.under_25_odds) || 2.0;
      
      // Convert odds to contract format (scaled by 1000)
      const oddsHomeScaled = Math.round(oddsHome * 1000);
      const oddsDrawScaled = Math.round(oddsDraw * 1000);
      const oddsAwayScaled = Math.round(oddsAway * 1000);
      const oddsOverScaled = Math.round(oddsOver * 1000);
      const oddsUnderScaled = Math.round(oddsUnder * 1000);

      return {
        id: BigInt(match.fixture_id), // Contract expects uint64, use BigInt for safety
        startTime: startTime,
        oddsHome: oddsHomeScaled,
        oddsDraw: oddsDrawScaled,
        oddsAway: oddsAwayScaled,
        oddsOver: oddsOverScaled,
        oddsUnder: oddsUnderScaled,
        homeTeam: match.home_team || 'Home Team', // Contract expects string
        awayTeam: match.away_team || 'Away Team', // Contract expects string
        leagueName: match.league_name || 'Daily Challenge', // Contract expects string
        result: {
          moneyline: 0, // NotSet
          overUnder: 0  // NotSet
        }
      };
    });
  }

  /**
   * Start new daily cycle in contract
   */
  async startDailyCycle() {
    try {
      if (!this.oddysseyContract) {
        await this.initialize();
      }

      const matches = await this.getDailyMatches();
      
      console.log('📋 Starting new daily cycle with matches:');
      matches.forEach((match, i) => {
        const startTime = new Date(match.startTime * 1000);
        console.log(`  ${i+1}. Match ${match.id} at ${startTime.toUTCString()}`);
      });

      // Call contract function
      const tx = await this.oddysseyContract.startDailyCycle(matches);
      console.log(`🚀 Daily cycle started! Tx: ${tx.hash}`);
      
      await tx.wait();
      console.log('✅ Daily cycle confirmed');

      // Save cycle info to database
      await this.saveCycleInfo(matches, tx.hash);

      return { success: true, txHash: tx.hash, matches: matches.length };

    } catch (error) {
      console.error('❌ Error starting daily cycle:', error);
      throw error;
    }
  }

  /**
   * Save cycle information to database
   */
  async saveCycleInfo(matches, txHash) {
    try {
      const currentCycleId = await this.oddysseyContract.dailyCycleId();
      
      // Get contract data
      const contractCycleEndTime = await this.oddysseyContract.dailyCycleEndTimes(currentCycleId);
      const isResolved = await this.oddysseyContract.isCycleResolved(currentCycleId);
      
      // Calculate cycle times according to contract logic
      const earliestMatchTime = Math.min(...matches.map(m => m.startTime));
      const cycleStartTime = Date.now() / 1000; // Current timestamp when cycle is created
      const cycleEndTime = Number(contractCycleEndTime); // Use actual contract end time
      
      // Save cycle info to oracle.oddyssey_cycles
      const cycleQuery = `
        INSERT INTO oracle.oddyssey_cycles (
          cycle_id, created_at, updated_at, matches_count, matches_data, 
          cycle_start_time, cycle_end_time, resolved_at, is_resolved, 
          tx_hash, resolution_tx_hash, resolution_data, ready_for_resolution, 
          resolution_prepared_at
        ) VALUES ($1, NOW(), NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (cycle_id) DO UPDATE SET
          matches_data = EXCLUDED.matches_data,
          tx_hash = EXCLUDED.tx_hash,
          updated_at = NOW()
        RETURNING cycle_id
      `;

      // Convert BigInt values to regular numbers for JSON serialization
      const serializableMatches = matches.map(match => ({
        ...match,
        id: match.id.toString(),
        startTime: Number(match.startTime),
        oddsHome: Number(match.oddsHome),
        oddsDraw: Number(match.oddsDraw),
        oddsAway: Number(match.oddsAway),
        oddsOver: Number(match.oddsOver),
        oddsUnder: Number(match.oddsUnder)
      }));

      const cycleResult = await db.query(cycleQuery, [
        parseInt(currentCycleId),
        matches.length,
        JSON.stringify(serializableMatches),
        new Date(cycleStartTime * 1000),
        new Date(cycleEndTime * 1000),
        null, // resolved_at
        isResolved,
        txHash,
        null, // resolution_tx_hash
        null, // resolution_data
        false, // ready_for_resolution
        null  // resolution_prepared_at
      ]);

      // Third, update matches in oracle.daily_game_matches with the oracle cycle_id
      // Get match IDs from the contract matches
      const matchIds = matches.map(m => m.id.toString());
      
      // Update all matches for today that match our contract matches
      const today = new Date().toISOString().split('T')[0];
      const updateMatchesQuery = `
        UPDATE oracle.daily_game_matches 
        SET cycle_id = $1, updated_at = NOW()
        WHERE game_date = $2 
        AND fixture_id = ANY($3)
      `;

      const updateResult = await db.query(updateMatchesQuery, [
        parseInt(currentCycleId), // Ensure it's an integer
        today,
        matchIds
      ]);

      // Fourth, update current_oddyssey_cycle table (single row table)
      // First delete existing row, then insert new current cycle
      await db.query('DELETE FROM oracle.current_oddyssey_cycle');
      
      const currentCycleQuery = `
        INSERT INTO oracle.current_oddyssey_cycle (
          cycle_id, created_at, updated_at, matches_count, matches_data, 
          cycle_start_time, cycle_end_time, resolved_at, is_resolved, 
          tx_hash, resolution_tx_hash, resolution_data, ready_for_resolution, 
          resolution_prepared_at
        ) 
        SELECT 
          cycle_id, created_at, updated_at, matches_count, matches_data, 
          cycle_start_time, cycle_end_time, resolved_at, is_resolved, 
          tx_hash, resolution_tx_hash, resolution_data, ready_for_resolution, 
          resolution_prepared_at
        FROM oracle.oddyssey_cycles WHERE cycle_id = $1
      `;
      
      await db.query(currentCycleQuery, [parseInt(currentCycleId)]);

      console.log(`💾 Saved complete cycle ${currentCycleId} info to database`);
      console.log(`   Start: ${new Date(cycleStartTime * 1000).toISOString()}`);
      console.log(`   End: ${new Date(cycleEndTime * 1000).toISOString()}`);
      console.log(`   Created oddyssey cycle with ID: ${cycleResult.rows[0].cycle_id}`);
      console.log(`   Updated ${updateResult.rowCount} matches with oracle cycle_id ${currentCycleId}`);

    } catch (error) {
      console.error('❌ Error saving cycle info:', error);
      // Don't throw - this is not critical for contract operation
    }
  }

  /**
   * Resolve daily cycle with match results
   */
  async resolveDailyCycle() {
    try {
      if (!this.oddysseyContract) {
        await this.initialize();
      }

      const currentCycleId = await this.oddysseyContract.dailyCycleId();
      const cycleData = await this.getCycleData(currentCycleId);

      if (!cycleData || !cycleData.matches_data) {
        throw new Error(`No cycle data found for cycle ${currentCycleId}`);
      }

      // Handle both JSON string and object formats
      let matches;
      if (typeof cycleData.matches_data === 'string') {
        matches = JSON.parse(cycleData.matches_data);
      } else if (Array.isArray(cycleData.matches_data)) {
        matches = cycleData.matches_data;
      } else {
        console.error('❌ Invalid matches_data format:', typeof cycleData.matches_data);
        throw new Error('Invalid matches_data format');
      }
      
      const results = await this.getMatchResults(matches);

      console.log(`🏁 Resolving cycle ${currentCycleId} with results`);

      const tx = await this.oddysseyContract.resolveDailyCycle(results);
      console.log(`🚀 Cycle resolution started! Tx: ${tx.hash}`);
      
      await tx.wait();
      console.log('✅ Cycle resolved');

      return { success: true, txHash: tx.hash, results: results.length };

    } catch (error) {
      console.error('❌ Error resolving daily cycle:', error);
      throw error;
    }
  }

  /**
   * Get cycle data from database
   */
  async getCycleData(cycleId) {
    try {
      const query = 'SELECT * FROM oracle.oddyssey_cycles WHERE cycle_id = $1';
      const result = await db.query(query, [cycleId]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error getting cycle data:', error);
      throw error;
    }
  }

  /**
   * Get match results for cycle resolution
   */
  async getMatchResults(matches) {
    try {
      const fixtureIds = matches.map(m => m.id);
      const results = await this.sportMonks.fetchFixtureResults(fixtureIds);
      
      return matches.map(match => {
        const result = results.find(r => r.fixture_id === match.id);
        
        if (result) {
          // Convert SportMonks results to contract format
          // MoneylineResult: { NotSet=0, HomeWin=1, Draw=2, AwayWin=3 }
          // OverUnderResult: { NotSet=0, Over=1, Under=2 }
          let moneylineResult = 0; // NotSet
          if (result.outcome_1x2 === '1') moneylineResult = 1; // HomeWin
          else if (result.outcome_1x2 === 'X') moneylineResult = 2; // Draw
          else if (result.outcome_1x2 === '2') moneylineResult = 3; // AwayWin

          let overUnderResult = 0; // NotSet
          if (result.outcome_ou25 === 'Over') overUnderResult = 1; // Over
          else if (result.outcome_ou25 === 'Under') overUnderResult = 2; // Under

          return {
            moneyline: moneylineResult,
            overUnder: overUnderResult
          };
        } else {
          return {
            moneyline: 0, // NotSet
            overUnder: 0  // NotSet
          };
        }
      });

    } catch (error) {
      console.error('❌ Error getting match results:', error);
      throw error;
    }
  }

  /**
   * Check cycle synchronization status between DB and contract
   */
  async checkCycleSync() {
    try {
      console.log('🔄 Checking cycle synchronization status...');
      
      // Get current contract cycle
      const contractCycleId = await this.oddysseyContract.dailyCycleId();
      console.log(`📋 Contract cycle ID: ${contractCycleId}`);
      
      // Convert BigInt to number for JSON serialization
      const contractCycleIdNum = Number(contractCycleId);
      
      // Get current DB cycle
      const dbCycleResult = await db.query(`
        SELECT cycle_id, created_at, is_resolved
        FROM oracle.oddyssey_cycles 
        ORDER BY cycle_id DESC 
        LIMIT 1
      `);
      
      const dbCycle = dbCycleResult.rows[0];
      console.log(`💾 DB cycle ID: ${dbCycle?.cycle_id || 'None'}`);
      
      const isSynced = dbCycle && contractCycleIdNum && dbCycle.cycle_id === contractCycleIdNum;
      
      const syncStatus = {
        dbCycleId: dbCycle?.cycle_id || 0,
        contractCycleId: contractCycleIdNum || 0,
        isSynced,
        dbCycleExists: !!dbCycle,
        contractCycleExists: !!contractCycleIdNum,
        lastSyncCheck: new Date().toISOString()
      };
      
      console.log(`✅ Cycle sync status: ${isSynced ? 'SYNCED' : 'OUT OF SYNC'}`);
      console.log(`   DB: ${syncStatus.dbCycleId}, Contract: ${syncStatus.contractCycleId}`);
      
      return syncStatus;
      
    } catch (error) {
      console.error('❌ Error checking cycle sync:', error);
      throw error;
    }
  }

  /**
   * Force cycle synchronization (admin only)
   */
  async forceCycleSync() {
    try {
      console.log('🔧 Force cycle synchronization started...');
      
      const syncStatus = await this.checkCycleSync();
      
      if (syncStatus.isSynced) {
        console.log('✅ Cycles already synced, no action needed');
        return {
          message: 'Cycles already synced',
          syncedCycleId: syncStatus.contractCycleId
        };
      }
      
      // If contract cycle exists but DB doesn't, sync DB to contract
      if (syncStatus.contractCycleExists && !syncStatus.dbCycleExists) {
        console.log('📊 Syncing DB to existing contract cycle...');
        await this.syncDbToContractCycle(syncStatus.contractCycleId);
        return {
          message: 'DB synced to contract cycle',
          syncedCycleId: syncStatus.contractCycleId
        };
      }
      
      // If DB cycle exists but contract doesn't, this is a problem
      if (syncStatus.dbCycleExists && !syncStatus.contractCycleExists) {
        throw new Error('DB cycle exists without corresponding contract cycle - manual intervention required');
      }
      
      // If both exist but are different, this is also a problem
      if (syncStatus.dbCycleExists && syncStatus.contractCycleExists && !syncStatus.isSynced) {
        throw new Error('DB and contract cycles are out of sync - manual intervention required');
      }
      
      return {
        message: 'No sync action needed',
        syncedCycleId: 0
      };
      
    } catch (error) {
      console.error('❌ Error forcing cycle sync:', error);
      throw error;
    }
  }

  /**
   * Sync database to match existing contract cycle
   */
  async syncDbToContractCycle(contractCycleId) {
    try {
      console.log(`🔄 Syncing DB to contract cycle ${contractCycleId}...`);
      
      // Get contract cycle matches
      const contractMatches = await this.oddysseyContract.getDailyMatches(contractCycleId);
      
      // Get cycle end time from contract
      const cycleEndTime = await this.oddysseyContract.dailyCycleEndTimes(contractCycleId);
      
      // Insert cycle into database
      await db.query(`
        INSERT INTO oracle.oddyssey_cycles (
          cycle_id, created_at, updated_at, matches_count, 
          matches_data, cycle_start_time, cycle_end_time, 
          is_resolved, tx_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (cycle_id) DO NOTHING
      `, [
        contractCycleId,
        new Date(),
        new Date(),
        contractMatches.length,
        JSON.stringify(contractMatches),
        Date.now() / 1000,
        Number(cycleEndTime),
        false,
        null // No tx hash for synced cycles
      ]);
      
      console.log(`✅ Successfully synced DB to contract cycle ${contractCycleId}`);
      
    } catch (error) {
      console.error(`❌ Error syncing DB to contract cycle ${contractCycleId}:`, error);
      throw error;
    }
  }

  /**
   * Start new daily cycle with retry logic and rollback
   */
  async startDailyCycleWithRetry(maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Cycle creation attempt ${attempt}/${maxRetries}`);
        const result = await this.startDailyCycle();
        console.log(`✅ Cycle creation successful on attempt ${attempt}`);
        return result;
      } catch (error) {
        console.error(`❌ Attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          // Final attempt failed - send alert
          await this.sendCycleCreationAlert(error);
          throw error;
        }
        
        // Wait before retry
        console.log(`⏳ Waiting 30 seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }
  }

  /**
   * Send cycle creation alert
   */
  async sendCycleCreationAlert(error) {
    try {
      console.error('🚨 CYCLE CREATION FAILED - SENDING ALERT');
      console.error('Error details:', error.message);
      
      // You can implement webhook alerts here
      // await this.sendWebhookAlert({
      //   type: 'CYCLE_CREATION_FAILED',
      //   message: `Cycle creation failed after all retries: ${error.message}`,
      //   severity: 'HIGH'
      // });
      
    } catch (alertError) {
      console.error('❌ Failed to send cycle creation alert:', alertError);
    }
  }
}

module.exports = OddysseyManager; 