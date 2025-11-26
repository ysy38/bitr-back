// Load environment variables
require('dotenv').config();

// Load contract ABIs from artifacts
let GuidedOracleABI, OddysseyABI;

try {
    const GuidedOracleArtifact = require('../solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json');
    const OddysseyArtifact = require('../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json');
    
    GuidedOracleABI = GuidedOracleArtifact.abi;
    OddysseyABI = OddysseyArtifact.abi;
} catch (error) {
    console.error('⚠️ Failed to load contract artifacts, using fallback ABIs:', error.message);
    
    // Fallback minimal ABIs
    GuidedOracleABI = [
        "function executeCall(address target, bytes calldata data) external",
        "function oracleBot() external view returns (address)",
        "event CallExecuted(address indexed target, bytes data)"
    ];
    
    // Use the existing OddysseyABI.json as fallback
    try {
        const OddysseyFallback = require('./OddysseyABI.json');
        OddysseyABI = OddysseyFallback.abi;
    } catch (fallbackError) {
        console.error('❌ Could not load any Oddyssey ABI');
        OddysseyABI = [];
    }
}

const config = {
    // Load from environment variables
    PROVIDER_URL: process.env.RPC_URL || process.env.PROVIDER_URL || 'https://dream-rpc.somnia.network/',
    SPORTMONKS_API_TOKEN: process.env.SPORTMONKS_API_TOKEN,
    BOT_PRIVATE_KEY: process.env.BOT_PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY,
    
    // Contract addresses from environment
    GUIDED_ORACLE_ADDRESS: process.env.GUIDED_ORACLE_ADDRESS,
    ODDYSSEY_ADDRESS: process.env.ODDYSSEY_ADDRESS,
    
    // Contract ABIs loaded from artifacts
    GUIDED_ORACLE_ABI: GuidedOracleABI,
    ODDYSSEY_ABI: OddysseyABI
};

module.exports = { config }; 