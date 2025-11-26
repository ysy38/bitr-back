# Bitredict Backend Deployment Guide

This document captures everything a new dev needs to deploy the backend to Fly.io (or run it locally) without chasing tribal knowledge.

---

## ✅ App Configuration Quick Facts

- **App Name (Fly):** `bitredict-backend`
- **Runtime Root:** `/home/leon/bitredict-linux/backend`
- **Config File:** `backend/fly.toml`
- **Primary Entrypoint:** `api/server.js`
- **Node Version:** Defined in `package.json` / Fly builder image

---

## 🧰 Prerequisites

1. **Fly CLI** installed and authenticated (`fly auth login`).
2. **Node.js 18+ / npm** for running the build scripts locally.
3. **Docker** *(optional)* if you prefer container builds.
4. Access to the required secrets (DB URL, RPC keys, API tokens).

---

## 🔐 Environment Variables

All backend processes read configuration from `backend/.env`. In production, mirror these values into Fly secrets (`fly secrets set KEY=VALUE`).  
The table below summarizes what each variable controls.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `production`/`development` toggles logging + SSL |
| `PORT`, `HOST` | Express bind address |
| `DATABASE_URL` / `DB_*` | Neon/Postgres connection details |
| `ENABLE_DB_KEEPALIVE` | Keeps connections alive on serverless PG |
| `REDIS_URL` | Redis/Upstash cache |
| `RPC_URL`, `SOMNIA_RPC_URL`, `SOMNIA_WS_URL`, `FALLBACK_RPC_URL` | Somnia RPC + SDS endpoints |
| `CHAIN_ID` | Somnia chain ID (50312 on testnet) |
| `PRIVATE_KEY`, `ORACLE_PRIVATE_KEY`, `ORACLE_SIGNER_PRIVATE_KEY` | Pool creation + oracle signers |
| Contract addresses (`POOL_CORE_ADDRESS`, `GUIDED_ORACLE_ADDRESS`, etc.) | Override defaults if contracts redeployed |
| `ADMIN_KEY` | X-Admin-Key header for protected endpoints |
| `CORS_ORIGIN` | Comma-separated list of frontend origins |
| `SPORTMONKS_*` | Fixture + odds ingestion |
| `COINPAPRIKA_*`, `COINGECKO_API_KEY` | Crypto price feeds |
| `SPORTS_API_KEY`, `CRYPTO_API_KEY`, `WEATHER_API_KEY` | Ancillary oracle integrations |
| `BLOCKCHAIN_RPC_URL` | Optional override for oracle bots |
| `ORACLE_PORT`, `ORACLE_UPDATE_INTERVAL` | Guided oracle HTTP service config |
| `START_BLOCK`, `BATCH_SIZE`, `POLL_INTERVAL`, `CONFIRMATION_BLOCKS`, `MAX_RETRIES`, `RETRY_DELAY` | Event-driven sync tuning |
| `FEE_COLLECTOR`, `ORACLE_SIGNERS` | Contract metadata |
| `LOG_LEVEL`, `LOG_FILE` | Winson logger configuration |

### 📁 Sample `backend/.env`

> Replace mock values with real secrets before running `npm run dev` or `fly deploy`.

```env
# Runtime
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database / Cache
DATABASE_URL=postgres://bitredict:super-secret@db.bitredict.local:5432/bitredict
DB_HOST=db.bitredict.local
DB_PORT=5432
DB_NAME=bitredict
DB_USER=bitredict
DB_PASSWORD=change-me
ENABLE_DB_KEEPALIVE=true
REDIS_URL=rediss://:redis-secret@redis.bitredict.local:6380

# Somnia / RPC
RPC_URL=https://dream-rpc.somnia.network
SOMNIA_RPC_URL=https://dream-rpc.somnia.network
SOMNIA_WS_URL=wss://dream-rpc.somnia.network/ws
FALLBACK_RPC_URL=https://rpc.ankr.com/somnia_testnet/mock
CHAIN_ID=50312
PRIVATE_KEY=0xcreator_private_key_goes_here
ORACLE_PRIVATE_KEY=0xoracle_private_key_goes_here
ORACLE_SIGNER_PRIVATE_KEY=0xoracle_settlement_key_goes_here
BLOCKCHAIN_RPC_URL=https://dream-rpc.somnia.network

# Contracts
POOL_CORE_ADDRESS=0xPoolCoreAddressHere
GUIDED_ORACLE_ADDRESS=0xGuidedOracleAddressHere
BOOST_SYSTEM_ADDRESS=0xBoostSystemAddressHere
COMBO_POOLS_ADDRESS=0xComboPoolsAddressHere
POOL_FACTORY_ADDRESS=0xPoolFactoryAddressHere
OPTIMISTIC_ORACLE_ADDRESS=0xOptimisticOracleAddressHere
REPUTATION_SYSTEM_ADDRESS=0xReputationSystemAddressHere
BITR_TOKEN_ADDRESS=0xBitrTokenAddressHere
STAKING_ADDRESS=0xStakingContractAddressHere
FAUCET_ADDRESS=0xFaucetAddressHere
ODDYSSEY_ADDRESS=0xOddysseyAddressHere
FEE_COLLECTOR=0xFeeCollectorAddressHere
ORACLE_SIGNERS=0xSigner1,0xSigner2

# Access Control
ADMIN_KEY=super-secure-admin-key
CORS_ORIGIN=https://bitredict.xyz,https://www.bitredict.xyz,https://bitredict.vercel.app

# SportMonks
SPORTMONKS_API_TOKEN=sm_live_token
SPORTMONKS_BASE_URL=https://api.sportmonks.com/v3/football
SPORTMONKS_RATE_LIMIT_DELAY=100
SPORTMONKS_TIMEOUT=30000
SPORTMONKS_RETRY_ATTEMPTS=3

# Crypto Pricing
COINPAPRIKA_API_TOKEN=coinpaprika-token
COINPAPRIKA_BASE_URL=https://api.coinpaprika.com/v1
COINPAPRIKA_RATE_LIMIT_DELAY=1000
COINPAPRIKA_TIMEOUT=30000
COINPAPRIKA_RETRY_ATTEMPTS=3
COINGECKO_API_KEY=coingecko-token

# Other Oracles
SPORTS_API_KEY=rapidapi-sports-key
CRYPTO_API_KEY=crypto-feed-key
WEATHER_API_KEY=openweather-key

# Oracle Services
ORACLE_PORT=3001
ORACLE_UPDATE_INTERVAL=60000
START_BLOCK=164312555
BATCH_SIZE=50
POLL_INTERVAL=30000
CONFIRMATION_BLOCKS=6
MAX_RETRIES=5
RETRY_DELAY=2000

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

---

## 🚀 Deployment Workflow

1. **Install deps locally**
```bash
cd backend
   npm install
```
2. **Ensure `.env` is populated** (or export secrets).
3. **Login to Fly**
```bash
   fly auth login
```
4. **Set/Sync secrets (one-time per app)**
```bash
   cd backend
   fly secrets set $(cat .env | xargs)  # or push individually
   ```
5. **Deploy**
   - Direct CLI: `fly deploy --app bitredict-backend`
   - NPM script: `npm run deploy`
   - Wrapper: `./deploy-bitredict.sh`

> **Tip:** Use `fly scale vm shared-cpu-1x --memory 1024` (or higher) if streams/indexers need more RAM.

---

## 📊 Post-Deployment Verification

| Action | Command |
| --- | --- |
| Check status | `fly status --app bitredict-backend` or `npm run deploy:status` |
| Tail logs | `fly logs --app bitredict-backend` or `npm run deploy:logs` |
| Open app | `fly open --app bitredict-backend` |
| Health | `curl https://bitredict-backend.fly.dev/api/unified-stats/health` |
| Cron status | `curl https://bitredict-backend.fly.dev/api/cron/status` |

Smoke test critical APIs after each deploy:
```bash
curl https://bitredict-backend.fly.dev/api/optimized-pools/recent-bets | jq
curl https://bitredict-backend.fly.dev/api/guided-markets/stats | jq
```

---

## 🧯 Troubleshooting

- **Streams stalled:** Restart indexers (`fly apps restart bitredict-backend`) or relaunch `npm run bet-sync:event-driven`.
- **CORS errors:** Confirm `CORS_ORIGIN` includes every live domain (bitredict.xyz, www, vercel preview).
- **SDS URL errors:** Ensure `SOMNIA_WS_URL` ends with `/ws`.
- **Fixture gaps:** Run `npm run fixtures-scheduler` locally to repopulate, or check SportMonks quota.
- **Price outages:** Coinpaprika cache prevents empty inserts—verify `crypto-oracle-bot` logs for `isCached` messages.

When in doubt, redeploy with `fly deploy --strategy rolling` to avoid downtime, and always keep `.env` + Fly secrets in sync.

---

Happy shipping! Let the next developer know to keep this file updated whenever new services or env vars are introduced. 🚀
