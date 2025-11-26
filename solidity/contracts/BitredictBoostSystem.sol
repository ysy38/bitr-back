// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./BitredictPoolCore.sol";

interface IBitredictPoolCore {
    struct Pool {
        address creator;
        uint16 odds;
        uint8 flags;
        uint8 oracleType;
        uint8 marketType;
        uint8 reserved;
        uint256 creatorStake;
        uint256 totalCreatorSideStake;
        uint256 maxBettorStake;
        uint256 totalBettorStake;
        bytes32 predictedOutcome;
        bytes32 result;
        uint256 eventStartTime;
        uint256 eventEndTime;
        uint256 bettingEndTime;
        uint256 resultTimestamp;
        uint256 arbitrationDeadline;
        uint256 maxBetPerUser;
        bytes32 league;
        bytes32 category;
    }
    
    function poolExists(uint256 poolId) external view returns (bool);
    function getPool(uint256 poolId) external view returns (Pool memory);
}

enum BoostTier {
    NONE,
    BRONZE,
    SILVER,
    GOLD
}

contract BitredictBoostSystem is Ownable {
    
    IBitredictPoolCore public poolCore;
    
    // Constants
    uint256 public constant BOOST_DURATION = 24 hours;
    uint256 public constant MAX_BRONZE_POOLS = 5;
    uint256 public constant MAX_SILVER_POOLS = 5;
    uint256 public constant MAX_GOLD_POOLS = 5;
    
    // Boost fees (in STT)
    uint256[4] public boostFees = [0, 2e18, 5e18, 10e18]; // NONE, BRONZE, SILVER, GOLD
    
    // BITR boost fees (1:6 ratio: 1 STT = 6 BITR)
    uint256[4] public bitrBoostFees = [0, 12e18, 30e18, 60e18]; // NONE, BRONZE, SILVER, GOLD
    
    // Boost tracking
    mapping(BoostTier => uint256) public activeBoostCount;
    mapping(uint256 => BoostTier) public poolBoostTier;
    mapping(uint256 => uint256) public poolBoostExpiry;
    mapping(uint256 => uint256) public poolBoostStartTime;
    mapping(uint256 => address) public poolBooster; // Who boosted the pool
    
    // Revenue tracking
    uint256 public totalBoostRevenue;
    address public revenueCollector;
    
    // Analytics
    struct BoostAnalytics {
        uint256 totalBoostedPools;
        uint256 totalBoostRevenue;
        uint256 averageBoostDuration;
        mapping(BoostTier => uint256) tierUsage;
        mapping(BoostTier => uint256) tierRevenue;
        uint256 lastUpdated;
    }
    
    BoostAnalytics public boostAnalytics;
    
    // Events
    event PoolBoosted(uint256 indexed poolId, BoostTier tier, uint256 expiry, uint256 fee, address indexed booster);
    event BoostExpired(uint256 indexed poolId, BoostTier tier);
    event BoostUpgraded(uint256 indexed poolId, BoostTier fromTier, BoostTier toTier, uint256 additionalFee);
    event BoostRevenueClaimed(address indexed collector, uint256 amount);
    event BoostAnalyticsUpdated(BoostTier tier, uint256 totalUsage, uint256 totalRevenue);

    constructor(address _poolCore, address _revenueCollector) Ownable(msg.sender) {
        require(_poolCore != address(0), "Invalid pool core address");
        require(_revenueCollector != address(0), "Invalid revenue collector");
        
        poolCore = IBitredictPoolCore(_poolCore);
        revenueCollector = _revenueCollector;
        boostAnalytics.lastUpdated = block.timestamp;
    }

    // --- Admin Functions ---
    
    function setPoolCore(address _poolCore) external onlyOwner {
        require(_poolCore != address(0), "Invalid address");
        poolCore = IBitredictPoolCore(_poolCore);
    }
    
    function setRevenueCollector(address _revenueCollector) external onlyOwner {
        require(_revenueCollector != address(0), "Invalid address");
        revenueCollector = _revenueCollector;
    }
    
    function updateBoostFees(uint256[4] memory _newFees) external onlyOwner {
        boostFees = _newFees;
    }

    // --- Core Boost Functions ---

    function boostPool(uint256 poolId, BoostTier tier) external payable {
        require(tier != BoostTier.NONE, "Invalid boost tier");
        require(poolCore.poolExists(poolId), "Pool does not exist");
        
        // Get pool info
        IBitredictPoolCore.Pool memory pool = poolCore.getPool(poolId);
        
        require(msg.sender == pool.creator, "Only creator can boost");
        // TODO: Add eventStartTime check - need to get it from pool data
        
        // Check if tier has available slots
        uint256 maxForTier = _getMaxPoolsForTier(tier);
        require(activeBoostCount[tier] < maxForTier, "Boost tier full");
        
        // Handle existing boost
        BoostTier currentTier = poolBoostTier[poolId];
        uint256 fee = boostFees[uint256(tier)];
        
        if (currentTier != BoostTier.NONE && block.timestamp < poolBoostExpiry[poolId]) {
            // Upgrading existing boost
            require(tier > currentTier, "Can only upgrade boost");
            uint256 currentFee = boostFees[uint256(currentTier)];
            fee = fee - currentFee; // Pay only the difference
            
            // Remove from old tier count
            activeBoostCount[currentTier]--;
            
            emit BoostUpgraded(poolId, currentTier, tier, fee);
        } else if (currentTier != BoostTier.NONE) {
            // Previous boost expired, clean it up
            activeBoostCount[currentTier]--;
        }
        
        // Charge boost fee (native STT only)
        require(msg.value == fee, "Incorrect boost fee amount");
        totalBoostRevenue += fee;
        
        // Apply new boost
        poolBoostTier[poolId] = tier;
        poolBoostExpiry[poolId] = block.timestamp + BOOST_DURATION;
        poolBoostStartTime[poolId] = block.timestamp;
        poolBooster[poolId] = msg.sender;
        activeBoostCount[tier]++;
        
        // Update analytics
        _updateBoostAnalytics(tier, fee);
        
        emit PoolBoosted(poolId, tier, poolBoostExpiry[poolId], fee, msg.sender);
    }

    function extendBoost(uint256 poolId, uint256 additionalHours) external payable {
        require(poolCore.poolExists(poolId), "Pool does not exist");
        require(poolBooster[poolId] == msg.sender, "Not the original booster");
        
        BoostTier tier = poolBoostTier[poolId];
        require(tier != BoostTier.NONE, "Pool not boosted");
        require(block.timestamp < poolBoostExpiry[poolId], "Boost already expired");
        require(additionalHours > 0 && additionalHours <= 48, "Invalid extension hours");
        
        // Calculate extension fee (pro-rated)
        uint256 baseFee = boostFees[uint256(tier)];
        uint256 extensionFee = (baseFee * additionalHours) / 24;
        
        require(msg.value == extensionFee, "Incorrect extension fee");
        totalBoostRevenue += extensionFee;
        
        // Extend boost duration
        poolBoostExpiry[poolId] += additionalHours * 1 hours;
        
        // Update analytics
        _updateBoostAnalytics(tier, extensionFee);
        
        emit PoolBoosted(poolId, tier, poolBoostExpiry[poolId], extensionFee, msg.sender);
    }

    // --- Boost Cleanup ---

    function cleanupExpiredBoosts(uint256[] calldata poolIds) external {
        for (uint256 i = 0; i < poolIds.length; i++) {
            uint256 poolId = poolIds[i];
            if (!poolCore.poolExists(poolId)) continue;
            
            BoostTier tier = poolBoostTier[poolId];
            uint256 expiry = poolBoostExpiry[poolId];
            
            if (tier != BoostTier.NONE && block.timestamp >= expiry) {
                poolBoostTier[poolId] = BoostTier.NONE;
                poolBoostExpiry[poolId] = 0;
                poolBoostStartTime[poolId] = 0;
                delete poolBooster[poolId];
                activeBoostCount[tier]--;
                
                emit BoostExpired(poolId, tier);
            }
        }
    }

    function batchCleanupExpiredBoosts() external {
        // This would be called by a keeper or automated system
        // Implementation would track all boosted pools and clean them up
        // For simplicity, this is a placeholder
    }

    // --- Revenue Management ---

    function claimBoostRevenue() external {
        require(msg.sender == revenueCollector || msg.sender == owner(), "Not authorized");
        
        uint256 amount = address(this).balance;
        require(amount > 0, "No revenue to claim");
        
        (bool success, ) = payable(revenueCollector).call{value: amount}("");
        require(success, "Revenue transfer failed");
        
        emit BoostRevenueClaimed(revenueCollector, amount);
    }

    // --- View Functions ---

    function getPoolBoost(uint256 poolId) external view returns (BoostTier tier, uint256 expiry) {
        tier = poolBoostTier[poolId];
        expiry = poolBoostExpiry[poolId];
        
        // Return NONE if expired
        if (block.timestamp >= expiry) {
            tier = BoostTier.NONE;
            expiry = 0;
        }
    }

    function isPoolBoosted(uint256 poolId) external view returns (bool) {
        return poolBoostTier[poolId] != BoostTier.NONE && block.timestamp < poolBoostExpiry[poolId];
    }

    function getBoostInfo(uint256 poolId) external view returns (
        BoostTier tier,
        uint256 expiry,
        uint256 startTime,
        address booster,
        bool isActive,
        uint256 remainingTime
    ) {
        tier = poolBoostTier[poolId];
        expiry = poolBoostExpiry[poolId];
        startTime = poolBoostStartTime[poolId];
        booster = poolBooster[poolId];
        isActive = tier != BoostTier.NONE && block.timestamp < expiry;
        remainingTime = isActive ? expiry - block.timestamp : 0;
    }

    function getBoostedPools() external view returns (uint256[] memory poolIds, BoostTier[] memory tiers) {
        // This is a simplified implementation
        // In production, you'd maintain a list of active boosted pools
        uint256 totalBoosted = activeBoostCount[BoostTier.BRONZE] + 
                              activeBoostCount[BoostTier.SILVER] + 
                              activeBoostCount[BoostTier.GOLD];
        
        poolIds = new uint256[](totalBoosted);
        tiers = new BoostTier[](totalBoosted);
        
        // Implementation would iterate through boosted pools
        // For now, returning empty arrays as this requires more sophisticated tracking
        
        return (poolIds, tiers);
    }

    function getBoostedPoolsByTier(BoostTier tier) external view returns (uint256[] memory) {
        // Simplified implementation - would need pool tracking in production
        uint256[] memory pools = new uint256[](activeBoostCount[tier]);
        return pools;
    }

    function getBoostStats() external view returns (
        uint256 totalBoosted,
        uint256 bronzeBoosted,
        uint256 silverBoosted,
        uint256 goldBoosted,
        uint256 totalRevenue,
        uint256 averageFee
    ) {
        totalBoosted = boostAnalytics.totalBoostedPools;
        bronzeBoosted = activeBoostCount[BoostTier.BRONZE];
        silverBoosted = activeBoostCount[BoostTier.SILVER];
        goldBoosted = activeBoostCount[BoostTier.GOLD];
        totalRevenue = boostAnalytics.totalBoostRevenue;
        averageFee = totalBoosted > 0 ? totalRevenue / totalBoosted : 0;
    }

    function getBoostAnalytics() external view returns (
        uint256 totalBoostedPools,
        uint256 totalBoostRevenueValue,
        uint256 averageBoostDuration,
        uint256 bronzeUsage,
        uint256 silverUsage,
        uint256 goldUsage,
        uint256 lastUpdated
    ) {
        return (
            boostAnalytics.totalBoostedPools,
            boostAnalytics.totalBoostRevenue,
            boostAnalytics.averageBoostDuration,
            boostAnalytics.tierUsage[BoostTier.BRONZE],
            boostAnalytics.tierUsage[BoostTier.SILVER],
            boostAnalytics.tierUsage[BoostTier.GOLD],
            boostAnalytics.lastUpdated
        );
    }

    function canBoostPool(uint256 poolId, BoostTier tier) external view returns (bool canBoost, string memory reason) {
        if (!poolCore.poolExists(poolId)) {
            return (false, "Pool does not exist");
        }
        
        if (tier == BoostTier.NONE) {
            return (false, "Invalid boost tier");
        }
        
        poolCore.getPool(poolId);
        
        // TODO: Add eventStartTime check - need to get it from pool data
        // if (eventStartTime <= block.timestamp) {
        //     return (false, "Event already started");
        // }
        
        uint256 maxForTier = _getMaxPoolsForTier(tier);
        if (activeBoostCount[tier] >= maxForTier) {
            return (false, "Boost tier full");
        }
        
        BoostTier currentTier = poolBoostTier[poolId];
        if (currentTier != BoostTier.NONE && block.timestamp < poolBoostExpiry[poolId]) {
            if (tier <= currentTier) {
                return (false, "Can only upgrade boost");
            }
        }
        
        return (true, "");
    }

    function getBoostCost(uint256 poolId, BoostTier tier) external view returns (uint256 cost) {
        require(tier != BoostTier.NONE, "Invalid tier");
        
        cost = boostFees[uint256(tier)];
        
        // If upgrading existing boost, calculate difference
        BoostTier currentTier = poolBoostTier[poolId];
        if (currentTier != BoostTier.NONE && block.timestamp < poolBoostExpiry[poolId]) {
            uint256 currentCost = boostFees[uint256(currentTier)];
            cost = cost > currentCost ? cost - currentCost : 0;
        }
    }

    function getTopBoostedPools(uint256 limit) external pure returns (
        uint256[] memory poolIds,
        BoostTier[] memory tiers,
        uint256[] memory expiries
    ) {
        // Simplified implementation - would need sophisticated sorting in production
        poolIds = new uint256[](limit);
        tiers = new BoostTier[](limit);
        expiries = new uint256[](limit);
        
        // Implementation would sort boosted pools by tier and remaining time
        // For now, returning empty arrays as placeholder
        
        return (poolIds, tiers, expiries);
    }

    // --- Internal Functions ---

    function _getMaxPoolsForTier(BoostTier tier) internal pure returns (uint256) {
        if (tier == BoostTier.BRONZE) return MAX_BRONZE_POOLS;
        if (tier == BoostTier.SILVER) return MAX_SILVER_POOLS;
        if (tier == BoostTier.GOLD) return MAX_GOLD_POOLS;
        return 0;
    }

    function _updateBoostAnalytics(BoostTier tier, uint256 fee) internal {
        boostAnalytics.totalBoostedPools++;
        boostAnalytics.totalBoostRevenue += fee;
        boostAnalytics.tierUsage[tier]++;
        boostAnalytics.tierRevenue[tier] += fee;
        boostAnalytics.lastUpdated = block.timestamp;
        
        // Update average duration (simplified calculation)
        if (boostAnalytics.totalBoostedPools > 0) {
            boostAnalytics.averageBoostDuration = BOOST_DURATION; // Could track actual durations
        }
        
        emit BoostAnalyticsUpdated(tier, boostAnalytics.tierUsage[tier], boostAnalytics.tierRevenue[tier]);
    }

    // --- Emergency Functions ---

    function emergencyWithdraw() external onlyOwner {
        uint256 amount = address(this).balance;
        require(amount > 0, "No funds to withdraw");
        
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Emergency withdrawal failed");
    }

    function pauseBoostSystem() external onlyOwner {
        // Implementation for pausing the boost system
        // Could add a paused state and modifier
    }

    // --- Receive Function ---
    
    receive() external payable {
        // Allow contract to receive STT
    }
}
