---
sidebar_position: 4
---

# Prediction Markets

Bitredict offers **two distinct types of prediction markets** designed to serve different use cases and user preferences. Our dual-market approach ensures both **automated reliability** and **community-driven flexibility**.

## 🎯 Market Types Overview

| Feature | Guided Markets | Open Markets |
|---------|----------------|---------------|
| **Outcome Source** | External APIs | Community Consensus |
| **Resolution Speed** | Instant | 24-48 hours |
| **Data Reliability** | Very High | High (with disputes) |
| **Market Variety** | Sports, Crypto | Unlimited |
| **User Participation** | Pool Creation + Liquidity | Pool Creation + Outcome Proposals |
| **Fees** | Standard | Higher (oracle costs) |

## 🎲 How Bitredict Pools Work

**Important**: Bitredict uses a unique **contrarian pool structure** that's different from traditional prediction markets. Understanding this is crucial:

### The Pool Structure Explained

#### 🏗️ **Pool Creator (The Contrarian)**
- Creates a pool by specifying what they think is **UNLIKELY to happen**
- Stakes their own money **AGAINST** this outcome occurring  
- **Wins** if their predicted outcome does NOT happen
- **Loses** if their predicted outcome actually happens

#### 🎯 **Bettors (The Believers)**  
- Bet **FOR** the creator's predicted outcome to happen
- Think the creator is wrong and the outcome WILL occur
- **Win** if the predicted outcome happens (get creator's money)
- **Lose** if the predicted outcome doesn't happen

#### 💰 **Liquidity Providers (LPs)**
- Join the creator's side by adding liquidity
- Also betting **AGAINST** the predicted outcome
- Share wins/losses proportionally with the creator

### 📖 Example: Football Match Pool

Let's walk through a concrete example:

```
🏆 Pool: "Chelsea beats Fulham"
Creator: Alice (thinks Chelsea WON'T win)
Alice stakes: 100 STT against Chelsea winning
Odds: 1.5x (meaning 50 STT max can be bet on Chelsea winning)

👥 Participants:
- Bob bets 30 STT FOR Chelsea winning  
- Carol bets 20 STT FOR Chelsea winning
- Dave (LP) adds 50 STT AGAINST Chelsea winning (joins Alice's side)

💰 Total Pool: 200 STT
- Against Chelsea: 150 STT (Alice: 100 + Dave: 50)  
- For Chelsea: 50 STT (Bob: 30 + Carol: 20)
```

**Scenario 1: Chelsea wins**
- Predicted outcome happened → Bettors win, Creator/LPs lose
- Bob gets: 30 × 1.5 = 45 STT (minus platform fee)
- Carol gets: 20 × 1.5 = 30 STT (minus platform fee)  
- Alice loses: her 100 STT
- Dave loses: his 50 STT

**Scenario 2: Fulham wins (or draw)**
- Predicted outcome didn't happen → Creator/LPs win, Bettors lose
- Alice gets: 100 STT back + (50 × 100/150) = 133.33 STT
- Dave gets: 50 STT back + (50 × 50/150) = 66.67 STT
- Bob loses: his 30 STT
- Carol loses: her 20 STT

## 🔮 Guided Markets

**Automated prediction markets** powered by verified external data sources.

### How Guided Markets Work

1. **Pool Creation**: Users create pools for events they think are unlikely
2. **Data Integration**: Markets are linked to SportMonks/CoinGecko APIs
3. **Automatic Settlement**: Oracles resolve outcomes instantly when data is available
4. **Instant Payouts**: Winners receive rewards immediately after settlement

### Supported Data Sources

#### ⚽ **Sports Markets** (via SportMonks API)
- **Football/Soccer**: Premier League, La Liga, Champions League, World Cup
- **Basketball**: NBA, EuroLeague, NCAA  
- **American Football**: NFL, College Football
- **Tennis**: ATP, WTA, Grand Slams
- **Other Sports**: Hockey, Baseball, Cricket, Rugby

**Market Types Available:**
- **Match Outcomes**: Home Win, Draw, Away Win
- **Over/Under Goals**: 0.5, 1.5, 2.5, 3.5+ goals
- **Both Teams to Score**: Yes/No
- **Half-time Results**: First half outcomes
- **Correct Score**: Exact final score predictions

#### 💰 **Crypto Markets** (via CoinGecko API)  
- **Price Predictions**: Will BTC reach $100K by year-end?
- **Market Cap Rankings**: Will ETH flip BTC?
- **New Listings**: Will [Token] get listed on major exchanges?
- **DeFi Metrics**: Will TVL reach certain milestones?
- **NFT Collections**: Floor price predictions

### Guided Market Benefits

✅ **Instant Settlement** - No waiting for community consensus  
✅ **100% Reliable Data** - Verified external sources
✅ **Lower Fees** - No oracle bonding required
✅ **High Liquidity** - Multiple LPs can join creator's side  
✅ **Broad Coverage** - Thousands of events monthly

### Example: Creating a Football Pool

```
🏆 Manchester United vs Liverpool  
📅 Sunday, December 15, 2024 - 16:30 UTC
🔮 Data Source: SportMonks API

Alice creates pool: "Manchester United wins"
- Alice thinks Man Utd is UNLIKELY to win
- Stakes 200 STT against Man Utd winning
- Sets odds at 2.0x (allows 100 STT max bets for Man Utd)

Available for bettors:
- Bet FOR Man Utd winning (if you think Alice is wrong)
- Max total bets: 100 STT  
- Payout if Man Utd wins: 2.0x your bet

Auto-settlement: 90 minutes after final whistle
```

## 🗳️ Open Markets

**Community-driven prediction markets** for unlimited event types.

### How Open Markets Work

1. **Market Creation**: Users create pools for any custom event
2. **Event Resolution**: Community proposes what actually happened  
3. **Optimistic Oracle**: Outcomes are disputed/validated by community
4. **Settlement**: Pools resolve based on community consensus

### Optimistic Oracle System

#### 📝 **Proposal Phase** (24 hours)
- Anyone can propose the actual outcome by staking tokens
- Proposals are assumed correct unless challenged
- Multiple outcomes can be proposed

#### ⚖️ **Challenge Phase** (24 hours)
- Community can dispute by staking more tokens
- Challengers must provide evidence
- Economic incentives align with truth-telling

#### 🏆 **Resolution Phase**  
- If unchallenged: Original proposal accepted
- If challenged: Community voting determines outcome
- Winners get their stake back + portion of losers' stakes

### Open Market Categories

#### 🏛️ **Politics & Governance**
- Election outcomes and polling predictions
- Policy decisions and referendum results  
- Political appointments and confirmations
- Regulatory decisions and timelines

#### 📈 **Business & Finance**
- Corporate earnings and revenue forecasts
- Merger & acquisition predictions
- Product launch success metrics
- Stock price movements and milestones

#### 🌍 **World Events**
- Climate and weather predictions
- Geopolitical developments  
- Scientific breakthroughs and discoveries
- Entertainment and cultural events

#### 🎮 **Gaming & Esports**
- Tournament outcomes and player performance
- Game release dates and success metrics
- Streaming platform statistics
- Virtual world events and economies

### Economic Incentives

#### 💰 **Reward Structure**
- **Correct Proposers**: Get stake back + 50% of challenger stake
- **Successful Challengers**: Get stake back + 50% of proposer stake
- **Voters (if disputed)**: Receive 10% of total disputed amount
- **Platform**: Takes 5% fee on disputed amounts

#### 🛡️ **Anti-Spam Mechanisms**
- **Minimum Stake**: 100 BITR tokens to propose outcomes
- **Reputation Requirements**: Higher thresholds for sensitive topics
- **Cooling Periods**: Limits on proposal frequency per user

### Example: Custom Market

```
🗳️ Will Apple announce a VR headset in Q1 2025?

Sarah creates pool: "Apple announces VR headset in Q1 2025"
- Sarah thinks this is UNLIKELY to happen
- Stakes 500 STT against the announcement
- Sets odds at 3.0x

Resolution Method: Optimistic Oracle
- Community will propose actual outcome after Q1 2025
- Verified by official Apple announcements/press releases
- Disputed outcomes resolved by community voting

Available for bettors:
- Bet FOR Apple announcement (if you think Sarah is wrong)
- Max total bets: ~167 STT
- Payout if Apple announces: 3.0x your bet
```

## 🚀 Pool Creation Guide

### Step-by-Step Process

1. **Choose Your Contrarian Position**
   - Pick an outcome you think is UNLIKELY to happen  
   - Remember: You profit when your prediction doesn't occur

2. **Set Pool Parameters**
   - **Stake Amount**: How much you're willing to risk
   - **Odds**: Higher odds = more confident the outcome won't happen
   - **Max Bet Per User**: Optional limit on individual bets

3. **Deploy Pool**
   - Pay 1 STT creation fee + your stake amount
   - Pool appears in platform listings
   - Others can join your side as LPs or bet against you

4. **Attract Participants**
   - Market your contrarian view
   - Share analysis of why outcome is unlikely
   - Wait for believers to bet against your position

### Pool Parameters Explained

#### 🎯 **Odds Setting**
- **1.5x odds**: You think outcome has ~33% chance  
- **2.0x odds**: You think outcome has ~50% chance
- **3.0x odds**: You think outcome has ~67% chance
- **Higher odds**: More confident outcome won't happen

#### 💰 **Stake Calculation**
Your stake determines maximum bets against you:
- At 2.0x odds: Max bets = Your stake ÷ 1
- At 3.0x odds: Max bets = Your stake ÷ 2  
- At 4.0x odds: Max bets = Your stake ÷ 3

## 📊 Market Mechanics & Fees

### Pool Economics

#### 💰 **Fee Structure**
- **Creation Fee**: 1 STT per pool
- **Platform Fee**: 5% on bettor winnings (reduced with BITR holdings)
- **Oracle Fee**: Additional 2% for open markets  
- **No Fees**: Creators and LPs don't pay fees on winnings

#### 🏦 **Liquidity Provision**
- **Join Creator's Side**: Add liquidity to bet against predicted outcome
- **Proportional Rewards**: Share winnings based on your contribution
- **Early Withdrawal**: Possible before events start (if no opposing bets)

#### ⚖️ **Risk Management**
- **Maximum Pool Size**: 1M tokens per pool
- **Maximum Bet**: 100K tokens per individual bet
- **Reputation Gating**: Higher-reputation users get better terms
- **Pool Limits**: Maximum 500 participants per pool

### Why This Structure Works

#### 🧠 **Psychological Benefits**
- **Contrarian Rewards**: Profit from being right about unlikely events
- **Market Efficiency**: Contrarians provide valuable price discovery
- **Reduced Bias**: Forces creators to really think if outcome is unlikely

#### 💡 **Strategic Advantages**  
- **Better Odds**: Contrarians often spot overvalued outcomes
- **Market Making**: Creators provide liquidity for underrepresented views
- **Knowledge Rewards**: Domain experts profit from superior analysis

---

*Understanding this contrarian structure is key to success on Bitredict. Creators make money by correctly identifying what WON'T happen, while bettors profit by spotting when creators are wrong.* 