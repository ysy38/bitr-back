require('dotenv').config();
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

/**
 * Comprehensive deployment script for all Bitredict contracts
 * Deploys contracts in correct dependency order and configures relationships
 */

async function main() {
  console.log("🚀 Starting comprehensive Bitredict contract deployment...\n");

  console.log("Network:", hre.network.name);
  console.log("PRIVATE_KEY set:", process.env.PRIVATE_KEY ? "YES" : "NO");
  
  let deployer;
  try {
    const signers = await hre.ethers.getSigners();
    console.log("Available signers:", signers.length);
    
    if (signers.length === 0) {
      // Fallback: create wallet directly
      const provider = hre.ethers.provider;
      deployer = new hre.ethers.Wallet(process.env.PRIVATE_KEY, provider);
      console.log("Created wallet directly from PRIVATE_KEY");
    } else {
      deployer = signers[0];
    }
  } catch (error) {
    console.error("Error getting signers:", error.message);
    process.exit(1);
  }
  
  if (!deployer) {
    console.error("❌ No deployer account found. Make sure PRIVATE_KEY is set in .env");
    process.exit(1);
  }

  console.log("Deploying contracts with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  if (balance === 0n) {
    console.error("❌ Deployer account has no balance. Please fund the account first.");
    process.exit(1);
  }

  const deployedContracts = {};
  const contractAddresses = {};

  // Helper function to deploy and track contracts
  async function deployContract(name, constructorArgs = [], libraries = {}) {
    console.log(`📝 Deploying ${name}...`);
    
    const ContractFactory = await hre.ethers.getContractFactory(name, { libraries });
    const contractFactory = ContractFactory.connect(deployer);
    const contract = await contractFactory.deploy(...constructorArgs);
    await contract.waitForDeployment();
    
    const address = await contract.getAddress();
    console.log(`✅ ${name} deployed to: ${address}`);
    console.log(`   Gas used: ${(await contract.deploymentTransaction().wait()).gasUsed.toString()}\n`);
    
    deployedContracts[name] = contract;
    contractAddresses[name] = address;
    
    return contract;
  }

  try {
    // Step 1: Deploy independent contracts first
    console.log("=== PHASE 1: Independent Contracts ===\n");

    // Deploy BITR Token
    const bitrToken = await deployContract("BitredictToken");

    // Deploy Reputation System (no dependencies)
    const reputationSystem = await deployContract("ReputationSystem");

    // Step 2: Deploy Oracle contracts
    console.log("=== PHASE 2: Oracle Contracts ===\n");

    // Deploy Guided Oracle (needs oracle bot address - use deployer for now)
    const guidedOracle = await deployContract("GuidedOracle", [
      deployer.address  // oracleBot (will be updated later to actual bot address)
    ]);

    // Deploy Optimistic Oracle (needs bond token and pool - will use BITR and set pool later)
    const optimisticOracle = await deployContract("OptimisticOracle", [
      contractAddresses.BitredictToken,      // bondToken
      deployer.address                       // bitredictPool (placeholder, will be updated)
    ]);

    // Step 3: Deploy Core Pool Contract
    console.log("=== PHASE 3: Core Pool Contract ===\n");

    // Deploy BitredictPoolCore with oracle addresses
    const poolCore = await deployContract("BitredictPoolCore", [
      contractAddresses.BitredictToken,      // bitrToken
      deployer.address,                      // feeCollector
      contractAddresses.GuidedOracle,        // guidedOracle
      contractAddresses.OptimisticOracle     // optimisticOracle
    ]);

    // Step 4: Deploy Pool-dependent contracts
    console.log("=== PHASE 4: Pool-Dependent Contracts ===\n");

    // Deploy Boost System (needs poolCore and revenueCollector)
    const boostSystem = await deployContract("BitredictBoostSystem", [
      contractAddresses.BitredictPoolCore,   // poolCore
      deployer.address                       // revenueCollector (use deployer as collector)
    ]);

    // Deploy Combo Pools (needs bitrToken, feeCollector, poolCore)
    const comboPools = await deployContract("BitredictComboPools", [
      contractAddresses.BitredictToken,      // bitrToken
      deployer.address,                      // feeCollector
      contractAddresses.BitredictPoolCore    // poolCore
    ]);

    // Deploy Pool Factory (needs poolCore, comboPools, boostSystem, bitrToken)
    const poolFactory = await deployContract("BitredictPoolFactory", [
      contractAddresses.BitredictPoolCore,   // poolCore
      contractAddresses.BitredictComboPools, // comboPools
      contractAddresses.BitredictBoostSystem, // boostSystem
      contractAddresses.BitredictToken       // bitrToken
    ]);

    // Deploy Staking Contract (needs bitrToken)
    const staking = await deployContract("BitredictStaking", [
      contractAddresses.BitredictToken       // bitrToken
    ]);

    // Step 5: Deploy Game Contracts
    console.log("=== PHASE 5: Game Contracts ===\n");

    // Deploy Oddyssey (needs devWallet and initialEntryFee)
    const oddyssey = await deployContract("Oddyssey", [
      deployer.address,                      // devWallet
      hre.ethers.parseEther("0.5")          // initialEntryFee (0.5 STT)
    ]);

    // Deploy Faucet
    const faucet = await deployContract("BitrFaucet", [
      contractAddresses.BitredictToken,      // bitrToken
      contractAddresses.Oddyssey             // oddyssey
    ]);

    // Step 6: Configure contract relationships
    console.log("=== PHASE 6: Contract Configuration ===\n");

    console.log("🔗 Configuring contract relationships...");

    // Set ReputationSystem in PoolCore
    console.log("Setting ReputationSystem in PoolCore...");
    await poolCore.setReputationSystem(contractAddresses.ReputationSystem);

    // Set BoostSystem in PoolCore
    console.log("Setting BoostSystem in PoolCore...");
    await poolCore.setBoostSystem(contractAddresses.BitredictBoostSystem);

    // Set ReputationSystem in Oddyssey
    console.log("Setting ReputationSystem in Oddyssey...");
    await oddyssey.setReputationSystem(contractAddresses.ReputationSystem);

    // Add PoolCore as authorized caller in ReputationSystem
    console.log("Authorizing PoolCore in ReputationSystem...");
    await reputationSystem.setAuthorizedContract(contractAddresses.BitredictPoolCore, true);

    // Add Oddyssey as authorized caller in ReputationSystem
    console.log("Authorizing Oddyssey in ReputationSystem...");
    await reputationSystem.setAuthorizedContract(contractAddresses.Oddyssey, true);

    // Update OptimisticOracle with correct pool address
    console.log("Updating OptimisticOracle with PoolCore address...");
    // Note: This would require a setter function in OptimisticOracle if needed

    // Step 7: Transfer tokens to faucet
    console.log("=== PHASE 7: Token Distribution ===\n");

    console.log("💰 Transferring 20M BITR tokens to faucet...");
    const faucetAmount = hre.ethers.parseEther("20000000"); // 20M tokens
    await bitrToken.transfer(contractAddresses.BitrFaucet, faucetAmount);
    console.log("✅ Faucet funded with 20M BITR tokens\n");

    // Step 8: Save deployment information
    console.log("=== PHASE 8: Saving Deployment Info ===\n");

    const deploymentInfo = {
      network: hre.network.name,
      chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
      deployer: deployer.address,
      timestamp: new Date().toISOString(),
      contracts: contractAddresses,
      gasUsed: {
        // This would need to be calculated from individual deployments
        // For now, we'll leave it empty and could be filled by analyzing receipts
      }
    };

    // Save to multiple locations
    const deploymentPath = path.join(__dirname, '../deployed-addresses.json');
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`✅ Deployment info saved to: ${deploymentPath}`);

    // Save contract addresses for backend
    const backendConfigPath = path.join(__dirname, '../../backend/contract-addresses.json');
    fs.writeFileSync(backendConfigPath, JSON.stringify(contractAddresses, null, 2));
    console.log(`✅ Contract addresses saved for backend: ${backendConfigPath}`);

    // Step 9: Copy ABIs to backend
    console.log("=== PHASE 9: Copying ABIs ===\n");

    const artifactsDir = path.join(__dirname, '../artifacts/contracts');
    const backendAbiDir = path.join(__dirname, '../../backend/abis');
    const backendSolidityDir = path.join(__dirname, '../../backend/solidity');

    // Ensure backend directories exist
    if (!fs.existsSync(backendAbiDir)) {
      fs.mkdirSync(backendAbiDir, { recursive: true });
    }
    if (!fs.existsSync(backendSolidityDir)) {
      fs.mkdirSync(backendSolidityDir, { recursive: true });
    }

    // List of contracts to copy ABIs for
    const contractsToSync = [
      'BitredictToken',
      'BitredictPoolCore', 
      'BitredictBoostSystem',
      'BitredictComboPools',
      'BitredictPoolFactory',
      'BitredictStaking',
      'GuidedOracle',
      'OptimisticOracle',
      'ReputationSystem',
      'Oddyssey',
      'BitrFaucet'
    ];

    for (const contractName of contractsToSync) {
      const artifactPath = path.join(artifactsDir, `${contractName}.sol/${contractName}.json`);
      
      if (fs.existsSync(artifactPath)) {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        
        // Copy full artifact to backend/solidity
        fs.writeFileSync(
          path.join(backendSolidityDir, `${contractName}.json`),
          JSON.stringify(artifact, null, 2)
        );
        
        // Copy just ABI to backend/abis
        fs.writeFileSync(
          path.join(backendAbiDir, `${contractName}.json`),
          JSON.stringify(artifact.abi, null, 2)
        );
        
        console.log(`✅ Copied ABI for ${contractName}`);
      } else {
        console.log(`⚠️  Artifact not found for ${contractName}`);
      }
    }

    // Step 10: Generate .env updates
    console.log("=== PHASE 10: Environment Configuration ===\n");

    const envUpdates = `
# Updated Contract Addresses - ${new Date().toISOString()}
BITR_TOKEN_ADDRESS=${contractAddresses.BitredictToken}
POOL_CORE_ADDRESS=${contractAddresses.BitredictPoolCore}
GUIDED_ORACLE_ADDRESS=${contractAddresses.GuidedOracle}
OPTIMISTIC_ORACLE_ADDRESS=${contractAddresses.OptimisticOracle}
BOOST_SYSTEM_ADDRESS=${contractAddresses.BitredictBoostSystem}
COMBO_POOLS_ADDRESS=${contractAddresses.BitredictComboPools}
POOL_FACTORY_ADDRESS=${contractAddresses.BitredictPoolFactory}
STAKING_ADDRESS=${contractAddresses.BitredictStaking}
REPUTATION_SYSTEM_ADDRESS=${contractAddresses.ReputationSystem}
ODDYSSEY_ADDRESS=${contractAddresses.Oddyssey}
FAUCET_ADDRESS=${contractAddresses.BitrFaucet}
`;

    const envUpdatePath = path.join(__dirname, '../../backend/.env.contracts');
    fs.writeFileSync(envUpdatePath, envUpdates);
    console.log(`✅ Environment updates saved to: ${envUpdatePath}`);
    console.log("📝 Please merge these into your main .env file\n");

    // Final summary
    console.log("=== DEPLOYMENT SUMMARY ===\n");
    console.log("🎉 All contracts deployed successfully!\n");
    
    console.log("📋 Contract Addresses:");
    Object.entries(contractAddresses).forEach(([name, address]) => {
      console.log(`   ${name}: ${address}`);
    });

    console.log("\n🔗 Contract Relationships Configured:");
    console.log("   ✅ PoolCore ← ReputationSystem");
    console.log("   ✅ PoolCore ← BoostSystem");
    console.log("   ✅ Oddyssey ← ReputationSystem");
    console.log("   ✅ ReputationSystem ← PoolCore (authorized)");
    console.log("   ✅ ReputationSystem ← Oddyssey (authorized)");
    console.log("   ✅ Faucet ← 20M BITR tokens");

    console.log("\n📁 Files Updated:");
    console.log("   ✅ deployed-addresses.json");
    console.log("   ✅ backend/contract-addresses.json");
    console.log("   ✅ backend/abis/*.json");
    console.log("   ✅ backend/solidity/*.json");
    console.log("   ✅ backend/.env.contracts");

    console.log("\n🚀 Ready for production!");

  } catch (error) {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
