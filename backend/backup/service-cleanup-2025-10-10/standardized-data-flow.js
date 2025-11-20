/**
 * Standardized Data Flow Service
 * 
 * This service orchestrates the complete data flow from SportMonks to Frontend
 * with comprehensive validation, transformation, and error handling at each step.
 * 
 * ROOT CAUSE FIX: Eliminates data inconsistencies by standardizing the entire pipeline
 */

const DataTransformationPipeline = require('./data-transformation-pipeline');
const OddsValidationFramework = require('./odds-validation-framework');
const db = require('../db/db');

class StandardizedDataFlow {
  constructor() {
    this.pipeline = new DataTransformationPipeline();
    this.validator = new OddsValidationFramework();
    
    // Flow configuration
    this.config = {
      // Validation strictness levels
      validation: {
        strict: true,        // Fail on any validation error
        allowWarnings: true, // Continue with warnings
        logAll: true        // Log all validation results
      },
      
      // Retry configuration for failed operations
      retry: {
        maxAttempts: 3,
        backoffMs: 1000
      },
      
      // Data quality thresholds
      quality: {
        minOddsCount: 5,           // Minimum required odds per match
        maxScientificNotation: 0,  // No scientific notation allowed
        maxValidationErrors: 0     // No validation errors allowed
      }
    };
  }

  /**
   * Complete data flow: SportMonks → Database → Contract → Frontend
   */
  async processCompleteDataFlow(sportMonksFixtures, options = {}) {
    const flowResult = {
      success: false,
      processedCount: 0,
      errors: [],
      warnings: [],
      validationReports: [],
      databaseMatches: [],
      contractMatches: [],
      frontendMatches: []
    };

    try {
      console.log(`🔄 Starting standardized data flow for ${sportMonksFixtures.length} fixtures`);

      // Step 1: Process SportMonks → Database
      const databaseResult = await this.processSportMonksToDatabase(sportMonksFixtures);
      flowResult.databaseMatches = databaseResult.matches;
      flowResult.errors.push(...databaseResult.errors);
      flowResult.warnings.push(...databaseResult.warnings);

      if (databaseResult.matches.length === 0) {
        throw new Error('No valid matches processed from SportMonks data');
      }

      // Step 2: Process Database → Contract
      const contractResult = await this.processDatabaseToContract(databaseResult.matches);
      flowResult.contractMatches = contractResult.matches;
      flowResult.errors.push(...contractResult.errors);
      flowResult.warnings.push(...contractResult.warnings);

      // Step 3: Process Contract → Frontend
      const frontendResult = await this.processContractToFrontend(contractResult.matches);
      flowResult.frontendMatches = frontendResult.matches;
      flowResult.errors.push(...frontendResult.errors);
      flowResult.warnings.push(...frontendResult.warnings);

      // Step 4: Validate complete flow consistency
      const consistencyResult = await this.validateFlowConsistency(
        databaseResult.matches,
        contractResult.matches,
        frontendResult.matches
      );
      flowResult.errors.push(...consistencyResult.errors);
      flowResult.warnings.push(...consistencyResult.warnings);

      // Determine success
      flowResult.processedCount = frontendResult.matches.length;
      flowResult.success = flowResult.errors.length === 0 && flowResult.processedCount > 0;

      console.log(`✅ Data flow completed: ${flowResult.processedCount} matches processed`);
      
      if (flowResult.errors.length > 0) {
        console.error(`❌ Flow errors:`, flowResult.errors);
      }
      
      if (flowResult.warnings.length > 0) {
        console.warn(`⚠️ Flow warnings:`, flowResult.warnings);
      }

    } catch (error) {
      flowResult.errors.push(`Data flow failed: ${error.message}`);
      console.error('❌ Standardized data flow failed:', error);
    }

    return flowResult;
  }

  /**
   * Process SportMonks fixtures to database format
   */
  async processSportMonksToDatabase(fixtures) {
    const result = {
      matches: [],
      errors: [],
      warnings: []
    };

    for (const fixture of fixtures) {
      try {
        // Step 1: Validate SportMonks odds
        const oddsValidation = this.validator.validateSportMonksOdds(fixture);
        
        if (!oddsValidation.isValid) {
          result.errors.push(`Fixture ${fixture.id}: ${oddsValidation.errors.join(', ')}`);
          continue;
        }

        if (oddsValidation.warnings.length > 0) {
          result.warnings.push(`Fixture ${fixture.id}: ${oddsValidation.warnings.join(', ')}`);
        }

        // Step 2: Transform to database format
        const databaseMatch = this.pipeline.transformSportMonksToDatabase(fixture);

        // Step 3: Validate transformed data
        const dbValidation = this.validator.validateDatabaseOdds(databaseMatch);
        
        if (!dbValidation.isValid) {
          result.errors.push(`Database transform ${fixture.id}: ${dbValidation.errors.join(', ')}`);
          continue;
        }

        // Step 4: Store in database with transaction safety
        await this.safeDatabaseInsert(databaseMatch);
        
        result.matches.push(databaseMatch);
        
        console.log(`✅ Processed fixture ${fixture.id} to database`);

      } catch (error) {
        result.errors.push(`Fixture ${fixture.id} processing failed: ${error.message}`);
        console.error(`❌ Error processing fixture ${fixture.id}:`, error);
      }
    }

    return result;
  }

  /**
   * Process database matches to contract format
   */
  async processDatabaseToContract(databaseMatches) {
    const result = {
      matches: [],
      errors: [],
      warnings: []
    };

    for (const match of databaseMatches) {
      try {
        // Step 1: Validate database odds
        const dbValidation = this.validator.validateDatabaseOdds(match);
        
        if (!dbValidation.isValid) {
          result.errors.push(`Database match ${match.fixture_id}: ${dbValidation.errors.join(', ')}`);
          continue;
        }

        // Step 2: Transform to contract format
        const contractMatch = this.pipeline.transformDatabaseToContract(match);

        // Step 3: Validate contract format
        const contractValidation = this.validator.validateContractOdds(contractMatch);
        
        if (!contractValidation.isValid) {
          result.errors.push(`Contract transform ${match.fixture_id}: ${contractValidation.errors.join(', ')}`);
          continue;
        }

        result.matches.push(contractMatch);
        
        console.log(`✅ Processed match ${match.fixture_id} to contract format`);

      } catch (error) {
        result.errors.push(`Match ${match.fixture_id} contract processing failed: ${error.message}`);
        console.error(`❌ Error processing match ${match.fixture_id} to contract:`, error);
      }
    }

    return result;
  }

  /**
   * Process contract matches to frontend format
   */
  async processContractToFrontend(contractMatches) {
    const result = {
      matches: [],
      errors: [],
      warnings: []
    };

    for (const contractMatch of contractMatches) {
      try {
        // Step 1: Validate contract match
        const contractValidation = this.validator.validateContractOdds(contractMatch);
        
        if (!contractValidation.isValid) {
          result.errors.push(`Contract match ${contractMatch.id}: ${contractValidation.errors.join(', ')}`);
          continue;
        }

        // Step 2: Transform to frontend format
        const frontendMatch = this.pipeline.transformContractToFrontend(contractMatch);

        // Step 3: Validate BigInt serialization
        const serializedMatch = this.pipeline.transformationRules.bigint.serializeForJson(frontendMatch);
        
        // Verify JSON serialization works
        try {
          JSON.stringify(serializedMatch);
        } catch (jsonError) {
          result.errors.push(`JSON serialization failed for match ${contractMatch.id}: ${jsonError.message}`);
          continue;
        }

        result.matches.push(serializedMatch);
        
        console.log(`✅ Processed match ${contractMatch.id} to frontend format`);

      } catch (error) {
        result.errors.push(`Match ${contractMatch.id} frontend processing failed: ${error.message}`);
        console.error(`❌ Error processing match ${contractMatch.id} to frontend:`, error);
      }
    }

    return result;
  }

  /**
   * Validate consistency across the entire data flow
   */
  async validateFlowConsistency(databaseMatches, contractMatches, frontendMatches) {
    const result = {
      errors: [],
      warnings: []
    };

    try {
      // Check count consistency
      if (databaseMatches.length !== contractMatches.length) {
        result.errors.push(`Count mismatch: database=${databaseMatches.length}, contract=${contractMatches.length}`);
      }

      if (contractMatches.length !== frontendMatches.length) {
        result.errors.push(`Count mismatch: contract=${contractMatches.length}, frontend=${frontendMatches.length}`);
      }

      // Check ID consistency
      for (let i = 0; i < Math.min(databaseMatches.length, contractMatches.length, frontendMatches.length); i++) {
        const dbId = databaseMatches[i].fixture_id;
        const contractId = this.pipeline.transformationRules.ids.contractToFrontend(contractMatches[i].id);
        const frontendId = frontendMatches[i].fixtureId;

        if (dbId !== contractId || contractId !== frontendId) {
          result.errors.push(`ID mismatch at position ${i}: db=${dbId}, contract=${contractId}, frontend=${frontendId}`);
        }
      }

      // Check odds consistency (sample validation)
      if (databaseMatches.length > 0 && contractMatches.length > 0) {
        const dbMatch = databaseMatches[0];
        const contractMatch = contractMatches[0];
        
        // Validate odds transformation accuracy
        const expectedContractHome = Math.round(parseFloat(dbMatch.home_odds) * 1000);
        const actualContractHome = Number(contractMatch.oddsHome);
        
        if (Math.abs(expectedContractHome - actualContractHome) > 1) { // Allow 1 unit difference for rounding
          result.warnings.push(`Odds transformation inaccuracy detected: expected ${expectedContractHome}, got ${actualContractHome}`);
        }
      }

    } catch (error) {
      result.errors.push(`Flow consistency validation failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Safe database insert with transaction and conflict handling
   */
  async safeDatabaseInsert(match) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Check if match already exists
      const existingMatch = await client.query(
        'SELECT fixture_id FROM oracle.fixtures WHERE fixture_id = $1',
        [match.fixture_id]
      );

      if (existingMatch.rows.length > 0) {
        // Update existing match
        await client.query(`
          UPDATE oracle.fixtures SET
            home_team = $2,
            away_team = $3,
            match_date = $4,
            league_name = $5,
            home_odds = $6,
            draw_odds = $7,
            away_odds = $8,
            over_25_odds = $9,
            under_25_odds = $10,
            updated_at = NOW()
          WHERE fixture_id = $1
        `, [
          match.fixture_id,
          match.home_team,
          match.away_team,
          match.match_date,
          match.league_name,
          match.home_odds,
          match.draw_odds,
          match.away_odds,
          match.over_25_odds,
          match.under_25_odds
        ]);
      } else {
        // Insert new match
        await client.query(`
          INSERT INTO oracle.fixtures (
            fixture_id, home_team, away_team, match_date, league_name,
            home_odds, draw_odds, away_odds, over_25_odds, under_25_odds,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        `, [
          match.fixture_id,
          match.home_team,
          match.away_team,
          match.match_date,
          match.league_name,
          match.home_odds,
          match.draw_odds,
          match.away_odds,
          match.over_25_odds,
          match.under_25_odds
        ]);
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Validate predictions against contract matches with comprehensive error handling
   */
  async validatePredictionsForContract(predictions, contractMatches) {
    try {
      // Use the pipeline's validation method
      const validation = this.pipeline.validatePredictionMatching(predictions, contractMatches);
      
      if (!validation.isValid) {
        return {
          isValid: false,
          errors: validation.errors,
          matchedPredictions: []
        };
      }

      // Additional validation: calculate total odds safely
      const oddsCalculation = this.validator.calculateSafeTotalOdds(predictions, contractMatches);
      
      if (!oddsCalculation.isValid) {
        return {
          isValid: false,
          errors: [`Odds calculation failed: ${oddsCalculation.error}`],
          matchedPredictions: validation.matchedPredictions
        };
      }

      return {
        isValid: true,
        errors: [],
        matchedPredictions: validation.matchedPredictions,
        totalOdds: oddsCalculation.totalOdds
      };

    } catch (error) {
      return {
        isValid: false,
        errors: [`Prediction validation failed: ${error.message}`],
        matchedPredictions: []
      };
    }
  }

  /**
   * Get standardized match data for frontend API
   */
  async getStandardizedMatchesForFrontend(cycleId) {
    try {
      // Get matches from database
      const result = await db.query(`
        SELECT 
          fixture_id, home_team, away_team, match_date, league_name,
          home_odds, draw_odds, away_odds, over_25_odds, under_25_odds
        FROM oracle.fixtures f
        JOIN oracle.oddyssey_cycles oc ON oc.id = $1
        WHERE DATE(f.match_date) = DATE(oc.game_date)
        AND f.home_odds IS NOT NULL 
        AND f.draw_odds IS NOT NULL 
        AND f.away_odds IS NOT NULL
        AND f.over_25_odds IS NOT NULL 
        AND f.under_25_odds IS NOT NULL
        ORDER BY f.match_date ASC
        LIMIT 10
      `, [cycleId]);

      if (result.rows.length === 0) {
        throw new Error(`No matches found for cycle ${cycleId}`);
      }

      // Process through standardized pipeline
      const frontendResult = await this.processContractToFrontend(
        result.rows.map(row => this.pipeline.transformDatabaseToContract(row))
      );

      if (!frontendResult.matches || frontendResult.matches.length === 0) {
        throw new Error('No valid matches after processing pipeline');
      }

      return {
        success: true,
        matches: frontendResult.matches,
        errors: frontendResult.errors,
        warnings: frontendResult.warnings
      };

    } catch (error) {
      return {
        success: false,
        matches: [],
        errors: [error.message],
        warnings: []
      };
    }
  }

  /**
   * Generate comprehensive data flow health report
   */
  async generateHealthReport() {
    const report = {
      timestamp: new Date().toISOString(),
      dataFlowHealth: 'unknown',
      checks: {
        databaseConnectivity: false,
        oddsValidation: false,
        transformationPipeline: false,
        bigintSerialization: false
      },
      statistics: {
        totalMatches: 0,
        validMatches: 0,
        invalidMatches: 0,
        averageOdds: null
      },
      recommendations: []
    };

    try {
      // Test database connectivity
      const dbTest = await db.query('SELECT COUNT(*) FROM oracle.fixtures');
      report.checks.databaseConnectivity = true;
      report.statistics.totalMatches = parseInt(dbTest.rows[0].count);

      // Test odds validation
      const sampleMatch = await db.query(`
        SELECT * FROM oracle.fixtures 
        WHERE home_odds IS NOT NULL 
        LIMIT 1
      `);
      
      if (sampleMatch.rows.length > 0) {
        const validation = this.validator.validateDatabaseOdds(sampleMatch.rows[0]);
        report.checks.oddsValidation = validation.isValid;
      }

      // Test transformation pipeline
      if (sampleMatch.rows.length > 0) {
        try {
          const contractMatch = this.pipeline.transformDatabaseToContract(sampleMatch.rows[0]);
          const frontendMatch = this.pipeline.transformContractToFrontend(contractMatch);
          report.checks.transformationPipeline = true;
        } catch (error) {
          report.checks.transformationPipeline = false;
        }
      }

      // Test BigInt serialization
      try {
        const testBigInt = { id: BigInt(123), value: BigInt(456) };
        const serialized = this.pipeline.transformationRules.bigint.serializeForJson(testBigInt);
        JSON.stringify(serialized);
        report.checks.bigintSerialization = true;
      } catch (error) {
        report.checks.bigintSerialization = false;
      }

      // Determine overall health
      const allChecks = Object.values(report.checks);
      const passedChecks = allChecks.filter(check => check).length;
      
      if (passedChecks === allChecks.length) {
        report.dataFlowHealth = 'healthy';
        report.recommendations.push('All systems operational');
      } else if (passedChecks >= allChecks.length * 0.75) {
        report.dataFlowHealth = 'warning';
        report.recommendations.push('Some systems need attention');
      } else {
        report.dataFlowHealth = 'critical';
        report.recommendations.push('Multiple system failures detected');
      }

    } catch (error) {
      report.dataFlowHealth = 'critical';
      report.recommendations.push(`Health check failed: ${error.message}`);
    }

    return report;
  }
}

module.exports = StandardizedDataFlow;
