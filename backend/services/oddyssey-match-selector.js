const SportMonksService = require('./sportmonks');
const db = require('../db/db');

class OddysseyMatchSelector {
  constructor() {
    this.sportmonksService = new SportMonksService();
    
    // Comprehensive league priority system - higher number = higher priority
    this.LEAGUE_PRIORITIES = {
      // Tier 1: Top European Leagues (specific to avoid conflicts)
      'Premier League': 100, // Will be filtered by team names
      'Serie A (Italy)': 100, // Explicitly Italian Serie A
      'Serie A (Brazil)': 25, // Brazilian Serie A - much lower priority
      'La Liga': 100,
      'Bundesliga': 100,
      'Ligue 1': 95,
      
      // Tier 2: European Competitions
      'Champions League': 110,
      'Europa League': 105,
      'Europa Conference League': 100,
      
      // Tier 3: Strong European Leagues
      'Eredivisie': 85,
      'Pro League': 80,
      'Primeira Liga': 80,
      'Super Lig': 75,
      
      // Tier 4: Other European Leagues
      'Championship': 70,
      'Serie B': 65,
      'La Liga 2': 65,
      'Ligue 2': 65,
      '2. Bundesliga': 65,
      'Eerste Divisie': 60,
      
      // Tier 5: Lower European Leagues
      'Ekstraklasa': 50,
      'Superliga': 50,
      'First Division': 45,
      'Allsvenskan': 45,
      'Eliteserien': 45,
      
      // Additional leagues for better coverage
      'England Premier League': 100,
      'England Championship': 70,
      'England League One': 40,
      'Spain La Liga': 100,
      'Spain Segunda División': 65,
      'Germany Bundesliga': 100,
      'Germany 2. Bundesliga': 65,
      'Italy Serie A': 100,
      'Italy Serie B': 65,
      'Belgium Pro League': 80,
      'Netherlands Eredivisie': 85,
      'Portugal Primeira Liga': 80,
      'Turkey Süper Lig': 75,
      'Greece Super League': 50,
      'Croatia 1. HNL': 40,
      'Norway Eliteserien': 45,
      'Denmark Superliga': 50,
      'Finland Veikkausliiga': 35,
      'Sweden Allsvenskan': 45,
      'Switzerland Super League': 50,
      'Poland Ekstraklasa': 50,
      'Hungary NB I': 40,
      'USA Major League Soccer': 30,
      'Brazil Serie A': 25,
      'Brazil Serie B': 15,
      'Argentina Liga Profesional de Fútbol': 20,
      'Mexico Liga MX': 25,
      'Saudi Arabia Saudi Pro League': 20,
      'Copa Libertadores': 30,
      'Copa Sudamericana': 20,
      
      // Default for unknown leagues
      'default': 30
    };

    // Team-based league identification for ambiguous league names
    this.TEAM_LEAGUE_MAPPING = {
      // English Premier League teams
      'Arsenal': 'Premier League (England)',
      'Chelsea': 'Premier League (England)',
      'Liverpool': 'Premier League (England)',
      'Manchester City': 'Premier League (England)',
      'Manchester United': 'Premier League (England)',
      'Tottenham': 'Premier League (England)',
      'Newcastle': 'Premier League (England)',
      'Brighton': 'Premier League (England)',
      'Aston Villa': 'Premier League (England)',
      'West Ham': 'Premier League (England)',
      'Burnley': 'Premier League (England)',
      'Nottingham Forest': 'Premier League (England)',
      'Fulham': 'Premier League (England)',
      'Leeds': 'Premier League (England)',
      'Wolverhampton': 'Premier League (England)',
      'Bournemouth': 'Premier League (England)',
      'Crystal Palace': 'Premier League (England)',
      'Sunderland': 'Premier League (England)',
      'Everton': 'Premier League (England)',
      'Brentford': 'Premier League (England)',
      
      // Italian Serie A teams
      'Juventus': 'Serie A (Italy)',
      'Inter': 'Serie A (Italy)',
      'Milan': 'Serie A (Italy)',
      'Napoli': 'Serie A (Italy)',
      'Roma': 'Serie A (Italy)',
      'Lazio': 'Serie A (Italy)',
      'Atalanta': 'Serie A (Italy)',
      'Fiorentina': 'Serie A (Italy)',
      'Torino': 'Serie A (Italy)',
      'Udinese': 'Serie A (Italy)',
      'Cagliari': 'Serie A (Italy)',
      'Parma': 'Serie A (Italy)',
      'Lecce': 'Serie A (Italy)',
      'AC Milan': 'Serie A (Italy)',
      'Inter Milan': 'Serie A (Italy)',
      'AS Roma': 'Serie A (Italy)',
      'SS Lazio': 'Serie A (Italy)',
      'SSC Napoli': 'Serie A (Italy)',
      'AC Fiorentina': 'Serie A (Italy)',
      'Bologna': 'Serie A (Italy)',
      'Empoli': 'Serie A (Italy)',
      'Genoa': 'Serie A (Italy)',
      'Hellas Verona': 'Serie A (Italy)',
      'Salernitana': 'Serie A (Italy)',
      'Sassuolo': 'Serie A (Italy)',
      
      // Brazilian Serie A teams
      'Flamengo': 'Serie A (Brazil)',
      'Palmeiras': 'Serie A (Brazil)',
      'Santos': 'Serie A (Brazil)',
      'Corinthians': 'Serie A (Brazil)',
      'Sao Paulo': 'Serie A (Brazil)',
      'Gremio': 'Serie A (Brazil)',
      'Internacional': 'Serie A (Brazil)',
      'Atletico Mineiro': 'Serie A (Brazil)',
      'Cruzeiro': 'Serie A (Brazil)',
      'Botafogo': 'Serie A (Brazil)',
      'Vasco da Gama': 'Serie A (Brazil)',
      'Fluminense': 'Serie A (Brazil)',
      'Athletico Paranaense': 'Serie A (Brazil)',
      'Fortaleza': 'Serie A (Brazil)',
      'Bahia': 'Serie A (Brazil)',
      'Ceara': 'Serie A (Brazil)',
      'Sport Recife': 'Serie A (Brazil)',
      'America Mineiro': 'Serie A (Brazil)',
      'Chapecoense': 'Serie A (Brazil)',
      'Goias': 'Serie A (Brazil)',
      'Cuiaba': 'Serie A (Brazil)',
      'Coritiba': 'Serie A (Brazil)',
      'Avai': 'Serie A (Brazil)',
      'Juventude': 'Serie A (Brazil)',
      'Bragantino': 'Serie A (Brazil)',
      
      // Spanish La Liga teams
      'Real Madrid': 'La Liga (Spain)',
      'Barcelona': 'La Liga (Spain)',
      'Atletico Madrid': 'La Liga (Spain)',
      'Real Sociedad': 'La Liga (Spain)',
      'Villarreal': 'La Liga (Spain)',
      'Real Betis': 'La Liga (Spain)',
      'Sevilla': 'La Liga (Spain)',
      'Valencia': 'La Liga (Spain)',
      'Athletic Club': 'La Liga (Spain)',
      'Getafe': 'La Liga (Spain)',
      'Celta de Vigo': 'La Liga (Spain)',
      'Girona': 'La Liga (Spain)',
      'Osasuna': 'La Liga (Spain)',
      'Rayo Vallecano': 'La Liga (Spain)',
      'Levante': 'La Liga (Spain)',
      
      // German Bundesliga teams
      'Bayern': 'Bundesliga (Germany)',
      'Borussia Dortmund': 'Bundesliga (Germany)',
      'RB Leipzig': 'Bundesliga (Germany)',
      'Bayer Leverkusen': 'Bundesliga (Germany)',
      'Eintracht Frankfurt': 'Bundesliga (Germany)',
      'VfB Stuttgart': 'Bundesliga (Germany)',
      'SC Freiburg': 'Bundesliga (Germany)',
      'VfL Wolfsburg': 'Bundesliga (Germany)',
      'FC Köln': 'Bundesliga (Germany)',
      'FC Union Berlin': 'Bundesliga (Germany)',
      'TSG Hoffenheim': 'Bundesliga (Germany)',
      'FSV Mainz': 'Bundesliga (Germany)',
      'Heidenheim': 'Bundesliga (Germany)',
      'St. Pauli': 'Bundesliga (Germany)',
      'FC Augsburg': 'Bundesliga (Germany)',
      'Borussia Mönchengladbach': 'Bundesliga (Germany)',
      'Werder Bremen': 'Bundesliga (Germany)',
      
      // French Ligue 1 teams
      'Paris': 'Ligue 1 (France)',
      'PSG': 'Ligue 1 (France)',
      'Monaco': 'Ligue 1 (France)',
      'Marseille': 'Ligue 1 (France)',
      'Lyon': 'Ligue 1 (France)',
      'Lille': 'Ligue 1 (France)',
      'Rennes': 'Ligue 1 (France)',
      'Nice': 'Ligue 1 (France)',
      'Nantes': 'Ligue 1 (France)',
      'Auxerre': 'Ligue 1 (France)',
      'Toulouse': 'Ligue 1 (France)',
      'Brest': 'Ligue 1 (France)',
      'Olympique Lyonnais': 'Ligue 1 (France)',
      'LOSC Lille': 'Ligue 1 (France)'
    };
  }

  /**
   * Get priority score for a league, with team-based identification for ambiguous leagues
   * Uses priorities as guidelines, not strict rules - will fall back to available matches
   */
  getLeaguePriority(leagueName, homeTeam = null, awayTeam = null) {
    // For ambiguous league names like "Premier League", use team names to identify the actual league
    if (leagueName === 'Premier League' && (homeTeam || awayTeam)) {
      // Check if either team is from English Premier League
      const englishTeams = ['Arsenal', 'Chelsea', 'Liverpool', 'Manchester City', 'Manchester United', 
                           'Tottenham', 'Newcastle', 'Brighton', 'Aston Villa', 'West Ham', 
                           'Burnley', 'Nottingham Forest', 'Fulham', 'Leeds', 'Wolverhampton', 
                           'Bournemouth', 'Crystal Palace', 'Sunderland', 'Everton', 'Brentford'];
      
      const isEnglishTeam = (team) => {
        if (!team) return false;
        return englishTeams.some(englishTeam => team.includes(englishTeam));
      };
      
      if (isEnglishTeam(homeTeam) || isEnglishTeam(awayTeam)) {
        return 100; // English Premier League
      } else {
        return 30; // Other "Premier League" (Ukraine, Russia, Egypt, etc.)
      }
    }
    
    // For other leagues, use the standard priority
    return this.LEAGUE_PRIORITIES[leagueName] || this.LEAGUE_PRIORITIES.default;
  }

  /**
   * Select 10 optimal matches for daily Oddyssey game (Priority-based strategy)
   * Strategy: Prioritize high-quality leagues but fall back to available matches
   */
  async selectDailyMatches(targetDate = null) {
    try {
      console.log('🎯 Selecting 10 matches for Oddyssey daily cycle (difficulty-based)...');

      let dateStr;
      if (targetDate) {
        // If targetDate is already a string (YYYY-MM-DD format), use it directly
        dateStr = targetDate;
      } else {
        // Otherwise, use current date
        const date = new Date();
        dateStr = date.toISOString().split('T')[0];
      }

      console.log(`📅 Target date for Oddyssey selection: ${dateStr}`);
      console.log(`🕐 Current UTC time: ${new Date().toISOString()}`);

      // Get all fixtures for the target date with odds
      console.log(`🔍 Fetching fixtures with complete odds (1X2 + 2.5 Over/Under) for ${dateStr}...`);
      const fixtures = await this.getFixturesWithOdds(dateStr);
      console.log(`✅ Found ${fixtures.length} fixtures with complete odds`);
      
      // If we don't have enough fixtures with complete odds, get more with basic odds
      if (fixtures.length < 10) {
        console.warn(`⚠️ Only ${fixtures.length} fixtures with complete odds for ${dateStr}, fetching more with basic odds...`);
        const additionalFixtures = await this.getFixturesWithBasicOdds(dateStr, 10 - fixtures.length);
        fixtures.push(...additionalFixtures);
        console.log(`📊 Total fixtures available: ${fixtures.length}`);
      }

      // Ensure we have at least 10 fixtures
      if (fixtures.length < 10) {
        console.warn(`⚠️ Only ${fixtures.length} fixtures available for ${dateStr}, need 10`);
        throw new Error(`Insufficient fixtures: ${fixtures.length}/10 available`);
      }

      console.log(`📊 Analyzing ${fixtures.length} fixtures for optimal selection...`);

      // Categorize matches by difficulty based on odds
      const categorized = this.categorizeMatchesByDifficulty(fixtures);
      
      // Use league-based prioritization with flexible fallback
      console.log('🏆 Using league priority-based match selection (flexible approach)...');
      const selectedMatches = this.selectMatchesByLeaguePriority(fixtures);

      // CRITICAL: Final validation - ensure exactly 10 matches
      if (selectedMatches.length !== 10) {
        console.error(`❌ CRITICAL ERROR: Selected ${selectedMatches.length} matches, must be exactly 10!`);
        throw new Error(`Invalid match selection: ${selectedMatches.length} matches selected, must be exactly 10`);
      }

      // Validate all matches have proper odds
      this.validateMatchSelection(selectedMatches);

      console.log('✅ Selected 10 matches for Oddyssey:');
      console.log(`   • Easy matches: ${selectedMatches.filter(m => m.difficulty === 'easy').length}`);
      console.log(`   • Medium matches: ${selectedMatches.filter(m => m.difficulty === 'medium').length}`);
      console.log(`   • Hard matches: ${selectedMatches.filter(m => m.difficulty === 'hard').length}`);

      // Convert to Oddyssey contract format
      const oddysseyMatches = this.formatForOddyssey(selectedMatches);

      // CRITICAL: Save matches to database
      console.log('💾 Saving selected matches to database...');
      await this.saveMatchesForDate(dateStr, selectedMatches, 'oddyssey');
      console.log('✅ Matches saved to daily_game_matches table');

      return {
        selectedMatches,
        oddysseyMatches,
        summary: {
          totalFixtures: fixtures.length,
          easy: selectedMatches.filter(m => m.difficulty === 'easy').length,
          medium: selectedMatches.filter(m => m.difficulty === 'medium').length,
          hard: selectedMatches.filter(m => m.difficulty === 'hard').length
        }
      };

    } catch (error) {
      console.error('❌ Failed to select daily matches:', error);
      throw error;
    }
  }



  /**
   * Get fixtures for a specific date
   */
  async getFixturesForDate(date) {
    try {
      const result = await db.query(`
        SELECT 
          f.*,
          fo.value as odds_data
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_odds fo ON f.id::VARCHAR = fo.fixture_id AND fo.is_main = true
        WHERE DATE(f.match_date) = $1
        AND f.status IN ('NS', 'Fixture')
        AND f.league_name NOT ILIKE '%women%'
        AND f.league_name NOT ILIKE '%female%'
        AND f.league_name NOT ILIKE '%ladies%'
        AND f.home_team NOT ILIKE '%women%'
        AND f.away_team NOT ILIKE '%women%'
        AND f.home_team NOT ILIKE '%female%'
        AND f.away_team NOT ILIKE '%female%'
        AND f.home_team NOT ILIKE '%ladies%'
        AND f.away_team NOT ILIKE '%ladies%'
        ORDER BY f.match_date ASC
      `, [date]);
      
      return result.rows;
    } catch (error) {
      console.error(`❌ Error getting fixtures for ${date}:`, error);
      return [];
    }
  }

  /**
   * Select the best matches using priority-based strategy
   */
  selectBestMatchesByPriority(fixtures, count) {
    // Safety check for fixtures data
    if (!fixtures || !Array.isArray(fixtures)) {
      console.error('❌ Fixtures data is not an array:', typeof fixtures, fixtures);
      return [];
    }
    
    if (fixtures.length === 0) {
      console.log('⚠️ No fixtures available for selection');
      return [];
    }

    // Calculate priority scores for each fixture
    const scoredFixtures = fixtures.map(fixture => {
      let priorityScore = 0;
      
      // Parse odds data from JSONB
      let homeOdds = null, drawOdds = null, awayOdds = null;
      if (fixture.odds_data) {
        try {
          const odds = fixture.odds_data;
          homeOdds = odds.home;
          drawOdds = odds.draw;
          awayOdds = odds.away;
        } catch (e) {
          console.warn(`⚠️ Could not parse odds for fixture ${fixture.id}:`, e.message);
        }
      }
      
      // Base score for having odds
      if (homeOdds && drawOdds && awayOdds) {
        priorityScore += 10;
      }
      
      // ENHANCED: League priority scoring with country names
      const leagueName = fixture.league_name || '';
      const countryName = fixture.country || '';
      
      // Create full league name with country
      const fullLeagueName = countryName ? 
        `${countryName} ${leagueName}` : 
        leagueName;
      
      // Check if it's a priority league
      const isPriorityLeague = this.priorityLeagues.some(priority => 
        fullLeagueName.toLowerCase().includes(priority.toLowerCase())
      );
      
      if (isPriorityLeague) {
        priorityScore += 50; // High priority for country-specific leagues
        
        // Extra points for top-tier leagues
        if (fullLeagueName.includes('England Premier League') || 
            fullLeagueName.includes('Spain La Liga') || 
            fullLeagueName.includes('Germany Bundesliga') || 
            fullLeagueName.includes('Italy Serie A')) {
          priorityScore += 30;
        }
        
        // Penalty for Brazilian Serie A to avoid confusion
        if (fullLeagueName.includes('Brazil Serie A')) {
          priorityScore -= 20;
        }
        
        // Extra points for international competitions
        if (fullLeagueName.includes('UEFA Champions League') || 
            fullLeagueName.includes('UEFA Europa League') ||
            fullLeagueName.includes('Copa Libertadores')) {
          priorityScore += 40;
        }
      } else {
        // PENALTY: Non-priority leagues get negative points
        priorityScore -= 20;
        
        // EXTRA PENALTY: Generic league names without country
        if (leagueName === 'Premier League' || 
            leagueName === 'Serie A' || 
            leagueName === 'La Liga' || 
            leagueName === 'Bundesliga') {
          priorityScore -= 30; // Heavy penalty for generic names
          console.log(`⚠️ Generic league name detected: ${leagueName} (${fixture.home_team} vs ${fixture.away_team})`);
        }
      }
      
      // Penalty for friendlies
      if (leagueName.toLowerCase().includes('friendly')) {
        priorityScore -= 50;
      }
      
      // Time preference (prefer matches between 15:00-21:00 UTC)
      const matchHour = new Date(fixture.match_date).getUTCHours();
      if (matchHour >= 15 && matchHour <= 21) {
        priorityScore += 10;
      }
      
      // Odds quality scoring
      if (homeOdds && drawOdds && awayOdds) {
        // Prefer competitive matches
        const maxOdd = Math.max(homeOdds, drawOdds, awayOdds);
        const minOdd = Math.min(homeOdds, drawOdds, awayOdds);
        const oddsBalance = minOdd / maxOdd;
        priorityScore += oddsBalance * 20; // 0-20 points for balance
        
        // Prefer reasonable odds range
        const avgOdd = (homeOdds + drawOdds + awayOdds) / 3;
        if (avgOdd >= 1.2 && avgOdd <= 5.0) {
          priorityScore += 15;
        }
      }
      
      // Add small random factor for variety
      priorityScore += Math.random() * 5;
      
      return {
        ...fixture,
        priorityScore,
        fullLeagueName,
        isPriorityLeague
      };
    });
    
    // Sort by priority score (highest first)
    scoredFixtures.sort((a, b) => b.priorityScore - a.priorityScore);
    
    // Log selection details
    console.log(`📊 League selection analysis for ${scoredFixtures.length} fixtures:`);
    const priorityCount = scoredFixtures.filter(f => f.isPriorityLeague).length;
    const genericCount = scoredFixtures.filter(f => 
      f.league_name === 'Premier League' || 
      f.league_name === 'Serie A' || 
      f.league_name === 'La Liga' || 
      f.league_name === 'Bundesliga'
    ).length;
    
    console.log(`  • Priority leagues: ${priorityCount}/${scoredFixtures.length}`);
    console.log(`  • Generic league names: ${genericCount}/${scoredFixtures.length}`);
    
    // Select top matches
    const selected = scoredFixtures.slice(0, count);
    
    // Log selected matches
    console.log(`\n🎯 Selected ${selected.length} matches:`);
    selected.forEach((match, index) => {
      const status = match.isPriorityLeague ? '✅ PRIORITY' : '⚠️ NON-PRIORITY';
      console.log(`  ${index + 1}. ${match.home_team} vs ${match.away_team}`);
      console.log(`     League: ${match.fullLeagueName} (${status})`);
      console.log(`     Score: ${match.priorityScore.toFixed(1)}`);
    });
    
    return selected;
  }

  /**
   * Save selected matches to database for Oddyssey
   */
  async saveOddysseyMatches(selections, cycleId = null, targetDate = null) {
    try {
      console.log('💾 Saving Oddyssey match selections...');
      
      const { selectedMatches } = selections;
      let date;
      if (targetDate) {
        // If targetDate is already a string (YYYY-MM-DD format), use it directly
        date = targetDate;
      } else {
        // Otherwise, use current date
        date = new Date().toISOString().split('T')[0];
      }
    
      // Save matches for the target date with cycle ID
      if (selectedMatches && selectedMatches.length > 0) {
        await this.saveMatchesForDate(date, selectedMatches, targetDate ? 'target_date' : 'today', cycleId);
      }
      
      console.log(`✅ Oddyssey match selections saved successfully for ${date}`);
      
    } catch (error) {
      console.error('❌ Error saving Oddyssey matches:', error);
      throw error;
    }
  }

  /**
   * Save matches for a specific date
   */
  async saveMatchesForDate(date, matches, type, cycleId = null) {
    try {
      // Always use oracle.daily_game_matches schema (system expects this)
      const schema = 'oracle';
      
      // Table already exists with proper structure, no need to create
      
      // Check if matches already exist for this date (prevent overwriting)
      const existingMatches = await db.query(`
        SELECT COUNT(*) as count 
        FROM ${schema}.daily_game_matches 
        WHERE game_date = $1
      `, [date]);
      
      if (existingMatches.rows[0].count > 0) {
        console.log(`⚠️ Matches already exist for ${date} (${existingMatches.rows[0].count} matches). Skipping to preserve consistency.`);
        return; // Don't overwrite existing matches
      }
      
      // Insert new selections
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        
        await db.query(`
          INSERT INTO ${schema}.daily_game_matches (
            fixture_id, home_team, away_team, league_name, match_date, game_date, 
            home_odds, draw_odds, away_odds, over_25_odds, under_25_odds, selection_type, priority_score,
            cycle_id, display_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
          match.fixture_id || match.fixtureId, // Handle both field names
          match.home_team || match.homeTeam,
          match.away_team || match.awayTeam,
          match.league_name || match.league,
          match.match_date || match.matchDate,
          date,
          match.home_odds || match.odds?.home || null,
          match.draw_odds || match.odds?.draw || null,
          match.away_odds || match.odds?.away || null,
          match.over_25_odds || match.odds?.over25 || null,
          match.under_25_odds || match.odds?.under25 || null,
          'auto',
          match.priority_score || match.qualityScore || 0,
          cycleId || 1, // Use provided cycleId or default to 1
          i + 1 // display_order based on array index
        ]);
      }
      
      console.log(`✅ Saved ${matches.length} matches for ${type} (${date}) in ${schema} schema`);
      
    } catch (error) {
      console.error(`❌ Error saving matches for ${date}:`, error);
      throw error;
    }
  }

  /**
   * Get current Oddyssey matches for display
   */
  async getCurrentOddysseyMatches() {
    try {
      const today = new Date().toISOString().split('T')[0];
      // Always use oracle.daily_game_matches schema (system expects this)
      const schema = 'oracle';
      
      // Get today's matches only
      const todayMatches = await db.query(`
        SELECT 
          dgm.*,
          f.home_team, f.away_team, f.match_date, f.league_name
        FROM ${schema}.daily_game_matches dgm
        JOIN oracle.fixtures f ON dgm.fixture_id = f.id
        WHERE dgm.game_date = $1
        ORDER BY dgm.priority_score DESC
      `, [today]);
      
      return {
        today: {
          date: today,
          matches: todayMatches.rows
        }
      };
      
    } catch (error) {
      console.error('❌ Error getting current Oddyssey matches:', error);
      return { today: { date: '', matches: [] } };
    }
  }

  /**
   * Get fixtures with complete odds for a specific date
   */
  async getFixturesWithOdds(dateStr) {
                    const result = await db.query(`
        WITH fixture_odds_summary AS (
          SELECT 
            f.id as fixture_id,
            f.home_team,
            f.away_team,
            f.league_name,
            f.match_date,
            f.league,
            MAX(CASE WHEN o.market_id = '1' AND o.label = 'Home' THEN o.value END) as home_odds,
            MAX(CASE WHEN o.market_id = '1' AND o.label = 'Draw' THEN o.value END) as draw_odds,
            MAX(CASE WHEN o.market_id = '1' AND o.label = 'Away' THEN o.value END) as away_odds,
            MAX(CASE WHEN o.market_id = '80' AND o.label = 'Over' AND o.total = '2.500000' THEN o.value END) as over_25_odds,
            MAX(CASE WHEN o.market_id = '80' AND o.label = 'Under' AND o.total = '2.500000' THEN o.value END) as under_25_odds
          FROM oracle.fixtures f
          INNER JOIN oracle.fixture_odds o ON f.id::VARCHAR = o.fixture_id
          WHERE DATE(f.match_date) = $1
            AND f.status IN ('NS', 'Fixture')
            AND o.market_id IN ('1', '80')  -- 1X2 and Over/Under 2.5
            AND o.value > 0
          GROUP BY f.id, f.home_team, f.away_team, f.league_name, f.match_date, f.league
        )
        SELECT *
        FROM fixture_odds_summary
        WHERE home_odds IS NOT NULL
          AND draw_odds IS NOT NULL
          AND away_odds IS NOT NULL
          AND over_25_odds IS NOT NULL
          AND under_25_odds IS NOT NULL
          AND home_odds > 0
          AND draw_odds > 0
          AND away_odds > 0
          AND over_25_odds > 0
          AND under_25_odds > 0
          AND EXTRACT(HOUR FROM match_date AT TIME ZONE 'UTC') >= 11
          AND league_name NOT ILIKE '%women%'
          AND league_name NOT ILIKE '%female%'
          AND league_name NOT ILIKE '%ladies%'
          AND home_team NOT ILIKE '%women%'
          AND away_team NOT ILIKE '%women%'
          AND home_team NOT ILIKE '%female%'
          AND away_team NOT ILIKE '%female%'
          AND home_team NOT ILIKE '%ladies%'
          AND away_team NOT ILIKE '%ladies%'
          AND (
            -- Ensure odds are not default/mock values
            home_odds != 1.5 OR draw_odds != 3.0 OR away_odds != 2.5
            OR over_25_odds != 1.8 OR under_25_odds != 2.0
          )
        ORDER BY fixture_id
      `, [dateStr]);

    return result.rows.map(row => ({
      fixtureId: row.fixture_id,
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      league: row.league_name,
      leagueData: row.league,
      matchDate: new Date(row.match_date),
      odds: {
        home: parseFloat(row.home_odds),
        draw: parseFloat(row.draw_odds),
        away: parseFloat(row.away_odds),
        over25: parseFloat(row.over_25_odds),
        under25: parseFloat(row.under_25_odds)
      }
    }));
  }

  /**
   * Get fixtures with basic odds (less strict requirements) to ensure we have 10 matches
   */
  async getFixturesWithBasicOdds(dateStr, limit) {
    const result = await db.query(`
      WITH fixture_odds_summary AS (
        SELECT 
          f.id as fixture_id,
          f.home_team,
          f.away_team,
          f.league_name,
          f.match_date,
          MAX(CASE WHEN o.market_id = '1' AND o.label = 'Home' THEN o.value END) as home_odds,
          MAX(CASE WHEN o.market_id = '1' AND o.label = 'Draw' THEN o.value END) as draw_odds,
          MAX(CASE WHEN o.market_id = '1' AND o.label = 'Away' THEN o.value END) as away_odds,
          MAX(CASE WHEN o.market_id = '80' AND o.label = 'Over' AND o.total = '2.500000' THEN o.value END) as over_25_odds,
          MAX(CASE WHEN o.market_id = '80' AND o.label = 'Under' AND o.total = '2.500000' THEN o.value END) as under_25_odds
        FROM oracle.fixtures f
        INNER JOIN oracle.fixture_odds o ON f.id::VARCHAR = o.fixture_id
        WHERE DATE(f.match_date) = $1
          AND f.status IN ('NS', 'Fixture')
          AND o.market_id IN ('1', '80')  -- 1X2 and Over/Under 2.5
          AND o.value > 0
        GROUP BY f.id, f.home_team, f.away_team, f.league_name, f.match_date
      )
      SELECT *
      FROM fixture_odds_summary
      WHERE home_odds IS NOT NULL
        AND draw_odds IS NOT NULL
        AND away_odds IS NOT NULL
        AND home_odds > 0
        AND draw_odds > 0
        AND away_odds > 0
        AND EXTRACT(HOUR FROM match_date AT TIME ZONE 'UTC') >= 11
        AND league_name NOT ILIKE '%women%'
        AND league_name NOT ILIKE '%female%'
        AND league_name NOT ILIKE '%ladies%'
        AND home_team NOT ILIKE '%women%'
        AND away_team NOT ILIKE '%women%'
        AND home_team NOT ILIKE '%female%'
        AND away_team NOT ILIKE '%female%'
        AND home_team NOT ILIKE '%ladies%'
        AND away_team NOT ILIKE '%ladies%'
        AND (
          -- Less strict odds validation - just ensure they're not exactly default values
          home_odds != 1.5 OR draw_odds != 3.0 OR away_odds != 2.5
        )
        AND fixture_id NOT IN (
          -- Exclude fixtures already selected with complete odds
          SELECT fixture_id FROM (
            SELECT f.id as fixture_id
            FROM oracle.fixtures f
            INNER JOIN oracle.fixture_odds o ON f.id::VARCHAR = o.fixture_id
            WHERE DATE(f.match_date) = $1
              AND f.status IN ('NS', 'Fixture')
              AND o.market_id IN ('1', '80')
              AND o.value > 0
            GROUP BY f.id
            HAVING COUNT(CASE WHEN o.market_id = '1' AND o.label IN ('Home', 'Draw', 'Away') THEN 1 END) = 3
              AND COUNT(CASE WHEN o.market_id = '80' AND o.label IN ('Over', 'Under') THEN 1 END) = 2
          ) complete_odds
        )
      ORDER BY fixture_id
      LIMIT $2
    `, [dateStr, limit]);

    return result.rows.map(row => ({
      fixtureId: row.fixture_id,
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      league: row.league_name,
      matchDate: new Date(row.match_date),
      odds: {
        home: parseFloat(row.home_odds),
        draw: parseFloat(row.draw_odds),
        away: parseFloat(row.away_odds),
        over25: parseFloat(row.over_25_odds) || 1.8, // Default if missing
        under25: parseFloat(row.under_25_odds) || 2.0 // Default if missing
      }
    }));
  }

  /**
   * Categorize matches by betting difficulty based on odds spread
   */
  categorizeMatchesByDifficulty(fixtures) {
    const categorized = {
      easy: [],    // Clear favorites (big odds differences)
      medium: [],  // Moderate odds differences  
      hard: []     // Close odds, hard to predict
    };

    fixtures.forEach(fixture => {
      const { odds } = fixture;
      
      // Calculate odds variance for 1X2 market
      const moneylineOdds = [odds.home, odds.draw, odds.away];
      const minOdd = Math.min(...moneylineOdds);
      const maxOdd = Math.max(...moneylineOdds);
      const oddSpread = maxOdd - minOdd;
      
      // Calculate over/under variance
      const ouSpread = Math.abs(odds.over25 - odds.under25);
      
      // Average variance determines difficulty
      const avgSpread = (oddSpread + ouSpread) / 2;
      
      // Classification thresholds
      let difficulty;
      if (avgSpread >= 1.5) {
        difficulty = 'easy';   // Big favorites or clear outcomes
      } else if (avgSpread >= 0.8) {
        difficulty = 'medium'; // Moderate differences
      } else {
        difficulty = 'hard';   // Very close odds
      }

      // Additional quality filters
      const qualityScore = this.calculateMatchQuality(fixture);
      
      categorized[difficulty].push({
        ...fixture,
        difficulty,
        oddSpread: avgSpread,
        qualityScore
      });
    });

    // Sort each category by quality score (highest first)
    Object.keys(categorized).forEach(key => {
      categorized[key].sort((a, b) => b.qualityScore - a.qualityScore);
    });

    return categorized;
  }

  /**
   * Calculate match quality score for selection preference
   */
  calculateMatchQuality(fixture) {
    let score = 0;

    // League quality boost
    const topLeagues = ['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'Champions League'];
    if (topLeagues.some(league => fixture.league.includes(league))) {
      score += 30;
    }

    // Odds reasonableness (not too extreme)
    const allOdds = [fixture.odds.home, fixture.odds.draw, fixture.odds.away, fixture.odds.over25, fixture.odds.under25];
    const hasReasonableOdds = allOdds.every(odd => odd >= 1.05 && odd <= 20.0);
    if (hasReasonableOdds) {
      score += 20;
    }

    // Timing preference (afternoon/evening matches)
    const hour = fixture.matchDate.getUTCHours();
    if (hour >= 12 && hour <= 22) {
      score += 15;
    }

    // Over/Under variety (prefer matches with decent OU odds)
    const ouBalance = Math.abs(fixture.odds.over25 - fixture.odds.under25);
    if (ouBalance >= 0.1 && ouBalance <= 0.5) {
      score += 10;
    }

    return score;
  }

  /**
   * Select matches based on league priority and quality (flexible approach)
   * Uses priorities as guidelines, falls back to available matches if needed
   */
  selectMatchesByLeaguePriority(fixtures) {
    console.log('🏆 Selecting matches by league priority (flexible approach)...');
    
    // Calculate priority scores for each fixture using the new league priority system
    const scoredFixtures = fixtures.map(fixture => {
      let priorityScore = 0;
      
      // Get league priority using the new system
      const leaguePriority = this.getLeaguePriority(fixture.league, fixture.homeTeam, fixture.awayTeam);
      priorityScore += leaguePriority;
      
      console.log(`🏆 ${fixture.homeTeam} vs ${fixture.awayTeam} - ${fixture.league} - Priority: ${leaguePriority}`);
      
      // Additional quality factors
      const { odds } = fixture;
      
      // Prefer matches with balanced odds
      if (odds.home && odds.draw && odds.away) {
        const moneylineOdds = [odds.home, odds.draw, odds.away];
        const minOdd = Math.min(...moneylineOdds);
        const maxOdd = Math.max(...moneylineOdds);
        const balance = minOdd / maxOdd;
        priorityScore += balance * 20; // 0-20 points for balance
      }
      
      // Prefer reasonable odds ranges
      const allOdds = [odds.home, odds.draw, odds.away, odds.over25, odds.under25];
      const hasReasonableOdds = allOdds.every(odd => odd >= 1.05 && odd <= 15.0);
      if (hasReasonableOdds) {
        priorityScore += 15;
      }
      
      // Time preference (prefer matches between 15:00-21:00 UTC)
      const matchHour = fixture.matchDate.getUTCHours();
      if (matchHour >= 15 && matchHour <= 21) {
        priorityScore += 10;
      }
      
      // Small random factor for variety
      priorityScore += Math.random() * 5;
      
      return {
        ...fixture,
        priorityScore,
        leaguePriority,
        isHighPriorityLeague: leaguePriority >= 80
      };
    });
    
    // Sort by priority score (highest first)
    scoredFixtures.sort((a, b) => b.priorityScore - a.priorityScore);
    
    // Log selection summary
    const highPriorityLeagues = scoredFixtures.filter(f => f.isHighPriorityLeague).length;
    console.log(`📊 League priority selection analysis:`);
    console.log(`  • High priority leagues (score >= 80): ${highPriorityLeagues}/${scoredFixtures.length}`);
    
    // Group by league for better distribution
    const leagueGroups = {};
    scoredFixtures.forEach(fixture => {
      if (!leagueGroups[fixture.league]) {
        leagueGroups[fixture.league] = [];
      }
      leagueGroups[fixture.league].push(fixture);
    });
    
    console.log(`  • Leagues represented: ${Object.keys(leagueGroups).length}`);
    Object.keys(leagueGroups).forEach(league => {
      console.log(`    - ${league}: ${leagueGroups[league].length} matches`);
    });
    
    // Select top 10 matches with some league diversity
    const selected = [];
    const usedLeagues = {};
    
    // First pass: select best matches from each high priority league (max 2 per league)
    for (const fixture of scoredFixtures) {
      if (selected.length >= 10) break;
      
      const leagueCount = usedLeagues[fixture.league] || 0;
      if (fixture.isHighPriorityLeague && leagueCount < 2) {
        selected.push(fixture);
        usedLeagues[fixture.league] = leagueCount + 1;
      }
    }
    
    // Second pass: fill remaining slots with best available matches (flexible approach)
    for (const fixture of scoredFixtures) {
      if (selected.length >= 10) break;
      
      if (!selected.find(s => s.fixtureId === fixture.fixtureId)) {
        selected.push(fixture);
      }
    }
    
    // Log final selection
    console.log(`\n🎯 Selected ${selected.length} matches by league priority:`);
    selected.forEach((match, index) => {
      const status = match.isHighPriorityLeague ? '✅ HIGH PRIORITY' : '⚠️ LOWER PRIORITY';
      console.log(`  ${index + 1}. ${match.homeTeam} vs ${match.awayTeam}`);
      console.log(`     League: ${match.league} (Priority: ${match.leaguePriority}) - ${status}`);
      console.log(`     Score: ${match.priorityScore.toFixed(1)}`);
    });
    
    return selected.slice(0, 10);
  }

  /**
   * Select matches according to Oddyssey strategy (LEGACY - kept for fallback)
   */
  selectMatchesByStrategy(categorized) {
    const selected = [];
    
    // Select 2 easy matches
    const easyPicks = categorized.easy.slice(0, 2);
    selected.push(...easyPicks);

    // Select 2 medium matches
    const mediumPicks = categorized.medium.slice(0, 2);
    selected.push(...mediumPicks);

    // Select 6 hard matches
    const hardPicks = categorized.hard.slice(0, 6);
    selected.push(...hardPicks);

    // If we don't have enough in categories, fill from best available
    const needed = 10 - selected.length;
    if (needed > 0) {
      console.warn(`⚠️ Need ${needed} more matches, filling from best available`);
      
      const allRemaining = [
        ...categorized.easy.slice(2),
        ...categorized.medium.slice(2),
        ...categorized.hard.slice(6)
      ].sort((a, b) => b.qualityScore - a.qualityScore);

      selected.push(...allRemaining.slice(0, needed));
    }

    // CRITICAL: Ensure we always return exactly 10 matches
    if (selected.length < 10) {
      console.error(`❌ CRITICAL ERROR: Only ${selected.length} matches selected, need exactly 10!`);
      throw new Error(`Failed to select exactly 10 matches: only ${selected.length} available`);
    }

    // Sort by match time for better user experience
    return selected.slice(0, 10).sort((a, b) => a.matchDate - b.matchDate);
  }

  /**
   * Format matches for Oddyssey contract
   */
  formatForOddyssey(matches) {
    // Ensure no duplicates
    const uniqueMatches = [];
    const seenIds = new Set();
    
    for (const match of matches) {
      if (!seenIds.has(match.fixtureId)) {
        seenIds.add(match.fixtureId);
        uniqueMatches.push(match);
      } else {
        console.warn(`⚠️ Duplicate fixture ID ${match.fixtureId} removed from selection`);
      }
    }
    
    if (uniqueMatches.length !== matches.length) {
      console.warn(`⚠️ Removed ${matches.length - uniqueMatches.length} duplicate matches`);
    }
    
    // Format as tuples for contract: (uint64,uint64,uint32,uint32,uint32,uint32,uint32,(uint8,uint8))
    return uniqueMatches.map((match, index) => [
      BigInt(match.fixtureId),                    // uint64: fixture ID
      BigInt(Math.floor(match.matchDate.getTime() / 1000)), // uint64: start time
      Math.floor(match.odds.home * 1000),         // uint32: home odds (scaled by 1000)
      Math.floor(match.odds.draw * 1000),         // uint32: draw odds (scaled by 1000)
      Math.floor(match.odds.away * 1000),         // uint32: away odds (scaled by 1000)
      Math.floor(match.odds.over25 * 1000),       // uint32: over 2.5 odds (scaled by 1000)
      Math.floor(match.odds.under25 * 1000),      // uint32: under 2.5 odds (scaled by 1000)
      [0, 0]                                      // (uint8,uint8): result (NotSet, NotSet)
    ]);
  }

  /**
   * Get matches for upcoming days (for preview/planning)
   */
  async getUpcomingDaysMatches(days = 3) {
    const results = [];
    
    for (let i = 1; i <= days; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      
      try {
        const dateStr = date.toISOString().split('T')[0];
        const dayMatches = await this.selectDailyMatches(dateStr);
        results.push({
          date: dateStr,
          matches: dayMatches.selectedMatches,
          summary: dayMatches.summary
        });
      } catch (error) {
        console.warn(`⚠️ Could not select matches for ${date.toISOString().split('T')[0]}:`, error.message);
        results.push({
          date: date.toISOString().split('T')[0],
          matches: [],
          summary: { totalFixtures: 0, easy: 0, medium: 0, hard: 0 },
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Validate selected matches meet Oddyssey requirements
   */
  validateMatchSelection(matches) {
    const errors = [];

    if (matches.length !== 10) {
      errors.push(`Must have exactly 10 matches, got ${matches.length}`);
    }

    // Validate each match has required odds
    matches.forEach((match, index) => {
      const { odds } = match;
      
      // Check 1X2 odds
      if (!odds.home || odds.home <= 0) {
        errors.push(`Match ${index + 1} (${match.fixtureId}): Invalid home odds: ${odds.home}`);
      }
      if (!odds.draw || odds.draw <= 0) {
        errors.push(`Match ${index + 1} (${match.fixtureId}): Invalid draw odds: ${odds.draw}`);
      }
      if (!odds.away || odds.away <= 0) {
        errors.push(`Match ${index + 1} (${match.fixtureId}): Invalid away odds: ${odds.away}`);
      }
      
      // Check Over/Under 2.5 odds
      if (!odds.over25 || odds.over25 <= 0) {
        errors.push(`Match ${index + 1} (${match.fixtureId}): Invalid over 2.5 odds: ${odds.over25}`);
      }
      if (!odds.under25 || odds.under25 <= 0) {
        errors.push(`Match ${index + 1} (${match.fixtureId}): Invalid under 2.5 odds: ${odds.under25}`);
      }
      
      // Check for reasonable odds ranges
      if (odds.home > 50 || odds.draw > 50 || odds.away > 50) {
        errors.push(`Match ${index + 1} (${match.fixtureId}): Unreasonable odds detected (${odds.home}/${odds.draw}/${odds.away})`);
      }
      if (odds.over25 > 10 || odds.under25 > 10) {
        errors.push(`Match ${index + 1} (${match.fixtureId}): Unreasonable O/U odds detected (${odds.over25}/${odds.under25})`);
      }
    });

    if (errors.length > 0) {
      console.error('❌ Match validation errors:', errors);
      throw new Error(`Match validation failed: ${errors.join(', ')}`);
    }

    console.log('✅ All 10 matches validated successfully');
    return true;
  }

  /**
   * Test function to verify database has correct odds data
   */
  async testDatabaseOdds(dateStr) {
    try {
      console.log(`🧪 Testing database odds for date: ${dateStr}`);
      
      // Test 1: Check total fixtures
      const totalFixtures = await db.query(`
        SELECT COUNT(*) as count 
        FROM oracle.fixtures 
        WHERE DATE(match_date) = $1 AND status IN ('NS', 'Fixture')
      `, [dateStr]);
      
      console.log(`📊 Total fixtures for ${dateStr}: ${totalFixtures.rows[0].count}`);
      
      // Test 2: Check 1X2 odds
      const odds1x2 = await db.query(`
        SELECT COUNT(*) as count 
        FROM oracle.fixture_odds 
        WHERE fixture_id IN (
          SELECT id FROM oracle.fixtures 
          WHERE DATE(match_date) = $1 AND status IN ('NS', 'Fixture')
        ) AND market_id = '1'
      `, [dateStr]);
      
      console.log(`📊 1X2 odds records: ${odds1x2.rows[0].count}`);
      
      // Test 3: Check Over/Under 2.5 odds
      const oddsOU25 = await db.query(`
        SELECT COUNT(*) as count 
        FROM oracle.fixture_odds 
        WHERE fixture_id IN (
          SELECT id FROM oracle.fixtures 
          WHERE DATE(match_date) = $1 AND status IN ('NS', 'Fixture')
        ) AND market_id = '80' AND total = '2.500000'
      `, [dateStr]);
      
      console.log(`📊 Over/Under 2.5 odds records: ${oddsOU25.rows[0].count}`);
      
      // Test 4: Check fixtures with complete odds
      const completeOdds = await db.query(`
        WITH fixture_odds_summary AS (
          SELECT 
            f.id as fixture_id,
            MAX(CASE WHEN o.market_id = '1' AND o.label = 'Home' THEN o.value END) as home_odds,
            MAX(CASE WHEN o.market_id = '1' AND o.label = 'Draw' THEN o.value END) as draw_odds,
            MAX(CASE WHEN o.market_id = '1' AND o.label = 'Away' THEN o.value END) as away_odds,
            MAX(CASE WHEN o.market_id = '80' AND o.label = 'Over' AND o.total = '2.500000' THEN o.value END) as over_25_odds,
            MAX(CASE WHEN o.market_id = '80' AND o.label = 'Under' AND o.total = '2.500000' THEN o.value END) as under_25_odds
          FROM oracle.fixtures f
          INNER JOIN oracle.fixture_odds o ON f.id::VARCHAR = o.fixture_id
          WHERE DATE(f.match_date) = $1
            AND f.status IN ('NS', 'Fixture')
            AND o.market_id IN ('1', '80')
            AND o.value > 0
          GROUP BY f.id
        )
        SELECT COUNT(*) as count
        FROM fixture_odds_summary
        WHERE home_odds IS NOT NULL
          AND draw_odds IS NOT NULL
          AND away_odds IS NOT NULL
          AND over_25_odds IS NOT NULL
          AND under_25_odds IS NOT NULL
      `, [dateStr]);
      
      console.log(`📊 Fixtures with complete odds: ${completeOdds.rows[0].count}`);
      
      return {
        totalFixtures: parseInt(totalFixtures.rows[0].count),
        odds1x2: parseInt(odds1x2.rows[0].count),
        oddsOU25: parseInt(oddsOU25.rows[0].count),
        completeOdds: parseInt(completeOdds.rows[0].count)
      };
      
    } catch (error) {
      console.error('❌ Error testing database odds:', error);
      throw error;
    }
  }

  /**
   * Get results by date for date picker functionality
   */
  async getResultsByDate(dateStr) {
    try {
      console.log(`🎯 Getting Oddyssey results for date: ${dateStr}`);
      
      // First, find the cycle for this date
      const cycleResult = await db.query(`
        SELECT cycle_id, matches_data, is_resolved, cycle_start_time
        FROM oracle.oddyssey_cycles 
        WHERE DATE(cycle_start_time) = $1
        ORDER BY cycle_id DESC
        LIMIT 1
      `, [dateStr]);
      
      if (cycleResult.rows.length === 0) {
        return {
          success: true,
          data: {
            date: dateStr,
            cycleId: null,
            isResolved: false,
            matches: [],
            totalMatches: 0,
            finishedMatches: 0
          },
          message: 'No cycle found for this date'
        };
      }
      
      const cycle = cycleResult.rows[0];
      let fixtureIds = [];
      
      try {
        if (Array.isArray(cycle.matches_data)) {
          fixtureIds = cycle.matches_data.map(match => match.id ? match.id.toString() : null).filter(id => id);
        } else if (typeof cycle.matches_data === 'string') {
          const parsed = JSON.parse(cycle.matches_data);
          fixtureIds = Array.isArray(parsed) ? parsed.map(match => match.id ? match.id.toString() : null).filter(id => id) : [];
        }
      } catch (error) {
        console.error('❌ Error parsing matches_data:', error);
        fixtureIds = [];
      }
      
      if (fixtureIds.length === 0) {
        return {
          success: true,
          data: {
            date: dateStr,
            cycleId: cycle.cycle_id,
            isResolved: cycle.is_resolved,
            matches: [],
            totalMatches: 0,
            finishedMatches: 0
          },
          message: 'No matches found for this date'
        };
      }
      
      // Get match results with fixture details for the specific date
      const resultsQuery = `
        SELECT 
          f.id as fixture_id,
          f.home_team,
          f.away_team,
          f.league_name,
          f.match_date,
          f.status,
          fr.home_score as home_score,
          fr.away_score as away_score,
          COALESCE(fr.outcome_1x2, 
            CASE 
              WHEN fr.home_score IS NOT NULL AND fr.away_score IS NOT NULL THEN
                CASE 
                  WHEN fr.home_score > fr.away_score THEN '1'
                  WHEN fr.home_score = fr.away_score THEN 'X'
                  WHEN fr.home_score < fr.away_score THEN '2'
                  ELSE NULL
                END
              ELSE NULL
            END
          ) as outcome_1x2,
          COALESCE(fr.outcome_ou25,
            CASE 
              WHEN fr.home_score IS NOT NULL AND fr.away_score IS NOT NULL THEN
                CASE 
                  WHEN (fr.home_score + fr.away_score) > 2.5 THEN 'over'
                  WHEN (fr.home_score + fr.away_score) < 2.5 THEN 'under'
                  ELSE NULL
                END
              ELSE NULL
            END
          ) as outcome_ou25,
          COALESCE(fr.finished_at, f.updated_at) as finished_at,
          CASE 
            WHEN f.status IN ('FT', 'AET', 'PEN') THEN 'finished'
            WHEN f.status IN ('1H', '2H', 'HT') THEN 'live'
            WHEN f.status IN ('NS', 'Fixture') AND f.match_date > NOW() THEN 'upcoming'
            WHEN f.status IN ('NS', 'Fixture') AND f.match_date <= NOW() THEN 'delayed'
            ELSE 'unknown'
          END as match_status
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.id = ANY($1)
        ORDER BY f.match_date ASC
      `;
      
      const resultsResult = await db.query(resultsQuery, [fixtureIds]);
      
      const matches = resultsResult.rows.map((row, index) => ({
        id: row.fixture_id,
        fixture_id: row.fixture_id,
        home_team: row.home_team,
        away_team: row.away_team,
        league_name: row.league_name,
        match_date: row.match_date,
        status: row.match_status,
        display_order: index + 1,
        result: {
          home_score: row.home_score,
          away_score: row.away_score,
          outcome_1x2: row.outcome_1x2,
          outcome_ou25: row.outcome_ou25,
          finished_at: row.finished_at,
          is_finished: row.match_status === 'finished'
        }
      }));
      
      return {
        success: true,
        data: {
          date: dateStr,
          cycleId: cycle.cycle_id,
          isResolved: cycle.is_resolved,
          cycleStartTime: cycle.cycle_start_time,
          matches: matches,
          totalMatches: matches.length,
          finishedMatches: matches.filter(m => m.result.is_finished).length
        }
      };
      
    } catch (error) {
      console.error('❌ Error getting results by date:', error);
      return {
        success: false,
        error: 'Failed to get results by date',
        details: error.message
      };
    }
  }

  /**
   * Get available dates for date picker (last 30 days with cycles)
   */
  async getAvailableDates() {
    try {
      console.log('🎯 Getting available dates for date picker...');
      
      // Get dates from the last 30 days that have cycles
      const datesResult = await db.query(`
        SELECT 
          DATE(cycle_start_time) as date,
          cycle_id,
          is_resolved,
          COUNT(*) as cycle_count
        FROM oracle.oddyssey_cycles 
        WHERE cycle_start_time >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(cycle_start_time), cycle_id, is_resolved
        ORDER BY date DESC
      `);
      
      const availableDates = datesResult.rows.map(row => ({
        date: row.date,
        cycleId: row.cycle_id,
        isResolved: row.is_resolved,
        cycleCount: parseInt(row.cycle_count)
      }));
      
      return {
        success: true,
        data: {
          availableDates,
          totalDates: availableDates.length,
          dateRange: {
            oldest: availableDates.length > 0 ? availableDates[availableDates.length - 1].date : null,
            newest: availableDates.length > 0 ? availableDates[0].date : null
          }
        }
      };
      
    } catch (error) {
      console.error('❌ Error getting available dates:', error);
      return {
        success: false,
        error: 'Failed to get available dates',
        details: error.message
      };
    }
  }
}

module.exports = OddysseyMatchSelector; 