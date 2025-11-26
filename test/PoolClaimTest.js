const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Pool Claim System", function () {
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
  });

  describe("Pool 3 Scenario - Creator + LP Same Address", function () {
    beforeEach(async function () {
      // Create pool with 1.50 odds (150), creator stake 3202 BITR
      const currentTime = Math.floor(Date.now() / 1000);
      const eventStartTime = currentTime + 3600; // 1 hour from now
      const eventEndTime = eventStartTime + 7200; // 2 hours duration

      const tx = await poolCore.connect(creator).createPool(
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

      const receipt = await tx.wait();
      poolId = 0; // First pool created

      // Add LP by same creator (2000 BITR)
      await poolCore.connect(creator).addLiquidity(poolId, ethers.parseEther("2000"));

      // Place bets (4571 BITR total)
      await poolCore.connect(bettor1).placeBet(poolId, ethers.parseEther("2571"));
      await poolCore.connect(bettor2).placeBet(poolId, ethers.parseEther("2000"));
    });

    it("Should calculate correct creator claim when creator side wins", async function () {
      // Advance time to after event end
      await ethers.provider.send("evm_increaseTime", [7200 + 3600]); // 2 hours event + 1 hour buffer
      await ethers.provider.send("evm_mine");
      
      // Settle pool - creator side wins (outcome != predictedOutcome)
      const differentOutcome = ethers.keccak256(ethers.toUtf8Bytes("Away wins"));
      await poolCore.connect(oracle).settlePool(poolId, differentOutcome);

      // Check creator claim info
      const claimInfo = await poolCore.getClaimInfo(poolId, creator.address);
      
      console.log("Creator Claim Info:");
      console.log("  Can Claim:", claimInfo.canClaim);
      console.log("  Claimable Amount:", ethers.formatEther(claimInfo.claimableAmount), "BITR");
      console.log("  Is Winner:", claimInfo.isWinner);
      console.log("  User Stake:", ethers.formatEther(claimInfo.userStake), "BITR");
      console.log("  Reason:", claimInfo.reason);

      // Expected calculation:
      // Creator max reward = 3202 + (3202 / (1.50 - 1)) = 3202 + 6404 = 9606 BITR
      // Pool total = 3202 + 2000 + 4571 = 9773 BITR
      // Creator gets = min(9606, 9773) = 9606 BITR
      // But creator can only get up to creatorStake + totalBettorStake = 3202 + 4571 = 7773 BITR
      
      expect(claimInfo.canClaim).to.be.true;
      expect(claimInfo.isWinner).to.be.true;
      expect(claimInfo.claimableAmount).to.equal(ethers.parseEther("7773")); // Takes all available
    });

    it("Should calculate correct LP claim when creator side wins", async function () {
      // Settle pool - creator side wins
      const differentOutcome = ethers.keccak256(ethers.toUtf8Bytes("Away wins"));
      await poolCore.connect(oracle).settlePool(poolId, differentOutcome);

      // Check LP claim info (same address as creator, but checking LP stake)
      const claimInfo = await poolCore.getClaimInfo(poolId, creator.address);
      
      // Since creator takes everything (7773 BITR), LP should only get refund
      // LP stake = 2000 BITR, should get refund only
      
      console.log("LP Claim Info (same address as creator):");
      console.log("  Can Claim:", claimInfo.canClaim);
      console.log("  Claimable Amount:", ethers.formatEther(claimInfo.claimableAmount), "BITR");
      
      // Creator gets priority, so LP gets nothing extra
      expect(claimInfo.canClaim).to.be.true;
      expect(claimInfo.claimableAmount).to.equal(ethers.parseEther("7773")); // Creator claim, not LP
    });

    it("Should handle separate LP provider correctly", async function () {
      // Create new pool with separate LP provider
      const currentTime = Math.floor(Date.now() / 1000);
      const eventStartTime = currentTime + 3600;
      const eventEndTime = eventStartTime + 7200;

      const tx = await poolCore.connect(creator).createPool(
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
        false, // isPrivate
        0, // maxBetPerUser
        true, // useBitr
        0, // OracleType.GUIDED
        0, // MarketType.MONEYLINE
        "fixture_124" // marketId
      );

      const newPoolId = 1;

      // Separate LP provider adds liquidity
      await poolCore.connect(lpProvider).addLiquidity(newPoolId, ethers.parseEther("2000"));

      // Place bets
      await poolCore.connect(bettor1).placeBet(newPoolId, ethers.parseEther("4571"));

      // Settle - creator side wins
      const differentOutcome = ethers.keccak256(ethers.toUtf8Bytes("Away wins"));
      await poolCore.connect(oracle).settlePool(newPoolId, differentOutcome);

      // Check creator claim
      const creatorClaimInfo = await poolCore.getClaimInfo(newPoolId, creator.address);
      console.log("Creator Claim (separate LP):", ethers.formatEther(creatorClaimInfo.claimableAmount), "BITR");

      // Check LP claim
      const lpClaimInfo = await poolCore.getClaimInfo(newPoolId, lpProvider.address);
      console.log("LP Claim (separate):", ethers.formatEther(lpClaimInfo.claimableAmount), "BITR");

      // Creator should get: min(9606, 7773) = 7773 BITR (takes all bettor stakes)
      // LP should get: 2000 BITR refund only (no corresponding bets left)
      expect(creatorClaimInfo.claimableAmount).to.equal(ethers.parseEther("7773"));
      expect(lpClaimInfo.claimableAmount).to.equal(ethers.parseEther("2000")); // Refund only
    });

    it("Should handle bettor wins correctly", async function () {
      // Settle pool - bettor side wins (outcome == predictedOutcome)
      const sameOutcome = ethers.keccak256(ethers.toUtf8Bytes("Home wins"));
      await poolCore.connect(oracle).settlePool(poolId, sameOutcome);

      // Check bettor claims
      const bettor1ClaimInfo = await poolCore.getClaimInfo(poolId, bettor1.address);
      const bettor2ClaimInfo = await poolCore.getClaimInfo(poolId, bettor2.address);

      console.log("Bettor 1 Claim:", ethers.formatEther(bettor1ClaimInfo.claimableAmount), "BITR");
      console.log("Bettor 2 Claim:", ethers.formatEther(bettor2ClaimInfo.claimableAmount), "BITR");

      // Bettor calculation: stake * odds
      // Bettor 1: 2571 * 1.50 = 3856.5 BITR (minus fees)
      // Bettor 2: 2000 * 1.50 = 3000 BITR (minus fees)
      
      expect(bettor1ClaimInfo.canClaim).to.be.true;
      expect(bettor2ClaimInfo.canClaim).to.be.true;
      
      // Check approximate values (accounting for fees)
      expect(bettor1ClaimInfo.claimableAmount).to.be.closeTo(
        ethers.parseEther("3856.5"), 
        ethers.parseEther("200") // Allow for fees
      );
      expect(bettor2ClaimInfo.claimableAmount).to.be.closeTo(
        ethers.parseEther("3000"), 
        ethers.parseEther("150") // Allow for fees
      );
    });

    it("Should prevent double claiming", async function () {
      // Settle pool - creator side wins
      const differentOutcome = ethers.keccak256(ethers.toUtf8Bytes("Away wins"));
      await poolCore.connect(oracle).settlePool(poolId, differentOutcome);

      // First claim should succeed
      await expect(poolCore.connect(creator).claim(poolId)).to.not.be.reverted;

      // Second claim should fail
      await expect(poolCore.connect(creator).claim(poolId))
        .to.be.revertedWith("Already claimed");
    });

    it("Should enforce stake requirements", async function () {
      // Settle pool - creator side wins
      const differentOutcome = ethers.keccak256(ethers.toUtf8Bytes("Away wins"));
      await poolCore.connect(oracle).settlePool(poolId, differentOutcome);

      // Try to claim with address that has no stake
      await expect(poolCore.connect(lpProvider).claim(poolId))
        .to.be.revertedWith("No LP stake");
    });
  });
});
