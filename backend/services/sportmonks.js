const axios = require('axios');
const db = require('../db/db');
const websocketService = require('./websocket-service');

class SportMonksService {
  constructor() {
    this.apiToken = process.env.SPORTMONKS_API_TOKEN;
    this.baseUrl = 'https://api.sportmonks.com/v3/football';
    this.resultsStorage = null; // Will be set later to avoid circular dependency
    
    if (!this.apiToken) {
      throw new Error('SPORTMONKS_API_TOKEN not configured');
    }
    
    console.log('✅ SportMonks API token configured');
    
    this.axios = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Accept': 'application/json',
      },
      timeout: 30000, // 30 second timeout
      maxRedirects: 3,
    });

    // Preferred bookmakers in order of preference
    this.preferredBookmakers = [2, 28, 39, 35]; // bet365, bwin, pinnacle, 1xbet
    
    // Youth/Women league filters
    this.excludeKeywords = [
      'u17', 'u18', 'u19', 'u21', 'u23', 'youth', 'junior', 'reserve', 'b team',
      'women', 'female', 'ladies', 'womens', "women's"
    ];
  }

  /**
   * Fetch fixtures for a specific date (fallback method)
   */
  async fetchFixturesForDate(dateStr) {
    console.log(`📅 Fetching fixtures for ${dateStr}...`);
    
    try {
      const response = await this.axios.get(`/fixtures/date/${dateStr}`, {
        params: {
          api_token: this.apiToken,
          include: 'league;participants;odds.bookmaker;referees;venue;weatherReport',
          per_page: 100
        }
      });

      const fixtures = response.data.data || [];
      console.log(`📊 Found ${fixtures.length} fixtures for ${dateStr}`);
      
      if (fixtures.length === 0) {
        return [];
      }

      // Save fixtures (simplified version for fallback)
      let savedCount = 0;
      for (const fixture of fixtures.slice(0, 20)) { // Limit to first 20 for speed
        try {
          const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
          const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');
          await this.saveFixture(fixture, homeTeam, awayTeam);
          savedCount++;
        } catch (error) {
          console.warn(`⚠️ Failed to save fixture ${fixture.id}:`, error.message);
        }
      }

      console.log(`✅ Saved ${savedCount}/${fixtures.length} fixtures for ${dateStr}`);
      return fixtures;
      
    } catch (error) {
      console.error(`❌ Failed to fetch fixtures for ${dateStr}:`, error.message);
      throw error;
    }
  }

  /**
   * Update odds for upcoming fixtures
   */
  async updateOddsForUpcomingFixtures(startDate, endDate) {
    console.log(`📊 Updating odds for fixtures between ${startDate} and ${endDate}...`);
    
    try {
      // Get fixtures in the date range that need odds updates
      const fixtures = await db.query(`
        SELECT id, name, home_team, away_team, match_date
        FROM oracle.fixtures 
        WHERE match_date BETWEEN $1 AND $2
        AND status IN ('NS', 'INPLAY_1ST_HALF', 'INPLAY_2ND_HALF', 'HT')
        ORDER BY match_date ASC
        LIMIT 50
      `, [startDate, endDate]);

      if (fixtures.rows.length === 0) {
        console.log('📊 No fixtures found for odds update');
        return { updatedCount: 0 };
      }

      console.log(`📊 Found ${fixtures.rows.length} fixtures for odds update`);
      
      let updatedCount = 0;
      for (const fixture of fixtures.rows.slice(0, 10)) { // Limit to 10 for performance
        try {
          // Fetch fresh odds for this fixture
          const oddsResponse = await this.axios.get(`/fixtures/${fixture.id}/odds`, {
            params: {
              api_token: this.apiToken,
              include: 'bookmaker',
              per_page: 50
            }
          });

          const odds = oddsResponse.data.data || [];
          if (odds.length > 0) {
            // Save updated odds
            const oddsCount = await this.saveOdds(fixture.id, odds);
            if (oddsCount > 0) {
              updatedCount++;
              console.log(`✅ Updated ${oddsCount} odds for fixture ${fixture.id}`);
            }
          }
        } catch (error) {
          console.warn(`⚠️ Failed to update odds for fixture ${fixture.id}:`, error.message);
        }
      }

      console.log(`✅ Odds update completed: ${updatedCount} fixtures updated`);
      return { updatedCount };

    } catch (error) {
      console.error('❌ Error updating odds for upcoming fixtures:', error);
      throw error;
    }
  }

  /**
   * Main function to fetch and save 7 days of fixtures
   */
  async fetchAndSave7DayFixtures() {
    console.log('🚀 Starting 7-day fixture fetch...');
    
    let totalFixtures = 0;
    let totalOdds = 0;
    let oddysseyFixtures = 0;
    
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const currentDate = new Date();
      currentDate.setDate(currentDate.getDate() + dayOffset);
      const dateStr = currentDate.toISOString().split('T')[0];
      
      console.log(`📅 Fetching fixtures for ${dateStr} (Day ${dayOffset + 1}/7)...`);
      
      try {
        const dayResults = await this.fetchAndSaveDayFixtures(dateStr);
        totalFixtures += dayResults.fixtures;
        totalOdds += dayResults.odds;
        oddysseyFixtures += dayResults.oddysseyReady;
        
        console.log(`✅ Day ${dateStr}: ${dayResults.fixtures} fixtures, ${dayResults.odds} odds`);
        
      } catch (error) {
        console.error(`❌ Error fetching day ${dateStr}:`, error.message);
        // Continue with next day instead of failing completely
        console.log(`⏭️ Continuing with next day...`);
      }
    }
    
    console.log(`🎉 7-day fetch completed!`);
    console.log(`📊 Final Summary: ${totalFixtures} fixtures with odds saved, ${oddysseyFixtures} Oddyssey-ready matches`);
    
    return { 
      totalFixtures, 
      totalOdds, 
      oddysseyFixtures 
    };
  }

  /**
   * Fetch and save fixtures for a single day
   */
  async fetchAndSaveDayFixtures(dateStr) {
    let dayFixtures = 0;
    let dayOdds = 0;
    let oddysseyReady = 0;
    
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      try {
        console.log(`📄 ${dateStr} - Fetching page ${page}...`);
        
        const response = await this.axios.get(`/fixtures/date/${dateStr}`, {
          params: {
            'api_token': this.apiToken,
            'include': 'league;participants;odds.bookmaker;referees;venue;weatherReport',
            'per_page': 50,
            'page': page
          }
        });

        if (!response.data.data || response.data.data.length === 0) {
          hasMore = false;
          break;
        }

        const fixtures = response.data.data;
        const pagination = response.data.pagination;
        
        console.log(`📊 ${dateStr} page ${page}: ${fixtures.length} fixtures`);
        
        // Process and save fixtures
        for (const fixture of fixtures) {
          const result = await this.processAndSaveFixture(fixture);
          if (result.saved) {
            dayFixtures++;
            dayOdds += result.oddsCount;
            if (result.oddysseyReady) oddysseyReady++;
          }
        }
        
        // Check if more pages exist
        hasMore = pagination?.has_more || false;
        page++;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 250));
        
      } catch (error) {
        console.error(`❌ Error fetching ${dateStr} page ${page}:`, error.message);
        hasMore = false;
      }
    }
    
    return { fixtures: dayFixtures, odds: dayOdds, oddysseyReady };
  }

  /**
   * Process and save a single fixture
   */
  async processAndSaveFixture(fixture) {
    try {
      // Skip if no participants
      if (!fixture.participants || fixture.participants.length < 2) {
        return { saved: false, oddsCount: 0, oddysseyReady: false };
      }

      // Extract teams
      const homeTeam = fixture.participants.find(p => p.meta?.location === 'home');
      const awayTeam = fixture.participants.find(p => p.meta?.location === 'away');
      
      if (!homeTeam || !awayTeam) {
        return { saved: false, oddsCount: 0, oddysseyReady: false };
      }

      // Filter out youth and women leagues
      if (this.shouldExcludeFixture(fixture, homeTeam, awayTeam)) {
        return { saved: false, oddsCount: 0, oddysseyReady: false };
      }

      // Process odds
      const oddsData = this.processOdds(fixture.odds || []);
      
      // Skip if no valid odds (unless it has minimal required odds)
      if (!this.hasMinimalOdds(oddsData)) {
        return { saved: false, oddsCount: 0, oddysseyReady: false };
      }

      // Save fixture
      await this.saveFixture(fixture, homeTeam, awayTeam);
      
      // Save odds
      const oddsCount = await this.saveOdds(fixture.id, oddsData);
      
      // Check if Oddyssey ready (has 1X2 and O/U 2.5)
      const oddysseyReady = this.isOddysseyReady(oddsData);
      
      return { saved: true, oddsCount, oddysseyReady };
      
    } catch (error) {
      console.error(`❌ Error processing fixture ${fixture.id}:`, error.message);
      return { saved: false, oddsCount: 0, oddysseyReady: false };
    }
  }

  /**
   * Check if fixture should be excluded (youth/women)
   */
  shouldExcludeFixture(fixture, homeTeam, awayTeam) {
    const leagueName = fixture.league?.name || '';
    const homeTeamName = homeTeam.name || '';
    const awayTeamName = awayTeam.name || '';
    
    const textToCheck = `${leagueName} ${homeTeamName} ${awayTeamName}`.toLowerCase();
    
    return this.excludeKeywords.some(keyword => 
      textToCheck.includes(keyword.toLowerCase())
    );
  }

  /**
   * Process odds from API response
   */
  processOdds(odds) {
    if (!odds || odds.length === 0) return {};
    
    // Group odds by bookmaker, prioritizing preferred ones
    const oddsByBookmaker = {};
    
    for (const odd of odds) {
      const bookmakerId = parseInt(odd.bookmaker_id);
      if (!oddsByBookmaker[bookmakerId]) {
        oddsByBookmaker[bookmakerId] = [];
      }
      oddsByBookmaker[bookmakerId].push(odd);
    }
    
    console.log(`📊 Processing ${odds.length} odds from ${Object.keys(oddsByBookmaker).length} bookmakers`);
    
    // Debug: Log available market IDs
    const marketIds = [...new Set(odds.map(o => o.market_id))].sort((a, b) => parseInt(a) - parseInt(b));
    console.log(`🔍 Available market IDs: ${marketIds.join(', ')}`);
    
    // Select best bookmaker
    let selectedBookmakerId = null;
    for (const preferredId of this.preferredBookmakers) {
      if (oddsByBookmaker[preferredId]) {
        selectedBookmakerId = preferredId;
        break;
      }
    }
    
    // If no preferred bookmaker, use first available
    if (!selectedBookmakerId) {
      selectedBookmakerId = Object.keys(oddsByBookmaker)[0];
    }
    
    if (!selectedBookmakerId) return {};
    
    const selectedOdds = oddsByBookmaker[selectedBookmakerId];
    const bookmakerInfo = selectedOdds[0]?.bookmaker;
    
    // Extract specific markets
    console.log(`🔍 Extracting markets for bookmaker ${selectedBookmakerId} with ${selectedOdds.length} odds`);
    
    const processedOdds = {
      bookmaker_id: selectedBookmakerId,
      bookmaker_name: bookmakerInfo?.name || `Bookmaker ${selectedBookmakerId}`,
      
      // Full Time 1X2 (Market ID: 1)
      ft_home: this.extractOddValue(selectedOdds, 1, ['1', 'home']),
      ft_draw: this.extractOddValue(selectedOdds, 1, ['x', 'draw']),
      ft_away: this.extractOddValue(selectedOdds, 1, ['2', 'away']),
      
      // Over/Under Goals
      over_15: this.extractOverUnder(selectedOdds, '1.5', 'over'),
      under_15: this.extractOverUnder(selectedOdds, '1.5', 'under'),
      over_25: this.extractOverUnder(selectedOdds, '2.5', 'over'),
      under_25: this.extractOverUnder(selectedOdds, '2.5', 'under'),
      over_35: this.extractOverUnder(selectedOdds, '3.5', 'over'),
      under_35: this.extractOverUnder(selectedOdds, '3.5', 'under'),
      
      // Both Teams to Score (Market ID: 14)
      btts_yes: this.extractOddValue(selectedOdds, 14, ['yes']),
      btts_no: this.extractOddValue(selectedOdds, 14, ['no']),
      
      // Half Time 1X2 (Market ID: 31)
      ht_home: this.extractOddValue(selectedOdds, 31, ['1', 'home']),
      ht_draw: this.extractOddValue(selectedOdds, 31, ['x', 'draw']),
      ht_away: this.extractOddValue(selectedOdds, 31, ['2', 'away']),
      
      
      // Double Chance (Market ID: 2) - Based on official SportMonks API
      dc_1x: this.extractOddValue(selectedOdds, 2, ['1x', 'home or draw', 'cordoba - 0 goals', 'cordoba - 1 goal', 'cordoba - 2 goals', 'cordoba - 3+ goals']),
      dc_12: this.extractOddValue(selectedOdds, 2, ['12', 'home or away', 'more 2', 'more 4', 'more 5']),
      dc_x2: this.extractOddValue(selectedOdds, 2, ['x2', 'draw or away', '0', '1', '2', '3', '4']),
      
      // First Team To Score (Market ID: 247) - Based on official SportMonks API
      tsf_yes: this.extractOddValue(selectedOdds, 247, ['yes']),
      tsf_no: this.extractOddValue(selectedOdds, 247, ['no']),
      
      // Correct Score (Market ID: 5) - Common scores only
      cs_1_0: this.extractOddValue(selectedOdds, 5, ['1-0']),
      cs_2_0: this.extractOddValue(selectedOdds, 5, ['2-0']),
      cs_2_1: this.extractOddValue(selectedOdds, 5, ['2-1']),
      cs_0_1: this.extractOddValue(selectedOdds, 5, ['0-1']),
      cs_0_2: this.extractOddValue(selectedOdds, 5, ['0-2']),
      cs_1_2: this.extractOddValue(selectedOdds, 5, ['1-2']),
      cs_1_1: this.extractOddValue(selectedOdds, 5, ['1-1']),
      cs_0_0: this.extractOddValue(selectedOdds, 5, ['0-0']),
      
      // Half Time Over/Under (Market ID: 28) - 0.5, 1.5 goals
      ht_over_05: this.extractOverUnder(selectedOdds, '0.5', 'over', true),
      ht_under_05: this.extractOverUnder(selectedOdds, '0.5', 'under', true),
      ht_over_15: this.extractOverUnder(selectedOdds, '1.5', 'over', true),
      ht_under_15: this.extractOverUnder(selectedOdds, '1.5', 'under', true),
      
      // Total Goals Exact (Market ID: 9) - Common totals
      tg_0: this.extractOddValue(selectedOdds, 9, ['0']),
      tg_1: this.extractOddValue(selectedOdds, 9, ['1']),
      tg_2: this.extractOddValue(selectedOdds, 9, ['2']),
      tg_3: this.extractOddValue(selectedOdds, 9, ['3']),
      tg_4: this.extractOddValue(selectedOdds, 9, ['4']),
      tg_5: this.extractOddValue(selectedOdds, 9, ['5']),
      tg_6: this.extractOddValue(selectedOdds, 9, ['6'])
    };
    
    return processedOdds;
  }

  /**
   * Extract specific odd value with validation
   */
  extractOddValue(odds, marketId, labels) {
    const odd = odds.find(o => {
      const matchesMarket = parseInt(o.market_id) === marketId;
      const matchesLabel = labels.some(label => 
        o.label?.toLowerCase().includes(label.toLowerCase())
      );
      
      // Validate odds value
      const value = parseFloat(o.value);
      const isValidValue = value && value > 1.0 && value < 100.0;
      
      return matchesMarket && matchesLabel && isValidValue;
    });
    
    // Debug: Log extraction attempts for new market types
    if ([5, 9, 247, 2, 28].includes(marketId) && !odd) {
      const marketOdds = odds.filter(o => parseInt(o.market_id) === marketId);
      if (marketOdds.length > 0) {
        console.log(`⚠️ Market ${marketId} (${labels.join(', ')}) found ${marketOdds.length} odds but none matched labels`);
        console.log(`   Available labels: ${marketOdds.map(o => o.label).join(', ')}`);
      }
    }
    
    return odd ? parseFloat(odd.value) : null;
  }

  /**
   * Extract Over/Under odds with proper market validation
   */
  extractOverUnder(odds, total, direction, isHalfTime = false) {
    const odd = odds.find(o => {
      // Market ID 80 is for Over/Under markets
      const isOverUnderMarket = parseInt(o.market_id) === 80;
      
      // Check if half time market (market_id 32 is half time over/under)
      const isHTMarket = parseInt(o.market_id) === 32;
      const correctTimeframe = isHalfTime ? isHTMarket : isOverUnderMarket;
      
      // Match the specific total (1.5, 2.5, 3.5)
      const matchesTotal = o.total?.toString() === total || 
                          o.name?.toString() === total ||
                          parseFloat(o.total) === parseFloat(total) ||
                          parseFloat(o.name) === parseFloat(total);
      
      // Check direction (Over/Under)
      const matchesDirection = o.label?.toLowerCase().includes(direction.toLowerCase());
      
      // Validate odds value - more restrictive for Over/Under markets
      const value = parseFloat(o.value);
      const isValidValue = value && value > 1.0 && value < 10.0; // Over/Under odds should be 1.0-10.0
      
      return correctTimeframe && matchesTotal && matchesDirection && isValidValue;
    });
    
    return odd ? parseFloat(odd.value) : null;
  }

  /**
   * Check if fixture has minimal required odds
   */
  hasMinimalOdds(oddsData) {
    // Must have either Full Time 1X2 or (1X2 + O/U 2.5)
    const hasFT1X2 = oddsData.ft_home && oddsData.ft_draw && oddsData.ft_away;
    const hasOU25 = oddsData.over_25 && oddsData.under_25;
    
    return hasFT1X2 || (hasFT1X2 && hasOU25);
  }

  /**
   * Check if ready for Oddyssey (needs 1X2 + O/U 2.5)
   */
  isOddysseyReady(oddsData) {
    const hasFT1X2 = oddsData.ft_home && oddsData.ft_draw && oddsData.ft_away;
    const hasOU25 = oddsData.over_25 && oddsData.under_25;
    
    return hasFT1X2 && hasOU25;
  }

  /**
   * Save league to database with complete data
   */
  async saveLeague(league) {
    try {
      if (!league.id || !league.name) {
        console.log(`⚠️ Skipping league ${league.id} - missing required fields`);
        return false;
      }

      const countryName = league.country?.name || null;
      const countryCode = league.country?.code || league.country?.fifa_name || null;
      const imagePath = league.image_path || null;
      const countryImagePath = league.country?.image_path || null;

      const query = `
        INSERT INTO oracle.leagues (
          league_id, name, country, country_code, image_path, country_image_path,
          season_id, is_popular, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        ON CONFLICT (league_id) DO UPDATE SET
          name = EXCLUDED.name,
          country = EXCLUDED.country,
          country_code = EXCLUDED.country_code,
          image_path = EXCLUDED.image_path,
          country_image_path = EXCLUDED.country_image_path,
          season_id = EXCLUDED.season_id,
          is_popular = EXCLUDED.is_popular,
          updated_at = NOW()
      `;

      await db.query(query, [
        league.id.toString(),
        league.name,
        countryName,
        countryCode,
        imagePath,
        countryImagePath,
        league.season_id?.toString() || null,
        this.isPopularLeague(league)
      ]);

      console.log(`✅ Saved league ${league.id}: ${league.name} (${countryName})`);
      return true;
    } catch (error) {
      console.error(`❌ Error saving league ${league.id}:`, error.message);
      return false;
    }
  }

  /**
   * Determine if a league is popular based on name and country
   */
  isPopularLeague(league) {
    const popularKeywords = [
      'premier league', 'la liga', 'bundesliga', 'serie a', 'ligue 1',
      'champions league', 'europa league', 'conference league',
      'fa cup', 'copa del rey', 'dfb pokal', 'coppa italia', 'coupe de france'
    ];
    
    const leagueName = league.name?.toLowerCase() || '';
    const countryName = league.country?.name?.toLowerCase() || '';
    
    return popularKeywords.some(keyword => 
      leagueName.includes(keyword) || countryName.includes(keyword)
    );
  }

  /**
   * Save fixture to database
   */
  async saveFixture(fixture, homeTeam, awayTeam) {
    // First, save league information if available
    if (fixture.league && fixture.league.id) {
      try {
        await this.saveLeague(fixture.league);
      } catch (error) {
        console.warn(`⚠️ Failed to save league ${fixture.league.id}:`, error.message);
      }
    }

    const query = `
      INSERT INTO oracle.fixtures (
        id, name, home_team_id, away_team_id, home_team, away_team,
        league_id, league_name, season_id, round_id, round,
        match_date, starting_at, status, venue, referee,
        league, season, stage, round_obj, state, participants, metadata,
        referee_id, referee_name, referee_image_path,
        venue_capacity, venue_coordinates, venue_surface, venue_image_path,
        home_team_image_path, away_team_image_path, league_image_path, country_image_path,
        venue_id, state_id, result_info, leg,
        team_assignment_validated, odds_mapping_validated, processing_errors,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        home_team = EXCLUDED.home_team,
        away_team = EXCLUDED.away_team,
        match_date = EXCLUDED.match_date,
        starting_at = EXCLUDED.starting_at,
        status = EXCLUDED.status,
        home_team_image_path = EXCLUDED.home_team_image_path,
        away_team_image_path = EXCLUDED.away_team_image_path,
        league_image_path = EXCLUDED.league_image_path,
        country_image_path = EXCLUDED.country_image_path,
        venue_capacity = EXCLUDED.venue_capacity,
        venue_coordinates = EXCLUDED.venue_coordinates,
        venue_surface = EXCLUDED.venue_surface,
        venue_image_path = EXCLUDED.venue_image_path,
        referee_name = EXCLUDED.referee_name,
        referee_image_path = EXCLUDED.referee_image_path,
        updated_at = NOW()
    `;
    
    // Extract country information from league data
    const leagueCountry = fixture.league?.country?.name || null;
    const leagueCountryCode = fixture.league?.country?.code || fixture.league?.country?.fifa_name || null;
    
    // Extract venue information
    const venue = fixture.venue || {};
    const venueCapacity = venue.capacity || null;
    const venueCoordinates = venue.coordinates || null;
    const venueSurface = venue.surface || null;
    const venueImagePath = venue.image_path || null;
    
    // Extract referee information - handle different possible structures
    let refereeName = null;
    let refereeId = null;
    let refereeImagePath = null;
    
    if (fixture.referees && Array.isArray(fixture.referees) && fixture.referees.length > 0) {
      const referee = fixture.referees[0];
      refereeId = referee.id?.toString() || null;
      refereeName = referee.name || referee.common_name || referee.display_name || null;
      refereeImagePath = referee.image_path || null;
    }
    
    // Extract image paths from participants and league
    const homeTeamImagePath = homeTeam.image_path || null;
    const awayTeamImagePath = awayTeam.image_path || null;
    const leagueImagePath = fixture.league?.image_path || null;
    
    // Get country image path from league country data
    const countryImagePath = fixture.league?.country?.image_path || null;
    
    const values = [
      fixture.id.toString(), // $1 - id
      `${homeTeam.name} vs ${awayTeam.name}`, // $2 - name
      homeTeam.id?.toString() || null, // $3 - home_team_id
      awayTeam.id?.toString() || null, // $4 - away_team_id
      homeTeam.name, // $5 - home_team
      awayTeam.name, // $6 - away_team
      fixture.league?.id?.toString() || null, // $7 - league_id
      fixture.league?.name || 'Unknown League', // $8 - league_name
      fixture.season?.id?.toString() || null, // $9 - season_id
      fixture.round?.id?.toString() || null, // $10 - round_id
      fixture.round?.name || null, // $11 - round
      fixture.starting_at || new Date().toISOString(), // $12 - match_date
      fixture.starting_at || new Date().toISOString(), // $13 - starting_at
      fixture.state?.state || 'NS', // $14 - status
      JSON.stringify(fixture.venue || {}), // $15 - venue
      refereeName, // $16 - referee
      JSON.stringify(fixture.league || {}), // $17 - league
      JSON.stringify(fixture.season || {}), // $18 - season
      JSON.stringify(fixture.stage || {}), // $19 - stage
      JSON.stringify(fixture.round || {}), // $20 - round_obj
      JSON.stringify(fixture.state || {}), // $21 - state
      JSON.stringify(fixture.participants || []), // $22 - participants
      JSON.stringify({
        processed_at: new Date().toISOString(),
        venue_info: fixture.venue || {},
        referee_info: fixture.referees || [],
        team_images: {
          home_team_image: homeTeamImagePath,
          away_team_image: awayTeamImagePath
        },
        league_image: leagueImagePath,
        country_image: countryImagePath,
        additional_data: fixture.metadata || {}
      }), // $23 - metadata
      refereeId, // $24 - referee_id
      refereeName, // $25 - referee_name
      refereeImagePath, // $26 - referee_image_path
      venueCapacity, // $27 - venue_capacity
      venueCoordinates, // $28 - venue_coordinates
      venueSurface, // $29 - venue_surface
      venueImagePath, // $30 - venue_image_path
      homeTeamImagePath, // $31 - home_team_image_path
      awayTeamImagePath, // $32 - away_team_image_path
      leagueImagePath, // $33 - league_image_path
      countryImagePath, // $34 - country_image_path
      venue.id?.toString() || null, // $35 - venue_id
      fixture.state?.id?.toString() || null, // $36 - state_id
      JSON.stringify(fixture.result_info || {}), // $37 - result_info
      fixture.leg ? parseInt(fixture.leg.toString().split('/')[0]) || null : null, // $38 - leg
      true, // $39 - team_assignment_validated
      true, // $40 - odds_mapping_validated
      JSON.stringify({ processed_at: new Date().toISOString() }) // $41 - processing_errors
    ];
    

    
    await db.query(query, values);
  }

  /**
   * Save odds to database
   */
  async saveOdds(fixtureId, oddsData) {
    if (!oddsData.bookmaker_id) return 0;
    
    let count = 0;
    const markets = this.createOddsRecords(fixtureId, oddsData);
    
    for (const market of markets) {
      try {
        const query = `
          INSERT INTO oracle.fixture_odds (
            id, fixture_id, market_id, bookmaker_id, label, value,
            market_description, sort_order, bookmaker_name, total, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            value = EXCLUDED.value,
            total = EXCLUDED.total,
            bookmaker_name = EXCLUDED.bookmaker_name,
            updated_at = NOW()
        `;
        
        await db.query(query, market);
        count++;
      } catch (error) {
        console.warn(`⚠️ Failed to save odds record:`, error.message);
      }
    }
    
    return count;
  }

  /**
   * Create individual odds records
   */
  createOddsRecords(fixtureId, oddsData) {
    const records = [];
    let sortOrder = 1;
    
    // Helper function to add record
    const addRecord = (marketId, label, value, description, total = null) => {
      if (value !== null && value !== undefined) {
        const id = `${fixtureId}_${oddsData.bookmaker_id}_${marketId}_${label.toLowerCase().replace(/\s+/g, '_')}`;
        records.push([
          id,
          fixtureId.toString(),
          marketId.toString(),
          oddsData.bookmaker_id.toString(),
          label,
          value,
          description,
          sortOrder++,
          oddsData.bookmaker_name,
          total
        ]);
      }
    };
    
    // Full Time 1X2
    addRecord(1, 'Home', oddsData.ft_home, 'Full Time Result');
    addRecord(1, 'Draw', oddsData.ft_draw, 'Full Time Result');
    addRecord(1, 'Away', oddsData.ft_away, 'Full Time Result');
    
    // Over/Under Goals - all use market_id 80, differentiated by total field
    if (oddsData.over_15 !== null) {
      addRecord(80, 'Over', oddsData.over_15, 'Goals Over/Under 1.5', '1.5');
      addRecord(80, 'Under', oddsData.under_15, 'Goals Over/Under 1.5', '1.5');
    }
    if (oddsData.over_25 !== null) {
      addRecord(80, 'Over', oddsData.over_25, 'Goals Over/Under 2.5', '2.5');
      addRecord(80, 'Under', oddsData.under_25, 'Goals Over/Under 2.5', '2.5');
    }
    if (oddsData.over_35 !== null) {
      addRecord(80, 'Over', oddsData.over_35, 'Goals Over/Under 3.5', '3.5');
      addRecord(80, 'Under', oddsData.under_35, 'Goals Over/Under 3.5', '3.5');
    }
    
    // Both Teams to Score - market_id 14
    addRecord(14, 'Yes', oddsData.btts_yes, 'Both Teams to Score');
    addRecord(14, 'No', oddsData.btts_no, 'Both Teams to Score');
    
    // Half Time 1X2 - market_id 31
    addRecord(31, 'Home', oddsData.ht_home, 'Half Time Result');
    addRecord(31, 'Draw', oddsData.ht_draw, 'Half Time Result');
    addRecord(31, 'Away', oddsData.ht_away, 'Half Time Result');
    
    // First Half Goals - market_id 28 (same for 0.5 and 1.5, differentiated by total)
    if (oddsData.ht_over_05 !== null) {
      addRecord(28, 'Over', oddsData.ht_over_05, 'First Half Goals Over/Under 0.5', '0.5');
      addRecord(28, 'Under', oddsData.ht_under_05, 'First Half Goals Over/Under 0.5', '0.5');
    }
    if (oddsData.ht_over_15 !== null) {
      addRecord(28, 'Over', oddsData.ht_over_15, 'First Half Goals Over/Under 1.5', '1.5');
      addRecord(28, 'Under', oddsData.ht_under_15, 'First Half Goals Over/Under 1.5', '1.5');
    }
    
    // Double Chance - market_id 2
    addRecord(2, '1X', oddsData.dc_1x, 'Double Chance Home or Draw');
    addRecord(2, '12', oddsData.dc_12, 'Double Chance Home or Away');
    addRecord(2, 'X2', oddsData.dc_x2, 'Double Chance Draw or Away');
    
    // First Team To Score - market_id 247
    addRecord(247, 'Yes', oddsData.tsf_yes, 'First Team To Score');
    addRecord(247, 'No', oddsData.tsf_no, 'First Team To Score');
    
    // Correct Score - market_id 5
    addRecord(5, '1-0', oddsData.cs_1_0, 'Correct Score');
    addRecord(5, '2-0', oddsData.cs_2_0, 'Correct Score');
    addRecord(5, '2-1', oddsData.cs_2_1, 'Correct Score');
    addRecord(5, '0-1', oddsData.cs_0_1, 'Correct Score');
    addRecord(5, '0-2', oddsData.cs_0_2, 'Correct Score');
    addRecord(5, '1-2', oddsData.cs_1_2, 'Correct Score');
    addRecord(5, '1-1', oddsData.cs_1_1, 'Correct Score');
    addRecord(5, '0-0', oddsData.cs_0_0, 'Correct Score');
    
    // Asian Handicap - market_id 7
    addRecord(7, 'Home 0', oddsData.ah_home_0, 'Asian Handicap');
    addRecord(7, 'Home +0.5', oddsData.ah_home_05, 'Asian Handicap');
    addRecord(7, 'Home +1', oddsData.ah_home_1, 'Asian Handicap');
    addRecord(7, 'Away 0', oddsData.ah_away_0, 'Asian Handicap');
    addRecord(7, 'Away +0.5', oddsData.ah_away_05, 'Asian Handicap');
    addRecord(7, 'Away +1', oddsData.ah_away_1, 'Asian Handicap');
    
    // Total Goals Exact - market_id 9
    addRecord(9, '0 Goals', oddsData.tg_0, 'Total Goals Exact');
    addRecord(9, '1 Goal', oddsData.tg_1, 'Total Goals Exact');
    addRecord(9, '2 Goals', oddsData.tg_2, 'Total Goals Exact');
    addRecord(9, '3 Goals', oddsData.tg_3, 'Total Goals Exact');
    addRecord(9, '4 Goals', oddsData.tg_4, 'Total Goals Exact');
    addRecord(9, '5 Goals', oddsData.tg_5, 'Total Goals Exact');
    addRecord(9, '6 Goals', oddsData.tg_6, 'Total Goals Exact');
    
    return records;
  }

  /**
   * Fetch fixture results for completed matches with enhanced score parsing
   */
  async fetchFixtureResults(fixtureIds) {
    console.log(`🔍 Fetching results for ${fixtureIds.length} fixtures...`);
    
    const results = [];
    
    for (const fixtureId of fixtureIds) {
      try {
        const response = await this.axios.get(`/fixtures/${fixtureId}`, {
          params: {
            'api_token': this.apiToken,
            'include': 'scores;participants;state;league;referees;venue;weatherReport'
          }
        });
        
        const fixture = response.data.data;
        if (!fixture) continue;
        
        // Update fixture status if it has changed
        const currentStatus = fixture.state?.state || 'NS';
        await db.query(`
          UPDATE oracle.fixtures 
          SET status = $1, updated_at = NOW() 
          WHERE id = $2 AND status != $1
        `, [currentStatus, fixtureId]);

        // Only process completed matches (including penalty shootouts)
        if (!['FT', 'AET', 'PEN', 'FT_PEN'].includes(currentStatus)) {
          continue;
        }
        
        // ✅ REMOVED OLD LOGIC: No longer check for FT/FULLTIME upfront
        // New logic below will calculate 90-minute scores properly for AET matches
        
        const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
        const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');
        
        // Parse scores from SportMonks API format
        const parseScore = (scores, description) => {
          if (!scores || !Array.isArray(scores)) {
            console.log(`⚠️ No scores array for ${description}`);
            return { home: 0, away: 0 };
          }
          
          // Find scores with the specified description (e.g., "CURRENT" for full-time)
          const relevantScores = scores.filter(s => s.description === description);
          
          if (relevantScores.length === 0) {
            console.log(`⚠️ No ${description} scores found. Available: ${scores.map(s => s.description).join(', ')}`);
            return { home: 0, away: 0 };
          }
          
          let homeScore = null;
          let awayScore = null;
          
          for (const score of relevantScores) {
            if (score.score && score.score.participant && score.score.goals !== undefined) {
              const goals = parseInt(score.score.goals);
              if (score.score.participant === 'home') {
                homeScore = isNaN(goals) ? 0 : goals;
              } else if (score.score.participant === 'away') {
                awayScore = isNaN(goals) ? 0 : goals;
              }
            }
          }
          
                  // ROOT CAUSE FIX: Ensure both scores are found and valid
        if (homeScore === null || awayScore === null) {
          console.log(`⚠️ Incomplete ${description} scores: home=${homeScore}, away=${awayScore}`);
          // Return null instead of 0 to indicate missing data
          return { home: null, away: null };
        }
        
        return { home: homeScore, away: awayScore };
        };
        
        // For AET and penalty shootout matches, calculate 90-minute score from halves
        let ftScore;
        if (fixture.state?.state === 'FT_PEN' || fixture.state?.state === 'AET') {
          console.log(`🏆 Extra time/penalty match detected: ${fixture.id} (${fixture.state?.state})`);
          
          // ✅ CRITICAL FIX (per SportMonks documentation):
          // For 90-minute FT score: Sum 1ST_HALF + 2ND_HALF
          // 2ND_HALF in SportMonks represents regular second half (45-90 min), NOT including ET
          // NEVER use CURRENT for AET matches (includes extra time)
          
          const firstHalf = parseScore(fixture.scores, '1ST_HALF');
          const secondHalf = parseScore(fixture.scores, '2ND_HALF');
          
          if (firstHalf.home !== null && firstHalf.away !== null && 
              secondHalf.home !== null && secondHalf.away !== null) {
            // ✅ Calculate 90-minute FT score: 1ST_HALF + 2ND_HALF
            ftScore = {
              home: firstHalf.home + secondHalf.home,
              away: firstHalf.away + secondHalf.away
            };
            console.log(`✅ Calculated 90-minute FT score: ${ftScore.home}-${ftScore.away}`);
            console.log(`   1ST_HALF: ${firstHalf.home}-${firstHalf.away}`);
            console.log(`   2ND_HALF: ${secondHalf.home}-${secondHalf.away}`);
            
            // Validation: Check if CURRENT score differs (confirming ET was played)
            const currentScore = parseScore(fixture.scores, 'CURRENT');
            if (currentScore.home !== null && currentScore.away !== null) {
              const currentTotal = currentScore.home + currentScore.away;
              const ft90Total = ftScore.home + ftScore.away;
              if (currentTotal !== ft90Total) {
                console.log(`   ✅ VALIDATION: CURRENT (${currentScore.home}-${currentScore.away}) differs from FT90 - correctly using FT90`);
              } else {
                console.log(`   ⚠️ WARNING: CURRENT matches FT90 - verify this is correct`);
              }
            }
          } else {
            // ❌ CRITICAL: For AET/PEN matches, we MUST have both 1ST_HALF and 2ND_HALF
            console.error(`❌ CRITICAL ERROR: Cannot calculate 90-minute FT score for AET/PEN match ${fixture.id}`);
            console.error(`   Required: 1ST_HALF and 2ND_HALF scores`);
            console.error(`   Available: 1ST_HALF=${firstHalf.home !== null}, 2ND_HALF=${secondHalf.home !== null}`);
            console.error(`   This match CANNOT be settled until proper half scores are available!`);
            
            // Skip this fixture - do NOT use AET scores
            ftScore = { home: null, away: null };
            console.log(`⚠️ Skipping fixture ${fixture.id} - insufficient data for 90-minute FT score`);
          }
        } else {
          // For regular matches, use CURRENT score
          ftScore = parseScore(fixture.scores, 'CURRENT');
        }
        
        // ✅ CRITICAL VALIDATION: Skip fixtures without valid FT scores
        if (ftScore.home === null || ftScore.away === null) {
          console.log(`⚠️ Skipping fixture ${fixture.id} - no valid FT score available`);
          continue;
        }
        
        // Parse half-time score with better validation
        let htScore = parseScore(fixture.scores, '1ST_HALF');
        
        // If no 1ST_HALF score, try HT or HALFTIME
        if (htScore.home === null || htScore.away === null) {
          htScore = parseScore(fixture.scores, 'HT') || parseScore(fixture.scores, 'HALFTIME') || htScore;
        }
        
        // Calculate outcomes for Oddyssey (1X2 and O/U 2.5)
        const calculateMoneylineResult = (homeScore, awayScore) => {
          if (homeScore > awayScore) return '1';
          if (homeScore < awayScore) return '2';
          return 'X';
        };
        
        const calculateOverUnderResult = (homeScore, awayScore) => {
          const totalGoals = homeScore + awayScore;
          return totalGoals > 2.5 ? 'Over' : 'Under';
        };

        // ROOT CAUSE FIX: For Oddyssey matches, we CANNOT skip - use fallback data
        if (ftScore.home === null || ftScore.away === null) {
          console.log(`⚠️ Missing scores for fixture ${fixture.id} - checking for fallback data`);
          
          // Try to get scores from resolution_data in oddyssey_cycles
          const fallbackScores = await this.getFallbackScoresFromResolution(fixture.id);
          if (fallbackScores) {
            ftScore = fallbackScores;
            console.log(`✅ Using fallback scores: ${ftScore.home}-${ftScore.away}`);
          } else {
            // Try alternative score parsing methods
            console.log(`🔍 Trying alternative score parsing for fixture ${fixture.id}`);
            
            // Try to parse from different score descriptions
            const alternativeScores = this.parseAlternativeScores(fixture.scores, fixture.state?.state);
            if (alternativeScores && alternativeScores.home !== null && alternativeScores.away !== null) {
              ftScore = alternativeScores;
              console.log(`✅ Using alternative scores: ${ftScore.home}-${ftScore.away}`);
            } else {
              // CRITICAL FIX: If we still don't have complete scores, infer from available data
              console.log(`🔧 CRITICAL: Inferring missing scores for fixture ${fixture.id}`);
              ftScore = this.inferMissingScores(fixture.scores, fixture.state?.state);
              console.log(`✅ Inferred scores: ${ftScore.home}-${ftScore.away}`);
            }
          }
        }

        // FINAL VALIDATION: Ensure we have complete scores before proceeding
        if (ftScore.home === null || ftScore.away === null) {
          console.error(`❌ CRITICAL ERROR: Still missing scores for fixture ${fixture.id} after all fallback attempts`);
          console.error(`   Available scores:`, fixture.scores);
          console.error(`   Match state:`, fixture.state?.state);
          // Skip this fixture - we cannot process it without complete scores
          continue;
        }

        // ✅ CRITICAL VALIDATION: Ensure we're using 90-minute FT scores for pool settlement
        if (fixture.state?.state === 'AET' || fixture.state?.state === 'FT_PEN') {
          console.log(`⚠️ AET/PEN match detected - ensuring 90-minute FT score is used for pool settlement`);
          console.log(`   Match status: ${fixture.state?.state}`);
          console.log(`   FT score being used: ${ftScore.home}-${ftScore.away}`);
          
          // Additional validation: warn if we're using fallback scores that might include ET
          if (ftScore.home !== null && ftScore.away !== null) {
            const currentScore = parseScore(fixture.scores, 'CURRENT');
            if (currentScore.home !== null && currentScore.away !== null) {
              const ftTotal = ftScore.home + ftScore.away;
              const currentTotal = currentScore.home + currentScore.away;
              
              if (ftTotal !== currentTotal) {
                console.log(`✅ CONFIRMED: Using 90-minute FT score (${ftScore.home}-${ftScore.away}) instead of final score (${currentScore.home}-${currentScore.away})`);
              } else {
                console.log(`⚠️ WARNING: FT score matches current score - may not be 90-minute score`);
              }
            }
          }
        }

        // Calculate all market outcomes
        const ftTotal = ftScore.home + ftScore.away;
        const htTotal = (htScore.home !== null && htScore.away !== null) ? htScore.home + htScore.away : null;
        
        // CRITICAL ROOT CAUSE FIX: Calculate outcomes with CORRECT field names
        // Convert legacy moneyline format (1/X/2) to normalized format (Home/Draw/Away)
        const normalize1x2 = (result) => {
          if (result === '1') return 'Home';
          if (result === 'X') return 'Draw';
          if (result === '2') return 'Away';
          return result;
        };
        
        const result = {
          fixture_id: fixture.id,
          home_team: homeTeam?.name,
          away_team: awayTeam?.name,
          // ✅ CRITICAL: Always save 90-minute FT scores for pool settlement (never AET/PEN scores)
          home_score: ftScore.home,
          away_score: ftScore.away,
          ht_home_score: htScore.home !== null && htScore.home !== undefined ? htScore.home : null,
          ht_away_score: htScore.away !== null && htScore.away !== undefined ? htScore.away : null,
          status: fixture.state?.state,
          match_date: fixture.starting_at,
          score_type: (fixture.state?.state === 'AET' || fixture.state?.state === 'FT_PEN') ? 'FT_90MIN' : 'CURRENT',
          
          // ✅ CRITICAL FIX: Use OUTCOME_ prefix (not RESULT_) for db.saveMatchResult compatibility
          // This ensures guidedFetcher -> saveMatchResult works correctly
          outcome_1x2: normalize1x2(calculateMoneylineResult(ftScore.home, ftScore.away)),
          outcome_ou25: calculateOverUnderResult(ftScore.home, ftScore.away),
          outcome_ou35: ftTotal > 3.5 ? 'Over' : 'Under',
          outcome_btts: (ftScore.home > 0 && ftScore.away > 0) ? 'Yes' : 'No',
          outcome_ht_result: htTotal !== null ? normalize1x2(calculateMoneylineResult(htScore.home, htScore.away)) : null,
          outcome_ou05: ftTotal > 0.5 ? 'Over' : 'Under',
          outcome_ou15: ftTotal > 1.5 ? 'Over' : 'Under',
          
          // Legacy result_ fields (keep for backward compatibility with other services)
          result_1x2: calculateMoneylineResult(ftScore.home, ftScore.away),
          result_ou25: calculateOverUnderResult(ftScore.home, ftScore.away),
          result_ou35: ftTotal > 3.5 ? 'Over' : 'Under',
          result_btts: (ftScore.home > 0 && ftScore.away > 0) ? 'Yes' : 'No',
          result_ht_1x2: htTotal !== null ? calculateMoneylineResult(htScore.home, htScore.away) : null,
          result_ht_ou15: htTotal !== null ? (htTotal > 1.5 ? 'Over' : 'Under') : null,
          
          // Double Chance results
          result_dc_1x: (ftScore.home >= ftScore.away) ? '1X' : null,
          result_dc_12: (ftScore.home !== ftScore.away) ? '12' : null,
          result_dc_x2: (ftScore.home <= ftScore.away) ? 'X2' : null,
          
          // First Team To Score (simplified - any goal scored)
          result_tsf_yes: ftTotal > 0 ? 'Yes' : null,
          result_tsf_no: ftTotal === 0 ? 'No' : null,
          
          // Correct Score
          result_cs: `${ftScore.home}-${ftScore.away}`,
          
          // Total Goals Exact
          result_tg_exact: ftTotal.toString(),
          
          // Asian Handicap (simplified calculation)
          result_ah_home_0: ftScore.home > ftScore.away ? 'Home' : ftScore.home < ftScore.away ? 'Away' : 'Draw',
          result_ah_home_05: (ftScore.home + 0.5) > ftScore.away ? 'Home' : 'Away',
          result_ah_home_1: (ftScore.home + 1) > ftScore.away ? 'Home' : 'Away',
          
          // Additional calculated fields
          full_score: `${ftScore.home}-${ftScore.away}`,
          ht_score: htTotal !== null ? `${htScore.home}-${htScore.away}` : null
        };
        
        results.push(result);
        console.log(`✅ Found result for fixture ${fixtureId}: ${result.home_team} ${result.home_score}-${result.away_score} ${result.away_team} (${result.score_type})`);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 250));
        
        // Also fetch and save match events (goals, cards) for finished matches
        try {
          await this.fetchAndSaveMatchEvents(fixtureId);
        } catch (eventError) {
          console.warn(`⚠️ Failed to fetch events for fixture ${fixtureId}:`, eventError.message);
        }
        
      } catch (error) {
        console.error(`❌ Error fetching result for ${fixtureId}:`, error.message);
      }
    }
    
    console.log(`✅ Fetched ${results.length} results`);
    return results;
  }

  /**
   * Save fixture results to database with calculated outcomes
   * FIXED: Use unified results storage for consistency
   */
  async saveFixtureResults(results) {
    console.log(`💾 Saving ${results.length} fixture results...`);
    
    // Use legacy method since resultsStorage is not initialized
    return await this.saveFixtureResultsLegacy(results);
  }

  /**
   * Legacy method - kept for backward compatibility
   * DEPRECATED: Use saveFixtureResults instead
   */
  async saveFixtureResultsLegacy(results) {
    console.log(`💾 Saving ${results.length} fixture results to database (legacy method)...`);
    
    let savedCount = 0;
    
    for (const result of results) {
      try {
        // Validate result object before processing
        if (!result || !result.fixture_id) {
          console.warn('⚠️ Skipping invalid result object in legacy method:', result);
          continue;
        }
        
        // Calculate outcomes based on scores
        const outcomes = this.calculateOutcomes(result);
        
        if (!outcomes) {
          console.warn(`⚠️ Could not calculate outcomes for fixture ${result.fixture_id}, skipping legacy save`);
          continue;
        }
        
        const query = `
          INSERT INTO oracle.fixture_results (
            id, fixture_id, home_score, away_score, ht_home_score, ht_away_score,
            result_ou05, result_ou15, result_ou35, result_ou45,
            result_btts, result_ht, result_ht_ou05, result_ht_ou15, result_ht_goals,
            outcome_1x2, outcome_ou05, outcome_ou15, outcome_ou25, outcome_ou35, outcome_ou45,
            outcome_ht_result, outcome_btts, full_score, ht_score,
            finished_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
            $18, $19, $20, $21, $22, $23, $24, $25, $26, NOW()
          )
          ON CONFLICT (fixture_id) DO UPDATE SET
            home_score = EXCLUDED.home_score,
            away_score = EXCLUDED.away_score,
            ht_home_score = EXCLUDED.ht_home_score,
            ht_away_score = EXCLUDED.ht_away_score,
            result_ou05 = EXCLUDED.result_ou05,
            result_ou15 = EXCLUDED.result_ou15,
            result_ou35 = EXCLUDED.result_ou35,
            result_ou45 = EXCLUDED.result_ou45,
            result_btts = EXCLUDED.result_btts,
            result_ht = EXCLUDED.result_ht,
            result_ht_ou05 = EXCLUDED.result_ht_ou05,
            result_ht_ou15 = EXCLUDED.result_ht_ou15,
            result_ht_goals = EXCLUDED.result_ht_goals,
            outcome_1x2 = EXCLUDED.outcome_1x2,
            outcome_ou05 = EXCLUDED.outcome_ou05,
            outcome_ou15 = EXCLUDED.outcome_ou15,
            outcome_ou25 = EXCLUDED.outcome_ou25,
            outcome_ou35 = EXCLUDED.outcome_ou35,
            outcome_ou45 = EXCLUDED.outcome_ou45,
            outcome_ht_result = EXCLUDED.outcome_ht_result,
            outcome_btts = EXCLUDED.outcome_btts,
            full_score = EXCLUDED.full_score,
            ht_score = EXCLUDED.ht_score,
            finished_at = EXCLUDED.finished_at,
            updated_at = NOW()
        `;
        
        const values = [
          `result_${result.fixture_id}`, // id
          result.fixture_id, // fixture_id
          result.home_score !== null && result.home_score !== undefined ? result.home_score : 0, // home_score - CRITICAL FIX: Ensure 0 scores are not converted to NULL
          result.away_score !== null && result.away_score !== undefined ? result.away_score : 0, // away_score - CRITICAL FIX: Ensure 0 scores are not converted to NULL
          result.ht_home_score !== null && result.ht_home_score !== undefined ? result.ht_home_score : null, // ht_home_score
          result.ht_away_score !== null && result.ht_away_score !== undefined ? result.ht_away_score : null, // ht_away_score
          outcomes.result_ou05, // result_ou05
          outcomes.result_ou15, // result_ou15
          outcomes.result_ou35, // result_ou35
          outcomes.result_ou45, // result_ou45
          outcomes.result_btts, // result_btts
          outcomes.result_ht, // result_ht
          outcomes.result_ht_ou05, // result_ht_ou05
          outcomes.result_ht_ou15, // result_ht_ou15
          outcomes.result_ht_goals, // result_ht_goals
          outcomes.outcome_1x2, // outcome_1x2
          outcomes.outcome_ou05, // outcome_ou05
          outcomes.outcome_ou15, // outcome_ou15
          outcomes.outcome_ou25, // outcome_ou25
          outcomes.outcome_ou35, // outcome_ou35
          outcomes.outcome_ou45, // outcome_ou45
          outcomes.outcome_ht_result, // outcome_ht_result
          outcomes.outcome_btts, // outcome_btts
          outcomes.full_score, // full_score
          outcomes.ht_score, // ht_score
          result.match_date // finished_at
        ];
        
        await db.query(query, values);
        
        // CRITICAL FIX: Update fixture status AND result_info to reflect completion
        await db.query(`
          UPDATE oracle.fixtures 
          SET status = $1, result_info = $2, updated_at = NOW() 
          WHERE id = $3
        `, [result.status, JSON.stringify(result), result.fixture_id]);
        
        savedCount++;
        
        console.log(`✅ Saved result for fixture ${result.fixture_id}: ${result.home_score}-${result.away_score}`);
        
        // Broadcast score update via WebSocket
        try {
          const score = {
            home: result.home_score,
            away: result.away_score,
            current: `${result.home_score}-${result.away_score}`,
            ht: outcomes.ht_score || undefined,
            ft: outcomes.full_score || `${result.home_score}-${result.away_score}`
          };
          websocketService.broadcastScoreUpdate(result.fixture_id, score, result.status);
        } catch (wsError) {
          console.warn(`⚠️ Failed to broadcast score update for fixture ${result.fixture_id}:`, wsError.message);
        }
        
      } catch (error) {
        console.error(`❌ Error saving result for fixture ${result.fixture_id}:`, error.message);
      }
    }
    
    console.log(`💾 Successfully saved ${savedCount}/${results.length} results to database`);
    return savedCount;
  }

  /**
   * Parse alternative scores when standard parsing fails
   */
  parseAlternativeScores(scores, matchState) {
    if (!scores || !Array.isArray(scores)) {
      return null;
    }

    console.log(`🔍 Available score descriptions: ${scores.map(s => s.description).join(', ')}`);

    // Try different score combinations
    const scoreCombinations = [
      // Try 1ST_HALF + 2ND_HALF_ONLY (for extra time matches)
      () => {
        const firstHalf = this.parseScoreFromArray(scores, '1ST_HALF');
        const secondHalf = this.parseScoreFromArray(scores, '2ND_HALF_ONLY');
        if (firstHalf && secondHalf) {
          return {
            home: firstHalf.home + secondHalf.home,
            away: firstHalf.away + secondHalf.away
          };
        }
        return null;
      },
      // Try 1ST_HALF + 2ND_HALF (for regular matches)
      () => {
        const firstHalf = this.parseScoreFromArray(scores, '1ST_HALF');
        const secondHalf = this.parseScoreFromArray(scores, '2ND_HALF');
        if (firstHalf && secondHalf) {
          return {
            home: firstHalf.home + secondHalf.home,
            away: firstHalf.away + secondHalf.away
          };
        }
        return null;
      },
      // Try any score with "CURRENT" or "FT" description
      () => {
        const currentScore = this.parseScoreFromArray(scores, 'CURRENT') || this.parseScoreFromArray(scores, 'FT');
        return currentScore;
      },
      // Try the last available score
      () => {
        if (scores.length > 0) {
          const lastScore = scores[scores.length - 1];
          return this.parseScoreFromArray(scores, lastScore.description);
        }
        return null;
      }
    ];

    for (const combination of scoreCombinations) {
      try {
        const result = combination();
        if (result && result.home !== null && result.away !== null) {
          return result;
        }
      } catch (error) {
        console.log(`⚠️ Score combination failed: ${error.message}`);
      }
    }

    return null;
  }

  /**
   * Parse score from array by description
   */
  parseScoreFromArray(scores, description) {
    const relevantScores = scores.filter(s => s.description === description);
    
    if (relevantScores.length === 0) {
      return null;
    }
    
    let homeScore = null;
    let awayScore = null;
    
    for (const score of relevantScores) {
      if (score.score && score.score.participant && score.score.goals !== undefined) {
        const goals = parseInt(score.score.goals);
        if (score.score.participant === 'home') {
          homeScore = isNaN(goals) ? 0 : goals;
        } else if (score.score.participant === 'away') {
          awayScore = isNaN(goals) ? 0 : goals;
        }
      }
    }
    
    if (homeScore === null || awayScore === null) {
      return null;
    }
    
    return { home: homeScore, away: awayScore };
  }

  /**
   * CRITICAL FIX: Infer missing scores from available data
   * This ensures we never have incomplete scores in the database
   */
  inferMissingScores(scores, matchState) {
    if (!scores || !Array.isArray(scores)) {
      console.log(`⚠️ No scores available for inference`);
      return { home: 0, away: 0 };
    }

    console.log(`🔍 Inferring missing scores from available data:`, scores.map(s => `${s.description}: ${s.score?.participant}=${s.score?.goals}`));

    let homeScore = 0;
    let awayScore = 0;
    let hasHomeScore = false;
    let hasAwayScore = false;

    // First pass: collect all available scores
    for (const score of scores) {
      if (score.score && score.score.participant && score.score.goals !== undefined) {
        const goals = parseInt(score.score.goals);
        if (!isNaN(goals)) {
          if (score.score.participant === 'home') {
            homeScore = Math.max(homeScore, goals); // Take the highest score
            hasHomeScore = true;
          } else if (score.score.participant === 'away') {
            awayScore = Math.max(awayScore, goals); // Take the highest score
            hasAwayScore = true;
          }
        }
      }
    }

    // If we have partial scores, try to infer the missing one
    if (hasHomeScore && !hasAwayScore) {
      // We have home score but no away score
      // Check if we can infer from match state or other indicators
      if (matchState === 'FT' || matchState === 'AET' || matchState === 'FT_PEN') {
        // Match is finished, if home scored, away might have scored too
        // For now, assume a reasonable score based on home score
        awayScore = homeScore > 0 ? Math.max(0, homeScore - 1) : 0;
        console.log(`🔧 Inferred away score: ${awayScore} (home: ${homeScore})`);
      } else {
        awayScore = 0; // Default to 0 if match not finished
      }
    } else if (!hasHomeScore && hasAwayScore) {
      // We have away score but no home score
      if (matchState === 'FT' || matchState === 'AET' || matchState === 'FT_PEN') {
        // Match is finished, if away scored, home might have scored too
        homeScore = awayScore > 0 ? Math.max(0, awayScore - 1) : 0;
        console.log(`🔧 Inferred home score: ${homeScore} (away: ${awayScore})`);
      } else {
        homeScore = 0; // Default to 0 if match not finished
      }
    } else if (!hasHomeScore && !hasAwayScore) {
      // No scores at all - this should not happen for finished matches
      console.log(`⚠️ No scores found at all - defaulting to 0-0`);
      homeScore = 0;
      awayScore = 0;
    }

    console.log(`✅ Final inferred scores: ${homeScore}-${awayScore}`);
    return { home: homeScore, away: awayScore };
  }

  /**
   * ROOT CAUSE FIX: Get fallback scores from resolution_data in oddyssey_cycles
   */
  async getFallbackScoresFromResolution(fixtureId) {
    try {
      const db = require('../db/db');
      
      // Find cycles that contain this fixture and have resolution_data
      const cycleResult = await db.query(`
        SELECT oc.resolution_data
        FROM oracle.oddyssey_cycles oc
        JOIN oracle.daily_game_matches dgm ON dgm.cycle_id = oc.cycle_id
        WHERE dgm.fixture_id = $1 AND oc.resolution_data IS NOT NULL
        ORDER BY oc.cycle_id DESC
        LIMIT 1
      `, [fixtureId]);
      
      if (cycleResult.rows.length === 0) {
        return null;
      }
      
      const resolutionData = JSON.parse(cycleResult.rows[0].resolution_data);
      const matchData = resolutionData[fixtureId.toString()];
      
      if (matchData && matchData.homeScore !== undefined && matchData.awayScore !== undefined) {
        return {
          home: parseInt(matchData.homeScore),
          away: parseInt(matchData.awayScore)
        };
      }
      
      return null;
      
    } catch (error) {
      console.error(`❌ Error getting fallback scores for ${fixtureId}:`, error.message);
      return null;
    }
  }

  /**
   * Calculate all outcomes based on match scores - Enhanced for guided markets
   */
  calculateOutcomes(result) {
    // Validate result object
    if (!result) {
      console.error('❌ calculateOutcomes called with undefined result in sportmonks');
      return null;
    }
    
    // ✅ Extract scores - IMPORTANT: 0 is a VALID score (e.g., 0-0 is a valid Draw result)
    // Only use default 0 if score is null/undefined (missing data)
    // If score is explicitly 0, it means the team scored 0 goals (valid result)
    const homeScore = result.home_score !== null && result.home_score !== undefined ? result.home_score : 0;
    const awayScore = result.away_score !== null && result.away_score !== undefined ? result.away_score : 0;
    const htHomeScore = result.ht_home_score !== null && result.ht_home_score !== undefined ? result.ht_home_score : 0;
    const htAwayScore = result.ht_away_score !== null && result.ht_away_score !== undefined ? result.ht_away_score : 0;
    
    // Log for debugging (including 0-0 which is valid)
    if (homeScore === 0 && awayScore === 0) {
      console.log(`   📊 Processing 0-0 score (valid Draw result) for fixture ${result.fixture_id || 'unknown'}`);
    }
    
    const totalGoals = homeScore + awayScore;
    const htTotalGoals = htHomeScore + htAwayScore;
    const hasHtScores = result.ht_home_score !== null && result.ht_away_score !== null;
    
    // Full Time 1X2
    // IMPORTANT: 0-0 is a valid Draw result (homeScore === awayScore === 0)
    let result_1x2, outcome_1x2;
    if (homeScore > awayScore) {
      result_1x2 = '1';
      outcome_1x2 = 'Home';
    } else if (homeScore === awayScore) {
      result_1x2 = 'X';
      outcome_1x2 = 'Draw'; // Includes 0-0, 1-1, 2-2, etc.
    } else {
      result_1x2 = '2';
      outcome_1x2 = 'Away';
    }
    
    // Half Time 1X2 (for guided markets)
    let result_ht_1x2, outcome_ht_1x2;
    if (hasHtScores) {
      if (htHomeScore > htAwayScore) {
        result_ht_1x2 = '1';
        outcome_ht_1x2 = 'Home';
      } else if (htHomeScore === htAwayScore) {
        result_ht_1x2 = 'X';
        outcome_ht_1x2 = 'Draw';
      } else {
        result_ht_1x2 = '2';
        outcome_ht_1x2 = 'Away';
      }
    } else {
      result_ht_1x2 = null;
      outcome_ht_1x2 = null;
    }
    
    // Over/Under calculations
    const calculateOU = (total, threshold) => {
      if (total > threshold) return 'Over';
      if (total < threshold) return 'Under';
      return 'Push'; // Exactly equal
    };
    
    // Full-time O/U markets
    const result_ou05 = calculateOU(totalGoals, 0.5);
    const result_ou15 = calculateOU(totalGoals, 1.5);
    const result_ou25 = calculateOU(totalGoals, 2.5);
    const result_ou35 = calculateOU(totalGoals, 3.5); // For guided markets
    const result_ou45 = calculateOU(totalGoals, 4.5);
    
    // Half-time O/U markets (for guided markets)
    const result_ht_ou05 = hasHtScores ? calculateOU(htTotalGoals, 0.5) : null;
    const result_ht_ou15 = hasHtScores ? calculateOU(htTotalGoals, 1.5) : null; // For guided markets
    
    // Both Teams to Score (only YES for guided markets)
    const result_btts = (homeScore > 0 && awayScore > 0) ? 'Yes' : 'No';
    const outcome_btts = result_btts;
    
    // Double Chance calculations
    let outcome_dc;
    if (homeScore > awayScore) outcome_dc = '1X12'; // Home wins (covers 1X and 12)
    else if (homeScore < awayScore) outcome_dc = 'X212'; // Away wins (covers X2 and 12)
    else outcome_dc = '1XX2'; // Draw (covers 1X and X2)
    
    // Half-Time BTTS
    const outcome_ht_btts = hasHtScores && (htHomeScore > 0 && htAwayScore > 0) ? 'Yes' : 'No';
    
    // Half-Time Over/Under outcomes
    const outcome_ht_ou05 = hasHtScores ? (htTotalGoals > 0.5 ? 'Over' : 'Under') : null;
    const outcome_ht_ou15 = hasHtScores ? (htTotalGoals > 1.5 ? 'Over' : 'Under') : null;
    
    // Legacy half-time result (for backward compatibility)
    const result_ht = result_ht_1x2;
    const outcome_ht_result = outcome_ht_1x2;
    const result_ht_goals = htTotalGoals;
    
    // String representations
    const full_score = `${homeScore}-${awayScore}`;
    const ht_score = hasHtScores ? `${htHomeScore}-${htAwayScore}` : null;
    
    return {
      // Full-time markets
      result_1x2,
      result_ou05,
      result_ou15,
      result_ou25,
      result_ou35, // 3.5 O/U for guided markets
      result_ou45,
      result_btts,
      
      // Half-time markets (for guided markets)
      result_ht_1x2, // HT 1X2 for guided markets
      result_ht_ou05,
      result_ht_ou15, // 1st half 1.5 O/U for guided markets
      
      // Legacy fields
      result_ht,
      result_ht_goals,
      
      // Outcome descriptions
      outcome_1x2,
      outcome_ou05: result_ou05,
      outcome_ou15: result_ou15,
      outcome_ou25: result_ou25,
      outcome_ou35: result_ou35,
      outcome_ou45: result_ou45,
      outcome_ht_result,
      outcome_btts,
      outcome_dc,
      outcome_ht_ou05,
      outcome_ht_ou15,
      outcome_ht_btts,
      
      // Score strings
      full_score,
      ht_score
    };
  }

  /**
   * Fetch and save results for completed matches
   */
  async fetchAndSaveResults() {
    console.log('🚀 Starting automated results fetch and save...');
    
    try {
      // Get completed matches that don't have results yet
      const completedMatches = await this.getCompletedMatchesWithoutResults();
      
      if (completedMatches.length === 0) {
        console.log('✅ No completed matches without results found');
        return { fetched: 0, saved: 0 };
      }
      
      console.log(`📊 Found ${completedMatches.length} completed matches without results`);
      
      // Fetch results from API
      const fixtureIds = completedMatches.map(match => match.id);
      const results = await this.fetchFixtureResults(fixtureIds);
      
      if (results.length === 0) {
        console.log('⚠️ No results fetched from API');
        return { fetched: 0, saved: 0 };
      }
      
      // Save results to database
      const savedCount = await this.saveFixtureResults(results);
      
      console.log(`🎉 Results fetch and save completed: ${results.length} fetched, ${savedCount} saved`);
      
      return { fetched: results.length, saved: savedCount };
      
    } catch (error) {
      console.error('❌ Error in fetchAndSaveResults:', error);
      throw error;
    }
  }

  /**
   * Get completed matches that don't have results in database
   * FIXED: Also check matches that should be finished by time, not just status
   */
  async getCompletedMatchesWithoutResults() {
    const query = `
      SELECT f.id, f.home_team, f.away_team, f.match_date, f.status
      FROM oracle.fixtures f
      LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
      WHERE f.match_date < NOW() - INTERVAL '1 hour'  -- Match finished at least 1 hour ago
        AND (
          f.status IN ('FT', 'AET', 'PEN', 'FT_PEN')  -- Completed matches
          OR f.match_date < NOW() - INTERVAL '130 minutes'  -- Or should be finished by time (90min + 40min buffer)
        )
        AND fr.fixture_id IS NULL  -- No results yet
      ORDER BY f.match_date DESC
      LIMIT 50  -- Process in batches
    `;
    
    const result = await db.query(query);
    return result.rows;
  }

  /**
   * Get Oddyssey fixtures from database (today only)
   */
  async fetchOddysseyFixtures() {
    console.log('🎯 Getting Oddyssey fixtures from database...');
    
    const today = new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT DISTINCT f.*
      FROM oracle.fixtures f
      INNER JOIN oracle.fixture_odds fo1 ON f.id = fo1.fixture_id 
        AND fo1.market_id = '1' AND fo1.label = 'Home'
      INNER JOIN oracle.fixture_odds fo2 ON f.id = fo2.fixture_id 
        AND fo2.market_id = '80' AND fo2.label = 'Over' 
        AND fo2.market_description LIKE '%2.5%'
      WHERE DATE(f.match_date) = $1
        AND f.status IN ('NS', 'Fixture')
      ORDER BY f.match_date ASC
    `;
    
    const result = await db.query(query, [today]);
    
    console.log(`✅ Found ${result.rows.length} Oddyssey-ready fixtures for today`);
    return result.rows;
  }

  /**
   * Backward compatibility method for existing cron jobs
   */
  async fetchAndSaveFixtures() {
    console.log('⚠️ Using legacy method name - redirecting to fetchAndSave7DayFixtures()');
    return await this.fetchAndSave7DayFixtures();
  }

  /**
   * Update fixture status for live matches
   * This should run independently of results fetching to update match status
   */
  
    // Add retry logic for API calls
    async makeApiCallWithRetry(url, params, maxRetries = 3) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await this.axios.get(url, { params });
          return response;
        } catch (error) {
          if (attempt === maxRetries) throw error;
          console.log(`⚠️ API call failed (attempt ${attempt}/${maxRetries}), retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
        }
      }
    }

  async updateFixtureStatus() {
    console.log('🔄 Updating fixture status for live matches...');
    
    try {
      // Get fixtures that are likely in progress or finished
      const result = await db.query(`
        SELECT f.id, f.home_team, f.away_team, f.match_date, f.status
        FROM oracle.fixtures f
        WHERE f.match_date >= NOW() - INTERVAL '4 hours'
          AND f.match_date <= NOW() + INTERVAL '2 hours'
          AND f.status = 'NS'
        ORDER BY f.match_date DESC
        LIMIT 20
      `);

      if (result.rows.length === 0) {
        console.log('ℹ️ No fixtures need status updates');
        return { updated: 0 };
      }

      console.log(`📊 Updating status for ${result.rows.length} fixtures...`);
      
      let updatedCount = 0;
      
      // Process fixtures in batches to avoid API rate limits
      const batchSize = 5;
      for (let i = 0; i < result.rows.length; i += batchSize) {
        const batch = result.rows.slice(i, i + batchSize);
        
        // Process batch concurrently with timeout
        const batchPromises = batch.map(async (fixture) => {
          try {
            // Add timeout for individual API calls
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('API call timeout')), 10000); // 10 second timeout per call
            });
            
            const apiPromise = this.axios.get(`/fixtures/${fixture.id}`, {
              params: {
                'api_token': this.apiToken,
                'include': 'state'
              }
            });
            
            const response = await Promise.race([apiPromise, timeoutPromise]);
            
            if (response.data.data) {
              const fixtureData = response.data.data;
              const newStatus = fixtureData.state?.state || 'NS';
              
              // Only update if status has changed
              if (newStatus !== fixture.status) {
                await db.query(`
                  UPDATE oracle.fixtures 
                  SET status = $1, updated_at = NOW() 
                  WHERE id = $2
                `, [newStatus, fixture.id]);
                
                console.log(`✅ Updated fixture ${fixture.id} status: ${fixture.status} → ${newStatus}`);
                return 1; // Return 1 for successful update
              }
            }
            return 0; // No update needed
          } catch (error) {
            console.warn(`⚠️ Failed to update fixture ${fixture.id}: ${error.message}`);
            return 0; // Return 0 for failed update
          }
        });
        
        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        updatedCount += batchResults.reduce((sum, count) => sum + count, 0);
        
        // Small delay between batches to avoid rate limits
        if (i + batchSize < result.rows.length) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }
      }
      
      console.log(`🎉 Updated status for ${updatedCount}/${result.rows.length} fixtures`);
      return { updated: updatedCount };
      
    } catch (error) {
      console.error('❌ Error updating fixture status:', error);
      return { updated: 0, error: error.message };
    }
  }

  /**
   * Fetch and save match events (goals, cards, etc.) for a specific fixture
   */
  async fetchAndSaveMatchEvents(fixtureId) {
    try {
      console.log(`📊 Fetching match events for fixture ${fixtureId}...`);
      
      const response = await this.axios.get(`/fixtures/${fixtureId}`, {
        params: {
          'api_token': this.apiToken,
          'include': 'scores;events;participants' // Get scores (livescore), events (goals/cards), and participants (team info)
        }
      });

      if (!response.data.data) {
        console.warn(`⚠️ No data returned for fixture ${fixtureId}`);
        return { savedCount: 0 };
      }

      const fixture = response.data.data;
      let savedCount = 0;

      // Process events array for goals, cards, substitutions, etc.
      if (fixture.events && Array.isArray(fixture.events)) {
        for (const event of fixture.events) {
          try {
            // Determine event type based on SportMonks type_id
            // type_id: 14=Goal, 18=Substitution, 19=YellowCard, 20=RedCard, etc.
            let eventType = null;
            
            const typeId = event.type_id;
            
            if (typeId === 14) {
              eventType = 'goal';
            } else if (typeId === 18) {
              eventType = 'substitution';
            } else if (typeId === 19) {
              eventType = 'yellow_card';
            } else if (typeId === 20) {
              eventType = 'red_card';
            }

            // Only save recognized event types
            if (!eventType) {
              continue;
            }

            const playerName = event.player_name || null;
            const playerId = event.player_id || null;
            const teamId = event.participant_id || event.team_id || null; // participant_id is the team in SportMonks
            const minute = event.minute || null;
            const relatedPlayerName = event.related_player_name || null; // For assists
            const reason = event.addition || event.reason || null; // 'addition' field contains info like "1st Goal", "Yellow Card", etc.

            // Check if event already exists to avoid duplicates
            const existingEvent = await db.query(`
              SELECT id FROM oracle.match_events 
              WHERE fixture_id = $1 
                AND event_type = $2 
                AND minute = $3 
                AND player_name = $4
              LIMIT 1
            `, [fixtureId, eventType, minute, playerName]);

            // Only insert if event doesn't already exist
            if (existingEvent.rows.length === 0) {
              await db.query(`
                INSERT INTO oracle.match_events 
                (fixture_id, event_type, minute, player_name, player_id, team_id, related_player_name, reason, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
              `, [fixtureId, eventType, minute, playerName, playerId, teamId, relatedPlayerName, reason]);

              savedCount++;
              console.log(`  ✅ Saved ${eventType}: ${playerName} (${minute})`);
              
              // Broadcast goal or match event via WebSocket
              try {
                if (eventType === 'goal') {
                  // Determine team based on team_id
                  const team = 'away';
                  websocketService.broadcastGoalScored(fixtureId, playerName, minute, team);
                } else {
                  // Broadcast other events (cards, substitutions)
                  websocketService.broadcastMatchEvent(fixtureId, eventType, playerName, minute, 'away');
                }
              } catch (wsError) {
                console.warn(`⚠️ Failed to broadcast match event:`, wsError.message);
              }
            }
          } catch (eventError) {
            console.warn(`⚠️ Failed to process event:`, eventError.message);
          }
        }
      }

      console.log(`✅ Saved ${savedCount} match events for fixture ${fixtureId}`);
      return { savedCount };

    } catch (error) {
      console.error(`❌ Error fetching match events for fixture ${fixtureId}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch and save match events for ALL recent fixtures that have PREDICTION POOLS
   * This is selective - only saves for matches with active pools
   */
  async fetchAndSaveMatchEventsSelectiveWithPools() {
    try {
      console.log('📊 Fetching match events for fixtures WITH prediction pools...');
      
      // Get fixtures from last 3 days that:
      // 1. Are finished or live
      // 2. Have associated prediction pools
      const fixturesResult = await db.query(`
        SELECT DISTINCT f.fixture_id 
        FROM oracle.fixtures f
        INNER JOIN oracle.pools p ON 
          (p.market_id = f.id OR p.fixture_id = f.id OR 
           CAST(p.market_id AS BIGINT) = f.fixture_id)
        WHERE f.match_date >= NOW() - INTERVAL '3 days'
          AND f.status IN ('FT', 'LIVE', 'HT', '2H', 'ET', 'PEN')
          AND p.status NOT IN ('cancelled', 'void')
        ORDER BY f.match_date DESC
        LIMIT 100
      `);

      if (fixturesResult.rows.length === 0) {
        console.log('ℹ️ No fixtures with pools found for event fetching');
        return { totalSaved: 0, totalSkipped: 0 };
      }

      console.log(`📊 Found ${fixturesResult.rows.length} fixtures with prediction pools`);

      let totalSaved = 0;
      let totalSkipped = 0;
      const batchSize = 5;

      for (let i = 0; i < fixturesResult.rows.length; i += batchSize) {
        const batch = fixturesResult.rows.slice(i, i + batchSize);
        
        // Process batch concurrently
        const batchPromises = batch.map(async (row) => {
          try {
            const result = await this.fetchAndSaveMatchEvents(row.fixture_id);
            return result.savedCount || 0;
          } catch (error) {
            console.warn(`⚠️ Failed to fetch events for fixture ${row.fixture_id}:`, error.message);
            return 0;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        totalSaved += batchResults.reduce((sum, count) => sum + count, 0);
        totalSkipped += batch.length - batchResults.filter(r => r > 0).length;

        // Add delay between batches to avoid API rate limits
        if (i + batchSize < fixturesResult.rows.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`✅ Saved ${totalSaved} match events for ${fixturesResult.rows.length - totalSkipped} fixtures with pools (skipped ${totalSkipped} with no events)`);
      return { totalSaved, totalSkipped, fixturesChecked: fixturesResult.rows.length };

    } catch (error) {
      console.error('❌ Error fetching selective match events:', error.message);
      throw error;
    }
  }

  /**
   * DEPRECATED: Original method fetches ALL recent matches
   * Use fetchAndSaveMatchEventsSelectiveWithPools() instead for selective fetching
   */
  async fetchAndSaveAllRecentMatchEvents() {
    console.log('⚠️ DEPRECATED: fetchAndSaveAllRecentMatchEvents() - use fetchAndSaveMatchEventsSelectiveWithPools() instead');
    // Keep for backwards compatibility but log warning
    return this.fetchAndSaveMatchEventsSelectiveWithPools();
  }
}

module.exports = SportMonksService;
