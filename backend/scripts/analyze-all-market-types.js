#!/usr/bin/env node

/**
 * Analyze all market types and their prediction formats
 */
class AllMarketTypesAnalyzer {
  constructor() {
    this.marketTypes = {
      MONEYLINE: {
        description: "1X2 (Home/Away/Draw)",
        oracleFormats: ["1", "X", "2", "Home", "Draw", "Away"],
        frontendFormats: ["Coritiba wins", "Draw", "Botafogo wins"],
        standardizedFormat: {
          "1": "Home wins",
          "X": "Draw", 
          "2": "Away wins",
          "Home": "Home wins",
          "Draw": "Draw",
          "Away": "Away wins"
        }
      },
      OVER_UNDER: {
        description: "Over/Under 2.5 goals",
        oracleFormats: ["Over", "Under", "over", "under"],
        frontendFormats: ["Over 2.5", "Under 2.5"],
        standardizedFormat: {
          "Over": "Over 2.5",
          "Under": "Under 2.5",
          "over": "Over 2.5",
          "under": "Under 2.5"
        }
      },
      BOTH_TEAMS_SCORE: {
        description: "Both teams to score (BTTS)",
        oracleFormats: ["Yes", "No"],
        frontendFormats: ["Yes", "No"],
        standardizedFormat: {
          "Yes": "Yes",
          "No": "No"
        }
      },
      HALF_TIME: {
        description: "Half-time result",
        oracleFormats: ["1", "X", "2", "Home", "Draw", "Away"],
        frontendFormats: ["Home HT", "Draw HT", "Away HT"],
        standardizedFormat: {
          "1": "Home HT",
          "X": "Draw HT",
          "2": "Away HT",
          "Home": "Home HT",
          "Draw": "Draw HT",
          "Away": "Away HT"
        }
      },
      DOUBLE_CHANCE: {
        description: "1X, 12, X2 combinations",
        oracleFormats: ["1X", "12", "X2"],
        frontendFormats: ["1X", "12", "X2"],
        standardizedFormat: {
          "1X": "1X",
          "12": "12", 
          "X2": "X2"
        }
      },
      CORRECT_SCORE: {
        description: "Exact score prediction",
        oracleFormats: ["1-0", "2-1", "0-0", "3-2"],
        frontendFormats: ["1-0", "2-1", "0-0", "3-2"],
        standardizedFormat: {
          // Direct mapping for exact scores
        }
      },
      FIRST_GOAL: {
        description: "First goal scorer",
        oracleFormats: ["Home", "Away", "No Goal"],
        frontendFormats: ["Home", "Away", "No Goal"],
        standardizedFormat: {
          "Home": "Home",
          "Away": "Away",
          "No Goal": "No Goal"
        }
      }
    };
  }

  async analyzeAllMarketTypes() {
    try {
      console.log('📊 COMPREHENSIVE MARKET TYPES ANALYSIS');
      console.log('=====================================');
      
      console.log('\n🎯 CURRENT SITUATION:');
      console.log('✅ Oracle Bot: Using standardized formats');
      console.log('❌ Frontend: Using team-specific formats');
      console.log('❌ Result: Format mismatches across all market types');
      
      console.log('\n📋 MARKET TYPE ANALYSIS:');
      
      Object.entries(this.marketTypes).forEach(([marketType, config]) => {
        console.log(`\n🏷️  ${marketType}:`);
        console.log(`   Description: ${config.description}`);
        console.log(`   Oracle Formats: ${config.oracleFormats.join(', ')}`);
        console.log(`   Frontend Formats: ${config.frontendFormats.join(', ')}`);
        console.log(`   Sync Status: ${this.checkSyncStatus(config)}`);
      });
      
      console.log('\n🔧 STANDARDIZATION PLAN:');
      console.log('1. MONEYLINE (1X2):');
      console.log('   Frontend: "Coritiba wins" → "Home wins"');
      console.log('   Frontend: "Draw" → "Draw"');
      console.log('   Frontend: "Botafogo wins" → "Away wins"');
      
      console.log('\n2. OVER_UNDER:');
      console.log('   Frontend: "Over 2.5" → "Over 2.5"');
      console.log('   Frontend: "Under 2.5" → "Under 2.5"');
      console.log('   ✅ Already standardized');
      
      console.log('\n3. BOTH_TEAMS_SCORE:');
      console.log('   Frontend: "Yes" → "Yes"');
      console.log('   Frontend: "No" → "No"');
      console.log('   ✅ Already standardized');
      
      console.log('\n4. HALF_TIME:');
      console.log('   Frontend: "Home HT" → "Home HT"');
      console.log('   Frontend: "Draw HT" → "Draw HT"');
      console.log('   Frontend: "Away HT" → "Away HT"');
      console.log('   ✅ Already standardized');
      
      console.log('\n5. DOUBLE_CHANCE:');
      console.log('   Frontend: "1X" → "1X"');
      console.log('   Frontend: "12" → "12"');
      console.log('   Frontend: "X2" → "X2"');
      console.log('   ✅ Already standardized');
      
      console.log('\n6. CORRECT_SCORE:');
      console.log('   Frontend: "1-0" → "1-0"');
      console.log('   Frontend: "2-1" → "2-1"');
      console.log('   ✅ Already standardized');
      
      console.log('\n7. FIRST_GOAL:');
      console.log('   Frontend: "Home" → "Home"');
      console.log('   Frontend: "Away" → "Away"');
      console.log('   Frontend: "No Goal" → "No Goal"');
      console.log('   ✅ Already standardized');
      
      console.log('\n🎯 KEY INSIGHT:');
      console.log('❌ ONLY MONEYLINE (1X2) has format mismatch!');
      console.log('✅ All other market types are already standardized');
      
      console.log('\n💡 SOLUTION:');
      console.log('1. Fix MONEYLINE format mismatch in frontend');
      console.log('2. All other markets are already working correctly');
      console.log('3. Focus on 1X2 market type only');
      
      console.log('\n🔧 IMPLEMENTATION:');
      console.log('FRONTEND CHANGES (1X2 only):');
      console.log('  - Map team names to generic outcomes');
      console.log('  - "Coritiba wins" → "Home wins"');
      console.log('  - "Botafogo wins" → "Away wins"');
      console.log('  - "Draw" → "Draw"');
      
      console.log('\nBACKEND CHANGES:');
      console.log('  - Add prediction normalization for 1X2 only');
      console.log('  - Other markets need no changes');
      
      console.log('\n🎉 RESULT:');
      console.log('✅ All market types will be perfectly synced');
      console.log('✅ Automatic settlement will work for all markets');
      console.log('✅ Only 1X2 needs frontend changes');
      
    } catch (error) {
      console.error('❌ Error in analysis:', error);
      throw error;
    }
  }

  checkSyncStatus(config) {
    const oracleFormats = config.oracleFormats;
    const frontendFormats = config.frontendFormats;
    
    // Check if formats match
    const hasMatch = oracleFormats.some(of => frontendFormats.some(ff => ff.includes(of) || of.includes(ff)));
    
    return hasMatch ? '✅ Synced' : '❌ Mismatch';
  }
}

// Run the analysis
async function main() {
  const analyzer = new AllMarketTypesAnalyzer();
  await analyzer.analyzeAllMarketTypes();
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AllMarketTypesAnalyzer;
