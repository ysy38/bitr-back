const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

/**
 * Validate Oddyssey contract ABI for frontend integration
 */
async function validateOddysseyABI() {
  try {
    console.log('🔍 Validating Oddyssey contract ABI...');

    // Load contract ABI from artifacts
    let oddysseyABI;
    const artifactPath = path.join(__dirname, '../../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json');
    
    if (fs.existsSync(artifactPath)) {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      oddysseyABI = artifact.abi;
      console.log('✅ Loaded ABI from artifacts');
    } else {
      console.warn('⚠️ Artifact not found, using fallback ABI');
      oddysseyABI = [
        "function oracle() external view returns (address)",
        "function dailyCycleId() external view returns (uint256)",
        "function getDailyMatches(uint256 _cycleId) external view returns (tuple(uint64 id, uint64 startTime, uint32 oddsHome, uint32 oddsDraw, uint32 oddsAway, uint32 oddsOver, uint32 oddsUnder, tuple(uint8 moneyline, uint8 overUnder) result)[10])",
        "function getCurrentCycle() external view returns (uint256)",
        "function getCycleStatus(uint256 _cycleId) external view returns (bool exists, uint256 endTime, uint256 prizePool, bool isResolved, uint256 slipCount)",
        "function getCycleMatches(uint256 _cycleId) external view returns (tuple(uint64 id, uint64 startTime, uint32 oddsHome, uint32 oddsDraw, uint32 oddsAway, uint32 oddsOver, uint32 oddsUnder, tuple(uint8 moneyline, uint8 overUnder) result)[10])",
        "function placeSlip(tuple(uint64 matchId, uint8 betType, string selection, uint32 selectedOdd)[10] _predictions) external payable",
        "function evaluateSlip(uint256 _slipId) external",
        "function claimPrize(uint256 _cycleId) external",
        "function getUserStats(address _user) external view returns (uint256 totalSlips, uint256 totalWins, uint256 bestScore, uint256 averageScore, uint256 winRate, uint256 currentStreak, uint256 bestStreak, uint256 lastActiveCycle)",
        "function getOddysseyReputation(address _user) external view returns (uint256 totalReputation, uint256 totalCorrectPredictions)"
      ];
    }

    // Required functions for frontend integration
    const requiredFunctions = [
      'dailyCycleId',
      'getDailyMatches', 
      'getCurrentCycle',
      'getCycleStatus',
      'getCycleMatches',
      'placeSlip',
      'evaluateSlip',
      'claimPrize',
      'getUserStats',
      'getOddysseyReputation'
    ];

    // Check if all required functions are present
    const functionNames = oddysseyABI
      .filter(item => item.type === 'function')
      .map(item => item.name);

    console.log('\n📋 Found functions:', functionNames);

    const missingFunctions = requiredFunctions.filter(func => !functionNames.includes(func));
    
    if (missingFunctions.length > 0) {
      console.error('❌ Missing required functions:', missingFunctions);
      return false;
    }

    console.log('✅ All required functions found');

    // Validate function signatures
    const validationResults = [];

    // Check getDailyMatches signature
    const getDailyMatches = oddysseyABI.find(item => 
      item.type === 'function' && item.name === 'getDailyMatches'
    );
    
    if (getDailyMatches) {
      const hasCorrectParams = getDailyMatches.inputs.length === 1 && 
                              getDailyMatches.inputs[0].type === 'uint256';
      const hasCorrectOutput = getDailyMatches.outputs.length === 1 &&
                              getDailyMatches.outputs[0].type.includes('tuple');
      
      validationResults.push({
        function: 'getDailyMatches',
        valid: hasCorrectParams && hasCorrectOutput,
        details: {
          inputs: getDailyMatches.inputs.length,
          outputs: getDailyMatches.outputs.length,
          outputType: getDailyMatches.outputs[0]?.type
        }
      });
    }

    // Check placeSlip signature
    const placeSlip = oddysseyABI.find(item => 
      item.type === 'function' && item.name === 'placeSlip'
    );
    
    if (placeSlip) {
      const hasCorrectParams = placeSlip.inputs.length === 1 &&
                              placeSlip.inputs[0].type.includes('tuple');
      const isPayable = placeSlip.stateMutability === 'payable';
      
      validationResults.push({
        function: 'placeSlip',
        valid: hasCorrectParams && isPayable,
        details: {
          inputs: placeSlip.inputs.length,
          payable: isPayable,
          inputType: placeSlip.inputs[0]?.type
        }
      });
    }

    // Display validation results
    console.log('\n🔍 Function signature validation:');
    validationResults.forEach(result => {
      const status = result.valid ? '✅' : '❌';
      console.log(`${status} ${result.function}: ${JSON.stringify(result.details)}`);
    });

    const allValid = validationResults.every(result => result.valid);
    
    if (allValid) {
      console.log('\n🎉 ABI validation passed!');
      return true;
    } else {
      console.log('\n⚠️ ABI validation failed - some function signatures may be incorrect');
      return false;
    }

  } catch (error) {
    console.error('❌ Error validating ABI:', error);
    return false;
  }
}

/**
 * Generate frontend-compatible ABI
 */
function generateFrontendABI() {
  try {
    console.log('📝 Generating frontend-compatible ABI...');

    const frontendABI = [
      // View functions
      {
        "inputs": [],
        "name": "dailyCycleId",
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [{"type": "uint256", "name": "_cycleId"}],
        "name": "getDailyMatches",
        "outputs": [{"type": "tuple[10]", "components": [
          {"type": "uint64", "name": "id"},
          {"type": "uint64", "name": "startTime"},
          {"type": "uint32", "name": "oddsHome"},
          {"type": "uint32", "name": "oddsDraw"},
          {"type": "uint32", "name": "oddsAway"},
          {"type": "uint32", "name": "oddsOver"},
          {"type": "uint32", "name": "oddsUnder"},
          {"type": "tuple", "name": "result", "components": [
            {"type": "uint8", "name": "moneyline"},
            {"type": "uint8", "name": "overUnder"}
          ]}
        ]}],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [{"type": "uint256", "name": "_cycleId"}],
        "name": "getCycleStatus",
        "outputs": [
          {"type": "bool", "name": "exists"},
          {"type": "uint256", "name": "endTime"},
          {"type": "uint256", "name": "prizePool"},
          {"type": "bool", "name": "isResolved"},
          {"type": "uint256", "name": "slipCount"}
        ],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [{"type": "address", "name": "_user"}],
        "name": "getUserStats",
        "outputs": [
          {"type": "uint256", "name": "totalSlips"},
          {"type": "uint256", "name": "totalWins"},
          {"type": "uint256", "name": "bestScore"},
          {"type": "uint256", "name": "averageScore"},
          {"type": "uint256", "name": "winRate"},
          {"type": "uint256", "name": "currentStreak"},
          {"type": "uint256", "name": "bestStreak"},
          {"type": "uint256", "name": "lastActiveCycle"}
        ],
        "stateMutability": "view",
        "type": "function"
      },
      // State-changing functions
      {
        "inputs": [{"type": "tuple[]", "name": "_predictions", "components": [
          {"type": "uint64", "name": "matchId"},
          {"type": "uint8", "name": "betType"},
          {"type": "bytes32", "name": "selection"},
          {"type": "uint32", "name": "selectedOdd"}
        ]}],
        "name": "placeSlip",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
      },
      {
        "inputs": [{"type": "uint256", "name": "_slipId"}],
        "name": "evaluateSlip",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      },
      {
        "inputs": [{"type": "uint256", "name": "_cycleId"}],
        "name": "claimPrize",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      }
    ];

    // Save to file
    const outputPath = path.join(__dirname, '../oddyssey-frontend-abi.json');
    fs.writeFileSync(outputPath, JSON.stringify(frontendABI, null, 2));
    
    console.log(`✅ Frontend ABI saved to: ${outputPath}`);
    return frontendABI;

  } catch (error) {
    console.error('❌ Error generating frontend ABI:', error);
    return null;
  }
}

// Run validation if called directly
if (require.main === module) {
  validateOddysseyABI()
    .then((isValid) => {
      if (isValid) {
        generateFrontendABI();
      }
      process.exit(isValid ? 0 : 1);
    })
    .catch((error) => {
      console.error('💥 ABI validation failed:', error);
      process.exit(1);
    });
}

module.exports = {
  validateOddysseyABI,
  generateFrontendABI
};
