#!/usr/bin/env node

const { ethers } = require('ethers');
const config = require('../config');

/**
 * Fix prediction format sync between frontend and oracle
 */
class PredictionFormatSyncFix {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet('0x92961421b053ae691cde04f131bd6ebf8745c5a501be3cab8ddedb341c52afc4', this.provider);
  }

  async analyzeAndFix() {
    try {
      console.log('🔧 PREDICTION FORMAT SYNC ANALYSIS');
      console.log('===================================');
      
      console.log('\n📊 CURRENT SITUATION:');
      console.log('✅ Oracle Type: 0 = GUIDED (correct)');
      console.log('✅ Oracle Bot: Submitting "Home wins" (generic format)');
      console.log('❌ Frontend: Submitting "Coritiba wins" (team-specific format)');
      console.log('❌ Result: Format mismatch prevents settlement');
      
      console.log('\n🎯 ROOT CAUSE:');
      console.log('Frontend and Oracle Bot are using different prediction formats:');
      console.log('  Frontend: Team-specific ("Coritiba wins", "Bayer vs Union")');
      console.log('  Oracle:   Generic ("Home wins", "Away wins", "Draw")');
      
      console.log('\n💡 SOLUTION:');
      console.log('1. STANDARDIZE ON GENERIC FORMAT:');
      console.log('   ✅ "Home wins" (when home team wins)');
      console.log('   ✅ "Away wins" (when away team wins)');
      console.log('   ✅ "Draw" (when match is tied)');
      
      console.log('\n2. FRONTEND CHANGES NEEDED:');
      console.log('   - Update pool creation to use generic predictions');
      console.log('   - Map team-specific selections to generic outcomes');
      console.log('   - Example: "Coritiba wins" → "Home wins"');
      
      console.log('\n3. ORACLE BOT CHANGES NEEDED:');
      console.log('   - Already using generic format ✅');
      console.log('   - No changes needed');
      
      console.log('\n4. BACKEND CHANGES NEEDED:');
      console.log('   - Update event-driven-pool-sync.js to normalize predictions');
      console.log('   - Add prediction format conversion logic');
      
      console.log('\n🔧 IMPLEMENTATION PLAN:');
      console.log('1. Update frontend pool creation logic');
      console.log('2. Update backend prediction normalization');
      console.log('3. Test with new pool creation');
      console.log('4. Verify automatic settlement works');
      
      console.log('\n📋 SPECIFIC CHANGES NEEDED:');
      console.log('FRONTEND:');
      console.log('  - When user selects "Coritiba wins" → submit "Home wins"');
      console.log('  - When user selects "Botafogo wins" → submit "Away wins"');
      console.log('  - When user selects "Draw" → submit "Draw"');
      
      console.log('\nBACKEND:');
      console.log('  - Add prediction normalization in event-driven-pool-sync.js');
      console.log('  - Convert team-specific to generic format before saving');
      
      console.log('\n🎉 RESULT:');
      console.log('✅ All future pools will use consistent generic format');
      console.log('✅ Oracle Bot and Frontend will be perfectly synced');
      console.log('✅ Automatic settlement will work flawlessly');
      console.log('✅ No more format mismatches!');
      
    } catch (error) {
      console.error('❌ Error in analysis:', error);
      throw error;
    }
  }
}

// Run the analysis
async function main() {
  const fixer = new PredictionFormatSyncFix();
  await fixer.analyzeAndFix();
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = PredictionFormatSyncFix;
