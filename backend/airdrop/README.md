# Airdrop System Implementation

## Overview

This system tracks BITR testnet activities to determine mainnet airdrop eligibility based on the requirements documented in `docs/docs/tokenomics/airdrop.md`.

## Database Schema

### Required Tables

```sql
-- Create airdrop schema
CREATE SCHEMA IF NOT EXISTS airdrop;

-- Track faucet claims (20K BITR per wallet)
CREATE TABLE airdrop.faucet_claims (
    id BIGSERIAL PRIMARY KEY,
    user_address TEXT NOT NULL UNIQUE,
    amount NUMERIC(78, 18) NOT NULL DEFAULT '20000000000000000000000',
    claimed_at TIMESTAMPTZ NOT NULL,
    block_number BIGINT NOT NULL,
    transaction_hash TEXT NOT NULL UNIQUE,
    had_stt_activity BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track all BITR activities for eligibility
CREATE TABLE airdrop.bitr_activities (
    id BIGSERIAL PRIMARY KEY,
    user_address TEXT NOT NULL,
    activity_type TEXT NOT NULL, -- 'POOL_CREATE', 'BET_PLACE', 'STAKING', 'TRANSFER_IN', 'TRANSFER_OUT'
    amount NUMERIC(78, 18),
    pool_id TEXT,
    from_address TEXT,
    to_address TEXT,
    transaction_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track staking activities
CREATE TABLE airdrop.staking_activities (
    id BIGSERIAL PRIMARY KEY,
    user_address TEXT NOT NULL,
    action_type TEXT NOT NULL, -- 'STAKE', 'UNSTAKE', 'CLAIM_REWARDS'
    amount NUMERIC(78, 18),
    tier_id INTEGER,
    duration_option INTEGER,
    transaction_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track transfer patterns for Sybil detection
CREATE TABLE airdrop.transfer_patterns (
    id BIGSERIAL PRIMARY KEY,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    amount NUMERIC(78, 18) NOT NULL,
    transaction_hash TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    is_suspicious BOOLEAN DEFAULT FALSE,
    suspicion_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-computed eligibility status
CREATE TABLE airdrop.eligibility (
    user_address TEXT PRIMARY KEY,
    has_faucet_claim BOOLEAN DEFAULT FALSE,
    faucet_claim_date TIMESTAMPTZ,
    has_stt_activity_before_faucet BOOLEAN DEFAULT FALSE,
    bitr_action_count INTEGER DEFAULT 0,
    has_staking_activity BOOLEAN DEFAULT FALSE,
    oddyssey_slip_count INTEGER DEFAULT 0,
    has_suspicious_transfers BOOLEAN DEFAULT FALSE,
    is_transfer_only_recipient BOOLEAN DEFAULT FALSE,
    consolidation_detected BOOLEAN DEFAULT FALSE,
    is_eligible BOOLEAN DEFAULT FALSE,
    snapshot_bitr_balance NUMERIC(78, 18) DEFAULT 0,
    airdrop_amount NUMERIC(78, 18) DEFAULT 0,
    eligibility_updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Snapshot management
CREATE TABLE airdrop.snapshots (
    id BIGSERIAL PRIMARY KEY,
    snapshot_name TEXT NOT NULL UNIQUE,
    snapshot_block BIGINT NOT NULL,
    snapshot_timestamp TIMESTAMPTZ NOT NULL,
    total_eligible_wallets INTEGER DEFAULT 0,
    total_eligible_bitr NUMERIC(78, 18) DEFAULT 0,
    total_airdrop_allocated NUMERIC(78, 18) DEFAULT '5000000000000000000000000',
    is_final BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual wallet balances at snapshot
CREATE TABLE airdrop.snapshot_balances (
    id BIGSERIAL PRIMARY KEY,
    snapshot_id BIGINT NOT NULL REFERENCES airdrop.snapshots(id),
    user_address TEXT NOT NULL,
    bitr_balance NUMERIC(78, 18) NOT NULL,
    is_eligible BOOLEAN NOT NULL,
    airdrop_amount NUMERIC(78, 18) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(snapshot_id, user_address)
);
```

## Indexer Requirements

### Events to Track

1. **BITR Token Events**
   - Transfer events (for all movements)
   - Faucet claims (Transfer from faucet address)

2. **Staking Contract Events**
   - Staked events
   - Unstaked events  
   - Claimed events (reward claims)

3. **Pool/Betting Events (for BITR usage)**
   - Pool creation with BITR
   - Betting with BITR

### Indexer Implementation

```javascript
class AirdropIndexer {
  async indexBITRTransfers(fromBlock, toBlock) {
    // Track all BITR ERC20 Transfer events
    // Detect faucet claims (transfers from faucet address)
    // Record transfer patterns for Sybil detection
  }

  async indexStakingEvents(fromBlock, toBlock) {
    // Track staking activities
    // Record as BITR activities for eligibility counting
  }

  async updateEligibility() {
    // Recalculate eligibility for all faucet claimers
    // Check all 4 requirements + Sybil flags
  }
}
```

## Eligibility Calculation Logic

### Requirements (ALL must be met)

1. **STT Activity Before Faucet** ✅
   ```sql
   SELECT EXISTS(
     SELECT 1 FROM prediction.bets WHERE user_address = $1 AND created_at < faucet_claim_date
     UNION
     SELECT 1 FROM prediction.pools WHERE creator_address = $1 AND creation_time < faucet_claim_date
   )
   ```

2. **20+ BITR Actions After Faucet** ✅
   ```sql
   SELECT COUNT(*) FROM airdrop.bitr_activities
   WHERE user_address = $1 
   AND activity_type IN ('POOL_CREATE', 'BET_PLACE', 'STAKING')
   AND timestamp > faucet_claim_date
   ```

3. **Has Staking Activity** ✅
   ```sql
   SELECT EXISTS(
     SELECT 1 FROM airdrop.staking_activities
     WHERE user_address = $1 AND action_type = 'STAKE'
   )
   ```

4. **3+ Oddyssey Slips** ✅
   ```sql
   SELECT COUNT(*) FROM oddyssey.slips WHERE user_address = $1
   ```

### Sybil Detection (ANY disqualifies)

1. **Suspicious Transfers** ❌
   - Large consolidations from multiple addresses
   - Immediate transfers after faucet claim

2. **Transfer-Only Recipients** ❌
   - Addresses that only received BITR without platform activity

3. **Multi-Claim Attempts** ❌
   - Patterns suggesting same user across multiple wallets

## Snapshot Process

### Calculation Formula

```
airdropAmount = (userBITRBalance / totalEligibleBITR) × 5,000,000 BITR
```

### Implementation Steps

1. **Take Snapshot**
   - Record current block number and timestamp
   - Get BITR balances for all eligible users
   - Calculate total eligible BITR

2. **Calculate Proportional Distribution**
   - Apply formula to each eligible user
   - Store results in snapshot_balances table
   - Update eligibility table with final amounts

3. **Generate Merkle Tree** (for mainnet claims)
   - Create Merkle tree of eligible addresses and amounts
   - Store root hash for smart contract verification

## API Endpoints

### User Eligibility Check
```
GET /airdrop/eligibility/:address
```

### Airdrop Statistics
```
GET /airdrop/statistics
```

### Admin Snapshot
```
POST /airdrop/snapshot
{
  "name": "final_snapshot_2024"
}
```

## Implementation Priority

1. ✅ **Database Schema** - Create all required tables
2. ✅ **BITR Token Indexer** - Track transfers and faucet claims  
3. ✅ **Staking Indexer** - Track staking activities
4. ✅ **Eligibility Calculator** - Implement requirement checking logic
5. ✅ **Sybil Detection** - Implement pattern analysis
6. ✅ **Snapshot System** - Balance recording and distribution calculation
7. ✅ **API Endpoints** - User eligibility and statistics endpoints
8. ✅ **Admin Dashboard** - Monitor eligibility and take snapshots

## Smart Contract Integration

### Required Contract Addresses
```javascript
const config = {
  contracts: {
    bitrToken: "0x...", // BITR ERC20 contract
    staking: "0x...",   // Staking contract
    faucet: "0x...",    // Faucet contract
    pool: "0x..."       // Pool contract
  }
}
```

### Event Signatures
```javascript
// BITR Token
"Transfer(address indexed from, address indexed to, uint256 value)"

// Staking Contract
"Staked(address indexed user, uint256 amount, uint8 tier, uint8 duration)"
"Unstaked(address indexed user, uint256 amount)"
"Claimed(address indexed user, uint256 bitrAmount)"

// Pool Contract (if BITR-specific events exist)
"PoolCreatedWithBITR(uint256 indexed poolId, address indexed creator, uint256 bitrAmount)"
"BetPlacedWithBITR(uint256 indexed poolId, address indexed bettor, uint256 bitrAmount)"
```

## Security Considerations

1. **Sybil Resistance**
   - Multiple wallet detection
   - Activity pattern analysis
   - Time-based consolidation detection

2. **Data Integrity**
   - Blockchain event verification
   - Snapshot immutability
   - Audit trail for all calculations

3. **Fair Distribution**
   - Proportional allocation based on actual holdings
   - Anti-gaming measures
   - Clear eligibility criteria

## Monitoring & Analytics

### Key Metrics to Track
- Total faucet claims
- Eligibility rate (% of claimers who become eligible)
- Average BITR activities per user
- Sybil detection rate
- Distribution of airdrop amounts

### Real-time Dashboards
- Eligibility progress by requirement
- Activity heatmaps
- Transfer pattern analysis
- Snapshot readiness indicators 