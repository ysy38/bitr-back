// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Import our split contracts
import "./BitredictPoolCore.sol";
import "./BitredictComboPools.sol";
import "./BitredictBoostSystem.sol";


contract BitredictPoolFactory is Ownable, ReentrancyGuard {
    
    // Contract instances
    BitredictPoolCore public poolCore;
    BitredictComboPools public comboPools;
    BitredictBoostSystem public boostSystem;
    IERC20 public bitrToken;
    
    // Factory analytics
    struct FactoryAnalytics {
        uint256 totalPoolsCreated;
        uint256 totalComboPoolsCreated;
        uint256 totalVolumeProcessed;
        uint256 totalBoostedPools;
        uint256 averagePoolSize;
        uint256 factoryFees;
        uint256 lastUpdated;
    }
    
    FactoryAnalytics public factoryAnalytics;
    
    // Events
    event PoolCreatedWithBoost(uint256 indexed poolId, address indexed creator, BoostTier boostTier, uint256 totalCost);
    event ComboPoolCreatedWithBoost(uint256 indexed comboPoolId, address indexed creator, BoostTier boostTier, uint256 totalCost);
    event FactoryAnalyticsUpdated(uint256 totalPools, uint256 totalVolume, uint256 totalBoosted);
    event ContractUpgraded(string contractName, address oldAddress, address newAddress);

    constructor(
        address _poolCore,
        address _comboPools,
        address payable _boostSystem,
        address _bitrToken
    ) Ownable(msg.sender) {
        require(_poolCore != address(0), "Invalid pool core address");
        require(_comboPools != address(0), "Invalid combo pools address");
        require(_boostSystem != address(0), "Invalid boost system address");
        require(_bitrToken != address(0), "Invalid BITR token address");
        
        poolCore = BitredictPoolCore(_poolCore);
        comboPools = BitredictComboPools(_comboPools);
        boostSystem = BitredictBoostSystem(_boostSystem);
        bitrToken = IERC20(_bitrToken);
        
        factoryAnalytics.lastUpdated = block.timestamp;
    }

    // --- Admin Functions ---
    
    function upgradeContracts(
        address _newPoolCore,
        address _newComboPools,
        address payable _newBoostSystem
    ) external onlyOwner {
        if (_newPoolCore != address(0) && _newPoolCore != address(poolCore)) {
            address oldCore = address(poolCore);
            poolCore = BitredictPoolCore(_newPoolCore);
            emit ContractUpgraded("PoolCore", oldCore, _newPoolCore);
        }
        
        if (_newComboPools != address(0) && _newComboPools != address(comboPools)) {
            address oldCombo = address(comboPools);
            comboPools = BitredictComboPools(_newComboPools);
            emit ContractUpgraded("ComboPools", oldCombo, _newComboPools);
        }
        
        if (_newBoostSystem != address(0) && _newBoostSystem != address(boostSystem)) {
            address oldBoost = address(boostSystem);
            boostSystem = BitredictBoostSystem(_newBoostSystem);
            emit ContractUpgraded("BoostSystem", oldBoost, _newBoostSystem);
        }
    }

    // --- Unified Pool Creation Functions ---

    function createPoolWithBoost(
        bytes32 _predictedOutcome,
        uint256 _odds,
        uint256 _creatorStake,
        uint256 _eventStartTime,
        uint256 _eventEndTime,
        bytes32 _leagueHash,
        bytes32 _categoryHash,
        bytes32 /* _regionHash */,
        bytes32 _homeTeamHash,
        bytes32 _awayTeamHash,
        bytes32 _titleHash,
        bool _isPrivate,
        uint256 _maxBetPerUser,
        bool _useBitr,
        OracleType _oracleType,
        bytes32 _marketId,
        MarketType _marketType,
        BoostTier _boostTier
    ) external payable nonReentrant returns (uint256 poolId) {
        
        // Calculate total costs
        uint256 creationFee = _useBitr ? 70e18 : 1e18; // BITR : STT
        uint256 boostCost = _boostTier != BoostTier.NONE ? _getBoostCost(_boostTier) : 0;
        uint256 totalCost = creationFee + _creatorStake + boostCost;
        
        if (_useBitr) {
            require(bitrToken.transferFrom(msg.sender, address(this), totalCost), "BITR transfer failed");
            // Approve pool core for its portion only
            bitrToken.approve(address(poolCore), creationFee + _creatorStake);
        } else {
            require(msg.value == totalCost, "Incorrect STT amount");
        }
        
        // 🚀 GAS OPTIMIZATION: Create the pool using lightweight function
        if (_useBitr) {
            poolId = poolCore.createPool(
                _predictedOutcome, _odds, _creatorStake, _eventStartTime, _eventEndTime,
                _leagueHash, _categoryHash, _homeTeamHash, _awayTeamHash, _titleHash, _isPrivate, _maxBetPerUser, _useBitr,
                _oracleType, _marketType, string(abi.encodePacked(_marketId))
            );
        } else {
            poolId = poolCore.createPool{value: creationFee + _creatorStake}(
                _predictedOutcome, _odds, _creatorStake, _eventStartTime, _eventEndTime,
                _leagueHash, _categoryHash, _homeTeamHash, _awayTeamHash, _titleHash, _isPrivate, _maxBetPerUser, _useBitr,
                _oracleType, _marketType, string(abi.encodePacked(_marketId))
            );
        }
        
        // Apply boost if requested
        if (_boostTier != BoostTier.NONE) {
            if (_useBitr) {
                // For BITR pools, boost is still paid in STT
                require(msg.value >= boostCost, "Insufficient boost payment");
                boostSystem.boostPool{value: boostCost}(poolId, _boostTier);
            } else {
                boostSystem.boostPool{value: boostCost}(poolId, _boostTier);
            }
        }
        
        // Update analytics
        _updateFactoryAnalytics(_creatorStake, _boostTier != BoostTier.NONE, false);
        
        emit PoolCreatedWithBoost(poolId, msg.sender, _boostTier, totalCost);
        
        return poolId;
    }

    function createComboPoolWithBoost(
        BitredictComboPools.OutcomeCondition[] memory conditions,
        uint16 combinedOdds,
        uint256 creatorStake,
        uint256 earliestEventStart,
        uint256 latestEventEnd,
        string memory category,
        uint256 maxBetPerUser,
        bool useBitr,
        BoostTier _boostTier
    ) external payable nonReentrant returns (uint256 comboPoolId) {
        
        // Calculate total costs
        uint256 creationFee = useBitr ? 70e18 : 1e18; // BITR : STT
        uint256 boostCost = _boostTier != BoostTier.NONE ? _getBoostCost(_boostTier) : 0;
        uint256 totalCost = creationFee + creatorStake + boostCost;
        
        if (useBitr) {
            require(bitrToken.transferFrom(msg.sender, address(this), totalCost), "BITR transfer failed");
            // Approve combo pools for its portion only
            bitrToken.approve(address(comboPools), creationFee + creatorStake);
        } else {
            require(msg.value == totalCost, "Incorrect STT amount");
        }
        
        // Hash category string to bytes32 for gas optimization
        bytes32 categoryHash = keccak256(bytes(category));
        
        // Create the combo pool
        if (useBitr) {
            comboPoolId = comboPools.createComboPool(
                conditions, combinedOdds, creatorStake, earliestEventStart,
                latestEventEnd, categoryHash, maxBetPerUser, useBitr
            );
        } else {
            comboPoolId = comboPools.createComboPool{value: creationFee + creatorStake}(
                conditions, combinedOdds, creatorStake, earliestEventStart,
                latestEventEnd, categoryHash, maxBetPerUser, useBitr
            );
        }
        
        // Apply boost if requested (Note: combo pools use regular pool IDs for boosting)
        if (_boostTier != BoostTier.NONE) {
            if (useBitr) {
                // For BITR pools, boost is still paid in STT
                require(msg.value >= boostCost, "Insufficient boost payment");
                boostSystem.boostPool{value: boostCost}(comboPoolId, _boostTier);
            } else {
                boostSystem.boostPool{value: boostCost}(comboPoolId, _boostTier);
            }
        }
        
        // Update analytics
        _updateFactoryAnalytics(creatorStake, _boostTier != BoostTier.NONE, true);
        
        emit ComboPoolCreatedWithBoost(comboPoolId, msg.sender, _boostTier, totalCost);
        
        return comboPoolId;
    }

    // --- Simplified Creation Functions (No Boost) - Moved to end ---

    // --- Batch Operations ---

    function batchCreatePools(
        bytes32[] memory _predictedOutcomes,
        uint256[] memory _odds,
        uint256[] memory _creatorStakes,
        uint256[] memory /* _eventStartTimes */,
        uint256[] memory /* _eventEndTimes */,
        string[] memory /* _leagues */,
        string[] memory /* _categories */,
        bool /* _useBitr */
    ) external payable nonReentrant returns (uint256[] memory /* poolIds */) {
        require(_predictedOutcomes.length == _odds.length, "Array length mismatch");
        require(_odds.length == _creatorStakes.length, "Array length mismatch");
        require(_creatorStakes.length <= 10, "Too many pools in batch");
        
        // Temporarily disabled - will implement direct pool creation
        revert("Batch creation temporarily disabled");
    }

    // --- View Functions for Cross-Contract Queries ---

    function getAllPoolData(uint256 poolId) external view returns (
        BitredictPoolCore.Pool memory pool,
        bool isBoosted,
        BoostTier boostTier,
        uint256 boostExpiry
    ) {
        pool = poolCore.getPool(poolId);
        (boostTier, boostExpiry) = boostSystem.getPoolBoost(poolId);
        isBoosted = boostSystem.isPoolBoosted(poolId);
        
        return (pool, isBoosted, boostTier, boostExpiry);
    }

    function getAllComboPoolData(uint256 comboPoolId) external view returns (
        BitredictComboPools.ComboPool memory comboPool,
        bool isBoosted,
        BoostTier boostTier,
        uint256 boostExpiry
    ) {
        comboPool = comboPools.getComboPool(comboPoolId);
        (boostTier, boostExpiry) = boostSystem.getPoolBoost(comboPoolId);
        isBoosted = boostSystem.isPoolBoosted(comboPoolId);
        
        return (comboPool, isBoosted, boostTier, boostExpiry);
    }

    function getActivePoolsWithBoosts() external view returns (
        uint256[] memory poolIds,
        BoostTier[] memory boostTiers
    ) {
        (uint256[] memory activePools,) = poolCore.getActivePoolsPaginated(0, 100);
        boostTiers = new BoostTier[](activePools.length);
        
        for (uint256 i = 0; i < activePools.length; i++) {
            (BoostTier tier,) = boostSystem.getPoolBoost(activePools[i]);
            boostTiers[i] = tier;
        }
        
        return (activePools, boostTiers);
    }

    function getGlobalAnalytics() external view returns (
        uint256 totalPools,
        uint256 totalVolume,
        uint256 averagePoolSize,
        uint256 lastUpdated,
        FactoryAnalytics memory factoryStats,
        uint256 totalBoosted,
        uint256 totalComboVolume
    ) {
        (totalPools, totalVolume, averagePoolSize, lastUpdated) = poolCore.getGlobalStats();
        factoryStats = factoryAnalytics;
        (totalBoosted,,,,,,) = boostSystem.getBoostAnalytics();
        (,totalComboVolume,,,) = comboPools.getComboStats();
        
        return (totalPools, totalVolume, averagePoolSize, lastUpdated, factoryStats, totalBoosted, totalComboVolume);
    }

    function getCreatorAnalytics(address creator) external view returns (
        uint256 totalPoolsCreated,
        uint256 successfulPools,
        uint256 totalVolumeGenerated,
        uint256 averagePoolSize,
        uint256 reputationScore,
        uint256 winRate,
        uint256 totalEarnings,
        uint256 activePoolsCount,
        uint256[] memory creatorPools,
        uint256[] memory creatorComboPools,
        uint256 totalBoostedPools
    ) {
        totalPoolsCreated = successfulPools = totalVolumeGenerated = averagePoolSize = reputationScore = winRate = totalEarnings = activePoolsCount = 0;
        creatorPools = poolCore.getPoolsByCreator(creator, 1000);
        creatorComboPools = comboPools.getComboPoolsByCreator(creator);
        
        // Count boosted pools by this creator
        totalBoostedPools = 0;
        for (uint256 i = 0; i < creatorPools.length; i++) {
            if (boostSystem.isPoolBoosted(creatorPools[i])) {
                totalBoostedPools++;
            }
        }
        
        return (totalPoolsCreated, successfulPools, totalVolumeGenerated, averagePoolSize, reputationScore, winRate, totalEarnings, activePoolsCount, creatorPools, creatorComboPools, totalBoostedPools);
    }

    function getPoolCreationCost(
        uint256 _creatorStake,
        bool _useBitr,
        BoostTier _boostTier
    ) external pure returns (uint256 totalCost, uint256 creationFee, uint256 boostCost) {
        creationFee = _useBitr ? 70e18 : 1e18;
        boostCost = _boostTier != BoostTier.NONE ? _getBoostCost(_boostTier) : 0;
        totalCost = creationFee + _creatorStake + boostCost;
        
        return (totalCost, creationFee, boostCost);
    }

    function canCreatePoolWithBoost(
        address creator,
        uint256 poolId,
        BoostTier boostTier,
        bool useBitr
    ) external view returns (bool canCreate, string memory reason) {
        // Check if boost can be applied
        if (boostTier != BoostTier.NONE) {
            (bool canBoost, string memory boostReason) = boostSystem.canBoostPool(poolId, boostTier);
            if (!canBoost) {
                return (false, boostReason);
            }
        }
        
        // Check creator's balance
        if (useBitr) {
            uint256 creationFee = 70e18;
            uint256 balance = bitrToken.balanceOf(creator);
            if (balance < creationFee) {
                return (false, "Insufficient BITR balance");
            }
        }
        
        return (true, "");
    }

    // --- Contract Addresses ---
    
    function getContractAddresses() external view returns (
        address poolCoreAddress,
        address comboPoolsAddress,
        address boostSystemAddress,
        address bitrTokenAddress
    ) {
        return (address(poolCore), address(comboPools), address(boostSystem), address(bitrToken));
    }

    function getFactoryAnalytics() external view returns (FactoryAnalytics memory) {
        return factoryAnalytics;
    }

    // --- Internal Functions ---

    function _getBoostCost(BoostTier tier) internal pure returns (uint256) {
        if (tier == BoostTier.BRONZE) return 2e18;
        if (tier == BoostTier.SILVER) return 3e18;
        if (tier == BoostTier.GOLD) return 5e18;
        return 0;
    }

    function _updateFactoryAnalytics(uint256 stakeAmount, bool wasBoosted, bool isComboPool) internal {
        if (isComboPool) {
            factoryAnalytics.totalComboPoolsCreated++;
        } else {
            factoryAnalytics.totalPoolsCreated++;
        }
        
        if (wasBoosted) {
            factoryAnalytics.totalBoostedPools++;
        }
        
        factoryAnalytics.totalVolumeProcessed += stakeAmount;
        factoryAnalytics.lastUpdated = block.timestamp;
        
        uint256 totalPools = factoryAnalytics.totalPoolsCreated + factoryAnalytics.totalComboPoolsCreated;
        if (totalPools > 0) {
            factoryAnalytics.averagePoolSize = factoryAnalytics.totalVolumeProcessed / totalPools;
        }
        
        emit FactoryAnalyticsUpdated(totalPools, factoryAnalytics.totalVolumeProcessed, factoryAnalytics.totalBoostedPools);
    }

    // --- Emergency Functions ---

    function emergencyPause() external onlyOwner {
        // Implementation for emergency pause
        // Could add paused state and modifier to all functions
    }

    function emergencyWithdraw() external onlyOwner {
        // Withdraw any stuck tokens/ETH
        uint256 sttBalance = address(this).balance;
        uint256 bitrBalance = bitrToken.balanceOf(address(this));
        
        if (sttBalance > 0) {
            (bool success, ) = payable(owner()).call{value: sttBalance, gas: 2300}("");
            require(success, "STT withdrawal failed");
        }
        
        if (bitrBalance > 0) {
            require(bitrToken.transfer(owner(), bitrBalance), "BITR withdrawal failed");
        }
    }


    // --- Receive Function ---
    
    receive() external payable {
        // Allow contract to receive STT for boost payments
    }
}
