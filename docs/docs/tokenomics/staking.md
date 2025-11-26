---
sidebar_position: 3
---

# BITR Staking System

Stake BITR tokens in tiered pools to earn **dual rewards**: fixed APY returns plus revenue sharing from platform fees. Our staking system features three distinct tiers with increasing benefits for larger, longer-term commitments.

## 🏗️ Three-Tier Structure

### Tier System Overview

| Tier | Min Stake | Base APY | Revenue Share | Lock Periods |
|------|-----------|----------|---------------|--------------|
| **Bronze** | 1,000 BITR | 6% | 10% | 30/60/90 days |
| **Silver** | 3,000 BITR | 12% | 30% | 30/60/90 days |
| **Gold** | 10,000 BITR | 18% | 60% | 30/60/90 days |

### Duration Bonuses

Choose your lock period for additional APY bonuses:
- **30 days**: +0% bonus (base APY)
- **60 days**: +2% bonus (e.g., 6% → 8%)
- **90 days**: +4% bonus (e.g., 6% → 10%)

## 💰 Dual Reward System

### 1. APY Rewards (BITR)
- **Fixed returns** based on tier and duration
- **Continuously accruing** rewards calculated per second
- **Claim anytime** without penalties
- **Auto-claimed** when unstaking

#### APY Calculation Example
```
Bronze Tier (90-day lock):
- Base APY: 6%
- Duration bonus: +4%
- Total APY: 10%

For 5,000 BITR staked for 30 days:
Daily reward = (5,000 × 10%) ÷ 365 = 1.37 BITR/day
```

### 2. Revenue Sharing (BITR + STT)
- **Monthly distributions** from platform revenue
- **Proportional sharing** within each tier
- **Both tokens**: BITR and native STT
- **Tier-based rates**: Higher tiers get larger revenue shares

#### Revenue Sources
Platform collects fees from:
- **Pool creation**: 1 STT per pool
- **Bettor winnings**: 5% platform fee
- **Pool boosts**: 2-5 STT per boost
- **Oracle fees**: Additional fees for open markets

## 🔒 Staking Mechanics

### How to Stake

1. **Choose Your Tier**
   - Must meet minimum BITR requirement
   - Higher tiers = better rewards

2. **Select Lock Duration**
   - 30, 60, or 90 days
   - Longer locks = higher APY bonuses

3. **Stake Tokens**
   - Transfer BITR to staking contract
   - Start earning immediately

4. **Multiple Stakes Allowed**
   - Create multiple stakes with different tiers/durations
   - Diversify your staking strategy

### Claiming Rewards

#### APY Rewards
- **Claim individually** per stake
- **No penalties** for claiming early
- **Compounds** if left unclaimed

#### Revenue Rewards  
- **Monthly distributions** (30-day intervals)
- **Automatic allocation** to eligible stakers
- **Claim anytime** after distribution
- **Separate claim** for BITR and STT

### Unstaking Process

1. **Wait for lock period** to complete
2. **Auto-claim** all pending APY rewards
3. **Receive principal** BITR back
4. **Revenue rewards** remain claimable separately

## 📊 Revenue Distribution

### Monthly Revenue Sharing

Revenue is distributed monthly based on tier allocation:

```
Example Monthly Revenue: 10,000 STT + 50,000 BITR

Tier Allocations:
- Bronze (10% share): 1,000 STT + 5,000 BITR
- Silver (30% share): 3,000 STT + 15,000 BITR  
- Gold (60% share): 6,000 STT + 30,000 BITR

Within each tier, rewards split proportionally by stake amount
```

### Distribution Mechanics
- **30-day intervals** between distributions
- **Proportional sharing** within tiers based on stake amount
- **Revenue pools** accumulate until distribution
- **Authorized pools** can add revenue automatically

## 🎯 Strategic Considerations

### Tier Selection Strategy

#### Bronze Tier (1,000+ BITR)
- **Low barrier entry** for small holders
- **Steady 6-10% APY** with lock bonuses
- **Basic revenue sharing** at 10%
- **Good for**: Testing the system, small investors

#### Silver Tier (3,000+ BITR)
- **Balanced approach** for medium holders
- **Strong 12-16% APY** with lock bonuses
- **Substantial revenue sharing** at 30%
- **Good for**: Regular platform users, moderate investors

#### Gold Tier (10,000+ BITR)
- **Premium benefits** for large holders
- **Excellent 18-22% APY** with lock bonuses
- **Maximum revenue sharing** at 60%
- **Good for**: Platform power users, large investors

### Duration Strategy

#### 30-Day Locks
- **Flexibility** for uncertain market conditions
- **Base APY** without bonuses
- **Quick access** to principal

#### 60-Day Locks
- **Balanced** commitment vs. reward
- **+2% APY bonus** 
- **Medium-term** strategy

#### 90-Day Locks
- **Maximum APY bonuses** (+4%)
- **Best long-term returns**
- **Commitment required**

## 🔧 Technical Features

### Smart Contract Security
- **Reentrancy protection** on all critical functions
- **Role-based access** for revenue additions
- **Overflow protection** for all calculations
- **Emergency functions** for admin control

### Integration Points
- **Authorized pools** can add revenue automatically
- **BitredictPool** integration for fee collection
- **Revenue tracking** for transparency
- **Statistics functions** for analytics

### Gas Optimization
- **Batch operations** where possible
- **Efficient storage** with packed structs
- **Minimal state changes** in view functions
- **Event indexing** for frontend integration

## 📈 Expected Returns

### Conservative Estimate (Bronze, 30-day)
```
Stake: 1,000 BITR
APY: 6% 
Monthly revenue: ~1-2% additional
Total monthly return: ~1.5-2%
```

### Aggressive Estimate (Gold, 90-day)
```
Stake: 10,000 BITR  
APY: 22% (18% + 4% bonus)
Monthly revenue: ~3-5% additional
Total monthly return: ~4-6%
```

### Revenue Sharing Impact
Revenue sharing provides additional yield that can significantly boost returns during high platform activity periods.

---

## 💡 Key Benefits

### For Platform Growth
- **Long-term alignment** between token holders and platform success
- **Capital efficiency** through tiered requirements
- **Revenue sustainability** through fee sharing

### For Stakers
- **Predictable APY** returns regardless of platform performance  
- **Upside exposure** to platform growth through revenue sharing
- **Flexible options** for different risk/reward preferences
- **Compound growth** through dual reward mechanisms

---

*The staking system aligns long-term token holders with platform success while providing predictable returns and upside exposure to revenue growth.*


