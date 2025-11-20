// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ClaimCalculations
 * @notice Library for calculating claim amounts for creators, LP providers, and bettors
 * @dev Implements the contrarian strategy with creator priority and FIFO LP logic
 */
library ClaimCalculations {
    
    struct PoolData {
        uint16 odds;
        uint256 creatorStake;
        uint256 totalCreatorSideStake;
        uint256 totalBettorStake;
    }

    /**
     * @notice Calculate creator's claimable amount
     * @dev Formula: stake + (stake / (odds - 1))
     * @param poolData Pool data
     * @return claimableAmount Amount creator can claim
     */
    function calculateCreatorClaim(PoolData memory poolData) internal pure returns (uint256 claimableAmount) {
        if (poolData.creatorStake == 0) return 0;
        
        uint256 poolOdds = uint256(poolData.odds);
        uint256 denominator = poolOdds > 100 ? poolOdds - 100 : 1;
        
        // Creator max reward = stake + (stake / (odds - 1))
        uint256 maxReward = poolData.creatorStake + ((poolData.creatorStake * 100) / denominator);
        
        // Actual reward is limited by available funds
        uint256 availableFunds = poolData.creatorStake + poolData.totalBettorStake;
        claimableAmount = maxReward > availableFunds ? availableFunds : maxReward;
        
        return claimableAmount;
    }

    /**
     * @notice Calculate remaining stakes available for LP providers after creator takes their share
     * @param poolData Pool data
     * @return remainingStakes Amount remaining for LP distribution
     */
    function getRemainingStakesForLP(PoolData memory poolData) internal pure returns (uint256 remainingStakes) {
        uint256 poolOdds = uint256(poolData.odds);
        uint256 denominator = poolOdds > 100 ? poolOdds - 100 : 1;
        
        // Calculate creator's reward
        uint256 creatorMaxReward = poolData.creatorStake + ((poolData.creatorStake * 100) / denominator);
        uint256 creatorActualReward = creatorMaxReward > poolData.creatorStake + poolData.totalBettorStake ? 
            poolData.creatorStake + poolData.totalBettorStake : creatorMaxReward;
        
        // Calculate what creator takes from bettors
        uint256 creatorFromBettors = creatorActualReward > poolData.creatorStake ? 
            creatorActualReward - poolData.creatorStake : 0;
        
        // Return remaining for LP providers
        remainingStakes = poolData.totalBettorStake > creatorFromBettors ? 
            poolData.totalBettorStake - creatorFromBettors : 0;
    }

    /**
     * @notice Calculate LP provider's reward based on FIFO and stake correspondence
     * @param poolData Pool data
     * @param lpStakes Mapping of LP stakes
     * @param poolLPs Array of LP addresses in FIFO order
     * @param poolId Pool ID
     * @param user User address to calculate reward for
     * @param userStake User's LP stake
     * @param remainingStakes Remaining stakes after creator's share
     * @return claimableAmount Amount LP can claim (stake + reward)
     */
    function calculateLPReward(
        PoolData memory poolData,
        mapping(uint256 => mapping(address => uint256)) storage lpStakes,
        mapping(uint256 => address[]) storage poolLPs,
        uint256 poolId,
        address user,
        uint256 userStake,
        uint256 remainingStakes
    ) internal view returns (uint256 claimableAmount) {
        if (userStake == 0) return 0;
        if (remainingStakes == 0) return userStake; // Only refund
        
        uint256 poolOdds = uint256(poolData.odds);
        uint256 denominator = poolOdds > 100 ? poolOdds - 100 : 1;
        
        address[] memory lps = poolLPs[poolId];
        uint256 distributed = 0;
        
        // FIFO: Process LP providers in order
        for (uint256 i = 0; i < lps.length; i++) {
            address lp = lps[i];
            uint256 lpStake = lpStakes[poolId][lp];
            
            if (lp == user) {
                // Found user, calculate their reward
                uint256 maxReward = (lpStake * 100) / denominator;
                uint256 available = remainingStakes > distributed ? remainingStakes - distributed : 0;
                uint256 reward = maxReward > available ? available : maxReward;
                return userStake + reward;
            }
            
            // Calculate earlier LP's reward (they get paid first)
            uint256 lpMaxReward = (lpStake * 100) / denominator;
            uint256 lpReward = remainingStakes > distributed ? 
                (lpMaxReward > (remainingStakes - distributed) ? 
                    (remainingStakes - distributed) : lpMaxReward) : 0;
            distributed += lpReward;
            
            if (distributed >= remainingStakes) break;
        }
        
        return userStake; // Only refund if we reach here
    }

    /**
     * @notice Calculate bettor's payout when they win
     * @dev Formula: stake * odds - fees
     * @param stake Bettor's stake
     * @param odds Pool odds
     * @param feeRate Fee rate (basis points)
     * @return grossPayout Payout before fees
     * @return netPayout Payout after fees
     * @return fee Fee amount
     */
    function calculateBettorPayout(
        uint256 stake,
        uint16 odds,
        uint256 feeRate
    ) internal pure returns (
        uint256 grossPayout,
        uint256 netPayout,
        uint256 fee
    ) {
        if (stake == 0) return (0, 0, 0);
        
        uint256 poolOdds = uint256(odds);
        grossPayout = (stake * poolOdds) / 100;
        
        // Fee only on profit
        uint256 profit = grossPayout > stake ? grossPayout - stake : 0;
        fee = (profit * feeRate) / 10000;
        netPayout = grossPayout - fee;
        
        return (grossPayout, netPayout, fee);
    }

    /**
     * @notice Determine if creator side won (contrarian strategy)
     * @dev In contrarian strategy: creator wins if outcome != predictedOutcome
     * @param predictedOutcome Creator's prediction
     * @param result Actual match outcome
     * @return creatorWon True if creator side won
     */
    function creatorSideWon(bytes32 predictedOutcome, bytes32 result) internal pure returns (bool) {
        // Contrarian strategy: creator wins when their prediction is wrong
        return result != predictedOutcome;
    }

    /**
     * @notice Calculate pool capacity for new bets
     * @param creatorStake Creator's initial stake
     * @param totalCreatorSideStake Total creator + LP stakes
     * @param totalBettorStake Current bettor stakes
     * @param odds Pool odds
     * @return maxBettorStake Maximum allowed bettor stake
     * @return remainingCapacity Remaining betting capacity
     */
    function calculatePoolCapacity(
        uint256 creatorStake,
        uint256 totalCreatorSideStake,
        uint256 totalBettorStake,
        uint16 odds
    ) internal pure returns (uint256 maxBettorStake, uint256 remainingCapacity) {
        uint256 poolOdds = uint256(odds);
        uint256 denominator = poolOdds > 100 ? poolOdds - 100 : 1;
        
        // Max bettor stake = totalCreatorSideStake / (odds - 1)
        maxBettorStake = (totalCreatorSideStake * 100) / denominator;
        
        // Remaining capacity
        remainingCapacity = maxBettorStake > totalBettorStake ? 
            maxBettorStake - totalBettorStake : 0;
        
        return (maxBettorStake, remainingCapacity);
    }

    /**
     * @notice Get adjusted fee rate based on user reputation
     * @param baseRate Base fee rate
     * @param userReputation User's reputation score
     * @return adjustedRate Fee rate adjusted for reputation
     */
    function getAdjustedFeeRate(uint256 baseRate, uint256 userReputation) internal pure returns (uint256) {
        // High reputation users (>1000) get 50% fee discount
        if (userReputation >= 1000) {
            return baseRate / 2;
        }
        // Medium reputation users (>500) get 25% fee discount
        if (userReputation >= 500) {
            return (baseRate * 75) / 100;
        }
        return baseRate;
    }
}
