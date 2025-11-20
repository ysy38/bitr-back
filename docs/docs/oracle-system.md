---
sidebar_position: 6
---

# Oracle System

Bitredict's **dual oracle architecture** ensures reliable, verifiable outcomes for all prediction markets. We combine **automated data feeds** for guided markets with **community consensus** for open markets, creating the most robust oracle system in prediction markets.

## 🔮 Oracle Architecture Overview

Our oracle system consists of two complementary components:

- **Guided Oracle**: Automated data feeds from verified APIs
- **Optimistic Oracle**: Community-driven consensus mechanism

Both systems work together to provide comprehensive coverage for all types of prediction markets.

## 🤖 Guided Oracle System

**Automated, reliable data feeds** for sports and cryptocurrency markets.

### How Guided Oracles Work

#### 1. **Data Collection**
- **Scheduled Fetching**: Automated collection every 30 seconds during events
- **Multiple Sources**: Cross-validation using primary and backup APIs
- **Rate Limit Management**: Intelligent throttling to stay within API limits
- **Error Handling**: Retry logic and fallback mechanisms

#### 2. **Data Validation**
- **Format Verification**: Ensures data matches expected schema
- **Logical Consistency**: Checks for impossible outcomes (e.g., negative scores)
- **Cross-Source Validation**: Compares data across multiple providers
- **Temporal Consistency**: Validates data progression over time

#### 3. **On-Chain Submission**
- **Oracle Bot**: Automated service that submits validated outcomes
- **Gas Optimization**: Batches multiple outcomes in single transaction
- **Failure Recovery**: Retry mechanisms for failed submissions
- **Monitoring**: Real-time alerts for oracle failures

### SportMonks Integration

#### 📊 **Data Coverage**
- **Live Scores**: Real-time match progress and scores
- **Match Results**: Final outcomes and statistics  
- **Player Statistics**: Goals, assists, cards, substitutions
- **Match Events**: Timeline of key events during games
- **League Tables**: Current standings and form

#### ⚽ **Supported Leagues**
- **Football**: Premier League, La Liga, Bundesliga, Serie A, Champions League
- **Basketball**: NBA, EuroLeague, NCAA Division I
- **American Football**: NFL, NCAA Football
- **Tennis**: ATP, WTA, Grand Slams
- **Other Sports**: NHL, MLB, Cricket, Rugby

#### 🔍 **Data Points Tracked**
```json
{
  "match_id": "12345",
  "home_team": "Manchester United",
  "away_team": "Liverpool", 
  "score": {
    "home": 2,
    "away": 1
  },
  "status": "FT",
  "events": [
    {
      "minute": 23,
      "type": "goal",
      "player": "Marcus Rashford",
      "team": "home"
    }
  ],
  "final_result": "1", // Home win
  "timestamp": "2024-03-15T17:00:00Z"
}
```

### CoinGecko Integration

#### 💰 **Market Data**
- **Price Feeds**: Real-time and historical cryptocurrency prices
- **Market Cap**: Total market valuation tracking
- **Volume Data**: 24-hour trading volumes across exchanges
- **Listings**: New token listings on major exchanges
- **DeFi Metrics**: Total Value Locked (TVL) tracking

#### 📈 **Price Resolution Logic**
- **Time-Based**: Prices at specific timestamps
- **Threshold-Based**: When prices cross certain levels
- **Percentage-Based**: Price movements exceeding X%
- **Ranking-Based**: Market cap position changes

### Oracle Security Measures

#### 🛡️ **Data Integrity**
- **Cryptographic Signatures**: All data is signed and verifiable
- **Immutable Logging**: All oracle submissions are permanently recorded
- **Multi-Source Validation**: Critical outcomes require confirmation from multiple APIs
- **Manual Override**: Emergency intervention capability for edge cases

#### ⚠️ **Failure Handling**
- **API Downtime**: Automatic failover to backup data sources
- **Invalid Data**: Rejection of malformed or suspicious data
- **Network Issues**: Queue and retry mechanisms for blockchain connectivity
- **Oracle Downtime**: Community can trigger manual resolution after timeout

## 🗳️ Optimistic Oracle System

**Community-driven consensus** for custom and complex prediction markets.

### Optimistic Oracle Mechanism

#### Phase 1: **Proposal** (24 hours)
1. **Anyone can propose** an outcome by staking BITR tokens
2. **Minimum stake**: 100 BITR for standard markets, 1,000 BITR for high-value
3. **Evidence required**: Links to proof sources (news articles, official announcements)
4. **Confidence signal**: Higher stakes indicate higher confidence

#### Phase 2: **Challenge** (24 hours)
1. **Dispute mechanism**: Others can challenge by staking 2x the original amount
2. **Counter-evidence**: Challengers must provide evidence supporting their position
3. **Economic incentives**: Winners receive losers' stakes (minus platform fee)
4. **Multiple challenges**: Additional disputes require exponentially higher stakes

#### Phase 3: **Resolution**
- **No challenges**: Original proposal is accepted automatically
- **Single challenge**: Community vote determines outcome
- **Multiple challenges**: Escalated to governance token holders

### Economic Incentive Structure

#### 💰 **Reward Distribution**
```
Correct Proposer Rewards:
- Original stake returned: 100%
- Challenger stake bonus: 50% 
- Reputation increase: +10 points

Successful Challenger Rewards:
- Original stake returned: 100%
- Proposer stake bonus: 50%
- Reputation increase: +10 points

Community Voter Rewards (if vote required):
- Share of platform fee: 10%
- Reputation increase: +5 points
```

#### 🚫 **Penalty Structure**
```
Incorrect Proposer Penalties:
- Stake forfeited: 100%
- Reputation decrease: -12 points
- Temporary restriction: 24-hour cooldown

Failed Challenger Penalties:
- Stake forfeited: 100%
- Reputation decrease: -15 points
- Temporary restriction: 48-hour cooldown
```

### Market Categories & Requirements

#### 🏛️ **Politics & Governance**
- **Minimum Stake**: 500 BITR
- **Evidence Required**: Official government sources, verified news outlets
- **Challenge Period**: Extended to 48 hours for major elections
- **Special Requirements**: Multiple independent source verification

#### 📈 **Business & Finance**
- **Minimum Stake**: 250 BITR  
- **Evidence Required**: SEC filings, official company announcements
- **Validation**: Financial data cross-referenced with multiple sources
- **Time Limits**: 72-hour maximum resolution time

#### 🌍 **World Events**
- **Minimum Stake**: 200 BITR
- **Evidence Required**: Major news outlets, official statements
- **Consensus Threshold**: 67% agreement for controversial topics
- **Appeal Process**: Escalation to platform governance for disputes

### Oracle Governance

#### 👥 **Community Participation**
- **Voting Power**: Based on BITR holdings and reputation score
- **Quorum Requirements**: Minimum 1% of total BITR supply must participate
- **Decision Threshold**: 60% consensus for standard resolutions
- **Veto Power**: Core team can veto obviously incorrect outcomes (limited to 30 days post-launch)

#### ⚖️ **Dispute Resolution**
- **Evidence Standards**: Clear criteria for acceptable proof sources
- **Appeal Process**: Two-stage appeals for significant disputes
- **Final Arbitration**: Platform governance vote as last resort
- **Emergency Procedures**: Immediate resolution for time-sensitive markets

## 🔧 Technical Implementation

### Oracle Bot Architecture

#### 🤖 **Guided Oracle Bot**
```javascript
class GuidedOracleBot {
  constructor(provider, oracleContract, dataFetcher) {
    this.provider = provider;
    this.oracle = oracleContract;
    this.fetcher = dataFetcher;
  }

  async processOutcomes() {
    const pendingMarkets = await this.getPendingMarkets();
    
    for (const market of pendingMarkets) {
      try {
        const outcome = await this.fetcher.getOutcome(market.id);
        await this.validateOutcome(outcome);
        await this.submitOutcome(market.id, outcome);
      } catch (error) {
        await this.handleError(market.id, error);
      }
    }
  }
}
```

#### 🗳️ **Optimistic Oracle Integration**
```solidity
contract OptimisticOracle {
    struct Proposal {
        address proposer;
        bytes32 outcome;
        uint256 stake;
        uint256 timestamp;
        bool challenged;
        bool resolved;
    }
    
    mapping(bytes32 => Proposal) public proposals;
    mapping(bytes32 => address[]) public challengers;
    
    function proposeOutcome(
        bytes32 marketId, 
        bytes32 outcome,
        string calldata evidence
    ) external {
        require(stake >= minimumStake[marketId], "Insufficient stake");
        // Implementation...
    }
}
```

### Integration with BitredictPool

#### 🔗 **Oracle Interface**
```solidity
interface IOracle {
    function getOutcome(bytes32 marketId) 
        external view returns (bool isSet, bytes memory outcome);
    
    function isReliable(bytes32 marketId) 
        external view returns (bool);
    
    function getConfidence(bytes32 marketId) 
        external view returns (uint256);
}
```

#### ⚡ **Automatic Settlement**
- **Event Listening**: Contracts monitor oracle outcome submissions
- **Validation**: Multiple checks before accepting oracle data
- **Settlement Trigger**: Automatic pool resolution when outcomes are available
- **Fallback Mechanisms**: Manual intervention for oracle failures

---

*Our dual oracle system combines the best of both worlds: automated reliability for standard markets and community wisdom for complex predictions.* 