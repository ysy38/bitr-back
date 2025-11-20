/**
 * Integration layer for enhanced SportMonks team assignment
 * This module extends the existing SportMonks service with enhanced validation
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

const EnhancedSportMonksService = require('./sportmonks-enhanced');

class SportMonksIntegration extends EnhancedSportMonksService {
  constructor() {
    super();
    console.log('🔧 SportMonks Integration initialized with enhanced team assignment');
  }

  /**
   * Override the original processFixtures method with enhanced validation
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
   */
  processFixtures(fixtures) {
    console.log(`🔄 Processing ${fixtures.length} fixtures with enhanced team assignment logic...`);
    
    // Use the enhanced processing method
    const processedFixtures = this.processFixturesWithValidation(fixtures);
    
    // Transform to match the original format expected by the rest of the system
    return processedFixtures.map(fixture => {
      try {
        // Extract league data from the response
        const leagueId = fixture.league?.id || fixture.league_id || null;
        const leagueName = this.formatLeagueName(fixture.league);

        // Filter out youth leagues and women matches (existing logic)
        const youthKeywords = ['U19', 'U18', 'U17', 'U16', 'U15', 'Youth', 'Junior', 'Reserve', 'B Team', 'U21', 'U23'];
        const womenKeywords = ['women', 'female', 'ladies'];
        
        const isYouthLeague = youthKeywords.some(keyword =>
          leagueName.toLowerCase().includes(keyword.toLowerCase())
        );
        const isWomenMatch = womenKeywords.some(keyword =>
          leagueName.toLowerCase().includes(keyword.toLowerCase()) ||
          fixture.home_team.toLowerCase().includes(keyword.toLowerCase()) ||
          fixture.away_team.toLowerCase().includes(keyword.toLowerCase())
        );
        
        // Exclude youth and women matches
        if (isYouthLeague || isWomenMatch) {
          console.log(`🚫 Filtering out youth/women league: ${leagueName}`);
          return null;
        }

        // Extract time data with proper fallbacks
        let matchDate = fixture.starting_at || fixture.starting_at_timestamp || null;
        
        if (!matchDate) {
          console.warn(`⚠️ Fixture ${fixture.id} has no starting_at, using current date + 1 day as fallback`);
          const fallbackDate = new Date();
          fallbackDate.setDate(fallbackDate.getDate() + 1);
          matchDate = fallbackDate.toISOString();
        } else if (typeof matchDate === 'number') {
          matchDate = new Date(matchDate * 1000).toISOString();
        } else if (typeof matchDate === 'string' && !matchDate.includes('T') && !matchDate.includes('Z')) {
          matchDate = matchDate.replace(' ', 'T') + 'Z';
        }
        
        if (matchDate && !Date.parse(matchDate)) {
          console.warn(`⚠️ Fixture ${fixture.id} has invalid date format: ${matchDate}, using fallback`);
          const fallbackDate = new Date();
          fallbackDate.setDate(fallbackDate.getDate() + 1);
          matchDate = fallbackDate.toISOString();
        }

        // Extract venue and referee from metadata
        const venue = fixture.metadata?.venue || {};
        const referee = fixture.metadata?.referee || {};

        // Enhanced logging for team assignment
        console.log(`✅ Enhanced processing for fixture ${fixture.id}:`, {
          teams: `${fixture.home_team} vs ${fixture.away_team}`,
          validated: {
            teams: fixture.team_assignment_validated,
            odds: fixture.odds_mapping_validated
          },
          league: leagueName,
          date: matchDate
        });

        return {
          id: fixture.id,
          name: `${fixture.home_team} vs ${fixture.away_team}`,
          home_team_id: fixture.home_team_id,
          away_team_id: fixture.away_team_id,
          home_team: fixture.home_team,
          away_team: fixture.away_team,
          league_id: leagueId,
          league_name: leagueName,
          season_id: fixture.season_id || null,
          round: fixture.round?.name || null,
          match_date: matchDate,
          venue_name: venue.name || null,
          venue_city: venue.city || null,
          status: fixture.state?.name || null,
          referee: referee.name || null,
          odds: fixture.odds,
          metadata: fixture.metadata,
          participants: fixture.participants,
          league: fixture.league,
          venue: venue,
          referee: referee,
          season: fixture.season,
          stage: fixture.stage,
          round_obj: fixture.round,
          state: fixture.state,
          
          // Enhanced validation fields
          team_assignment_validated: fixture.team_assignment_validated,
          odds_mapping_validated: fixture.odds_mapping_validated,
          processing_errors: fixture.processing_errors,
          validatedOdds: fixture.validatedOdds
        };
      } catch (error) {
        console.error(`❌ Error in integration processing for fixture ${fixture.id}:`, error.message);
        return null;
      }
    }).filter(fixture => fixture !== null);
  }

  /**
   * Enhanced fixture structure validation
   * Requirements: 1.4, 1.5
   */
  validateFixtureStructure(fixture) {
    try {
      // Basic validation
      if (!fixture.id) {
        console.warn(`⚠️ Fixture missing ID`);
        return false;
      }
      
      // Enhanced participant validation
      if (!fixture.participants || !Array.isArray(fixture.participants) || fixture.participants.length < 2) {
        console.warn(`⚠️ Fixture ${fixture.id}: Invalid participants structure`, fixture.participants);
        return false;
      }
      
      // Use enhanced team detection for validation
      const { detectionLog, homeParticipant, awayParticipant } = this.detectTeamPositions(
        fixture.participants, 
        fixture.id
      );
      
      const validation = this.validateTeamAssignment(
        fixture, 
        homeParticipant, 
        awayParticipant, 
        detectionLog
      );
      
      if (!validation.isValid) {
        console.warn(`⚠️ Fixture ${fixture.id}: Team assignment validation failed`, validation.errors);
        return false;
      }
      
      // Enhanced odds validation
      if (fixture.odds && Array.isArray(fixture.odds)) {
        const oddsMapping = this.mapOddsToTeams(
          fixture, 
          fixture.odds, 
          homeParticipant, 
          awayParticipant
        );
        
        const hasRequired1X2 = oddsMapping.mappedOdds.some(o => o.market === '1X2');
        const hasRequiredOU25 = oddsMapping.mappedOdds.some(o => o.market === 'O/U 2.5');
        
        if (!hasRequired1X2 || !hasRequiredOU25) {
          console.warn(`⚠️ Fixture ${fixture.id}: Missing required odds markets`);
          return false;
        }
      } else {
        console.warn(`⚠️ Fixture ${fixture.id}: No odds data available`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error(`❌ Error validating fixture ${fixture.id}:`, error.message);
      return false;
    }
  }

  /**
   * League name formatting (inherited from original)
   */
  formatLeagueName(league) {
    if (!league || !league.name) return 'Unknown League';
    
    console.log('Formatting league:', JSON.stringify(league));
    
    // Specific formatting for commonly confused leagues
    if (league.name === 'Premier League' || league.name === 'EPL') {
      const countryId = league.country_id || league.country?.id || 0;
      const countryName = league.country?.name || '';
      const countryCode = league.country?.code || league.short_code || '';
      
      console.log(`League country info - ID: ${countryId}, Name: ${countryName}, Code: ${countryCode}`);
      
      if (countryId === 2 || 
          countryName.toLowerCase().includes('england') || 
          countryName.toLowerCase().includes('united kingdom') || 
          countryCode.includes('ENG') || 
          countryCode.includes('GB')) {
        return 'England Premier League';
      } 
      else if (countryId === 95 || 
               countryName.toLowerCase().includes('russia') || 
               countryCode.includes('RUS')) {
        return 'Russia Premier League';
      }
      
      if (countryName) {
        return `${countryName} Premier League`;
      }
    }
    
    if (league.short_code) {
      const code = league.short_code.toUpperCase();
      if (code.startsWith('ENG')) {
        return `England ${league.name}`;
      } else if (code.startsWith('RUS')) {
        return `Russia ${league.name}`;
      }
    }
    
    return league.name;
  }

  /**
   * Get validation statistics for processed fixtures
   */
  getValidationStats(fixtures) {
    const stats = {
      total: fixtures.length,
      teamValidated: 0,
      oddsValidated: 0,
      fullyValidated: 0,
      hasErrors: 0,
      errorSummary: {}
    };

    fixtures.forEach(fixture => {
      if (fixture.team_assignment_validated) stats.teamValidated++;
      if (fixture.odds_mapping_validated) stats.oddsValidated++;
      if (fixture.team_assignment_validated && fixture.odds_mapping_validated) {
        stats.fullyValidated++;
      }
      
      if (fixture.processing_errors && fixture.processing_errors !== '{}') {
        stats.hasErrors++;
        try {
          const errors = JSON.parse(fixture.processing_errors);
          if (errors.validation?.errors) {
            errors.validation.errors.forEach(error => {
              stats.errorSummary[error] = (stats.errorSummary[error] || 0) + 1;
            });
          }
        } catch (e) {
          // Ignore JSON parsing errors
        }
      }
    });

    return stats;
  }
}

module.exports = SportMonksIntegration;