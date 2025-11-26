const { ethers } = require('ethers');
require('dotenv').config();

// Contract addresses
const POOL_CORE_ADDRESS = process.env.POOL_CORE_ADDRESS || '0x7055e853562c7306264f3e0d50c56160c3f0d5cf';

// ABI for getPool function
const PoolCoreABI = [
  "function getPool(uint256 poolId) external view returns (tuple(bytes32 predictedOutcome, uint256 odds, uint256 creatorStake, uint256 totalStake, uint256 totalBettorStake, uint256 totalLiquidityStake, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, bytes32 league, bytes32 category, bytes32 region, bytes32 homeTeam, bytes32 awayTeam, bytes32 title, bool isPrivate, uint256 maxBetPerUser, bool useBitr, uint8 oracleType, uint8 marketType, string memory marketId, bool isSettled, bool isRefunded, uint256 flags))",
  "function getPoolWithDecodedNames(uint256 poolId) external view returns (tuple(bytes32 predictedOutcome, uint256 odds, uint256 creatorStake, uint256 totalStake, uint256 totalBettorStake, uint256 totalLiquidityStake, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, string memory league, string memory category, string memory region, string memory homeTeam, string memory awayTeam, string memory title, bool isPrivate, uint256 maxBetPerUser, bool useBitr, uint8 oracleType, uint8 marketType, string memory marketId, bool isSettled, bool isRefunded, uint256 flags))",
  "function getPoolStats(uint256 poolId) external view returns (uint256 totalBettorStake, uint256 totalCreatorSideStake, uint256 bettorCount, uint256 lpCount, bool isSettled, bool eligibleForRefund, uint256 timeUntilEventStart, uint256 timeUntilBettingEnd)"
];

// Decode bytes32 to string
function decodeBytes32(bytes32) {
  if (!bytes32 || bytes32 === '0x0000000000000000000000000000000000000000000000000000000000000000') {
    return '';
  }
  try {
    const hex = bytes32.startsWith('0x') ? bytes32.slice(2) : bytes32;
    const str = Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '');
    return str.trim();
  } catch (error) {
    return bytes32;
  }
}

// Decode createPool transaction
function decodeCreatePoolTransaction(input) {
  // Function selector: createPool(bytes32,uint256,uint256,uint256,uint256,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bool,uint256,bool,uint8,uint8,string)
  // Selector: 0xd3fa1190
  
  const iface = new ethers.Interface([
    "function createPool(bytes32 _predictedOutcome, uint256 _odds, uint256 _creatorStake, uint256 _eventStartTime, uint256 _eventEndTime, bytes32 _league, bytes32 _category, bytes32 _region, bytes32 _homeTeam, bytes32 _awayTeam, bytes32 _title, bool _isPrivate, uint256 _maxBetPerUser, bool _useBitr, uint8 _oracleType, uint8 _marketType, string memory _marketId)"
  ]);
  
  try {
    const decoded = iface.parseTransaction({ data: input });
    return decoded.args;
  } catch (error) {
    console.error('Error decoding transaction:', error);
    return null;
  }
}

async function checkPool10() {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.somnia.network');
    const poolCore = new ethers.Contract(POOL_CORE_ADDRESS, PoolCoreABI, provider);
    
    console.log('\n🔍 CHECKING POOL 10 IN CONTRACT...\n');
    
    // Get pool data from contract
    const poolData = await poolCore.getPool(10);
    
    console.log('📊 CONTRACT DATA FOR POOL 10:');
    console.log('============================');
    console.log(`Predicted Outcome: ${decodeBytes32(poolData.predictedOutcome)}`);
    console.log(`Odds: ${poolData.odds}`);
    console.log(`Creator Stake: ${ethers.formatEther(poolData.creatorStake)} STT`);
    console.log(`Market ID: ${poolData.marketId}`);
    console.log(`\n⏰ TIMING:`);
    console.log(`Event Start Time: ${poolData.eventStartTime.toString()} (${new Date(Number(poolData.eventStartTime) * 1000).toISOString()})`);
    console.log(`Event End Time: ${poolData.eventEndTime.toString()} (${new Date(Number(poolData.eventEndTime) * 1000).toISOString()})`);
    console.log(`Betting End Time: ${poolData.bettingEndTime.toString()} (${new Date(Number(poolData.bettingEndTime) * 1000).toISOString()})`);
    
    // Calculate timeframe
    const timeframeSeconds = Number(poolData.eventEndTime) - Number(poolData.eventStartTime);
    const hours = Math.floor(timeframeSeconds / 3600);
    const days = Math.floor(hours / 24);
    const minutes = Math.floor((timeframeSeconds % 3600) / 60);
    console.log(`\n📅 TIMEFRAME:`);
    console.log(`Duration: ${timeframeSeconds} seconds`);
    console.log(`Duration: ${days} days, ${hours % 24} hours, ${minutes} minutes`);
    console.log(`Expected: 4 hours (14400 seconds)`);
    
    // Check current time vs event start
    const now = Math.floor(Date.now() / 1000);
    const timeUntilEventStart = Number(poolData.eventStartTime) - now;
    const timeUntilEventStartMinutes = Math.floor(timeUntilEventStart / 60);
    console.log(`\n⏱️ TIME UNTIL EVENT START:`);
    console.log(`Current time: ${now} (${new Date(now * 1000).toISOString()})`);
    console.log(`Time until event start: ${timeUntilEventStart} seconds (${timeUntilEventStartMinutes} minutes)`);
    
    // Get pool stats
    const stats = await poolCore.getPoolStats(10);
    console.log(`\n📊 POOL STATS:`);
    console.log(`Bettor Count: ${stats.bettorCount.toString()}`);
    console.log(`Total Bettor Stake: ${ethers.formatEther(stats.totalBettorStake)} STT`);
    console.log(`Total Creator Side Stake: ${ethers.formatEther(stats.totalCreatorSideStake)} STT`);
    console.log(`LP Count: ${stats.lpCount.toString()}`);
    console.log(`Is Settled: ${stats.isSettled}`);
    console.log(`Time Until Event Start: ${stats.timeUntilEventStart.toString()} seconds`);
    
    // Decode the createPool transaction
    console.log(`\n🔍 DECODING CREATEPOOL TRANSACTION...\n`);
    const createPoolInput = "0xd3fa11904554482061626f7665202433373030000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000b400000000000000000000000000000000000000000000010f0cf064dd59200000000000000000000000000000000000000000000000000000000000006912930f000000000000000000000000000000000000000000000000000000006913e48f63727970746f000000000000000000000000000000000000000000000000000063727970746f63757272656e6379000000000000000000000000000000000000455448000000000000000000000000000000000000000000000000000000000055534400000000000000000000000000000000000000000000000000000000004554482050726963652050726564696374696f6e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000042307861656464353165643663313839663364636262336239333666656534396661633566316635313861653663613537346363333932646238626233386662653639000000000000000000000000000000000000000000000000000000000000";
    
    const decoded = decodeCreatePoolTransaction(createPoolInput);
    if (decoded) {
      console.log('📝 DECODED CREATEPOOL PARAMETERS:');
      console.log(`Predicted Outcome: ${decodeBytes32(decoded._predictedOutcome)}`);
      console.log(`Odds: ${decoded._odds.toString()}`);
      console.log(`Creator Stake: ${ethers.formatEther(decoded._creatorStake)} STT`);
      console.log(`Event Start Time: ${decoded._eventStartTime.toString()} (${new Date(Number(decoded._eventStartTime) * 1000).toISOString()})`);
      console.log(`Event End Time: ${decoded._eventEndTime.toString()} (${new Date(Number(decoded._eventEndTime) * 1000).toISOString()})`);
      console.log(`League: ${decodeBytes32(decoded._league)}`);
      console.log(`Category: ${decodeBytes32(decoded._category)}`);
      console.log(`Region: ${decodeBytes32(decoded._region)}`);
      console.log(`Home Team: ${decodeBytes32(decoded._homeTeam)}`);
      console.log(`Away Team: ${decodeBytes32(decoded._awayTeam)}`);
      console.log(`Title: ${decodeBytes32(decoded._title)}`);
      console.log(`Is Private: ${decoded._isPrivate}`);
      console.log(`Max Bet Per User: ${ethers.formatEther(decoded._maxBetPerUser)} STT`);
      console.log(`Use BITR: ${decoded._useBitr}`);
      console.log(`Oracle Type: ${decoded._oracleType}`);
      console.log(`Market Type: ${decoded._marketType}`);
      console.log(`Market ID: ${decoded._marketId}`);
      
      // Calculate what timeframe was sent
      const sentTimeframe = Number(decoded._eventEndTime) - Number(decoded._eventStartTime);
      console.log(`\n🔍 ANALYSIS:`);
      console.log(`Timeframe sent: ${sentTimeframe} seconds (${sentTimeframe / 3600} hours)`);
      console.log(`Expected: 14400 seconds (4 hours)`);
      console.log(`❌ PROBLEM: Frontend sent ${sentTimeframe / 3600} hours instead of 4 hours!`);
      
      // Check event start time
      const eventStartDate = new Date(Number(decoded._eventStartTime) * 1000);
      const eventStartHours = eventStartDate.getUTCHours();
      const eventStartMinutes = eventStartDate.getUTCMinutes();
      console.log(`\nEvent Start Time sent: ${eventStartDate.toISOString()}`);
      console.log(`Event Start Hour: ${eventStartHours}:${eventStartMinutes.toString().padStart(2, '0')} UTC`);
      console.log(`Expected: 8:00 UTC`);
      if (eventStartHours !== 8) {
        console.log(`❌ PROBLEM: Frontend sent ${eventStartHours}:${eventStartMinutes.toString().padStart(2, '0')} UTC instead of 8:00 UTC!`);
      }
    }
    
    // Check the missed bet
    console.log(`\n💰 CHECKING MISSED BET...\n`);
    const betInput = "0x4afe62b5000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000bdbc41e0348b300000";
    const betIface = new ethers.Interface([
      "function placeBet(uint256 poolId, uint256 amount)"
    ]);
    try {
      const betDecoded = betIface.parseTransaction({ data: betInput });
      console.log('📝 DECODED BET TRANSACTION:');
      console.log(`Pool ID: ${betDecoded.args.poolId.toString()}`);
      console.log(`Amount: ${ethers.formatEther(betDecoded.args.amount)} STT`);
      console.log(`\n✅ Bet transaction was valid and should have been synced!`);
      console.log(`❌ PROBLEM: Bet sync service missed this transaction!`);
    } catch (error) {
      console.error('Error decoding bet:', error);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkPool10();

