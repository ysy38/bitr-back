const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('🔍 Starting contract verification on Somnia Testnet Explorer...\n');

  // Load deployment info
  const deploymentPath = path.join(__dirname, '../deployed-addresses.json');
  if (!fs.existsSync(deploymentPath)) {
    console.error('❌ No deployed-addresses.json found!');
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const contracts = deployment.contracts;

  console.log('📋 Contracts to verify:');
  Object.keys(contracts).forEach((name) => {
    console.log(`   ${name}: ${contracts[name]}`);
  });
  console.log('');

  const results = {
    verified: [],
    failed: [],
    alreadyVerified: []
  };

  // Get deployer address for constructor arguments
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = deployer.address;

  // Verify each contract with appropriate constructor arguments
  const contractsToVerify = [
    {
      name: 'BitredictToken',
      address: contracts.BitredictToken,
      constructorArgs: []
    },
    {
      name: 'ReputationSystem',
      address: contracts.ReputationSystem,
      constructorArgs: []
    },
    {
      name: 'GuidedOracle',
      address: contracts.GuidedOracle,
      constructorArgs: [deployerAddress] // oracleBot address
    },
    {
      name: 'OptimisticOracle',
      address: contracts.OptimisticOracle,
      constructorArgs: [contracts.BitredictToken, deployerAddress] // bondToken, bitredictPool
    },
    {
      name: 'BitredictPoolCore',
      address: contracts.BitredictPoolCore,
      constructorArgs: [
        contracts.BitredictToken, // bitrToken
        contracts.GuidedOracle,   // guidedOracle
        contracts.OptimisticOracle, // optimisticOracle
        contracts.ReputationSystem  // reputationSystem
      ]
    },
    {
      name: 'BitredictBoostSystem',
      address: contracts.BitredictBoostSystem,
      constructorArgs: [
        contracts.BitredictToken,     // bitrToken
        contracts.BitredictPoolCore   // poolCore
      ]
    },
    {
      name: 'BitredictComboPools',
      address: contracts.BitredictComboPools,
      constructorArgs: [
        contracts.BitredictToken,     // bitrToken
        contracts.BitredictPoolCore   // poolCore
      ]
    },
    {
      name: 'BitredictPoolFactory',
      address: contracts.BitredictPoolFactory,
      constructorArgs: [
        contracts.BitredictToken,     // bitrToken
        contracts.BitredictPoolCore   // poolCore
      ]
    },
    {
      name: 'BitredictStaking',
      address: contracts.BitredictStaking,
      constructorArgs: [
        contracts.BitredictToken,     // bitrToken
        contracts.BitredictPoolCore   // poolCore
      ]
    },
    {
      name: 'Oddyssey',
      address: contracts.Oddyssey,
      constructorArgs: [
        contracts.BitredictToken,     // bitrToken
        contracts.ReputationSystem    // reputationSystem
      ]
    },
    {
      name: 'BitrFaucet',
      address: contracts.BitrFaucet,
      constructorArgs: [contracts.BitredictToken] // bitrToken
    }
  ];

  for (const contract of contractsToVerify) {
    console.log(`\n🔄 Verifying ${contract.name} at ${contract.address}...`);
    
    try {
      await hre.run("verify:verify", {
        address: contract.address,
        constructorArguments: contract.constructorArgs,
      });
      
      console.log(`✅ ${contract.name} verified successfully!`);
      results.verified.push(contract.name);
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      if (error.message.includes("Already Verified") || error.message.includes("already verified")) {
        console.log(`ℹ️  ${contract.name} is already verified`);
        results.alreadyVerified.push(contract.name);
      } else {
        console.error(`❌ Failed to verify ${contract.name}:`, error.message);
        results.failed.push({ name: contract.name, error: error.message });
      }
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('='.repeat(80));
  
  if (results.verified.length > 0) {
    console.log(`\n✅ Newly Verified (${results.verified.length}):`);
    results.verified.forEach(name => console.log(`   • ${name}`));
  }
  
  if (results.alreadyVerified.length > 0) {
    console.log(`\nℹ️  Already Verified (${results.alreadyVerified.length}):`);
    results.alreadyVerified.forEach(name => console.log(`   • ${name}`));
  }
  
  if (results.failed.length > 0) {
    console.log(`\n❌ Failed (${results.failed.length}):`);
    results.failed.forEach(item => {
      console.log(`   • ${item.name}: ${item.error.substring(0, 100)}...`);
    });
  }

  const totalSuccess = results.verified.length + results.alreadyVerified.length;
  console.log(`\n📈 Total: ${totalSuccess}/${contractsToVerify.length} contracts verified`);
  
  console.log('\n🔗 View verified contracts on Somnia Explorer:');
  console.log('   https://shannon-explorer.somnia.network/address/' + contracts.BitredictPoolCore);
  console.log('   https://shannon-explorer.somnia.network/address/' + contracts.Oddyssey);
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

