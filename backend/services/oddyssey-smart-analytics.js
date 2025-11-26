const db = require('../db/db');
const Web3Service = require('./web3-service');
const OdysseyAnalyticsCache = require('./oddyssey-analytics-cache');
const { ethers } = require('ethers');

/**
 * 🧠 Odyssey Smart Analytics Service
 * 
 * This service provides intelligent analytics and insights for Odyssey slips:
 * - Winning probability calculations
 * - Most played selections per match
 * - Smart predictions based on historical data
 * - Visual data for infographics
 * - Real-time cycle analytics
 */
class OdysseySmartAnalytics {
  constructor() {
    this.web3Service = new Web3Service();
    this.oddysseyContract = null;
    this.cache = new OdysseyAnalyticsCache();
  }

  async initialize() {
    if (!this.oddysseyContract) {
      await this.web3Service.initialize();
      this.oddysseyContract = await this.web3Service.getOddysseyContract();
    }
  }

  /**
   * 🎯 Get winning probability for a slip based on historical data
   */
  async getSlipWinningProbability(slipId, cycleId) {
    return this.cache.getSlipProbability(slipId, cycleId, async () => {
      try {
        await this.initialize();
        
        // Get slip data from contract
        const slipData = await this.oddysseyContract.getSlip(slipId);
        
        // Get historical accuracy for similar predictions
        const predictions = slipData.predictions;
        const probabilities = [];
        
        for (const prediction of predictions) {
          if (prediction.matchId && prediction.selection) {
            const matchProbability = await this.getMatchSelectionProbability(
              prediction.matchId, 
              prediction.selection, 
              prediction.betType
            );
            probabilities.push(matchProbability);
          }
        }
        
        // Calculate overall slip probability
        const overallProbability = probabilities.length > 0 
          ? probabilities.reduce((a, b) => a * b, 1) 
          : 0;
        
        return {
          slipId: Number(slipId),
          cycleId: Number(cycleId),
          predictions: predictions.map((pred, index) => ({
            matchId: pred.matchId,
            selection: pred.selection,
            betType: pred.betType,
            probability: probabilities[index] || 0
          })),
          overallProbability,
          confidence: this.calculateConfidence(probabilities),
          riskLevel: this.calculateRiskLevel(overallProbability)
        };
        
      } catch (error) {
        console.error('❌ Error calculating slip winning probability:', error);
        throw error;
      }
    });
  }

  /**
   * 📊 Get most played selections for a cycle
   */
  async getCycleMostPlayedSelections(cycleId) {
    return this.cache.getCycleSelections(cycleId, async () => {
      try {
        const result = await db.query(`
          SELECT 
            jsonb_array_elements(predictions) as prediction,
            COUNT(*) as play_count,
            COUNT(DISTINCT player_address) as unique_players
          FROM oracle.oddyssey_slips 
          WHERE cycle_id = $1
          GROUP BY jsonb_array_elements(predictions)
          ORDER BY play_count DESC
          LIMIT 20
        `, [cycleId]);

        return result.rows.map(row => ({
          prediction: row.prediction,
          playCount: Number(row.play_count),
          uniquePlayers: Number(row.unique_players),
          popularity: Number(row.play_count) / result.rows.length
        }));
        
      } catch (error) {
        console.error('❌ Error getting cycle selections:', error);
        throw error;
      }
    });
  }

  /**
   * 🎲 Get match-specific selection analytics
   */
  async getMatchSelectionAnalytics(matchId, cycleId) {
    return this.cache.getMatchAnalytics(matchId, cycleId, async () => {
      try {
        const result = await db.query(`
          SELECT 
            jsonb_array_elements(predictions) as prediction,
            COUNT(*) as selection_count,
            COUNT(DISTINCT player_address) as unique_players,
            AVG(CASE WHEN is_evaluated THEN correct_count ELSE NULL END) as avg_accuracy
          FROM oracle.oddyssey_slips 
          WHERE cycle_id = $1 
          AND jsonb_array_elements(predictions)->>'matchId' = $2
          GROUP BY jsonb_array_elements(predictions)
          ORDER BY selection_count DESC
        `, [cycleId, matchId.toString()]);

        return result.rows.map(row => ({
          prediction: row.prediction,
          selectionCount: Number(row.selection_count),
          uniquePlayers: Number(row.unique_players),
          avgAccuracy: Number(row.avg_accuracy) || 0,
          popularity: Number(row.selection_count) / result.rows.length
        }));
        
      } catch (error) {
        console.error('❌ Error getting match analytics:', error);
        throw error;
      }
    });
  }

  /**
   * 📈 Get comprehensive cycle analytics
   */
  async getCycleAnalytics(cycleId) {
    try {
      await this.initialize();
      
      // Get contract data - skip contract call for now, use database only
      let contractData = {
        exists: false,
        state: 0,
        endTime: '0',
        prizePool: '0',
        slipCount: 0,
        hasWinner: false
      };
      
      try {
        const cycleInfo = await this.oddysseyContract.getCycleStatus(cycleId);
        contractData = {
          exists: cycleInfo.exists || false,
          state: Number(cycleInfo.state) || 0,
          endTime: cycleInfo.endTime ? cycleInfo.endTime.toString() : '0',
          prizePool: cycleInfo.prizePool ? cycleInfo.prizePool.toString() : '0',
          slipCount: cycleInfo.cycleSlipCount ? Number(cycleInfo.cycleSlipCount) : 0,
          hasWinner: cycleInfo.hasWinner || false
        };
      } catch (error) {
        console.log('⚠️ getCycleStatus not available, using database data only');
      }
      
      // Get database analytics
      const dbAnalytics = await db.query(`
        SELECT 
          COUNT(*) as total_slips,
          COUNT(DISTINCT player_address) as unique_players,
          AVG(correct_count) as avg_correct_predictions,
          MAX(correct_count) as max_correct_predictions,
          COUNT(CASE WHEN is_evaluated THEN 1 END) as evaluated_slips,
          COUNT(CASE WHEN prize_claimed THEN 1 END) as prizes_claimed
        FROM oracle.oddyssey_slips 
        WHERE cycle_id = $1
      `, [cycleId]);

      // Get most popular selections
      const popularSelections = await this.getCycleMostPlayedSelections(cycleId);
      
      // Get match analytics
      const matchAnalytics = await this.getMatchAnalytics(cycleId);
      
      return {
        cycleId: Number(cycleId),
        contractData,
        databaseAnalytics: dbAnalytics.rows[0] || {},
        popularSelections: popularSelections.slice(0, 10),
        matchAnalytics,
        insights: this.generateInsights(dbAnalytics.rows[0], popularSelections)
      };
      
    } catch (error) {
      console.error('❌ Error getting cycle analytics:', error);
      throw error;
    }
  }

  /**
   * 🎯 Get user performance analytics
   */
  async getUserAnalytics(userAddress) {
    try {
      await this.initialize();
      
      // Get contract user data with proper BigInt handling
      let contractData = {
        totalSlips: '0',
        totalWins: '0',
        bestScore: '0',
        averageScore: '0',
        winRate: '0',
        currentStreak: '0',
        bestStreak: '0',
        lastActiveCycle: '0',
        reputation: '0',
        correctPredictions: '0'
      };
      
      try {
        const userData = await this.oddysseyContract.getUserData(userAddress);
        contractData = {
          totalSlips: userData.userStatsData.totalSlips ? userData.userStatsData.totalSlips.toString() : '0',
          totalWins: userData.userStatsData.totalWins ? userData.userStatsData.totalWins.toString() : '0',
          bestScore: userData.userStatsData.bestScore ? userData.userStatsData.bestScore.toString() : '0',
          averageScore: userData.userStatsData.averageScore ? userData.userStatsData.averageScore.toString() : '0',
          winRate: userData.userStatsData.winRate ? userData.userStatsData.winRate.toString() : '0',
          currentStreak: userData.userStatsData.currentStreak ? userData.userStatsData.currentStreak.toString() : '0',
          bestStreak: userData.userStatsData.bestStreak ? userData.userStatsData.bestStreak.toString() : '0',
          lastActiveCycle: userData.userStatsData.lastActiveCycle ? userData.userStatsData.lastActiveCycle.toString() : '0',
          reputation: userData.reputation ? userData.reputation.toString() : '0',
          correctPredictions: userData.correctPredictions ? userData.correctPredictions.toString() : '0'
        };
      } catch (error) {
        console.log('⚠️ getUserData not available, using database data only');
      }
      
      // Get database analytics
      const dbAnalytics = await db.query(`
        SELECT 
          COUNT(*) as total_slips,
          AVG(correct_count) as avg_accuracy,
          MAX(correct_count) as best_score,
          COUNT(CASE WHEN is_evaluated THEN 1 END) as evaluated_slips,
          COUNT(CASE WHEN prize_claimed THEN 1 END) as prizes_won,
          COUNT(DISTINCT cycle_id) as cycles_participated
        FROM oracle.oddyssey_slips 
        WHERE player_address = $1
      `, [userAddress]);

      // Get recent performance
      const recentPerformance = await db.query(`
        SELECT 
          cycle_id,
          correct_count,
          final_score,
          is_evaluated,
          prize_claimed
        FROM oracle.oddyssey_slips 
        WHERE player_address = $1
        ORDER BY placed_at DESC
        LIMIT 10
      `, [userAddress]);

      return {
        userAddress,
        contractData,
        databaseAnalytics: dbAnalytics.rows[0] || {},
        recentPerformance: recentPerformance.rows,
        insights: dbAnalytics.rows[0] ? this.generateUserInsights({ 
          userStatsData: contractData, 
          reputation: contractData.reputation, 
          correctPredictions: contractData.correctPredictions 
        }, dbAnalytics.rows[0]) : []
      };
      
    } catch (error) {
      console.error('❌ Error getting user analytics:', error);
      throw error;
    }
  }

  /**
   * 📊 Get match analytics for a cycle
   */
  async getMatchAnalytics(cycleId) {
    try {
      const result = await db.query(`
        SELECT 
          jsonb_array_elements(predictions)->>'matchId' as match_id,
          jsonb_array_elements(predictions)->>'homeTeam' as home_team,
          jsonb_array_elements(predictions)->>'awayTeam' as away_team,
          jsonb_array_elements(predictions)->>'leagueName' as league_name,
          jsonb_array_elements(predictions)->>'betType' as bet_type,
          jsonb_array_elements(predictions)->>'selection' as selection,
          COUNT(*) as selection_count,
          COUNT(DISTINCT player_address) as unique_players
        FROM oracle.oddyssey_slips 
        WHERE cycle_id = $1
        GROUP BY 
          jsonb_array_elements(predictions)->>'matchId',
          jsonb_array_elements(predictions)->>'homeTeam',
          jsonb_array_elements(predictions)->>'awayTeam',
          jsonb_array_elements(predictions)->>'leagueName',
          jsonb_array_elements(predictions)->>'betType',
          jsonb_array_elements(predictions)->>'selection'
        ORDER BY selection_count DESC
      `, [cycleId]);

      // Group by match
      const matchGroups = {};
      result.rows.forEach(row => {
        const matchId = row.match_id;
        if (!matchGroups[matchId]) {
          matchGroups[matchId] = {
            matchId,
            homeTeam: row.home_team,
            awayTeam: row.away_team,
            leagueName: row.league_name,
            selections: []
          };
        }
        matchGroups[matchId].selections.push({
          betType: row.bet_type,
          selection: row.selection,
          selectionCount: Number(row.selection_count),
          uniquePlayers: Number(row.unique_players)
        });
      });

      return Object.values(matchGroups);
      
    } catch (error) {
      console.error('❌ Error getting match analytics:', error);
      throw error;
    }
  }

  /**
   * 🎲 Calculate match selection probability based on historical data
   */
  async getMatchSelectionProbability(matchId, selection, betType) {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_selections,
          COUNT(CASE WHEN is_evaluated AND correct_count > 0 THEN 1 END) as successful_selections
        FROM oracle.oddyssey_slips 
        WHERE predictions @> $1
        AND is_evaluated = true
      `, [JSON.stringify([{
        matchId: Number(matchId),
        selection: selection,
        betType: betType
      }])]);

      const total = Number(result.rows[0]?.total_selections || 0);
      const successful = Number(result.rows[0]?.successful_selections || 0);
      
      return total > 0 ? successful / total : 0.5; // Default to 50% if no data
      
    } catch (error) {
      console.error('❌ Error calculating match probability:', error);
      return 0.5; // Default probability
    }
  }

  /**
   * 🧠 Generate insights from analytics data
   */
  generateInsights(dbAnalytics, popularSelections) {
    const insights = [];
    
    if (dbAnalytics) {
      const avgAccuracy = Number(dbAnalytics.avg_correct_predictions) || 0;
      const totalSlips = Number(dbAnalytics.total_slips) || 0;
      
      if (avgAccuracy > 3) {
        insights.push({
          type: 'success',
          message: `High accuracy cycle! Average ${avgAccuracy.toFixed(1)} correct predictions per slip`,
          confidence: 'high'
        });
      }
      
      if (totalSlips > 50) {
        insights.push({
          type: 'popularity',
          message: `Very popular cycle with ${totalSlips} slips placed`,
          confidence: 'high'
        });
      }
    }
    
    if (popularSelections.length > 0) {
      const topSelection = popularSelections[0];
      insights.push({
        type: 'trend',
        message: `Most popular selection: ${topSelection.prediction.selection} (${topSelection.playCount} times)`,
        confidence: 'medium'
      });
    }
    
    return insights;
  }

  /**
   * 🧠 Generate user insights
   */
  generateUserInsights(contractData, dbAnalytics) {
    const insights = [];
    
    const totalSlips = Number(contractData.userStatsData.totalSlips);
    const winRate = Number(contractData.userStatsData.winRate);
    const bestScore = Number(contractData.userStatsData.bestScore);
    
    if (winRate > 0.7) {
      insights.push({
        type: 'excellent',
        message: `Excellent win rate of ${(winRate * 100).toFixed(1)}%`,
        confidence: 'high'
      });
    }
    
    if (bestScore >= 8) {
      insights.push({
        type: 'achievement',
        message: `Outstanding performance! Best score: ${bestScore}/10`,
        confidence: 'high'
      });
    }
    
    if (totalSlips > 20) {
      insights.push({
        type: 'experience',
        message: `Experienced player with ${totalSlips} slips`,
        confidence: 'medium'
      });
    }
    
    return insights;
  }

  /**
   * 📊 Calculate confidence level
   */
  calculateConfidence(probabilities) {
    const avgProb = probabilities.reduce((a, b) => a + b, 0) / probabilities.length;
    const variance = probabilities.reduce((a, b) => a + Math.pow(b - avgProb, 2), 0) / probabilities.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev < 0.1) return 'high';
    if (stdDev < 0.2) return 'medium';
    return 'low';
  }

  /**
   * 🎯 Calculate risk level
   */
  calculateRiskLevel(probability) {
    if (probability > 0.7) return 'low';
    if (probability > 0.4) return 'medium';
    return 'high';
  }

  /**
   * 📈 Get platform-wide analytics
   */
  async getPlatformAnalytics() {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(DISTINCT cycle_id) as total_cycles,
          COUNT(*) as total_slips,
          COUNT(DISTINCT player_address) as unique_players,
          AVG(correct_count) as avg_accuracy,
          MAX(correct_count) as best_score,
          COUNT(CASE WHEN prize_claimed THEN 1 END) as total_prizes_claimed
        FROM oracle.oddyssey_slips
      `);

      const cycleStats = await db.query(`
        SELECT 
          cycle_id,
          COUNT(*) as slips_count,
          COUNT(DISTINCT player_address) as unique_players,
          AVG(correct_count) as avg_accuracy
        FROM oracle.oddyssey_slips
        GROUP BY cycle_id
        ORDER BY cycle_id DESC
        LIMIT 10
      `);

      return {
        platformStats: result.rows[0] || {},
        recentCycles: cycleStats.rows,
        insights: this.generatePlatformInsights(result.rows[0])
      };
      
    } catch (error) {
      console.error('❌ Error getting platform analytics:', error);
      throw error;
    }
  }

  /**
   * 🧠 Generate platform insights
   */
  generatePlatformInsights(platformStats) {
    const insights = [];
    
    const totalSlips = Number(platformStats.total_slips) || 0;
    const uniquePlayers = Number(platformStats.unique_players) || 0;
    const avgAccuracy = Number(platformStats.avg_accuracy) || 0;
    
    if (totalSlips > 1000) {
      insights.push({
        type: 'scale',
        message: `Large-scale platform with ${totalSlips} total slips`,
        confidence: 'high'
      });
    }
    
    if (uniquePlayers > 100) {
      insights.push({
        type: 'community',
        message: `Strong community with ${uniquePlayers} unique players`,
        confidence: 'high'
      });
    }
    
    if (avgAccuracy > 3) {
      insights.push({
        type: 'quality',
        message: `High-quality predictions with ${avgAccuracy.toFixed(1)} average accuracy`,
        confidence: 'medium'
      });
    }
    
    return insights;
  }
}

module.exports = OdysseySmartAnalytics;
