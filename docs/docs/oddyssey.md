---
sidebar_position: 6
---

# Oddyssey Daily Contest

**Oddyssey** is Bitredict's **daily parlay betting game** where players predict outcomes across exactly 10 curated matches. Unlike traditional prediction games, Oddyssey uses a **multiplicative odds-based scoring system** that rewards both accuracy and backing higher-risk outcomes.

## 🎮 Game Overview

### What is Oddyssey?
Oddyssey is a **daily prediction contest** where players:
- Must predict outcomes for **all 10 daily matches** (no partial slips)
- Choose between **Moneyline** (1X2) and **Over/Under** markets per match
- Compete for daily prizes using **odds-multiplied scoring**
- Need **minimum 5 correct predictions** to qualify for leaderboard

### Core Mechanics
- **Entry Fee**: Fixed amount in native STT (set by contract)
- **All-or-Nothing**: Must predict all 10 matches in each slip
- **Multiple Slips**: No limit on slips per player per day
- **Parlay Scoring**: Odds multiply together for correct predictions

## 🏆 Game Structure

### Daily Cycle

#### 📅 **24-Hour Periods**
- **Cycle Start**: Oracle sets 10 matches with odds
- **Betting Window**: Until 1 minute before first match starts
- **Match Resolution**: Throughout the day as events complete
- **Scoring**: Players evaluate their own slips after cycle resolves
- **Prize Claims**: Available after all slips evaluated or 24-hour grace period

#### ⚽ **Match Selection**
- Oracle curates **exactly 10 matches** daily
- Each match offers **both Moneyline and Over/Under** markets
- Mix of different sports and leagues
- All matches must have odds set before cycle starts

### Slip Requirements

#### 📝 **Mandatory Full Slips**
- **Required Predictions**: All 10 matches (cannot skip any)
- **Market Choice**: Pick Moneyline OR Over/Under for each match
- **Single Entry Fee**: Pay in native STT only
- **Odds Locking**: Odds fixed at time of slip placement

#### 🎯 **Prediction Options Per Match**

**Moneyline (1X2):**
- **Home Win** ("1")
- **Draw** ("X") - *where applicable*
- **Away Win** ("2")

**Over/Under:**
- **Over** - Total score above the line
- **Under** - Total score below the line

## 📊 Scoring System

### Odds-Multiplicative Scoring

Unlike simple point-based systems, Oddyssey uses **parlay-style scoring** where odds multiply:

#### 🧮 **Score Calculation**
```
Starting Score = 1000 (ODDS_SCALING_FACTOR)

For each CORRECT prediction:
Score = Score × (Selected Odds ÷ 1000)

Final Score = Accumulated Score
If any prediction wrong: Score = 0 (traditional parlay)
```

#### 📈 **Example Calculation**
```
Match 1: Home Win (1.5x odds) ✅ CORRECT
Match 2: Over 2.5 (2.0x odds) ✅ CORRECT  
Match 3: Away Win (3.0x odds) ❌ WRONG
... other matches

Score = 1000 × 1.5 × 2.0 = 3000 points
(Would be 0 in traditional parlay, but Oddyssey scores partial success)
```

### Leaderboard Qualification

#### ⭐ **Minimum Requirements**
- **At least 5 correct predictions** to qualify for daily leaderboard
- **Score tiebreaker**: Higher correct count wins if scores equal
- **Top 5 only**: Daily leaderboard limited to 5 positions

## 💰 Prize Distribution

### Daily Prize Pool

#### 🏆 **Top 5 Prize Structure**
- **1st Place**: 40% of daily pool
- **2nd Place**: 30% of daily pool
- **3rd Place**: 20% of daily pool
- **4th Place**: 5% of daily pool
- **5th Place**: 5% of daily pool

#### 💎 **Pool Sources**
- **Entry Fees**: All daily entry fees (minus dev fee)
- **Rollover Prizes**: Unclaimed prizes from previous days
- **No External Additions**: Pure player-funded pools

#### 🔄 **Prize Rollover System**
- If no player achieves 5+ correct predictions: **entire pool rolls to next day**
- **5% rollover fee** taken for development wallet
- Can create large accumulated pools over multiple days

### Claiming Process

#### ⏰ **Claim Timing**
- **Standard**: Claims available 24 hours after cycle resolution
- **Early Unlock**: Available immediately if all slips evaluated
- **No Expiration**: Prizes don't expire once claimable

#### 💸 **Prize Payouts**
- **5% dev fee** deducted from prize before payout
- **Native STT** payments only
- **One claim per position**: Cannot win multiple positions

## 🎯 Strategic Elements

### Risk vs. Reward Balance

#### 🧠 **High-Odds Strategy**
- **Higher Risk**: Backing underdogs and overs/unders
- **Higher Reward**: Odds multiply to create massive scores
- **Perfect Example**: 5 correct predictions at 3.0x each = 243,000 points

#### 🛡️ **Conservative Strategy**
- **Lower Risk**: Backing favorites with low odds
- **Steady Scoring**: Consistent but lower point totals
- **Example**: 8 correct predictions at 1.2x each ≈ 4,300 points

### Market Selection Tactics

#### ⚖️ **Moneyline vs Over/Under**
- **Moneyline**: Often more predictable, lower odds
- **Over/Under**: Can offer value bets, weather/pace dependent
- **Mix Strategy**: Combine both for optimal risk/reward

#### 🔍 **Odds Analysis**
- **Value Hunting**: Find markets where odds seem generous
- **Correlation Awareness**: Avoid related outcomes across matches
- **Line Shopping**: Compare with external sportsbooks for edge

## 📱 Technical Implementation

### Smart Contract Features

#### 🔒 **Security Measures**
- **Odds Verification**: Must match oracle-provided odds exactly
- **Match Validation**: Predictions must be for exact daily matches
- **Reentrancy Protection**: Safe prize claiming and slip placement

#### ⛽ **Gas Optimization**
- **Batch Operations**: Single transaction for full slip
- **Storage Efficiency**: Packed structs for gas savings
- **Event Indexing**: Efficient tracking of player activity

### Oracle Integration

#### 📡 **Match Management**
- **Daily Setup**: Oracle provides 10 matches with all odds
- **Result Reporting**: Oracle resolves all match outcomes
- **Timing Control**: Oracle sets betting windows and cycle transitions

#### 🎲 **Fair Play**
- **Pre-committed Odds**: Cannot change after cycle starts
- **Transparent Results**: All match results publicly verifiable
- **Automated Scoring**: No human intervention in score calculation

## 🚀 Advanced Features

### Multiple Slip Strategy

#### 🎯 **Portfolio Approach**
- **Diversification**: Submit multiple slips with different risk profiles
- **Hedge Betting**: Cover different scenarios across slips
- **Bankroll Management**: Size entries based on confidence

#### 📊 **Correlation Analysis**
- **Independent Events**: Look for uncorrelated match outcomes
- **League Knowledge**: Leverage expertise in specific competitions
- **Weather/Venue**: Factor external conditions into Over/Under bets

### Long-term Success

#### 📈 **Player Development**
- **Track Record**: Build reputation through consistent performance
- **Market Expertise**: Develop specialization in certain bet types
- **Bankroll Growth**: Compound winnings through reinvestment

#### 🏆 **Competitive Edge**
- **Early Betting**: Get slips in before closing windows
- **Information Advantage**: Use latest injury/weather updates
- **Psychological Factors**: Understand when markets overreact

---

## 💡 Key Differences from Traditional Betting

### Parlay-Style Innovation
- **Partial Success Rewarded**: Unlike traditional parlays, getting some picks right still scores points
- **Odds-Based Scoring**: Rewards taking calculated risks on higher odds
- **Minimum Threshold**: Must hit 5+ correct to qualify, encouraging thoughtful selection

### Community Competition
- **Fixed Entry**: Everyone pays same amount, creating fair competition
- **Transparent Leaderboard**: See exactly how scoring works
- **Daily Reset**: Fresh start every 24 hours regardless of previous performance

---

*Oddyssey rewards both accuracy and smart risk-taking. Success comes from finding the right balance between backing likely outcomes and taking calculated risks on higher-odds selections.* 