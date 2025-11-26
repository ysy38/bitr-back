# 🎯 Bitredict - Decentralized Prediction Markets

**Bitredict** is a next-generation decentralized prediction market platform built on the high-performance Somnia EVM network. We combine guided and open prediction markets with gamified daily contests and a sophisticated reputation system.

## 🏗️ Project Structure

```
bitredict/
├── backend/          # API server, oracle bot, and indexer services
├── solidity/         # Smart contracts and deployment scripts  
├── docs/             # Documentation site (Docusaurus)
├── bot/              # Oracle and automation bots
└── frontend/        # Web3 React application (lives in ../predict-linux)
```

## 🚀 Quick Start

### Backend Services
```bash
cd backend
npm install
npm run dev
```

### Smart Contracts  
```bash
cd solidity
npx hardhat compile
npx hardhat test
```

> **Frontend note:** the Next.js application lives in the sibling repository `../predict-linux`. See that README for UI-specific commands.

### Documentation
```bash
cd docs
npm install
npm start  # Local dev server at localhost:3000
```

## 📚 Documentation

Comprehensive documentation is available at our **Docusaurus site**:

- **Local Development**: Run `cd docs && npm start`
- **Production**: [docs.bitredict.io](https://docs.bitredict.io) *(coming soon)*

### Documentation Covers:
- 🎯 **Platform Overview** - What is Bitredict and why it matters
- 🏗️ **Architecture** - Technical system overview  
- 📊 **Prediction Markets** - Guided vs Open markets
- 🎮 **Oddyssey Game** - Daily parlay contest mechanics
- 💎 **BITR Tokenomics** - Utility token economics
- 🏆 **Reputation System** - Trust-based access control
- 🔧 **Smart Contracts** - Technical contract documentation
- 🔗 **API Reference** - Developer integration guides

## 🧠 System Overview

Bitredict follows a hub-and-spoke architecture:

- **API & Orchestrator (`backend/api`)**: REST layer, WebSocket bridge, health checks, and cron coordination endpoints.
- **Indexers (`backend/services`, `backend/indexer`)**: Stream on-chain data from Somnia via SDS to keep PostgreSQL state in sync.
- **Oracles & Bots (`backend/oracle`, `backend/cron`, `backend/services`)**: Fetch SportMonks fixtures, Coinpaprika prices, settle pools, and publish notifications.
- **Smart Contracts (`solidity/`)**: PoolCore, GuidedOracle, Oddyssey, Reputation, BITR token.
- **Frontend (`../predict-linux`)**: Guides pool creation, interacts with PoolCore, consumes optimized APIs.

## 🔧 Backend Services & Entry Points

| Service | Path | Description | Command |
| --- | --- | --- | --- |
| API Server | `backend/api/server.js` | Express REST API, WebSocket gateway, cron control endpoints | `npm run start` |
| Unified Realtime Indexer | `backend/unified-realtime-indexer.js` | SDS listener that mirrors on-chain pools/bets into PostgreSQL (`oracle` schema) | `npm run indexer` |
| Event-Driven Bet Sync | `backend/services/event-driven-bet-sync.js` | Streams `BetPlaced`/`BetSettled` logs in 900-block chunks, debounces duplicates | `npm run bet-sync:event-driven` |
| Event-Driven Pool Sync | `backend/services/event-driven-pool-sync.js` | Keeps pool metadata, liquidity, and statuses aligned with PoolCore | `npm run pool-sync:event-driven` |
| Event-Driven Slip Sync | `backend/services/event-driven-slip-sync.js` | Tracks Oddyssey slips and combo pools | `npm run slip-sync:event-driven` |
| Guided Market Service | `backend/services/guided-market-service.js` | Prepares guided market calldata, stores fixture mappings, decodes outcomes | used inside API |
| Crypto Oracle Bot | `backend/services/crypto-oracle-bot.js` | Pulls Coinpaprika tickers, writes `oracle.crypto_price_snapshots`, resolves price pools | `npm run crypto:oracle` |
| Coin Scheduler | `backend/cron/crypto-scheduler.js` | Seeds `oracle.crypto_coins`, refreshes metadata, orchestrates price cron | `npm run crypto:scheduler` |
| Fixtures Scheduler | `backend/cron/fixtures-scheduler.js` | Fetches SportMonks fixtures/odds, prunes stale matches | `npm run fixtures-scheduler` |
| Football Oracle Bot | `backend/cron/football-oracle-bot-process.js` | Scores completed fixtures, pushes results to GuidedOracle | `npm run football:oracle` |
| Pool Settlement Service | `backend/cron/pool-settlement-service-process.js` | Auto-settles eligible pools, calls PoolCore `settlePoolAutomatically` | `npm run pool:settlement` |
| Daily Stats Service | `backend/services/daily-stats-service.js` | Aggregates KPIs into analytics tables for dashboards | `npm run daily-stats` |
| Evaluator | `backend/evaluator/index.js` | Runs Oddyssey scoring and posts standings | `npm run evaluator` |
| Oracle Cron Aggregator | `backend/cron/master-consolidated-cron.js` | Launches all cron/bot workers in one process (used in Fly deployment) | `npm run workers` |

## ⏱️ Scheduled Jobs & Automation

| Job | Schedule | Purpose | Notes |
| --- | --- | --- | --- |
| Fixtures Scheduler | every 10 min | Pull SportMonks fixtures, odds, and logos | Requires `SPORTMONKS_API_KEY` |
| Crypto Scheduler | every 5 min | Refresh supported coins & metadata | Works with in-memory cache |
| Crypto Oracle Bot | continual loop (~30s) | Insert price snapshots, flag cached data during outages | Honors `CoinpaprikaService` cache |
| Football Oracle Bot | every min | Resolve completed fixtures, update guided pools | Writes to `oracle.fixture_results` |
| Pool Settlement Service | every 2 min | Auto-settle pools once oracle data arrives | Calls PoolCore contract |
| Daily Stats Cron | daily 00:05 UTC | Snapshot platform KPIs | Writes to analytics schema |
| Master Consolidated Cron | long running | Supervises cron processes, restarts on failure | Used in production |

Use `npm run cron:status` (or `npm run cron:health`) against the API to confirm worker health. All jobs log to `logs/` and read the shared `.env`.

## 🔁 Data Flow Cheatsheet

1. **Chain → Backend**: SDS streams (`@somnia-chain/streams`) feed the event-driven indexers (pool/bet/slip). Events are persisted in PostgreSQL (`oracle.pools`, `oracle.bets`, `oddyssey.slips`), and Redis caches hot data (recent bets, pool progress).
2. **External APIs → Oracles**:
   - SportMonks fixtures & odds populate `oracle.fixtures` and `oracle.fixture_odds`.
   - Coinpaprika tickers populate `oracle.crypto_price_snapshots`; cached responses are flagged to skip settlement.
3. **Backend → Frontend**: Optimized endpoints (`/api/optimized-pools`, `/api/guided-markets`, `/api/oddyssey`, `/api/unified-stats`) supply paginated data plus realtime WebSocket pushes.
4. **Frontend → Chain**: `predict-linux` prepares `createPool` calldata (guided football via `/api/guided-markets/football/prepare`, crypto via direct viem client). After transactions, the frontend hits `/api/pools/notify-creation` to kick the indexer.

## 🔐 Environment & Secrets

Create `backend/.env` (or configure Fly secrets) with:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Neon/PostgreSQL connection string (4 schemas) |
| `REDIS_URL` | Redis instance for caching |
| `SOMNIA_RPC_URL` / `SOMNIA_WS_URL` | Public RPC + SDS WebSocket endpoints |
| `SPORTMONKS_API_KEY` | Fixture and odds ingestion |
| `COINPAPRIKA_API_KEY` (optional) | Higher-rate ticker access |
| `COINGECKO_API_KEY` (optional) | Fallback price feed |
| `FLY_API_TOKEN` | Needed only for `npm run deploy` |
| `NEXT_PUBLIC_API_URL` | Consumed by the frontend (Vercel env) |

Frontend `.env.local` lives in `../predict-linux` and must include `NEXT_PUBLIC_SDS_WS_URL`, `NEXT_PUBLIC_SDS_RPC_URL`, `NEXT_PUBLIC_WS_URL`, and `NEXT_PUBLIC_API_URL`.

## 🚢 Deployment & Ops

- **Backend (Fly.io)**  
  - Deploy: `cd backend && npm run deploy` (uses `fly.toml`).  
  - Logs: `npm run deploy:logs`.  
  - Health: `curl https://bitredict-backend.fly.dev/api/unified-stats/health`.
- **Cron/Bots**: Production runs `npm run workers` (master cron) plus `npm run indexer` as Fly machines. Locally, mimic this with `npm run all-services`.
- **Frontend (Vercel)**: Deploy `predict-linux` with the environment variables above; default dev port is **8080**.
- **Smart Contracts**: Deploy via Hardhat using the Somnia RPC. Addresses live in `backend/contract-addresses.json` and `backend/config.js`.

## 🧪 Local Testing Tips

1. Spin up Postgres + Redis (see `docker-compose.dev.yml`).
2. `cd backend && npm run dev` to serve APIs at `http://localhost:3000`.
3. Run `npm run fixtures-scheduler` and `npm run crypto:scheduler` once to seed fixture + crypto tables.
4. Start realtime ingestion: `npm run indexer`, `npm run bet-sync:event-driven`, `npm run pool-sync:event-driven`.
5. Frontend: `cd ../predict-linux && pnpm install && pnpm dev --port 8080`.
6. Optional: `npm run oracle:services` to launch the oracle bots locally.


## 🎯 Core Features

### 📊 **Dual Prediction Markets**
- **Guided Markets**: Automated outcomes via SportMonks/CoinGecko APIs
- **Open Markets**: Community consensus via optimistic oracle
- **Real-time Settlement**: Instant payouts when events resolve

### 🎮 **Oddyssey Daily Contest**  
- **Daily Parlay Game**: 10 curated sports matches
- **Gamified Scoring**: Multipliers based on slip size
- **Prize Pools**: Daily STT and BITR rewards

### 🏆 **Reputation System**
- **Dynamic Scoring**: 0-700 points based on accuracy
- **Access Levels**: Limited → Elementary → Trusted → Verified
- **Enhanced Privileges**: Better fees and features for higher reputation

### 💎 **BITR Token Utility**
- **Fee Discounts**: Up to 50% off platform fees
- **Staking Rewards**: 30% revenue share for stakers
- **Governance Rights**: Vote on protocol decisions
- **Premium Access**: Exclusive features and analytics

## 🛠️ Technology Stack

- **Blockchain**: Somnia EVM (400,000+ TPS, sub-second finality)
- **Smart Contracts**: Solidity ^0.8.20
- **Backend**: Node.js with Express API
- **Database**: Neon.tech PostgreSQL (4-schema architecture)
- **Oracle Data**: SportMonks API, CoinGecko API
- **Infrastructure**: Fly.io, BunnyCDN
- **Documentation**: Docusaurus with TypeScript

## 🔮 Oracle Architecture

### Guided Oracle
- **Automated data feeds** from SportMonks and CoinGecko
- **Real-time fetching** every 30 seconds during events
- **Cross-validation** across multiple data sources
- **Instant settlement** when outcomes are available

### Optimistic Oracle  
- **Community proposals** with economic bonding
- **Challenge mechanisms** for dispute resolution
- **24-48 hour** resolution timeframes
- **Reputation-weighted** consensus



## 🏛️ Database Architecture  

**4-Schema PostgreSQL Design:**
- **Core**: Users, reputation, achievements
- **Oracle**: Match data, crypto prices, external APIs
- **Prediction**: Pools, bets, liquidity provision  
- **Oddyssey**: Daily games, slips, leaderboards

## 🚀 Getting Started

1. **Explore Documentation**: Visit `/docs` folder or run the dev server
2. **Review Smart Contracts**: Check `/solidity/contracts/`
3. **Run Backend Services**: Start with `/backend/api/server.js`
4. **Test Contracts**: Use Hardhat in `/solidity/`
5. **Join Community**: Discord, Twitter, GitHub discussions

## 📞 Support & Community

- **Documentation**: [/docs](./docs) folder (Docusaurus site)
- **Twitter**: [@bitredict](https://twitter.com/bitredict)

---

*Built with ❤️ on Somnia - The future of prediction markets is here.* 