const db = require('../db/db');
const { safeStringify, convertBigIntToStrings } = require('../utils/bigint-serializer');

/**
 * Portfolio Service
 * Manages user portfolio data including bets, positions, and performance metrics
 */

class PortfolioService {
  /**
   * Get user's portfolio with all active and historical positions
   * @param {string} userAddress - User's wallet address
   * @returns {Promise<Object>} Portfolio data
   */
  async getUserPortfolio(userAddress) {
    try {
      const normalizedAddress = userAddress.toLowerCase();

      // Get user's bets from pool participants
      const betsQuery = `
        SELECT 
          pp.id,
          pp.pool_id,
          pp.market_id,
          pp.participant_address,
          pp.position_type,
          pp.amount,
          pp.shares,
          pp.claimed,
          pp.payout_amount,
          pp.entry_price,
          pp.exit_price,
          pp.roi_percentage,
          pp.created_at,
          pp.transaction_hash,
          f.home_team,
          f.away_team,
          f.status as match_status,
          f.match_date,
          f.league_name as category
        FROM oracle.pool_participants pp
        LEFT JOIN oracle.fixtures f ON pp.market_id::text = f.id::text
        WHERE pp.participant_address = $1
        ORDER BY pp.created_at DESC
      `;

      const betsResult = await db.query(betsQuery, [normalizedAddress]);

      // Get user's Oddyssey slips
      const oddysseyQuery = `
        SELECT 
          slip_id,
          cycle_id,
          player_address,
          entry_fee,
          final_score,
          prize_amount,
          prize_claimed,
          placed_at,
          leaderboard_rank,
          predictions_data
        FROM oracle.oddyssey_slips
        WHERE player_address = $1
        ORDER BY placed_at DESC
      `;

      const oddysseyResult = await db.query(oddysseyQuery, [normalizedAddress]);

      // Calculate portfolio summary
      const summary = {
        totalInvested: 0,
        currentValue: 0,
        unrealizedPL: 0,
        realizedPL: 0,
        totalPositions: 0,
        activePositions: 0,
        wonPositions: 0,
        lostPositions: 0,
        pendingPositions: 0
      };

      // Process bets
      const processedBets = betsResult.rows.map(bet => {
        const amount = parseFloat(bet.amount) || 0;
        const payoutAmount = parseFloat(bet.payout_amount) || 0;
        const currentValue = bet.claimed ? payoutAmount : (parseFloat(bet.shares) || amount);
        const unrealizedPL = bet.claimed ? 0 : (currentValue - amount);
        const realizedPL = bet.claimed ? (payoutAmount - amount) : 0;

        // Determine status
        let status = 'active';
        if (bet.claimed) {
          status = payoutAmount > amount ? 'won' : 'lost';
        } else if (bet.match_status === 'FINISHED') {
          status = 'ended'; // Waiting to be claimed
        }

        // Update summary
        summary.totalInvested += amount;
        summary.currentValue += currentValue;
        summary.unrealizedPL += unrealizedPL;
        summary.realizedPL += realizedPL;
        summary.totalPositions += 1;

        if (status === 'active') summary.activePositions += 1;
        if (status === 'won') summary.wonPositions += 1;
        if (status === 'lost') summary.lostPositions += 1;
        if (status === 'ended') summary.pendingPositions += 1;

        return {
          id: bet.id,
          poolId: bet.pool_id,
          marketId: bet.market_id,
          type: 'pool_bet',
          title: `${bet.home_team} vs ${bet.away_team}`,
          outcome: bet.position_type,
          amount: bet.amount,
          shares: bet.shares,
          currentValue: currentValue.toString(),
          unrealizedPL: unrealizedPL.toString(),
          realizedPL: realizedPL.toString(),
          status,
          category: bet.category || 'Sports',
          createdAt: bet.created_at,
          endDate: bet.match_date,
          claimed: bet.claimed,
          payoutAmount: bet.payout_amount,
          transactionHash: bet.transaction_hash,
          token: 'STT' // Default to STT
        };
      });

      // Process Oddyssey slips
      const processedOddyssey = oddysseyResult.rows.map(slip => {
        const entryFee = parseFloat(slip.entry_fee) || 0;
        const prizeAmount = parseFloat(slip.prize_amount) || 0;
        const realizedPL = slip.prize_claimed ? (prizeAmount - entryFee) : 0;
        const unrealizedPL = !slip.prize_claimed && prizeAmount > 0 ? (prizeAmount - entryFee) : 0;

        // Determine status
        let status = 'pending';
        if (slip.final_score !== null) {
          if (slip.prize_amount > 0) {
            status = slip.prize_claimed ? 'won' : 'ended';
          } else {
            status = 'lost';
          }
        }

        // Update summary
        summary.totalInvested += entryFee;
        summary.currentValue += slip.prize_claimed ? prizeAmount : entryFee;
        summary.unrealizedPL += unrealizedPL;
        summary.realizedPL += realizedPL;
        summary.totalPositions += 1;

        if (status === 'pending') summary.activePositions += 1;
        if (status === 'won') summary.wonPositions += 1;
        if (status === 'lost') summary.lostPositions += 1;
        if (status === 'ended') summary.pendingPositions += 1;

        return {
          id: slip.slip_id,
          cycleId: slip.cycle_id,
          type: 'oddyssey',
          title: `Oddyssey Cycle ${slip.cycle_id}`,
          amount: slip.entry_fee,
          currentValue: slip.prize_claimed ? slip.prize_amount : slip.entry_fee,
          score: slip.final_score,
          rank: slip.leaderboard_rank,
          unrealizedPL: unrealizedPL.toString(),
          realizedPL: realizedPL.toString(),
          status,
          category: 'Oddyssey',
          createdAt: slip.placed_at,
          claimed: slip.prize_claimed,
          prizeAmount: slip.prize_amount,
          token: 'STT'
        };
      });

      // Combine all positions
      const allPositions = [...processedBets, ...processedOddyssey];

      return {
        summary: convertBigIntToStrings(summary),
        positions: allPositions,
        totalCount: allPositions.length
      };

    } catch (error) {
      console.error('❌ Error getting user portfolio:', error);
      throw error;
    }
  }

  /**
   * Get user's active positions only
   * @param {string} userAddress - User's wallet address
   * @returns {Promise<Array>} Active positions
   */
  async getActivePositions(userAddress) {
    try {
      const portfolio = await this.getUserPortfolio(userAddress);
      return portfolio.positions.filter(p => p.status === 'active');
    } catch (error) {
      console.error('❌ Error getting active positions:', error);
      throw error;
    }
  }

  /**
   * Get user's betting history
   * @param {string} userAddress - User's wallet address
   * @param {number} limit - Number of records to return
   * @returns {Promise<Array>} Betting history
   */
  async getBettingHistory(userAddress, limit = 50) {
    try {
      const portfolio = await this.getUserPortfolio(userAddress);
      return portfolio.positions
        .filter(p => ['won', 'lost', 'ended'].includes(p.status))
        .slice(0, limit);
    } catch (error) {
      console.error('❌ Error getting betting history:', error);
      throw error;
    }
  }
}

module.exports = new PortfolioService();

