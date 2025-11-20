const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('🔍 Verifying remaining contracts on Somnia Testnet Explorer...\n');

  // Load deployment info
  const deploymentPath = path.join(__dirname, '../deployed-addresses.json');
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const contracts = deployment.contracts;

  // Get deployer address
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = deployer.address;

  const contractsToVerify = [
    {
      name: 'BitredictComboPools',
      address: contracts.BitredictComboPools,
      constructorArgs: [
        contracts.BitredictToken,     // _bitrToken
        deployerAddress,              // _feeCollector
        contracts.BitredictPoolCore   // _poolCore
      ]
    },
    {
      name: 'BitredictPoolFactory',
      address: contracts.BitredictPoolFactory,
      constructorArgs: [
        contracts.BitredictPoolCore,  // _poolCore
        contracts.BitredictComboPools, // _comboPools
        contracts.BitredictBoostSystem, // _boostSystem
        contracts.BitredictToken      // _bitrToken
      ]
    },
    {
      name: 'BitredictStaking',
      address: contracts.BitredictStaking,
      constructorArgs: [
        contracts.BitredictToken      // _bitr
      ]
    },
    {
      name: 'BitrFaucet',
      address: contracts.BitrFaucet,
      constructorArgs: [
        contracts.BitredictToken,     // _bitrToken
        contracts.Oddyssey            // _oddyssey
      ]
    }
  ];

  const results = { verified: [], failed: [], alreadyVerified: [] };

  for (const contract of contractsToVerify) {
    console.log(`🔄 Verifying ${contract.name} at ${contract.address}...`);
    
    try {
      await hre.run("verify:verify", {
        address: contract.address,
        constructorArguments: contract.constructorArgs,
      });
      
      console.log(`✅ ${contract.name} verified successfully!\n`);
      results.verified.push(contract.name);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      if (error.message.includes("Already Verified") || error.message.includes("already verified")) {
        console.log(`ℹ️  ${contract.name} is already verified\n`);
        results.alreadyVerified.push(contract.name);
      } else {
        console.error(`❌ Failed to verify ${contract.name}:`, error.message, '\n');
        results.failed.push({ name: contract.name, error: error.message });
      }
    }
  }

  // Print summary
  console.log('='.repeat(80));
  console.log('📊 VERIFICATION SUMMARY (Remaining Contracts)');
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
      console.log(`   • ${item.name}`);
      console.log(`     ${item.error.substring(0, 150)}`);
    });
  }

  const totalSuccess = results.verified.length + results.alreadyVerified.length;
  console.log(`\n📈 Remaining: ${totalSuccess}/${contractsToVerify.length} contracts verified`);
  console.log(`\n🎉 Total Verified on Somnia: ${7 + totalSuccess}/11 contracts\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

