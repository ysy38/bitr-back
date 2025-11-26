const { ethers } = require("hardhat");

async function main() {
  console.log("🔧 Configuring Bitredict Contracts");
  
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  
  // Set gas price to 6 gwei for cost optimization
  const gasPrice = ethers.parseUnits("6", "gwei");
  console.log("⛽ Using gas price: 6 gwei");

  // Contract addresses from deployment
  const addresses = {
    bitrToken: "0x67aa1549551ff4479B68F1eC19fD011571C7db10",
    reputationSystem: "0xbB966Dd2696005c9e893304819237Ea4006A9380",
    guidedOracle: "0x9CFB1097577480BD0eDe1795018c89786c541097",
    poolCore: "0x08C5da3b3D1eB4c4dd9D2fE50f63096e1AD3a800",
    boostSystem: "0x36fddb1844B89D4c0A00497A1C6B56B958bCcFB6",
    comboPools: "0x9320ddf7CA7A2826DA3d557BD6A6661Ec7df13c0",
    optimisticOracle: "0xa43e982eA27CD4B34E72E1B65A83E21A9eC777DC",
    staking: "0xBA03cD2F1c150416C8d9cDf31778157B74010513",
    oddyssey: "0xfe20e7dAcff3Ca602ba27fCE3052a505278E489b",
    faucet: "0xd8f4A301B14Ce0619373b472C5e24c0A14a82c55"
  };

  try {
    // Get contract instances
    const bitrToken = await ethers.getContractAt("BitredictToken", addresses.bitrToken);
    const poolCore = await ethers.getContractAt("BitredictPoolCore", addresses.poolCore);
    const reputationSystem = await ethers.getContractAt("ReputationSystem", addresses.reputationSystem);
    const optimisticOracle = await ethers.getContractAt("OptimisticOracle", addresses.optimisticOracle);
    const oddyssey = await ethers.getContractAt("Oddyssey", addresses.oddyssey);
    
    console.log("\n🔧 Step 1: Configuring PoolCore...");
    
    // Configure PoolCore with BoostSystem
    await poolCore.setBoostSystem(addresses.boostSystem, { gasPrice: gasPrice });
    console.log("✅ PoolCore connected to BoostSystem");

    console.log("\n🔧 Step 2: Configuring ReputationSystem...");
    
    // Authorize contracts in ReputationSystem
    await reputationSystem.setAuthorizedContract(addresses.poolCore, true, { gasPrice: gasPrice });
    console.log("✅ PoolCore authorized in ReputationSystem");
    
    await reputationSystem.setAuthorizedContract(addresses.comboPools, true, { gasPrice: gasPrice });
    console.log("✅ ComboPools authorized in ReputationSystem");
    
    await reputationSystem.setAuthorizedContract(addresses.oddyssey, true, { gasPrice: gasPrice });
    console.log("✅ Oddyssey authorized in ReputationSystem");

    // Authorize deployer as reputation updater
    await reputationSystem.setAuthorizedUpdater(deployerAddress, true, { gasPrice: gasPrice });
    console.log("✅ Deployer authorized as reputation updater");

    console.log("\n🔧 Step 3: Configuring OptimisticOracle...");
    
    // Configure OptimisticOracle with ReputationSystem
    await optimisticOracle.setReputationSystem(addresses.reputationSystem, { gasPrice: gasPrice });
    console.log("✅ OptimisticOracle connected to ReputationSystem");

    console.log("\n🔧 Step 4: Funding Faucet...");
    
    // Fund Faucet with BITR tokens
    const faucetAmount = ethers.parseEther("20000000"); // 20M BITR for faucet
    await bitrToken.transfer(addresses.faucet, faucetAmount, { gasPrice: gasPrice });
    console.log("✅ Funded faucet with", ethers.formatEther(faucetAmount), "BITR");

    // Verify faucet balance
    const faucetBalance = await bitrToken.balanceOf(addresses.faucet);
    console.log("💰 Faucet balance:", ethers.formatEther(faucetBalance), "BITR");

    console.log("\n🎉 CONFIGURATION COMPLETE!");
    console.log("=====================================");
    console.log("📋 Final Contract Addresses:");
    console.log("BitrToken:", addresses.bitrToken);
    console.log("ReputationSystem:", addresses.reputationSystem);
    console.log("GuidedOracle:", addresses.guidedOracle);
    console.log("BitredictPoolCore:", addresses.poolCore);
    console.log("BitredictBoostSystem:", addresses.boostSystem);
    console.log("BitredictComboPools:", addresses.comboPools);
    console.log("OptimisticOracle:", addresses.optimisticOracle);
    console.log("BitredictStaking:", addresses.staking);
    console.log("Oddyssey:", addresses.oddyssey);
    console.log("BitrFaucet:", addresses.faucet);
    console.log("=====================================");
    
    // Save addresses to file
    const fs = require('fs');
    fs.writeFileSync('deployed-addresses.json', JSON.stringify(addresses, null, 2));
    console.log("💾 Addresses saved to deployed-addresses.json");

  } catch (error) {
    console.error("❌ Configuration failed:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
