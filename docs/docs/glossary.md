---
sidebar_position: 12
---

# Glossary

This glossary provides definitions for key terms, concepts, and platform-specific terminology used throughout the Bitredict documentation.

## 🔮 Prediction Market Terms

### **Contrarian Pool**
A unique prediction market structure where creators stake against specific outcomes, believing they are unlikely to occur. Bettors bet for the predicted outcome, creating a market where accuracy is rewarded.

### **Guided Markets**
Automated prediction markets powered by verified external data sources (SportMonks, CoinGecko). These markets offer instant settlement and high reliability through API integration.

### **Open Markets**
Community-driven prediction markets where outcomes are resolved through optimistic oracle consensus. Participants can propose and challenge outcomes with economic incentives.

### **Pool Creator**
A user who creates a prediction pool by staking tokens against a specific outcome. Creators profit when their predicted outcome does not occur.

### **Liquidity Provider (LP)**
A user who adds liquidity to a creator's side by also betting against the predicted outcome. LPs share proportional rewards and losses with the creator.

### **Bettor**
A user who bets for the creator's predicted outcome to occur, believing the creator is wrong. Bettors profit when the predicted outcome actually happens.

## 🎮 Oddyssey Contest Terms

### **Cycle**
A 24-hour period in the Oddyssey contest where exactly 10 matches are selected for prediction. Each cycle has a unique prize pool funded by entry fees.

### **Slip**
A complete set of predictions for all 10 matches in an Oddyssey cycle. Players must predict all matches to participate.

### **Multiplicative Scoring**
A scoring system where odds multiply together for correct predictions, rewarding both accuracy and risk-taking on higher-odds selections.

### **Minimum Qualification**
Players must achieve at least 5 correct predictions to qualify for the daily leaderboard and prize distribution.

### **Prize Rollover**
When no player achieves minimum qualification, the entire prize pool rolls to the next day with a 5% development fee deducted.

## 🏆 Reputation System Terms

### **Reputation Score**
A dynamic score (0-150) that reflects user behavior and performance on the platform. Higher scores unlock enhanced privileges and reduced fees.

### **Reputation Actions**
Specific activities that affect reputation scores, including pool creation, successful bets, outcome proposals, and community contributions.

### **Badges**
Achievement-based rewards that recognize user accomplishments across different categories (creator, bettor, community, oddyssey, special).

### **Badge Rarity**
Classification system for badges: Common, Rare, Epic, and Legendary, indicating the difficulty of achievement.

### **Tier Progression**
System of access levels based on reputation scores, providing enhanced features and reduced fees for higher-tier users.

## 💎 Token Economics Terms

### **STT Token**
The primary platform token used for betting, pool creation, and fee payments. STT represents the native currency of the Bitredict ecosystem.

### **BITR Token**
The governance and staking token that provides holders with voting rights, staking rewards, and fee discounts.

### **Staking Tiers**
Three-tier staking system offering 6-22% APY based on stake amount and duration. Higher tiers provide additional benefits.

### **Fee Discounts**
Reductions in platform fees based on BITR token holdings, with discounts up to 50% for large holders.

### **Airdrop**
Distribution of tokens to eligible users based on platform participation, reputation, and other qualifying criteria.

## 🔗 Blockchain & Smart Contract Terms

### **Somnia Network**
The blockchain network where Bitredict smart contracts are deployed, offering high throughput and low transaction costs.

### **BitredictPool Contract**
The main smart contract that handles pool creation, betting, liquidity provision, and settlement for prediction markets.

### **Oddyssey Contract**
Smart contract managing the daily parlay contest, including slip submission, scoring, and prize distribution.

### **Guided Oracle**
Smart contract that automatically resolves guided market outcomes based on external API data.

### **Optimistic Oracle**
Smart contract that manages community-driven outcome resolution through proposal and challenge mechanisms.

### **Reentrancy Protection**
Security measure that prevents malicious contracts from calling back into functions before the first call completes.

### **Gas Optimization**
Techniques to minimize transaction costs on the blockchain through efficient code structure and storage patterns.

## 📊 Database & API Terms

### **Schema**
Logical organization of database tables into functional groups (core, oracle, oddyssey, analytics, crypto, airdrop, system).

### **PostgreSQL**
The primary database system used for storing platform data, user information, and analytics.

### **REST API**
Representational State Transfer API that provides programmatic access to platform data and functionality.

### **WebSocket**
Real-time communication protocol for live updates and notifications to frontend applications.

### **Rate Limiting**
Protection mechanism that limits the number of API requests per user to prevent abuse and ensure fair usage.

## 🔮 Oracle & Data Terms

### **SportMonks API**
External data provider for sports information, including match schedules, results, and odds for football and other sports.

### **CoinGecko API**
External data provider for cryptocurrency prices, market data, and trading information.

### **Outcome Resolution**
The process of determining the final result of a prediction market, either through automated API data or community consensus.

### **Dispute Resolution**
Mechanism for challenging proposed outcomes in open markets through economic incentives and community voting.

### **Data Validation**
Process of verifying the accuracy and integrity of external data before using it for market settlement.

## 🛡️ Security & Privacy Terms

### **ECDSA Signature**
Elliptic Curve Digital Signature Algorithm used for wallet-based authentication and transaction verification.

### **Input Sanitization**
Process of cleaning and validating user input to prevent injection attacks and ensure data integrity.

### **Access Control**
System of permissions and restrictions that determine what actions users can perform based on their role and reputation.

### **Audit Trail**
Comprehensive logging of all system activities for security monitoring and compliance purposes.

## 📈 Analytics & Performance Terms

### **Platform Metrics**
Aggregated statistics including user activity, volume, success rates, and system performance indicators.

### **User Analytics**
Individual user behavior tracking including betting patterns, performance metrics, and engagement statistics.

### **Performance Monitoring**
Real-time tracking of system health, response times, and resource utilization to ensure optimal operation.

### **Data Retention**
Policies governing how long different types of data are stored before archival or deletion.

## 🎯 Market Types & Categories

### **Football Markets**
Prediction markets based on football/soccer matches, including match outcomes, over/under goals, and other betting options.

### **Cryptocurrency Markets**
Prediction markets based on crypto price movements, market cap rankings, and blockchain-related events.

### **Moneyline (1X2)**
Betting market where players predict home win (1), draw (X), or away win (2) for a match.

### **Over/Under**
Betting market where players predict whether the total score will be above or below a specified threshold.

### **Both Teams to Score**
Betting market where players predict whether both teams will score at least one goal during the match.

## 🔧 Technical Implementation Terms

### **Event Indexing**
Process of monitoring blockchain events and updating the database with real-time information.

### **Gas Estimation**
Calculation of transaction costs before execution to optimize user experience and prevent failed transactions.

### **Batch Operations**
Grouping multiple operations into single transactions to reduce gas costs and improve efficiency.

### **Caching**
Storing frequently accessed data in memory to improve response times and reduce database load.

### **Load Balancing**
Distributing incoming requests across multiple servers to ensure optimal performance and availability.

## 🌐 Frontend & User Experience Terms

### **Progressive Web App (PWA)**
Web application that provides native app-like experience with offline capabilities and mobile optimization.

### **Wallet Integration**
Connection between the frontend application and user cryptocurrency wallets for transaction signing and authentication.

### **Real-time Updates**
Live data synchronization between backend services and frontend interface for immediate user feedback.

### **Responsive Design**
User interface that adapts to different screen sizes and devices for optimal viewing experience.

---

*This glossary provides a comprehensive reference for understanding the technical terminology and platform-specific concepts used throughout the Bitredict ecosystem.*
