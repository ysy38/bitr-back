---
sidebar_position: 1
---

# Welcome to Bitredict

<div style={{
  padding: '2rem',
  marginBottom: '2rem',
  borderRadius: '16px',
  background: 'radial-gradient(circle at top left, rgba(12, 12, 35, 0.8), rgba(0, 0, 21, 0.8))',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  textAlign: 'center'
}}>

## Decentralized Prediction Markets on Somnia

Bitredict represents a sophisticated implementation of decentralized prediction markets, leveraging blockchain technology to create transparent, permissionless trading environments for real-world outcomes. Our platform combines automated data integration with community-driven consensus mechanisms to deliver a comprehensive prediction market ecosystem.

<div style={{ marginTop: '2rem' }}>
  <a href="/prediction-markets" style={{
    display: 'inline-block',
    padding: '0.75rem 1.5rem',
    marginRight: '1rem',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #22C7FF 0%, #007BFF 100%)',
    color: 'white',
    textDecoration: 'none',
    fontWeight: 500,
  }}>Learn More</a>
  <a href="/examples" style={{
    display: 'inline-block',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #FF0080 0%, #8C00FF 100%)',
    color: 'white',
    textDecoration: 'none',
    fontWeight: 500,
  }}>View Examples</a>
</div>
</div>

## 🎯 Core Architecture

<div className="row" style={{ marginBottom: '2rem' }}>
  <div className="col col--4">
    <div style={{
      padding: '1.5rem',
      height: '100%',
      borderRadius: '12px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.05)'
    }}>
      <h3>🔗 Smart Contract Infrastructure</h3>
      <p>Deployed on Somnia mainnet with comprehensive security measures, reentrancy protection, and gas-optimized operations.</p>
    </div>
  </div>
  <div className="col col--4">
    <div style={{
      padding: '1.5rem',
      height: '100%',
      borderRadius: '12px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.05)'
    }}>
      <h3>📊 Dual Oracle System</h3>
      <p>Guided markets with automated API integration and open markets with optimistic oracle consensus for maximum flexibility.</p>
    </div>
  </div>
  <div className="col col--4">
    <div style={{
      padding: '1.5rem',
      height: '100%',
      borderRadius: '12px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.05)'
    }}>
      <h3>🎮 Gamified Experience</h3>
      <p>Oddyssey daily contests with multiplicative scoring and comprehensive reputation systems with dynamic tier progression.</p>
    </div>
  </div>
</div>

## 🌟 Platform Features

<div className="row">
  <div className="col col--6" style={{ marginBottom: '1rem' }}>
    <div style={{
      padding: '1.5rem',
      height: '100%',
      borderRadius: '12px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.05)'
    }}>
      <h3>🔮 Prediction Markets</h3>
      <ul>
        <li>Guided Markets: SportMonks & CoinGecko API integration</li>
        <li>Open Markets: Community-driven outcome resolution</li>
        <li>Contrarian pool structure with creator liquidity provision</li>
        <li>Real-time settlement and instant payout mechanisms</li>
      </ul>
    </div>
  </div>
  <div className="col col--6" style={{ marginBottom: '1rem' }}>
    <div style={{
      padding: '1.5rem',
      height: '100%',
      borderRadius: '12px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.05)'
    }}>
      <h3>🎮 Oddyssey Contest</h3>
      <ul>
        <li>Daily 10-match parlay competitions</li>
        <li>Multiplicative odds-based scoring system</li>
        <li>Minimum 5 correct predictions for qualification</li>
        <li>Rollover prize pools with 5% development fee</li>
      </ul>
    </div>
  </div>
</div>

<div className="row">
  <div className="col col--6" style={{ marginBottom: '1rem' }}>
    <div style={{
      padding: '1.5rem',
      height: '100%',
      borderRadius: '12px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.05)'
    }}>
      <h3>🏆 Reputation System</h3>
      <ul>
        <li>Dynamic scoring (0-150 points) with tier progression</li>
        <li>Badge system with rarity classifications</li>
        <li>Enhanced privileges and reduced fees</li>
        <li>Comprehensive achievement tracking</li>
      </ul>
    </div>
  </div>
  <div className="col col--6" style={{ marginBottom: '1rem' }}>
    <div style={{
      padding: '1.5rem',
      height: '100%',
      borderRadius: '12px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.05)'
    }}>
      <h3>💎 Token Economics</h3>
      <ul>
        <li>Three-tier staking system (6-22% APY)</li>
        <li>Fee discounts up to 50% with BITR holdings</li>
        <li>Governance rights and platform participation</li>
        <li>Airdrop eligibility and distribution mechanisms</li>
      </ul>
    </div>
  </div>
</div>

## 🎲 Market Mechanics

<div style={{
  padding: '1.5rem',
  marginBottom: '2rem',
  borderRadius: '12px',
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.05)'
}}>

### Contrarian Pool Structure

The Bitredict platform employs a unique contrarian pool architecture where market creators stake against specific outcomes, creating opportunities for bettors to capitalize on perceived mispricings.

```typescript
// Example: Football Match Pool Creation
const pool = await bitredictPool.createPool({
  predictedOutcome: "Manchester City wins",
  odds: 250, // 2.5x odds
  creatorStake: ethers.parseEther("500"), // 500 STT
  eventStartTime: 1734567890,
  eventEndTime: 1734571490,
  league: "Premier League",
  category: "football",
  region: "europe",
  isPrivate: false,
  maxBetPerUser: ethers.parseEther("100"),
  useBitr: false,
  oracleType: 0, // GUIDED
  marketId: "match_12345"
});
```

### Liquidity Provision Mechanics

Liquidity providers can join creator positions, sharing proportional rewards and losses based on their contribution to the pool's total liquidity against the predicted outcome.

</div>

## 🚀 Getting Started

<div className="row">
  <div className="col col--4" style={{ marginBottom: '1rem' }}>
    <div style={{
      padding: '1.5rem',
      height: '100%',
      borderRadius: '12px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.05)'
    }}>
      <h3>📈 For Market Creators</h3>
      <ol>
        <li>Identify mispriced outcomes in sports or crypto markets</li>
        <li>Create pools with appropriate stake and odds</li>
        <li>Attract liquidity providers to join your position</li>
        <li>Profit from accurate contrarian predictions</li>
      </ol>
    </div>
  </div>
  <div className="col col--4" style={{ marginBottom: '1rem' }}>
    <div style={{
      padding: '1.5rem',
      height: '100%',
      borderRadius: '12px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.05)'
    }}>
      <h3>🎯 For Bettors</h3>
      <ol>
        <li>Analyze active pools for value opportunities</li>
        <li>Place bets against creator predictions</li>
        <li>Monitor real-time market developments</li>
        <li>Claim winnings upon outcome resolution</li>
      </ol>
    </div>
  </div>
  <div className="col col--4" style={{ marginBottom: '1rem' }}>
    <div style={{
      padding: '1.5rem',
      height: '100%',
      borderRadius: '12px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.05)'
    }}>
      <h3>💰 For Liquidity Providers</h3>
      <ol>
        <li>Evaluate creator track records and analysis</li>
        <li>Provide liquidity to promising contrarian positions</li>
        <li>Diversify across multiple pools and creators</li>
        <li>Earn proportional returns on successful predictions</li>
      </ol>
    </div>
  </div>
</div>

<div style={{
  padding: '2rem',
  marginTop: '3rem',
  borderRadius: '16px',
  background: 'linear-gradient(135deg, rgba(34, 199, 255, 0.1) 0%, rgba(255, 0, 128, 0.1) 100%)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  textAlign: 'center'
}}>

## Ready to Participate in Decentralized Prediction Markets?

Join our community of market makers, bettors, and liquidity providers in reshaping the future of prediction markets through transparent, blockchain-powered infrastructure.

<div style={{ marginTop: '1.5rem' }}>
  <a href="https://app.bitredict.io" style={{
    display: 'inline-block',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #22C7FF 0%, #FF0080 100%)',
    color: 'white',
    textDecoration: 'none',
    fontWeight: 500,
  }}>Launch Application</a>
</div>
</div> 