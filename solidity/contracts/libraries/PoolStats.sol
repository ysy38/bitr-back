// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PoolStats
 * @notice Library for pool statistics, analytics, and view functions
 * @dev Reduces main contract size by extracting read-only operations
 */
library PoolStats {
    
    /**
     * @notice Get pool statistics for display
     * @param totalCreatorSideStake Total creator + LP stakes
     * @param totalBettorStake Total bettor stakes
     * @param maxBettorStake Maximum allowed bettor stake
     * @param bettingEndTime Betting end timestamp
     * @return totalPoolSize Total size of the pool
     * @return fillPercentage How full the pool is (basis points)
     * @return isFullyFilled Whether pool is completely filled
     * @return timeUntilBettingEnd Seconds until betting closes
     */
    function calculatePoolStats(
        uint256 totalCreatorSideStake,
        uint256 totalBettorStake,
        uint256 maxBettorStake,
        uint256 /* eventStartTime */,
        uint256 bettingEndTime
    ) internal view returns (
        uint256 totalPoolSize,
        uint256 fillPercentage,
        bool isFullyFilled,
        uint256 timeUntilBettingEnd
    ) {
        totalPoolSize = totalCreatorSideStake + maxBettorStake;
        
        if (totalPoolSize > 0) {
            fillPercentage = ((totalCreatorSideStake + totalBettorStake) * 10000) / totalPoolSize;
        } else {
            fillPercentage = 0;
        }
        
        isFullyFilled = totalBettorStake >= maxBettorStake;
        
        if (block.timestamp < bettingEndTime) {
            timeUntilBettingEnd = bettingEndTime - block.timestamp;
        } else {
            timeUntilBettingEnd = 0;
        }
    }

    /**
     * @notice Check if pool is eligible for refund
     * @param totalBettorStake Total bettor stakes
     * @param flags Pool flags byte
     * @return eligible True if eligible for refund
     */
    function checkRefundEligibility(
        uint256 totalBettorStake,
        uint8 flags
    ) internal pure returns (bool eligible) {
        bool isSettled = (flags & 0x01) != 0;
        return !isSettled && totalBettorStake == 0;
    }

    /**
     * @notice Get adjusted fee rate based on user's BITR balance
     * @param userBalance User's BITR token balance
     * @param baseFee Base platform fee
     * @return adjustedFee Fee rate adjusted for user's holdings
     */
    function getAdjustedFeeRate(
        uint256 userBalance,
        uint256 baseFee
    ) internal pure returns (uint256 adjustedFee) {
        if (userBalance >= 50000 * 1e18) return baseFee * 50 / 100;  // 50% discount
        if (userBalance >= 20000 * 1e18) return baseFee * 70 / 100;  // 30% discount
        if (userBalance >= 5000 * 1e18) return baseFee * 80 / 100;   // 20% discount
        if (userBalance >= 1000 * 1e18) return baseFee * 90 / 100;   // 10% discount
        return baseFee;
    }

    /**
     * @notice Calculate global statistics
     * @param totalPools Total number of pools created
     * @param totalVolumeBITR Total BITR volume
     * @param totalVolumeSTT Total STT volume
     * @return averagePoolSize Average pool size across all pools
     */
    function calculateGlobalStats(
        uint256 totalPools,
        uint256 totalVolumeBITR,
        uint256 totalVolumeSTT
    ) internal pure returns (uint256 averagePoolSize) {
        if (totalPools == 0) return 0;
        uint256 totalVolume = totalVolumeBITR + totalVolumeSTT;
        averagePoolSize = totalVolume / totalPools;
    }

    /**
     * @notice Check if pool is settled based on flags
     * @param flags Pool flags byte
     * @return settled True if pool is settled
     */
    function isPoolSettled(uint8 flags) internal pure returns (bool settled) {
        return (flags & 0x01) != 0;
    }

    /**
     * @notice Check if pool uses BITR token
     * @param flags Pool flags byte
     * @return usesBitr True if pool uses BITR
     */
    function poolUsesBitr(uint8 flags) internal pure returns (bool usesBitr) {
        return (flags & 0x02) != 0;
    }

    /**
     * @notice Check if pool is private
     * @param flags Pool flags byte
     * @return isPrivate True if pool is private
     */
    function isPoolPrivate(uint8 flags) internal pure returns (bool isPrivate) {
        return (flags & 0x04) != 0;
    }

    /**
     * @notice Get pool capacity information
     * @param totalBettorStake Current bettor stakes
     * @param maxBettorStake Maximum bettor capacity
     * @return remainingCapacity Available betting capacity
     * @return capacityUsedBps Capacity used in basis points
     */
    function getPoolCapacity(
        uint256 totalBettorStake,
        uint256 maxBettorStake
    ) internal pure returns (
        uint256 remainingCapacity,
        uint256 capacityUsedBps
    ) {
        if (maxBettorStake == 0) return (0, 0);
        
        remainingCapacity = maxBettorStake > totalBettorStake ? 
            maxBettorStake - totalBettorStake : 0;
        
        capacityUsedBps = (totalBettorStake * 10000) / maxBettorStake;
    }

    /**
     * @notice Calculate time-based pool metrics
     * @param eventStartTime Event start timestamp
     * @param eventEndTime Event end timestamp
     * @param bettingEndTime Betting end timestamp
     * @return hasStarted True if event has started
     * @return hasEnded True if event has ended
     * @return bettingOpen True if betting is still open
     * @return timeUntilStart Seconds until event starts
     */
    function getPoolTimingInfo(
        uint256 eventStartTime,
        uint256 eventEndTime,
        uint256 bettingEndTime
    ) internal view returns (
        bool hasStarted,
        bool hasEnded,
        bool bettingOpen,
        uint256 timeUntilStart
    ) {
        uint256 currentTime = block.timestamp;
        
        hasStarted = currentTime >= eventStartTime;
        hasEnded = currentTime >= eventEndTime;
        bettingOpen = currentTime < bettingEndTime;
        
        if (currentTime < eventStartTime) {
            timeUntilStart = eventStartTime - currentTime;
        } else {
            timeUntilStart = 0;
        }
    }

    /**
     * @notice Validate pool existence
     * @param poolId Pool ID to check
     * @param poolCount Total number of pools
     * @return exists True if pool exists
     */
    function validatePoolExists(
        uint256 poolId,
        uint256 poolCount
    ) internal pure returns (bool exists) {
        return poolId < poolCount;
    }

    /**
     * @notice Calculate LP provider metrics
     * @param totalCreatorSideStake Total creator + LP stakes
     * @param creatorStake Creator's initial stake
     * @return totalLPStake Total LP contributions
     * @return lpPercentage LP percentage of creator side (bps)
     */
    function getLPMetrics(
        uint256 totalCreatorSideStake,
        uint256 creatorStake
    ) internal pure returns (
        uint256 totalLPStake,
        uint256 lpPercentage
    ) {
        totalLPStake = totalCreatorSideStake > creatorStake ? 
            totalCreatorSideStake - creatorStake : 0;
        
        if (totalCreatorSideStake > 0) {
            lpPercentage = (totalLPStake * 10000) / totalCreatorSideStake;
        } else {
            lpPercentage = 0;
        }
    }

    /**
     * @notice Calculate pool popularity score based on activity
     * @param bettorCount Number of bettors
     * @param lpCount Number of LP providers
     * @param totalVolume Total pool volume
     * @param timeSinceCreation Seconds since pool creation
     * @return popularityScore Popularity score (0-10000)
     */
    function calculatePoolPopularity(
        uint256 bettorCount,
        uint256 lpCount,
        uint256 totalVolume,
        uint256 timeSinceCreation
    ) internal pure returns (uint256 popularityScore) {
        // Base score from participants
        uint256 participantScore = (bettorCount + lpCount) * 100;
        
        // Volume bonus (higher volume = more popular)
        uint256 volumeScore = totalVolume > 0 ? (totalVolume / 1e18) * 10 : 0;
        
        // Time decay factor (newer pools get slight boost)
        uint256 timeDecay = timeSinceCreation > 86400 ? 10000 : 10000 + (86400 - timeSinceCreation) / 100;
        
        popularityScore = (participantScore + volumeScore) * timeDecay / 10000;
        
        // Cap at 10000
        if (popularityScore > 10000) popularityScore = 10000;
    }

    /**
     * @notice Calculate pool risk assessment
     * @param creatorStake Creator's stake amount
     * @param totalBettorStake Total bettor stakes
     * @param odds Pool odds
     * @param timeUntilEvent Seconds until event starts
     * @return riskLevel Risk level (1-5, 1=low, 5=high)
     * @return riskFactors Array of risk factors
     */
    function assessPoolRisk(
        uint256 creatorStake,
        uint256 totalBettorStake,
        uint16 odds,
        uint256 timeUntilEvent
    ) internal pure returns (uint8 riskLevel, string memory riskFactors) {
        uint8 risk = 1;
        string memory factors = "";
        
        // High odds = higher risk
        if (odds > 500) {
            risk += 2;
            factors = string(abi.encodePacked(factors, "High odds;"));
        } else if (odds > 300) {
            risk += 1;
            factors = string(abi.encodePacked(factors, "Medium odds;"));
        }
        
        // Low creator stake = higher risk
        if (creatorStake < 1000 * 1e18) {
            risk += 1;
            factors = string(abi.encodePacked(factors, "Low creator stake;"));
        }
        
        // High bettor stake vs creator stake = higher risk
        if (totalBettorStake > creatorStake * 3) {
            risk += 1;
            factors = string(abi.encodePacked(factors, "High bettor leverage;"));
        }
        
        // Very short time until event = higher risk
        if (timeUntilEvent < 3600) {
            risk += 1;
            factors = string(abi.encodePacked(factors, "Short time frame;"));
        }
        
        if (risk > 5) risk = 5;
        if (risk < 1) risk = 1;
        
        return (risk, factors);
    }

    /**
     * @notice Calculate potential winnings for a bet
     * @param betAmount Amount being bet
     * @param odds Pool odds
     * @param feeRate Fee rate in basis points
     * @return grossPayout Gross payout before fees
     * @return netPayout Net payout after fees
     * @return feeAmount Fee amount
     */
    function calculatePotentialWinnings(
        uint256 betAmount,
        uint16 odds,
        uint256 feeRate
    ) internal pure returns (
        uint256 grossPayout,
        uint256 netPayout,
        uint256 feeAmount
    ) {
        grossPayout = (betAmount * uint256(odds)) / 100;
        uint256 profit = grossPayout - betAmount;
        feeAmount = (profit * feeRate) / 10000;
        netPayout = grossPayout - feeAmount;
    }

    /**
     * @notice Calculate pool efficiency metrics
     * @param totalBettorStake Total bettor stakes
     * @param maxBettorStake Maximum bettor capacity
     * @param timeSinceCreation Seconds since pool creation
     * @return efficiencyScore Efficiency score (0-10000)
     * @return utilizationRate Utilization rate in basis points
     */
    function calculatePoolEfficiency(
        uint256 /* totalCreatorSideStake */,
        uint256 totalBettorStake,
        uint256 maxBettorStake,
        uint256 timeSinceCreation
    ) internal pure returns (
        uint256 efficiencyScore,
        uint256 utilizationRate
    ) {
        // Calculate utilization rate
        if (maxBettorStake > 0) {
            utilizationRate = (totalBettorStake * 10000) / maxBettorStake;
        } else {
            utilizationRate = 0;
        }
        
        // Base efficiency from utilization
        efficiencyScore = utilizationRate;
        
        // Time factor (pools that fill quickly are more efficient)
        if (timeSinceCreation > 0) {
            uint256 timeFactor = 86400 > timeSinceCreation ? 
                (86400 - timeSinceCreation) * 100 / 86400 : 0;
            efficiencyScore += timeFactor;
        }
        
        // Cap at 10000
        if (efficiencyScore > 10000) efficiencyScore = 10000;
    }

    /**
     * @notice Calculate creator reputation score
     * @param totalPoolsCreated Total pools created by creator
     * @param totalVolumeCreated Total volume across all pools
     * @param averagePoolSize Average size of creator's pools
     * @param successRate Success rate in basis points
     * @return reputationScore Reputation score (0-10000)
     */
    function calculateCreatorReputation(
        uint256 totalPoolsCreated,
        uint256 totalVolumeCreated,
        uint256 averagePoolSize,
        uint256 successRate
    ) internal pure returns (uint256 reputationScore) {
        // Base score from pool count
        uint256 poolScore = totalPoolsCreated * 100;
        
        // Volume score
        uint256 volumeScore = totalVolumeCreated / 1e18;
        
        // Size consistency score
        uint256 sizeScore = averagePoolSize / 1e18;
        
        // Success rate score
        uint256 successScore = successRate;
        
        reputationScore = (poolScore + volumeScore + sizeScore + successScore) / 4;
        
        // Cap at 10000
        if (reputationScore > 10000) reputationScore = 10000;
    }

    /**
     * @notice Calculate market trend indicators
     * @param currentVolume Current pool volume
     * @param averageVolume Average volume across similar pools
     * @param timeUntilEvent Seconds until event
     * @return trendDirection Trend direction (1=up, 0=stable, -1=down)
     * @return trendStrength Trend strength (0-10000)
     */
    function calculateMarketTrend(
        uint256 currentVolume,
        uint256 averageVolume,
        uint256 timeUntilEvent
    ) internal pure returns (
        int8 trendDirection,
        uint256 trendStrength
    ) {
        if (averageVolume == 0) {
            return (0, 0);
        }
        
        uint256 volumeRatio = (currentVolume * 10000) / averageVolume;
        
        if (volumeRatio > 12000) {
            trendDirection = 1; // Up
            trendStrength = volumeRatio - 10000;
        } else if (volumeRatio < 8000) {
            trendDirection = -1; // Down
            trendStrength = 10000 - volumeRatio;
        } else {
            trendDirection = 0; // Stable
            trendStrength = 0;
        }
        
        // Time urgency factor
        if (timeUntilEvent < 3600) {
            trendStrength = trendStrength * 150 / 100;
        }
        
        // Cap strength at 10000
        if (trendStrength > 10000) trendStrength = 10000;
    }
}
