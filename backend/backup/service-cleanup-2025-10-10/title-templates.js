/**
 * Title Templates Service
 * Generates user-friendly titles for all market types
 */

class TitleTemplatesService {
  /**
   * Generate title for any market type
   */
  generateTitle(marketType, homeTeam, awayTeam, predictedOutcome, league = null) {
    if (!homeTeam || !awayTeam) {
      return predictedOutcome || `Prediction`;
    }

    const templates = {
      // Moneyline markets (1X2) - Professional prediction market style
      '1X2': {
        'Home wins': `${homeTeam} will beat ${awayTeam} at home!`,
        'Away wins': `${awayTeam} will beat ${homeTeam} away!`,
        'Draw': `${homeTeam} vs ${awayTeam} will end in a draw!`,
        '1': `${homeTeam} will beat ${awayTeam} at home!`,
        '2': `${awayTeam} will beat ${homeTeam} away!`,
        'X': `${homeTeam} vs ${awayTeam} will end in a draw!`,
        'Home': `${homeTeam} will beat ${awayTeam} at home!`,
        'Away': `${awayTeam} will beat ${homeTeam} away!`,
        'Draw': `${homeTeam} vs ${awayTeam} will end in a draw!`
      },

      // Over/Under markets - Professional prediction market style
      'OU05': {
        'Over 0.5 goals': `${homeTeam} vs ${awayTeam} will have over 0.5 goals!`,
        'Under 0.5 goals': `${homeTeam} vs ${awayTeam} will have under 0.5 goals!`,
        'Over': `${homeTeam} vs ${awayTeam} will have over 0.5 goals!`,
        'Under': `${homeTeam} vs ${awayTeam} will have under 0.5 goals!`
      },
      'OU15': {
        'Over 1.5 goals': `${homeTeam} vs ${awayTeam} will have over 1.5 goals!`,
        'Under 1.5 goals': `${homeTeam} vs ${awayTeam} will have under 1.5 goals!`,
        'Over': `${homeTeam} vs ${awayTeam} will have over 1.5 goals!`,
        'Under': `${homeTeam} vs ${awayTeam} will have under 1.5 goals!`
      },
      'OU25': {
        'Over 2.5 goals': `${homeTeam} vs ${awayTeam} will have over 2.5 goals!`,
        'Under 2.5 goals': `${homeTeam} vs ${awayTeam} will have under 2.5 goals!`,
        'Over': `${homeTeam} vs ${awayTeam} will have over 2.5 goals!`,
        'Under': `${homeTeam} vs ${awayTeam} will have under 2.5 goals!`
      },
      'OU35': {
        'Over 3.5 goals': `${homeTeam} vs ${awayTeam} will have over 3.5 goals!`,
        'Under 3.5 goals': `${homeTeam} vs ${awayTeam} will have under 3.5 goals!`,
        'Over': `${homeTeam} vs ${awayTeam} will have over 3.5 goals!`,
        'Under': `${homeTeam} vs ${awayTeam} will have under 3.5 goals!`
      },

      // Both Teams To Score - Professional prediction market style
      'BTTS': {
        'Both teams to score': `Both ${homeTeam} and ${awayTeam} will score!`,
        'Not both teams to score': `Both ${homeTeam} and ${awayTeam} will NOT score!`,
        'Yes': `Both ${homeTeam} and ${awayTeam} will score!`,
        'No': `Both ${homeTeam} and ${awayTeam} will NOT score!`
      },

      // Half-time markets - Professional prediction market style
      'HT_1X2': {
        'Home wins at half-time': `${homeTeam} will lead at half-time!`,
        'Away wins at half-time': `${awayTeam} will lead at half-time!`,
        'Draw at half-time': `${homeTeam} vs ${awayTeam} will be tied at half-time!`,
        'Home': `${homeTeam} will lead at half-time!`,
        'Away': `${awayTeam} will lead at half-time!`,
        'Draw': `${homeTeam} vs ${awayTeam} will be tied at half-time!`
      },
      'HT_OU05': {
        'Over 0.5 goals at half-time': `${homeTeam} vs ${awayTeam} will have over 0.5 goals at half-time!`,
        'Under 0.5 goals at half-time': `${homeTeam} vs ${awayTeam} will have under 0.5 goals at half-time!`,
        'Over': `${homeTeam} vs ${awayTeam} will have over 0.5 goals at half-time!`,
        'Under': `${homeTeam} vs ${awayTeam} will have under 0.5 goals at half-time!`
      },
      'HT_OU15': {
        'Over 1.5 goals at half-time': `${homeTeam} vs ${awayTeam} will have over 1.5 goals at half-time!`,
        'Under 1.5 goals at half-time': `${homeTeam} vs ${awayTeam} will have under 1.5 goals at half-time!`,
        'Over': `${homeTeam} vs ${awayTeam} will have over 1.5 goals at half-time!`,
        'Under': `${homeTeam} vs ${awayTeam} will have under 1.5 goals at half-time!`
      },

      // Double Chance - Professional prediction market style
      'DC': {
        'Home or Draw': `${homeTeam} will win or draw!`,
        'Away or Draw': `${awayTeam} will win or draw!`,
        'Home or Away': `${homeTeam} or ${awayTeam} will win!`,
        '1X': `${homeTeam} will win or draw!`,
        'X2': `${awayTeam} will win or draw!`,
        '12': `${homeTeam} or ${awayTeam} will win!`
      },

      // Correct Score - Professional prediction market style
      'CS': {
        '1-0': `${homeTeam} vs ${awayTeam} will end 1-0!`,
        '2-0': `${homeTeam} vs ${awayTeam} will end 2-0!`,
        '2-1': `${homeTeam} vs ${awayTeam} will end 2-1!`,
        '3-0': `${homeTeam} vs ${awayTeam} will end 3-0!`,
        '3-1': `${homeTeam} vs ${awayTeam} will end 3-1!`,
        '3-2': `${homeTeam} vs ${awayTeam} will end 3-2!`,
        '0-0': `${homeTeam} vs ${awayTeam} will end 0-0!`,
        '1-1': `${homeTeam} vs ${awayTeam} will end 1-1!`,
        '2-2': `${homeTeam} vs ${awayTeam} will end 2-2!`,
        '0-1': `${homeTeam} vs ${awayTeam} will end 0-1!`,
        '0-2': `${homeTeam} vs ${awayTeam} will end 0-2!`,
        '1-2': `${homeTeam} vs ${awayTeam} will end 1-2!`,
        '0-3': `${homeTeam} vs ${awayTeam} will end 0-3!`,
        '1-3': `${homeTeam} vs ${awayTeam} will end 1-3!`,
        '2-3': `${homeTeam} vs ${awayTeam} will end 2-3!`
      },

      // First Goalscorer - Professional prediction market style
      'FG': {
        'Home Team': `${homeTeam} will score first!`,
        'Away Team': `${awayTeam} will score first!`,
        'No Goals': `There will be no goals in ${homeTeam} vs ${awayTeam}!`,
        'Home': `${homeTeam} will score first!`,
        'Away': `${awayTeam} will score first!`,
        'None': `There will be no goals in ${homeTeam} vs ${awayTeam}!`
      },

      // Half Time/Full Time - Professional prediction market style
      'HTFT': {
        'Home/Home': `${homeTeam} will lead at half-time and win!`,
        'Home/Draw': `${homeTeam} will lead at half-time but draw!`,
        'Home/Away': `${homeTeam} will lead at half-time but lose!`,
        'Draw/Home': `${homeTeam} vs ${awayTeam} will be tied at half-time but ${homeTeam} will win!`,
        'Draw/Draw': `${homeTeam} vs ${awayTeam} will be tied at half-time and full-time!`,
        'Draw/Away': `${homeTeam} vs ${awayTeam} will be tied at half-time but ${awayTeam} will win!`,
        'Away/Home': `${awayTeam} will lead at half-time but lose!`,
        'Away/Draw': `${awayTeam} will lead at half-time but draw!`,
        'Away/Away': `${awayTeam} will lead at half-time and win!`
      },

      // Crypto markets - Professional prediction market style
      'CRYPTO_UP': {
        'Up': `${homeTeam} will go up!`,
        'Rise': `${homeTeam} will rise!`,
        'Increase': `${homeTeam} will increase!`
      },
      'CRYPTO_DOWN': {
        'Down': `${homeTeam} will go down!`,
        'Fall': `${homeTeam} will fall!`,
        'Decrease': `${homeTeam} will decrease!`
      },
      'CRYPTO_TARGET': {
        'Above': `${homeTeam} will reach above target!`,
        'Below': `${homeTeam} will stay below target!`
      }
    };

    // Get templates for this market type
    const marketTemplates = templates[marketType];
    if (!marketTemplates) {
      // Fallback for unknown market types - Professional prediction market style
      return `${homeTeam} vs ${awayTeam} will be ${predictedOutcome}!`;
    }

    // Find exact match for predicted outcome
    if (marketTemplates[predictedOutcome]) {
      return marketTemplates[predictedOutcome];
    }

    // Try partial matches
    for (const [key, template] of Object.entries(marketTemplates)) {
      if (predictedOutcome.toLowerCase().includes(key.toLowerCase()) || 
          key.toLowerCase().includes(predictedOutcome.toLowerCase())) {
        return template;
      }
    }

    // Fallback template - Professional prediction market style
    return `${homeTeam} vs ${awayTeam} will be ${predictedOutcome}!`;
  }

  /**
   * Generate short title (for mobile/compact display)
   */
  generateShortTitle(marketType, homeTeam, awayTeam, predictedOutcome) {
    if (!homeTeam || !awayTeam) {
      return predictedOutcome || `Prediction`;
    }

    const shortTemplates = {
      '1X2': {
        'Home wins': `${homeTeam} will win`,
        'Away wins': `${awayTeam} will win`,
        'Draw': `${homeTeam} vs ${awayTeam} draw`,
        '1': `${homeTeam} will win`,
        '2': `${awayTeam} will win`,
        'X': `${homeTeam} vs ${awayTeam} draw`,
        'Home': `${homeTeam} will win`,
        'Away': `${awayTeam} will win`
      },
      'OU25': {
        'Over 2.5 goals': `${homeTeam} vs ${awayTeam} over 2.5`,
        'Under 2.5 goals': `${homeTeam} vs ${awayTeam} under 2.5`,
        'Over': `${homeTeam} vs ${awayTeam} over 2.5`,
        'Under': `${homeTeam} vs ${awayTeam} under 2.5`
      },
      'BTTS': {
        'Both teams to score': `${homeTeam} vs ${awayTeam} both score`,
        'Not both teams to score': `${homeTeam} vs ${awayTeam} not both score`,
        'Yes': `${homeTeam} vs ${awayTeam} both score`,
        'No': `${homeTeam} vs ${awayTeam} not both score`
      }
    };

    const marketTemplates = shortTemplates[marketType];
    if (marketTemplates && marketTemplates[predictedOutcome]) {
      return marketTemplates[predictedOutcome];
    }

    return `${homeTeam} vs ${awayTeam} ${predictedOutcome}`;
  }

  /**
   * Generate description for market type
   */
  generateDescription(marketType, homeTeam, awayTeam, league = null) {
    const descriptions = {
      '1X2': `Match winner after 90 minutes`,
      'OU25': `Total goals scored in the match`,
      'OU35': `Total goals scored in the match`,
      'BTTS': `Both teams score at least one goal`,
      'HT_1X2': `Leading team at half-time`,
      'HT_OU15': `Goals scored in first half`,
      'DC': `Two possible outcomes combined`,
      'CS': `Exact final score`,
      'FG': `First team to score`,
      'HTFT': `Half-time and full-time result combination`
    };

    const baseDescription = descriptions[marketType] || `Prediction market`;
    
    if (league) {
      return `${baseDescription} - ${league}`;
    }
    
    return baseDescription;
  }

  /**
   * Generate market type display name
   */
  getMarketTypeDisplayName(marketType) {
    const displayNames = {
      '1X2': 'Match Result',
      'OU25': 'Over/Under 2.5 Goals',
      'OU35': 'Over/Under 3.5 Goals',
      'BTTS': 'Both Teams To Score',
      'HT_1X2': 'Half-Time Result',
      'HT_OU15': 'Half-Time Over/Under 1.5',
      'DC': 'Double Chance',
      'CS': 'Correct Score',
      'FG': 'First Goalscorer',
      'HTFT': 'Half-Time/Full-Time',
      'CRYPTO_UP': 'Crypto Price Up',
      'CRYPTO_DOWN': 'Crypto Price Down',
      'CRYPTO_TARGET': 'Crypto Price Target'
    };

    return displayNames[marketType] || marketType;
  }

  /**
   * Generate crypto title from market ID
   */
  generateCryptoTitle(marketId, predictedOutcome) {
    try {
      // Parse marketId format: crypto-${coinId}-${targetPrice}-${direction}-${timeframe}
      const parts = marketId.split('-');
      if (parts.length >= 5 && parts[0] === 'crypto') {
        const coinId = parts[1].toUpperCase();
        const targetPrice = parts[2];
        const direction = parts[3];
        const timeframe = parts[4];

        if (direction === 'up') {
          return `${coinId} will go up in ${timeframe}!`;
        } else if (direction === 'down') {
          return `${coinId} will go down in ${timeframe}!`;
        } else if (direction === 'above') {
          return `${coinId} will reach above $${targetPrice} in ${timeframe}!`;
        } else if (direction === 'below') {
          return `${coinId} will stay below $${targetPrice} in ${timeframe}!`;
        }
      }
    } catch (error) {
      console.warn('Failed to parse crypto marketId:', error);
    }

    // Fallback
    return `Crypto prediction: ${predictedOutcome}!`;
  }

  /**
   * Generate event name from market data
   */
  generateEventName(marketType, homeTeam, awayTeam, marketId, league = null) {
    if (marketType && marketType.startsWith('CRYPTO')) {
      return this.generateCryptoEventName(marketId);
    } else if (homeTeam && awayTeam) {
      return `${homeTeam} vs ${awayTeam}`;
    } else if (league) {
      return `${league} Match`;
    }
    return 'Prediction Market';
  }

  /**
   * Generate crypto event name from market ID
   */
  generateCryptoEventName(marketId) {
    try {
      const parts = marketId.split('-');
      if (parts.length >= 5 && parts[0] === 'crypto') {
        const coinId = parts[1].toUpperCase();
        const targetPrice = parts[2];
        const direction = parts[3];
        const timeframe = parts[4];

        if (direction === 'up') {
          return `${coinId} Up`;
        } else if (direction === 'down') {
          return `${coinId} Down`;
        } else if (direction === 'above') {
          return `${coinId} Above $${targetPrice}`;
        } else if (direction === 'below') {
          return `${coinId} Below $${targetPrice}`;
        }
      }
    } catch (error) {
      console.warn('Failed to parse crypto marketId for event name:', error);
    }

    return 'Crypto Prediction';
  }
}

module.exports = TitleTemplatesService;
