/**
 * Arbitration Helper Utility
 * Provides arbitration status and timing information for pools
 */

/**
 * Calculate arbitration status for a pool
 * @param {Object} pool - Pool object with arbitration_deadline
 * @returns {Object} Arbitration status information
 */
function getArbitrationStatus(pool) {
  if (!pool.arbitration_deadline) {
    return {
      hasArbitration: false,
      status: 'no_arbitration',
      message: 'No arbitration period'
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const arbitrationDeadline = Number(pool.arbitration_deadline);
  const timeRemaining = arbitrationDeadline - now;

  if (timeRemaining > 0) {
    const hours = Math.floor(timeRemaining / 3600);
    const minutes = Math.floor((timeRemaining % 3600) / 60);
    
    return {
      hasArbitration: true,
      status: 'waiting',
      arbitrationDeadline: arbitrationDeadline,
      timeRemainingSeconds: timeRemaining,
      timeRemainingFormatted: `${hours}h ${minutes}m`,
      message: `Arbitration period active - ${hours}h ${minutes}m remaining`,
      canRefund: false,
      canSettle: false
    };
  } else {
    return {
      hasArbitration: true,
      status: 'expired',
      arbitrationDeadline: arbitrationDeadline,
      timeRemainingSeconds: 0,
      timeRemainingFormatted: '0h 0m',
      message: 'Arbitration period expired - actions available',
      canRefund: true,
      canSettle: true
    };
  }
}

/**
 * Get settlement eligibility for a pool
 * @param {Object} pool - Pool object
 * @returns {Object} Settlement eligibility information
 */
function getSettlementEligibility(pool) {
  const now = Math.floor(Date.now() / 1000);
  const bettingEndTime = Number(pool.betting_end_time || 0);
  const eventEndTime = Number(pool.event_end_time || 0);
  const totalBettorStake = Number(pool.total_bettor_stake || 0);
  const isSettled = Boolean(pool.is_settled);

  // Check if pool is already settled
  if (isSettled) {
    return {
      eligible: false,
      reason: 'already_settled',
      message: 'Pool is already settled'
    };
  }

  // Check if betting period has ended
  if (now < bettingEndTime) {
    return {
      eligible: false,
      reason: 'betting_active',
      message: 'Betting period is still active'
    };
  }

  // Check if event has ended
  if (now < eventEndTime) {
    return {
      eligible: false,
      reason: 'event_ongoing',
      message: 'Event is still ongoing'
    };
  }

  // Check arbitration status
  const arbitrationStatus = getArbitrationStatus(pool);

  // If no bets, check refund eligibility
  if (totalBettorStake === 0) {
    if (!arbitrationStatus.canRefund) {
      return {
        eligible: false,
        reason: 'arbitration_waiting',
        message: `No bets placed - waiting for arbitration period (${arbitrationStatus.timeRemainingFormatted} remaining)`,
        arbitration: arbitrationStatus
      };
    } else {
      return {
        eligible: true,
        action: 'refund',
        reason: 'no_bets',
        message: 'Eligible for refund - no bets placed',
        arbitration: arbitrationStatus
      };
    }
  }

  // If has bets, check settlement eligibility
  if (!arbitrationStatus.canSettle) {
    return {
      eligible: false,
      reason: 'arbitration_waiting',
      message: `Has bets - waiting for arbitration period (${arbitrationStatus.timeRemainingFormatted} remaining)`,
      arbitration: arbitrationStatus
    };
  } else {
    return {
      eligible: true,
      action: 'settle',
      reason: 'has_bets',
      message: 'Eligible for settlement - has bets placed',
      arbitration: arbitrationStatus
    };
  }
}

/**
 * Add arbitration and settlement info to pool object
 * @param {Object} pool - Pool object
 * @returns {Object} Pool object with arbitration info added
 */
function enrichPoolWithArbitrationInfo(pool) {
  const arbitrationStatus = getArbitrationStatus(pool);
  const settlementEligibility = getSettlementEligibility(pool);

  return {
    ...pool,
    arbitration: arbitrationStatus,
    settlement: settlementEligibility
  };
}

/**
 * Add arbitration info to multiple pools
 * @param {Array} pools - Array of pool objects
 * @returns {Array} Array of pools with arbitration info
 */
function enrichPoolsWithArbitrationInfo(pools) {
  return pools.map(pool => enrichPoolWithArbitrationInfo(pool));
}

module.exports = {
  getArbitrationStatus,
  getSettlementEligibility,
  enrichPoolWithArbitrationInfo,
  enrichPoolsWithArbitrationInfo
};
