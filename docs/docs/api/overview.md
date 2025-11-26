---
sidebar_position: 1
---

# API Overview

Bitredict provides a comprehensive **REST API** for accessing prediction market data, analytics, user management, and platform statistics. The API is built on Node.js with Express.js and integrates with PostgreSQL for data persistence and Somnia blockchain for smart contract interactions.

## 🚀 Getting Started

### Base URL
```
Production: https://api.bitredict.io
Testnet: https://api-testnet.bitredict.io
Local Development: http://localhost:3001
```

### Authentication
The API supports both public and authenticated endpoints. For authenticated endpoints, include your wallet signature in the request headers:

```http
Authorization: Bearer <wallet_signature>
```

### Rate Limits
- **Public endpoints**: 100 requests/minute
- **Authenticated endpoints**: 1000 requests/minute
- **Premium users**: 5000 requests/minute
- **Admin endpoints**: 50 requests/minute

## 📊 Core Endpoints

### Health & Monitoring

#### System Health Status
```http
GET /api/health
```

#### Comprehensive Health Check
```http
GET /api/health/comprehensive
```

#### Startup Status
```http
GET /startup-status
```

### Prediction Markets

#### Get All Pools
```http
GET /api/pools?page=1&limit=20&status=active&category=football&sort=createdAt&order=desc
```

#### Get Pool Details
```http
GET /api/pools/{poolId}
```

#### Get Pool Participants
```http
GET /api/pools/{poolId}/participants
```

#### Create Pool
```http
POST /api/pools
Content-Type: application/json

{
  "predictedOutcome": "Manchester City wins",
  "odds": 250,
  "creatorStake": "5000000000000000000000",
  "eventStartTime": 1734567890,
  "eventEndTime": 1734571490,
  "league": "Premier League",
  "category": "football",
  "region": "europe",
  "isPrivate": false,
  "maxBetPerUser": "1000000000000000000000",
  "useBitr": false,
  "oracleType": 0,
  "marketId": "match_12345"
}
```

### Guided Markets

#### Football Markets
```http
GET /api/guided-markets/football
POST /api/guided-markets/football
```

#### Cryptocurrency Markets
```http
GET /api/guided-markets/cryptocurrency
POST /api/guided-markets/cryptocurrency
```

#### Available Pools
```http
GET /api/guided-markets/pools
```

### Oddyssey Contest

#### Get Current Cycle
```http
GET /api/oddyssey/current-cycle
```

#### Get User Slips
```http
GET /api/oddyssey/slips/{userAddress}
```

#### Place Slip
```http
POST /api/oddyssey/place-slip
Content-Type: application/json

{
  "predictions": [
    {
      "matchId": 12345,
      "betType": 0,
      "selection": "0x...",
      "selectedOdd": 1500
    }
  ]
}
```

#### Claim Prize
```http
POST /api/oddyssey/claim-prize/{cycleId}
```

### User Management

#### Get User Profile
```http
GET /api/users/{address}
```

#### Get User Bets
```http
GET /api/users/{address}/bets
```

#### Get User Pools
```http
GET /api/users/{address}/pools
```

### Reputation System

#### Get User Reputation
```http
GET /api/reputation/{address}
```

#### Get Reputation Actions
```http
GET /api/reputation/{address}/actions
```

#### Get User Badges
```http
GET /api/reputation/{address}/badges
```

### Staking & Tokenomics

#### Get Staking Info
```http
GET /api/staking/info
```

#### Stake Tokens
```http
POST /api/staking/stake
```

#### Unstake Tokens
```http
POST /api/staking/unstake
```

#### Get Rewards
```http
GET /api/staking/rewards/{address}
```

### Airdrop

#### Check Eligibility
```http
GET /api/airdrop/eligibility/{address}
```

#### Claim Airdrop
```http
POST /api/airdrop/claim
```

### Faucet

#### Request Test Tokens
```http
POST /api/faucet/request
```

#### Get Faucet Status
```http
GET /api/faucet/status/{address}
```

### Analytics

#### Global Platform Stats
```http
GET /api/analytics/global
```

#### Volume History
```http
GET /api/analytics/volume?period=30d
```

#### Category Statistics
```http
GET /api/analytics/categories
```

#### User Analytics
```http
GET /api/analytics/users/{address}
```

### Fixtures & Matches

#### Get Upcoming Fixtures
```http
GET /api/fixtures/upcoming?league=premier-league&days=7
```

#### Get Match Results
```http
GET /api/fixtures/results?date=2024-01-15
```

#### Get Match Details
```http
GET /api/matches/{matchId}
```

### Crypto Markets

#### Get Crypto Prices
```http
GET /api/crypto/prices?symbols=BTC,ETH,ADA
```

#### Get Market Data
```http
GET /api/crypto/market-data/{symbol}
```

### Social Features

#### Get Trending Pools
```http
GET /api/social/trending
```

#### Get User Activity
```http
GET /api/social/activity/{address}
```

## 🔧 Response Format

All API responses follow a consistent format:

```json
{
  "success": true,
  "data": {
    // Response data
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Error Responses

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid pool parameters",
    "details": {
      "field": "odds",
      "issue": "Odds must be between 100 and 10000"
    }
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## 🛡️ Security

### Rate Limiting
The API implements comprehensive rate limiting to prevent abuse:

- **IP-based limiting**: Prevents spam from single sources
- **User-based limiting**: Tracks authenticated user requests
- **Endpoint-specific limits**: Different limits for different endpoint types

### Input Validation
All endpoints validate input parameters:

- **Type checking**: Ensures correct data types
- **Range validation**: Validates numeric ranges
- **Format validation**: Checks string formats and lengths
- **Business logic validation**: Ensures logical consistency

### Blockchain Integration
Smart contract interactions are secured through:

- **Signature verification**: Validates wallet signatures
- **Nonce management**: Prevents replay attacks
- **Gas estimation**: Optimizes transaction costs
- **Error handling**: Graceful failure recovery

## 📈 Monitoring & Analytics

### Health Monitoring
The API includes comprehensive health monitoring:

- **System metrics**: CPU, memory, disk usage
- **Database performance**: Query times, connection pools
- **Blockchain connectivity**: RPC endpoint status
- **External API status**: SportMonks, CoinGecko integration

### Performance Metrics
- **Response times**: Average and percentile latencies
- **Throughput**: Requests per second
- **Error rates**: Success/failure ratios
- **Resource utilization**: System resource consumption

## 🔄 WebSocket Support

Real-time updates are available via WebSocket connections:

```javascript
const ws = new WebSocket('wss://api.bitredict.io/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Real-time update:', data);
};
```

### Available Events
- `pool.created`: New pool created
- `pool.settled`: Pool outcome resolved
- `oddyssey.cycle_started`: New Oddyssey cycle
- `oddyssey.slip_placed`: User placed slip
- `reputation.updated`: User reputation changed

---

*The Bitredict API is designed for high performance, security, and developer experience. All endpoints are thoroughly documented and tested for production use.*
