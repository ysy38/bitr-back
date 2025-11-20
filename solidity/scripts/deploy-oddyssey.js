require('dotenv').config();
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

/**
 * Deployment script for Oddyssey.sol contract
 * Deploys to Somnia network with proper configuration
 */

async function main() {
  console.log("🚀 Starting Oddyssey.sol deployment...\n");

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

  console.log("Deploying with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  if (balance === 0n) {
    console.error("❌ Deployer account has no balance. Please fund the account first.");
    process.exit(1);
  }

  try {
    // Load existing deployed addresses to get ReputationSystem address
    const deployedAddressesPath = path.join(__dirname, '../deployed-addresses.json');
    let existingAddresses = {};
    
    if (fs.existsSync(deployedAddressesPath)) {
      existingAddresses = JSON.parse(fs.readFileSync(deployedAddressesPath, 'utf8'));
      console.log("📋 Found existing deployed contracts");
      console.log("   ReputationSystem:", existingAddresses.contracts?.ReputationSystem || "NOT FOUND");
    }

    // Deploy Oddyssey contract
    console.log("📝 Deploying Oddyssey.sol...");
    
    const OddysseyFactory = await hre.ethers.getContractFactory("Oddyssey");
    const oddysseyContract = OddysseyFactory.connect(deployer);
    
    // Constructor parameters: devWallet, initialEntryFee
    const devWallet = deployer.address; // Use deployer as dev wallet
    const initialEntryFee = hre.ethers.parseEther("0.5"); // 0.5 STT
    
    console.log("   Constructor params:");
    console.log("   - devWallet:", devWallet);
    console.log("   - initialEntryFee:", hre.ethers.formatEther(initialEntryFee), "STT");
    
    const oddyssey = await oddysseyContract.deploy(devWallet, initialEntryFee);
    await oddyssey.waitForDeployment();
    
    const oddysseyAddress = await oddyssey.getAddress();
    const deploymentTx = await oddyssey.deploymentTransaction().wait();
    
    console.log(`✅ Oddyssey deployed to: ${oddysseyAddress}`);
    console.log(`   Gas used: ${deploymentTx.gasUsed.toString()}`);
    console.log(`   Transaction hash: ${deploymentTx.hash}\n`);

    // Configure ReputationSystem if available
    if (existingAddresses.contracts?.ReputationSystem) {
      console.log("🔗 Configuring ReputationSystem...");
      try {
        await oddyssey.setReputationSystem(existingAddresses.contracts.ReputationSystem);
        console.log("✅ ReputationSystem configured in Oddyssey");
        
        // Also authorize Oddyssey in ReputationSystem
        const ReputationSystemFactory = await hre.ethers.getContractFactory("ReputationSystem");
        const reputationSystem = ReputationSystemFactory.connect(deployer).attach(existingAddresses.contracts.ReputationSystem);
        await reputationSystem.setAuthorizedContract(oddysseyAddress, true);
        console.log("✅ Oddyssey authorized in ReputationSystem");
      } catch (error) {
        console.log("⚠️  Could not configure ReputationSystem:", error.message);
      }
    } else {
      console.log("⚠️  ReputationSystem not found in existing deployments - skipping configuration");
    }

    // Update deployed addresses
    console.log("\n📝 Updating deployment information...");
    
    const updatedAddresses = {
      ...existingAddresses,
      contracts: {
        ...existingAddresses.contracts,
        Oddyssey: oddysseyAddress
      },
      lastUpdated: new Date().toISOString(),
      oddysseyDeployment: {
        address: oddysseyAddress,
        transactionHash: deploymentTx.hash,
        gasUsed: deploymentTx.gasUsed.toString(),
        blockNumber: deploymentTx.blockNumber,
        timestamp: new Date().toISOString()
      }
    };

    // Save updated addresses
    fs.writeFileSync(deployedAddressesPath, JSON.stringify(updatedAddresses, null, 2));
    console.log(`✅ Updated deployment info: ${deployedAddressesPath}`);

    // Save contract addresses for backend
    const backendConfigPath = path.join(__dirname, '../../backend/contract-addresses.json');
    fs.writeFileSync(backendConfigPath, JSON.stringify(updatedAddresses.contracts, null, 2));
    console.log(`✅ Contract addresses saved for backend: ${backendConfigPath}`);

    // Copy ABI to backend
    console.log("\n📁 Copying ABI to backend...");
    
    const artifactsDir = path.join(__dirname, '../artifacts/contracts');
    const backendSolidityDir = path.join(__dirname, '../../backend/solidity');
    const backendAbiDir = path.join(__dirname, '../../backend/abis');

    // Ensure backend directories exist
    if (!fs.existsSync(backendSolidityDir)) {
      fs.mkdirSync(backendSolidityDir, { recursive: true });
    }
    if (!fs.existsSync(backendAbiDir)) {
      fs.mkdirSync(backendAbiDir, { recursive: true });
    }

    // Copy Oddyssey ABI
    const oddysseyArtifactPath = path.join(artifactsDir, 'Oddyssey.sol/Oddyssey.json');
    
    if (fs.existsSync(oddysseyArtifactPath)) {
      const artifact = JSON.parse(fs.readFileSync(oddysseyArtifactPath, 'utf8'));
      
      // Copy full artifact to backend/solidity
      fs.writeFileSync(
        path.join(backendSolidityDir, 'Oddyssey.json'),
        JSON.stringify(artifact, null, 2)
      );
      
      // Copy just ABI to backend/abis
      fs.writeFileSync(
        path.join(backendAbiDir, 'Oddyssey.json'),
        JSON.stringify(artifact.abi, null, 2)
      );
      
      console.log(`✅ Copied Oddyssey ABI to backend/solidity/`);
      console.log(`✅ Copied Oddyssey ABI to backend/abis/`);
    } else {
      console.log(`⚠️  Oddyssey artifact not found at: ${oddysseyArtifactPath}`);
    }

    // Update backend config.js
    console.log("\n🔧 Updating backend config.js...");
    
    const configPath = path.join(__dirname, '../../backend/config.js');
    if (fs.existsSync(configPath)) {
      let configContent = fs.readFileSync(configPath, 'utf8');
      
      // Update Oddyssey address in config
      const oddysseyRegex = /ODDYSSEY_CONTRACT_ADDRESS:\s*['"][^'"]*['"]/;
      const newOddysseyLine = `ODDYSSEY_CONTRACT_ADDRESS: '${oddysseyAddress}'`;
      
      if (oddysseyRegex.test(configContent)) {
        configContent = configContent.replace(oddysseyRegex, newOddysseyLine);
        console.log("✅ Updated ODDYSSEY_CONTRACT_ADDRESS in config.js");
      } else {
        // Add if not found
        configContent += `\n\n// Oddyssey Contract Address\nODDYSSEY_CONTRACT_ADDRESS: '${oddysseyAddress}',\n`;
        console.log("✅ Added ODDYSSEY_CONTRACT_ADDRESS to config.js");
      }
      
      fs.writeFileSync(configPath, configContent);
      console.log(`✅ Updated config.js: ${configPath}`);
    } else {
      console.log(`⚠️  config.js not found at: ${configPath}`);
    }

    // Generate .env updates
    console.log("\n📝 Generating environment updates...");
    
    const envUpdates = `
# Oddyssey Contract Address - ${new Date().toISOString()}
ODDYSSEY_CONTRACT_ADDRESS=${oddysseyAddress}
ODDYSSEY_DEPLOYMENT_TX=${deploymentTx.hash}
ODDYSSEY_BLOCK_NUMBER=${deploymentTx.blockNumber}
`;

    const envUpdatePath = path.join(__dirname, '../../backend/.env.oddyssey');
    fs.writeFileSync(envUpdatePath, envUpdates);
    console.log(`✅ Environment updates saved to: ${envUpdatePath}`);
    console.log("📝 Please merge these into your main .env file\n");

    // Final summary
    console.log("=== ODDYSSEY DEPLOYMENT SUMMARY ===\n");
    console.log("🎉 Oddyssey.sol deployed successfully!\n");
    
    console.log("📋 Contract Details:");
    console.log(`   Address: ${oddysseyAddress}`);
    console.log(`   Transaction: ${deploymentTx.hash}`);
    console.log(`   Block Number: ${deploymentTx.blockNumber}`);
    console.log(`   Gas Used: ${deploymentTx.gasUsed.toString()}`);
    console.log(`   Dev Wallet: ${devWallet}`);
    console.log(`   Entry Fee: ${hre.ethers.formatEther(initialEntryFee)} STT`);

    console.log("\n🔗 Configuration:");
    if (existingAddresses.contracts?.ReputationSystem) {
      console.log("   ✅ ReputationSystem configured");
      console.log("   ✅ Oddyssey authorized in ReputationSystem");
    } else {
      console.log("   ⚠️  ReputationSystem not configured (not found)");
    }

    console.log("\n📁 Files Updated:");
    console.log("   ✅ deployed-addresses.json");
    console.log("   ✅ backend/contract-addresses.json");
    console.log("   ✅ backend/solidity/Oddyssey.json");
    console.log("   ✅ backend/abis/Oddyssey.json");
    console.log("   ✅ backend/config.js");
    console.log("   ✅ backend/.env.oddyssey");

    console.log("\n🚀 Oddyssey contract is ready for use!");
    console.log(`🔗 View on explorer: https://shannon-explorer.somnia.network/address/${oddysseyAddress}`);

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
