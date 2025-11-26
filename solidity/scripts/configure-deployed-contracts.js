const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

/**
 * Configuration script to finish contract setup
 * Run this after deployment to configure relationships
 */

async function main() {
  console.log("🔗 Configuring deployed contracts...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Configuring with account:", deployer.address);

  // Contract addresses from the deployment
  const contractAddresses = {
    BitredictToken: "0x05eEb2a6c2302A80136C47bAD869FFEf6a7C8ae6",
    ReputationSystem: "0xfeCC1291Bbc2af70b7a5beEF2fB0cfD913584Db6",
    GuidedOracle: "0x63c88BD02E4531452B425954124f9BB28edc3bA6",
    OptimisticOracle: "0x7c09e661D87565bBe6a892EF3710DBc08BdE77D4",
    BitredictPoolCore: "0xE57F5662Be9E0195F58d2Ba87b8D55b4890D4391",
    BitredictBoostSystem: "0x3070d17cAC61Cef60ed7e2BaA08DC9fAa83ED51D",
    BitredictComboPools: "0x45fe584a4d8b39c2A3c6B915C05322614F9EB6A7",
    BitredictPoolFactory: "0xa81F12B8D23844433B1F785BE1507CCFBf125C78",
    BitredictStaking: "0x679c0C88592DdE9d26bE47e4Af077161F1C545f1",
    Oddyssey: "0xB528Ff6eBB0bF257EC1614EB94555e9f6a43A39C",
    BitrFaucet: "0x554D1B181fC33b13904376E5aC0f3a6E77d3EbCD"
  };

  // Get contract instances
  const bitrToken = await hre.ethers.getContractAt("BitredictToken", contractAddresses.BitredictToken);
  const reputationSystem = await hre.ethers.getContractAt("ReputationSystem", contractAddresses.ReputationSystem);
  const poolCore = await hre.ethers.getContractAt("BitredictPoolCore", contractAddresses.BitredictPoolCore);
  const oddyssey = await hre.ethers.getContractAt("Oddyssey", contractAddresses.Oddyssey);

  try {
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

    // Transfer tokens to faucet
    console.log("💰 Transferring 20M BITR tokens to faucet...");
    const faucetAmount = hre.ethers.parseEther("20000000"); // 20M tokens
    await bitrToken.transfer(contractAddresses.BitrFaucet, faucetAmount);
    console.log("✅ Faucet funded with 20M BITR tokens");

    console.log("\n✅ Configuration completed successfully!");

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
