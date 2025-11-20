const { config } = require('./config.js');
const axios = require('axios');

const { SPORTMONKS_API_TOKEN } = config;
const API_BASE_URL = 'https://api.sportmonks.com/v3/football';

// --- Helper Enums (from Oddyssey.sol) ---
const MoneylineResult = { NotSet: 0, HomeWin: 1, Draw: 2, AwayWin: 3 };
const OverUnderResult = { NotSet: 0, Over: 1, Under: 2 };

// Preferred bookmakers in order of preference
const PREFERRED_BOOKMAKERS = [2, 28, 39, 35]; // bet365, bwin, pinnacle, 1xbet

// Youth/Women league filters
const EXCLUDE_KEYWORDS = [
  'u17', 'u18', 'u19', 'u21', 'u23', 'youth', 'junior', 'reserve', 'b team',
  'women', 'female', 'ladies', 'womens', "women's"
];

/**
 * @notice Fetches upcoming matches for the Oddyssey game.
 * @dev Implements actual SportMonks API calls to fetch 10 suitable matches
 * @returns {Promise<Array>} A promise that resolves to an array of 10 Match objects.
 */
async function fetchUpcomingMatches() {
    console.log("🚀 Fetching upcoming matches from SportMonks...");

    try {
        // Get current date and next 3 days
        const currentDate = new Date();
        const targetDate = new Date(currentDate.getTime() + (24 * 60 * 60 * 1000)); // Tomorrow
        const dateStr = targetDate.toISOString().split('T')[0];
        
        console.log(`📅 Fetching fixtures for ${dateStr}...`);
        
        // Fetch fixtures for tomorrow
        const fixtures = await fetchFixturesForDate(dateStr);
        
        if (!fixtures || fixtures.length === 0) {
            console.log("⚠️ No fixtures found for tomorrow, trying today...");
            const todayStr = currentDate.toISOString().split('T')[0];
            const todayFixtures = await fetchFixturesForDate(todayStr);
            
            if (!todayFixtures || todayFixtures.length === 0) {
                throw new Error("No suitable fixtures found for today or tomorrow");
            }
            
            return await processFixturesForOddyssey(todayFixtures);
        }
        
        return await processFixturesForOddyssey(fixtures);
        
    } catch (error) {
        console.error("❌ Error fetching upcoming matches:", error.message);
        throw error;
    }
}


/**
 * @notice Fetches the results for a given set of match IDs.
 * @dev Implements actual SportMonks API calls to get match results
 * @param {Array<number>} matchIds An array of SportMonks match IDs.
 * @returns {Promise<Array>} A promise that resolves to an array of 10 Result objects.
 */
async function fetchMatchResults(matchIds) {
    console.log(`🚀 Fetching results for ${matchIds.length} matches from SportMonks...`);

    try {
        const results = [];
        
        for (const matchId of matchIds) {
            console.log(`📊 Fetching result for match ${matchId}...`);
            
            try {
                const result = await fetchMatchResult(matchId);
                results.push(result);
            } catch (error) {
                console.error(`❌ Error fetching result for match ${matchId}:`, error.message);
                // Add default result for failed matches
                results.push({
                    moneyline: MoneylineResult.NotSet,
                    overUnder: OverUnderResult.NotSet
                });
            }
            
            // Small delay between API calls
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.log(`✅ Successfully fetched results for ${results.length} matches`);
        return results;
        
    } catch (error) {
        console.error("❌ Error fetching match results:", error.message);
        throw error;
    }
}


// --- Helper Functions ---

/**
 * Fetch fixtures for a specific date
 */
async function fetchFixturesForDate(dateStr) {
    try {
        const response = await axios.get(`${API_BASE_URL}/fixtures/date/${dateStr}`, {
            params: {
                'api_token': SPORTMONKS_API_TOKEN,
                'include': 'league;participants;odds.bookmaker',
                'per_page': 50,
                'page': 1
            }
        });

        if (!response.data.data) {
            return [];
        }

        return response.data.data.filter(fixture => {
            // Filter out youth/women leagues
            const leagueName = fixture.league?.name?.toLowerCase() || '';
            const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home')?.name || '';
            const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away')?.name || '';
            
            const textToCheck = `${leagueName} ${homeTeam} ${awayTeam}`.toLowerCase();
            const isExcluded = EXCLUDE_KEYWORDS.some(keyword => 
                textToCheck.includes(keyword.toLowerCase())
            );
            
            return !isExcluded && fixture.status === 'NS'; // Not Started
        });

    } catch (error) {
        console.error(`❌ Error fetching fixtures for ${dateStr}:`, error.message);
        return [];
    }
}

/**
 * Process fixtures and format them for Oddyssey contract
 */
async function processFixturesForOddyssey(fixtures) {
    const oddysseyMatches = [];
    
    for (const fixture of fixtures.slice(0, 10)) {
        try {
            // Fetch odds for this fixture
            const odds = await fetchOddsForFixture(fixture.id);
            
            if (odds && hasValidOdds(odds)) {
                const match = {
                    id: fixture.id,
                    startTime: Math.floor(new Date(fixture.starting_at).getTime() / 1000),
                    oddsHome: Math.round(odds.ft_home * 1000) || 2000,
                    oddsDraw: Math.round(odds.ft_draw * 1000) || 3000,
                    oddsAway: Math.round(odds.ft_away * 1000) || 2500,
                    oddsOver: Math.round(odds.over_25 * 1000) || 2000,
                    oddsUnder: Math.round(odds.under_25 * 1000) || 2000,
                    result: { 
                        moneyline: MoneylineResult.NotSet, 
                        overUnder: OverUnderResult.NotSet 
                    }
                };
                
                oddysseyMatches.push(match);
                console.log(`✅ Processed match ${fixture.id}: ${fixture.participants?.[0]?.name} vs ${fixture.participants?.[1]?.name}`);
            }
        } catch (error) {
            console.error(`❌ Error processing fixture ${fixture.id}:`, error.message);
        }
        
        if (oddysseyMatches.length >= 10) break;
    }
    
    if (oddysseyMatches.length < 10) {
        throw new Error(`Only found ${oddysseyMatches.length} suitable matches, need 10`);
    }
    
    return oddysseyMatches;
}

/**
 * Fetch odds for a specific fixture
 */
async function fetchOddsForFixture(fixtureId) {
    try {
        const response = await axios.get(`${API_BASE_URL}/odds/pre-match/by-fixture/${fixtureId}`, {
            params: {
                'api_token': SPORTMONKS_API_TOKEN,
                'include': 'bookmaker'
            }
        });

        if (!response.data.data || response.data.data.length === 0) {
            return null;
        }

        return processOdds(response.data.data);

    } catch (error) {
        console.error(`❌ Error fetching odds for fixture ${fixtureId}:`, error.message);
        return null;
    }
}

/**
 * Process and select best odds from multiple bookmakers
 */
function processOdds(odds) {
    if (!odds || odds.length === 0) return null;
    
    // Group odds by bookmaker
    const oddsByBookmaker = {};
    
    for (const odd of odds) {
        const bookmakerId = parseInt(odd.bookmaker_id);
        if (!oddsByBookmaker[bookmakerId]) {
            oddsByBookmaker[bookmakerId] = [];
        }
        oddsByBookmaker[bookmakerId].push(odd);
    }
    
    // Select best bookmaker
    let selectedBookmakerId = null;
    for (const preferredId of PREFERRED_BOOKMAKERS) {
        if (oddsByBookmaker[preferredId]) {
            selectedBookmakerId = preferredId;
            break;
        }
    }
    
    if (!selectedBookmakerId) {
        selectedBookmakerId = Object.keys(oddsByBookmaker)[0];
    }
    
    if (!selectedBookmakerId) return null;
    
    const selectedOdds = oddsByBookmaker[selectedBookmakerId];
    
    // Extract specific markets
    return {
        ft_home: extractOddValue(selectedOdds, 1, ['1', 'home']),
        ft_draw: extractOddValue(selectedOdds, 1, ['x', 'draw']),
        ft_away: extractOddValue(selectedOdds, 1, ['2', 'away']),
        over_25: extractOverUnder(selectedOdds, '2.5', 'over'),
        under_25: extractOverUnder(selectedOdds, '2.5', 'under')
    };
}

/**
 * Extract specific odd value
 */
function extractOddValue(odds, marketId, labels) {
    const odd = odds.find(o => {
        const matchesMarket = parseInt(o.market_id) === marketId;
        const matchesLabel = labels.some(label => 
            o.label?.toLowerCase().includes(label.toLowerCase())
        );
        
        const value = parseFloat(o.value);
        const isValidValue = value && value > 1.0 && value < 100.0;
        
        return matchesMarket && matchesLabel && isValidValue;
    });
    
    return odd ? parseFloat(odd.value) : null;
}

/**
 * Extract Over/Under odds
 */
function extractOverUnder(odds, total, direction) {
    const odd = odds.find(o => {
        const isOverUnderMarket = parseInt(o.market_id) === 80;
        const matchesTotal = o.label?.includes(total);
        const matchesDirection = o.label?.toLowerCase().includes(direction.toLowerCase());
        
        const value = parseFloat(o.value);
        const isValidValue = value && value > 1.0 && value < 100.0;
        
        return isOverUnderMarket && matchesTotal && matchesDirection && isValidValue;
    });
    
    return odd ? parseFloat(odd.value) : null;
}

/**
 * Check if odds are valid for Oddyssey
 */
function hasValidOdds(odds) {
    return odds.ft_home && odds.ft_draw && odds.ft_away && 
           odds.over_25 && odds.under_25;
}

/**
 * Fetch match result for a specific fixture
 */
async function fetchMatchResult(fixtureId) {
    try {
        const response = await axios.get(`${API_BASE_URL}/fixtures/${fixtureId}`, {
            params: {
                'api_token': SPORTMONKS_API_TOKEN,
                'include': 'scores;participants'
            }
        });

        if (!response.data.data) {
            throw new Error('No fixture data received');
        }

        const fixture = response.data.data;
        
        // Check if match is finished
        if (fixture.status !== 'FT' && fixture.status !== 'AET' && fixture.status !== 'PEN') {
            throw new Error(`Match not finished, status: ${fixture.status}`);
        }

        const scores = fixture.scores;
        if (!scores || scores.length < 2) {
            throw new Error('No scores available');
        }

        const homeScore = parseInt(scores[0].score);
        const awayScore = parseInt(scores[1].score);
        const totalGoals = homeScore + awayScore;

        // Determine moneyline result
        let moneyline;
        if (homeScore > awayScore) {
            moneyline = MoneylineResult.HomeWin;
        } else if (homeScore < awayScore) {
            moneyline = MoneylineResult.AwayWin;
        } else {
            moneyline = MoneylineResult.Draw;
        }

        // Determine over/under result (2.5 goals)
        const overUnder = totalGoals > 2.5 ? OverUnderResult.Over : OverUnderResult.Under;

        return {
            moneyline: moneyline,
            overUnder: overUnder
        };

    } catch (error) {
        console.error(`❌ Error fetching result for fixture ${fixtureId}:`, error.message);
        throw error;
    }
}

module.exports = {
    fetchUpcomingMatches,
    fetchMatchResults
}; 