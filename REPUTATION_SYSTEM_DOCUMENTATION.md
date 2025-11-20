# Bitredict Reputation System Documentation

## Overview
The Bitredict reputation system integrates both **BitredictPool** and **Oddyssey** activities into a unified reputation scoring system. Users can earn reputation points through various actions, unlocking privileges and badges as they progress. **High reputation means this person is truly wise and has earned high status.**

## 🏆 Reputation Tiers

| Tier | Reputation Range | Description | Privileges |
|------|------------------|-------------|------------|
| **NEWCOMER** | 0-39 | New users starting their journey | Basic platform access |
| **ACTIVE** | 40-149 | Can place bets, create guided markets | Betting & guided markets |
| **REGULAR** | 149-299 | Can create open markets | Open market creation |
| **VETERAN** | 300-499 | Experienced users | Premium features |
| **EXPERT** | 300-599 | High-reputation users | **Prediction selling & Article sharing** |
| **LEGENDARY** | 600-700 | Elite community members | All platform privileges |

## 🎯 Minimum Reputation Requirements

### **Action Requirements:**
- **Place Bets:** 40+ reputation required
- **Create Guided Markets:** 40+ reputation required  
- **Create Open Markets:** 100+ reputation required
- **Propose Outcomes:** 100+ reputation required
- **Sell Predictions:** 300+ reputation required
- **Share Articles:** 300+ reputation required

## 📊 Reputation Actions & Points

### **BitredictPool Actions**

| Action | Points | Description | Requirements |
|--------|--------|-------------|--------------|
| `POOL_CREATED` | +4 | Created a new prediction pool | 40+ rep for guided, 100+ for open |
| `BET_PLACED` | +2 | Placed a bet on any pool | 40+ reputation required |
| `POOL_FILLED_ABOVE_60` | +8 | Pool filled above 60% capacity | Creator reward |
| `POOL_SPAMMED` | -15 | Pool marked as spam (penalty) | Anti-spam measure |
| `BET_WON` | +3 | Won any bet | Base winning reward |
| `BET_WON_HIGH_VALUE` | +8 | Won high-value bet (5x+ odds) | High-risk reward |
| `BET_WON_MASSIVE` | +15 | Won massive bet (10x+ odds) | Elite reward |
| `OUTCOME_PROPOSED_CORRECTLY` | +12 | Correctly proposed market outcome | 100+ rep required |
| `OUTCOME_PROPOSED_INCORRECTLY` | -20 | Incorrectly proposed market outcome | 100+ rep required |
| `CHALLENGE_SUCCESSFUL` | +10 | Successfully challenged an outcome | 100+ rep required |
| `CHALLENGE_FAILED` | -12 | Failed to challenge an outcome | 100+ rep required |

### **Oddyssey Actions**

| Action | Points | Description | Requirements |
|--------|--------|-------------|--------------|
| `ODDYSSEY_PARTICIPATION` | +1 | Participated in Oddyssey cycle | Base participation |
| `ODDYSSEY_QUALIFYING` | +3 | Achieved 7+ correct predictions | Qualifying score |
| `ODDYSSEY_EXCELLENT` | +4 | Achieved 8+ correct predictions | Excellent score |
| `ODDYSSEY_OUTSTANDING` | +6 | Achieved 9+ correct predictions | Outstanding score |
| `ODDYSSEY_PERFECT` | +8 | Achieved perfect 10/10 predictions | Perfect score |
| `ODDYSSEY_WINNER` | +10 | Won Oddyssey cycle (top 5) | Cycle winner |
| `ODDYSSEY_CHAMPION` | +15 | Won multiple cycles (earned only once) | Elite achievement |

### **High Value Bet Definition:**
- **High Value:** Won 1M+ BITR (excluding initial stake)
- **Massive Value:** Won 2M+ BITR (excluding initial stake)
- **Elite Value:** Won 5M+ BITR (excluding initial stake)

## 🏅 Badge System

### **Creator Badges**
- **Sharpshooter** - Win rate > 75% across 20+ pools
- **Stone Face** - Risked > 500 STT total
- **Mastermind** - Created pools in 5+ categories
- **Crowd Slayer** - Won against 30+ bettors in one pool
- **Comeback King** - 3 wins after back-to-back losses

### **Bettor Badges**
- **Sniper** - 3+ successful high-odds (5x+) bets
- **Rising Star** - 5-bet winning streak
- **Analyst** - Above 60% correct prediction rate over 25 bets
- **Giant Slayer** - Beat a creator with >80% win rate
- **Explorer** - Bet against 10+ different creators

### **Community Badges**
- **Socialite** - Posted 50+ comments across pools
- **Influencer** - Reputation score above 300
- **Philosopher** - Wrote 25+ thoughtful reflections
- **Mentor** - Helped 10+ new users with guidance

### **Oddyssey Badges** 🎮
- **Oddyssey Rookie** - Participated in 5+ Oddyssey cycles
- **Oddyssey Sharpshooter** - Achieved 8+ correct predictions in a single cycle
- **Oddyssey Perfectionist** - Achieved perfect 10/10 predictions in a cycle
- **Oddyssey Champion** - Won 3+ Oddyssey cycles
- **Oddyssey Legend** - Achieved 300+ Oddyssey reputation points

### **Special Badges**
- **Early Adopter** - Joined Bitredict in the first month
- **Lucky Streak** - 7 consecutive wins
- **Risk Taker** - Placed 10+ high-risk bets
- **Community Pillar** - 100+ positive interactions

## 🔄 System Integration

### **Event Indexing**
- **BitredictPool Indexer** - Tracks all pool and bet events
- **Oddyssey Indexer** - Tracks all game and reputation events
- **Unified Storage** - All reputation actions stored in `core.reputation_actions`

### **Database Schema**
```sql
-- Core reputation tracking
core.users (
  address TEXT PRIMARY KEY,
  reputation INTEGER DEFAULT 40,
  can_sell_predictions BOOLEAN DEFAULT FALSE,
  can_share_articles BOOLEAN DEFAULT FALSE,
  reputation_tier VARCHAR(20) DEFAULT 'NEWCOMER'
)

-- Reputation action history
core.reputation_actions (
  id BIGSERIAL PRIMARY KEY,
  user_address TEXT NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  reputation_delta INTEGER NOT NULL,
  associated_value TEXT,
  pool_id TEXT,
  timestamp TIMESTAMP WITH TIME ZONE,
  block_number BIGINT,
  transaction_hash TEXT
)

-- Badge tracking
core.user_badges (
  user_address TEXT,
  badge_type VARCHAR(50),
  badge_category VARCHAR(20),
  title VARCHAR(100),
  description TEXT,
  icon_name VARCHAR(50),
  rarity VARCHAR(20),
  criteria_met JSONB
)
```

### **Contract Integration**
- **BitredictPool.sol** - Emits `ReputationActionOccurred` events
- **Oddyssey.sol** - Emits `OddysseyReputationUpdated` events
- **OptimisticOracle.sol** - Emits `ReputationUpdated` events

## 🚀 Future Features

### **Prediction Selling**
- **300+ Rep:** Can sell predictions at platform-set rates
- **400+ Rep:** Can set custom prices for their predictions
- Quality predictions earn additional reputation
- Market-based pricing system

### **Article Sharing (300+ Rep)**
- Users can publish articles and insights
- Community voting system
- Reputation rewards for quality content

### **Advanced Analytics**
- Detailed reputation breakdown
- Performance tracking
- Achievement progress

## 📈 Reputation Management

### **Default Values**
- **Starting Reputation:** 40 points (can place bets immediately)
- **Maximum Reputation:** 500 points
- **Privilege Threshold:** 300 points

### **Reputation Calculation**
```javascript
// Example reputation update
const newReputation = Math.max(0, Math.min(500, currentReputation + reputationDelta));

// Privilege check
const privileges = {
  canSellPredictions: reputation >= 300,
  canShareArticles: reputation >= 300,
  tier: getReputationTier(reputation)
};
```

### **Automatic Updates**
- Reputation updates happen automatically via event indexing
- Badge checks run periodically
- Privilege updates are immediate

## 🔧 Technical Implementation

### **Key Files**
- `backend/utils/reputationManager.js` - Central reputation management
- `backend/utils/badgeManager.js` - Badge system and criteria
- `backend/indexer.js` - BitredictPool event indexing
- `backend/indexer_oddyssey.js` - Oddyssey event indexing
- `backend/test-indexing-integration.js` - Integration testing

### **Migration Files**
- `backend/migrations/add-resolution-columns.sql` - Oddyssey resolution columns
- `backend/migrations/add-user-privileges.sql` - User privilege columns
- `backend/migrations/create-reputation-actions.sql` - Reputation tracking table

### **Testing**
```bash
# Run integration test
cd backend && node test-indexing-integration.js

# Expected output:
# ✅ All systems integrated and ready!
# 📊 Integration Report with all features confirmed
```

## 🎯 Success Metrics

### **System Health**
- ✅ All indexers connected and running
- ✅ Database schema complete and indexed
- ✅ Event tracking working for both platforms
- ✅ Reputation calculation accurate
- ✅ Badge system integrated
- ✅ Privilege system functional

### **User Experience**
- Seamless reputation earning across platforms
- Clear progression path with visible rewards
- Meaningful privileges at 300+ reputation
- Comprehensive badge system for motivation

---

**Last Updated:** August 5, 2025  
**System Status:** ✅ Fully Integrated and Operational  
**Max Reputation:** 500 points  
**Privilege Threshold:** 300 points  
**Supported Platforms:** BitredictPool + Oddyssey 