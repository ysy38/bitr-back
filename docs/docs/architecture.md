---
sidebar_position: 3
---

# System Architecture

Bitredict implements a sophisticated multi-layered architecture that combines blockchain technology, traditional web services, and real-time data integration to create a robust prediction market platform.

## 🏗️ High-Level Architecture

<div style={{
  padding: '1.5rem',
  marginBottom: '2rem',
  borderRadius: '12px',
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.05)'
}}>

### System Components Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   Blockchain    │
│   (Next.js)     │◄──►│   (Node.js)     │◄──►│   (Somnia)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Wallet   │    │   PostgreSQL    │    │   Smart         │
│   Integration   │    │   Database      │    │   Contracts     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Real-time     │    │   External      │    │   Oracle        │
│   Updates       │    │   APIs          │    │   Services      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

</div>

## 🔧 Backend Architecture

### Core Services

#### API Server (`server.js`)
The main Express.js application that orchestrates all platform functionality.

**Key Responsibilities:**
- Request routing and middleware management
- Authentication and authorization
- Rate limiting and security enforcement
- Health monitoring and logging
- Service initialization and coordination

**Technology Stack:**
- **Framework**: Express.js 4.x
- **Runtime**: Node.js 18+
- **Middleware**: CORS, rate limiting, JSON parsing
- **Security**: Helmet, input validation, signature verification

#### Web3 Service (`web3-service.js`)
Manages all blockchain interactions and smart contract communications.

**Core Functions:**
```javascript
class Web3Service {
  // Contract interactions
  async createPool(poolData) { /* ... */ }
  async placeBet(poolId, amount) { /* ... */ }
  async settlePool(poolId, outcome) { /* ... */ }
  
  // Gas estimation and optimization
  async estimateGas(transaction) { /* ... */ }
  async optimizeTransaction(tx) { /* ... */ }
  
  // Event monitoring
  async monitorEvents(contract, eventName) { /* ... */ }
}
```

**Integration Points:**
- **Provider Management**: Somnia RPC endpoint configuration
- **Wallet Integration**: Private key management and transaction signing
- **Contract Deployment**: ABI management and contract instantiation
- **Event Processing**: Real-time blockchain event monitoring

#### Database Service (`prisma-service.js`)
Handles all database operations with comprehensive error handling and connection management.

**Database Schema:**
```sql
-- Core schemas for different system components
CREATE SCHEMA IF NOT EXISTS oracle;      -- Sports and crypto data
CREATE SCHEMA IF NOT EXISTS oddyssey;    -- Daily contest data
CREATE SCHEMA IF NOT EXISTS analytics;   -- Platform analytics
CREATE SCHEMA IF NOT EXISTS system;      -- System configuration
CREATE SCHEMA IF NOT EXISTS core;        -- User and reputation data
CREATE SCHEMA IF NOT EXISTS crypto;      -- Cryptocurrency data
CREATE SCHEMA IF NOT EXISTS airdrop;     -- Airdrop management
```

### Specialized Services

#### SportMonks Integration (`sportmonks.js`)
Manages football/soccer data integration with comprehensive caching and error handling.

**Features:**
- **Real-time Data**: Live match updates and results
- **Fixture Management**: Upcoming matches and scheduling
- **League Coverage**: Multiple leagues and competitions
- **Data Caching**: Redis-based caching for performance
- **Error Recovery**: Automatic retry mechanisms

#### CoinGecko Integration (`coinpaprika.js`)
Handles cryptocurrency market data and price feeds.

**Capabilities:**
- **Price Feeds**: Real-time cryptocurrency prices
- **Market Data**: Volume, market cap, and trading data
- **Historical Data**: Price history and trend analysis
- **Multi-coin Support**: 1000+ cryptocurrency support

#### Oracle Services
**Guided Oracle (`guided-market-service.js`):**
- Automated outcome resolution based on external APIs
- Real-time data validation and verification
- Instant settlement for sports and crypto markets

**Optimistic Oracle (`oddyssey-oracle-bot.js`):**
- Community-driven outcome proposals
- Dispute resolution mechanisms
- Economic incentive alignment

#### Analytics Service (`platform-analytics-service.js`)
Comprehensive analytics and reporting system.

**Metrics Tracked:**
- **User Activity**: Engagement, retention, and behavior
- **Market Performance**: Volume, liquidity, and success rates
- **System Health**: Performance, errors, and resource usage
- **Financial Metrics**: Revenue, fees, and token economics

## 🗄️ Database Architecture

### Schema Organization

#### Core Schema (`core.*`)
**Users Table:**
```sql
CREATE TABLE core.users (
    address VARCHAR(42) PRIMARY KEY,
    reputation INTEGER DEFAULT 40,
    total_volume NUMERIC(78, 18) DEFAULT 0,
    profit_loss NUMERIC(78, 18) DEFAULT 0,
    total_bets INTEGER DEFAULT 0,
    won_bets INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    max_win_streak INTEGER DEFAULT 0,
    max_loss_streak INTEGER DEFAULT 0,
    streak_is_win BOOLEAN DEFAULT true,
    biggest_win NUMERIC(78, 18) DEFAULT 0,
    biggest_loss NUMERIC(78, 18) DEFAULT 0,
    favorite_category VARCHAR(100),
    total_pools_created INTEGER DEFAULT 0,
    pools_won INTEGER DEFAULT 0,
    avg_bet_size NUMERIC(78, 18) DEFAULT 0,
    risk_score INTEGER DEFAULT 500,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Reputation System:**
```sql
CREATE TABLE core.reputation_actions (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    action_type INTEGER NOT NULL,
    reputation_delta INTEGER NOT NULL,
    associated_value VARCHAR(255),
    pool_id VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    block_number BIGINT NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE core.user_badges (
    id BIGSERIAL PRIMARY KEY,
    user_address VARCHAR(255) NOT NULL,
    badge_type VARCHAR(50) NOT NULL,
    badge_category VARCHAR(20) NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    icon_name VARCHAR(50),
    rarity VARCHAR(20),
    criteria_met JSONB,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Oracle Schema (`oracle.*`)
**Sports Data:**
```sql
CREATE TABLE oracle.leagues (
    league_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    country_code VARCHAR(10),
    logo_url TEXT,
    season_id VARCHAR(50)
);

CREATE TABLE oracle.matches (
    match_id VARCHAR(50) PRIMARY KEY,
    league_id VARCHAR(50) NOT NULL,
    home_team_id VARCHAR(50) NOT NULL,
    away_team_id VARCHAR(50) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'scheduled',
    home_score INTEGER,
    away_score INTEGER,
    odds_home NUMERIC(10, 3),
    odds_draw NUMERIC(10, 3),
    odds_away NUMERIC(10, 3),
    odds_over NUMERIC(10, 3),
    odds_under NUMERIC(10, 3),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Oddyssey Schema (`oddyssey.*`)
**Contest Management:**
```sql
CREATE TABLE oddyssey.cycles (
    cycle_id BIGSERIAL PRIMARY KEY,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    prize_pool NUMERIC(78, 18) DEFAULT 0,
    slip_count INTEGER DEFAULT 0,
    evaluated_slips INTEGER DEFAULT 0,
    state INTEGER DEFAULT 0,
    has_winner BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE oddyssey.slips (
    slip_id BIGSERIAL PRIMARY KEY,
    player_address VARCHAR(42) NOT NULL,
    cycle_id BIGINT NOT NULL,
    placed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    predictions JSONB NOT NULL,
    final_score NUMERIC(78, 18) DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    is_evaluated BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Data Flow Architecture

#### Real-time Data Processing
```
External APIs → Data Validation → Database Storage → Event Emission → Frontend Updates
     ↓              ↓                ↓                ↓              ↓
SportMonks    Input Sanitization  PostgreSQL    WebSocket      React State
CoinGecko     Business Logic     Redis Cache    Event Bus      Real-time UI
```

#### Blockchain Integration
```
Smart Contract Events → Indexer Service → Database Updates → API Endpoints → Frontend
        ↓                    ↓                ↓                ↓            ↓
   Event Emission      Event Processing   State Sync      Data Serving   UI Updates
```

## 🔄 System Integration

### API Gateway Pattern
The backend implements a comprehensive API gateway that handles:

**Request Processing:**
- **Authentication**: Wallet signature verification
- **Authorization**: Role-based access control
- **Rate Limiting**: Per-user and per-endpoint limits
- **Validation**: Input sanitization and business logic validation
- **Routing**: Request distribution to appropriate services

**Response Handling:**
- **Data Transformation**: Consistent response formatting
- **Error Handling**: Standardized error responses
- **Caching**: Response caching for performance
- **Logging**: Comprehensive request/response logging

### Event-Driven Architecture
The system uses an event-driven approach for real-time updates:

**Event Types:**
- **Pool Events**: Creation, betting, settlement
- **User Events**: Registration, reputation changes, achievements
- **System Events**: Health status, performance metrics
- **Market Events**: Price updates, match results

**Event Flow:**
```
Smart Contract → Event Indexer → Event Processor → WebSocket → Frontend
     ↓              ↓                ↓              ↓          ↓
  Blockchain    Database        Business Logic   Real-time   UI Updates
```

### Microservices Communication
Services communicate through:

**Synchronous Communication:**
- **HTTP/REST**: Direct service-to-service calls
- **Database**: Shared data access patterns
- **File System**: Configuration and data sharing

**Asynchronous Communication:**
- **Event Bus**: Decoupled service communication
- **Message Queues**: Background task processing
- **WebSockets**: Real-time bidirectional communication

## 🛡️ Security Architecture

### Authentication & Authorization
**Multi-layer Security:**
- **Wallet-based Authentication**: ECDSA signature verification
- **Session Management**: JWT tokens for API access
- **Role-based Access**: Different permission levels
- **Rate Limiting**: Protection against abuse

### Data Protection
**Encryption & Validation:**
- **Input Sanitization**: XSS and injection prevention
- **Data Encryption**: Sensitive data encryption at rest
- **Transport Security**: HTTPS/TLS for all communications
- **Database Security**: Connection encryption and access controls

### Smart Contract Security
**Contract-level Protection:**
- **Reentrancy Guards**: Protection against reentrancy attacks
- **Access Controls**: Role-based function access
- **Input Validation**: Comprehensive parameter validation
- **Gas Optimization**: Efficient contract operations

## 📊 Monitoring & Observability

### Health Monitoring
**Comprehensive Monitoring:**
- **System Metrics**: CPU, memory, disk usage
- **Application Metrics**: Response times, error rates
- **Database Metrics**: Query performance, connection pools
- **Blockchain Metrics**: Gas usage, transaction success rates

### Logging & Tracing
**Observability Stack:**
- **Structured Logging**: JSON-formatted log entries
- **Request Tracing**: End-to-end request tracking
- **Error Tracking**: Comprehensive error monitoring
- **Performance Profiling**: Bottleneck identification

### Alerting System
**Proactive Monitoring:**
- **Threshold Alerts**: Performance degradation detection
- **Anomaly Detection**: Unusual pattern identification
- **Escalation Procedures**: Automated alert routing
- **Incident Response**: Automated recovery procedures

## 🚀 Deployment Architecture

### Infrastructure
**Cloud Deployment:**
- **Container Orchestration**: Docker and Kubernetes
- **Load Balancing**: Distributed traffic management
- **Auto-scaling**: Dynamic resource allocation
- **CDN Integration**: Global content delivery

### Database Deployment
**High Availability:**
- **Primary-Replica Setup**: Read/write separation
- **Connection Pooling**: Efficient database connections
- **Backup Strategy**: Automated backup and recovery
- **Disaster Recovery**: Multi-region failover

### Blockchain Integration
**Network Configuration:**
- **RPC Endpoints**: Multiple provider redundancy
- **Gas Management**: Dynamic gas price optimization
- **Transaction Monitoring**: Real-time transaction tracking
- **Contract Deployment**: Automated deployment pipelines

---

*The Bitredict architecture represents a sophisticated implementation of modern web3 infrastructure, combining traditional web technologies with blockchain innovation to create a robust, scalable, and secure prediction market platform.* 