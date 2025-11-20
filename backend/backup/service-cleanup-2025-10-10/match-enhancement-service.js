/**
 * 🏆 MATCH ENHANCEMENT SERVICE
 * 
 * Enhances contract match data with real team names and additional info
 * - Maps SportMonks fixture IDs to real team names
 * - Combines contract data with database data
 * - Provides enriched match data for frontend
 */

const db = require('../db/db');

class MatchEnhancementService {
  constructor() {
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    console.log('✅ Match Enhancement Service initialized');
  }

  /**
   * Enhance contract matches with real team names and data
   * @param {Array} contractMatches - Raw matches from contract
   * @param {number} cycleId - Current cycle ID
   * @returns {Array} Enhanced matches with real team names
   */
  async enhanceContractMatches(contractMatches, cycleId) {
    await this.initialize();

    if (!contractMatches || contractMatches.length === 0) {
      return [];
    }

    try {
      // Get enhanced match data from database
      const enhancedMatches = await this.getEnhancedMatchesFromDB(cycleId);
      
      // Map contract matches with database data
      const result = contractMatches.map((contractMatch, index) => {
        const fixtureId = contractMatch.id;
        const dbMatch = enhancedMatches.find(m => m.fixture_id === fixtureId);
        
        if (dbMatch) {
          return {
            id: fixtureId,
            homeTeam: dbMatch.home_team,
            awayTeam: dbMatch.away_team,
            league: dbMatch.league_name,
            homeOdds: this.formatOdds(contractMatch.oddsHome),
            drawOdds: this.formatOdds(contractMatch.oddsDraw),
            awayOdds: this.formatOdds(contractMatch.oddsAway),
            overOdds: this.formatOdds(contractMatch.oddsOver),
            underOdds: this.formatOdds(contractMatch.oddsUnder),
            startTime: new Date(Number(contractMatch.startTime) * 1000).toISOString(),
            matchDate: dbMatch.match_date,
            displayOrder: index + 1
          };
        } else {
          // Fallback to generic names if no DB match found
          return {
            id: fixtureId,
            homeTeam: `Team ${fixtureId}A`,
            awayTeam: `Team ${fixtureId}B`,
            league: 'Unknown League',
            homeOdds: this.formatOdds(contractMatch.oddsHome),
            drawOdds: this.formatOdds(contractMatch.oddsDraw),
            awayOdds: this.formatOdds(contractMatch.oddsAway),
            overOdds: this.formatOdds(contractMatch.oddsOver),
            underOdds: this.formatOdds(contractMatch.oddsUnder),
            startTime: new Date(Number(contractMatch.startTime) * 1000).toISOString(),
            matchDate: new Date().toISOString().split('T')[0],
            displayOrder: index + 1
          };
        }
      });

      console.log(`✅ Enhanced ${result.length} matches with real team names`);
      return result;

    } catch (error) {
      console.error('❌ Error enhancing contract matches:', error);
      throw error;
    }
  }

  /**
   * Get enhanced match data from database
   * @param {number} cycleId - Current cycle ID
   * @returns {Array} Enhanced matches from database
   */
  async getEnhancedMatchesFromDB(cycleId) {
    try {
      // Get matches from daily_game_matches table
      const result = await db.query(`
        SELECT 
          fixture_id, home_team, away_team, league_name, match_date,
          home_odds, draw_odds, away_odds, over_25_odds, under_25_odds,
          display_order
        FROM oracle.daily_game_matches 
        WHERE game_date = CURRENT_DATE
        ORDER BY display_order
      `);

      return result.rows;
    } catch (error) {
      console.error('❌ Error getting enhanced matches from DB:', error);
      return [];
    }
  }

  /**
   * Format odds from contract format to display format
   * @param {number} odds - Raw odds from contract
   * @returns {number} Formatted odds
   */
  formatOdds(odds) {
    if (!odds || odds === 0) return 0;
    // Convert from contract format (e.g., 2300 = 2.30)
    return Number(odds) / 1000;
  }

  /**
   * Get match details by fixture ID
   * @param {string} fixtureId - SportMonks fixture ID
   * @returns {Object} Enhanced match details
   */
  async getMatchDetails(fixtureId) {
    await this.initialize();

    try {
      const result = await db.query(`
        SELECT 
          fixture_id, home_team, away_team, league_name, match_date,
          home_odds, draw_odds, away_odds, over_25_odds, under_25_odds,
          display_order, created_at
        FROM oracle.daily_game_matches 
        WHERE fixture_id = $1
      `, [fixtureId]);

      if (result.rows.length === 0) {
        return null;
      }

      const match = result.rows[0];
      return {
        id: match.fixture_id,
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        league: match.league_name,
        homeOdds: match.home_odds,
        drawOdds: match.draw_odds,
        awayOdds: match.away_odds,
        overOdds: match.over_25_odds,
        underOdds: match.under_25_odds,
        matchDate: match.match_date,
        displayOrder: match.display_order,
        createdAt: match.created_at
      };
    } catch (error) {
      console.error('❌ Error getting match details:', error);
      throw error;
    }
  }

  /**
   * Get all enhanced matches for a cycle
   * @param {number} cycleId - Current cycle ID
   * @returns {Array} All enhanced matches
   */
  async getAllEnhancedMatches(cycleId) {
    await this.initialize();

    try {
      const result = await db.query(`
        SELECT 
          fixture_id, home_team, away_team, league_name, match_date,
          home_odds, draw_odds, away_odds, over_25_odds, under_25_odds,
          display_order
        FROM oracle.daily_game_matches 
        WHERE game_date = CURRENT_DATE
        ORDER BY display_order
        LIMIT 10
      `);

      return result.rows.map(match => ({
        id: match.fixture_id,
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        league: match.league_name,
        homeOdds: match.home_odds,
        drawOdds: match.draw_odds,
        awayOdds: match.away_odds,
        overOdds: match.over_25_odds,
        underOdds: match.under_25_odds,
        matchDate: match.match_date,
        displayOrder: match.display_order
      }));
    } catch (error) {
      console.error('❌ Error getting all enhanced matches:', error);
      throw error;
    }
  }
}

module.exports = MatchEnhancementService;
