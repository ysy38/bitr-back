# Bitredict Backend Infrastructure

This backend infrastructure provides indexing, API services, and oracle functionality for the Bitredict prediction market platform.

## Architecture Overview

```
backend/
├── api/           # REST API server
├── indexer/       # Blockchain event indexer
├── oracle/        # Oracle service for outcome resolution
├── db/           # Database schema and setup
├── config.js     # Configuration management
└── README.md     # This file
```

## Components

### 1. API Server (`api/server.js`)
- REST API endpoints for pools, bets, users, and analytics
- CORS and rate limiting configured
- Provides data for frontend applications
- Runs on port 3000 (configurable)

### 2. Indexer Service (`indexer.js`)
- Monitors blockchain for contract events
- Indexes pool creation, bets, settlements, and oracle submissions
- Stores data in database for fast querying
- Handles blockchain reorganizations with confirmation blocks

### 3. Oracle Service (`oracle/server.js`)
- Provides external data for outcome resolution
- Supports sports, crypto, and weather data sources
- Automatically submits outcomes for registered markets
- Runs on port 3001 (configurable)

### 4. Database Layer (`db/`)
- PostgreSQL schema for storing indexed data
- Optimized for read-heavy workloads
- Includes triggers for automatic stat updates
- Views for common queries

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

Key configuration:
- `PRIVATE_KEY`: Ethereum private key for blockchain interactions
- `ORACLE_SIGNER_PRIVATE_KEY`: Private key for oracle outcome submissions
- `RPC_URL`: Blockchain RPC endpoint
- Database connection details
- External API keys for oracle data sources

### 3. Set up Database
Install PostgreSQL and create a database:
```bash
createdb bitredict
```

Run the database setup (implement with your preferred PostgreSQL client):
```bash
node db/setup.js
```

### 4. Deploy Contracts
First, deploy your smart contracts:
```bash
npm run compile
npm run deploy:somnia
```

Update your `.env` file with the deployed contract addresses.

### 5. Start Services

Start all services:
```bash
# API Server
npm run backend:start

# Indexer (in another terminal)
npm run indexer:start

# Oracle Service (in another terminal)
npm run oracle:start
```

For development with auto-reload:
```bash
npm run backend:dev
```

## API Endpoints

### Pool Endpoints
- `GET /api/pools` - List pools with pagination and filtering
- `GET /api/pools/:poolId` - Get specific pool details
- `GET /api/pools/:poolId/bets` - Get bets for a specific pool
- `GET /api/pools/:poolId/stats` - Get pool statistics

### User Endpoints
- `GET /api/users/:address` - Get user profile
- `GET /api/users/:address/bets` - Get user's betting history
- `GET /api/users/:address/pools` - Get pools created by user

### Analytics Endpoints
- `GET /api/analytics/overview` - Platform-wide statistics
- `GET /api/analytics/categories` - Statistics by category
- `GET /api/analytics/volume` - Volume statistics over time

### Oracle Endpoints
- `GET /api/oracles/status` - Oracle service status
- `POST /api/submit-outcome` - Submit outcome for a market
- `POST /api/register-market` - Register new market for oracle resolution

## Oracle Data Sources

The oracle service supports multiple data sources:

### Sports Data
- Game schedules and results
- Real-time scores
- Team statistics

### Crypto Data
- Real-time prices
- Historical data
- Market cap information

### Weather Data
- Current conditions
- Forecasts
- Historical weather data

## Configuration

### Environment Variables

#### Blockchain
- `RPC_URL`: Blockchain RPC endpoint
- `CHAIN_ID`: Network chain ID
- `PRIVATE_KEY`: Private key for blockchain interactions

#### Database
- `DB_HOST`: Database host
- `DB_PORT`: Database port
- `DB_NAME`: Database name
- `DB_USER`: Database username
- `DB_PASSWORD`: Database password

#### API
- `API_PORT`: API server port (default: 3000)
- `CORS_ORIGIN`: CORS allowed origins

#### Oracle
- `ORACLE_PORT`: Oracle service port (default: 3001)
- `ORACLE_SIGNER_PRIVATE_KEY`: Private key for oracle signing
- `ORACLE_UPDATE_INTERVAL`: Update interval in milliseconds

#### External APIs
- `SPORTS_API_KEY`: Sports data API key
- `CRYPTO_API_KEY`: Crypto data API key
- `WEATHER_API_KEY`: Weather data API key

### Indexer Configuration
- `START_BLOCK`: Starting block for indexing ('latest' or block number)
- `BATCH_SIZE`: Number of blocks to process per batch
- `POLL_INTERVAL`: Polling interval in milliseconds
- `CONFIRMATION_BLOCKS`: Number of confirmation blocks to wait

## Database Schema

### Core Tables
- `users`: User profiles and statistics
- `pools`: Pool information and metadata
- `bets`: Individual bet records
- `liquidity_providers`: Liquidity provision records
- `oracle_markets`: Oracle market registrations
- `outcome_submissions`: Oracle outcome submissions

### Analytics Tables
- `daily_stats`: Daily platform statistics
- `category_stats`: Statistics by pool category
- `event_logs`: Blockchain event audit trail

### Views
- `active_pools`: Currently active pools
- `pool_summary`: Pool data with calculated statistics

## Monitoring and Logging

### Health Checks
- API: `GET /health`
- Oracle: `GET /health`

### Logging
- Configurable log levels
- File-based logging
- Console output for development

### Error Handling
- Graceful error handling with retries
- Blockchain reorganization handling
- Database connection recovery

## Production Deployment

### Docker Support
Consider containerizing services:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["node", "api/server.js"]
```

### Load Balancing
- Use a reverse proxy (nginx) for load balancing
- Scale API servers horizontally
- Single indexer instance to avoid duplicates

### Database Optimization
- Regular VACUUM and ANALYZE operations
- Index monitoring and optimization
- Connection pooling for high load

### Security
- Use environment variables for sensitive data
- Implement API rate limiting
- Regular security updates
- Database access controls

## Development

### Testing
```bash
# Run smart contract tests
npm test

# API testing (implement with your preferred testing framework)
npm run test:api
```

### Code Style
- Use ESLint for code linting
- Follow Node.js best practices
- Implement proper error handling

### Contributing
1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Submit a pull request

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Check database is running
   - Verify connection credentials
   - Ensure database exists

2. **Blockchain Connection Errors**
   - Verify RPC URL is correct
   - Check network connectivity
   - Ensure private keys are valid

3. **Indexer Missing Events**
   - Check starting block configuration
   - Verify contract addresses are correct
   - Monitor for blockchain reorganizations

4. **Oracle Submission Failures**
   - Verify oracle signer is authorized
   - Check gas price and limits
   - Ensure market is registered

### Logs
Check service logs for detailed error information:
```bash
tail -f logs/app.log
```

## Support

For support and questions:
- Check the logs for error details
- Verify configuration settings
- Test with smaller datasets first
- Monitor blockchain and database health 