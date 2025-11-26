/**
 * Debug Specific Bet Script
 * 
 * This script checks the blockchain event for a specific transaction
 * to see what the actual isForOutcome value is.
 */

const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

const POOL_CORE_ABI = require('../abis/BitredictPoolCore.json');
const POOL_CORE_ADDRESS = '0xf6C56Ef095d88a04a3C594ECA30F6e275EEbe3db';

async function debugSpecificBet() {
    try {
        console.log('🔍 Debugging Specific Bet Transaction...');
        console.log('');

        // Connect to provider
        const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
        const contract = new ethers.Contract(POOL_CORE_ADDRESS, POOL_CORE_ABI, provider);

        // The transaction we're investigating
        const txHash = '0x6006ec5d0381290a767dff3c22d1347263797f87c50a48f84775d2ac80c07d30';
        const poolId = '4';
        const bettor = '0x150e7665A6F3e66933BDFD51a60A43f1BCC7971B';

        console.log(`🔍 Transaction: ${txHash}`);
        console.log(`🎯 Pool ID: ${poolId}`);
        console.log(`👤 Bettor: ${bettor}`);
        console.log('');

        // Get transaction details
        const tx = await provider.getTransaction(txHash);
        if (!tx) {
            console.log('❌ Transaction not found');
            return;
        }

        console.log('📋 Transaction Details:');
        console.log(`   Block: ${tx.blockNumber}`);
        console.log(`   From: ${tx.from}`);
        console.log(`   To: ${tx.to}`);
        console.log(`   Value: ${tx.value}`);
        console.log(`   Data: ${tx.data}`);
        console.log('');

        // Get transaction receipt
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt) {
            console.log('❌ Transaction receipt not found');
            return;
        }

        console.log('📋 Transaction Receipt:');
        console.log(`   Status: ${receipt.status}`);
        console.log(`   Gas Used: ${receipt.gasUsed}`);
        console.log(`   Logs: ${receipt.logs.length}`);
        console.log('');

        // Parse logs for BetPlaced event
        const iface = contract.interface;
        const betPlacedEvent = iface.getEvent('BetPlaced');

        console.log('🔍 Parsing Logs for BetPlaced Events:');
        console.log('');

        let foundBetPlaced = false;

        for (let i = 0; i < receipt.logs.length; i++) {
            const log = receipt.logs[i];
            
            // Check if this log is from our contract
            if (log.address.toLowerCase() === POOL_CORE_ADDRESS.toLowerCase()) {
                console.log(`📋 Log ${i}:`);
                console.log(`   Address: ${log.address}`);
                console.log(`   Topics: ${log.topics.length}`);
                console.log(`   Data: ${log.data}`);
                console.log('');

                // Try to decode the log
                try {
                    const decoded = iface.parseLog({
                        topics: log.topics,
                        data: log.data
                    });
                    
                    if (decoded && decoded.name === 'BetPlaced') {
                        console.log('🎯 FOUND BETPLACED EVENT!');
                        console.log(`   Pool ID: ${decoded.args.poolId.toString()}`);
                        console.log(`   Bettor: ${decoded.args.bettor}`);
                        console.log(`   Amount: ${decoded.args.amount.toString()}`);
                        console.log(`   Is For Outcome: ${decoded.args.isForOutcome}`);
                        console.log(`   Is For Outcome Type: ${typeof decoded.args.isForOutcome}`);
                        console.log('');

                        // Check if this matches our bet
                        if (decoded.args.poolId.toString() === poolId && 
                            decoded.args.bettor.toLowerCase() === bettor.toLowerCase()) {
                            console.log('✅ MATCH FOUND! This is the bet we\'re investigating');
                            console.log('');
                            
                            console.log('🔍 Blockchain Event Analysis:');
                            console.log(`   Pool ID: ${decoded.args.poolId.toString()}`);
                            console.log(`   Bettor: ${decoded.args.bettor}`);
                            console.log(`   Amount: ${ethers.formatEther(decoded.args.amount)} ETH`);
                            console.log(`   isForOutcome: ${decoded.args.isForOutcome} (${decoded.args.isForOutcome ? 'YES' : 'NO'})`);
                            console.log('');

                            foundBetPlaced = true;

                            // Check database record
                            console.log('🔍 Database Record Analysis:');
                            const dbBet = await db.query(`
                                SELECT * FROM oracle.bets 
                                WHERE transaction_hash = $1
                            `, [txHash]);

                            if (dbBet.rows.length > 0) {
                                const bet = dbBet.rows[0];
                                console.log(`   Pool ID: ${bet.pool_id}`);
                                console.log(`   Bettor: ${bet.bettor_address}`);
                                console.log(`   Amount: ${bet.amount}`);
                                console.log(`   isForOutcome: ${bet.is_for_outcome} (${bet.is_for_outcome ? 'YES' : 'NO'})`);
                                console.log(`   Created: ${bet.created_at}`);
                                console.log('');

                                // Compare blockchain vs database
                                console.log('🔍 Comparison:');
                                console.log(`   Blockchain isForOutcome: ${decoded.args.isForOutcome} (${decoded.args.isForOutcome ? 'YES' : 'NO'})`);
                                console.log(`   Database isForOutcome: ${bet.is_for_outcome} (${bet.is_for_outcome ? 'YES' : 'NO'})`);
                                
                                if (decoded.args.isForOutcome === bet.is_for_outcome) {
                                    console.log('   ✅ MATCH: Blockchain and database values are the same');
                                } else {
                                    console.log('   ❌ MISMATCH: Blockchain and database values are different!');
                                    console.log('   This indicates a bug in the bet sync process.');
                                }
                            } else {
                                console.log('   ❌ No database record found for this transaction');
                            }
                        }
                    } else if (decoded && decoded.name === 'LiquidityAdded') {
                        console.log('💧 FOUND LIQUIDITYADDED EVENT!');
                        console.log(`   Pool ID: ${decoded.args.poolId.toString()}`);
                        console.log(`   Provider: ${decoded.args.provider}`);
                        console.log(`   Amount: ${decoded.args.amount.toString()}`);
                        console.log('');
                    }
                } catch (decodeError) {
                    console.log(`   ⚠️  Could not decode log ${i}: ${decodeError.message}`);
                }
            }
        }

        if (!foundBetPlaced) {
            console.log('❌ No BetPlaced event found for this transaction');
            console.log('This suggests the transaction might not have been a bet placement.');
        }

    } catch (error) {
        console.error('❌ Error debugging specific bet:', error);
    } finally {
        process.exit(0);
    }
}

// Run the debugger
debugSpecificBet();
