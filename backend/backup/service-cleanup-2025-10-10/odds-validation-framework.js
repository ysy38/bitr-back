/**
 * Comprehensive Odds Validation Framework
 * 
 * This service provides centralized odds validation, calculation, and quality assurance
 * across all system components to prevent odds-related errors.
 * 
 * ROOT CAUSE FIX: Eliminates scattered odds validation and calculation inconsistencies
 */

const DataTransformationPipeline = require('./data-transformation-pipeline');

class OddsValidationFramework {
  constructor() {
    this.pipeline = new DataTransformationPipeline();
    
    // Validation rules and thresholds
    this.validationRules = {
      // Minimum and maximum acceptable odds values
      oddsRange: {
        min: 1.01,  // Minimum odds (1.01 = 99% probability)
        max: 100.0  // Maximum odds (100.0 = 1% probability)
      },
      
      // Market-specific validation rules
      markets: {
        '1X2': {
          requiredSelections: ['home', 'draw', 'away'],
          probabilitySum: { min: 0.95, max: 1.15 }, // Allow 5-15% bookmaker margin
          minOdds: { home: 1.01, draw: 1.01, away: 1.01 },
          maxOdds: { home: 50.0, draw: 15.0, away: 50.0 }
        },
        'OverUnder25': {
          requiredSelections: ['over', 'under'],
          probabilitySum: { min: 0.95, max: 1.15 },
          minOdds: { over: 1.01, under: 1.01 },
          maxOdds: { over: 10.0, under: 10.0 }
        }
      },
      
      // Scientific notation detection patterns
      scientificNotation: {
        pattern: /^-?\d+\.?\d*[eE][+-]?\d+$/,
        maxAcceptableExponent: 10 // e+10 or higher is suspicious
      }
    };
  }

  /**
   * Comprehensive odds validation for SportMonks data
   */
  validateSportMonksOdds(fixture) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      processedOdds: null
    };

    try {
      if (!fixture.odds || !Array.isArray(fixture.odds)) {
        validation.errors.push('No odds data available');
        validation.isValid = false;
        return validation;
      }

      const extractedOdds = this.pipeline.extractOddsFromSportMonks(fixture.odds);
      
      // Validate 1X2 market
      if (extractedOdds['1X2']) {
        const market1X2Validation = this.validate1X2Market(extractedOdds['1X2']);
        if (!market1X2Validation.isValid) {
          validation.errors.push(...market1X2Validation.errors);
          validation.isValid = false;
        }
        validation.warnings.push(...market1X2Validation.warnings);
      } else {
        validation.errors.push('Missing required 1X2 market');
        validation.isValid = false;
      }

      // Validate Over/Under 2.5 market
      if (extractedOdds['O/U 2.5']) {
        const marketOUValidation = this.validateOverUnderMarket(extractedOdds['O/U 2.5']);
        if (!marketOUValidation.isValid) {
          validation.errors.push(...marketOUValidation.errors);
          validation.isValid = false;
        }
        validation.warnings.push(...marketOUValidation.warnings);
      } else {
        validation.errors.push('Missing required Over/Under 2.5 market');
        validation.isValid = false;
      }

      validation.processedOdds = extractedOdds;

    } catch (error) {
      validation.errors.push(`Odds processing error: ${error.message}`);
      validation.isValid = false;
    }

    return validation;
  }

  /**
   * Validate 1X2 market odds
   */
  validate1X2Market(odds) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    const rules = this.validationRules.markets['1X2'];

    // Check all required selections are present
    for (const selection of rules.requiredSelections) {
      if (!odds[selection] || odds[selection] <= 0) {
        validation.errors.push(`Missing or invalid ${selection} odds: ${odds[selection]}`);
        validation.isValid = false;
      }
    }

    if (!validation.isValid) return validation;

    // Validate individual odds ranges
    for (const [selection, value] of Object.entries(odds)) {
      if (selection in rules.minOdds) {
        if (value < rules.minOdds[selection]) {
          validation.errors.push(`${selection} odds too low: ${value} (min: ${rules.minOdds[selection]})`);
          validation.isValid = false;
        }
        if (value > rules.maxOdds[selection]) {
          validation.warnings.push(`${selection} odds very high: ${value} (max recommended: ${rules.maxOdds[selection]})`);
        }
      }

      // Check for scientific notation
      if (this.isScientificNotation(value)) {
        validation.errors.push(`${selection} odds in scientific notation: ${value}`);
        validation.isValid = false;
      }
    }

    // Validate probability sum (bookmaker margin check)
    const probabilitySum = (1/odds.home) + (1/odds.draw) + (1/odds.away);
    if (probabilitySum < rules.probabilitySum.min || probabilitySum > rules.probabilitySum.max) {
      validation.warnings.push(`Unusual bookmaker margin: ${((probabilitySum - 1) * 100).toFixed(2)}%`);
    }

    return validation;
  }

  /**
   * Validate Over/Under market odds
   */
  validateOverUnderMarket(odds) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    const rules = this.validationRules.markets['OverUnder25'];

    // Check all required selections are present
    for (const selection of rules.requiredSelections) {
      if (!odds[selection] || odds[selection] <= 0) {
        validation.errors.push(`Missing or invalid ${selection} odds: ${odds[selection]}`);
        validation.isValid = false;
      }
    }

    if (!validation.isValid) return validation;

    // Validate individual odds ranges
    for (const [selection, value] of Object.entries(odds)) {
      if (selection in rules.minOdds) {
        if (value < rules.minOdds[selection]) {
          validation.errors.push(`${selection} odds too low: ${value} (min: ${rules.minOdds[selection]})`);
          validation.isValid = false;
        }
        if (value > rules.maxOdds[selection]) {
          validation.warnings.push(`${selection} odds very high: ${value} (max recommended: ${rules.maxOdds[selection]})`);
        }
      }

      // Check for scientific notation
      if (this.isScientificNotation(value)) {
        validation.errors.push(`${selection} odds in scientific notation: ${value}`);
        validation.isValid = false;
      }
    }

    // Validate probability sum
    const probabilitySum = (1/odds.over) + (1/odds.under);
    if (probabilitySum < rules.probabilitySum.min || probabilitySum > rules.probabilitySum.max) {
      validation.warnings.push(`Unusual O/U margin: ${((probabilitySum - 1) * 100).toFixed(2)}%`);
    }

    return validation;
  }

  /**
   * Validate database odds before contract submission
   */
  validateDatabaseOdds(match) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      sanitizedOdds: null
    };

    try {
      const requiredOdds = ['home_odds', 'draw_odds', 'away_odds', 'over_25_odds', 'under_25_odds'];
      const sanitizedOdds = {};

      for (const oddsField of requiredOdds) {
        const value = match[oddsField];
        
        // Check if odds exist
        if (value === null || value === undefined) {
          validation.errors.push(`Missing ${oddsField}`);
          validation.isValid = false;
          continue;
        }

        // Convert to number and validate
        const numericValue = parseFloat(value);
        if (isNaN(numericValue)) {
          validation.errors.push(`Invalid ${oddsField}: ${value} (not a number)`);
          validation.isValid = false;
          continue;
        }

        // Check for scientific notation
        if (this.isScientificNotation(value)) {
          validation.errors.push(`${oddsField} in scientific notation: ${value}`);
          validation.isValid = false;
          continue;
        }

        // Validate range
        if (numericValue < this.validationRules.oddsRange.min) {
          validation.errors.push(`${oddsField} too low: ${numericValue} (min: ${this.validationRules.oddsRange.min})`);
          validation.isValid = false;
          continue;
        }

        if (numericValue > this.validationRules.oddsRange.max) {
          validation.warnings.push(`${oddsField} very high: ${numericValue} (max recommended: ${this.validationRules.oddsRange.max})`);
        }

        sanitizedOdds[oddsField] = numericValue;
      }

      // Additional market-specific validation if all odds are valid
      if (validation.isValid) {
        // Validate 1X2 market
        const market1X2 = {
          home: sanitizedOdds.home_odds,
          draw: sanitizedOdds.draw_odds,
          away: sanitizedOdds.away_odds
        };
        const market1X2Validation = this.validate1X2Market(market1X2);
        validation.warnings.push(...market1X2Validation.warnings);

        // Validate O/U market
        const marketOU = {
          over: sanitizedOdds.over_25_odds,
          under: sanitizedOdds.under_25_odds
        };
        const marketOUValidation = this.validateOverUnderMarket(marketOU);
        validation.warnings.push(...marketOUValidation.warnings);
      }

      validation.sanitizedOdds = sanitizedOdds;

    } catch (error) {
      validation.errors.push(`Database odds validation error: ${error.message}`);
      validation.isValid = false;
    }

    return validation;
  }

  /**
   * Validate contract odds format
   */
  validateContractOdds(contractMatch) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    const requiredOdds = ['oddsHome', 'oddsDraw', 'oddsAway', 'oddsOver', 'oddsUnder'];

    for (const oddsField of requiredOdds) {
      const value = contractMatch[oddsField];
      
      // Check if odds exist
      if (value === null || value === undefined) {
        validation.errors.push(`Missing ${oddsField}`);
        validation.isValid = false;
        continue;
      }

      // Convert BigInt to number if needed
      const numericValue = typeof value === 'bigint' ? Number(value) : value;
      
      // Validate range (contract odds are scaled by 1000)
      const minScaled = this.validationRules.oddsRange.min * 1000;
      const maxScaled = this.validationRules.oddsRange.max * 1000;
      
      if (numericValue < minScaled) {
        validation.errors.push(`${oddsField} too low: ${numericValue} (min: ${minScaled})`);
        validation.isValid = false;
      }

      if (numericValue > maxScaled) {
        validation.warnings.push(`${oddsField} very high: ${numericValue} (max recommended: ${maxScaled})`);
      }
    }

    return validation;
  }

  /**
   * Calculate safe total odds with overflow protection
   */
  calculateSafeTotalOdds(predictions, contractMatches) {
    try {
      let totalOdds = 1;
      const maxSafeOdds = 1e10; // Prevent overflow

      for (const prediction of predictions) {
        const matchId = this.pipeline.transformationRules.ids.frontendToContract(prediction.matchId);
        const contractMatch = contractMatches.find(m => m.id === matchId);
        
        if (!contractMatch) {
          throw new Error(`Contract match not found for prediction ${prediction.matchId}`);
        }

        const odds = this.pipeline.getOddsForSelection(prediction.selection, contractMatch);
        const decimalOdds = odds / 1000; // Convert from contract format

        // Check for overflow before multiplication
        if (totalOdds * decimalOdds > maxSafeOdds) {
          return {
            isValid: false,
            error: 'Total odds calculation would overflow',
            totalOdds: null
          };
        }

        totalOdds *= decimalOdds;
      }

      // Format to reasonable decimal places
      const formattedOdds = parseFloat(totalOdds.toFixed(2));

      return {
        isValid: true,
        error: null,
        totalOdds: formattedOdds
      };

    } catch (error) {
      return {
        isValid: false,
        error: error.message,
        totalOdds: null
      };
    }
  }

  /**
   * Detect scientific notation in odds values
   */
  isScientificNotation(value) {
    const stringValue = value.toString();
    
    // Check for scientific notation pattern
    if (this.validationRules.scientificNotation.pattern.test(stringValue)) {
      // Extract exponent
      const exponentMatch = stringValue.match(/[eE]([+-]?\d+)$/);
      if (exponentMatch) {
        const exponent = Math.abs(parseInt(exponentMatch[1]));
        return exponent >= this.validationRules.scientificNotation.maxAcceptableExponent;
      }
    }
    
    return false;
  }

  /**
   * Sanitize odds value to prevent scientific notation
   */
  sanitizeOddsValue(value) {
    if (this.isScientificNotation(value)) {
      // If it's scientific notation, try to convert to reasonable decimal
      const numericValue = parseFloat(value);
      if (isNaN(numericValue) || numericValue <= 0) {
        throw new Error(`Cannot sanitize invalid odds value: ${value}`);
      }
      
      // Cap at maximum reasonable odds
      return Math.min(numericValue, this.validationRules.oddsRange.max);
    }
    
    return parseFloat(value);
  }

  /**
   * Generate odds validation report
   */
  generateValidationReport(fixture, databaseMatch = null, contractMatch = null) {
    const report = {
      fixtureId: fixture.id,
      timestamp: new Date().toISOString(),
      sportMonksValidation: null,
      databaseValidation: null,
      contractValidation: null,
      overallStatus: 'unknown',
      recommendations: []
    };

    // Validate SportMonks odds
    report.sportMonksValidation = this.validateSportMonksOdds(fixture);

    // Validate database odds if provided
    if (databaseMatch) {
      report.databaseValidation = this.validateDatabaseOdds(databaseMatch);
    }

    // Validate contract odds if provided
    if (contractMatch) {
      report.contractValidation = this.validateContractOdds(contractMatch);
    }

    // Determine overall status
    const allValidations = [
      report.sportMonksValidation,
      report.databaseValidation,
      report.contractValidation
    ].filter(v => v !== null);

    const hasErrors = allValidations.some(v => !v.isValid);
    const hasWarnings = allValidations.some(v => v.warnings && v.warnings.length > 0);

    if (hasErrors) {
      report.overallStatus = 'error';
      report.recommendations.push('Fix validation errors before proceeding');
    } else if (hasWarnings) {
      report.overallStatus = 'warning';
      report.recommendations.push('Review warnings and consider manual verification');
    } else {
      report.overallStatus = 'valid';
      report.recommendations.push('Odds validation passed - safe to proceed');
    }

    return report;
  }
}

module.exports = OddsValidationFramework;
