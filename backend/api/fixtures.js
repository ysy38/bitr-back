const express = require('express');
const router = express.Router();
const db = require('../db/db');
const SportMonksService = require('../services/sportmonks');

// Get upcoming fixtures for the next 7 days (always current date + 7 days)
router.get('/upcoming', async (req, res) => {
  try {
    const { 
      league = null,
      limit = 50,
      page = 1,
      oddyssey = null // New parameter to identify Oddyssey requests
    } = req.query;

    // Always use current date + 7 days for consistency
    // Use local timezone to avoid date confusion
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + 7);
    
    // Format dates in local timezone to avoid UTC confusion
    const formatDate = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const startDateStr = formatDate(today);
    const endDateStr = formatDate(endDate);

    // For Oddyssey, we need exactly 10 matches
    const isOddyssey = oddyssey === 'true';
    const actualLimit = isOddyssey ? 10 : parseInt(limit);
    const offset = (parseInt(page) - 1) * actualLimit;
    
    console.log(`🎯 Upcoming fixtures: ${startDateStr} to ${endDateStr}, oddyssey=${isOddyssey}, limit=${actualLimit}, page=${page}`);

    let query = `
      SELECT 
        f.id as fixture_id,
        f.name,
        f.home_team,
        f.away_team,
        f.home_team_id,
        f.away_team_id,
        f.home_team_image_path,
        f.away_team_image_path,
        f.league_name,
        f.league_id,
        f.season_id,
        f.round_id,
        f.match_date,
        f.starting_at,
        f.status,
        f.venue,
        f.referee,
        f.league,
        f.season,
        f.stage,
        f.round,
        f.state,
        f.participants,
        COALESCE(l.country, '') as country,
        COALESCE(l.country_code, '') as country_code,
        jsonb_build_object(
          'home', ft.home_odds,
          'draw', ft.draw_odds,
          'away', ft.away_odds,
          'over25', ou25.over_odds,
          'under25', ou25.under_odds,
          'over15', ou15.over_odds,
          'under15', ou15.under_odds,
          'over35', ou35.over_odds,
          'under35', ou35.under_odds,
          'bttsYes', bt.yes_odds,
          'bttsNo', bt.no_odds,
          'htHome', ht1x2.home_odds,
          'htDraw', ht1x2.draw_odds,
          'htAway', ht1x2.away_odds,
          'ht_over_05', ht05.ht_over_05_odds,
          'ht_under_05', ht05.ht_under_05_odds,
          'ht_over_15', ht15.ht_over_15_odds,
          'ht_under_15', ht15.ht_under_15_odds
        ) as odds_data,
        ft.updated_at as odds_updated_at
      FROM oracle.fixtures f
      LEFT JOIN (
        SELECT 
          fixture_id,
          MAX(CASE WHEN label = 'Home' THEN value END) as home_odds,
          MAX(CASE WHEN label = 'Draw' THEN value END) as draw_odds,
          MAX(CASE WHEN label = 'Away' THEN value END) as away_odds,
          MAX(updated_at) as updated_at
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
      ) ou25 ON f.id::VARCHAR = ou25.fixture_id::VARCHAR
      LEFT JOIN (
        SELECT 
          fixture_id,
          MAX(CASE WHEN label = 'Over' THEN value END) as over_odds,
          MAX(CASE WHEN label = 'Under' THEN value END) as under_odds
        FROM oracle.fixture_odds 
        WHERE (market_id = '80' AND total = '1.5') OR (market_id = '82')
        GROUP BY fixture_id
      ) ou15 ON f.id::VARCHAR = ou15.fixture_id::VARCHAR
      LEFT JOIN (
        SELECT 
          fixture_id,
          MAX(CASE WHEN label = 'Over' THEN value END) as over_odds,
          MAX(CASE WHEN label = 'Under' THEN value END) as under_odds
        FROM oracle.fixture_odds 
        WHERE (market_id = '80' AND total = '3.5') OR (market_id = '81')
        GROUP BY fixture_id
      ) ou35 ON f.id::VARCHAR = ou35.fixture_id::VARCHAR
      LEFT JOIN (
        SELECT 
          fixture_id,
          MAX(CASE WHEN label = 'Yes' THEN value END) as yes_odds,
          MAX(CASE WHEN label = 'No' THEN value END) as no_odds
        FROM oracle.fixture_odds 
        WHERE market_id = '14'
        GROUP BY fixture_id
      ) bt ON f.id::VARCHAR = bt.fixture_id::VARCHAR
      LEFT JOIN (
        SELECT 
          fixture_id,
          MAX(CASE WHEN label = 'Home' THEN value END) as home_odds,
          MAX(CASE WHEN label = 'Draw' THEN value END) as draw_odds,
          MAX(CASE WHEN label = 'Away' THEN value END) as away_odds
        FROM oracle.fixture_odds 
        WHERE market_id = '31'
        GROUP BY fixture_id
      ) ht1x2 ON f.id::VARCHAR = ht1x2.fixture_id::VARCHAR
      LEFT JOIN (
        SELECT 
          fixture_id,
          MAX(CASE WHEN label = 'Over' THEN value END) as ht_over_05_odds,
          MAX(CASE WHEN label = 'Under' THEN value END) as ht_under_05_odds
        FROM oracle.fixture_odds 
        WHERE market_id = '32' AND market_description LIKE '%0.5%'
        GROUP BY fixture_id
      ) ht05 ON f.id::VARCHAR = ht05.fixture_id::VARCHAR
      LEFT JOIN (
        SELECT 
          fixture_id,
          MAX(CASE WHEN label = 'Over' THEN value END) as ht_over_15_odds,
          MAX(CASE WHEN label = 'Under' THEN value END) as ht_under_15_odds
        FROM oracle.fixture_odds 
        WHERE market_id = '32' AND market_description LIKE '%1.5%'
        GROUP BY fixture_id
      ) ht15 ON f.id::VARCHAR = ht15.fixture_id::VARCHAR
      LEFT JOIN oracle.leagues l ON f.league_id = l.league_id
      WHERE f.match_date >= $1::date 
        AND f.match_date < $2::date + INTERVAL '1 day'
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
    `;

    const params = [startDateStr, endDateStr];
    let paramIndex = 3;

    if (league) {
      query += ` AND f.league_id = $${paramIndex}`;
      params.push(league);
      paramIndex++;
    }

    query += ` ORDER BY f.match_date ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(actualLimit, offset);

    const result = await db.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) 
      FROM oracle.fixtures f
      WHERE f.match_date >= $1::date 
        AND f.match_date < $2::date + INTERVAL '1 day'
        AND f.league_name NOT ILIKE '%women%'
        AND f.league_name NOT ILIKE '%female%'
        AND f.league_name NOT ILIKE '%ladies%'
        AND f.home_team NOT ILIKE '%women%'
        AND f.away_team NOT ILIKE '%women%'
        AND f.home_team NOT ILIKE '%female%'
        AND f.away_team NOT ILIKE '%female%'
        AND f.home_team NOT ILIKE '%ladies%'
        AND f.away_team NOT ILIKE '%ladies%'
    `;
    
    const countParams = [startDateStr, endDateStr];
    let countParamIndex = 3;
    
    if (league) {
      countQuery += ` AND f.league_id = $${countParamIndex}`;
      countParams.push(league);
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: {
        fixtures: result.rows.map(row => {
          // Parse JSON fields with error handling
          let venue = null;
          let referee = null;
          let league = null;
          let participants = null;
          
          try {
            if (row.venue) venue = JSON.parse(row.venue);
          } catch (e) {
            console.log(`⚠️ Invalid venue JSON for fixture ${row.fixture_id}:`, row.venue);
          }
          
          try {
            if (row.referee) referee = JSON.parse(row.referee);
          } catch (e) {
            console.log(`⚠️ Invalid referee JSON for fixture ${row.fixture_id}:`, row.referee);
          }
          
          try {
            if (row.league) league = JSON.parse(row.league);
          } catch (e) {
            console.log(`⚠️ Invalid league JSON for fixture ${row.fixture_id}:`, row.league);
          }
          
          try {
            if (row.participants) participants = JSON.parse(row.participants);
          } catch (e) {
            console.log(`⚠️ Invalid participants JSON for fixture ${row.fixture_id}:`, row.participants);
          }
          
          // Parse odds data from JSONB (already an object, no need to parse)
          let odds = null;
          try {
            if (row.odds_data) {
              // odds_data is already a JSONB object, not a string
              const oddsData = row.odds_data;
              odds = {
                // Full Time 1X2 (required for both guided and Oddyssey)
                home: oddsData.home ? parseFloat(oddsData.home) : null,
                draw: oddsData.draw ? parseFloat(oddsData.draw) : null,
                away: oddsData.away ? parseFloat(oddsData.away) : null,
                
                // Over/Under 1.5 (required for guided markets)
                over15: oddsData.over15 ? parseFloat(oddsData.over15) : null,
                under15: oddsData.under15 ? parseFloat(oddsData.under15) : null,
                
                // Over/Under 2.5 (required for both guided and Oddyssey)
                over25: oddsData.over25 ? parseFloat(oddsData.over25) : null,
                under25: oddsData.under25 ? parseFloat(oddsData.under25) : null,
                
                // Over/Under 3.5 (required for guided markets only)
                over35: oddsData.over35 ? parseFloat(oddsData.over35) : null,
                under35: oddsData.under35 ? parseFloat(oddsData.under35) : null,
                
                // Both Teams to Score (required for guided markets only)
                bttsYes: oddsData.bttsYes ? parseFloat(oddsData.bttsYes) : null,
                bttsNo: oddsData.bttsNo ? parseFloat(oddsData.bttsNo) : null,
                
                // Half Time 1X2 (required for guided markets only)
                htHome: oddsData.htHome ? parseFloat(oddsData.htHome) : null,
                htDraw: oddsData.htDraw ? parseFloat(oddsData.htDraw) : null,
                htAway: oddsData.htAway ? parseFloat(oddsData.htAway) : null,
                
                // Half Time Over/Under (required for guided markets only)
                ht_over_05: oddsData.ht_over_05 ? parseFloat(oddsData.ht_over_05) : null,
                ht_under_05: oddsData.ht_under_05 ? parseFloat(oddsData.ht_under_05) : null,
                ht_over_15: oddsData.ht_over_15 ? parseFloat(oddsData.ht_over_15) : null,
                ht_under_15: oddsData.ht_under_15 ? parseFloat(oddsData.ht_under_15) : null
              };
            }
          } catch (e) {
            console.log(`⚠️ Invalid odds data for fixture ${row.fixture_id}:`, row.odds_data);
          }
          
          // Add country prefix to league name if available and if it's a generic name
          let displayLeagueName = row.league_name;
          if (row.country && row.country_code && row.country !== 'null' && row.country_code !== 'null') {
            const genericNames = ['Premier League', 'First Division', 'Second Division', 'Cup', 'League'];
            const isGenericName = genericNames.some(name => 
              row.league_name.toLowerCase().includes(name.toLowerCase())
            );
            
            if (isGenericName) {
              displayLeagueName = `${row.country} ${row.league_name}`;
            }
          }

          return {
            id: row.fixture_id,
            name: row.name,
            homeTeam: {
              id: row.home_team_id,
              name: row.home_team,
              logoUrl: row.home_team_image_path || getTeamLogoUrl(row.home_team_id, row.home_team)
            },
            awayTeam: {
              id: row.away_team_id,
              name: row.away_team,
              logoUrl: row.away_team_image_path || getTeamLogoUrl(row.away_team_id, row.away_team)
            },
            league: {
              id: row.league_id,
              name: displayLeagueName,
              original_name: row.league_name,
              country: row.country,
              country_code: row.country_code,
              season: row.season_id
            },
            round: row.round_id,
            matchDate: row.match_date,
            startingAt: row.starting_at,
        timeOnly: row.match_date ? new Date(row.match_date).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false,
          timeZone: 'UTC'
        }) : null,
            venue: venue ? {
              name: venue.name,
              city: venue.city
            } : null,
            status: row.status,
            participants: participants,
            odds: odds
          };
        }),
        pagination: {
          current_page: parseInt(page),
          per_page: actualLimit,
          total,
          total_pages: Math.ceil(total / actualLimit),
          hasMore: parseInt(page) * actualLimit < total
        }
      }
    });

  } catch (error) {
    console.error('Error fetching upcoming fixtures:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upcoming fixtures'
    });
  }
});

// SportMonks-style endpoint: GET /fixtures/between/{startDate}/{endDate}
router.get('/between/:startDate/:endDate', async (req, res) => {
  try {
    const { startDate, endDate } = req.params;
    const { 
      league = null,
      per_page = 50,
      page = 1
    } = req.query;

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    const limit = parseInt(per_page);
    const offset = (parseInt(page) - 1) * limit;
    
    console.log(`📅 SportMonks-style fixtures: ${startDate} to ${endDate}, per_page=${limit}, page=${page}`);

    let query = `
      SELECT 
        f.id as fixture_id,
        f.home_team,
        f.away_team,
        f.home_team_id,
        f.away_team_id,
        f.league_name,
        f.league_id,
        f.season_id,
        f.round,
        f.match_date,
        f.venue,
        f.status,
        f.home_team_image_path,
        f.away_team_image_path,
        f.league_image_path,
        o.value as odds_data,
        o.updated_at as odds_updated_at
      FROM oracle.fixtures f
      LEFT JOIN oracle.fixture_odds o ON f.id::VARCHAR = o.fixture_id::VARCHAR
      WHERE f.match_date >= $1::date 
        AND f.match_date < $2::date + INTERVAL '1 day'
    `;

    const params = [startDate, endDate];
    let paramIndex = 3;

    if (league) {
      query += ` AND f.league_id = $${paramIndex}`;
      params.push(league);
      paramIndex++;
    }

    query += ` ORDER BY f.match_date ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) 
      FROM oracle.fixtures f
      WHERE f.match_date >= $1::date 
        AND f.match_date < $2::date + INTERVAL '1 day'
    `;
    
    const countParams = [startDate, endDate];
    
    if (league) {
      countQuery += ` AND f.league_id = $3`;
      countParams.push(league);
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    // Process rows with database image paths
    const processedRows = await Promise.all(result.rows.map(async row => ({
      id: row.fixture_id,
      homeTeam: {
        id: row.home_team_id,
        name: row.home_team,
        logoUrl: row.home_team_image_path || getTeamLogoUrl(row.home_team_id, row.home_team)
      },
      awayTeam: {
        id: row.away_team_id,
        name: row.away_team,
        logoUrl: row.away_team_image_path || getTeamLogoUrl(row.away_team_id, row.away_team)
      },
      league: {
        id: row.league_id,
        name: row.league_name,
        season: row.season_id,
        logoUrl: row.league_image_path || await getLeagueLogoUrl(row.league_id, row.league_name)
      },
      round: row.round,
      matchDate: row.match_date,
      venue: row.venue ? (() => {
        try {
          const venueData = JSON.parse(row.venue);
          return {
            name: venueData.name || null,
            city: venueData.city || null
          };
        } catch (e) {
          return { name: null, city: null };
        }
      })() : { name: null, city: null },
      status: row.status,
      odds: row.odds_data ? (() => {
        try {
          const oddsData = JSON.parse(row.odds_data);
          return {
            home: oddsData.home,
            draw: oddsData.draw,
            away: oddsData.away,
            over25: oddsData.over25,
            under25: oddsData.under25,
            bttsYes: oddsData.bttsYes,
            bttsNo: oddsData.bttsNo,
            updatedAt: row.odds_updated_at
          };
        } catch (e) {
          console.log(`⚠️ Invalid odds JSON for fixture ${row.fixture_id}:`, row.odds_data);
          return null;
        }
      })() : null
    })));

    res.json({
      success: true,
      data: processedRows,
      meta: {
        pagination: {
          current_page: parseInt(page),
          per_page: limit,
          total,
          total_pages: Math.ceil(total / limit),
          from: offset + 1,
          to: Math.min(offset + limit, total)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching fixtures by date range (SportMonks style):', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fixtures',
      details: error.message
    });
  }
});

// Debug endpoint to check odds data
router.get('/debug-odds', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        f.id as fixture_id,
        f.home_team,
        f.away_team,
        f.match_date,
        fo.label,
        fo.value,
        fo.market_id
      FROM oracle.fixtures f
      LEFT JOIN oracle.fixture_odds fo ON f.id::VARCHAR = fo.fixture_id::VARCHAR
      WHERE f.match_date >= NOW() 
      AND f.match_date <= NOW() + INTERVAL '1 day'
      AND fo.fixture_id IS NOT NULL
      ORDER BY f.match_date ASC
      LIMIT 5
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error in debug-odds:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get fixtures by date range (for guided markets) - MUST be before /:fixtureId
router.get('/date-range', async (req, res) => {
  try {
    const { 
      start_date,
      end_date, 
      league = null,
      limit = 100,
      offset = 0 
    } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'start_date and end_date are required'
      });
    }

    let query = `
      SELECT 
        f.id as fixture_id,
        f.home_team,
        f.away_team,
        f.league_name,
        f.league_id,
        f.season_id,
        f.round_id as round,
        f.match_date,
        f.status,
        jsonb_build_object(
          'home', ft.home_odds,
          'draw', ft.draw_odds,
          'away', ft.away_odds,
          'over25', ou.over_odds,
          'under25', ou.under_odds,
          'yes', bt.yes_odds,
          'no', bt.no_odds,
          'ht_over_05', ht.ht_over_05_odds,
          'ht_under_05', ht.ht_under_05_odds,
          'ht_over_15', ht.ht_over_15_odds,
          'ht_under_15', ht.ht_under_15_odds
        ) as odds_data,
        ft.updated_at as odds_updated_at
      FROM oracle.fixtures f
      LEFT JOIN (
        SELECT 
          fixture_id,
          MAX(CASE WHEN label = 'Home' THEN value END) as home_odds,
          MAX(CASE WHEN label = 'Draw' THEN value END) as draw_odds,
          MAX(CASE WHEN label = 'Away' THEN value END) as away_odds,
          MAX(updated_at) as updated_at
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
      LEFT JOIN (
        SELECT 
          fixture_id,
          MAX(CASE WHEN label = 'Yes' THEN value END) as yes_odds,
          MAX(CASE WHEN label = 'No' THEN value END) as no_odds
        FROM oracle.fixture_odds 
        WHERE market_id = '14'
        GROUP BY fixture_id
      ) bt ON f.id::VARCHAR = bt.fixture_id::VARCHAR
      LEFT JOIN (
        SELECT 
          fixture_id,
          MAX(CASE WHEN label = 'Over' AND total = '0.5' THEN value END) as ht_over_05_odds,
          MAX(CASE WHEN label = 'Under' AND total = '0.5' THEN value END) as ht_under_05_odds,
          MAX(CASE WHEN label = 'Over' AND total = '1.5' THEN value END) as ht_over_15_odds,
          MAX(CASE WHEN label = 'Under' AND total = '1.5' THEN value END) as ht_under_15_odds
        FROM oracle.fixture_odds 
        WHERE market_id = '28'
        GROUP BY fixture_id
      ) ht ON f.id::VARCHAR = ht.fixture_id::VARCHAR
      LEFT JOIN oracle.leagues l ON f.league_id = l.league_id
      WHERE f.match_date >= $1::date 
        AND f.match_date < $2::date + INTERVAL '1 day'
    `;

    const params = [start_date, end_date];
    let paramIndex = 3;

    if (league) {
      query += ` AND f.league_id = $${paramIndex}`;
      params.push(league);
      paramIndex++;
    }

    query += ` ORDER BY f.match_date ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) 
      FROM oracle.fixtures f
      WHERE f.match_date >= $1::date 
        AND f.match_date < $2::date + INTERVAL '1 day'
    `;
    
    const countParams = [start_date, end_date];
    
    if (league) {
      countQuery += ` AND f.league_id = $3`;
      countParams.push(league);
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: {
        fixtures: result.rows.map(row => ({
          id: row.fixture_id,
          homeTeam: {
            name: row.home_team
          },
          awayTeam: {
            name: row.away_team
          },
          league: {
            id: row.league_id,
            name: row.league_name,
            season: row.season_id
          },
          round: row.round,
          matchDate: row.match_date,
          status: row.status,
          odds: row.odds_data ? (() => {
            try {
              const oddsData = typeof row.odds_data === 'string' ? JSON.parse(row.odds_data) : row.odds_data;
              return {
                home: oddsData.home,
                draw: oddsData.draw,
                away: oddsData.away,
                over25: oddsData.over25,
                under25: oddsData.under25,
                bttsYes: oddsData.yes,
                bttsNo: oddsData.no,
                updatedAt: row.odds_updated_at
              };
            } catch (e) {
              console.log(`⚠️ Invalid odds JSON for fixture ${row.fixture_id}:`, row.odds_data);
              return null;
            }
          })() : null
        })),
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + parseInt(limit) < total
        }
      }
    });

  } catch (error) {
    console.error('Error fetching fixtures by date range:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fixtures for date range - FIXED',
      details: error.message
    });
  }
});

// Get today's fixtures
router.get('/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await db.query(`
      SELECT 
        f.id as fixture_id,
        f.home_team,
        f.away_team,
        f.home_team_id,
        f.away_team_id,
        f.league_name,
        f.league_id,
        f.match_date,
        f.status,
        f.home_team_image_path,
        f.away_team_image_path,
        f.league_image_path,
        o.value as odds_data
      FROM oracle.fixtures f
      LEFT JOIN oracle.fixture_odds o ON f.id::VARCHAR = o.fixture_id::VARCHAR
      WHERE DATE(f.match_date) = $1
      ORDER BY f.match_date ASC
    `, [today]);

    // Process rows with async logo URL fetching
    const processedRows = await Promise.all(result.rows.map(async row => {
      // Process odds data from JSONB (already parsed)
      let odds = null;
      try {
        if (row.odds_data) {
          const oddsData = row.odds_data; // Already parsed as JSONB
          
          // Validate odds before returning them
          const validateOdds = (odds) => {
            // Over/Under 2.5 odds should be between 1.1 and 3.0 typically
            if (odds.over25 && (odds.over25 < 1.1 || odds.over25 > 3.0)) {
              console.warn(`⚠️ Invalid Over/Under 2.5 odds: ${odds.over25}, setting to null`);
              odds.over25 = null;
            }
            if (odds.under25 && (odds.under25 < 1.1 || odds.under25 > 3.0)) {
              console.warn(`⚠️ Invalid Over/Under 2.5 odds: ${odds.under25}, setting to null`);
              odds.under25 = null;
            }
            
            // Over/Under 3.5 odds should be between 1.1 and 4.0 typically (higher than 2.5)
            if (odds.over35 && (odds.over35 < 1.1 || odds.over35 > 4.0)) {
              console.warn(`⚠️ Invalid Over/Under 3.5 odds: ${odds.over35}, setting to null`);
              odds.over35 = null;
            }
            if (odds.under35 && (odds.under35 < 1.1 || odds.under35 > 4.0)) {
              console.warn(`⚠️ Invalid Over/Under 3.5 odds: ${odds.under35}, setting to null`);
              odds.under35 = null;
            }
            
            // BTTS odds should be between 1.1 and 2.5 typically
            if (odds.bttsYes && (odds.bttsYes < 1.1 || odds.bttsYes > 2.5)) {
              console.warn(`⚠️ Invalid BTTS odds: ${odds.bttsYes}, setting to null`);
              odds.bttsYes = null;
            }
            if (odds.bttsNo && (odds.bttsNo < 1.1 || odds.bttsNo > 2.5)) {
              console.warn(`⚠️ Invalid BTTS odds: ${odds.bttsNo}, setting to null`);
              odds.bttsNo = null;
            }
            
            // Full Time 1X2 odds should be between 1.1 and 10.0 typically
            if (odds.home && (odds.home < 1.1 || odds.home > 10.0)) {
              console.warn(`⚠️ Invalid Home odds: ${odds.home}, setting to null`);
              odds.home = null;
            }
            if (odds.draw && (odds.draw < 1.1 || odds.draw > 10.0)) {
              console.warn(`⚠️ Invalid Draw odds: ${odds.draw}, setting to null`);
              odds.draw = null;
            }
            if (odds.away && (odds.away < 1.1 || odds.away > 10.0)) {
              console.warn(`⚠️ Invalid Away odds: ${odds.away}, setting to null`);
              odds.away = null;
            }
            
            // Half Time 1X2 odds should be between 1.1 and 10.0 typically
            if (odds.htHome && (odds.htHome < 1.1 || odds.htHome > 10.0)) {
              console.warn(`⚠️ Invalid Half Time Home odds: ${odds.htHome}, setting to null`);
              odds.htHome = null;
            }
            if (odds.htDraw && (odds.htDraw < 1.1 || odds.htDraw > 10.0)) {
              console.warn(`⚠️ Invalid Half Time Draw odds: ${odds.htDraw}, setting to null`);
              odds.htDraw = null;
            }
            if (odds.htAway && (odds.htAway < 1.1 || odds.htAway > 10.0)) {
              console.warn(`⚠️ Invalid Half Time Away odds: ${odds.htAway}, setting to null`);
              odds.htAway = null;
            }
            
            return odds;
          };
          
          odds = validateOdds({
            // Full Time 1X2 (required for both guided and Oddyssey)
            home: parseFloat(oddsData.home || 0),
            draw: parseFloat(oddsData.draw || 0),
            away: parseFloat(oddsData.away || 0),
            
            // Over/Under 2.5 (required for both guided and Oddyssey)
            over25: parseFloat(oddsData.over25 || 0),
            under25: parseFloat(oddsData.under25 || 0),
            
            // Over/Under 3.5 (required for guided markets only)
            over35: parseFloat(oddsData.over35 || 0),
            under35: parseFloat(oddsData.under35 || 0),
            
            // Both Teams to Score (required for guided markets only)
            bttsYes: parseFloat(oddsData.bttsYes || 0),
            bttsNo: parseFloat(oddsData.bttsNo || 0),
            
            // Half Time 1X2 (required for guided markets only)
            htHome: parseFloat(oddsData.htHome || 0),
            htDraw: parseFloat(oddsData.htDraw || 0),
            htAway: parseFloat(oddsData.htAway || 0)
          });
        }
      } catch (e) {
        console.log(`⚠️ Invalid odds data for fixture ${row.fixture_id}:`, e.message);
      }
      
      return {
        id: row.fixture_id,
        homeTeam: {
          id: row.home_team_id,
          name: row.home_team,
          logoUrl: row.home_team_image_path || getTeamLogoUrl(row.home_team_id, row.home_team)
        },
        awayTeam: {
          id: row.away_team_id,
          name: row.away_team,
          logoUrl: row.away_team_image_path || getTeamLogoUrl(row.away_team_id, row.away_team)
        },
        league: {
          id: row.league_id,
          name: row.league_name,
          logoUrl: row.league_image_path || await getLeagueLogoUrl(row.league_id, row.league_name)
        },
        matchDate: row.match_date,
        status: row.status,
        odds: odds
      };
    }));

    res.json({
      success: true,
      data: processedRows
    });

  } catch (error) {
    console.error('Error fetching today\'s fixtures:', error);
    console.error('Full error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch today\'s fixtures: ' + error.message
    });
  }
});

// Get fixture details by ID
router.get('/:fixtureId', async (req, res) => {
  try {
    const { fixtureId } = req.params;

    const result = await db.query(`
      SELECT 
        f.id as fixture_id,
        f.home_team,
        f.away_team,
        f.home_team_id,
        f.away_team_id,
        f.league_name,
        f.league_id,
        f.season_id,
        f.round,
        f.match_date,
        f.venue,
        f.status,
        f.referee,
        f.weather_report,
        f.home_team_image_path,
        f.away_team_image_path,
        f.league_image_path,
        o.value as odds_data,
        o.updated_at as odds_updated_at,
        r.home_score,
        r.away_score,
        r.ht_home_score,
        r.ht_away_score,
        r.outcome_1x2,
        r.outcome_ou25,
        r.result_btts,
        r.finished_at
      FROM oracle.fixtures f
      LEFT JOIN oracle.fixture_odds o ON f.id::VARCHAR = o.fixture_id::VARCHAR
      LEFT JOIN oracle.fixture_results r ON f.id::VARCHAR = r.fixture_id::VARCHAR
      WHERE f.id = $1
    `, [fixtureId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Fixture not found'
      });
    }

    const fixture = result.rows[0];

    res.json({
      success: true,
      data: {
        id: fixture.fixture_id,
        homeTeam: {
          id: fixture.home_team_id,
          name: fixture.home_team,
          logoUrl: fixture.home_team_image_path || getTeamLogoUrl(fixture.home_team_id, fixture.home_team)
        },
        awayTeam: {
          id: fixture.away_team_id,
          name: fixture.away_team,
          logoUrl: fixture.away_team_image_path || getTeamLogoUrl(fixture.away_team_id, fixture.away_team)
        },
        league: {
          id: fixture.league_id,
          name: fixture.league_name,
          season: fixture.season_id,
          logoUrl: fixture.league_image_path || null
        },
        round: fixture.round,
        matchDate: fixture.match_date,
        venue: fixture.venue ? (() => {
          try {
            const venueData = JSON.parse(fixture.venue);
            return {
              name: venueData.name || null,
              city: venueData.city || null
            };
          } catch (e) {
            return { name: null, city: null };
          }
        })() : { name: null, city: null },
        status: fixture.status,
        referee: fixture.referee,
        weather: fixture.weather_report,
        odds: fixture.odds_data ? (() => {
          try {
            const oddsData = JSON.parse(fixture.odds_data);
            return {
              home: oddsData.home,
              draw: oddsData.draw,
              away: oddsData.away,
              over25: oddsData.over25,
              under25: oddsData.under25,
              bttsYes: oddsData.bttsYes,
              bttsNo: oddsData.bttsNo,
              updatedAt: fixture.odds_updated_at
            };
          } catch (e) {
            console.log(`⚠️ Invalid odds JSON for fixture ${fixture.fixture_id}:`, fixture.odds_data);
            return null;
          }
        })() : null,
        result: fixture.home_score !== null ? {
          homeScore: fixture.home_score,
          awayScore: fixture.away_score,
          htHomeScore: fixture.ht_home_score,
          htAwayScore: fixture.ht_away_score,
          outcome_1x2: fixture.outcome_1x2,
          outcome_ou25: fixture.outcome_ou25,
          resultBTTS: fixture.result_btts,
          finishedAt: fixture.finished_at
        } : null
      }
    });

  } catch (error) {
    console.error('Error fetching fixture details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fixture details'
    });
  }
});

// Get popular leagues
router.get('/leagues/popular', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        l.league_id,
        l.name,
        l.country,
        l.country_code,
        l.logo_url,
        l.season_id,
        COUNT(f.fixture_id) as upcoming_fixtures
      FROM oracle.leagues l
      LEFT JOIN oracle.fixtures f ON l.league_id = f.league_id 
        AND f.match_date >= NOW() 
        AND f.match_date <= NOW() + INTERVAL '7 days'
      WHERE l.is_popular = true
      GROUP BY l.league_id, l.name, l.country, l.country_code, l.logo_url, l.season_id
      ORDER BY upcoming_fixtures DESC, l.name ASC
    `);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.league_id,
        name: row.name,
        country: row.country,
        countryCode: row.country_code,
        logoUrl: row.logo_url,
        seasonId: row.season_id,
        upcomingFixtures: parseInt(row.upcoming_fixtures)
      }))
    });

  } catch (error) {
    console.error('Error fetching popular leagues:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch popular leagues'
    });
  }
});

// Refresh fixtures manually (admin endpoint)
router.post('/refresh', async (req, res) => {
  try {
    const { days = 7 } = req.body;
    const sportmonksService = new SportMonksService();
    
    const refreshed = await sportmonksService.refreshFixtures(days);
    
    res.json({
      success: true,
        message: 'Fixtures refreshed successfully',
        fixturesUpdated: refreshed.fixtures,
        oddsUpdated: refreshed.odds
    });
  } catch (error) {
    console.error('Error refreshing fixtures:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh fixtures'
    });
  }
});

// Manual refresh fixtures with odds
router.post('/manual-fetch', async (req, res) => {
  try {
    console.log('🔄 Manual fixture fetch triggered...');
    
    const SportMonksService = require('../services/sportmonks');
    const sportmonksService = new SportMonksService();
    
    // Fetch 7-day fixtures for guided markets
    const result = await sportmonksService.fetchAndSaveFixtures();
    
    res.json({
      success: true,
      message: 'Manual fixture fetch completed',
      data: result
    });
  } catch (error) {
    console.error('Error in manual fixture fetch:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fixtures: ' + error.message
    });
  }
});

// Add team logo URLs based on team IDs from SportMonks API
function getTeamLogoUrl(teamId, teamName) {
  if (!teamId) {
    // Fallback to UI Avatars if no team ID available
    if (!teamName) return null;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(teamName)}&background=22C7FF&color=000&size=64&font-size=0.4&bold=true`;
  }
  
  // Use SportMonks CDN with team ID
  return `https://cdn.sportmonks.com/images/soccer/teams/${teamId}.png`;
}

// Add league logo URLs based on league IDs from SportMonks API
async function getLeagueLogoUrl(leagueId, leagueName) {
  if (!leagueId) {
    // Fallback to UI Avatars if no league ID available
    if (!leagueName || leagueName === 'Unknown') return null;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(leagueName)}&background=FF6B00&color=fff&size=64&font-size=0.4&bold=true`;
  }
  
  try {
    // First try to get logo URL from database
    const result = await db.query('SELECT logo_url FROM oracle.leagues WHERE league_id = $1', [leagueId]);
    if (result.rows.length > 0 && result.rows[0].logo_url) {
      return result.rows[0].logo_url;
    }
  } catch (error) {
    console.warn(`Could not fetch logo URL for league ${leagueId}:`, error.message);
  }
  
  // Fallback to SportMonks CDN with league ID
  return `https://cdn.sportmonks.com/images/soccer/leagues/${leagueId}.png`;
}

module.exports = router; 