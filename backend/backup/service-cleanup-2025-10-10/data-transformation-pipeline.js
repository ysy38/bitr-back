/**
 * Centralized Data Transformation Pipeline
 * 
 * This service provides a single source of truth for all data transformations
 * between SportMonks, Database, Contract, and Frontend layers.
 * 
 * ROOT CAUSE FIX: Eliminates inconsistent data transformations across the system
 */

class DataTransformationPipeline {
  constructor() {
    this.transformationRules = {
      // ID transformation rules
      ids: {
        // SportMonks fixture ID to database format
        sportMonksToDatabase: (id) => {
          if (typeof id === 'string') return id;
          if (typeof id === 'number') return id.toString();
          if (typeof id === 'bigint') return id.toString();
          throw new Error(`Invalid SportMonks ID format: ${typeof id}`);
        },
        
        // Database ID to contract format (BigInt)
        databaseToContract: (id) => {
          try {
            return BigInt(id);
          } catch (error) {
            throw new Error(`Cannot convert database ID to BigInt: ${id}`);
          }
        },
        
        // Contract ID to frontend format (string)
        contractToFrontend: (id) => {
          if (typeof id === 'bigint') return id.toString();
          if (typeof id === 'string') return id;
          if (typeof id === 'number') return id.toString();
          throw new Error(`Invalid contract ID format: ${typeof id}`);
        },
        
        // Frontend ID to contract format
        frontendToContract: (id) => {
          try {
            return BigInt(id);
          } catch (error) {
            throw new Error(`Cannot convert frontend ID to BigInt: ${id}`);
          }
        }
      },
      
      // Odds transformation rules
      odds: {
        // SportMonks odds to database format (decimal)
        sportMonksToDatabase: (odds) => {
          if (typeof odds === 'number' && odds > 0) return odds;
          if (typeof odds === 'string') {
            const parsed = parseFloat(odds);
            if (isNaN(parsed) || parsed <= 0) {
              throw new Error(`Invalid SportMonks odds: ${odds}`);
            }
            return parsed;
          }
          throw new Error(`Invalid SportMonks odds format: ${typeof odds}`);
        },
        
        // Database odds to contract format (scaled by 1000)
        databaseToContract: (odds) => {
          const decimal = parseFloat(odds);
          if (isNaN(decimal) || decimal <= 0) {
            throw new Error(`Invalid database odds: ${odds}`);
          }
          return Math.round(decimal * 1000);
        },
        
        // Contract odds to frontend format (decimal)
        contractToFrontend: (odds) => {
          const scaled = typeof odds === 'bigint' ? Number(odds) : odds;
          if (typeof scaled !== 'number' || scaled <= 0) {
            throw new Error(`Invalid contract odds: ${odds}`);
          }
          return (scaled / 1000).toFixed(2);
        },
        
        // Database odds to frontend format (decimal with proper formatting)
        databaseToFrontend: (odds) => {
          const decimal = parseFloat(odds);
          if (isNaN(decimal) || decimal <= 0) {
            throw new Error(`Invalid database odds: ${odds}`);
          }
          return decimal.toFixed(2);
        }
      },
      
      // BigInt serialization rules
      bigint: {
        // Convert all BigInt values in object to strings for JSON serialization
        serializeForJson: (obj) => {
          if (obj === null || obj === undefined) return obj;
          
          if (typeof obj === 'bigint') {
            return obj.toString();
          }
          
          if (Array.isArray(obj)) {
            return obj.map(item => this.transformationRules.bigint.serializeForJson(item));
          }
          
          if (typeof obj === 'object') {
            const serialized = {};
            for (const [key, value] of Object.entries(obj)) {
              serialized[key] = this.transformationRules.bigint.serializeForJson(value);
            }
            return serialized;
          }
          
          return obj;
        }
      }
    };
  }

  /**
   * Transform SportMonks fixture data to database format
   */
  transformSportMonksToDatabase(fixture) {
    try {
      const transformed = {
        fixture_id: this.transformationRules.ids.sportMonksToDatabase(fixture.id),
        home_team: fixture.participants?.find(p => p.meta?.location === 'home')?.name || 'Unknown',
        away_team: fixture.participants?.find(p => p.meta?.location === 'away')?.name || 'Unknown',
        match_date: new Date(fixture.starting_at),
        league_name: fixture.league?.name || 'Unknown League',
        
        // Transform odds if available
        home_odds: null,
        draw_odds: null,
        away_odds: null,
        over_25_odds: null,
        under_25_odds: null
      };

      // Process odds if available
      if (fixture.odds && Array.isArray(fixture.odds)) {
        const oddsMap = this.extractOddsFromSportMonks(fixture.odds);
        
        if (oddsMap['1X2']) {
          transformed.home_odds = this.transformationRules.odds.sportMonksToDatabase(oddsMap['1X2'].home);
          transformed.draw_odds = this.transformationRules.odds.sportMonksToDatabase(oddsMap['1X2'].draw);
          transformed.away_odds = this.transformationRules.odds.sportMonksToDatabase(oddsMap['1X2'].away);
        }
        
        if (oddsMap['O/U 2.5']) {
          transformed.over_25_odds = this.transformationRules.odds.sportMonksToDatabase(oddsMap['O/U 2.5'].over);
          transformed.under_25_odds = this.transformationRules.odds.sportMonksToDatabase(oddsMap['O/U 2.5'].under);
        }
      }

      return transformed;
    } catch (error) {
      throw new Error(`SportMonks to Database transformation failed: ${error.message}`);
    }
  }

  /**
   * Transform database match data to contract format
   */
  transformDatabaseToContract(match) {
    try {
      const startTime = Math.floor(new Date(match.match_date).getTime() / 1000);
      
      return {
        id: this.transformationRules.ids.databaseToContract(match.fixture_id),
        startTime: startTime,
        oddsHome: this.transformationRules.odds.databaseToContract(match.home_odds || 1.5),
        oddsDraw: this.transformationRules.odds.databaseToContract(match.draw_odds || 3.0),
        oddsAway: this.transformationRules.odds.databaseToContract(match.away_odds || 2.5),
        oddsOver: this.transformationRules.odds.databaseToContract(match.over_25_odds || 1.8),
        oddsUnder: this.transformationRules.odds.databaseToContract(match.under_25_odds || 2.0),
        result: {
          moneyline: 0, // NotSet
          overUnder: 0  // NotSet
        }
      };
    } catch (error) {
      throw new Error(`Database to Contract transformation failed: ${error.message}`);
    }
  }

  /**
   * Transform database match data to frontend format
   */
  transformDatabaseToFrontend(match) {
    try {
      const transformed = {
        fixtureId: this.transformationRules.ids.contractToFrontend(match.fixture_id),
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        matchDate: match.match_date,
        leagueName: match.league_name,
        odds: {
          home: this.transformationRules.odds.databaseToFrontend(match.home_odds || 1.5),
          draw: this.transformationRules.odds.databaseToFrontend(match.draw_odds || 3.0),
          away: this.transformationRules.odds.databaseToFrontend(match.away_odds || 2.5),
          over25: this.transformationRules.odds.databaseToFrontend(match.over_25_odds || 1.8),
          under25: this.transformationRules.odds.databaseToFrontend(match.under_25_odds || 2.0)
        }
      };

      // Serialize any BigInt values for JSON
      return this.transformationRules.bigint.serializeForJson(transformed);
    } catch (error) {
      throw new Error(`Database to Frontend transformation failed: ${error.message}`);
    }
  }

  /**
   * Transform contract match data to frontend format
   */
  transformContractToFrontend(contractMatch) {
    try {
      const transformed = {
        id: this.transformationRules.ids.contractToFrontend(contractMatch.id),
        startTime: contractMatch.startTime,
        odds: {
          home: this.transformationRules.odds.contractToFrontend(contractMatch.oddsHome),
          draw: this.transformationRules.odds.contractToFrontend(contractMatch.oddsDraw),
          away: this.transformationRules.odds.contractToFrontend(contractMatch.oddsAway),
          over25: this.transformationRules.odds.contractToFrontend(contractMatch.oddsOver),
          under25: this.transformationRules.odds.contractToFrontend(contractMatch.oddsUnder)
        },
        result: contractMatch.result
      };

      return this.transformationRules.bigint.serializeForJson(transformed);
    } catch (error) {
      throw new Error(`Contract to Frontend transformation failed: ${error.message}`);
    }
  }

  /**
   * Validate prediction ID matching between frontend and contract
   */
  validatePredictionMatching(frontendPredictions, contractMatches) {
    const errors = [];
    const matchedPredictions = [];

    if (frontendPredictions.length !== contractMatches.length) {
      throw new Error(`Prediction count mismatch: frontend has ${frontendPredictions.length}, contract has ${contractMatches.length}`);
    }

    for (let i = 0; i < contractMatches.length; i++) {
      const contractMatch = contractMatches[i];
      const contractMatchId = this.transformationRules.ids.contractToFrontend(contractMatch.id);
      
      // Find matching prediction by ID
      let matchedPrediction = null;
      for (const prediction of frontendPredictions) {
        const predictionMatchId = this.transformationRules.ids.contractToFrontend(prediction.matchId);
        
        if (predictionMatchId === contractMatchId) {
          matchedPrediction = prediction;
          break;
        }
      }

      if (!matchedPrediction) {
        errors.push(`No prediction found for contract match ${contractMatchId} at position ${i}`);
        continue;
      }

      // Validate prediction format
      if (!this.validatePredictionFormat(matchedPrediction)) {
        errors.push(`Invalid prediction format for match ${contractMatchId}`);
        continue;
      }

      matchedPredictions.push({
        contractMatch,
        prediction: matchedPrediction,
        position: i
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      matchedPredictions
    };
  }

  /**
   * Validate individual prediction format
   */
  validatePredictionFormat(prediction) {
    const requiredFields = ['matchId', 'selection', 'betType'];
    const validSelections = ['1', 'X', '2', 'Over', 'Under'];
    const validBetTypes = ['Moneyline', 'OverUnder'];

    for (const field of requiredFields) {
      if (!prediction[field]) {
        return false;
      }
    }

    if (!validSelections.includes(prediction.selection)) {
      return false;
    }

    if (!validBetTypes.includes(prediction.betType)) {
      return false;
    }

    return true;
  }

  /**
   * Extract odds mapping from SportMonks odds array
   */
  extractOddsFromSportMonks(oddsArray) {
    const oddsMap = {};

    for (const bookmaker of oddsArray) {
      if (!bookmaker.markets) continue;

      for (const market of bookmaker.markets) {
        const marketName = market.name;
        
        if (marketName === 'Fulltime Result' || marketName === '1X2') {
          oddsMap['1X2'] = this.extract1X2Odds(market.pivot);
        } else if (marketName === 'Goals Over/Under' && market.pivot?.handicap === '2.5') {
          oddsMap['O/U 2.5'] = this.extractOverUnderOdds(market.pivot);
        }
      }
    }

    return oddsMap;
  }

  /**
   * Extract 1X2 odds from market pivot
   */
  extract1X2Odds(pivot) {
    const odds = { home: null, draw: null, away: null };
    
    if (pivot.selections) {
      for (const selection of pivot.selections) {
        const label = selection.label?.toLowerCase();
        if (label === '1' || label === 'home') {
          odds.home = parseFloat(selection.odds);
        } else if (label === 'x' || label === 'draw') {
          odds.draw = parseFloat(selection.odds);
        } else if (label === '2' || label === 'away') {
          odds.away = parseFloat(selection.odds);
        }
      }
    }
    
    return odds;
  }

  /**
   * Extract Over/Under odds from market pivot
   */
  extractOverUnderOdds(pivot) {
    const odds = { over: null, under: null };
    
    if (pivot.selections) {
      for (const selection of pivot.selections) {
        const label = selection.label?.toLowerCase();
        if (label?.includes('over')) {
          odds.over = parseFloat(selection.odds);
        } else if (label?.includes('under')) {
          odds.under = parseFloat(selection.odds);
        }
      }
    }
    
    return odds;
  }

  /**
   * Calculate total odds for a set of predictions
   */
  calculateTotalOdds(predictions, contractMatches) {
    let totalOdds = 1;

    for (const prediction of predictions) {
      const matchId = this.transformationRules.ids.frontendToContract(prediction.matchId);
      const contractMatch = contractMatches.find(m => m.id === matchId);
      
      if (!contractMatch) {
        throw new Error(`Contract match not found for prediction ${prediction.matchId}`);
      }

      const odds = this.getOddsForSelection(prediction.selection, contractMatch);
      totalOdds *= (odds / 1000); // Convert from contract format to decimal
    }

    return totalOdds;
  }

  /**
   * Get odds for a specific selection from contract match
   */
  getOddsForSelection(selection, contractMatch) {
    switch (selection) {
      case '1': return contractMatch.oddsHome;
      case 'X': return contractMatch.oddsDraw;
      case '2': return contractMatch.oddsAway;
      case 'Over': return contractMatch.oddsOver;
      case 'Under': return contractMatch.oddsUnder;
      default: throw new Error(`Invalid selection: ${selection}`);
    }
  }
}

module.exports = DataTransformationPipeline;
