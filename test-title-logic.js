#!/usr/bin/env node

// Test the title generation logic directly
function testTitleLogic() {
  console.log('🧪 Testing Title Generation Logic...\n');
  
  // Simulate the detectMarketTypeFromOutcome function
  const detectMarketTypeFromOutcome = (predictedOutcome, originalMarketType) => {
    if (!predictedOutcome) return originalMarketType || 'CUSTOM';
    
    const outcome = predictedOutcome.toLowerCase().trim();
    
    // Over/Under detection
    if (outcome.includes('over') || outcome.includes('under')) {
      return 'OVER_UNDER';
    }
    
    // 1X2 / Moneyline detection
    if (outcome === 'home' || outcome === 'away' || outcome === 'draw' ||
        outcome === '1' || outcome === '2' || outcome === 'x' ||
        outcome.includes('wins') || outcome.includes('win')) {
      return 'MONEYLINE';
    }
    
    // Fallback to original or CUSTOM
    return originalMarketType && originalMarketType !== '0' ? originalMarketType : 'CUSTOM';
  };
  
  // Simulate the getTitleTemplates function
  const getTitleTemplates = (marketType) => {
    const templates = {
      'OVER_UNDER': {
        'Over 2.5': 'Cruz Azul vs América will score over 2.5 goals!',
        'Under 2.5': 'Cruz Azul vs América will score under 2.5 goals!',
        'Over 1.5': 'Cruz Azul vs América will score over 1.5 goals!',
        'Under 1.5': 'Cruz Azul vs América will score under 1.5 goals!',
      },
      'MONEYLINE': {
        'Home': 'Cruz Azul will beat América!',
        'Away': 'América will beat Cruz Azul!',
        'Draw': 'Cruz Azul vs América will end in a draw!'
      },
      'CUSTOM': {
        'Over 0.5': 'Cruz Azul vs América will score over 0.5 goals!',
      }
    };
    
    return templates[marketType] || templates['CUSTOM'] || {};
  };
  
  // Test cases
  const testCases = [
    {
      name: 'Pool 0 (Original Issue)',
      predictedOutcome: 'Over 2.5',
      originalMarketType: '0',
      homeTeam: 'Cruz Azul',
      awayTeam: 'América'
    },
    {
      name: 'Moneyline Test',
      predictedOutcome: 'Home',
      originalMarketType: '1',
      homeTeam: 'Barcelona',
      awayTeam: 'Real Madrid'
    },
    {
      name: 'Under Test',
      predictedOutcome: 'Under 1.5',
      originalMarketType: '2',
      homeTeam: 'Liverpool',
      awayTeam: 'Arsenal'
    }
  ];
  
  testCases.forEach((testCase, index) => {
    console.log(`📊 Test ${index + 1}: ${testCase.name}`);
    console.log(`  Input: "${testCase.predictedOutcome}" (market_type: "${testCase.originalMarketType}")`);
    
    // Step 1: Detect market type
    const detectedMarketType = detectMarketTypeFromOutcome(testCase.predictedOutcome, testCase.originalMarketType);
    console.log(`  Detected Market Type: ${detectedMarketType}`);
    
    // Step 2: Get templates
    const templates = getTitleTemplates(detectedMarketType);
    console.log(`  Available Templates:`, Object.keys(templates));
    
    // Step 3: Find exact match
    const exactMatch = templates[testCase.predictedOutcome];
    if (exactMatch) {
      console.log(`  ✅ Exact Match Found: "${exactMatch}"`);
    } else {
      console.log(`  ❌ No Exact Match for "${testCase.predictedOutcome}"`);
      console.log(`  Available keys:`, Object.keys(templates));
    }
    
    console.log('');
  });
  
  console.log('🎉 Title logic test completed!');
}

testTitleLogic();
