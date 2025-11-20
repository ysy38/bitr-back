/**
 * Debug Bet Display Issue Script
 * 
 * This script helps debug why "Yes" bets are showing as "No" bets
 * in the recent bets lane on the frontend.
 */

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

const POOL_CORE_ABI = require('../abis/BitredictPoolCore.json');
const POOL_CORE_ADDRESS = '0xf6C56Ef095d88a04a3C594ECA30F6e275EEbe3db';

class BetDisplayDebugger {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
        this.contract = new ethers.Contract(POOL_CORE_ADDRESS, POOL_CORE_ABI, this.provider);
    }

    async debugRecentBets() {
        try {
            console.log('🔍 Debugging Bet Display Issue...');
            console.log('');

            // Get recent bets from database
            console.log('📊 Recent Bets from Database:');
            const recentBets = await db.query(`
                SELECT 
                    b.id,
                    b.pool_id,
                    b.bettor_address,
                    b.amount,
                    b.is_for_outcome,
                    b.created_at,
                    b.transaction_hash,
                    'bet' as event_type
                FROM oracle.bets b
                ORDER BY b.created_at DESC
                LIMIT 10
            `);

            console.log(`Found ${recentBets.rows.length} recent bets:`);
            recentBets.rows.forEach((bet, index) => {
                console.log(`  ${index + 1}. Pool ${bet.pool_id}`);
                console.log(`     Bettor: ${bet.bettor_address}`);
                console.log(`     Amount: ${bet.amount}`);
                console.log(`     isForOutcome: ${bet.is_for_outcome} (${bet.is_for_outcome ? 'YES' : 'NO'})`);
                console.log(`     Created: ${bet.created_at}`);
                console.log(`     TX: ${bet.transaction_hash}`);
                console.log('');
            });

            // Get recent liquidity additions
            console.log('💧 Recent Liquidity Additions from Database:');
            const recentLPs = await db.query(`
                SELECT 
                    lp.id,
                    lp.pool_id,
                    lp.lp_address,
                    lp.stake,
                    lp.created_at,
                    'liquidity_added' as event_type
                FROM oracle.pool_liquidity_providers lp
                ORDER BY lp.created_at DESC
                LIMIT 10
            `);

            console.log(`Found ${recentLPs.rows.length} recent liquidity additions:`);
            recentLPs.rows.forEach((lp, index) => {
                console.log(`  ${index + 1}. Pool ${lp.pool_id}`);
                console.log(`     Provider: ${lp.lp_address}`);
                console.log(`     Stake: ${lp.stake}`);
                console.log(`     Created: ${lp.created_at}`);
                console.log('');
            });

            // Check recent BetPlaced events from blockchain
            console.log('🔗 Recent BetPlaced Events from Blockchain:');
            const currentBlock = await this.provider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 1000); // Last 1000 blocks

            const betPlacedFilter = this.contract.filters.BetPlaced();
            const betPlacedEvents = await this.contract.queryFilter(betPlacedFilter, fromBlock, currentBlock);

            console.log(`Found ${betPlacedEvents.length} BetPlaced events in last 1000 blocks:`);
            betPlacedEvents.slice(-10).forEach((event, index) => {
                const { poolId, bettor, amount, isForOutcome } = event.args;
                console.log(`  ${index + 1}. Pool ${poolId.toString()}`);
                console.log(`     Bettor: ${bettor}`);
                console.log(`     Amount: ${ethers.formatEther(amount)} ETH`);
                console.log(`     isForOutcome: ${isForOutcome} (${isForOutcome ? 'YES' : 'NO'})`);
                console.log(`     Block: ${event.blockNumber}`);
                console.log(`     TX: ${event.transactionHash}`);
                console.log('');
            });

            // Check recent LiquidityAdded events from blockchain
            console.log('💧 Recent LiquidityAdded Events from Blockchain:');
            const liquidityAddedFilter = this.contract.filters.LiquidityAdded();
            const liquidityAddedEvents = await this.contract.queryFilter(liquidityAddedFilter, fromBlock, currentBlock);

            console.log(`Found ${liquidityAddedEvents.length} LiquidityAdded events in last 1000 blocks:`);
            liquidityAddedEvents.slice(-10).forEach((event, index) => {
                const { poolId, provider, amount } = event.args;
                console.log(`  ${index + 1}. Pool ${poolId.toString()}`);
                console.log(`     Provider: ${provider}`);
                console.log(`     Amount: ${ethers.formatEther(amount)} ETH`);
                console.log(`     Block: ${event.blockNumber}`);
                console.log(`     TX: ${event.transactionHash}`);
                console.log('');
            });

            // Check for mismatches
            console.log('🔍 Checking for Data Mismatches:');
            await this.checkDataMismatches();

        } catch (error) {
            console.error('❌ Error debugging bet display issue:', error);
        } finally {
            process.exit(0);
        }
    }

    async checkDataMismatches() {
        try {
            // Check if there are any BetPlaced events that aren't in the database
            const currentBlock = await this.provider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 1000);

            const betPlacedFilter = this.contract.filters.BetPlaced();
            const betPlacedEvents = await this.contract.queryFilter(betPlacedFilter, fromBlock, currentBlock);

            console.log('🔍 Checking for missing BetPlaced events in database...');
            let missingEvents = 0;

            for (const event of betPlacedEvents) {
                const { poolId, bettor, transactionHash } = event.args;
                
                const dbBet = await db.query(`
                    SELECT id FROM oracle.bets 
                    WHERE pool_id = $1 AND bettor_address = $2 AND transaction_hash = $3
                `, [poolId.toString(), bettor, event.transactionHash]);

                if (dbBet.rows.length === 0) {
                    console.log(`  ❌ Missing: Pool ${poolId}, Bettor ${bettor}, TX ${event.transactionHash}`);
                    missingEvents++;
                }
            }

            if (missingEvents === 0) {
                console.log('  ✅ All BetPlaced events are in the database');
            } else {
                console.log(`  ⚠️ Found ${missingEvents} missing BetPlaced events`);
            }

            // Check if there are any database bets that don't have corresponding blockchain events
            console.log('🔍 Checking for orphaned bets in database...');
            const dbBets = await db.query(`
                SELECT pool_id, bettor_address, transaction_hash, is_for_outcome
                FROM oracle.bets 
                WHERE created_at > NOW() - INTERVAL '1 hour'
                ORDER BY created_at DESC
                LIMIT 20
            `);

            let orphanedBets = 0;
            for (const dbBet of dbBets.rows) {
                const blockchainEvent = betPlacedEvents.find(event => 
                    event.args.poolId.toString() === dbBet.pool_id &&
                    event.args.bettor === dbBet.bettor_address &&
                    event.transactionHash === dbBet.transaction_hash
                );

                if (!blockchainEvent) {
                    console.log(`  ❌ Orphaned: Pool ${dbBet.pool_id}, Bettor ${dbBet.bettor_address}, isForOutcome: ${dbBet.is_for_outcome}`);
                    orphanedBets++;
                } else {
                    // Check if isForOutcome matches
                    if (blockchainEvent.args.isForOutcome !== dbBet.is_for_outcome) {
                        console.log(`  ⚠️ Mismatch: Pool ${dbBet.pool_id}, Bettor ${dbBet.bettor_address}`);
                        console.log(`     Database: isForOutcome = ${dbBet.is_for_outcome}`);
                        console.log(`     Blockchain: isForOutcome = ${blockchainEvent.args.isForOutcome}`);
                    }
                }
            }

            if (orphanedBets === 0) {
                console.log('  ✅ No orphaned bets found');
            } else {
                console.log(`  ⚠️ Found ${orphanedBets} orphaned bets`);
            }

        } catch (error) {
            console.error('❌ Error checking data mismatches:', error);
        }
    }
}

// Run the debugger
const betDebugger = new BetDisplayDebugger();
betDebugger.debugRecentBets();
