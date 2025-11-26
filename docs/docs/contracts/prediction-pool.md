---
sidebar_position: 1
---

# BitredictPool Contract

The **BitredictPool** contract is the core smart contract powering Bitredict's prediction markets. It implements a sophisticated contrarian pool structure with dual oracle support, comprehensive security measures, and gas-optimized operations.

## 📋 Contract Overview

**Network**: Somnia Mainnet  
**Compiler Version**: Solidity ^0.8.20  
**License**: MIT  
**Security**: ReentrancyGuard, Ownable, ECDSA signature verification

## 🏗️ Core Architecture

### Contract Dependencies
```solidity
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
```

### Key Interfaces
```solidity
interface IGuidedOracle {
    function getOutcome(bytes32 marketId) external view returns (bool isSet, bytes memory resultData);
}

interface IOptimisticOracle {
    function getOutcome(bytes32 marketId) external view returns (bool isSettled, bytes memory outcome);
}

interface IBitredictStaking {
    function addRevenue(uint256 bitrAmount, uint256 sttAmount) external;
}

interface IReputationSystem {
    function getUserReputation(address user) external view returns (uint256);
    function canCreateGuidedPool(address user) external view returns (bool);
    function canCreateOpenPool(address user) external view returns (bool);
}
```

## 🎯 Core Enums & Constants

### Oracle Types
```solidity
enum OracleType {
    GUIDED,    // Automated API-based resolution
    OPEN       // Community-driven consensus
}
```

### Reputation Actions
```solidity
enum ReputationAction {
    POOL_CREATED,
    POOL_FILLED_ABOVE_60,
    POOL_SPAMMED,
    BET_WON_HIGH_VALUE,
    OUTCOME_PROPOSED_CORRECTLY,
    OUTCOME_PROPOSED_INCORRECTLY,
    CHALLENGE_SUCCESSFUL,
    CHALLENGE_FAILED
}
```

### Boost Tiers
```solidity
enum BoostTier {
    NONE,
    BRONZE,
    SILVER,
    GOLD
}
```

### Key Constants
```solidity
uint256 public constant creationFeeSTT = 1e18;     // 1 STT
uint256 public constant creationFeeBITR = 50e18;   // 50 BITR
uint256 public constant platformFee = 500;         // 5% platform fee
uint256 public constant minPoolStakeSTT = 5e18;    // 5 STT minimum
uint256 public constant minPoolStakeBITR = 1000e18; // 1000 BITR minimum
uint256 public constant minBetAmount = 1e18;       // 1 token minimum bet
uint256 public constant MAX_PARTICIPANTS = 500;     // Maximum pool participants
uint256 public constant MAX_LP_PROVIDERS = 100;     // Maximum LP providers
```

## 🏗️ Core Functions

### Pool Creation

#### `createPool()`
Creates a new prediction pool with comprehensive parameters and validation.

```solidity
function createPool(
    bytes32 _predictedOutcome,
    uint256 _odds,
    uint256 _creatorStake,
    uint256 _eventStartTime,
    uint256 _eventEndTime,
    string memory _league,
    string memory _category,
    string memory _region,
    bool _isPrivate,
    uint256 _maxBetPerUser,
    bool _useBitr,
    OracleType _oracleType,
    bytes32 _marketId
) external payable
```

**Parameters:**
- `_predictedOutcome`: The outcome the creator believes is unlikely
- `_odds`: Odds multiplier (scaled by 100, e.g., 250 = 2.5x)
- `_creatorStake`: Amount staked against the predicted outcome
- `_eventStartTime`: Unix timestamp when event starts
- `_eventEndTime`: Unix timestamp when event ends
- `_league`: League or competition name
- `_category`: Market category (football, crypto, etc.)
- `_region`: Geographic region
- `_isPrivate`: Whether pool is private/whitelisted
- `_maxBetPerUser`: Maximum bet per individual user
- `_useBitr`: Whether to use BITR tokens (vs STT)
- `_oracleType`: GUIDED or OPEN oracle type
- `_marketId`: External market identifier

**Validation:**
- Minimum stake requirements (5 STT or 1000 BITR)
- Odds range validation (100-10000)
- Event timing validation
- Reputation requirements for guided pools
- Creation fee payment

### Betting Functions

#### `placeBet()`
Place a bet on the predicted outcome occurring.

```solidity
function placeBet(
    uint256 _poolId,
    uint256 _amount,
    bool _useBitr
) external payable
```

**Features:**
- Automatic odds calculation
- Maximum bet enforcement
- Token validation (STT/BITR)
- Pool state validation
- Gas optimization

#### `addLiquidity()`
Provide liquidity to bet against the predicted outcome.

```solidity
function addLiquidity(
    uint256 _poolId,
    uint256 _amount,
    bool _useBitr
) external payable
```

**Features:**
- Proportional reward sharing
- Maximum LP provider limits
- Early withdrawal options
- Creator alignment incentives

#### `claim()`
Claim winnings from a settled pool.

```solidity
function claim(uint256 _poolId) external nonReentrant
```

**Security:**
- Reentrancy protection
- State validation
- Gas optimization
- Error handling

### Pool Management

#### `settlePool()`
Settle a pool based on oracle outcome.

```solidity
function settlePool(
    uint256 _poolId,
    bytes32 _outcome
) external
```

**Oracle Integration:**
- Guided oracle validation
- Optimistic oracle consensus
- Outcome verification
- Automatic settlement

#### `proposeOutcome()`
Propose an outcome for open markets.

```solidity
function proposeOutcome(
    uint256 _poolId,
    bytes32 _proposedOutcome,
    uint256 _stake
) external
```

**Consensus Mechanism:**
- Stake-based proposal system
- Challenge period enforcement
- Economic incentive alignment
- Dispute resolution

## 🔒 Security Features

### Access Control
```solidity
modifier onlyOracle() {
    require(msg.sender == guidedOracle || msg.sender == optimisticOracle, "Only oracle can call");
    _;
}

modifier onlyPoolCreator(uint256 _poolId) {
    require(pools[_poolId].creator == msg.sender, "Only creator can call");
    _;
}
```

### Reentrancy Protection
- All external calls protected with ReentrancyGuard
- State changes before external calls
- Comprehensive validation

### Input Validation
- Range checking for all numeric parameters
- String length validation
- Timestamp validation
- Address validation

### Gas Optimization
- Packed structs for storage efficiency
- Batch operations for multiple actions
- Optimized loops and conditionals
- Efficient event emission

## 📊 Data Structures

### Pool Structure
```solidity
struct Pool {
    address creator;
    bytes32 predictedOutcome;
    uint256 odds;
    uint256 creatorStake;
    uint256 totalBets;
    uint256 totalLiquidity;
    uint256 eventStartTime;
    uint256 eventEndTime;
    string league;
    string category;
    string region;
    bool isPrivate;
    uint256 maxBetPerUser;
    bool useBitr;
    OracleType oracleType;
    bytes32 marketId;
    PoolState state;
    bytes32 finalOutcome;
    uint256 settlementTime;
}
```

### Bet Structure
```solidity
struct Bet {
    address bettor;
    uint256 amount;
    bool useBitr;
    uint256 timestamp;
    bool claimed;
}
```

### Liquidity Provider Structure
```solidity
struct LiquidityProvider {
    address provider;
    uint256 amount;
    bool useBitr;
    uint256 timestamp;
    bool claimed;
}
```

## 🎮 Boost System

### Boost Tiers
```solidity
uint256[4] public boostFees = [0, 2e18, 3e18, 5e18]; // STT fees for each tier
mapping(BoostTier => uint256) public activeBoostCount;
mapping(uint256 => BoostTier) public poolBoostTier;
mapping(uint256 => uint256) public poolBoostExpiry;
```

### Boost Functions
```solidity
function applyBoost(uint256 _poolId, BoostTier _tier) external payable
function removeBoost(uint256 _poolId) external
function getBoostInfo(uint256 _poolId) external view returns (BoostTier, uint256)
```

## 📈 Analytics & Events

### Key Events
```solidity
event PoolCreated(uint256 indexed poolId, address indexed creator, bytes32 predictedOutcome);
event BetPlaced(uint256 indexed poolId, address indexed bettor, uint256 amount);
event LiquidityAdded(uint256 indexed poolId, address indexed provider, uint256 amount);
event PoolSettled(uint256 indexed poolId, bytes32 outcome);
event WinningsClaimed(uint256 indexed poolId, address indexed winner, uint256 amount);
```

### Analytics Functions
```solidity
function getPoolStats(uint256 _poolId) external view returns (PoolStats memory)
function getUserStats(address _user) external view returns (UserStats memory)
function getGlobalStats() external view returns (GlobalStats memory)
```

## 🔧 Integration Points

### Oracle Integration
- **Guided Oracle**: Automated API-based resolution
- **Optimistic Oracle**: Community consensus mechanism
- **Outcome Validation**: Multi-layer verification system

### Token Integration
- **STT Token**: Primary platform token
- **BITR Token**: Governance and staking token
- **Fee Collection**: Automated fee distribution

### Reputation Integration
- **Action Tracking**: Comprehensive reputation actions
- **Tier Progression**: Dynamic reputation scoring
- **Access Control**: Reputation-based permissions

---

*The BitredictPool contract represents a sophisticated implementation of decentralized prediction markets with comprehensive security, efficiency, and user experience considerations.*
