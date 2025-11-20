# BitredictPoolCore Contract Update - Market Types

## Summary
Updated the `MarketType` enum to support multiple sports and market types in a scalable way.

## Contract Changes

### Old MarketType Enum
```solidity
enum MarketType {
    OVER_UNDER,  // 0
    CUSTOM       // 1
}
```

### New MarketType Enum
```solidity
enum MarketType {
    MONEYLINE,        // 0 - Winner/Outcome (works for all sports: 1X2, Win/Lose, Above/Below)
    OVER_UNDER,       // 1 - Total points/goals/runs (works for all sports)
    SPREAD,           // 2 - Point spread (basketball, american football, etc.)
    PROPOSITION,      // 3 - Prop bets (first scorer, specific events, etc.)
    CORRECT_SCORE,    // 4 - Exact score/result (football, basketball, etc.)
    CUSTOM            // 5 - Arbitrary YES/NO predictions
}
```

## Key Changes

1. **MONEYLINE (0)**: New position, replaces old OVER_UNDER position
   - Works for: Football (1X2), Basketball (Win/Lose), Crypto (Above/Below)
   - Most common market type across all sports

2. **OVER_UNDER (1)**: Moved from position 0 to position 1
   - Works for: Football (goals), Basketball (points), Baseball (runs), Crypto (price ranges)
   - Universal market type for "total" predictions

3. **SPREAD (2)**: New market type
   - Works for: Basketball, American Football, etc.
   - Example: "Home -5.5" or "Away +3.5"

4. **PROPOSITION (3)**: New market type
   - Works for: All sports and categories
   - Example: "First goal scorer", "Total cards", "New ATH", etc.

5. **CORRECT_SCORE (4)**: New market type
   - Works for: Football, Basketball, etc.
   - Example: "2-1", "105-98", etc.

6. **CUSTOM (5)**: Moved from position 1 to position 5
   - Works for: Any arbitrary YES/NO prediction
   - Maintained for backward compatibility

## Validation Rules

### Existing Validation (Maintained)
```solidity
if (_oracleType == OracleType.GUIDED) {
    require(_marketType != MarketType.CUSTOM);
}
```

**Meaning**: 
- GUIDED oracle can use market types 0-4 (MONEYLINE through CORRECT_SCORE)
- CUSTOM (5) market type is only allowed with OPEN oracle
- This ensures data-driven markets use structured outcomes

## Sport-Specific Market Type Usage

### Football ⚽
- **MONEYLINE (0)**: 1X2 - Home Win, Draw, Away Win
- **OVER_UNDER (1)**: Total goals - Over/Under 2.5, 1.5, etc.
- **PROPOSITION (3)**: BTTS, First Goal Scorer, etc.
- **CORRECT_SCORE (4)**: Exact score predictions
- **CUSTOM (5)**: Any custom football prediction

### Basketball 🏀
- **MONEYLINE (0)**: Win/Lose
- **OVER_UNDER (1)**: Total points - Over/Under 220.5, etc.
- **SPREAD (2)**: Point spread - Home -5.5, Away +5.5
- **PROPOSITION (3)**: First basket, total rebounds, etc.
- **CORRECT_SCORE (4)**: Exact score predictions
- **CUSTOM (5)**: Any custom basketball prediction

### Baseball ⚾
- **MONEYLINE (0)**: Win/Lose
- **OVER_UNDER (1)**: Total runs - Over/Under 8.5, etc.
- **SPREAD (2)**: Run line - Home -1.5, Away +1.5
- **PROPOSITION (3)**: First inning score, total hits, etc.
- **CUSTOM (5)**: Any custom baseball prediction

### Cryptocurrency ₿
- **MONEYLINE (0)**: Price direction - Above/Below target
- **OVER_UNDER (1)**: Price range - Above/Below threshold
- **PROPOSITION (3)**: Market events - New ATH, Crash, etc.
- **CUSTOM (5)**: Any custom crypto prediction

## Impact on Existing Data

### Database
- All existing pools use `market_type = 0`
- Under old enum: 0 = OVER_UNDER
- Under new enum: 0 = MONEYLINE
- **Impact**: Need to review if existing pools were actually MONEYLINE or OVER_UNDER

### Mitigation
Since we only have 5 test pools, we can:
1. Query existing pools to check their `predicted_outcome`
2. If outcomes are "Home Win", "Draw", "Away Win" → They're MONEYLINE (correct)
3. If outcomes are "Over 2.5", "Under 2.5" → They're OVER_UNDER (need update)
4. Update any misclassified pools

## Frontend Updates Required

### 1. Update Enum (contracts.ts)
```typescript
export enum MarketType {
  MONEYLINE = 0,        // Changed from OVER_UNDER
  OVER_UNDER = 1,       // Changed from CUSTOM
  SPREAD = 2,           // New
  PROPOSITION = 3,      // New (replaces old BOTH_TEAMS_SCORE, HALF_TIME, etc.)
  CORRECT_SCORE = 4,    // New
  CUSTOM = 5            // Changed from 7
}
```

### 2. Update Market Type Config
Consolidate football-specific market types (BOTH_TEAMS_SCORE, HALF_TIME, DOUBLE_CHANCE, FIRST_GOAL) into PROPOSITION (3).

### 3. Update Market Type Mapping
```typescript
const marketTypeMap: Record<string, number> = {
  '1x2': 0,           // MONEYLINE
  'moneyline': 0,     // MONEYLINE
  'ou25': 1,          // OVER_UNDER
  'over_under': 1,    // OVER_UNDER
  'spread': 2,        // SPREAD
  'prop': 3,          // PROPOSITION
  'btts': 3,          // PROPOSITION (special case)
  'score': 4,         // CORRECT_SCORE
  'custom': 5         // CUSTOM
};
```

## Backend Updates Required

### 1. Update ABIs
- Replace `BitredictPoolCore.json` with newly compiled ABI
- The enum change will be reflected in the ABI

### 2. Update Service Assignments
```javascript
// guided-market-service.js
marketType: 0, // MONEYLINE for football (was 0, still correct)
marketType: 5, // CUSTOM for crypto (was 7, now 5)
```

### 3. Update Web3Service
- Function signatures will be auto-updated from new ABI
- No manual changes needed

## Deployment Checklist

### Pre-Deployment
- [x] Update contract enum
- [x] Verify validation logic still correct
- [ ] Compile contract
- [ ] Run contract tests
- [ ] Generate new ABI

### Deployment
- [ ] Deploy new BitredictPoolCore contract
- [ ] Update contract addresses in config
- [ ] Update frontend ABI reference
- [ ] Update backend ABI reference

### Post-Deployment
- [ ] Verify existing pools still accessible
- [ ] Test creating pool with each market type
- [ ] Test GUIDED oracle rejects CUSTOM market type
- [ ] Test OPEN oracle accepts CUSTOM market type
- [ ] Update documentation

## Backward Compatibility

### What's Preserved
- ✅ All contract functions have same signatures
- ✅ Pool struct remains unchanged
- ✅ Validation logic maintained
- ✅ Oracle integration unchanged

### What Changed
- ⚠️ Enum values changed (0 and 1 swapped positions)
- ⚠️ New enum values added (2, 3, 4)
- ⚠️ CUSTOM moved from 1 to 5

### Migration Path
1. Deploy new contract
2. Update all client ABIs
3. Create new pools with correct market types
4. (Optional) Archive old contract data

## Testing Requirements

### Unit Tests
- [ ] Test each market type (0-5) can be created
- [ ] Test GUIDED oracle rejects CUSTOM (5)
- [ ] Test OPEN oracle accepts CUSTOM (5)
- [ ] Test enum values map correctly

### Integration Tests
- [ ] Create MONEYLINE pool (football)
- [ ] Create OVER_UNDER pool (basketball)
- [ ] Create SPREAD pool (basketball)
- [ ] Create PROPOSITION pool (football BTTS)
- [ ] Create CORRECT_SCORE pool (football)
- [ ] Create CUSTOM pool (crypto)

## Risk Assessment

### Low Risk
- Only 5 existing test pools
- All pools use same market type (0)
- Simple enum change
- No complex logic changes

### Mitigation
- Test thoroughly before mainnet deployment
- Keep old contract accessible for reference
- Document all changes clearly

## Status: ✅ CONTRACT UPDATED

Next steps:
1. Compile contract
2. Generate new ABI
3. Update frontend enum
4. Update backend services
5. Test thoroughly
6. Deploy
