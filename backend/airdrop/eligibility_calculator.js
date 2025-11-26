const { ethers } = require('ethers');

class AirdropEligibilityCalculator {
  constructor(db, bitrContract, provider) {
    this.db = db;
    this.bitrContract = bitrContract;
    this.provider = provider;
  }

  /**
   * Calculate eligibility for a specific user
   */
  async calculateUserEligibility(userAddress) {
    try {
      // 1. Check if user claimed from faucet
      const faucetClaim = await this.db.query(`
        SELECT * FROM airdrop.faucet_claims WHERE user_address = $1
      `, [userAddress]);

      if (faucetClaim.rows.length === 0) {
        return {
          isEligible: false,
          reason: 'No faucet claim found',
          requirements: this.getRequirementStatus(userAddress, false)
        };
      }

      const faucetData = faucetClaim.rows[0];
      const faucetClaimDate = faucetData.claimed_at;

      // 2. Check all requirements
      const requirements = await this.checkAllRequirements(userAddress, faucetClaimDate);
      
      // 3. Check Sybil detection flags
      const sybilFlags = await this.checkSybilFlags(userAddress);
      
      // 4. Determine final eligibility
      const isEligible = 
        requirements.hadSTTActivity &&
        requirements.bitrActionCount >= 20 &&
        requirements.hasStakingActivity &&
        requirements.oddysseySlipCount >= 3 &&
        !sybilFlags.hasSuspiciousActivity;

      // 5. Update eligibility record
      await this.updateEligibilityRecord(userAddress, {
        ...requirements,
        ...sybilFlags,
        isEligible,
        faucetClaimDate
      });

      return {
        isEligible,
        requirements,
        sybilFlags,
        faucetClaimDate,
        reason: isEligible ? 'All requirements met' : this.getFailureReason(requirements, sybilFlags)
      };

    } catch (error) {
      console.error(`Error calculating eligibility for ${userAddress}:`, error);
      throw error;
    }
  }

  /**
   * Check all airdrop requirements
   */
  async checkAllRequirements(userAddress, faucetClaimDate) {
    // Requirement 1: STT activity before faucet claim
    const sttActivityResult = await this.db.query(`
      SELECT EXISTS(
        SELECT 1 FROM prediction.bets 
        WHERE user_address = $1 AND created_at < $2
        UNION
        SELECT 1 FROM prediction.pools 
        WHERE creator_address = $1 AND creation_time < $2
      ) as had_activity
    `, [userAddress, faucetClaimDate]);

    const hadSTTActivity = sttActivityResult.rows[0].had_activity;

    // Requirement 2: At least 20 BITR actions after faucet claim
    const bitrActionResult = await this.db.query(`
      SELECT COUNT(*) as action_count
      FROM airdrop.bitr_activities
      WHERE user_address = $1 
      AND activity_type IN ('POOL_CREATE', 'BET_PLACE', 'STAKING')
      AND timestamp > $2
    `, [userAddress, faucetClaimDate]);

    const bitrActionCount = parseInt(bitrActionResult.rows[0].action_count);

    // Requirement 3: Staking activity
    const stakingResult = await this.db.query(`
      SELECT EXISTS(
        SELECT 1 FROM airdrop.staking_activities
        WHERE user_address = $1 AND action_type = 'STAKE'
      ) as has_staking
    `, [userAddress]);

    const hasStakingActivity = stakingResult.rows[0].has_staking;

    // Requirement 4: At least 3 Oddyssey slips
    const oddysseyResult = await this.db.query(`
      SELECT COUNT(*) as slip_count
      FROM oddyssey.slips
      WHERE user_address = $1
    `, [userAddress]);

    const oddysseySlipCount = parseInt(oddysseyResult.rows[0].slip_count);

    return {
      hadSTTActivity,
      bitrActionCount,
      hasStakingActivity,
      oddysseySlipCount
    };
  }

  /**
   * Check for Sybil attack indicators
   */
  async checkSybilFlags(userAddress) {
    // Check for suspicious transfer patterns
    const suspiciousTransfersResult = await this.db.query(`
      SELECT EXISTS(
        SELECT 1 FROM airdrop.transfer_patterns
        WHERE (from_address = $1 OR to_address = $1) 
        AND is_suspicious = TRUE
      ) as has_suspicious
    `, [userAddress]);

    const hasSuspiciousTransfers = suspiciousTransfersResult.rows[0].has_suspicious;

    // Check if user only received BITR without doing anything
    const transferOnlyResult = await this.db.query(`
      SELECT 
        EXISTS(
          SELECT 1 FROM airdrop.bitr_activities 
          WHERE user_address = $1 AND activity_type = 'TRANSFER_IN'
        ) as has_incoming,
        EXISTS(
          SELECT 1 FROM airdrop.bitr_activities 
          WHERE user_address = $1 AND activity_type NOT IN ('TRANSFER_IN', 'TRANSFER_OUT')
        ) as has_activity
    `, [userAddress]);

    const hasIncoming = transferOnlyResult.rows[0].has_incoming;
    const hasActivity = transferOnlyResult.rows[0].has_activity;
    const isTransferOnlyRecipient = hasIncoming && !hasActivity;

    // Check for consolidation patterns
    const consolidationResult = await this.db.query(`
      SELECT COUNT(DISTINCT from_address) as sender_count
      FROM airdrop.transfer_patterns
      WHERE to_address = $1 AND amount > 1000000000000000000000
    `, [userAddress]); // > 1000 BITR transfers

    const consolidationDetected = parseInt(consolidationResult.rows[0].sender_count) > 5;

    return {
      hasSuspiciousTransfers,
      isTransferOnlyRecipient,
      consolidationDetected,
      hasSuspiciousActivity: hasSuspiciousTransfers || isTransferOnlyRecipient || consolidationDetected
    };
  }

  /**
   * Update eligibility record in database
   */
  async updateEligibilityRecord(userAddress, data) {
    await this.db.query(`
      INSERT INTO airdrop.eligibility 
      (user_address, has_faucet_claim, faucet_claim_date, has_stt_activity_before_faucet, 
       bitr_action_count, has_staking_activity, oddyssey_slip_count, has_suspicious_transfers,
       is_transfer_only_recipient, consolidation_detected, is_eligible, eligibility_updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (user_address) DO UPDATE SET
        has_faucet_claim = $2,
        faucet_claim_date = $3,
        has_stt_activity_before_faucet = $4,
        bitr_action_count = $5,
        has_staking_activity = $6,
        oddyssey_slip_count = $7,
        has_suspicious_transfers = $8,
        is_transfer_only_recipient = $9,
        consolidation_detected = $10,
        is_eligible = $11,
        eligibility_updated_at = NOW(),
        updated_at = NOW()
    `, [
      userAddress,
      true,
      data.faucetClaimDate,
      data.hadSTTActivity,
      data.bitrActionCount,
      data.hasStakingActivity,
      data.oddysseySlipCount,
      data.hasSuspiciousTransfers,
      data.isTransferOnlyRecipient,
      data.consolidationDetected,
      data.isEligible
    ]);
  }

  /**
   * Take snapshot of eligible users and calculate airdrop amounts
   */
  async takeSnapshot(snapshotName) {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      
      console.log(`Taking airdrop snapshot: ${snapshotName} at block ${currentBlock}`);
      
      // Create snapshot record
      const snapshotResult = await this.db.query(`
        INSERT INTO airdrop.snapshots (snapshot_name, snapshot_block, snapshot_timestamp)
        VALUES ($1, $2, NOW())
        RETURNING id
      `, [snapshotName, currentBlock]);
      
      const snapshotId = snapshotResult.rows[0].id;
      
      // Get all eligible users
      const eligibleUsers = await this.db.query(`
        SELECT user_address FROM airdrop.eligibility WHERE is_eligible = TRUE
      `);
      
      if (eligibleUsers.rows.length === 0) {
        throw new Error('No eligible users found for snapshot');
      }
      
      let totalEligibleBITR = BigInt(0);
      const airdropTotal = BigInt('5000000000000000000000000'); // 5M BITR
      
      console.log(`Processing ${eligibleUsers.rows.length} eligible users...`);
      
      // Get BITR balances for all eligible users
      const balancePromises = eligibleUsers.rows.map(async (user) => {
        try {
          const balance = await this.bitrContract.balanceOf(user.user_address);
          
          // Store snapshot balance
          await this.db.query(`
            INSERT INTO airdrop.snapshot_balances 
            (snapshot_id, user_address, bitr_balance, is_eligible)
            VALUES ($1, $2, $3, TRUE)
          `, [snapshotId, user.user_address, balance.toString()]);
          
          return { address: user.user_address, balance };
        } catch (error) {
          console.error(`Error getting balance for ${user.user_address}:`, error);
          return { address: user.user_address, balance: BigInt(0) };
        }
      });
      
      const balanceResults = await Promise.all(balancePromises);
      
      // Calculate total eligible BITR
      for (const result of balanceResults) {
        totalEligibleBITR += result.balance;
      }
      
      if (totalEligibleBITR === BigInt(0)) {
        throw new Error('Total eligible BITR is zero - cannot calculate proportional distribution');
      }
      
      console.log(`Total eligible BITR: ${ethers.formatEther(totalEligibleBITR)}`);
      
      // Calculate proportional airdrop amounts
      for (const result of balanceResults) {
        const userBalance = result.balance;
        const airdropAmount = (userBalance * airdropTotal) / totalEligibleBITR;
        
        // Update snapshot balance with airdrop amount
        await this.db.query(`
          UPDATE airdrop.snapshot_balances 
          SET airdrop_amount = $1 
          WHERE snapshot_id = $2 AND user_address = $3
        `, [airdropAmount.toString(), snapshotId, result.address]);
        
        // Update eligibility table with snapshot data
        await this.db.query(`
          UPDATE airdrop.eligibility 
          SET snapshot_bitr_balance = $1, airdrop_amount = $2, snapshot_taken_at = NOW()
          WHERE user_address = $3
        `, [userBalance.toString(), airdropAmount.toString(), result.address]);
      }
      
      // Update snapshot totals
      await this.db.query(`
        UPDATE airdrop.snapshots 
        SET total_eligible_wallets = $1, total_eligible_bitr = $2
        WHERE id = $3
      `, [eligibleUsers.rows.length, totalEligibleBITR.toString(), snapshotId]);
      
      console.log(`✅ Snapshot ${snapshotName} complete:`);
      console.log(`  - ${eligibleUsers.rows.length} eligible wallets`);
      console.log(`  - ${ethers.formatEther(totalEligibleBITR)} total eligible BITR`);
      console.log(`  - ${ethers.formatEther(airdropTotal)} total airdrop allocated`);
      
      return {
        snapshotId,
        eligibleWallets: eligibleUsers.rows.length,
        totalEligibleBITR: totalEligibleBITR.toString(),
        totalAirdropAllocated: airdropTotal.toString(),
        blockNumber: currentBlock
      };
      
    } catch (error) {
      console.error('Error taking snapshot:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive airdrop statistics
   */
  async getAirdropStatistics() {
    const result = await this.db.query(`
      SELECT 
        (SELECT COUNT(*) FROM airdrop.faucet_claims) as total_faucet_claims,
        (SELECT COUNT(*) FROM airdrop.eligibility WHERE is_eligible = TRUE) as total_eligible,
        (SELECT COALESCE(SUM(snapshot_bitr_balance::numeric), 0) FROM airdrop.eligibility WHERE is_eligible = TRUE) as total_eligible_bitr,
        (SELECT COALESCE(SUM(airdrop_amount::numeric), 0) FROM airdrop.eligibility WHERE is_eligible = TRUE) as total_airdrop_allocated,
        (SELECT COUNT(*) FROM airdrop.eligibility WHERE has_suspicious_transfers = TRUE OR is_transfer_only_recipient = TRUE OR consolidation_detected = TRUE) as suspicious_wallets,
        (SELECT COALESCE(AVG(bitr_action_count), 0) FROM airdrop.eligibility WHERE is_eligible = TRUE) as avg_bitr_actions,
        (SELECT COALESCE(AVG(oddyssey_slip_count), 0) FROM airdrop.eligibility WHERE is_eligible = TRUE) as avg_oddyssey_slips
    `);
    
    const stats = result.rows[0];
    
    // Calculate eligibility percentage
    const eligibilityPercentage = stats.total_faucet_claims > 0 
      ? (stats.total_eligible / stats.total_faucet_claims) * 100 
      : 0;
    
    return {
      totalFaucetClaims: parseInt(stats.total_faucet_claims),
      totalEligible: parseInt(stats.total_eligible),
      totalEligibleBITR: stats.total_eligible_bitr,
      totalAirdropAllocated: stats.total_airdrop_allocated,
      suspiciousWallets: parseInt(stats.suspicious_wallets),
      averageBITRActions: parseFloat(stats.avg_bitr_actions),
      averageOddysseySlips: parseFloat(stats.avg_oddyssey_slips),
      eligibilityPercentage: parseFloat(eligibilityPercentage.toFixed(2))
    };
  }

  /**
   * Get detailed user eligibility information
   */
  async getUserEligibilityDetail(userAddress) {
    const result = await this.db.query(`
      SELECT 
        e.*,
        fc.amount as faucet_amount,
        fc.claimed_at as faucet_claimed_at,
        (SELECT COUNT(*) FROM prediction.bets b 
         WHERE b.user_address = e.user_address 
         AND b.created_at < e.faucet_claim_date) +
        (SELECT COUNT(*) FROM prediction.pools p 
         WHERE p.creator_address = e.user_address 
         AND p.creation_time < e.faucet_claim_date) as stt_activity_count_before_faucet
      FROM airdrop.eligibility e
      LEFT JOIN airdrop.faucet_claims fc ON e.user_address = fc.user_address
      WHERE e.user_address = $1
    `, [userAddress]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const data = result.rows[0];
    
    return {
      userAddress: data.user_address,
      isEligible: data.is_eligible,
      hasFaucetClaim: data.has_faucet_claim,
      faucetAmount: data.faucet_amount,
      faucetClaimedAt: data.faucet_claimed_at,
      requirements: {
        hadSTTActivityBeforeFaucet: data.has_stt_activity_before_faucet,
        sttActivityCountBeforeFaucet: parseInt(data.stt_activity_count_before_faucet),
        bitrActionCount: data.bitr_action_count,
        hasStakingActivity: data.has_staking_activity,
        oddysseySlipCount: data.oddyssey_slip_count
      },
      sybilFlags: {
        hasSuspiciousTransfers: data.has_suspicious_transfers,
        isTransferOnlyRecipient: data.is_transfer_only_recipient,
        consolidationDetected: data.consolidation_detected
      },
      snapshotData: {
        bitrBalance: data.snapshot_bitr_balance,
        airdropAmount: data.airdrop_amount,
        snapshotTakenAt: data.snapshot_taken_at
      },
      lastUpdated: data.eligibility_updated_at
    };
  }

  /**
   * Helper functions
   */
  getFailureReason(requirements, sybilFlags) {
    const reasons = [];
    
    if (!requirements.hadSTTActivity) {
      reasons.push('No STT activity before faucet claim');
    }
    if (requirements.bitrActionCount < 20) {
      reasons.push(`Only ${requirements.bitrActionCount}/20 BITR actions`);
    }
    if (!requirements.hasStakingActivity) {
      reasons.push('No staking activity');
    }
    if (requirements.oddysseySlipCount < 3) {
      reasons.push(`Only ${requirements.oddysseySlipCount}/3 Oddyssey slips`);
    }
    if (sybilFlags.hasSuspiciousTransfers) {
      reasons.push('Suspicious transfer activity detected');
    }
    if (sybilFlags.isTransferOnlyRecipient) {
      reasons.push('Only received BITR without platform activity');
    }
    if (sybilFlags.consolidationDetected) {
      reasons.push('Token consolidation detected');
    }
    
    return reasons.join('; ');
  }

  getRequirementStatus(userAddress, hasDetails) {
    return {
      hadSTTActivityBeforeFaucet: hasDetails ? null : false,
      bitrActionCount: hasDetails ? null : 0,
      hasStakingActivity: hasDetails ? null : false,
      oddysseySlipCount: hasDetails ? null : 0
    };
  }
}

module.exports = AirdropEligibilityCalculator; 