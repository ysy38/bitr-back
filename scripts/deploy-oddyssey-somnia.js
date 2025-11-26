const { ethers } = require('hardhat');
require('dotenv').config();

async function main() {
  console.log('🚀 Starting Oddyssey deployment to Somnia testnet...');

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log('📋 Deploying contracts with account:', deployer.address);
  console.log('💰 Account balance:', ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // Check environment variables
  const requiredEnvVars = [
    'PRIVATE_KEY',
    'DEV_WALLET'
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  const devWallet = process.env.DEV_WALLET;
  const initialEntryFee = ethers.parseEther('0.5'); // Fixed at 0.5 STT

  console.log('🔧 Deployment parameters:');
  console.log('   Dev Wallet:', devWallet);
  console.log('   Initial Entry Fee:', ethers.formatEther(initialEntryFee), 'STT');

  // Validate dev wallet address
  if (!ethers.isAddress(devWallet)) {
    throw new Error('Invalid dev wallet address');
  }

  // Deploy Oddyssey contract
  console.log('\n📦 Deploying Oddyssey contract...');
  const Oddyssey = await ethers.getContractFactory('Oddyssey');
  
  const oddyssey = await Oddyssey.deploy(devWallet, initialEntryFee);
  await oddyssey.waitForDeployment();

  const oddysseyAddress = await oddyssey.getAddress();
  console.log('✅ Oddyssey deployed to:', oddysseyAddress);

  // Verify deployment
  console.log('\n🔍 Verifying deployment...');
  
  // Check contract state
  const deployedOracle = await oddyssey.oracle();
  const deployedDevWallet = await oddyssey.devWallet();
  const deployedEntryFee = await oddyssey.entryFee();
  const deployedDailyCycleId = await oddyssey.dailyCycleId();

  console.log('📊 Contract state verification:');
  console.log('   Oracle:', deployedOracle);
  console.log('   Dev Wallet:', deployedDevWallet);
  console.log('   Entry Fee:', ethers.formatEther(deployedEntryFee), 'STT');
  console.log('   Daily Cycle ID:', deployedDailyCycleId.toString());

  // Verify values match expected
  if (deployedOracle !== deployer.address) {
    throw new Error('Oracle address mismatch');
  }
  if (deployedDevWallet !== devWallet) {
    throw new Error('Dev wallet address mismatch');
  }
  if (deployedEntryFee !== initialEntryFee) {
    throw new Error('Entry fee mismatch');
  }
  if (deployedDailyCycleId !== 0n) {
    throw new Error('Initial cycle ID should be 0');
  }

  console.log('✅ All contract values verified correctly');

  // Get deployment info
  const deploymentTx = oddyssey.deploymentTransaction();
  const deploymentReceipt = await deploymentTx.wait();
  
  console.log('\n📋 Deployment Information:');
  console.log('   Contract Address:', oddysseyAddress);
  console.log('   Transaction Hash:', deploymentTx.hash);
  console.log('   Block Number:', deploymentReceipt.blockNumber);
  console.log('   Gas Used:', deploymentReceipt.gasUsed.toString());
  console.log('   Network:', (await ethers.provider.getNetwork()).name);

  // Save deployment info to file
  const deploymentInfo = {
    contractName: 'Oddyssey',
    contractAddress: oddysseyAddress,
    transactionHash: deploymentTx.hash,
    blockNumber: deploymentReceipt.blockNumber,
    gasUsed: deploymentReceipt.gasUsed.toString(),
    network: (await ethers.provider.getNetwork()).name,
    deployer: deployer.address,
    devWallet: devWallet,
    initialEntryFee: ethers.formatEther(initialEntryFee),
    deploymentTime: new Date().toISOString(),
    constructorArgs: [devWallet, initialEntryFee.toString()]
  };

  const fs = require('fs');
  const deploymentPath = './deployments/oddyssey-somnia.json';
  
  // Create deployments directory if it doesn't exist
  if (!fs.existsSync('./deployments')) {
    fs.mkdirSync('./deployments', { recursive: true });
  }

  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log('💾 Deployment info saved to:', deploymentPath);

  // Create environment file template
  const envTemplate = `# Oddyssey Contract Configuration
ODDYSSEY_ADDRESS=${oddysseyAddress}
ODDYSSEY_DEPLOYER=${deployer.address}
ODDYSSEY_DEV_WALLET=${devWallet}
ODDYSSEY_INITIAL_ENTRY_FEE=${ethers.formatEther(initialEntryFee)}

# Network Configuration
NETWORK=somnia-testnet
RPC_URL=${process.env.RPC_URL || 'https://testnet.somnia.zone'}

# Deployment Info
DEPLOYMENT_TX_HASH=${deploymentTx.hash}
DEPLOYMENT_BLOCK=${deploymentReceipt.blockNumber}
DEPLOYMENT_TIME=${new Date().toISOString()}
`;

  const envPath = './deployments/oddyssey-somnia.env';
  fs.writeFileSync(envPath, envTemplate);
  console.log('💾 Environment template saved to:', envPath);

  // Instructions for next steps
  console.log('\n🎯 Next Steps:');
  console.log('1. Update your .env file with the new contract address');
  console.log('2. Run the database cleanup script: psql -f cleanup_oddyssey_database.sql');
  console.log('3. Test the contract with a simple cycle creation');
  console.log('4. Update backend services to use the new contract');
  console.log('5. Monitor the contract for any issues');

  console.log('\n✅ Oddyssey deployment to Somnia testnet completed successfully!');
  console.log('📍 Contract Address:', oddysseyAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
