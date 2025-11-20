const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Actual Claim Function Test", function () {
  let poolCore;
  let bitrToken;
  let owner, creator, lpProvider, bettor1, bettor2, oracle;
  let poolId;

  beforeEach(async function () {
    [owner, creator, lpProvider, bettor1, bettor2, oracle] = await ethers.getSigners();

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

    // Mint tokens to participants
    await bitrToken.mint(creator.address, ethers.parseEther("10000"));
    await bitrToken.mint(lpProvider.address, ethers.parseEther("10000"));
    await bitrToken.mint(bettor1.address, ethers.parseEther("10000"));
    await bitrToken.mint(bettor2.address, ethers.parseEther("10000"));

    // Approve tokens
    await bitrToken.connect(creator).approve(await poolCore.getAddress(), ethers.parseEther("10000"));
    await bitrToken.connect(lpProvider).approve(await poolCore.getAddress(), ethers.parseEther("10000"));
    await bitrToken.connect(bettor1).approve(await poolCore.getAddress(), ethers.parseEther("10000"));
    await bitrToken.connect(bettor2).approve(await poolCore.getAddress(), ethers.parseEther("10000"));

    // Create Pool 3 scenario
    const currentTime = (await ethers.provider.getBlock('latest')).timestamp;
    const eventStartTime = currentTime + 100; // Start soon
    const eventEndTime = eventStartTime + 200; // Short duration for testing

    await poolCore.connect(creator).createPool(
      ethers.keccak256(ethers.toUtf8Bytes("Home wins")), // predictedOutcome
      150, // odds (1.50)
      ethers.parseEther("3202"), // creatorStake
      eventStartTime,
      eventEndTime,
      ethers.keccak256(ethers.toUtf8Bytes("Premier League")), // league
      ethers.keccak256(ethers.toUtf8Bytes("Football")), // category
      ethers.keccak256(ethers.toUtf8Bytes("Chapecoense")), // homeTeam
      ethers.keccak256(ethers.toUtf8Bytes("Botafogo SP")), // awayTeam
      ethers.keccak256(ethers.toUtf8Bytes("Chapecoense vs Botafogo SP")), // title
      false, // isPrivate
      0, // maxBetPerUser
      true, // useBitr
      0, // OracleType.GUIDED
      0, // MarketType.MONEYLINE
      "fixture_123" // marketId
    );

    poolId = 0; // First pool created

    // Add LP by same creator (2000 BITR)
    await poolCore.connect(creator).addLiquidity(poolId, ethers.parseEther("2000"));

    // Place bets (4571 BITR total)
    await poolCore.connect(bettor1).placeBet(poolId, ethers.parseEther("2571"));
    await poolCore.connect(bettor2).placeBet(poolId, ethers.parseEther("2000"));
  });

  describe("Pool 3 Scenario - Actual Claim Testing", function () {
    it("Should successfully claim creator rewards when creator side wins", async function () {
      console.log("🧪 Testing Creator Claim (Pool 3 Scenario)...");
      
      // Record initial balances
      const initialCreatorBalance = await bitrToken.balanceOf(creator.address);
      console.log(`Initial Creator Balance: ${ethers.formatEther(initialCreatorBalance)} BITR`);
      
      // Advance time to after event end
      await ethers.provider.send("evm_increaseTime", [300]); // 5 minutes buffer
      await ethers.provider.send("evm_mine");
      
      // Settle pool - creator side wins (outcome != predictedOutcome)
      const differentOutcome = ethers.keccak256(ethers.toUtf8Bytes("Away wins"));
      await poolCore.connect(oracle).settlePool(poolId, differentOutcome);
      
      // Check claim info before claiming
      const claimInfo = await poolCore.getClaimInfo(poolId, creator.address);
      console.log(`Can Claim: ${claimInfo.canClaim}`);
      console.log(`Claimable Amount: ${ethers.formatEther(claimInfo.claimableAmount)} BITR`);
      console.log(`Is Winner: ${claimInfo.isWinner}`);
      console.log(`User Stake: ${ethers.formatEther(claimInfo.userStake)} BITR`);
      
      // Verify claim info matches expected calculation
      expect(claimInfo.canClaim).to.be.true;
      expect(claimInfo.isWinner).to.be.true;
      expect(claimInfo.claimableAmount).to.equal(ethers.parseEther("7773")); // Expected from our calculation
      
      // Execute actual claim
      console.log("\\n🎯 Executing Claim Transaction...");
      const claimTx = await poolCore.connect(creator).claim(poolId);
      const claimReceipt = await claimTx.wait();
      
      console.log(`Claim Transaction Hash: ${claimTx.hash}`);
      console.log(`Gas Used: ${claimReceipt.gasUsed.toString()}`);
      
      // Check final balance
      const finalCreatorBalance = await bitrToken.balanceOf(creator.address);
      const claimedAmount = finalCreatorBalance - initialCreatorBalance;
      
      console.log(`Final Creator Balance: ${ethers.formatEther(finalCreatorBalance)} BITR`);
      console.log(`Claimed Amount: ${ethers.formatEther(claimedAmount)} BITR`);
      
      // Verify the claimed amount matches expectation
      expect(claimedAmount).to.equal(ethers.parseEther("7773"));
      
      // Verify claim status is updated
      const postClaimInfo = await poolCore.getClaimInfo(poolId, creator.address);
      expect(postClaimInfo.canClaim).to.be.false;
      expect(postClaimInfo.alreadyClaimed).to.be.true;
      
      console.log("✅ Creator claim successful!");
    });

    it("Should handle separate LP provider claim correctly", async function () {
      console.log("\\n🧪 Testing Separate LP Provider Claim...");
      
      // Create a new pool with separate LP provider
      const currentTime = (await ethers.provider.getBlock('latest')).timestamp;
      const eventStartTime = currentTime + 100;
      const eventEndTime = eventStartTime + 200;

      await poolCore.connect(creator).createPool(
        ethers.keccak256(ethers.toUtf8Bytes("Home wins")),
        150, // 1.50 odds
        ethers.parseEther("3202"),
        eventStartTime,
        eventEndTime,
        ethers.keccak256(ethers.toUtf8Bytes("Premier League")),
        ethers.keccak256(ethers.toUtf8Bytes("Football")),
        ethers.keccak256(ethers.toUtf8Bytes("Team A")),
        ethers.keccak256(ethers.toUtf8Bytes("Team B")),
        ethers.keccak256(ethers.toUtf8Bytes("Team A vs Team B")),
        false, 0, true, 0, 0, "fixture_124"
      );

      const newPoolId = 1;

      // Separate LP provider adds liquidity
      await poolCore.connect(lpProvider).addLiquidity(newPoolId, ethers.parseEther("2000"));

      // Place bets
      await poolCore.connect(bettor1).placeBet(newPoolId, ethers.parseEther("4571"));

      // Record initial balances
      const initialCreatorBalance = await bitrToken.balanceOf(creator.address);
      const initialLPBalance = await bitrToken.balanceOf(lpProvider.address);
      
      // Advance time and settle
      await ethers.provider.send("evm_increaseTime", [300]);
      await ethers.provider.send("evm_mine");
      
      const differentOutcome = ethers.keccak256(ethers.toUtf8Bytes("Away wins"));
      await poolCore.connect(oracle).settlePool(newPoolId, differentOutcome);

      // Check claim info for both
      const creatorClaimInfo = await poolCore.getClaimInfo(newPoolId, creator.address);
      const lpClaimInfo = await poolCore.getClaimInfo(newPoolId, lpProvider.address);
      
      console.log(`Creator Can Claim: ${creatorClaimInfo.canClaim}, Amount: ${ethers.formatEther(creatorClaimInfo.claimableAmount)} BITR`);
      console.log(`LP Can Claim: ${lpClaimInfo.canClaim}, Amount: ${ethers.formatEther(lpClaimInfo.claimableAmount)} BITR`);
      
      // Execute claims
      await poolCore.connect(creator).claim(newPoolId);
      await poolCore.connect(lpProvider).claim(newPoolId);
      
      // Check final balances
      const finalCreatorBalance = await bitrToken.balanceOf(creator.address);
      const finalLPBalance = await bitrToken.balanceOf(lpProvider.address);
      
      const creatorClaimed = finalCreatorBalance - initialCreatorBalance;
      const lpClaimed = finalLPBalance - initialLPBalance;
      
      console.log(`Creator Claimed: ${ethers.formatEther(creatorClaimed)} BITR`);
      console.log(`LP Claimed: ${ethers.formatEther(lpClaimed)} BITR`);
      
      // Creator should get 7773 BITR (takes all bettor stakes)
      // LP should get 2000 BITR (refund only)
      expect(creatorClaimed).to.equal(ethers.parseEther("7773"));
      expect(lpClaimed).to.equal(ethers.parseEther("2000"));
      
      console.log("✅ Separate LP claim successful!");
    });

    it("Should handle bettor wins correctly", async function () {
      console.log("\\n🧪 Testing Bettor Claims...");
      
      // Record initial balances
      const initialBettor1Balance = await bitrToken.balanceOf(bettor1.address);
      const initialBettor2Balance = await bitrToken.balanceOf(bettor2.address);
      
      // Advance time to after event end
      await ethers.provider.send("evm_increaseTime", [300]);
      await ethers.provider.send("evm_mine");
      
      // Settle pool - bettor side wins (outcome == predictedOutcome)
      const sameOutcome = ethers.keccak256(ethers.toUtf8Bytes("Home wins"));
      await poolCore.connect(oracle).settlePool(poolId, sameOutcome);
      
      // Check claim info
      const bettor1ClaimInfo = await poolCore.getClaimInfo(poolId, bettor1.address);
      const bettor2ClaimInfo = await poolCore.getClaimInfo(poolId, bettor2.address);
      
      console.log(`Bettor 1 Can Claim: ${bettor1ClaimInfo.canClaim}, Amount: ${ethers.formatEther(bettor1ClaimInfo.claimableAmount)} BITR`);
      console.log(`Bettor 2 Can Claim: ${bettor2ClaimInfo.canClaim}, Amount: ${ethers.formatEther(bettor2ClaimInfo.claimableAmount)} BITR`);
      
      // Execute claims
      await poolCore.connect(bettor1).claim(poolId);
      await poolCore.connect(bettor2).claim(poolId);
      
      // Check final balances
      const finalBettor1Balance = await bitrToken.balanceOf(bettor1.address);
      const finalBettor2Balance = await bitrToken.balanceOf(bettor2.address);
      
      const bettor1Claimed = finalBettor1Balance - initialBettor1Balance;
      const bettor2Claimed = finalBettor2Balance - initialBettor2Balance;
      
      console.log(`Bettor 1 Claimed: ${ethers.formatEther(bettor1Claimed)} BITR`);
      console.log(`Bettor 2 Claimed: ${ethers.formatEther(bettor2Claimed)} BITR`);
      
      // Verify bettors got their stakes * odds (minus fees)
      expect(bettor1Claimed).to.be.closeTo(ethers.parseEther("3856.5"), ethers.parseEther("200")); // Allow for fees
      expect(bettor2Claimed).to.be.closeTo(ethers.parseEther("3000"), ethers.parseEther("150")); // Allow for fees
      
      console.log("✅ Bettor claims successful!");
    });

    it("Should prevent double claiming", async function () {
      console.log("\\n🧪 Testing Double Claim Prevention...");
      
      // Advance time and settle
      await ethers.provider.send("evm_increaseTime", [300]);
      await ethers.provider.send("evm_mine");
      
      const differentOutcome = ethers.keccak256(ethers.toUtf8Bytes("Away wins"));
      await poolCore.connect(oracle).settlePool(poolId, differentOutcome);
      
      // First claim should succeed
      await expect(poolCore.connect(creator).claim(poolId)).to.not.be.reverted;
      console.log("✅ First claim successful");
      
      // Second claim should fail
      await expect(poolCore.connect(creator).claim(poolId))
        .to.be.revertedWith("Already claimed");
      console.log("✅ Double claim prevention working");
    });

    it("Should enforce stake requirements", async function () {
      console.log("\\n🧪 Testing Stake Requirements...");
      
      // Advance time and settle
      await ethers.provider.send("evm_increaseTime", [300]);
      await ethers.provider.send("evm_mine");
      
      const differentOutcome = ethers.keccak256(ethers.toUtf8Bytes("Away wins"));
      await poolCore.connect(oracle).settlePool(poolId, differentOutcome);
      
      // Try to claim with address that has no stake
      await expect(poolCore.connect(lpProvider).claim(poolId))
        .to.be.revertedWith("No LP stake");
      console.log("✅ Stake requirement enforcement working");
    });

    it("Should handle pool not settled", async function () {
      console.log("\\n🧪 Testing Pool Not Settled Protection...");
      
      // Try to claim before settlement
      await expect(poolCore.connect(creator).claim(poolId))
        .to.be.revertedWith("Not settled");
      console.log("✅ Settlement requirement working");
    });
  });

  describe("Gas Usage and Performance", function () {
    it("Should measure gas usage for claims", async function () {
      console.log("\\n⛽ Gas Usage Analysis...");
      
      // Advance time and settle
      await ethers.provider.send("evm_increaseTime", [300]);
      await ethers.provider.send("evm_mine");
      
      const differentOutcome = ethers.keccak256(ethers.toUtf8Bytes("Away wins"));
      const settleTx = await poolCore.connect(oracle).settlePool(poolId, differentOutcome);
      const settleReceipt = await settleTx.wait();
      console.log(`Settlement Gas Used: ${settleReceipt.gasUsed.toString()}`);
      
      // Measure creator claim gas
      const claimTx = await poolCore.connect(creator).claim(poolId);
      const claimReceipt = await claimTx.wait();
      console.log(`Creator Claim Gas Used: ${claimReceipt.gasUsed.toString()}`);
      
      // Verify gas usage is reasonable (should be under 200k gas)
      expect(claimReceipt.gasUsed).to.be.below(200000);
      console.log("✅ Gas usage is within acceptable limits");
    });
  });
});
