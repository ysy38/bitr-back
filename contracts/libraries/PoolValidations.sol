// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PoolValidations
 * @notice Library for pool validation logic
 * @dev Handles all validation checks for pool operations
 */
library PoolValidations {
    
    /**
     * @notice Validate pool creation parameters
     * @param odds Pool odds (must be > 100, representing 1.00+)
     * @param creatorStake Creator's stake
     * @param eventStartTime Event start timestamp
     * @param eventEndTime Event end timestamp
     * @param minStake Minimum stake requirement
     */
    function validatePoolCreation(
        uint16 odds,
        uint256 creatorStake,
        uint256 eventStartTime,
        uint256 eventEndTime,
        uint256 minStake
    ) internal view {
        require(odds > 100, "Odds must be > 1.00");
        require(creatorStake >= minStake, "Stake below minimum");
        require(eventStartTime > block.timestamp, "Event must be in future");
        require(eventEndTime > eventStartTime, "Invalid event times");
    }

    /**
     * @notice Validate bet placement
     * @param amount Bet amount
     * @param maxBettorStake Maximum allowed bettor stake
     * @param totalBettorStake Current total bettor stake
     * @param eventStartTime Event start time
     * @param bettingGracePeriod Grace period after event start
     * @param isSettled Whether pool is settled
     * @param minBetAmount Minimum bet amount
     */
    function validateBetPlacement(
        uint256 amount,
        uint256 maxBettorStake,
        uint256 totalBettorStake,
        uint256 eventStartTime,
        uint256 bettingGracePeriod,
        bool isSettled,
        uint256 minBetAmount
    ) internal view {
        require(amount >= minBetAmount, "Bet below minimum");
        require(!isSettled, "Pool already settled");
        require(
            block.timestamp <= eventStartTime + bettingGracePeriod,
            "Betting period ended"
        );
        require(
            totalBettorStake + amount <= maxBettorStake,
            "Pool full"
        );
    }

    /**
     * @notice Validate liquidity addition
     * @param amount Liquidity amount
     * @param eventStartTime Event start time
     * @param bettingGracePeriod Grace period
     * @param isSettled Whether pool is settled
     * @param minAmount Minimum liquidity amount
     */
    function validateLiquidityAddition(
        uint256 amount,
        uint256 eventStartTime,
        uint256 bettingGracePeriod,
        bool isSettled,
        uint256 minAmount
    ) internal view {
        require(amount >= minAmount, "Amount below minimum");
        require(!isSettled, "Pool already settled");
        require(
            block.timestamp <= eventStartTime + bettingGracePeriod,
            "LP period ended"
        );
    }

    /**
     * @notice Validate pool settlement
     * @param eventEndTime Event end time
     * @param isSettled Whether already settled
     */
    function validateSettlement(
        uint256 eventEndTime,
        bool isSettled
    ) internal view {
        require(!isSettled, "Already settled");
        require(block.timestamp >= eventEndTime, "Event not ended yet");
    }

    /**
     * @notice Validate claim request
     * @param isSettled Whether pool is settled
     * @param alreadyClaimed Whether user already claimed
     * @param hasStake Whether user has stake in pool
     */
    function validateClaim(
        bool isSettled,
        bool alreadyClaimed,
        bool hasStake
    ) internal pure {
        require(isSettled, "Not settled");
        require(!alreadyClaimed, "Already claimed");
        require(hasStake, "No stake");
    }

    /**
     * @notice Check if pool is eligible for refund
     * @param totalBettorStake Total bettor stakes
     * @param isSettled Whether pool is settled
     * @return eligible True if eligible for refund
     */
    function isEligibleForRefund(
        uint256 totalBettorStake,
        bool isSettled
    ) internal pure returns (bool eligible) {
        return !isSettled && totalBettorStake == 0;
    }

    /**
     * @notice Validate pool capacity before accepting bet
     * @param currentBettorStake Current bettor stake total
     * @param newBetAmount New bet amount
     * @param maxBettorStake Maximum allowed bettor stake
     * @return canAccept True if bet can be accepted
     * @return exceedsBy Amount by which bet exceeds capacity (0 if can accept)
     */
    function checkPoolCapacity(
        uint256 currentBettorStake,
        uint256 newBetAmount,
        uint256 maxBettorStake
    ) internal pure returns (bool canAccept, uint256 exceedsBy) {
        uint256 newTotal = currentBettorStake + newBetAmount;
        
        if (newTotal <= maxBettorStake) {
            return (true, 0);
        } else {
            exceedsBy = newTotal - maxBettorStake;
            return (false, exceedsBy);
        }
    }

    /**
     * @notice Validate user permissions for pool creation
     * @param canCreate Whether user can create pool
     * @param isPrivate Whether pool is private
     */
    function validateCreatorPermissions(
        bool canCreate,
        bool isPrivate
    ) internal pure {
        if (!isPrivate) {
            require(canCreate, "Insufficient reputation");
        }
    }

    /**
     * @notice Check if betting period is active
     * @param eventStartTime Event start time
     * @param eventEndTime Event end time
     * @param gracePeriod Grace period after start
     * @return isActive True if betting is allowed
     */
    function isBettingPeriodActive(
        uint256 eventStartTime,
        uint256 eventEndTime,
        uint256 gracePeriod
    ) internal view returns (bool isActive) {
        uint256 currentTime = block.timestamp;
        return currentTime <= eventStartTime + gracePeriod && currentTime < eventEndTime;
    }

    /**
     * @notice Validate LP provider limit
     * @param currentLPCount Current number of LP providers
     * @param maxLPProviders Maximum allowed LP providers
     */
    function validateLPLimit(
        uint256 currentLPCount,
        uint256 maxLPProviders
    ) internal pure {
        require(currentLPCount < maxLPProviders, "LP limit reached");
    }
}
