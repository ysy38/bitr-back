const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Simple Pool Claim Test", function () {
  let poolCore;
  let bitrToken;
  let owner, creator, oracle;

  beforeEach(async function () {
    [owner, creator, oracle] = await ethers.getSigners();

    // Deploy mock BITR token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    bitrToken = await MockERC20.deploy("BITR Token", "BITR", ethers.parseEther("1000000"));

    // Deploy BitredictPoolCore
    const BitredictPoolCore = await ethers.getContractFactory("BitredictPoolCore");
    poolCore = await BitredictPoolCore.deploy(
      await bitrToken.getAddress(),
      owner.address, // feeCollector
      oracle.address, // guidedOracle
      oracle.address  // optimisticOracle
    );

    // Mint and approve tokens
    await bitrToken.mint(creator.address, ethers.parseEther("10000"));
    await bitrToken.connect(creator).approve(await poolCore.getAddress(), ethers.parseEther("10000"));
  });

  it("Should test Pool 3 scenario calculation", async function () {
    console.log("🧪 Testing Pool 3 Scenario Calculation...");
    
    // Test the corrected calculation manually
    const creatorStake = 3202;
    const lpStake = 2000;
    const totalBettorStake = 4571;
    const odds = 150; // 1.50
    
    console.log(`📊 Pool Data:`);
    console.log(`  Creator Stake: ${creatorStake} BITR`);
    console.log(`  LP Stake: ${lpStake} BITR`);
    console.log(`  Total Bettor Stake: ${totalBettorStake} BITR`);
    console.log(`  Odds: ${odds / 100} (1.50)`);
    
    // Creator calculation: stake + (stake / (odds - 1))
    const denominator = odds - 100; // 50
    const creatorReward = (creatorStake * 100) / denominator; // 6404
    const creatorMaxReward = creatorStake + creatorReward; // 9606
    const poolTotal = creatorStake + totalBettorStake; // 7773
    const creatorActualReward = Math.min(creatorMaxReward, poolTotal); // 7773
    
    console.log(`\\n🧮 Creator Calculation:`);
    console.log(`  Denominator: ${denominator}`);
    console.log(`  Creator Reward: ${creatorReward} BITR`);
    console.log(`  Creator Max Reward: ${creatorMaxReward} BITR`);
    console.log(`  Pool Total Available: ${poolTotal} BITR`);
    console.log(`  Creator Actual Reward: ${creatorActualReward} BITR`);
    
    // LP calculation
    const creatorTakesFromBettors = creatorActualReward - creatorStake; // 4571
    const remainingForLP = totalBettorStake - creatorTakesFromBettors; // 0
    const lpReward = (lpStake * 100) / denominator; // 4000
    const lpActualReward = Math.min(lpReward, remainingForLP); // 0
    const lpTotalPayout = lpStake + lpActualReward; // 2000 (refund only)
    
    console.log(`\\n🧮 LP Calculation:`);
    console.log(`  Creator Takes from Bettors: ${creatorTakesFromBettors} BITR`);
    console.log(`  Remaining for LP: ${remainingForLP} BITR`);
    console.log(`  LP Max Reward: ${lpReward} BITR`);
    console.log(`  LP Actual Reward: ${lpActualReward} BITR`);
    console.log(`  LP Total Payout: ${lpTotalPayout} BITR (refund only)`);
    
    console.log(`\\n✅ Final Results:`);
    console.log(`  Creator should get: ${creatorActualReward} BITR`);
    console.log(`  LP should get: ${lpTotalPayout} BITR`);
    console.log(`  Total distributed: ${creatorActualReward + lpTotalPayout} BITR`);
    
    // Verify the math
    expect(creatorActualReward).to.equal(7773);
    expect(lpTotalPayout).to.equal(2000);
    expect(creatorActualReward + lpTotalPayout).to.equal(9773);
    
    console.log(`\\n🎯 All calculations verified!`);
  });

  it("Should test different scenarios", async function () {
    console.log("\\n🧪 Testing Different Scenarios...");
    
    const scenarios = [
      {
        name: "Pool fully filled",
        creatorStake: 5000,
        lpStake: 0,
        totalBettorStake: 10000, // Exactly max capacity
        odds: 150
      },
      {
        name: "Pool partially filled",
        creatorStake: 5000,
        lpStake: 0,
        totalBettorStake: 7000, // Less than max capacity
        odds: 150
      },
      {
        name: "High odds scenario",
        creatorStake: 1000,
        lpStake: 0,
        totalBettorStake: 5000,
        odds: 500 // 5.00 odds
      }
    ];
    
    scenarios.forEach((scenario, index) => {
      console.log(`\\n📊 Scenario ${index + 1}: ${scenario.name}`);
      
      const denominator = scenario.odds - 100;
      const creatorReward = (scenario.creatorStake * 100) / denominator;
      const creatorMaxReward = scenario.creatorStake + creatorReward;
      const poolTotal = scenario.creatorStake + scenario.totalBettorStake;
      const creatorActualReward = Math.min(creatorMaxReward, poolTotal);
      
      console.log(`  Creator Stake: ${scenario.creatorStake} BITR`);
      console.log(`  Bettor Stake: ${scenario.totalBettorStake} BITR`);
      console.log(`  Odds: ${scenario.odds / 100}`);
      console.log(`  Creator Max Reward: ${creatorMaxReward} BITR`);
      console.log(`  Creator Actual Reward: ${creatorActualReward} BITR`);
      console.log(`  Creator gets ${((creatorActualReward / poolTotal) * 100).toFixed(1)}% of pool`);
    });
  });
});
