require('dotenv').config({ path: '../.env' });
const OddysseyResultsResolver = require('../services/oddyssey-results-resolver');

async function runResultsResolver() {
  console.log('🔍 Starting Oddyssey Results Resolver...');
  
  try {
    const resolver = new OddysseyResultsResolver();
    
    // Resolve all pending cycles
    const results = await resolver.resolveAllPendingCycles();
    
    if (results.length === 0) {
      console.log('ℹ️ No cycles needed resolution');
    } else {
      console.log(`✅ Processed ${results.length} cycles`);
      
      // Log results summary
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      console.log(`   • Successful: ${successful}`);
      console.log(`   • Failed: ${failed}`);
      
      if (failed > 0) {
        console.log('❌ Failed cycles:');
        results.filter(r => !r.success).forEach(r => {
          console.log(`   - Cycle ${r.cycleId}: ${r.error}`);
        });
      }
    }
    
    console.log('✅ Results resolver completed');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Results resolver failed:', error);
    process.exit(1);
  }
}

// Run the resolver
runResultsResolver();