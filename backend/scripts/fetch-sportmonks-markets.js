#!/usr/bin/env node

/**
 * Fetch SportMonks Market IDs
 * Creates a comprehensive markdown file with all available markets
 */

const SportMonksService = require('../services/sportmonks');
const fs = require('fs');
const path = require('path');

async function fetchSportMonksMarkets() {
  console.log('🔍 Fetching SportMonks Market IDs...');
  
  try {
    // Initialize SportMonks service
    const sportmonksService = new SportMonksService();
    
    // Fetch all markets from SportMonks API (with pagination)
    let allMarkets = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const response = await sportmonksService.axios.get('https://api.sportmonks.com/v3/odds/markets', {
        params: {
          api_token: sportmonksService.apiToken,
          page: page,
          per_page: 25
        }
      });
      
      const markets = response.data.data;
      const pagination = response.data.pagination;
      
      allMarkets = allMarkets.concat(markets);
      console.log(`📊 Page ${page}: ${markets.length} markets (Total: ${allMarkets.length})`);
      
      hasMore = pagination?.has_more || false;
      page++;
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    
    const markets = allMarkets;
    console.log(`📊 Found ${markets.length} total markets from SportMonks API`);
    
    // Sort markets by ID
    markets.sort((a, b) => parseInt(a.id) - parseInt(b.id));
    
    // Create markdown content
    let markdown = `# SportMonks Market IDs Reference

> Generated on: ${new Date().toISOString()}
> Total Markets: ${markets.length}

This document contains all available market IDs from the SportMonks API for football odds.

## Market Categories

`;

    // Group markets by category (based on name patterns)
    const categories = {
      'Full Time Results': [],
      'Half Time Results': [],
      'Over/Under Goals': [],
      'Both Teams to Score': [],
      'Correct Score': [],
      'Double Chance': [],
      'Asian Handicap': [],
      'Team to Score First': [],
      'Total Goals Exact': [],
      'Corners': [],
      'Cards': [],
      'Other': []
    };
    
    markets.forEach(market => {
      const name = market.name.toLowerCase();
      const devName = market.developer_name?.toLowerCase() || '';
      
      if (name.includes('full time') || name.includes('match result') || name.includes('1x2')) {
        categories['Full Time Results'].push(market);
      } else if (name.includes('half time') || name.includes('ht')) {
        categories['Half Time Results'].push(market);
      } else if (name.includes('over') || name.includes('under') || name.includes('total goals')) {
        categories['Over/Under Goals'].push(market);
      } else if (name.includes('both teams') || name.includes('btts')) {
        categories['Both Teams to Score'].push(market);
      } else if (name.includes('correct score') || name.includes('exact score')) {
        categories['Correct Score'].push(market);
      } else if (name.includes('double chance')) {
        categories['Double Chance'].push(market);
      } else if (name.includes('asian handicap') || name.includes('handicap')) {
        categories['Asian Handicap'].push(market);
      } else if (name.includes('team to score') || name.includes('first goal')) {
        categories['Team to Score First'].push(market);
      } else if (name.includes('total goals exact') || name.includes('exact goals')) {
        categories['Total Goals Exact'].push(market);
      } else if (name.includes('corner')) {
        categories['Corners'].push(market);
      } else if (name.includes('card') || name.includes('booking')) {
        categories['Cards'].push(market);
      } else {
        categories['Other'].push(market);
      }
    });
    
    // Generate markdown for each category
    Object.entries(categories).forEach(([categoryName, categoryMarkets]) => {
      if (categoryMarkets.length > 0) {
        markdown += `### ${categoryName}\n\n`;
        markdown += `| ID | Name | Developer Name | Has Winning Calculations |\n`;
        markdown += `|----|------|----------------|--------------------------|\n`;
        
        categoryMarkets.forEach(market => {
          markdown += `| ${market.id} | ${market.name} | ${market.developer_name || 'N/A'} | ${market.has_winning_calculations ? '✅' : '❌'} |\n`;
        });
        
        markdown += '\n';
      }
    });
    
    // Add complete list
    markdown += `## Complete Market List\n\n`;
    markdown += `| ID | Name | Developer Name | Has Winning Calculations |\n`;
    markdown += `|----|------|----------------|--------------------------|\n`;
    
    markets.forEach(market => {
      markdown += `| ${market.id} | ${market.name} | ${market.developer_name || 'N/A'} | ${market.has_winning_calculations ? '✅' : '❌'} |\n`;
    });
    
    // Add our current implementation status
    markdown += `\n## Current Implementation Status\n\n`;
    markdown += `### ✅ Implemented Markets\n\n`;
    markdown += `| Market ID | Name | Status | Notes |\n`;
    markdown += `|-----------|------|--------|-------|\n`;
    markdown += `| 1 | Full Time 1X2 | ✅ Working | Home/Draw/Away |\n`;
    markdown += `| 14 | Both Teams to Score | ✅ Working | Yes/No |\n`;
    markdown += `| 16 | Team to Score First | ✅ Working | Yes/No |\n`;
    markdown += `| 18 | Double Chance | ✅ Working | Team-specific labels |\n`;
    markdown += `| 28 | Half Time Over/Under | ✅ Working | 0.5, 1.5 goals |\n`;
    markdown += `| 31 | Half Time 1X2 | ✅ Working | Home/Draw/Away |\n`;
    markdown += `| 32 | Half Time Result | ✅ Working | 1/2/Tie |\n`;
    markdown += `| 80 | Over/Under Goals | ✅ Working | 1.5, 2.5, 3.5 goals |\n`;
    
    markdown += `\n### ❌ Not Available Markets\n\n`;
    markdown += `| Market ID | Name | Status | Notes |\n`;
    markdown += `|-----------|------|--------|-------|\n`;
    markdown += `| 5 | Correct Score | ❌ Not Available | Not found in API response |\n`;
    markdown += `| 9 | Total Goals Exact | ❌ Not Available | Not found in API response |\n`;
    
    markdown += `\n### 🔧 Markets to Investigate\n\n`;
    markdown += `| Market ID | Name | Status | Notes |\n`;
    markdown += `|-----------|------|--------|-------|\n`;
    markdown += `| 7 | Asian Handicap | ⚠️ Misidentified | Actually Over/Under, not handicap |\n`;
    
    // Save to file
    const outputPath = path.join(__dirname, '../../SPORTMONKS_MARKETS_REFERENCE.md');
    fs.writeFileSync(outputPath, markdown);
    
    console.log(`✅ Market reference saved to: ${outputPath}`);
    console.log(`📊 Total markets documented: ${markets.length}`);
    
    // Show summary
    console.log('\n📋 Market Summary:');
    Object.entries(categories).forEach(([categoryName, categoryMarkets]) => {
      if (categoryMarkets.length > 0) {
        console.log(`   ${categoryName}: ${categoryMarkets.length} markets`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching SportMonks markets:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  fetchSportMonksMarkets().then(() => {
    console.log('✅ Market fetch completed');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Market fetch failed:', error);
    process.exit(1);
  });
}

module.exports = fetchSportMonksMarkets;
