const { ethers } = require('ethers');
const { config } = require('./config.js');
const { fetchUpcomingMatches, fetchMatchResults } = require('./sportmonks.js');

// --- Helper Enums (from Oddyssey.sol) ---
const PredictionChoice = { Moneyline: 0, OverUnder: 1 };
const MoneylineResult = { NotSet: 0, HomeWin: 1, Draw: 2, AwayWin: 3 };
const OverUnderResult = { NotSet: 0, Over: 1, Under: 2 };

// --- Bot Setup ---

// Initialize provider and wallet
const provider = new ethers.JsonRpcProvider(config.PROVIDER_URL);

// Check if private key is set
if (!config.BOT_PRIVATE_KEY || config.BOT_PRIVATE_KEY === '[REDACTED]') {
  console.warn('⚠️ BOT_PRIVATE_KEY not set, oracle bot will run in read-only mode');
  process.exit(0); // Exit gracefully without error
}

const botWallet = new ethers.Wallet(config.BOT_PRIVATE_KEY, provider);

console.log(`Oracle Bot Wallet Address: ${botWallet.address}`);

// Initialize contract instances
const guidedOracle = new ethers.Contract(config.GUIDED_ORACLE_ADDRESS, config.GUIDED_ORACLE_ABI, botWallet);
const oddyssey = new ethers.Contract(config.ODDYSSEY_ADDRESS, config.ODDYSSEY_ABI, botWallet);

// Initialize contracts and log addresses (moved to async function)
async function initializeContracts() {
    try {
        console.log(`GuidedOracle Contract: ${await guidedOracle.getAddress()}`);
        console.log(`Oddyssey Contract: ${await oddyssey.getAddress()}`);
    } catch (error) {
        console.error('Error initializing contracts:', error);
    }
}


// --- Core Bot Functions ---

/**
 * Starts a new daily cycle on the Oddyssey contract.
 * It fetches match data from an off-chain source, formats it,
 * and calls 'executeCall' on the GuidedOracle to start the cycle.
 */
async function startNewOddysseyCycle() {
    console.log("🚀 Preparing to start a new Oddyssey cycle...");

    // 1. Get Match Data (replace with your actual data source)
    const matches = await fetchUpcomingMatches();
    if (!matches || matches.length !== 10) {
        console.error("❌ Failed to fetch valid match data. Aborting cycle start.");
        return;
    }
    console.log(`Fetched ${matches.length} matches for the new cycle.`);

    // 2. ABI-encode the call to Oddyssey's `startDailyCycle` function
    const oddysseyInterface = new ethers.Interface(config.ODDYSSEY_ABI);
    const calldata = oddysseyInterface.encodeFunctionData("startDailyCycle", [matches]);
    console.log("ABI-encoded calldata for startDailyCycle:", calldata);

    // 3. Call `executeCall` on the GuidedOracle
    try {
        console.log(`Calling executeCall on GuidedOracle (${await guidedOracle.getAddress()})...`);
        const tx = await guidedOracle.executeCall(await oddyssey.getAddress(), calldata);
        console.log(`Transaction sent! Hash: ${tx.hash}`);

        const receipt = await tx.wait();
        console.log(`✅ Transaction confirmed! Block number: ${receipt.blockNumber}`);
        console.log("New Oddyssey cycle started successfully.");

    } catch (error) {
        console.error("❌ Error starting new Oddyssey cycle:", error);
    }
}

/**
 * Resolves the current daily cycle on the Oddyssey contract.
 * It fetches match results, formats them, and calls 'executeCall'
 * on the GuidedOracle to push the results.
 */
async function resolveCurrentOddysseyCycle() {
    console.log("🚀 Preparing to resolve the current Oddyssey cycle...");

    // --- This part needs context from the blockchain ---
    // You'll need to know which matches to resolve.
    // This could be done by reading the `dailyMatches` from the Oddyssey contract
    // for the current `dailyCycleId`.
    const currentCycleId = await oddyssey.dailyCycleId();
    const currentMatches = await oddyssey.dailyMatches(currentCycleId);
    const matchIds = currentMatches.map(match => Number(match.id)); // Convert BigInt to number
    console.log(`Found ${matchIds.length} matches for cycle ${currentCycleId}:`, matchIds);


    // 1. Get Match Results (replace with your actual data source)
    const results = await fetchMatchResults(matchIds);
    if (!results || results.length !== 10) {
        console.error("❌ Failed to fetch valid match results. Aborting cycle resolution.");
        return;
    }
    console.log(`Fetched results for ${results.length} matches.`);

    // 2. ABI-encode the call to Oddyssey's `resolveDailyCycle` function
    const oddysseyInterface = new ethers.Interface(config.ODDYSSEY_ABI);
    const calldata = oddysseyInterface.encodeFunctionData("resolveDailyCycle", [results]);
    console.log("ABI-encoded calldata for resolveDailyCycle:", calldata);

    // 3. Call `executeCall` on the GuidedOracle
    try {
        console.log(`Calling executeCall on GuidedOracle (${await guidedOracle.getAddress()})...`);
        const tx = await guidedOracle.executeCall(await oddyssey.getAddress(), calldata);
        console.log(`Transaction sent! Hash: ${tx.hash}`);

        const receipt = await tx.wait();
        console.log(`✅ Transaction confirmed! Block number: ${receipt.blockNumber}`);
        console.log("Oddyssey cycle resolved successfully.");

    } catch (error) {
        console.error("❌ Error resolving Oddyssey cycle:", error);
    }
}


// --- Placeholder Data Functions (Replace with your logic) ---

/**
 * @notice Placeholder function for fetching match data.
 * @dev Replace this with your actual implementation that calls a sports data API.
 * The structure of the returned objects must match the optimized 'Match' struct in Oddyssey.sol.
 * @returns {Array} An array of 10 Match objects.
 */
function getMatchDataFromApi() {
    // Example data. Ensure startTime is a future Unix timestamp in seconds.
    const tenMinutesFromNow = Math.floor(Date.now() / 1000) + 600;
    return Array(10).fill(null).map((_, i) => ({
        id: 1000 + i,
        startTime: tenMinutesFromNow + (i * 120), // Stagger start times
        oddsHome: 2100,
        oddsDraw: 3300,
        oddsAway: 2800,
        oddsOver: 1900,
        oddsUnder: 1900,
        result: { moneyline: MoneylineResult.NotSet, overUnder: OverUnderResult.NotSet }
    }));
}

/**
 * @notice Placeholder function for fetching match results.
 * @dev Replace this with your actual implementation that calls a sports data API
 * after matches have concluded. The structure must match the 'Result' struct.
 * @returns {Array} An array of 10 Result objects.
 */
function getMatchResultsFromApi() {
    // Example data.
    return Array(10).fill(null).map((_, i) => ({
        moneyline: i % 3 === 0 ? MoneylineResult.HomeWin : (i % 3 === 1 ? MoneylineResult.Draw : MoneylineResult.AwayWin),
        overUnder: i % 2 === 0 ? OverUnderResult.Over : OverUnderResult.Under,
    }));
}


// --- Script Execution ---

async function main() {
    console.log("Oracle Bot Initialized.");
    
    // Initialize contract connections
    await initializeContracts();

    // Example usage:
    // To start a cycle, uncomment the following line:
    // await startNewOddysseyCycle();

    // To resolve a cycle, uncomment the following line:
    await resolveCurrentOddysseyCycle();

    // You would typically run this script on a schedule (e.g., using a cron job)
    // to start and resolve cycles automatically.
}

// Export functions for use by backend services
module.exports = {
    startNewOddysseyCycle,
    resolveCurrentOddysseyCycle,
    initializeContracts
};

// Only run main if this file is executed directly
if (require.main === module) {
    main().catch(error => {
        console.error("An unhandled error occurred:", error);
        process.exit(1);
    });
}