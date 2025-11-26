const db = require('../db/db');
const OddysseyMatchSelector = require('./oddyssey-match-selector');

/**
 * Persistent Daily Game Manager Service
 * 
 * This service ensures consistent daily match selection that never changes once persisted.
 * It implements overwrite protection and serves as the single source of truth for daily games.
 * Now uses the sophisticated OddysseyMatchSelector for better match selection.
 */
class PersistentDailyGameManager {
  constructor() {
    this.MATCHES_PER_DATE = 10;
    this.MIN_MATCH_HOUR_UTC = 11; // Matches must start after 11:00 AM UTC (aligned with OddysseyMatchSelector)
    
    // Use the sophisticated match selector
    this.matchSelector = new OddysseyMatchSelector();
    
    // Priority leagues for better match selection (kept for compatibility)
    this.PRIORITY_LEAGUES = [
      'Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1',
      'Champions League', 'Europa League', 'Europa Conference League',
      'Eredivisie', 'Primeira Liga', 'Super Lig', 'MLS', 'Serie A Brazil'
    ];
  }

  /**
   * Select and persist daily matches with overwrite protection
   * This method will only run if no matches exist for the given date
   * Now uses the sophisticated OddysseyMatchSelector for better match selection
   * 
   * @param {string|Date} date - Target date (YYYY-MM-DD format or Date object)
   * @returns {Promise<Object>} Selection result with match count and status
   */
  async selectAndPersistDailyMatches(date = null) {
    try {
      const targetDate = this._formatDate(date || new Date());
      
      console.log(`🎯 Selecting and persisting daily matches for ${targetDate} using sophisticated OddysseyMatchSelector...`);

      // Check if matches already exist (overwrite protection)
      const existingMatches = await this._checkExistingMatches(targetDate);
      if (existingMatches.count > 0) {
        console.log(`⚠️ Matches already exist for ${targetDate} (${existingMatches.count} matches). Overwrite protection active.`);
        return {
          success: true,
          message: 'Matches already exist - overwrite protection active',
          date: targetDate,
          matchCount: existingMatches.count,
          overwriteProtected: true
        };
      }

      // Use the sophisticated OddysseyMatchSelector for match selection
      console.log(`🔍 Using OddysseyMatchSelector to select matches for ${targetDate}...`);
      const selectionResult = await this.matchSelector.selectDailyMatches(targetDate);
      
      if (!selectionResult || !selectionResult.selectedMatches || selectionResult.selectedMatches.length === 0) {
        throw new Error(`OddysseyMatchSelector failed to select matches for ${targetDate}`);
      }

      if (selectionResult.selectedMatches.length !== this.MATCHES_PER_DATE) {
        throw new Error(`OddysseyMatchSelector selected ${selectionResult.selectedMatches.length} matches, need exactly ${this.MATCHES_PER_DATE}`);
      }

      console.log(`✅ OddysseyMatchSelector selected ${selectionResult.selectedMatches.length} matches for ${targetDate}`);
      console.log(`📊 Selection summary:`, selectionResult.summary);

      // Convert OddysseyMatchSelector format to our internal format
      const selectedMatches = this._convertOddysseyMatchesToInternal(selectionResult.selectedMatches);

      // Validate selection
      this._validateMatchSelection(selectedMatches);

      // Persist matches to database
      const persistResult = await this._persistMatches(targetDate, selectedMatches);

      console.log(`✅ Successfully persisted ${persistResult.matchCount} matches for ${targetDate} using sophisticated selection`);

      return {
        success: true,
        message: 'Daily matches selected and persisted successfully using OddysseyMatchSelector',
        date: targetDate,
        matchCount: persistResult.matchCount,
        cycleId: persistResult.cycleId,
        overwriteProtected: false,
        selectionSummary: selectionResult.summary
      };

    } catch (error) {
      console.error('❌ Error selecting and persisting daily matches:', error);
      throw error;
    }
  }

  /**
   * Convert OddysseyMatchSelector format to internal format
   * @param {Array} oddysseyMatches - Matches from OddysseyMatchSelector
   * @returns {Array} Converted matches in internal format
   */
  _convertOddysseyMatchesToInternal(oddysseyMatches) {
    return oddysseyMatches.map((match, index) => ({
      fixture_id: match.fixtureId, // Use fixture_id for validation compatibility
      fixtureId: match.fixtureId, // Keep both for compatibility
      home_team: match.homeTeam,
      homeTeam: match.homeTeam,
      away_team: match.awayTeam,
      awayTeam: match.awayTeam,
      league: match.league,
      league_name: match.league,
      leagueName: match.league,
      match_date: match.matchDate,
      matchDate: match.matchDate,
      odds: match.odds,
      home_odds: match.odds?.home,
      draw_odds: match.odds?.draw,
      away_odds: match.odds?.away,
      over_25_odds: match.odds?.over25,
      under_25_odds: match.odds?.under25,
      selectionType: 'sophisticated',
      priorityScore: match.priorityScore || match.qualityScore || 0,
      difficulty: match.difficulty || 'medium',
      displayOrder: index + 1
    }));
  }

  /**
   * Get daily matches from persistent storage only
   * This method never generates new matches, only reads from database
   * 
   * @param {string|Date} date - Target date (YYYY-MM-DD format or Date object)
   * @returns {Promise<Object>} Matches data or empty array if none exist
   */
  async getDailyMatches(date = null) {
    try {
      const targetDate = this._formatDate(date || new Date());
      
      console.log(`📖 Getting daily matches from persistent storage for ${targetDate}...`);

      // Get matches from daily_game_matches table with temporary cycle_id = 0
      const matchesQuery = `
        SELECT 
          fixture_id, home_team, away_team, league_name, match_date, game_date,
          home_odds, draw_odds, away_odds, over_25_odds, under_25_odds,
          selection_type, priority_score, cycle_id, display_order
        FROM oracle.daily_game_matches 
        WHERE game_date = $1 
        AND cycle_id = 0
        ORDER BY display_order
      `;
      const matchesResult = await db.query(matchesQuery, [targetDate]);
      
      if (matchesResult.rows.length === 0) {
        console.log(`⚠️ No matches found with cycle_id = 0 for ${targetDate}`);
        return {
          success: true,
          date: targetDate,
          matches: [],
          message: 'No matches found with temporary cycle_id'
        };
      }

      const matches = matchesResult.rows.map(match => ({
        id: match.fixture_id,
        fixture_id: match.fixture_id,
        home_team: match.home_team,
        away_team: match.away_team,
        league_name: match.league_name,
        match_date: match.match_date,
        home_odds: match.home_odds,
        draw_odds: match.draw_odds,
        away_odds: match.away_odds,
        over_25_odds: match.over_25_odds,
        under_25_odds: match.under_25_odds,
        display_order: match.display_order,
        cycle_id: match.cycle_id
      }));

      // Validate we have exactly 10 matches
      if (matches.length !== this.MATCHES_PER_DATE) {
        console.warn(`⚠️ Expected ${this.MATCHES_PER_DATE} matches, found ${matches.length} for ${targetDate}`);
      }

      console.log(`✅ Retrieved ${matches.length} matches with cycle_id = 0 for ${targetDate}`);

      return {
        success: true,
        date: targetDate,
        matches: matches,
        cycleId: 0 // Temporary cycle_id, will be updated when real cycle is created
      };

    } catch (error) {
      console.error('❌ Error getting daily matches:', error);
      throw error;
    }
  }

  /**
   * Validate that exactly 10 matches exist for a date
   * 
   * @param {string|Date} date - Target date
   * @returns {Promise<Object>} Validation result
   */
  async validateMatchCount(date = null) {
    try {
      const targetDate = this._formatDate(date || new Date());
      
      const result = await db.query(`
        SELECT COUNT(*) as count 
        FROM oracle.daily_game_matches 
        WHERE DATE(game_date) = DATE($1)
      `, [targetDate]);

      const count = parseInt(result.rows[0].count);
      const isValid = count === this.MATCHES_PER_DATE;

      return {
        date: targetDate,
        count: count,
        expected: this.MATCHES_PER_DATE,
        isValid: isValid,
        message: isValid 
          ? `Exactly ${this.MATCHES_PER_DATE} matches found` 
          : `Expected ${this.MATCHES_PER_DATE} matches, found ${count}`
      };

    } catch (error) {
      console.error('❌ Error validating match count:', error);
      throw error;
    }
  }

  /**
   * Get match candidates for a specific date with complete odds data
   * 
   * @private
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} Array of match candidates
   */
  async _getMatchCandidates(date) {
    try {
      const startDate = new Date(date);
      startDate.setUTCHours(this.MIN_MATCH_HOUR_UTC, 0, 0, 0);
      
      const endDate = new Date(date);
      endDate.setUTCHours(23, 59, 59, 999);

      const query = `
        SELECT DISTINCT ON (f.id)
          f.id as fixture_id,
          f.home_team,
          f.away_team,
          f.league_name,
          f.match_date,
          ft.home_odds,
          ft.draw_odds,
          ft.away_odds,
          ou.over_odds as over_25_odds,
          ou.under_odds as under_25_odds,
          COALESCE(l.is_popular, false) as is_popular,
          l.country,
          l.country_code
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
          AND ou.over_odds IS NOT NULL
          AND ou.under_odds IS NOT NULL
          AND ft.home_odds > 1.0
          AND ft.draw_odds > 1.0
          AND ft.away_odds > 1.0
          AND ou.over_odds > 1.0
          AND ou.under_odds > 1.0
          AND f.league_name NOT ILIKE '%women%'
          AND f.league_name NOT ILIKE '%female%'
          AND f.league_name NOT ILIKE '%ladies%'
          AND f.home_team NOT ILIKE '%women%'
          AND f.away_team NOT ILIKE '%women%'
          AND f.home_team NOT ILIKE '%female%'
          AND f.away_team NOT ILIKE '%female%'
          AND f.home_team NOT ILIKE '%ladies%'
          AND f.away_team NOT ILIKE '%ladies%'
          AND (
            -- Ensure odds are not default/mock values
            ft.home_odds != 1.5 
            OR ft.draw_odds != 3.0 
            OR ft.away_odds != 2.5
            OR ou.over_odds != 1.8 
            OR ou.under_odds != 2.0
          )
        ORDER BY f.id, f.match_date ASC
      `;

      const result = await db.query(query, [startDate, endDate]);
      
      return result.rows.map(row => {
        // Add country prefix to league name if available and if it's a generic name
        let displayLeagueName = row.league_name;
        if (row.country && row.country_code) {
          const genericNames = ['Premier League', 'First Division', 'Second Division', 'Cup', 'League'];
          const isGenericName = genericNames.some(name => 
            row.league_name.toLowerCase().includes(name.toLowerCase())
          );
          
          if (isGenericName) {
            displayLeagueName = `${row.country} ${row.league_name}`;
          }
        }

        return {
          fixture_id: row.fixture_id,
          home_team: row.home_team,
          away_team: row.away_team,
          league_name: displayLeagueName,
          original_league_name: row.league_name,
          country: row.country,
          country_code: row.country_code,
          match_date: new Date(row.match_date),
          home_odds: parseFloat(row.home_odds),
          draw_odds: parseFloat(row.draw_odds),
          away_odds: parseFloat(row.away_odds),
          over_25_odds: parseFloat(row.over_25_odds),
          under_25_odds: parseFloat(row.under_25_odds),
          is_popular: row.is_popular
        };
      });

    } catch (error) {
      console.error('❌ Error getting match candidates:', error);
      throw error;
    }
  }

  /**
   * Select the best matches based on quality criteria
   * 
   * @private
   * @param {Array} candidates - Array of candidate matches
   * @param {number} count - Number of matches to select
   * @returns {Array} Selected matches
   */
  _selectBestMatches(candidates, count) {
    // Score each match based on quality criteria
    const scoredMatches = candidates.map(match => ({
      ...match,
      quality_score: this._calculateMatchQuality(match)
    }));

    // Sort by quality score (highest first)
    scoredMatches.sort((a, b) => b.quality_score - a.quality_score);

    // Select top matches with time distribution
    const selected = [];
    const timeSlots = new Map();

    for (const match of scoredMatches) {
      if (selected.length >= count) break;

      const hourSlot = match.match_date.getUTCHours();
      const slotCount = timeSlots.get(hourSlot) || 0;

      // Limit matches per hour slot for better distribution
      if (slotCount < 3) {
        selected.push(match);
        timeSlots.set(hourSlot, slotCount + 1);
      }
    }

    // Fill remaining slots if needed
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
   * 
   * @private
   * @param {Object} match - Match data
   * @returns {number} Quality score
   */
  _calculateMatchQuality(match) {
    let score = 0;

    // League priority scoring
    if (match.is_popular) score += 30;
    
    const leagueName = match.league_name.toLowerCase();
    for (const priorityLeague of this.PRIORITY_LEAGUES) {
      if (leagueName.includes(priorityLeague.toLowerCase())) {
        score += 25;
        break;
      }
    }

    // Odds quality (prefer competitive matches)
    const odds = [match.home_odds, match.draw_odds, match.away_odds];
    const maxOdd = Math.max(...odds);
    const minOdd = Math.min(...odds);
    
    if (maxOdd > 0 && minOdd > 0) {
      const oddsBalance = minOdd / maxOdd;
      score += oddsBalance * 20; // 0-20 points for balance
      
      // Prefer reasonable odds range
      const avgOdd = odds.reduce((sum, odd) => sum + odd, 0) / odds.length;
      if (avgOdd >= 1.2 && avgOdd <= 5.0) score += 15;
    }

    // Over/Under odds quality
    const ouDiff = Math.abs(match.over_25_odds - match.under_25_odds);
    if (ouDiff >= 0.1 && ouDiff <= 0.8) score += 10;

    // Time preference (afternoon/evening matches)
    const matchHour = match.match_date.getUTCHours();
    if (matchHour >= 15 && matchHour <= 21) score += 10;

    // Add small random factor for variety
    score += Math.random() * 5;

    return score;
  }

  /**
   * Check if matches already exist for a date
   * 
   * @private
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Existing matches info
   */
  async _checkExistingMatches(date) {
    try {
      const result = await db.query(`
        SELECT COUNT(*) as count, MIN(cycle_id) as cycle_id
        FROM oracle.daily_game_matches 
        WHERE DATE(game_date) = DATE($1)
        AND cycle_id = 0
      `, [date]);

      return {
        count: parseInt(result.rows[0].count),
        cycleId: result.rows[0].cycle_id
      };

    } catch (error) {
      console.error('❌ Error checking existing matches:', error);
      throw error;
    }
  }

  /**
   * Persist selected matches to database
   * 
   * @private
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Array} matches - Selected matches
   * @returns {Promise<Object>} Persist result
   */
  async _persistMatches(date, matches) {
    try {
      // Don't create cycle_id here - it will be set when contract cycle is created
      // This prevents mismatched cycle IDs between database and contract

      // Insert matches in transaction
      await db.query('BEGIN');

      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        
        await db.query(`
          INSERT INTO oracle.daily_game_matches (
            fixture_id, home_team, away_team, league_name, match_date, game_date,
            home_odds, draw_odds, away_odds, over_25_odds, under_25_odds,
            selection_type, priority_score, cycle_id, display_order, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
        `, [
          match.fixtureId || match.fixture_id,
          match.homeTeam || match.home_team,
          match.awayTeam || match.away_team,
          match.leagueName || match.league_name || match.league,
          match.matchDate || match.match_date,
          date,
          match.odds?.home || match.home_odds,
          match.odds?.draw || match.draw_odds,
          match.odds?.away || match.away_odds,
          match.odds?.over25 || match.over_25_odds,
          match.odds?.under25 || match.under_25_odds,
          match.selectionType || 'sophisticated',
          Math.round(match.priorityScore || match.quality_score || 0),
          0, // Temporary cycle_id, will be updated when real cycle is created
          match.displayOrder || i + 1
        ]);
      }

      await db.query('COMMIT');

      return {
        matchCount: matches.length,
        cycleId: null // Will be set when contract cycle is created
      };

    } catch (error) {
      await db.query('ROLLBACK');
      console.error('❌ Error persisting matches:', error);
      throw error;
    }
  }

  /**
   * Validate match selection meets requirements
   * 
   * @private
   * @param {Array} matches - Selected matches
   * @throws {Error} If validation fails
   */
  _validateMatchSelection(matches) {
    if (!Array.isArray(matches)) {
      throw new Error('Matches must be an array');
    }

    if (matches.length !== this.MATCHES_PER_DATE) {
      throw new Error(`Expected ${this.MATCHES_PER_DATE} matches, got ${matches.length}`);
    }

    // Check for duplicates
    const fixtureIds = matches.map(m => m.fixture_id);
    const uniqueIds = new Set(fixtureIds);
    if (uniqueIds.size !== fixtureIds.length) {
      throw new Error('Duplicate fixture IDs found in selection');
    }

    // Validate each match has required data
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      
      if (!match.fixture_id || !match.home_team || !match.away_team) {
        throw new Error(`Match ${i + 1}: Missing basic match data`);
      }

      if (!match.home_odds || !match.draw_odds || !match.away_odds || 
          !match.over_25_odds || !match.under_25_odds) {
        throw new Error(`Match ${i + 1}: Missing odds data`);
      }

      if (match.match_date <= new Date()) {
        throw new Error(`Match ${i + 1}: Match time is in the past`);
      }
    }
  }

  /**
   * Format date to YYYY-MM-DD string
   * 
   * @private
   * @param {string|Date} date - Input date
   * @returns {string} Formatted date string
   */
  _formatDate(date) {
    if (typeof date === 'string') {
      // Assume it's already in YYYY-MM-DD format
      return date;
    }
    
    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }
    
    throw new Error('Invalid date format');
  }
}

module.exports = PersistentDailyGameManager;
