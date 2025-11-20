const { ethers } = require('ethers');
const config = require('../config');

async function deployReputationSystem() {
  console.log('🚀 Deploying ReputationSystem contract...\n');

  try {
    // Connect to the blockchain
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY, provider);

    console.log(`📍 Deploying from: ${wallet.address}`);
    console.log(`🌐 Network: ${config.blockchain.rpcUrl}`);

    // Check balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Deployer balance: ${ethers.formatEther(balance)} STT\n`);

    if (balance < ethers.parseEther('1')) {
      throw new Error('Insufficient balance for deployment (need at least 1 STT)');
    }

    // Load contract artifacts
    const ReputationSystemArtifact = require('../../solidity/artifacts/contracts/ReputationSystem.sol/ReputationSystem.json');
    
    // Create contract factory
    const ReputationSystemFactory = new ethers.ContractFactory(
      ReputationSystemArtifact.abi,
      ReputationSystemArtifact.bytecode,
      wallet
    );

    // Estimate gas
    console.log('⛽ Estimating gas...');
    const gasEstimate = await ReputationSystemFactory.getDeployTransaction().then(tx => 
      provider.estimateGas(tx)
    );
    console.log(`📊 Estimated gas: ${gasEstimate.toString()}`);

    // Deploy contract (ReputationSystem constructor takes no parameters)
    console.log('🚀 Deploying ReputationSystem...');
    const reputationSystem = await ReputationSystemFactory.deploy({
      gasLimit: gasEstimate + BigInt(100000) // Add buffer
    });

    console.log(`📄 Contract deployed at: ${reputationSystem.target}`);
    console.log(`🔗 Transaction hash: ${reputationSystem.deploymentTransaction().hash}`);

    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...');
    await reputationSystem.waitForDeployment();
    
    const receipt = await reputationSystem.deploymentTransaction().wait();
    console.log(`✅ Contract confirmed in block: ${receipt.blockNumber}`);
    console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}\n`);

    // Verify deployment
    console.log('🔍 Verifying deployment...');
    const deployedCode = await provider.getCode(reputationSystem.target);
    if (deployedCode === '0x') {
      throw new Error('Contract deployment failed - no code at address');
    }

    // Test basic functionality
    console.log('🧪 Testing basic functionality...');
    const defaultReputation = await reputationSystem.DEFAULT_REPUTATION();
    const maxReputation = await reputationSystem.MAX_REPUTATION();
    const minGuidedReputation = await reputationSystem.MIN_GUIDED_POOL_REPUTATION();
    const minOpenReputation = await reputationSystem.MIN_OPEN_POOL_REPUTATION();

    console.log(`📊 Default reputation: ${defaultReputation}`);
    console.log(`📊 Max reputation: ${maxReputation}`);
    console.log(`📊 Min guided pool reputation: ${minGuidedReputation}`);
    console.log(`📊 Min open pool reputation: ${minOpenReputation}`);

    // Test user reputation (should return default for new user)
    const testUserReputation = await reputationSystem.getUserReputation(wallet.address);
    console.log(`📊 Deployer reputation: ${testUserReputation}`);

    // Authorize the deployer as an updater
    console.log('\n🔐 Setting up authorized updater...');
    const authTx = await reputationSystem.setAuthorizedUpdater(wallet.address, true);
    await authTx.wait();
    console.log(`✅ Authorized ${wallet.address} as reputation updater`);

    // Test authorization
    const isAuthorized = await reputationSystem.authorizedUpdaters(wallet.address);
    console.log(`🔐 Authorization confirmed: ${isAuthorized}`);

    console.log('\n🎉 ReputationSystem deployment completed successfully!');
    console.log('\n📋 Next Steps:');
    console.log('1. Update config.js with the contract address:');
    console.log(`   reputationSystem: "${reputationSystem.target}"`);
    console.log('2. Update PoolCore contract to use ReputationSystem');
    console.log('3. Update OptimisticOracle contract to use ReputationSystem');
    console.log('4. Start the reputation sync service');
    console.log('5. Authorize backend indexer as reputation updater');

    return {
      address: reputationSystem.target,
      transactionHash: reputationSystem.deploymentTransaction().hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString()
    };

  } catch (error) {
    console.error('❌ Deployment failed:', error);
    throw error;
  }
}

// Run deployment
if (require.main === module) {
  deployReputationSystem()
    .then((result) => {
      console.log('\n✅ Deployment result:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Deployment error:', error);
      process.exit(1);
    });
}

module.exports = { deployReputationSystem };
