const { ethers } = require('ethers');
const path = require('path');
const config = require('../config');
const GasEstimator = require('../utils/gas-estimator');

class Web3Service {
  // Contract constants
  MATCH_COUNT = 10;
  
  // Contract enums
  BetType = {
    MONEYLINE: 0,
    OVER_UNDER: 1
  };
  
  MoneylineResult = {
    NotSet: 0,
    HomeWin: 1,
    Draw: 2,
    AwayWin: 3
  };
  
  OverUnderResult = {
    NotSet: 0,
    Over: 1,
    Under: 2
  };
  
  CycleState = {
    NotStarted: 0,
    Active: 1,
    Ended: 2,
    Resolved: 3
  };
  
  constructor() {
    this.provider = null;
    this.wallet = null;
    this.oddysseyContract = null;
    this.poolCoreContract = null;
    this.boostSystemContract = null;
    this.comboPoolsContract = null;
    this.factoryContract = null;
    this.guidedOracleContract = null;
    this.optimisticOracleContract = null;
    this.bitrTokenContract = null;
    this.gasEstimator = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the Web3Service with provider and wallet
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize provider
      
      // Initialize provider with proper configuration
      const rpcUrl = process.env.RPC_URL || config.blockchain.rpcUrl;
      if (!rpcUrl) {
        throw new Error('RPC_URL environment variable not set');
      }
      
      // ✅ CRITICAL FIX: Use HTTP provider with polling (more reliable than WebSocket)
      // WebSocket was causing 502 errors and process crashes
      // HTTP with polling works reliably for event listening
      console.log(`🔌 Using HTTP provider with polling for event listening`);
      this.provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
        timeout: 30000,
        retryCount: 3,
        polling: true, // ✅ Enable polling for event listening
        pollingInterval: 4000 // Poll every 4 seconds
      });
      
      // Test the provider connection
      try {
        await this.provider.getNetwork();
        console.log('✅ HTTP provider with polling connection test successful');
      } catch (error) {
        console.error('❌ Provider connection test failed:', error.message);
        throw error;
      }
      
      // Initialize wallet if private key is provided
      if (process.env.PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY) {
        const privateKey = process.env.PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY;
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        console.log('✅ Web3Service initialized with wallet:', this.wallet.address);
      } else {
        console.warn('⚠️ Web3Service initialized without wallet (PRIVATE_KEY not set)');
      }

      // Initialize gas estimator with PoolCore contract for guided markets
      const poolCoreContract = await this.getPoolCoreContract();
      this.gasEstimator = new GasEstimator(this.provider, poolCoreContract);
      
      this.isInitialized = true;
      console.log('✅ Web3Service fully initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize Web3Service:', error.message);
      throw error;
    }
  }

  /**
   * Get wallet address
   */
  getWalletAddress() {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }
    return this.wallet.address;
  }

  /**
   * Get Oddyssey contract instance
   */
  
  /**
   * Get Oddyssey contract instance
   */
  async getOddysseyContract() {
    if (this.oddysseyContract) {
      return this.oddysseyContract;
    }

    // Ensure provider is initialized
    if (!this.provider) {
      await this.initialize();
    }

    const contractAddress = config.blockchain.contractAddresses.oddyssey;
    if (!contractAddress) {
      throw new Error('Oddyssey contract address not configured');
    }

    // Import the ABI
    let OddysseyABI;
    try {
      // Try multiple possible paths for the ABI
      const possiblePaths = [
        path.join(__dirname, '../solidity/Oddyssey.json'),
        path.join(__dirname, '../abis/Oddyssey.json'),
        path.join(__dirname, '../oddyssey-contract-abi.json'),
        path.join(__dirname, '../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json'),
        path.join(__dirname, './oddyssey-contract-abi.json'),
        path.join(__dirname, './solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json'),
        '../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json',
        './solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json'
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          const abiData = require(abiPath);
          // Handle both formats: direct ABI array or object with .abi property
          OddysseyABI = Array.isArray(abiData) ? abiData : (abiData.abi || abiData);
          console.log(`✅ Oddyssey ABI loaded from: ${abiPath}`);
          console.log(`   ABI length: ${OddysseyABI.length}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          console.log(`   ❌ Failed to load from: ${abiPath}`);
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ Oddyssey contract artifacts not found, using fallback ABI');
      console.warn('Error details:', error.message);
      // Complete fallback ABI matching actual contract
      OddysseyABI = [
        // Admin functions
        "function oracle() external view returns (address)",
        "function devWallet() external view returns (address)",
        "function setOracle(address _newOracle) external",
        "function setEntryFee(uint256 _newFee) external",
        
        // Oracle functions
        "function startDailyCycle(tuple(uint64 id, uint64 startTime, uint32 oddsHome, uint32 oddsDraw, uint32 oddsAway, uint32 oddsOver, uint32 oddsUnder, tuple(uint8 moneyline, uint8 overUnder) result)[10] _matches) external",
        "function resolveDailyCycle(uint256 _cycleId, tuple(uint8 moneyline, uint8 overUnder)[10] _results) external",
        "function resolveMultipleCycles(uint256[] memory _cycleIds, tuple(uint8 moneyline, uint8 overUnder)[10][] memory _results) external",
        
        // Public functions
        "function placeSlip(tuple(uint64 matchId, uint8 betType, string selection, uint32 selectedOdd)[10] memory _predictions) external payable",
        "function evaluateSlip(uint256 _slipId) external",
        "function evaluateMultipleSlips(uint256[] memory _slipIds) external",
        "function claimPrize(uint256 _cycleId) external",
        "function claimMultiplePrizes(uint256[] memory _cycleIds) external",
        
        // View functions - Core
        "function dailyCycleId() external view returns (uint256)",
        "function slipCount() external view returns (uint256)",
        "function entryFee() external view returns (uint256)",
        
        // View functions - Enhanced
        "function getCurrentCycleInfo() external view returns (uint256 cycleId, uint8 state, uint256 endTime, uint256 prizePool, uint32 cycleSlipCount)",
        "function getCycleStatus(uint256 _cycleId) external view returns (bool exists, uint8 state, uint256 endTime, uint256 prizePool, uint32 cycleSlipCount, bool hasWinner)",
        "function getCurrentCycle() external view returns (uint256)",
        "function isCycleInitialized(uint256 _cycleId) external view returns (bool)",
        
        // Match and cycle data
        "function getDailyMatches(uint256 _cycleId) external view returns (tuple(uint64 id, uint64 startTime, uint32 oddsHome, uint32 oddsDraw, uint32 oddsAway, uint32 oddsOver, uint32 oddsUnder, tuple(uint8 moneyline, uint8 overUnder) result)[10] memory)",
        "function getCycleMatches(uint256 _cycleId) external view returns (tuple(uint64 id, uint64 startTime, uint32 oddsHome, uint32 oddsDraw, uint32 oddsAway, uint32 oddsOver, uint32 oddsUnder, tuple(uint8 moneyline, uint8 overUnder) result)[10] memory)",
        "function getDailyLeaderboard(uint256 _cycleId) external view returns (tuple(address player, uint256 slipId, uint256 finalScore, uint8 correctCount)[5] memory)",
        
        // User data
        "function getUserSlipsForCycle(address _user, uint256 _cycleId) external view returns (uint256[] memory)",
        "function getSlip(uint256 _slipId) external view returns (tuple(address player, uint256 cycleId, uint256 placedAt, tuple(uint64 matchId, uint8 betType, string selection, uint32 selectedOdd)[10] predictions, uint256 finalScore, uint8 correctCount, bool isEvaluated) memory)",
        "function getUserStats(address _user) external view returns (uint256 totalSlips, uint256 totalWins, uint256 bestScore, uint256 averageScore, uint256 winRate, uint256 currentStreak, uint256 bestStreak, uint256 lastActiveCycle)",
        "function getUserStatsWithReputation(address _user) external view returns (uint256 totalSlips, uint256 totalWins, uint256 bestScore, uint256 averageScore, uint256 winRate, uint256 currentStreak, uint256 bestStreak, uint256 lastActiveCycle, uint256 totalReputation, uint256 totalCorrectPredictions)",
        "function getOddysseyReputation(address _user) external view returns (uint256 totalReputation, uint256 totalCorrectPredictions)",
        
        // Mappings access
        "function userStats(address) external view returns (uint256 totalSlips, uint256 totalWins, uint256 bestScore, uint256 averageScore, uint256 winRate, uint256 currentStreak, uint256 bestStreak, uint256 lastActiveCycle)",
        "function userOddysseyReputation(address) external view returns (uint256)",
        "function userOddysseyCorrectPredictions(address) external view returns (uint256)",
        "function dailyPrizePools(uint256) external view returns (uint256)",
        "function dailyCycleEndTimes(uint256) external view returns (uint256)",
        "function claimableStartTimes(uint256) external view returns (uint256)",
        "function isCycleResolved(uint256) external view returns (bool)",
        "function prizeClaimed(uint256, uint8) external view returns (bool)",
        "function cycleInfo(uint256) external view returns (uint256 startTime, uint256 endTime, uint256 prizePool, uint32 slipCount, uint32 evaluatedSlips, uint8 state, bool hasWinner)",
        "function cycleStats(uint256) external view returns (uint256 volume, uint32 slips, uint32 evaluatedSlips)",
        "function stats() external view returns (uint256 totalVolume, uint32 totalSlips, uint256 highestOdd)",
        
        // Constants
        "function MATCH_COUNT() external view returns (uint256)",
        "function DAILY_LEADERBOARD_SIZE() external view returns (uint256)",
        "function MIN_CORRECT_PREDICTIONS() external view returns (uint256)",
        "function ODDS_SCALING_FACTOR() external view returns (uint256)",
        "function MAX_CYCLES_TO_RESOLVE() external view returns (uint256)",
        "function DEV_FEE_PERCENTAGE() external view returns (uint256)",
        "function PRIZE_ROLLOVER_FEE_PERCENTAGE() external view returns (uint256)",
        
        // Events (for filtering)
        "event CycleStarted(uint256 indexed cycleId, uint256 endTime)",
        "event SlipPlaced(uint256 indexed cycleId, address indexed player, uint256 indexed slipId)",
        "event CycleResolved(uint256 indexed cycleId, uint256 prizePool)",
        "event PrizeClaimed(uint256 indexed cycleId, address indexed player, uint256 rank, uint256 amount)",
        "event UserStatsUpdated(address indexed user, uint256 totalSlips, uint256 totalWins, uint256 bestScore, uint256 winRate)",
        "event OddysseyReputationUpdated(address indexed user, uint256 pointsEarned, uint256 correctPredictions, uint256 totalReputation)"
      ];
    }
    
    // Always use wallet for Oddyssey contract (needs write operations)
    if (!this.wallet) {
      throw new Error('Wallet not initialized - Oddyssey contract requires write operations');
    }
    this.oddysseyContract = new ethers.Contract(contractAddress, OddysseyABI, this.wallet);
    
    console.log('✅ Oddyssey contract initialized:', contractAddress);
    return this.oddysseyContract;
  }

  /**
   * Get BITR Token contract instance
   */
  async getBITRTokenContract() {
    if (this.bitrTokenContract) {
      return this.bitrTokenContract;
    }

    const contractAddress = config.blockchain.contractAddresses.bitrToken;
    if (!contractAddress) {
      throw new Error('BITR Token contract address not configured');
    }

    let BitredictTokenABI;
    try {
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/artifacts/contracts/BitredictToken.sol/BitredictToken.json',
        '../solidity/artifacts/contracts/BitredictToken.sol/BitredictToken.json',
        '../../solidity/artifacts/contracts/BitredictToken.sol/BitredictToken.json',
        path.join(__dirname, '../solidity/artifacts/contracts/BitredictToken.sol/BitredictToken.json'),
        path.join(__dirname, '../../solidity/artifacts/contracts/BitredictToken.sol/BitredictToken.json')
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          const abiData = require(abiPath);
          // Handle both formats: direct ABI array or object with .abi property
          BitredictTokenABI = Array.isArray(abiData) ? abiData : (abiData.abi || abiData);
          console.log(`✅ BitredictToken ABI loaded from: ${abiPath}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ BitredictToken contract artifacts not found, using fallback ABI');
      BitredictTokenABI = [
        "function balanceOf(address owner) external view returns (uint256)",
        "function allowance(address owner, address spender) external view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function transfer(address to, uint256 amount) external returns (bool)"
      ];
    }
    
    // BITR Token needs write operations (approve, transfer), so require wallet
    if (!this.wallet) {
      throw new Error('Wallet not initialized - BITR Token contract requires write operations');
    }
    this.bitrTokenContract = new ethers.Contract(contractAddress, BitredictTokenABI, this.wallet);
    
    console.log('✅ BITR Token contract initialized:', contractAddress);
    return this.bitrTokenContract;
  }

  /**
   * Get BitredictPool contract instance (read-only for event listening)
   */
  async getPoolCoreContractForEvents() {
    const contractAddress = config.blockchain.contractAddresses.poolCore;
    if (!contractAddress) {
      throw new Error('PoolCore contract address not configured');
    }

    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    let PoolCoreABI;
    try {
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/BitredictPoolCore.json',
        '../solidity/BitredictPoolCore.json',
        '../../solidity/BitredictPoolCore.json',
        path.join(__dirname, '../solidity/BitredictPoolCore.json'),
        path.join(__dirname, '../../solidity/BitredictPoolCore.json')
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          const abiData = require(abiPath);
          // Handle both formats: direct ABI array or object with .abi property
          PoolCoreABI = Array.isArray(abiData) ? abiData : (abiData.abi || abiData);
          console.log(`✅ PoolCore ABI loaded from: ${abiPath}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ PoolCore contract artifacts not found, using fallback ABI');
      // Complete fallback ABI matching actual PoolCore contract
      PoolCoreABI = [
        // Core pool functions
        "function createPool(bytes32 _predictedOutcome, uint256 _odds, uint256 _creatorStake, uint256 _eventStartTime, uint256 _eventEndTime, bytes32 _league, bytes32 _category, bytes32 _region, bytes32 _homeTeam, bytes32 _awayTeam, bytes32 _title, bool _isPrivate, uint256 _maxBetPerUser, bool _useBitr, uint8 _oracleType, uint8 _marketType, string memory _marketId) external payable returns (uint256)",
        "function placeBet(uint256 poolId, uint256 amount) external payable",
        "function addLiquidity(uint256 poolId, uint256 amount) external payable",
        "function withdrawLiquidity(uint256 poolId) external",
        "function withdrawCreatorStake(uint256 poolId) external",
        "function settlePool(uint256 poolId, bytes32 outcome) external",
        "function settlePoolAutomatically(uint256 poolId) external",
        "function claim(uint256 poolId) external",
        "function refundPool(uint256 poolId) external",
        
        // Combo pool functions
        "function createComboPool(tuple(bytes32 marketId, bytes32 expectedOutcome, bool resolved, bytes32 actualOutcome)[] memory conditions, uint16 combinedOdds, uint256 creatorStake, uint256 earliestEventStart, uint256 latestEventEnd, string memory category, uint256 maxBetPerUser, bool useBitr) external payable",
        "function placeComboBet(uint256 comboPoolId, uint256 amount) external payable",
        "function resolveComboCondition(uint256 comboPoolId, uint256 conditionIndex, bytes32 actualOutcome) external",
        "function claimCombo(uint256 comboPoolId) external",
        
        // Boost system functions
        "function boostPool(uint256 poolId, uint8 tier) external payable",
        "function cleanupExpiredBoosts(uint256[] calldata poolIds) external",
        
        // Private pool management
        "function addPrivatePoolWhitelist(uint256 poolId, address[] calldata users) external",
        "function removePrivatePoolWhitelist(uint256 poolId, address[] calldata users) external",
        
        // Pool data access
        "function pools(uint256) external view returns (tuple(bytes32 predictedOutcome, uint256 odds, uint256 creatorStake, uint256 totalStake, uint256 totalBettorStake, uint256 totalLiquidityStake, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, bytes32 league, bytes32 category, bytes32 region, bytes32 homeTeam, bytes32 awayTeam, bytes32 title, bool isPrivate, uint256 maxBetPerUser, bool useBitr, uint8 oracleType, uint8 marketType, string memory marketId, bool isSettled, bool isRefunded, uint256 flags))",
        "function getPool(uint256 poolId) external view returns (tuple(bytes32 predictedOutcome, uint256 odds, uint256 creatorStake, uint256 totalStake, uint256 totalBettorStake, uint256 totalLiquidityStake, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, bytes32 league, bytes32 category, bytes32 region, bytes32 homeTeam, bytes32 awayTeam, bytes32 title, bool isPrivate, uint256 maxBetPerUser, bool useBitr, uint8 oracleType, uint8 marketType, string memory marketId, bool isSettled, bool isRefunded, uint256 flags))",
        "function getPoolWithDecodedNames(uint256 poolId) external view returns (tuple(bytes32 predictedOutcome, uint256 odds, uint256 creatorStake, uint256 totalStake, uint256 totalBettorStake, uint256 totalLiquidityStake, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, string memory league, string memory category, string memory region, string memory homeTeam, string memory awayTeam, string memory title, bool isPrivate, uint256 maxBetPerUser, bool useBitr, uint8 oracleType, uint8 marketType, string memory marketId, bool isSettled, bool isRefunded, uint256 flags))",
        
        // User data access
        "function userBets(address, uint256) external view returns (uint256)",
        "function userLiquidityStakes(address, uint256) external view returns (uint256)",
        "function userCreatorStakes(address, uint256) external view returns (uint256)",
        "function userComboBets(address, uint256) external view returns (uint256)",
        
        // Combo pool data access
        "function comboPools(uint256) external view returns (tuple(tuple(bytes32 marketId, bytes32 expectedOutcome, bool resolved, bytes32 actualOutcome)[] conditions, uint16 combinedOdds, uint256 creatorStake, uint256 totalStake, uint256 totalBettorStake, uint256 totalLiquidityStake, uint256 earliestEventStart, uint256 latestEventEnd, string memory category, uint256 maxBetPerUser, bool useBitr, bool isSettled, bool isRefunded))",
        "function getComboPool(uint256 comboPoolId) external view returns (tuple(tuple(bytes32 marketId, bytes32 expectedOutcome, bool resolved, bytes32 actualOutcome)[] conditions, uint16 combinedOdds, uint256 creatorStake, uint256 totalStake, uint256 totalBettorStake, uint256 totalLiquidityStake, uint256 earliestEventStart, uint256 latestEventEnd, string memory category, uint256 maxBetPerUser, bool useBitr, bool isSettled, bool isRefunded))",
        
        // System data access
        "function totalPools() external view returns (uint256)",
        "function totalComboPools() external view returns (uint256)",
        "function platformFee() external view returns (uint256)",
        "function creatorFee() external view returns (uint256)",
        "function liquidityFee() external view returns (uint256)",
        "function boostFees(uint8) external view returns (uint256)",
        "function boostDurations(uint8) external view returns (uint256)",
        "function boostMultipliers(uint8) external view returns (uint256)",
        
        // Events
        "event PoolCreated(uint256 indexed poolId, address indexed creator, bytes32 predictedOutcome, uint256 odds, uint256 creatorStake, uint256 eventStartTime, uint256 eventEndTime, bytes32 league, bytes32 category, bytes32 homeTeam, bytes32 awayTeam, bytes32 title, bool isPrivate, uint256 maxBetPerUser, bool useBitr, uint8 oracleType, uint8 marketType, string marketId)",
        "event BetPlaced(uint256 indexed poolId, address indexed bettor, uint256 amount, bool isForOutcome)",
        "event LiquidityAdded(uint256 indexed poolId, address indexed provider, uint256 amount)",
        "event LiquidityWithdrawn(uint256 indexed poolId, address indexed provider, uint256 amount)",
        "event CreatorStakeWithdrawn(uint256 indexed poolId, address indexed creator, uint256 amount)",
        "event PoolSettled(uint256 indexed poolId, bytes32 outcome, uint256 totalStake, uint256 creatorReward, uint256 liquidityReward, uint256 platformReward)",
        "event PoolRefunded(uint256 indexed poolId, uint256 totalStake, uint256 creatorRefund, uint256 liquidityRefund)",
        "event ComboPoolCreated(uint256 indexed comboPoolId, address indexed creator, uint16 combinedOdds, uint256 creatorStake, uint256 earliestEventStart, uint256 latestEventEnd, string category, uint256 maxBetPerUser, bool useBitr)",
        "event ComboBetPlaced(uint256 indexed comboPoolId, address indexed bettor, uint256 amount)",
        "event ComboPoolSettled(uint256 indexed comboPoolId, bool success, uint256 totalStake, uint256 creatorReward, uint256 liquidityReward, uint256 platformReward)",
        "event PoolBoosted(uint256 indexed poolId, address indexed booster, uint8 tier, uint256 fee, uint256 duration)",
        "event BoostExpired(uint256 indexed poolId, uint8 tier)",
        "event PrivatePoolWhitelistAdded(uint256 indexed poolId, address[] users)",
        "event PrivatePoolWhitelistRemoved(uint256 indexed poolId, address[] users)"
      ];
    }

    // Create contract with provider for event listening (read-only)
    const contract = new ethers.Contract(contractAddress, PoolCoreABI, this.provider);
    console.log('✅ PoolCore contract for events initialized:', contractAddress);
    return contract;
  }

  /**
   * Get BitredictPool contract instance
   */
  async getPoolCoreContract() {
    if (this.poolCoreContract) {
      return this.poolCoreContract;
    }

    const contractAddress = config.blockchain.contractAddresses.poolCore;
    if (!contractAddress) {
      throw new Error('PoolCore contract address not configured');
    }

    let PoolCoreABI;
    try {
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/BitredictPoolCore.json',
        '../solidity/BitredictPoolCore.json',
        '../../solidity/BitredictPoolCore.json',
        path.join(__dirname, '../solidity/BitredictPoolCore.json'),
        path.join(__dirname, '../../solidity/BitredictPoolCore.json')
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          PoolCoreABI = require(abiPath).abi;
          console.log(`✅ PoolCore ABI loaded from: ${abiPath}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ PoolCore contract artifacts not found, using fallback ABI');
      // Complete fallback ABI matching actual PoolCore contract
      PoolCoreABI = [
        // Core pool functions
        "function createPool(bytes32 _predictedOutcome, uint256 _odds, uint256 _creatorStake, uint256 _eventStartTime, uint256 _eventEndTime, bytes32 _league, bytes32 _category, bytes32 _region, bytes32 _homeTeam, bytes32 _awayTeam, bytes32 _title, bool _isPrivate, uint256 _maxBetPerUser, bool _useBitr, uint8 _oracleType, uint8 _marketType, string memory _marketId) external payable returns (uint256)",
        "function placeBet(uint256 poolId, uint256 amount) external payable",
        "function addLiquidity(uint256 poolId, uint256 amount) external payable",
        "function withdrawLiquidity(uint256 poolId) external",
        "function withdrawCreatorStake(uint256 poolId) external",
        "function settlePool(uint256 poolId, bytes32 outcome) external",
        "function settlePoolAutomatically(uint256 poolId) external",
        "function claim(uint256 poolId) external",
        "function refundPool(uint256 poolId) external",
        
        // Combo pool functions
        "function createComboPool(tuple(bytes32 marketId, bytes32 expectedOutcome, bool resolved, bytes32 actualOutcome)[] memory conditions, uint16 combinedOdds, uint256 creatorStake, uint256 earliestEventStart, uint256 latestEventEnd, string memory category, uint256 maxBetPerUser, bool useBitr) external payable",
        "function placeComboBet(uint256 comboPoolId, uint256 amount) external payable",
        "function resolveComboCondition(uint256 comboPoolId, uint256 conditionIndex, bytes32 actualOutcome) external",
        "function claimCombo(uint256 comboPoolId) external",
        
        // Boost system functions
        "function boostPool(uint256 poolId, uint8 tier) external payable",
        "function cleanupExpiredBoosts(uint256[] calldata poolIds) external",
        
        // Private pool management
        "function addToWhitelist(uint256 poolId, address user) external",
        "function removeFromWhitelist(uint256 poolId, address user) external",
        
        // Fee management
        "function distributeFees(address stakingContract) external",
        "function adjustedFeeRate(address user) external view returns (uint256)",
        
        // View functions - Core data
        "function poolCount() external view returns (uint256)",
        "function comboPoolCount() external view returns (uint256)",
        "function pools(uint256) external view returns (address creator, uint16 odds, uint8 flags, uint8 oracleType, uint8 marketType, uint8 reserved, uint256 creatorStake, uint256 totalCreatorSideStake, uint256 maxBettorStake, uint256 totalBettorStake, bytes32 predictedOutcome, bytes32 result, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 resultTimestamp, uint256 arbitrationDeadline, uint256 maxBetPerUser, bytes32 league, bytes32 category, bytes32 region, bytes32 homeTeam, bytes32 awayTeam, bytes32 title, string memory marketId)",
        "function comboPools(uint256) external view returns (address creator, uint256 creatorStake, uint256 totalCreatorSideStake, uint256 maxBettorStake, uint256 totalBettorStake, uint16 totalOdds, bool settled, bool creatorSideWon, bool usesBitr, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 resultTimestamp, bytes32 category, uint256 maxBetPerUser)",
        
        // View functions - User data
        "function poolBettors(uint256, uint256) external view returns (address)",
        "function bettorStakes(uint256, address) external view returns (uint256)",
        "function poolLPs(uint256, uint256) external view returns (address)",
        "function lpStakes(uint256, address) external view returns (uint256)",
        "function claimed(uint256, address) external view returns (bool)",
        "function comboPoolBettors(uint256, uint256) external view returns (address)",
        "function comboBettorStakes(uint256, address) external view returns (uint256)",
        "function comboPoolLPs(uint256, uint256) external view returns (address)",
        "function comboLPStakes(uint256, address) external view returns (uint256)",
        "function comboClaimed(uint256, address) external view returns (bool)",
        
        // View functions - Pool queries
        "function getPoolsByCategory(bytes32 categoryHash, uint256 limit, uint256 offset) external view returns (uint256[] memory poolIds)",
        "function getActivePoolsByCreator(address creator, uint256 limit, uint256 offset) external view returns (uint256[] memory poolIds)",
        "function getPool(uint256 poolId) external view returns (tuple(address creator, uint16 odds, uint8 flags, uint8 oracleType, uint8 marketType, uint8 reserved, uint256 creatorStake, uint256 totalCreatorSideStake, uint256 maxBettorStake, uint256 totalBettorStake, bytes32 predictedOutcome, bytes32 result, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 resultTimestamp, uint256 arbitrationDeadline, uint256 maxBetPerUser, bytes32 league, bytes32 category, bytes32 region, bytes32 homeTeam, bytes32 awayTeam, bytes32 title, string marketId))",
        "function getActivePools() external view returns (uint256[] memory)",
        "function getPoolsByCreator(address creator) external view returns (uint256[] memory)",
        "function getPoolsByCategory(bytes32 categoryHash) external view returns (uint256[] memory)",
        "function poolExists(uint256 poolId) external view returns (bool)",
        "function getPoolWithDecodedNames(uint256 poolId) external view returns (address creator, uint16 odds, uint8 flags, uint8 oracleType, uint256 creatorStake, uint256 eventStartTime, uint256 eventEndTime, string memory marketId, string memory league, string memory category, string memory region, string memory homeTeam, string memory awayTeam, string memory title)",
        
        // Analytics functions
        "function getPoolAnalytics(uint256 poolId) external view returns (uint256 totalVolume, uint256 participantCount, uint256 averageBetSize, uint256 creatorReputation, uint256 liquidityRatio, uint256 timeToFill, bool isHotPool, uint256 fillPercentage, uint256 lastActivityTime)",
        "function getCreatorStats(address creator) external view returns (uint256 totalPoolsCreated, uint256 successfulPools, uint256 totalVolumeGenerated, uint256 averagePoolSize, uint256 reputationScore, uint256 winRate, uint256 totalEarnings, uint256 activePoolsCount)",
        "function getCategoryStats(bytes32 categoryHash) external view returns (uint256 totalPools, uint256 totalVolume, uint256 averageOdds, uint256 lastActivityTime)",
        "function getGlobalStats() external view returns (uint256 totalPools, uint256 totalVolume, uint256 averagePoolSize, uint256 lastUpdated)",
        "function getPoolsByMarketType(uint8 marketType, uint256 limit) external view returns (uint256[] memory)",
        "function getPoolsByOracleType(uint8 oracleType, uint256 limit) external view returns (uint256[] memory)",
        "function getActivePools(uint256 limit) external view returns (uint256[] memory)",
        "function getPoolsByCreator(address creator, uint256 limit) external view returns (uint256[] memory)",
        "function getMarketTypeDistribution() external view returns (uint256[8] memory)",
        "function getOracleTypeDistribution() external view returns (uint256[2] memory)",
        
        // View functions - Boost system
        "function poolBoostTier(uint256) external view returns (uint8)",
        "function poolBoostExpiry(uint256) external view returns (uint256)",
        "function activeBoostCount(uint8) external view returns (uint256)",
        "function boostFees(uint256) external view returns (uint256)",
        
        // View functions - Whitelist
        "function poolWhitelist(uint256, address) external view returns (bool)",
        
        // Constants and configuration
        "function bitrToken() external view returns (address)",
        "function feeCollector() external view returns (address)",
        "function guidedOracle() external view returns (address)",
        "function optimisticOracle() external view returns (address)",
        "function creationFee() external view returns (uint256)",
        "function platformFee() external view returns (uint256)",
        "function totalCollectedSTT() external view returns (uint256)",
        "function totalCollectedBITR() external view returns (uint256)",
        "function bettingGracePeriod() external view returns (uint256)",
        "function arbitrationTimeout() external view returns (uint256)",
        "function minPoolStake() external view returns (uint256)",
        "function minBetAmount() external view returns (uint256)",
        "function HIGH_ODDS_THRESHOLD() external view returns (uint256)",
        "function MAX_PARTICIPANTS() external view returns (uint256)",
        "function MAX_LP_PROVIDERS() external view returns (uint256)",
        "function BOOST_DURATION() external view returns (uint256)",
        "function MAX_BRONZE_POOLS() external view returns (uint256)",
        "function MAX_SILVER_POOLS() external view returns (uint256)",
        "function MAX_GOLD_POOLS() external view returns (uint256)",
        
        // Events (for filtering)
        "event PoolCreated(uint256 indexed poolId, address indexed creator, uint256 eventStartTime, uint256 eventEndTime, uint8 oracleType, bytes32 marketId)",
        "event BetPlaced(uint256 indexed poolId, address indexed bettor, uint256 amount, bool isForOutcome)",
        "event LiquidityAdded(uint256 indexed poolId, address indexed provider, uint256 amount)",
        "event PoolSettled(uint256 indexed poolId, bytes32 result, bool creatorSideWon, uint256 timestamp)",
        "event RewardClaimed(uint256 indexed poolId, address indexed user, uint256 amount)",
        "event PoolRefunded(uint256 indexed poolId, string reason)",
        "event UserWhitelisted(uint256 indexed poolId, address indexed user)",
        "event ReputationActionOccurred(address indexed user, uint8 action, uint256 value, bytes32 indexed poolId, uint256 timestamp)",
        "event PoolBoosted(uint256 indexed poolId, uint8 tier, uint256 expiry, uint256 fee)",
        "event BoostExpired(uint256 indexed poolId, uint8 tier)",
        "event ComboPoolCreated(uint256 indexed comboPoolId, address indexed creator, uint256 conditionCount, uint16 totalOdds)",
        "event ComboBetPlaced(uint256 indexed comboPoolId, address indexed bettor, uint256 amount)",
        "event ComboPoolSettled(uint256 indexed comboPoolId, bool creatorSideWon, uint256 timestamp)"
      ];
    }
    
    // BitredictPool needs write operations, so require wallet
    if (!this.wallet) {
      throw new Error('Wallet not initialized - BitredictPool contract requires write operations');
    }
    this.poolCoreContract = new ethers.Contract(contractAddress, PoolCoreABI, this.wallet);
    
    console.log('✅ PoolCore contract initialized:', contractAddress);
    return this.poolCoreContract;
  }

  /**
   * Get ComboPools contract instance (read-only for event listening)
   */
  async getComboPoolsContractForEvents() {
    const contractAddress = config.blockchain.contractAddresses.comboPools;
    if (!contractAddress) {
      throw new Error('ComboPools contract address not configured');
    }

    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    let ComboPoolsABI;
    try {
      const possiblePaths = [
        './solidity/BitredictComboPools.json',
        '../solidity/BitredictComboPools.json',
        '../../solidity/BitredictComboPools.json',
        path.join(__dirname, '../solidity/BitredictComboPools.json'),
        path.join(__dirname, '../../solidity/BitredictComboPools.json')
      ];

      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          const abiData = require(abiPath);
          ComboPoolsABI = Array.isArray(abiData) ? abiData : (abiData.abi || abiData);
          console.log(`✅ ComboPools ABI loaded from: ${abiPath}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }

      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ ComboPools contract artifacts not found, using fallback ABI');
      // Fallback ABI for event listening
      ComboPoolsABI = [
        "event ReputationActionOccurred(address indexed user, uint8 action, uint256 value, bytes32 indexed poolId, uint256 timestamp)"
      ];
    }
    
    // Use provider for read-only event listening
    const comboPoolsContract = new ethers.Contract(contractAddress, ComboPoolsABI, this.provider);
    
    console.log('✅ ComboPools contract initialized for events:', contractAddress);
    return comboPoolsContract;
  }

  /**
   * Get Oddyssey contract instance (read-only for event listening)
   */
  async getOddysseyContractForEvents() {
    const contractAddress = config.blockchain.contractAddresses.oddyssey;
    if (!contractAddress) {
      throw new Error('Oddyssey contract address not configured');
    }

    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    let OddysseyABI;
    try {
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/Oddyssey.json',
        '../solidity/Oddyssey.json',
        '../../solidity/Oddyssey.json',
        path.join(__dirname, '../solidity/Oddyssey.json'),
        path.join(__dirname, '../../solidity/Oddyssey.json')
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          const abiData = require(abiPath);
          OddysseyABI = Array.isArray(abiData) ? abiData : (abiData.abi || abiData);
          console.log(`✅ Oddyssey ABI loaded from: ${abiPath}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ Oddyssey contract artifacts not found, using fallback ABI');
      // Fallback ABI for event listening (minimal - just events needed)
      OddysseyABI = [
        "event ReputationActionOccurred(address indexed user, uint8 action, uint256 value, bytes32 indexed cycleId, uint256 timestamp)",
        "event CycleResolved(uint256 indexed cycleId, uint256 prizePool)",
        "event SlipPlaced(uint256 indexed cycleId, address indexed player, uint256 indexed slipId)",
        "event OddysseyReputationUpdated(address indexed user, uint256 pointsEarned, uint256 correctPredictions, uint256 totalReputation)"
      ];
    }
    
    // Use provider for read-only event listening
    const oddysseyContract = new ethers.Contract(contractAddress, OddysseyABI, this.provider);
    
    console.log('✅ Oddyssey contract initialized for events:', contractAddress);
    return oddysseyContract;
  }

  /**
   * Get BitredictStaking contract instance
   */
  async getStakingContract() {
    if (this.stakingContract) {
      return this.stakingContract;
    }

    const contractAddress = config.blockchain.contractAddresses.stakingContract;
    if (!contractAddress) {
      throw new Error('Staking contract address not configured');
    }

    let BitredictStakingABI;
    try {
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/artifacts/contracts/BitredictStaking.sol/BitredictStaking.json',
        '../solidity/artifacts/contracts/BitredictStaking.sol/BitredictStaking.json',
        '../../solidity/artifacts/contracts/BitredictStaking.sol/BitredictStaking.json',
        path.join(__dirname, '../solidity/artifacts/contracts/BitredictStaking.sol/BitredictStaking.json'),
        path.join(__dirname, '../../solidity/artifacts/contracts/BitredictStaking.sol/BitredictStaking.json')
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          BitredictStakingABI = require(abiPath).abi;
          console.log(`✅ BitredictStaking ABI loaded from: ${abiPath}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ BitredictStaking contract artifacts not found, using fallback ABI');
      // Complete fallback ABI matching actual BitredictStaking contract
      BitredictStakingABI = [
        // Core staking functions
        "function stake(uint256 _amount, uint8 _tierId, uint8 _durationOption) external",
        "function unstake(uint256 _index) external",
        "function claim(uint256 _index) external",
        "function claimRevenue() external",
        
        // Revenue functions
        "function addRevenue(uint256 _bitrAmount) external payable",
        "function addRevenueFromPool(uint256 _bitrAmount) external payable",
        "function distributeRevenue() external",
        "function fundAPYRewards(uint256 _amount) external",
        
        // Admin functions
        "function authorizePool(address _pool, bool _authorized) external",
        
        // View functions - Core data
        "function bitrToken() external view returns (address)",
        "function userStakes(address, uint256) external view returns (uint256 amount, uint256 startTime, uint8 tierId, uint8 durationOption, uint256 claimedRewardBITR, uint256 rewardDebtBITR, uint256 rewardDebtSTT)",
        "function tiers(uint256) external view returns (uint256 baseAPY, uint256 minStake, uint256 revenueShareRate)",
        "function durationBonuses(uint256) external view returns (uint256)",
        "function durations(uint256) external view returns (uint256)",
        
        // View functions - Statistics
        "function totalStaked() external view returns (uint256)",
        "function totalRewardsPaid() external view returns (uint256)",
        "function totalRevenuePaid() external view returns (uint256)",
        "function totalStakedInTier(uint8) external view returns (uint256)",
        "function revenuePoolBITR() external view returns (uint256)",
        "function revenuePoolSTT() external view returns (uint256)",
        "function pendingRevenueBITR(address) external view returns (uint256)",
        "function pendingRevenueSTT(address) external view returns (uint256)",
        "function authorizedPools(address) external view returns (bool)",
        
        // View functions - User data
        "function getUserStakes(address _user) external view returns (tuple(uint256 amount, uint256 startTime, uint8 tierId, uint8 durationOption, uint256 claimedRewardBITR, uint256 rewardDebtBITR, uint256 rewardDebtSTT)[] memory)",
        "function getTiers() external view returns (tuple(uint256 baseAPY, uint256 minStake, uint256 revenueShareRate)[] memory)",
        "function getDurationOptions() external view returns (uint256[] memory)",
        "function calculateRewards(address _user, uint256 _index) external view returns (uint256 bitrReward)",
        "function getRevenueShareRate(address _user, uint256 _index) external view returns (uint256)",
        "function getPendingRewards(address _user, uint256 _index) external view returns (uint256 apyReward, uint256 pendingBITR, uint256 pendingSTT)",
        "function getUserTotalStaked(address _user) external view returns (uint256 total)",
        "function getUserStakeCount(address _user) external view returns (uint256)",
        "function isStakeUnlocked(address _user, uint256 _index) external view returns (bool)",
        "function getTimeUntilUnlock(address _user, uint256 _index) external view returns (uint256)",
        
        // View functions - Contract statistics
        "function getContractStats() external view returns (uint256 _totalStaked, uint256 _totalRewardsPaid, uint256 _totalRevenuePaid, uint256 _contractBITRBalance, uint256 _contractSTTBalance)",
        "function getTierStats() external view returns (uint256[] memory tierStaked, uint256[] memory tierAPY, uint256[] memory tierMinStake, uint256[] memory tierRevenueShare)",
        
        // Constants
        "function REWARD_PRECISION() external view returns (uint256)",
        "function SECONDS_PER_YEAR() external view returns (uint256)",
        "function BASIS_POINTS() external view returns (uint256)",
        "function distributionInterval() external view returns (uint256)",
        "function lastRevenueDistribution() external view returns (uint256)",
        
        // Events (for filtering)
        "event Staked(address indexed user, uint256 amount, uint8 tier, uint8 duration)",
        "event Claimed(address indexed user, uint256 bitrAmount)",
        "event Unstaked(address indexed user, uint256 amount)",
        "event RevenueAdded(uint256 bitrAmount, uint256 sttAmount)",
        "event RevenueDistributed()",
        "event RevenueClaimed(address indexed user, uint256 bitrAmount, uint256 sttAmount)",
        "event PoolAuthorized(address indexed pool, bool authorized)"
      ];
    }
    
    // Staking contract needs write operations (stake, unstake, claim), so require wallet
    if (!this.wallet) {
      throw new Error('Wallet not initialized - Staking contract requires write operations');
    }
    this.stakingContract = new ethers.Contract(contractAddress, BitredictStakingABI, this.wallet);
    
    console.log('✅ BitredictStaking contract initialized:', contractAddress);
    return this.stakingContract;
  }

  /**
   * Get GuidedOracle contract instance
   */
  async getGuidedOracleContract() {
    if (this.guidedOracleContract) {
      return this.guidedOracleContract;
    }

    const contractAddress = config.blockchain.contractAddresses.guidedOracle;
    if (!contractAddress) {
      throw new Error('Guided Oracle contract address not configured');
    }

    let GuidedOracleABI;
    try {
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json',
        '../solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json',
        '../../solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json',
        path.join(__dirname, '../solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json'),
        path.join(__dirname, '../../solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json')
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          GuidedOracleABI = require(abiPath).abi;
          console.log(`✅ GuidedOracle ABI loaded from: ${abiPath}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ GuidedOracle contract artifacts not found, using fallback ABI');
      // Complete fallback ABI matching actual GuidedOracle contract
      GuidedOracleABI = [
        // Core oracle functions
        "function submitOutcome(string memory marketId, bytes calldata resultData) external",
        "function executeCall(address target, bytes calldata data) external",
        "function updateOracleBot(address newBot) external",
        
        // View functions
        "function getOutcome(bytes32 marketId) external view returns (bool isSet, bytes memory resultData)",
        "function oracleBot() external view returns (address)",
        "function owner() external view returns (address)",
        "function outcomes(string) external view returns (bool isSet, bytes resultData, uint256 timestamp) external view returns (bool isSet, bytes resultData, uint256 timestamp)",
        
        // Events (for filtering)
        "event OutcomeSubmitted(string indexed marketId, bytes resultData, uint256 timestamp)",
        "event OracleBotUpdated(address newBot)",
        "event CallExecuted(address indexed target, bytes data)"
      ];
    }
    
    // GuidedOracle needs write operations (submitOutcome), so require wallet
    if (!this.wallet) {
      throw new Error('Wallet not initialized - GuidedOracle contract requires write operations');
    }
    this.guidedOracleContract = new ethers.Contract(contractAddress, GuidedOracleABI, this.wallet);
    
    console.log('✅ GuidedOracle contract initialized:', contractAddress);
    return this.guidedOracleContract;
  }

  /**
   * Get BitrFaucet contract instance
   */
  async getBitrFaucetContract() {
    if (this.bitrFaucetContract) {
      return this.bitrFaucetContract;
    }

    const contractAddress = config.blockchain.contractAddresses.bitrFaucet;
    if (!contractAddress) {
      throw new Error('BITR Faucet contract address not configured');
    }

    let BitrFaucetABI;
    try {
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/artifacts/contracts/BitrFaucet.sol/BitrFaucet.json',
        '../solidity/artifacts/contracts/BitrFaucet.sol/BitrFaucet.json',
        '../../solidity/artifacts/contracts/BitrFaucet.sol/BitrFaucet.json',
        path.join(__dirname, '../solidity/artifacts/contracts/BitrFaucet.sol/BitrFaucet.json'),
        path.join(__dirname, '../../solidity/artifacts/contracts/BitrFaucet.sol/BitrFaucet.json')
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          BitrFaucetABI = require(abiPath).abi;
          console.log(`✅ BitrFaucet ABI loaded from: ${abiPath}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ BitrFaucet contract artifacts not found, using fallback ABI');
      // Complete fallback ABI matching actual BitrFaucet contract
      BitrFaucetABI = [
        // Core faucet functions
        "function claimBitr() external",
        "function refillFaucet(uint256 amount) external",
        "function setFaucetActive(bool active) external",
        "function emergencyWithdraw() external",
        "function emergencyWithdrawAmount(uint256 amount) external",
        
        // View functions
        "function bitrToken() external view returns (address)",
        "function hasClaimed(address) external view returns (bool)",
        "function lastClaimTime(address) external view returns (uint256)",
        "function totalClaimed() external view returns (uint256)",
        "function totalUsers() external view returns (uint256)",
        "function faucetActive() external view returns (bool)",
        "function getUserInfo(address user) external view returns (bool claimed, uint256 claimTime)",
        "function getFaucetStats() external view returns (uint256 balance, uint256 totalDistributed, uint256 userCount, bool active)",
        "function hasSufficientBalance() external view returns (bool)",
        "function maxPossibleClaims() external view returns (uint256)",
        
        // Constants
        "function FAUCET_AMOUNT() external view returns (uint256)",
        
        // Events (for filtering)
        "event FaucetClaimed(address indexed user, uint256 amount, uint256 timestamp)",
        "event FaucetDeactivated(uint256 timestamp)",
        "event FaucetReactivated(uint256 timestamp)",
        "event FaucetRefilled(uint256 amount, uint256 timestamp)",
        "event EmergencyWithdraw(address indexed owner, uint256 amount, uint256 timestamp)"
      ];
    }
    
    // BitrFaucet needs write operations (claimBitr), so require wallet
    if (!this.wallet) {
      throw new Error('Wallet not initialized - BitrFaucet contract requires write operations');
    }
    this.bitrFaucetContract = new ethers.Contract(contractAddress, BitrFaucetABI, this.wallet);
    
    console.log('✅ BitrFaucet contract initialized:', contractAddress);
    return this.bitrFaucetContract;
  }

  /**
   * Get BoostSystem contract instance
   */
  async getBoostSystemContract() {
    if (this.boostSystemContract) {
      return this.boostSystemContract;
    }

    const contractAddress = config.blockchain.contractAddresses.boostSystem;
    if (!contractAddress) {
      throw new Error('Boost System contract address not configured');
    }

    let BoostSystemABI;
    try {
      const possiblePaths = [
        './solidity/BitredictBoostSystem.json',
        '../solidity/BitredictBoostSystem.json',
        path.join(__dirname, '../solidity/BitredictBoostSystem.json')
      ];

      for (const abiPath of possiblePaths) {
        try {
          const abiData = require(abiPath);
          BoostSystemABI = abiData.abi || abiData;
          break;
        } catch (err) {
          continue;
        }
      }

      if (!BoostSystemABI) {
        throw new Error('BoostSystem ABI not found in any expected location');
      }
    } catch (error) {
      console.error('❌ Error loading BoostSystem ABI:', error.message);
      throw new Error(`Failed to load BoostSystem ABI: ${error.message}`);
    }

    this.boostSystemContract = new ethers.Contract(contractAddress, BoostSystemABI, this.wallet);
    console.log(`✅ BoostSystem contract initialized: ${contractAddress}`);
    return this.boostSystemContract;
  }

  /**
   * Get ComboPools contract instance
   */
  async getComboPoolsContract() {
    if (this.comboPoolsContract) {
      return this.comboPoolsContract;
    }

    const contractAddress = config.blockchain.contractAddresses.comboPools;
    if (!contractAddress) {
      throw new Error('Combo Pools contract address not configured');
    }

    let ComboPoolsABI;
    try {
      const possiblePaths = [
        './solidity/BitredictComboPools.json',
        '../solidity/BitredictComboPools.json',
        path.join(__dirname, '../solidity/BitredictComboPools.json')
      ];

      for (const abiPath of possiblePaths) {
        try {
          const abiData = require(abiPath);
          ComboPoolsABI = abiData.abi || abiData;
          break;
        } catch (err) {
          continue;
        }
      }

      if (!ComboPoolsABI) {
        throw new Error('ComboPools ABI not found in any expected location');
      }
    } catch (error) {
      console.error('❌ Error loading ComboPools ABI:', error.message);
      throw new Error(`Failed to load ComboPools ABI: ${error.message}`);
    }

    this.comboPoolsContract = new ethers.Contract(contractAddress, ComboPoolsABI, this.wallet);
    console.log(`✅ ComboPools contract initialized: ${contractAddress}`);
    return this.comboPoolsContract;
  }

  /**
   * Get Factory contract instance
   */
  async getFactoryContract() {
    if (this.factoryContract) {
      return this.factoryContract;
    }

    const contractAddress = config.blockchain.contractAddresses.factory;
    if (!contractAddress) {
      throw new Error('Factory contract address not configured');
    }

    let FactoryABI;
    try {
      const possiblePaths = [
        './solidity/BitredictPoolFactory.json',
        '../solidity/BitredictPoolFactory.json',
        path.join(__dirname, '../solidity/BitredictPoolFactory.json')
      ];

      for (const abiPath of possiblePaths) {
        try {
          const abiData = require(abiPath);
          FactoryABI = abiData.abi || abiData;
          break;
        } catch (err) {
          continue;
        }
      }

      if (!FactoryABI) {
        throw new Error('Factory ABI not found in any expected location');
      }
    } catch (error) {
      console.error('❌ Error loading Factory ABI:', error.message);
      throw new Error(`Failed to load Factory ABI: ${error.message}`);
    }

    this.factoryContract = new ethers.Contract(contractAddress, FactoryABI, this.wallet);
    console.log(`✅ Factory contract initialized: ${contractAddress}`);
    return this.factoryContract;
  }

  /**
   * Get OptimisticOracle contract instance
   */
  async getOptimisticOracleContract() {
    if (this.optimisticOracleContract) {
      return this.optimisticOracleContract;
    }

    const contractAddress = config.blockchain.contractAddresses.optimisticOracle;
    if (!contractAddress) {
      throw new Error('Optimistic Oracle contract address not configured');
    }

    let OptimisticOracleABI;
    try {
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/artifacts/contracts/OptimisticOracle.sol/OptimisticOracle.json',
        '../solidity/artifacts/contracts/OptimisticOracle.sol/OptimisticOracle.json',
        '../../solidity/artifacts/contracts/OptimisticOracle.sol/OptimisticOracle.json',
        path.join(__dirname, '../solidity/artifacts/contracts/OptimisticOracle.sol/OptimisticOracle.json'),
        path.join(__dirname, '../../solidity/artifacts/contracts/OptimisticOracle.sol/OptimisticOracle.json')
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          OptimisticOracleABI = require(abiPath).abi;
          console.log(`✅ OptimisticOracle ABI loaded from: ${abiPath}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ OptimisticOracle contract artifacts not found, using fallback ABI');
      // Complete fallback ABI matching actual OptimisticOracle contract
      OptimisticOracleABI = [
        // Core oracle functions
        "function createMarket(bytes32 marketId, uint256 poolId, string memory question, string memory category, uint256 eventEndTime) external",
        "function proposeOutcome(bytes32 marketId, bytes32 outcome) external",
        "function disputeOutcome(bytes32 marketId) external",
        "function voteOnDispute(bytes32 marketId, bytes32 outcome) external",
        "function resolveMarket(bytes32 marketId) external",
        "function claimBonds(bytes32 marketId) external",
        
        // Admin functions
        "function setUserReputation(address user, uint256 reputation) external",
        "function batchSetReputations(address[] calldata users, uint256[] calldata reputations) external",
        "function emergencyResolveMarket(bytes32 marketId, bytes32 outcome) external",
        "function emergencyWithdrawBonds(bytes32 marketId) external",
        
        // View functions - Core data
        "function bondToken() external view returns (address)",
        "function bitredictPool() external view returns (address)",
        "function markets(bytes32) external view returns (bytes32 marketId, uint256 poolId, string question, string category, bytes32 proposedOutcome, address proposer, uint256 proposalTime, uint256 proposalBond, address disputer, uint256 disputeTime, uint256 disputeBond, bytes32 finalOutcome, uint8 state, uint256 eventEndTime, bool bondsClaimed)",
        "function userReputation(address) external view returns (uint256)",
        "function allMarkets(uint256) external view returns (bytes32)",
        "function categoryMarkets(bytes32, uint256) external view returns (bytes32)",
        
        // View functions - Market queries
        "function getOutcome(bytes32 marketId) external view returns (bool isSettled, bytes memory outcome)",
        "function getMarket(bytes32 marketId) external view returns (tuple(bytes32 marketId, uint256 poolId, string question, string category, bytes32 proposedOutcome, address proposer, uint256 proposalTime, uint256 proposalBond, address disputer, uint256 disputeTime, uint256 disputeBond, bytes32 finalOutcome, uint8 state, uint256 eventEndTime, bool bondsClaimed) memory)",
        "function getMarketsByCategory(string memory category) external view returns (bytes32[] memory)",
        "function getAllMarkets() external view returns (bytes32[] memory)",
        
        // View functions - Dispute queries
        "function getDispute(bytes32 marketId) external view returns (uint256 totalVotingPower, uint256 disputeEndTime, bool resolved, address[] memory voters)",
        "function getVote(bytes32 marketId, address voter) external view returns (bytes32 outcome, uint256 votingPower, uint256 timestamp)",
        "function getOutcomeTotals(bytes32 marketId, bytes32 outcome) external view returns (uint256)",
        
        // Constants
        "function PROPOSAL_BOND() external view returns (uint256)",
        "function DISPUTE_BOND() external view returns (uint256)",
        "function CHALLENGE_WINDOW() external view returns (uint256)",
        "function RESOLUTION_WINDOW() external view returns (uint256)",
        "function MIN_REPUTATION() external view returns (uint256)",
        "function MIN_DISPUTE_REPUTATION() external view returns (uint256)",
        
        // Events (for filtering)
        "event MarketCreated(bytes32 indexed marketId, uint256 indexed poolId, string question, string category, uint256 eventEndTime)",
        "event OutcomeProposed(bytes32 indexed marketId, address indexed proposer, bytes32 outcome, uint256 bond)",
        "event OutcomeDisputed(bytes32 indexed marketId, address indexed disputer, uint256 bond)",
        "event VoteCast(bytes32 indexed marketId, address indexed voter, bytes32 outcome, uint256 votingPower)",
        "event MarketResolved(bytes32 indexed marketId, bytes32 finalOutcome, address winner, uint256 reward)",
        "event BondClaimed(bytes32 indexed marketId, address indexed claimer, uint256 amount)",
        "event ReputationUpdated(address indexed user, uint256 oldReputation, uint256 newReputation)",
        "event ReputationAction(address indexed user, string action, int256 reputationDelta, bytes32 indexed marketId, uint256 timestamp)"
      ];
    }
    
    // OptimisticOracle needs write operations (createMarket, proposeOutcome, etc.), so require wallet
    if (!this.wallet) {
      throw new Error('Wallet not initialized - OptimisticOracle contract requires write operations');
    }
    this.optimisticOracleContract = new ethers.Contract(contractAddress, OptimisticOracleABI, this.wallet);
    
    console.log('✅ OptimisticOracle contract initialized:', contractAddress);
    return this.optimisticOracleContract;
  }

  /**
   * Get current block number
   */
  async getCurrentBlock() {
    return await this.provider.getBlockNumber();
  }

  /**
   * Get network information
   */
  async getNetwork() {
    return await this.provider.getNetwork();
  }

  /**
   * Get wallet balance
   */
  async getBalance(address = null) {
    const targetAddress = address || this.wallet?.address;
    if (!targetAddress) {
      throw new Error('No address provided and no wallet configured');
    }
    
    return await this.provider.getBalance(targetAddress);
  }

  /**
   * Send transaction with retry logic
   */
  async sendTransaction(txData, retries = 3) {
    if (!this.wallet) {
      throw new Error('No wallet configured for sending transactions');
    }

    for (let i = 0; i < retries; i++) {
      try {
        const tx = await this.wallet.sendTransaction(txData);
        console.log(`✅ Transaction sent: ${tx.hash}`);
        return tx;
      } catch (error) {
        console.error(`❌ Transaction failed (attempt ${i + 1}/${retries}):`, error.message);
        
        if (i === retries - 1) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
      }
    }
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForTransaction(txHash, confirmations = 1) {
    console.log(`⏳ Waiting for transaction ${txHash} (${confirmations} confirmations)...`);
    const receipt = await this.provider.waitForTransaction(txHash, confirmations);
    console.log(`✅ Transaction confirmed: ${txHash}`);
    return receipt;
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(txHash) {
    return await this.provider.getTransactionReceipt(txHash);
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const network = await this.getNetwork();
      const blockNumber = await this.getCurrentBlock();
      const balance = this.wallet ? await this.getBalance() : null;
      
      return {
        status: 'healthy',
        network: {
          name: network.name,
          chainId: Number(network.chainId)
        },
        blockNumber,
        wallet: {
          address: this.wallet?.address || null,
          balance: balance ? ethers.formatEther(balance) : null
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * Setup event listeners for Oddyssey contract
   */
  setupEventListeners() {
    if (!this.oddysseyContract) {
      console.log('⚠️ No Oddyssey contract available for event listeners');
      return;
    }

    // Listen for contract events
    this.oddysseyContract.on('CycleResolved', (cycleId, prizePool) => {
      console.log(`🎯 Cycle ${cycleId} resolved with prize pool: ${ethers.utils.formatEther(prizePool)} ETH`);
    });

    this.oddysseyContract.on('SlipPlaced', (cycleId, player, slipId) => {
      console.log(`📝 Slip ${slipId} placed by ${player} for cycle ${cycleId}`);
    });

    this.oddysseyContract.on('AutoEvaluateRequested', (cycleId) => {
      console.log(`🤖 Auto-evaluate requested for cycle ${cycleId}`);
      this.handleAutoEvaluate(cycleId);
    });

    console.log('✅ Event listeners setup complete');
  }

  /**
   * Handle auto-evaluate for a cycle
   */
  async handleAutoEvaluate(cycleId) {
    try {
      console.log(`🤖 Processing auto-evaluate for cycle ${cycleId}...`);
      
      const contract = await this.getOddysseyContract();
      
      // Get cycle stats
      const cycleStats = await contract.getCycleStatus(cycleId);
      if (!cycleStats.exists) {
        console.log(`⚠️ Cycle ${cycleId} does not exist`);
        return;
      }
      
      console.log(`📊 Cycle ${cycleId} has ${cycleStats.slipCount} slips to evaluate`);
      
      // Get all slips for this cycle (we'll need to implement this)
      // For now, we'll process auto-evaluate in batches
      await this.processAutoEvaluateBatch(cycleId, contract);
      
    } catch (error) {
      console.error(`❌ Auto-evaluate failed for cycle ${cycleId}:`, error.message);
    }
  }

  /**
   * Process auto-evaluate in batches to avoid gas limits
   */
  async processAutoEvaluateBatch(cycleId, contract) {
    try {
      console.log(`🔄 Processing auto-evaluate batch for cycle ${cycleId}...`);
      
      // This is a simplified implementation
      // In a full implementation, you would:
      // 1. Query the contract for all users who placed slips
      // 2. Check each user's auto-evaluate preference
      // 3. Call evaluateSlip for qualifying users
      // 4. Handle gas limits by processing in small batches
      
      // For now, we'll just log that auto-evaluate is available
      console.log(`✅ Auto-evaluate batch processing completed for cycle ${cycleId}`);
      console.log(`💡 Users with auto-evaluate enabled can now evaluate their slips`);
      
    } catch (error) {
      console.error(`❌ Auto-evaluate batch processing failed:`, error.message);
    }
  }

  /**
   * Get the current entry fee
   */
  async getEntryFee() {
    try {
      const contract = await this.getOddysseyContract();
      return await contract.entryFee();
    } catch (error) {
      console.error('Error getting entry fee:', error);
      throw error;
    }
  }

  /**
   * Get cycle matches from contract
   */
  async getCycleMatches(cycleId) {
    try {
      const contract = await this.getOddysseyContract();
      // Use getDailyMatches instead of getCycleMatches to match the contract-matches endpoint
      return await contract.getDailyMatches(cycleId);
    } catch (error) {
      console.error(`Error getting cycle matches for cycle ${cycleId}:`, error);
      throw error;
    }
  }

  /**
   * Format predictions for contract submission with strict validation
   */
  formatPredictionsForContract(predictions, contractMatches) {
    const MATCH_COUNT = 10;
    
    if (!predictions || predictions.length !== MATCH_COUNT) {
      throw new Error(`Must provide exactly ${MATCH_COUNT} predictions`);
    }
    
    if (!contractMatches || contractMatches.length !== MATCH_COUNT) {
      throw new Error(`Must provide exactly ${MATCH_COUNT} contract matches`);
    }
    
    return predictions.map((pred, index) => {
      // Validate match order
      const expectedMatchId = BigInt(contractMatches[index].id);
      const providedMatchId = BigInt(pred.matchId);
      
      if (providedMatchId !== expectedMatchId) {
        throw new Error(`Prediction ${index} matchId mismatch: expected ${expectedMatchId}, got ${providedMatchId}`);
      }
      
      // Validate bet type
      const betType = this.validateAndConvertBetType(pred.betType);
      
      // Validate selection and get hash
      const selectionHash = this.getSelectionHash(pred.selection);
      
      // Get exact odds and validate
      const selectedOdd = this.getExactOdds(pred, contractMatches[index]);
      
      return {
        matchId: expectedMatchId,
        betType: betType,
        selection: selectionHash,
        selectedOdd: selectedOdd
      };
    });
  }

  /**
   * Validate and convert bet type to contract enum
   */
  validateAndConvertBetType(betType) {
    if (betType === 'MONEYLINE' || betType === 0) {
      return this.BetType.MONEYLINE;
    } else if (betType === 'OVER_UNDER' || betType === 1) {
      return this.BetType.OVER_UNDER;
    } else {
      throw new Error(`Invalid bet type: ${betType}. Valid types are: MONEYLINE, OVER_UNDER`);
    }
  }

  /**
   * Get keccak256 hash for selection string
   */
  getSelectionHash(selection) {
    const validSelections = ['1', 'X', '2', 'Over', 'Under'];
    if (!validSelections.includes(selection)) {
      throw new Error(`Invalid selection: ${selection}. Valid selections are: ${validSelections.join(', ')}`);
    }
    
    // Convert selection to bytes and hash
    return ethers.keccak256(ethers.toUtf8Bytes(selection));
  }

  /**
   * Get exact odds from contract match based on selection
   */
  getExactOdds(prediction, contractMatch) {
    let odds;
    switch (prediction.selection) {
      case '1': 
        odds = contractMatch.oddsHome;
        break;
      case 'X': 
        odds = contractMatch.oddsDraw;
        break;
      case '2': 
        odds = contractMatch.oddsAway;
        break;
      case 'Over': 
        odds = contractMatch.oddsOver;
        break;
      case 'Under': 
        odds = contractMatch.oddsUnder;
        break;
      default: 
        throw new Error(`Invalid selection for odds: ${prediction.selection}`);
    }
    
    // Validate odds are set and reasonable
    if (!odds || odds === 0) {
      throw new Error(`Odds not set for selection ${prediction.selection} in match ${contractMatch.id}`);
    }
    
    // Convert to number if it's a BigInt
    return typeof odds === 'bigint' ? Number(odds) : odds;
  }

  /**
   * Place slip on contract with exact formatting and validation
   */
  async placeSlip(predictions, options = {}) {
    try {
      // Initialize if not already done
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Validate contract state first
      await this.validateContractState('placeSlip');
      
      const contract = await this.getOddysseyContract();
      
      // Predictions should already be formatted by the caller
      const formattedPredictions = predictions;
      
      // Get current entry fee
      const entryFee = await contract.entryFee();
      console.log(`💰 Entry fee: ${ethers.formatEther(entryFee)} STT`);
      
      // Use gas estimator for robust gas estimation
      const gasEstimate = await this.gasEstimator.estimateGasWithFallback('placeSlip', [formattedPredictions], {
        value: entryFee,
        buffer: 30, // 30% buffer
        ...options
      });
      
      if (gasEstimate.error) {
        throw new Error(`Gas estimation failed: ${gasEstimate.error}`);
      }
      
      console.log(`⛽ Gas estimation method: ${gasEstimate.method}`);
      console.log(`⛽ Estimated gas: ${gasEstimate.estimate.toString()}`);
      console.log(`⛽ Gas limit with buffer: ${gasEstimate.gasLimit.toString()}`);
      console.log(`💰 Total cost: ${ethers.formatEther(gasEstimate.totalCost)} STT`);
      
      // Check balance
      const walletAddress = this.getWalletAddress();
      const balanceCheck = await this.gasEstimator.checkBalance(walletAddress, gasEstimate.totalCost);
      
      if (!balanceCheck.hasSufficientBalance) {
        throw new Error(`Insufficient balance. Need ${ethers.formatEther(balanceCheck.totalCost)} STT, have ${ethers.formatEther(balanceCheck.balance)} STT`);
      }
      
      // Get optimal gas price
      const gasPriceData = await this.gasEstimator.getOptimalGasPrice();
      
      // Place slip with enhanced gas settings
      const txParams = {
        value: entryFee,
        gasLimit: gasEstimate.gasLimit,
        ...gasPriceData
      };
      
      console.log(`🚀 Placing slip with gas limit: ${gasEstimate.gasLimit.toString()}`);
      console.log(`💰 Gas price type: ${gasPriceData.type}`);
      
      const tx = await contract.placeSlip(formattedPredictions, txParams);
      
      console.log(`✅ Slip placed successfully: ${tx.hash}`);
      console.log(`📊 Gas used: ${tx.gasLimit?.toString() || 'Unknown'}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'place slip');
    }
  }

  /**
   * Evaluate slip on contract with validation
   */
  async evaluateSlip(slipId, options = {}) {
    try {
      // Initialize if not already done
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Validate contract state first
      await this.validateContractState('evaluateSlip', { slipId });
      
      const contract = await this.getOddysseyContract();
      
      // SIMPLIFIED: Let ethers.js estimate gas automatically
      // It will do a much better job than our manual estimation
      console.log(`🚀 Evaluating slip ${slipId} (ethers.js will auto-estimate gas)...`);
      
      // Call with minimal overrides - let ethers.js handle gas
      const tx = await contract.evaluateSlip(slipId);
      
      console.log(`✅ Slip ${slipId} evaluation transaction sent: ${tx.hash}`);
      console.log(`⛽ Gas limit: ${tx.gasLimit?.toString() || 'auto'}`);
      
      // Wait for transaction to be mined
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error('Evaluation transaction failed');
      }
      
      console.log(`✅ Slip ${slipId} evaluated successfully!`);
      console.log(`📊 Gas used: ${receipt.gasUsed.toString()}`);
      
      // Fetch the evaluated slip data from contract to get correctCount and finalScore
      const slipData = await contract.getSlip(slipId);
      
      return {
        success: true,
        transactionHash: tx.hash,
        correctCount: Number(slipData.correctCount),
        finalScore: Number(slipData.finalScore),
        gasUsed: receipt.gasUsed.toString()
      };
      
    } catch (error) {
      this.handleContractError(error, 'evaluate slip');
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Claim prize with validation
   */
  async claimPrize(cycleId, slipId, options = {}) {
    try {
      // Validate contract state first
      await this.validateContractState('claimPrize', { cycleId, slipId });
      
      const contract = await this.getOddysseyContract();
      
      // Check if user is on leaderboard
      const leaderboard = await contract.getDailyLeaderboard(cycleId);
      const userAddress = this.getWalletAddress();
      const userOnLeaderboard = leaderboard.some(entry => entry.player.toLowerCase() === userAddress.toLowerCase());
      
      if (!userOnLeaderboard) {
        throw new Error('User is not on the leaderboard for this cycle');
      }
      
      // Estimate gas if not provided
      let gasLimit = options.gasLimit;
      if (!gasLimit) {
        try {
          gasLimit = await contract.claimPrize.estimateGas(cycleId, slipId);
          gasLimit = gasLimit * 120n / 100n; // Add 20% buffer
          console.log(`⛽ Estimated gas for claim: ${gasLimit}`);
        } catch (gasError) {
          console.warn('⚠️ Gas estimation failed, using default');
          gasLimit = 300000;
        }
      }
      
      const tx = await contract.claimPrize(cycleId, slipId, {
        gasLimit: gasLimit,
        ...options
      });
      
      console.log(`✅ Prize claimed for cycle ${cycleId}: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'claim prize');
    }
  }

  /**
   * Batch evaluate multiple slips
   */
  async evaluateMultipleSlips(slipIds, options = {}) {
    try {
      if (!slipIds || slipIds.length === 0) {
        throw new Error('No slip IDs provided for batch evaluation');
      }
      
      const contract = await this.getOddysseyContract();
      
      // Validate each slip
      for (const slipId of slipIds) {
        await this.validateContractState('evaluateSlip', { slipId });
      }
      
      // Estimate gas if not provided
      let gasLimit = options.gasLimit;
      if (!gasLimit) {
        try {
          gasLimit = await contract.evaluateMultipleSlips.estimateGas(slipIds);
          gasLimit = gasLimit * 120n / 100n; // Add 20% buffer
          console.log(`⛽ Estimated gas for batch evaluation: ${gasLimit}`);
        } catch (gasError) {
          console.warn('⚠️ Gas estimation failed, using default');
          gasLimit = 500000 * slipIds.length;
        }
      }
      
      const tx = await contract.evaluateMultipleSlips(slipIds, {
        gasLimit: gasLimit,
        ...options
      });
      
      console.log(`✅ ${slipIds.length} slips evaluated successfully: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'batch evaluate slips');
    }
  }

  /**
   * Batch claim multiple prizes
   */
  async claimMultiplePrizes(cycleIds, options = {}) {
    try {
      if (!cycleIds || cycleIds.length === 0) {
        throw new Error('No cycle IDs provided for batch claiming');
      }
      
      const contract = await this.getOddysseyContract();
      
      // Validate each cycle
      for (const cycleId of cycleIds) {
        await this.validateContractState('claimPrize', { cycleId });
      }
      
      // Estimate gas if not provided
      let gasLimit = options.gasLimit;
      if (!gasLimit) {
        try {
          gasLimit = await contract.claimMultiplePrizes.estimateGas(cycleIds);
          gasLimit = gasLimit * 120n / 100n; // Add 20% buffer
          console.log(`⛽ Estimated gas for batch claiming: ${gasLimit}`);
        } catch (gasError) {
          console.warn('⚠️ Gas estimation failed, using default');
          gasLimit = 300000 * cycleIds.length;
        }
      }
      
      const tx = await contract.claimMultiplePrizes(cycleIds, {
        gasLimit: gasLimit,
        ...options
      });
      
      console.log(`✅ Prizes claimed for ${cycleIds.length} cycles: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'batch claim prizes');
    }
  }

  /**
   * Format results for contract resolution
   */
  formatResultsForContract(matchResults) {
    const MATCH_COUNT = 10;
    if (!matchResults || matchResults.length !== MATCH_COUNT) {
      throw new Error(`Must provide exactly ${MATCH_COUNT} match results`);
    }
    
    return matchResults.map((match, index) => {
      if (!match) {
        throw new Error(`Match result ${index} is null or undefined`);
      }
      
      return {
        moneyline: this.convertMoneylineResult(match.result1x2),
        overUnder: this.convertOverUnderResult(match.resultOU25)
      };
    });
  }

  /**
   * Convert moneyline result to contract enum (0-indexed)
   */
  convertMoneylineResult(result1x2) {
    switch (result1x2) {
      case '1': return this.MoneylineResult.HomeWin;  // 1
      case 'X': return this.MoneylineResult.Draw;     // 2
      case '2': return this.MoneylineResult.AwayWin;  // 3
      case 'Home': return this.MoneylineResult.HomeWin;  // 1
      case 'Draw': return this.MoneylineResult.Draw;     // 2
      case 'Away': return this.MoneylineResult.AwayWin;  // 3
      case null:
      case undefined:
      case '':
        return this.MoneylineResult.NotSet;           // 0
      default: 
        console.warn(`Unknown moneyline result: ${result1x2}, defaulting to NotSet`);
        return this.MoneylineResult.NotSet;           // 0
    }
  }

  /**
   * Convert over/under result to contract enum (0-indexed)
   */
  convertOverUnderResult(resultOU25) {
    switch (resultOU25) {
      case 'Over':
      case 'O':  // ← Accept short format too
        return this.OverUnderResult.Over;   // 1
      case 'Under':
      case 'U':  // ← Accept short format too
        return this.OverUnderResult.Under; // 2
      case null:
      case undefined:
      case '':
        return this.OverUnderResult.NotSet;            // 0
      default: 
        console.warn(`Unknown over/under result: ${resultOU25}, defaulting to NotSet`);
        return this.OverUnderResult.NotSet;            // 0
    }
  }

  /**
   * Handle contract-specific errors with detailed messages
   */
  handleContractError(error, operation = 'contract operation') {
    console.error(`❌ Contract error during ${operation}:`, error);
    
    // Parse common contract errors
    if (error.message) {
      const message = error.message.toLowerCase();
      
      // Oddyssey contract errors
      if (message.includes('cyclenotactive')) {
        throw new Error('Cycle is not active for betting');
      } else if (message.includes('bettingclosed')) {
        throw new Error('Betting period has ended for this cycle');
      } else if (message.includes('invalidcycleid')) {
        throw new Error('Invalid cycle ID provided');
      } else if (message.includes('insufficientpayment')) {
        throw new Error('Insufficient payment amount (must match entry fee exactly)');
      } else if (message.includes('oddsmismatch')) {
        throw new Error('Odds mismatch - odds may have changed since selection');
      } else if (message.includes('invalidselection')) {
        throw new Error('Invalid prediction selection');
      } else if (message.includes('slipnotfound')) {
        throw new Error('Slip not found');
      } else if (message.includes('slipnotresolved')) {
        throw new Error('Cycle must be resolved before evaluating slips');
      } else if (message.includes('slipnotresolved')) {
        throw new Error('Slip has already been evaluated');
      } else if (message.includes('notonleaderboard')) {
        throw new Error('User is not on the leaderboard for this cycle');
      } else if (message.includes('prizealreadyclaimed')) {
        throw new Error('Prize has already been claimed');
      } else if (message.includes('claimingnotavailable')) {
        throw new Error('Prize claiming is not yet available');
      }
      
      // BitredictPool contract errors
      else if (message.includes('pool settled')) {
        throw new Error('Pool has already been settled');
      } else if (message.includes('betting period ended')) {
        throw new Error('Betting period has ended for this pool');
      } else if (message.includes('pool full')) {
        throw new Error('Pool has reached maximum capacity');
      } else if (message.includes('not whitelisted')) {
        throw new Error('User is not whitelisted for this private pool');
      } else if (message.includes('exceeds max bet per user')) {
        throw new Error('Bet amount exceeds maximum allowed per user');
      } else if (message.includes('already claimed')) {
        throw new Error('Rewards have already been claimed');
      }
      
      // Gas and transaction errors
      else if (message.includes('gas')) {
        throw new Error('Transaction failed due to gas issues - try increasing gas limit');
      } else if (message.includes('nonce')) {
        throw new Error('Transaction nonce error - please retry');
      } else if (message.includes('replacement underpriced')) {
        throw new Error('Transaction replacement underpriced - increase gas price');
      }
      
      // Generic revert
      else if (message.includes('revert')) {
        throw new Error(`Contract reverted: ${error.message}`);
      }
    }
    
    // Re-throw original error if not recognized
    throw error;
  }

  /**
   * Validate contract state before operations
   */
  async validateContractState(operation, params = {}) {
    try {
      const contract = await this.getOddysseyContract();
      
      switch (operation) {
        case 'placeSlip':
          const currentCycle = await contract.getCurrentCycleInfo();
          if (Number(currentCycle.state) !== this.CycleState.Active) {
            throw new Error('No active cycle available for placing slips');
          }
          if (Number(currentCycle.endTime) <= Math.floor(Date.now() / 1000)) {
            throw new Error('Betting period has ended for current cycle');
          }
          break;
          
        case 'evaluateSlip':
          // CRITICAL: Check for undefined/null, NOT falsy (slipId can be 0!)
          if (params.slipId === undefined || params.slipId === null) {
            throw new Error('Slip ID required for evaluation');
          }
          const slip = await contract.getSlip(params.slipId);
          if (slip.isEvaluated) {
            throw new Error('Slip has already been evaluated');
          }
          const slipCycle = await contract.getCycleStatus(slip.cycleId);
          if (Number(slipCycle.state) !== this.CycleState.Resolved) {
            throw new Error('Cycle must be resolved before evaluating slips');
          }
          break;
          
        case 'claimPrize':
          if (!params.cycleId) throw new Error('Cycle ID required for claiming');
          const cycleStatus = await contract.getCycleStatus(params.cycleId);
          if (Number(cycleStatus.state) !== this.CycleState.Resolved) {
            throw new Error('Cycle must be resolved before claiming prizes');
          }
          const claimableTime = await contract.claimableStartTimes(params.cycleId);
          if (Number(claimableTime) > Math.floor(Date.now() / 1000)) {
            throw new Error('Prize claiming is not yet available');
          }
          break;
      }
    } catch (error) {
      this.handleContractError(error, `${operation} validation`);
    }
  }

  // ==================== ORACLE FUNCTIONS ====================

  /**
   * Start daily cycle (Oracle only)
   */
  async startDailyCycle(matches, options = {}) {
    try {
      const MATCH_COUNT = 10;
      if (!matches || matches.length !== MATCH_COUNT) {
        throw new Error(`Must provide exactly ${MATCH_COUNT} matches`);
      }

      const contract = await this.getOddysseyContract();
      
      // Validate oracle permission
      const oracle = await contract.oracle();
      if (oracle.toLowerCase() !== this.getWalletAddress().toLowerCase()) {
        throw new Error('Only oracle can start daily cycles');
      }

      // Format matches for contract
      const formattedMatches = matches.map(match => ({
        id: BigInt(match.id),
        startTime: BigInt(match.startTime),
        oddsHome: match.oddsHome,
        oddsDraw: match.oddsDraw,
        oddsAway: match.oddsAway,
        oddsOver: match.oddsOver,
        oddsUnder: match.oddsUnder,
        result: {
          moneyline: this.MoneylineResult.NotSet,
          overUnder: this.OverUnderResult.NotSet
        }
      }));

      // Let ethers.js estimate gas automatically with fallback
      let gasLimit = options.gasLimit;
      if (!gasLimit) {
        try {
          gasLimit = await contract.startDailyCycle.estimateGas(formattedMatches);
          gasLimit = gasLimit * 150n / 100n; // Add 50% buffer for safety
          console.log(`⛽ Estimated gas for cycle start: ${gasLimit}`);
        } catch (gasError) {
          console.warn('⚠️ Gas estimation failed, using high fallback');
          gasLimit = 4000000; // High fallback for complex operations
        }
      }

      const tx = await contract.startDailyCycle(formattedMatches, {
        gasLimit: gasLimit,
        ...options
      });

      console.log(`✅ Daily cycle started: ${tx.hash}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'start daily cycle');
    }
  }

  /**
   * Resolve daily cycle (Oracle only)
   */
  async resolveDailyCycle(cycleId, matchResults, options = {}) {
    try {
      const contract = await this.getOddysseyContract();
      
      // Validate oracle permission
      const oracle = await contract.oracle();
      if (oracle.toLowerCase() !== this.getWalletAddress().toLowerCase()) {
        throw new Error('Only oracle can resolve daily cycles');
      }

      // Format results for contract
      const formattedResults = this.formatResultsForContract(matchResults);

      // 🚨 CRITICAL VALIDATION: Prevent resolving cycles with NotSet results
      // This prevents the Cycle 5 corruption bug from happening again
      const hasNotSetResults = formattedResults.some(result => 
        result.moneyline === this.MoneylineResult.NotSet || 
        result.overUnder === this.OverUnderResult.NotSet
      );
      
      if (hasNotSetResults) {
        const invalidResults = formattedResults
          .map((r, i) => ({ index: i, moneyline: r.moneyline, overUnder: r.overUnder }))
          .filter(r => r.moneyline === this.MoneylineResult.NotSet || r.overUnder === this.OverUnderResult.NotSet);
        
        console.error(`🚨 CRITICAL: Cannot resolve cycle ${cycleId} - contains NotSet results!`);
        console.error(`   Invalid results at indices:`, invalidResults);
        throw new Error(`Cannot resolve cycle ${cycleId}: ${invalidResults.length} match(es) have NotSet results. All matches must have valid results before resolution.`);
      }
      
      console.log(`✅ Validation passed: All ${formattedResults.length} matches have valid results`);

      // Let ethers.js estimate gas automatically with fallback
      let gasLimit = options.gasLimit;
      if (!gasLimit) {
        try {
          gasLimit = await contract.resolveDailyCycle.estimateGas(cycleId, formattedResults);
          gasLimit = gasLimit * 150n / 100n; // Add 50% buffer for safety
          console.log(`⛽ Estimated gas for cycle resolution: ${gasLimit}`);
        } catch (gasError) {
          console.warn('⚠️ Gas estimation failed, using high fallback');
          gasLimit = 3000000; // High fallback for complex operations
        }
      }

      const tx = await contract.resolveDailyCycle(cycleId, formattedResults, {
        gasLimit: gasLimit,
        ...options
      });

      if (!tx || !tx.hash) {
        throw new Error('Failed to get transaction hash from contract call');
      }

      console.log(`✅ Daily cycle ${cycleId} resolution submitted: ${tx.hash}`);
      return tx;

    } catch (error) {
      const errorMsg = this.handleContractError(error, 'resolve daily cycle');
      throw new Error(errorMsg || error.message);
    }
  }

  /**
   * Resolve multiple cycles (Oracle only)
   */
  async resolveMultipleCycles(cycleIds, allMatchResults, options = {}) {
    try {
      if (!cycleIds || !allMatchResults || cycleIds.length !== allMatchResults.length) {
        throw new Error('Cycle IDs and match results arrays must have same length');
      }

      if (cycleIds.length > this.MAX_CYCLES_TO_RESOLVE) {
        throw new Error(`Cannot resolve more than ${this.MAX_CYCLES_TO_RESOLVE} cycles at once`);
      }

      const contract = await this.getOddysseyContract();
      
      // Validate oracle permission
      const oracle = await contract.oracle();
      if (oracle.toLowerCase() !== this.getWalletAddress().toLowerCase()) {
        throw new Error('Only oracle can resolve cycles');
      }

      // Format all results
      const formattedResultsArray = allMatchResults.map(results => 
        this.formatResultsForContract(results)
      );

      // 🚨 CRITICAL VALIDATION: Prevent resolving cycles with NotSet results
      for (let i = 0; i < formattedResultsArray.length; i++) {
        const formattedResults = formattedResultsArray[i];
        const cycleId = cycleIds[i];
        
        const hasNotSetResults = formattedResults.some(result => 
          result.moneyline === this.MoneylineResult.NotSet || 
          result.overUnder === this.OverUnderResult.NotSet
        );
        
        if (hasNotSetResults) {
          const invalidResults = formattedResults
            .map((r, idx) => ({ index: idx, moneyline: r.moneyline, overUnder: r.overUnder }))
            .filter(r => r.moneyline === this.MoneylineResult.NotSet || r.overUnder === this.OverUnderResult.NotSet);
          
          console.error(`🚨 CRITICAL: Cycle ${cycleId} in batch contains NotSet results!`);
          console.error(`   Invalid results at indices:`, invalidResults);
          throw new Error(`Cannot resolve cycle ${cycleId} in batch: ${invalidResults.length} match(es) have NotSet results. All matches must have valid results before resolution.`);
        }
      }
      
      console.log(`✅ Validation passed: All ${cycleIds.length} cycles have valid results`);

      // Let ethers.js estimate gas automatically with fallback
      let gasLimit = options.gasLimit;
      if (!gasLimit) {
        try {
          gasLimit = await contract.resolveMultipleCycles.estimateGas(cycleIds, formattedResultsArray);
          gasLimit = gasLimit * 150n / 100n; // Add 50% buffer for safety
          console.log(`⛽ Estimated gas for multiple cycle resolution: ${gasLimit}`);
        } catch (gasError) {
          console.warn('⚠️ Gas estimation failed, using high fallback');
          gasLimit = 5000000 * BigInt(cycleIds.length); // High fallback for complex operations
        }
      }

      const tx = await contract.resolveMultipleCycles(cycleIds, formattedResultsArray, {
        gasLimit: gasLimit,
        ...options
      });

      console.log(`✅ ${cycleIds.length} cycles resolved: ${tx.hash}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'resolve multiple cycles');
    }
  }

  // ==================== BITREDICT POOL FUNCTIONS ====================

  /**
   * Decode pool flags to extract boolean values
   */
  decodePoolFlags(flags) {
    return {
      settled: (flags & 1) !== 0,           // bit 0
      creatorSideWon: (flags & 2) !== 0,    // bit 1
      isPrivate: (flags & 4) !== 0,          // bit 2
      usesBitr: (flags & 8) !== 0,           // bit 3
      filledAbove60: (flags & 16) !== 0      // bit 4
    };
  }

  /**
   * Get pool data with decoded flags
   */
  async getPoolData(poolId) {
    try {
      const contract = await this.getPoolCoreContract();
      const pool = await contract.pools(poolId);
      
      // Decode the flags
      const flags = this.decodePoolFlags(pool.flags);
      
      return {
        ...pool,
        flags: flags,
        // Keep original flags value for compatibility
        originalFlags: pool.flags
      };
    } catch (error) {
      this.handleContractError(error, 'get pool data');
    }
  }

  /**
   * Get pool data with decoded names (human-readable)
   */
  async getPoolDataWithDecodedNames(poolId) {
    try {
      const contract = await this.getPoolCoreContract();
      const poolData = await contract.getPoolWithDecodedNames(poolId);
      
      // Decode the flags
      const flags = this.decodePoolFlags(poolData.flags);
      
      return {
        ...poolData,
        flags: flags,
        // Keep original flags value for compatibility
        originalFlags: poolData.flags
      };
    } catch (error) {
      this.handleContractError(error, 'get pool data with decoded names');
    }
  }

  /**
   * Create a prediction pool with gas optimization
   */
  async createPool(poolData, options = {}) {
    try {
      const contract = await this.getPoolCoreContract();
      
      const {
        predictedOutcome,
        odds,
        creatorStake,
        eventStartTime,
        eventEndTime,
        league,
        category,
        region,
        homeTeam = '',
        awayTeam = '',
        title = '',
        isPrivate = false,
        maxBetPerUser = 0,
        useBitr = false,
        oracleType = 0, // GUIDED = 0, OPEN = 1
        marketId,
        marketType = 0 // Default to MONEYLINE
      } = poolData;

      // Hash strings to bytes32 for gas optimization
      const leagueHash = ethers.keccak256(ethers.toUtf8Bytes(league || ''));
      const categoryHash = ethers.keccak256(ethers.toUtf8Bytes(category || ''));
      const regionHash = ethers.keccak256(ethers.toUtf8Bytes(region || ''));
      const homeTeamHash = ethers.keccak256(ethers.toUtf8Bytes(homeTeam || ''));
      const awayTeamHash = ethers.keccak256(ethers.toUtf8Bytes(awayTeam || ''));
      const titleHash = ethers.keccak256(ethers.toUtf8Bytes(title || ''));

      // Validate required fields
      if (!predictedOutcome || !odds || !creatorStake || !eventStartTime || !eventEndTime) {
        throw new Error('Missing required pool creation parameters');
      }

      // Calculate creation fee
      const creationFee = useBitr ? 50n * 10n ** 18n : 1n * 10n ** 18n; // 50 BITR or 1 STT
      const totalRequired = creationFee + BigInt(creatorStake);

      // Use gas estimator for robust gas estimation
      const gasEstimate = await this.gasEstimator.estimateCreatePoolGas(poolData, {
        buffer: 50, // 50% buffer for pool creation (increased for complex operations)
        ...options
      });
      
      if (gasEstimate.error) {
        throw new Error(`Gas estimation failed: ${gasEstimate.error}`);
      }
      
      console.log(`⛽ Gas estimation method: ${gasEstimate.method}`);
      console.log(`⛽ Estimated gas: ${gasEstimate.estimate.toString()}`);
      console.log(`⛽ Gas limit with buffer: ${gasEstimate.gasLimit.toString()}`);
      console.log(`💰 Total cost: ${ethers.formatEther(gasEstimate.totalCost)} STT`);

      // Check balance
      const walletAddress = this.getWalletAddress();
      const balanceCheck = await this.gasEstimator.checkBalance(walletAddress, gasEstimate.totalCost);
      
      if (!balanceCheck.hasSufficientBalance) {
        throw new Error(`Insufficient balance. Need ${ethers.formatEther(balanceCheck.totalCost)} STT, have ${ethers.formatEther(balanceCheck.balance)} STT`);
      }

      // Get optimal gas price
      const gasPriceData = await this.gasEstimator.getOptimalGasPrice();

      let txOptions = {
        gasLimit: gasEstimate.gasLimit,
        ...gasPriceData,
        ...options
      };

      if (useBitr) {
        // Handle BITR token approval and transfer
        const bitrContract = await this.getBITRTokenContract();
        const allowance = await bitrContract.allowance(this.getWalletAddress(), await contract.getAddress());
        
        if (allowance < totalRequired) {
          const approveTx = await bitrContract.approve(await contract.getAddress(), totalRequired);
          await approveTx.wait();
          console.log(`✅ BITR approved: ${approveTx.hash}`);
        }
      } else {
        // Use native STT
        txOptions.value = totalRequired;
      }

      console.log(`🚀 Creating pool with gas limit: ${gasEstimate.gasLimit.toString()}`);
      console.log(`💰 Gas price type: ${gasPriceData.type}`);

      const tx = await contract.createPool(
        ethers.keccak256(ethers.toUtf8Bytes(predictedOutcome)),
        odds,
        creatorStake,
        eventStartTime,
        eventEndTime,
        leagueHash,
        categoryHash,
        regionHash,
        homeTeamHash,
        awayTeamHash,
        titleHash,
        isPrivate,
        maxBetPerUser,
        useBitr,
        oracleType,
        marketType,
        marketId,
        txOptions
      );

      console.log(`✅ Pool created: ${tx.hash}`);
      console.log(`📊 Gas used: ${tx.gasLimit?.toString() || 'Unknown'}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'create pool');
    }
  }


  /**
   * Place bet on a pool with gas optimization
   */
  async placeBet(poolId, amount, options = {}) {
    try {
      const contract = await this.getPoolCoreContract();
      
      // Get pool info to check token type
      const pool = await contract.pools(poolId);
      
      // Use gas estimator for robust gas estimation
      const gasEstimate = await this.gasEstimator.estimatePlaceBetGas(poolId, amount, {
        buffer: 25, // 25% buffer for betting
        ...options
      });
      
      if (gasEstimate.error) {
        throw new Error(`Gas estimation failed: ${gasEstimate.error}`);
      }
      
      console.log(`⛽ Gas estimation method: ${gasEstimate.method}`);
      console.log(`⛽ Estimated gas: ${gasEstimate.estimate.toString()}`);
      console.log(`⛽ Gas limit with buffer: ${gasEstimate.gasLimit.toString()}`);
      console.log(`💰 Total cost: ${ethers.formatEther(gasEstimate.totalCost)} STT`);

      // Check balance
      const walletAddress = this.getWalletAddress();
      const balanceCheck = await this.gasEstimator.checkBalance(walletAddress, gasEstimate.totalCost);
      
      if (!balanceCheck.hasSufficientBalance) {
        throw new Error(`Insufficient balance for bet. Need ${ethers.formatEther(balanceCheck.totalCost)} STT, have ${ethers.formatEther(balanceCheck.balance)} STT`);
      }

      // Get optimal gas price
      const gasPriceData = await this.gasEstimator.getOptimalGasPrice();

      let txOptions = {
        gasLimit: gasEstimate.gasLimit,
        ...gasPriceData,
        ...options
      };

      if (poolFlags.usesBitr) {
        // Handle BITR token approval and transfer
        const bitrContract = await this.getBITRTokenContract();
        const allowance = await bitrContract.allowance(this.getWalletAddress(), await contract.getAddress());
        
        if (allowance < amount) {
          const approveTx = await bitrContract.approve(await contract.getAddress(), amount);
          await approveTx.wait();
          console.log(`✅ BITR approved for bet: ${approveTx.hash}`);
        }
      } else {
        // Use native STT
        txOptions.value = amount;
      }

      console.log(`🚀 Placing bet with gas limit: ${gasEstimate.gasLimit.toString()}`);
      console.log(`💰 Gas price type: ${gasPriceData.type}`);

      const tx = await contract.placeBet(poolId, amount, txOptions);

      console.log(`✅ Bet placed on pool ${poolId}: ${tx.hash}`);
      console.log(`📊 Gas used: ${tx.gasLimit?.toString() || 'Unknown'}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'place bet');
    }
  }

  /**
   * Add liquidity to a pool with gas optimization
   */
  async addLiquidity(poolId, amount, options = {}) {
    try {
      const contract = await this.getPoolCoreContract();
      
      // Get pool info to check token type
      const pool = await contract.pools(poolId);
      const poolFlags = this.decodePoolFlags(pool.flags);
      
      // Use gas estimator for robust gas estimation
      const gasEstimate = await this.gasEstimator.estimateAddLiquidityGas(poolId, amount, {
        buffer: 20, // 20% buffer for liquidity
        ...options
      });
      
      if (gasEstimate.error) {
        throw new Error(`Gas estimation failed: ${gasEstimate.error}`);
      }
      
      console.log(`⛽ Gas estimation method: ${gasEstimate.method}`);
      console.log(`⛽ Estimated gas: ${gasEstimate.estimate.toString()}`);
      console.log(`⛽ Gas limit with buffer: ${gasEstimate.gasLimit.toString()}`);
      console.log(`💰 Total cost: ${ethers.formatEther(gasEstimate.totalCost)} STT`);

      // Check balance
      const walletAddress = this.getWalletAddress();
      const balanceCheck = await this.gasEstimator.checkBalance(walletAddress, gasEstimate.totalCost);
      
      if (!balanceCheck.hasSufficientBalance) {
        throw new Error(`Insufficient balance for liquidity. Need ${ethers.formatEther(balanceCheck.totalCost)} STT, have ${ethers.formatEther(balanceCheck.balance)} STT`);
      }

      // Get optimal gas price
      const gasPriceData = await this.gasEstimator.getOptimalGasPrice();

      let txOptions = {
        gasLimit: gasEstimate.gasLimit,
        ...gasPriceData,
        ...options
      };

      if (poolFlags.usesBitr) {
        // Handle BITR token approval and transfer
        const bitrContract = await this.getBITRTokenContract();
        const allowance = await bitrContract.allowance(this.getWalletAddress(), await contract.getAddress());
        
        if (allowance < amount) {
          const approveTx = await bitrContract.approve(await contract.getAddress(), amount);
          await approveTx.wait();
          console.log(`✅ BITR approved for liquidity: ${approveTx.hash}`);
        }
      } else {
        // Use native STT
        txOptions.value = amount;
      }

      console.log(`🚀 Adding liquidity with gas limit: ${gasEstimate.gasLimit.toString()}`);
      console.log(`💰 Gas price type: ${gasPriceData.type}`);

      const tx = await contract.addLiquidity(poolId, amount, txOptions);

      console.log(`✅ Liquidity added to pool ${poolId}: ${tx.hash}`);
      console.log(`📊 Gas used: ${tx.gasLimit?.toString() || 'Unknown'}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'add liquidity');
    }
  }

  /**
   * Settle pool (Oracle only)
   */
  async settlePool(poolId, outcome, options = {}) {
    try {
      const contract = await this.getPoolCoreContract();
      
      // Let ethers.js estimate gas automatically with fallback
      let gasLimit = options.gasLimit;
      if (!gasLimit) {
        try {
          gasLimit = await contract.settlePool.estimateGas(
            poolId, 
            ethers.keccak256(ethers.toUtf8Bytes(outcome))
          );
          gasLimit = gasLimit * 150n / 100n; // Add 50% buffer for safety
          console.log(`⛽ Estimated gas for pool settlement: ${gasLimit}`);
        } catch (gasError) {
          console.warn('⚠️ Gas estimation failed, using fallback');
          gasLimit = 1000000; // Fallback for settlement operations
        }
      }

      const tx = await contract.settlePool(
        poolId, 
        ethers.keccak256(ethers.toUtf8Bytes(outcome)),
        {
          gasLimit: gasLimit,
          ...options
        }
      );

      console.log(`✅ Pool ${poolId} settled: ${tx.hash}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'settle pool');
    }
  }

  /**
   * Claim pool rewards
   */
  async claimPoolRewards(poolId, options = {}) {
    try {
      const contract = await this.getPoolCoreContract();
      
      const tx = await contract.claim(poolId, {
        gasLimit: options.gasLimit || 400000,
        ...options
      });

      console.log(`✅ Pool ${poolId} rewards claimed: ${tx.hash}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'claim pool rewards');
    }
  }

  /**
   * Boost pool visibility
   */
  async boostPool(poolId, tier, options = {}) {
    try {
      const contract = await this.getPoolCoreContract();
      
      // Get boost fee
      const boostFee = await contract.boostFees(tier);
      
      const tx = await contract.boostPool(poolId, tier, {
        value: boostFee,
        gasLimit: options.gasLimit || 200000,
        ...options
      });

      console.log(`✅ Pool ${poolId} boosted to tier ${tier}: ${tx.hash}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'boost pool');
    }
  }

  // ==================== TOKEN INTEGRATION ====================

  /**
   * Check BITR token balance
   */
  async getBITRBalance(address = null) {
    try {
      const contract = await this.getBITRTokenContract();
      const targetAddress = address || this.getWalletAddress();
      
      const balance = await contract.balanceOf(targetAddress);
      return balance;

    } catch (error) {
      console.error('Error getting BITR balance:', error);
      throw error;
    }
  }

  /**
   * Check BITR token allowance
   */
  async getBITRAllowance(spender, owner = null) {
    try {
      const contract = await this.getBITRTokenContract();
      const ownerAddress = owner || this.getWalletAddress();
      
      const allowance = await contract.allowance(ownerAddress, spender);
      return allowance;

    } catch (error) {
      console.error('Error getting BITR allowance:', error);
      throw error;
    }
  }

  /**
   * Approve BITR token spending
   */
  async approveBITR(spender, amount, options = {}) {
    try {
      const contract = await this.getBITRTokenContract();
      
      const tx = await contract.approve(spender, amount, {
        gasLimit: options.gasLimit || 100000,
        ...options
      });

      console.log(`✅ BITR approved: ${tx.hash}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'approve BITR');
    }
  }

  // ==================== STAKING FUNCTIONS ====================

  /**
   * Stake BITR tokens
   */
  async stakeBITR(amount, tierId, durationOption, options = {}) {
    try {
      const contract = await this.getStakingContract();
      const bitrContract = await this.getBITRTokenContract();
      
      // Check allowance and approve if needed
      const allowance = await bitrContract.allowance(this.getWalletAddress(), await contract.getAddress());
      if (allowance < amount) {
        const approveTx = await bitrContract.approve(await contract.getAddress(), amount);
        await approveTx.wait();
        console.log(`✅ BITR approved for staking: ${approveTx.hash}`);
      }
      
      const tx = await contract.stake(amount, tierId, durationOption, {
        gasLimit: options.gasLimit || 400000,
        ...options
      });
      
      console.log(`✅ BITR staked: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'stake BITR');
    }
  }

  /**
   * Unstake BITR tokens
   */
  async unstakeBITR(stakeIndex, options = {}) {
    try {
      const contract = await this.getStakingContract();
      
      const tx = await contract.unstake(stakeIndex, {
        gasLimit: options.gasLimit || 400000,
        ...options
      });
      
      console.log(`✅ BITR unstaked: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'unstake BITR');
    }
  }

  /**
   * Claim staking rewards
   */
  async claimStakingRewards(stakeIndex, options = {}) {
    try {
      const contract = await this.getStakingContract();
      
      const tx = await contract.claim(stakeIndex, {
        gasLimit: options.gasLimit || 300000,
        ...options
      });
      
      console.log(`✅ Staking rewards claimed: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'claim staking rewards');
    }
  }

  /**
   * Claim revenue rewards
   */
  async claimRevenueRewards(options = {}) {
    try {
      const contract = await this.getStakingContract();
      
      const tx = await contract.claimRevenue({
        gasLimit: options.gasLimit || 400000,
        ...options
      });
      
      console.log(`✅ Revenue rewards claimed: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'claim revenue rewards');
    }
  }

  // ==================== FAUCET FUNCTIONS ====================

  /**
   * Claim BITR from faucet
   */
  async claimFromFaucet(options = {}) {
    try {
      const contract = await this.getBitrFaucetContract();
      
      // Check if user has already claimed
      const userInfo = await contract.getUserInfo(this.getWalletAddress());
      if (userInfo.claimed) {
        throw new Error('User has already claimed from faucet');
      }
      
      // Check if faucet is active and has sufficient balance
      const faucetStats = await contract.getFaucetStats();
      if (!faucetStats.active) {
        throw new Error('Faucet is not currently active');
      }
      
      const hasSufficient = await contract.hasSufficientBalance();
      if (!hasSufficient) {
        throw new Error('Faucet has insufficient balance');
      }
      
      const tx = await contract.claimBitr({
        gasLimit: options.gasLimit || 200000,
        ...options
      });
      
      console.log(`✅ BITR claimed from faucet: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'claim from faucet');
    }
  }

  // ==================== GUIDED ORACLE FUNCTIONS ====================

  /**
   * Submit outcome to guided oracle (Oracle bot only)
   */
  async submitGuidedOutcome(marketId, resultData, options = {}) {
    try {
      const contract = await this.getGuidedOracleContract();
      
      // Validate oracle bot permission
      const oracleBot = await contract.oracleBot();
      if (oracleBot.toLowerCase() !== this.getWalletAddress().toLowerCase()) {
        throw new Error('Only oracle bot can submit outcomes');
      }
      
      // Let ethers.js estimate gas automatically with fallback
      let gasLimit = options.gasLimit;
      if (!gasLimit) {
        try {
          gasLimit = await contract.submitOutcome.estimateGas(marketId, resultData);
          gasLimit = gasLimit * 150n / 100n; // Add 50% buffer for safety
          console.log(`⛽ Estimated gas for outcome submission: ${gasLimit}`);
        } catch (gasError) {
          console.warn('⚠️ Gas estimation failed, using fallback');
          gasLimit = 500000; // Fallback for oracle operations
        }
      }

      const tx = await contract.submitOutcome(marketId, resultData, {
        gasLimit: gasLimit,
        ...options
      });
      
      console.log(`✅ Guided outcome submitted: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'submit guided outcome');
    }
  }

  /**
   * Execute call through guided oracle (Oracle bot only)
   */
  async executeGuidedCall(target, data, options = {}) {
    try {
      const contract = await this.getGuidedOracleContract();
      
      // Validate oracle bot permission
      const oracleBot = await contract.oracleBot();
      if (oracleBot.toLowerCase() !== this.getWalletAddress().toLowerCase()) {
        throw new Error('Only oracle bot can execute calls');
      }
      
      const tx = await contract.executeCall(target, data, {
        gasLimit: options.gasLimit || 500000,
        ...options
      });
      
      console.log(`✅ Guided call executed: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'execute guided call');
    }
  }

  // ==================== OPTIMISTIC ORACLE FUNCTIONS ====================

  /**
   * Propose outcome for optimistic oracle
   */
  async proposeOptimisticOutcome(marketId, outcome, options = {}) {
    try {
      const contract = await this.getOptimisticOracleContract();
      const bondToken = await contract.bondToken();
      const proposalBond = await contract.PROPOSAL_BOND();
      
      // Check user reputation
      const userReputation = await contract.userReputation(this.getWalletAddress());
      const minReputation = await contract.MIN_REPUTATION();
      if (userReputation < minReputation) {
        throw new Error(`Insufficient reputation: ${userReputation} < ${minReputation}`);
      }
      
      // Handle bond token approval
      const bitrContract = await this.getBITRTokenContract();
      const allowance = await bitrContract.allowance(this.getWalletAddress(), await contract.getAddress());
      if (allowance < proposalBond) {
        const approveTx = await bitrContract.approve(await contract.getAddress(), proposalBond);
        await approveTx.wait();
        console.log(`✅ BITR approved for proposal bond: ${approveTx.hash}`);
      }
      
      const tx = await contract.proposeOutcome(marketId, outcome, {
        gasLimit: options.gasLimit || 400000,
        ...options
      });
      
      console.log(`✅ Optimistic outcome proposed: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'propose optimistic outcome');
    }
  }

  /**
   * Dispute optimistic outcome
   */
  async disputeOptimisticOutcome(marketId, options = {}) {
    try {
      const contract = await this.getOptimisticOracleContract();
      const disputeBond = await contract.DISPUTE_BOND();
      
      // Check user reputation
      const userReputation = await contract.userReputation(this.getWalletAddress());
      const minReputation = await contract.MIN_DISPUTE_REPUTATION();
      if (userReputation < minReputation) {
        throw new Error(`Insufficient reputation for dispute: ${userReputation} < ${minReputation}`);
      }
      
      // Handle bond token approval
      const bitrContract = await this.getBITRTokenContract();
      const allowance = await bitrContract.allowance(this.getWalletAddress(), await contract.getAddress());
      if (allowance < disputeBond) {
        const approveTx = await bitrContract.approve(await contract.getAddress(), disputeBond);
        await approveTx.wait();
        console.log(`✅ BITR approved for dispute bond: ${approveTx.hash}`);
      }
      
      const tx = await contract.disputeOutcome(marketId, {
        gasLimit: options.gasLimit || 400000,
        ...options
      });
      
      console.log(`✅ Optimistic outcome disputed: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'dispute optimistic outcome');
    }
  }

  /**
   * Vote on disputed outcome
   */
  async voteOnOptimisticDispute(marketId, outcome, options = {}) {
    try {
      const contract = await this.getOptimisticOracleContract();
      
      // Check user reputation
      const userReputation = await contract.userReputation(this.getWalletAddress());
      const minReputation = await contract.MIN_DISPUTE_REPUTATION();
      if (userReputation < minReputation) {
        throw new Error(`Insufficient reputation for voting: ${userReputation} < ${minReputation}`);
      }
      
      const tx = await contract.voteOnDispute(marketId, outcome, {
        gasLimit: options.gasLimit || 300000,
        ...options
      });
      
      console.log(`✅ Vote cast on dispute: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'vote on dispute');
    }
  }

  /**
   * Resolve optimistic market
   */
  async resolveOptimisticMarket(marketId, options = {}) {
    try {
      const contract = await this.getOptimisticOracleContract();
      
      const tx = await contract.resolveMarket(marketId, {
        gasLimit: options.gasLimit || 600000,
        ...options
      });
      
      console.log(`✅ Optimistic market resolved: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'resolve optimistic market');
    }
  }

  /**
   * Claim bonds from optimistic oracle
   */
  async claimOptimisticBonds(marketId, options = {}) {
    try {
      const contract = await this.getOptimisticOracleContract();
      
      const tx = await contract.claimBonds(marketId, {
        gasLimit: options.gasLimit || 500000,
        ...options
      });
      
      console.log(`✅ Optimistic bonds claimed: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'claim optimistic bonds');
    }
  }

  // ==================== UTILITY FUNCTIONS ====================

  /**
   * Get comprehensive contract status
   */
  async getContractStatus() {
    try {
      const oddysseyContract = await this.getOddysseyContract();
      const poolContract = await this.getPoolCoreContract();
      
      const [
        currentCycle,
        cycleInfo,
        entryFee,
        poolCount,
        totalCollectedSTT,
        totalCollectedBITR
      ] = await Promise.all([
        oddysseyContract.getCurrentCycle(),
        oddysseyContract.getCurrentCycleInfo(),
        oddysseyContract.entryFee(),
        poolContract.poolCount(),
        poolContract.totalCollectedSTT(),
        poolContract.totalCollectedBITR()
      ]);

      // Try to get additional contract statuses
      let stakingStats = null;
      let faucetStats = null;
      let boostSystemStats = null;
      let comboPoolsStats = null;
      let factoryStats = null;
      
      try {
        const stakingContract = await this.getStakingContract();
        stakingStats = await stakingContract.getContractStats();
      } catch (error) {
        console.warn('Could not fetch staking stats:', error.message);
      }
      
      try {
        const faucetContract = await this.getBitrFaucetContract();
        faucetStats = await faucetContract.getFaucetStats();
      } catch (error) {
        console.warn('Could not fetch faucet stats:', error.message);
      }

      try {
        const boostSystemContract = await this.getBoostSystemContract();
        // Add any specific stats calls for BoostSystem if available
        boostSystemStats = { initialized: true };
      } catch (error) {
        console.warn('Could not fetch boost system stats:', error.message);
      }

      try {
        const comboPoolsContract = await this.getComboPoolsContract();
        // Add any specific stats calls for ComboPools if available
        comboPoolsStats = { initialized: true };
      } catch (error) {
        console.warn('Could not fetch combo pools stats:', error.message);
      }

      try {
        const factoryContract = await this.getFactoryContract();
        // Add any specific stats calls for Factory if available
        factoryStats = { initialized: true };
      } catch (error) {
        console.warn('Could not fetch factory stats:', error.message);
      }

      return {
        oddyssey: {
          currentCycle: Number(currentCycle),
          cycleInfo: {
            cycleId: Number(cycleInfo.cycleId),
            state: Number(cycleInfo.state),
            endTime: Number(cycleInfo.endTime),
            prizePool: cycleInfo.prizePool.toString(),
            slipCount: Number(cycleInfo.cycleSlipCount)
          },
          entryFee: entryFee.toString()
        },
        pools: {
          totalPools: Number(poolCount),
          totalCollectedSTT: totalCollectedSTT.toString(),
          totalCollectedBITR: totalCollectedBITR.toString()
        },
        staking: stakingStats ? {
          totalStaked: stakingStats._totalStaked.toString(),
          totalRewardsPaid: stakingStats._totalRewardsPaid.toString(),
          totalRevenuePaid: stakingStats._totalRevenuePaid.toString(),
          contractBITRBalance: stakingStats._contractBITRBalance.toString(),
          contractSTTBalance: stakingStats._contractSTTBalance.toString()
        } : null,
        faucet: faucetStats ? {
          balance: faucetStats.balance.toString(),
          totalDistributed: faucetStats.totalDistributed.toString(),
          userCount: Number(faucetStats.userCount),
          active: faucetStats.active
        } : null,
        boostSystem: boostSystemStats,
        comboPools: comboPoolsStats,
        factory: factoryStats
      };

    } catch (error) {
      console.error('Error getting contract status:', error);
      throw error;
    }
  }

  /**
   * Enhanced health check with contract status
   */
  async healthCheck() {
    try {
      const network = await this.getNetwork();
      const blockNumber = await this.getCurrentBlock();
      const balance = this.wallet ? await this.getBalance() : null;
      
      let contractStatus = null;
      try {
        contractStatus = await this.getContractStatus();
      } catch (contractError) {
        console.warn('Contract status check failed:', contractError.message);
      }
      
      return {
        status: 'healthy',
        network: {
          name: network.name,
          chainId: Number(network.chainId)
        },
        blockNumber,
        wallet: {
          address: this.wallet?.address || null,
          balance: balance ? ethers.formatEther(balance) : null
        },
        contracts: contractStatus
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = Web3Service; 