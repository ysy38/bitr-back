const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('🔧 Updating Oracle Bot Address...\n');

  // Load deployment info
  const deploymentPath = path.join(__dirname, '../deployed-addresses.json');
  if (!fs.existsSync(deploymentPath)) {
    console.error('❌ No deployed-addresses.json found!');
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const guidedOracleAddress = deployment.contracts.GuidedOracle;
  const optimisticOracleAddress = deployment.contracts.OptimisticOracle;

  console.log(`GuidedOracle address: ${guidedOracleAddress}`);
  console.log(`OptimisticOracle address: ${optimisticOracleAddress}\n`);

  // Get the signer (contract owner)
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`Deployer balance: ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))} ETH\n`);

  // Backend wallet address (from backend .env)
  const backendWallet = '0x483fc7FD690dCf2a01318282559C389F385d4428';
  console.log(`Backend wallet (new oracle bot): ${backendWallet}\n`);

  // Load GuidedOracle contract
  const GuidedOracle = await hre.ethers.getContractFactory("GuidedOracle");
  const guidedOracle = GuidedOracle.attach(guidedOracleAddress);

  // Check current oracle bot
  const currentBot = await guidedOracle.oracleBot();
  console.log(`Current oracle bot: ${currentBot}`);

  if (currentBot.toLowerCase() === backendWallet.toLowerCase()) {
    console.log('✅ Oracle bot is already set to the backend wallet!');
  } else {
    console.log('🔄 Updating oracle bot to backend wallet...');
    
    try {
      const tx = await guidedOracle.updateOracleBot(backendWallet);
      console.log(`📝 Transaction hash: ${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
      console.log(`   Gas used: ${receipt.gasUsed.toString()}\n`);
      
      // Verify the update
      const newBot = await guidedOracle.oracleBot();
      console.log(`✅ Oracle bot updated to: ${newBot}`);
      
      if (newBot.toLowerCase() === backendWallet.toLowerCase()) {
        console.log('✅ VERIFICATION PASSED: Oracle bot is now the backend wallet!');
      } else {
        console.error('❌ VERIFICATION FAILED: Oracle bot mismatch!');
      }
    } catch (error) {
      console.error('❌ Failed to update oracle bot:', error.message);
      process.exit(1);
    }
  }

  console.log('\n🎉 Oracle bot configuration complete!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

