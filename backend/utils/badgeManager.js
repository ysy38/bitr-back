const db = require('../db/db');
const notificationService = require('../services/notification-service');

class BadgeManager {
  constructor() {
    // Define all available badges with their criteria
    this.badges = {
      // Creator Badges
      'sharpshooter': {
        category: 'creator',
        title: 'Sharpshooter',
        description: 'Win rate > 75% across 20+ pools',
        icon_name: 'target',
        rarity: 'rare',
        criteria: { minPools: 20, minWinRate: 0.75 }
      },
      'stone_face': {
        category: 'creator',
        title: 'Stone Face',
        description: 'Risked > 500 STT total',
        icon_name: 'shield',
        rarity: 'epic',
        criteria: { minTotalStake: 500 }
      },
      'mastermind': {
        category: 'creator',
        title: 'Mastermind',
        description: 'Created pools in 5+ categories',
        icon_name: 'brain',
        rarity: 'epic',
        criteria: { minCategories: 5 }
      },
      'crowd_slayer': {
        category: 'creator',
        title: 'Crowd Slayer',
        description: 'Won against 30+ bettors in one pool',
        icon_name: 'sword',
        rarity: 'legendary',
        criteria: { minBettorsInPool: 30 }
      },
      'comeback_king': {
        category: 'creator',
        title: 'Comeback King',
        description: '3 wins after back-to-back losses',
        icon_name: 'crown',
        rarity: 'rare',
        criteria: { comebackWins: 3 }
      },

      // Bettor Badges
      'sniper': {
        category: 'bettor',
        title: 'Sniper',
        description: '3+ successful high-odds (5x+) bets',
        icon_name: 'crosshair',
        rarity: 'uncommon',
        criteria: { minHighOddsBets: 3, minOdds: 5 }
      },
      'rising_star': {
        category: 'bettor',
        title: 'Rising Star',
        description: '5-bet winning streak',
        icon_name: 'star',
        rarity: 'uncommon',
        criteria: { winStreak: 5 }
      },
      'analyst': {
        category: 'bettor',
        title: 'Analyst',
        description: 'Above 60% correct prediction rate over 25 bets',
        icon_name: 'chart',
        rarity: 'rare',
        criteria: { minBets: 25, minWinRate: 0.6 }
      },
      'giant_slayer': {
        category: 'bettor',
        title: 'Giant Slayer',
        description: 'Beat a creator with >80% win rate',
        icon_name: 'hammer',
        rarity: 'epic',
        criteria: { beatCreatorWinRate: 0.8 }
      },
      'explorer': {
        category: 'bettor',
        title: 'Explorer',
        description: 'Bet against 10+ different creators',
        icon_name: 'compass',
        rarity: 'common',
        criteria: { minUniqueCreators: 10 }
      },

      // Community Badges
      'socialite': {
        category: 'community',
        title: 'Socialite',
        description: 'Posted 50+ comments across pools',
        icon_name: 'chat',
        rarity: 'common',
        criteria: { minComments: 50 }
      },
      'influencer': {
        category: 'community',
        title: 'Influencer',
        description: 'Reputation score above 300',
        icon_name: 'star',
        rarity: 'epic',
        criteria: { minReputation: 300 }
      },

      // Oddyssey Badges
      'oddyssey_rookie': {
        category: 'oddyssey',
        title: 'Oddyssey Rookie',
        description: 'Participated in 5+ Oddyssey cycles',
        icon_name: 'gamepad',
        rarity: 'common',
        criteria: { minOddysseyCycles: 5 }
      },
      'oddyssey_sharpshooter': {
        category: 'oddyssey',
        title: 'Oddyssey Sharpshooter',
        description: 'Achieved 8+ correct predictions in a single cycle',
        icon_name: 'target',
        rarity: 'rare',
        criteria: { minOddysseyCorrect: 8 }
      },
      'oddyssey_perfectionist': {
        category: 'oddyssey',
        title: 'Oddyssey Perfectionist',
        description: 'Achieved perfect 10/10 predictions in a cycle',
        icon_name: 'crown',
        rarity: 'legendary',
        criteria: { perfectOddysseyScore: true }
      },
      'oddyssey_champion': {
        category: 'oddyssey',
        title: 'Oddyssey Champion',
        description: 'Won 3+ Oddyssey cycles',
        icon_name: 'trophy',
        rarity: 'epic',
        criteria: { minOddysseyWins: 3 }
      },
      'oddyssey_legend': {
        category: 'oddyssey',
        title: 'Oddyssey Legend',
        description: 'Achieved 300+ Oddyssey reputation points',
        icon_name: 'fire',
        rarity: 'legendary',
        criteria: { minOddysseyReputation: 300 }
      },

      // Community Badges (continued)
      'influencer_likes': {
        category: 'community',
        title: 'Influencer',
        description: 'Received 500+ likes on comments',
        icon_name: 'heart',
        rarity: 'rare',
        criteria: { minLikesReceived: 500 }
      },
      'philosopher': {
        category: 'community',
        title: 'Philosopher',
        description: 'Wrote 25+ thoughtful reflections',
        icon_name: 'book',
        rarity: 'uncommon',
        criteria: { minReflections: 25 }
      },
      'mentor': {
        category: 'community',
        title: 'Mentor',
        description: 'Helped 10+ new users with guidance',
        icon_name: 'graduation-cap',
        rarity: 'epic',
        criteria: { mentorPoints: 100 }
      },

      // Special Achievement Badges
      'early_adopter': {
        category: 'special',
        title: 'Early Adopter',
        description: 'Joined Bitredict in the first month',
        icon_name: 'rocket',
        rarity: 'legendary',
        criteria: { joinedBefore: '2024-12-31' }
      },
      'bug_hunter': {
        category: 'special',
        title: 'Bug Hunter',
        description: 'Reported a critical bug',
        icon_name: 'bug',
        rarity: 'epic',
        criteria: { bugReports: 1 }
      },
      'diamond_hands': {
        category: 'special',
        title: 'Diamond Hands',
        description: 'Held position through 5+ pool swings',
        icon_name: 'diamond',
        rarity: 'rare',
        criteria: { diamondHands: 5 }
      }
    };
  }

  // Check and award badges for a specific user
  async checkAndAwardBadges(userAddress) {
    try {
      const userStats = await this.getUserStats(userAddress);
      const currentBadges = await this.getCurrentBadges(userAddress);
      const currentBadgeTypes = currentBadges.map(b => b.badge_type);

      for (const [badgeType, badgeConfig] of Object.entries(this.badges)) {
        // Skip if user already has this badge
        if (currentBadgeTypes.includes(badgeType)) continue;

        // Check if user meets criteria
        if (await this.checkBadgeCriteria(userStats, badgeConfig)) {
          await this.awardBadge(userAddress, badgeType, badgeConfig, userStats);
        }
      }
    } catch (error) {
      console.error('Error checking badges for user:', userAddress, error);
    }
  }

  // Get comprehensive user stats
  async getUserStats(userAddress) {
    const [userBasic, socialStats, poolStats, betStats, oddysseyStats] = await Promise.all([
      // Basic user info
      db.query(`
        SELECT * FROM core.users WHERE address = $1
      `, [userAddress]),

      // Social stats
      db.query(`
        SELECT * FROM analytics.user_social_stats WHERE user_address = $1
      `, [userAddress]),

      // Pool creation stats
      db.query(`
        SELECT 
          COUNT(*) as total_pools,
          COUNT(CASE WHEN creator_side_won = true THEN 1 END) as won_pools,
          SUM(creator_stake) as total_stake,
          COUNT(DISTINCT category) as categories_count,
          MAX(participant_count) as max_participants
        FROM analytics.pools 
        WHERE creator_address = $1 AND is_settled = true
      `, [userAddress]),

      // Betting stats
      db.query(`
        SELECT 
          COUNT(*) as total_bets,
          COUNT(CASE WHEN won = true THEN 1 END) as won_bets,
          COUNT(DISTINCT pool_id) as unique_pools,
          COUNT(DISTINCT ap.creator_address) as unique_creators,
          MAX(current_streak) as max_streak
        FROM prediction.bets pb
        LEFT JOIN analytics.pools ap ON pb.pool_id = ap.pool_id
        WHERE pb.user_address = $1
      `, [userAddress]),

      // Oddyssey stats
      db.query(`
        SELECT 
          COUNT(*) as total_cycles,
          COUNT(CASE WHEN final_score > 0 THEN 1 END) as won_cycles,
          MAX(correct_count) as best_correct,
          COUNT(CASE WHEN correct_count = 10 THEN 1 END) as perfect_scores,
          SUM(CASE WHEN correct_count >= 7 THEN 1 ELSE 0 END) as qualifying_scores
        FROM oracle.oddyssey_slips 
        WHERE player_address = $1 AND is_evaluated = true
      `, [userAddress])
    ]);

    const stats = {
      user: userBasic.rows[0] || {},
      social: socialStats.rows[0] || {},
      pools: poolStats.rows[0] || {},
      bets: betStats.rows[0] || {},
      oddyssey: oddysseyStats.rows[0] || {}
    };

    // Calculate derived stats
    stats.pools.win_rate = stats.pools.total_pools > 0 
      ? stats.pools.won_pools / stats.pools.total_pools 
      : 0;
    
    stats.bets.win_rate = stats.bets.total_bets > 0 
      ? stats.bets.won_bets / stats.bets.total_bets 
      : 0;

    return stats;
  }

  // Get user's current badges
  async getCurrentBadges(userAddress) {
    const result = await db.query(`
      SELECT badge_type FROM core.user_badges 
      WHERE user_address = $1 AND is_active = true
    `, [userAddress]);
    return result.rows;
  }

  // Check if user meets specific badge criteria
  async checkBadgeCriteria(userStats, badgeConfig) {
    const criteria = badgeConfig.criteria;

    switch (badgeConfig.category) {
      case 'creator':
        return this.checkCreatorCriteria(userStats, criteria);
      case 'bettor':
        return this.checkBettorCriteria(userStats, criteria);
      case 'community':
        return this.checkCommunityCriteria(userStats, criteria);
      case 'oddyssey':
        return this.checkOddysseyCriteria(userStats, criteria);
      case 'special':
        return this.checkSpecialCriteria(userStats, criteria);
      default:
        return false;
    }
  }

  checkCreatorCriteria(stats, criteria) {
    if (criteria.minPools && stats.pools.total_pools < criteria.minPools) return false;
    if (criteria.minWinRate && stats.pools.win_rate < criteria.minWinRate) return false;
    if (criteria.minTotalStake && stats.pools.total_stake < criteria.minTotalStake) return false;
    if (criteria.minCategories && stats.pools.categories_count < criteria.minCategories) return false;
    if (criteria.minBettorsInPool && stats.pools.max_participants < criteria.minBettorsInPool) return false;
    if (criteria.comebackWins) {
      // This would need more complex logic to track comeback patterns
      // For now, we'll use a simplified check
      return stats.pools.won_pools >= criteria.comebackWins;
    }
    return true;
  }

  checkBettorCriteria(stats, criteria) {
    if (criteria.minBets && stats.bets.total_bets < criteria.minBets) return false;
    if (criteria.minWinRate && stats.bets.win_rate < criteria.minWinRate) return false;
    if (criteria.winStreak && stats.user.max_win_streak < criteria.winStreak) return false;
    if (criteria.minUniqueCreators && stats.bets.unique_creators < criteria.minUniqueCreators) return false;
    if (criteria.beatCreatorWinRate) {
      // This would need a more complex query to check if they beat high-win-rate creators
      return stats.bets.won_bets > 0; // Simplified for now
    }
    if (criteria.minHighOddsBets) {
      // Would need to track high-odds bets separately
      return stats.bets.won_bets >= criteria.minHighOddsBets; // Simplified
    }
    return true;
  }

  checkCommunityCriteria(stats, criteria) {
    if (criteria.minComments && stats.social.total_comments < criteria.minComments) return false;
    if (criteria.minLikesReceived && stats.social.total_likes_received < criteria.minLikesReceived) return false;
    if (criteria.minReflections && stats.social.total_reflections < criteria.minReflections) return false;
    if (criteria.mentorPoints) {
      // Would need a mentor scoring system
      return stats.social.community_influence_score >= criteria.mentorPoints;
    }
    return true;
  }

  checkSpecialCriteria(stats, criteria) {
    if (criteria.joinedBefore) {
      const joinDate = new Date(stats.user.joined_at);
      const beforeDate = new Date(criteria.joinedBefore);
      return joinDate <= beforeDate;
    }
    // Other special criteria would be manually awarded
    return false;
  }

  checkOddysseyCriteria(stats, criteria) {
    if (criteria.minOddysseyCycles && stats.oddyssey.total_cycles < criteria.minOddysseyCycles) return false;
    if (criteria.minOddysseyCorrect && stats.oddyssey.best_correct < criteria.minOddysseyCorrect) return false;
    if (criteria.perfectOddysseyScore && stats.oddyssey.best_correct < 10) return false;
    if (criteria.minOddysseyWins && stats.oddyssey.won_cycles < criteria.minOddysseyWins) return false;
    if (criteria.minOddysseyReputation && stats.oddyssey.reputation < criteria.minOddysseyReputation) return false;
    return true;
  }

  // Award a badge to a user
  async awardBadge(userAddress, badgeType, badgeConfig, userStats) {
    try {
      await db.query(`
        INSERT INTO core.user_badges 
        (user_address, badge_type, badge_category, title, description, icon_name, rarity, criteria_met)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        userAddress,
        badgeType,
        badgeConfig.category,
        badgeConfig.title,
        badgeConfig.description,
        badgeConfig.icon_name,
        badgeConfig.rarity,
        JSON.stringify(userStats)
      ]);

      console.log(`🏆 Badge awarded: ${badgeConfig.title} to ${userAddress}`);

      // Send notification
      await notificationService.notifyBadgeEarned(userAddress, {
        badgeType,
        category: badgeConfig.category
      });

      // Award BITR rewards for special badges
      if (badgeConfig.rarity === 'legendary') {
        await this.awardBitrForBadge(userAddress, badgeType, 1000);
      } else if (badgeConfig.rarity === 'epic') {
        await this.awardBitrForBadge(userAddress, badgeType, 500);
      } else if (badgeConfig.rarity === 'rare') {
        await this.awardBitrForBadge(userAddress, badgeType, 250);
      }

    } catch (error) {
      console.error('Error awarding badge:', error);
    }
  }

  // Award BITR for badge achievements
  async awardBitrForBadge(userAddress, badgeType, amount) {
    try {
      await db.query(`
        INSERT INTO analytics.bitr_rewards 
        (user_address, pool_id, reward_type, reward_amount, eligibility_criteria)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        userAddress,
        'badge_' + badgeType,
        'badge_achievement',
        amount,
        JSON.stringify({ badgeType, rarity: this.badges[badgeType].rarity })
      ]);

      console.log(`💰 BITR reward: ${amount} awarded for badge ${badgeType}`);
    } catch (error) {
      console.error('Error awarding BITR for badge:', error);
    }
  }

  // Check badges for all active users (periodic task)
  async checkAllUserBadges() {
    try {
      const activeUsers = await db.query(`
        SELECT DISTINCT address FROM core.users 
        WHERE last_active > NOW() - INTERVAL '30 days'
      `);

      for (const user of activeUsers.rows) {
        await this.checkAndAwardBadges(user.address);
        // Add small delay to prevent overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`✅ Badge check completed for ${activeUsers.rows.length} users`);
    } catch (error) {
      console.error('Error in batch badge check:', error);
    }
  }

  // Get badge leaderboard
  async getBadgeLeaderboard() {
    try {
      const result = await db.query(`
        SELECT 
          ub.user_address,
          u.reputation,
          COUNT(*) as total_badges,
          COUNT(CASE WHEN ub.rarity = 'legendary' THEN 1 END) as legendary_badges,
          COUNT(CASE WHEN ub.rarity = 'epic' THEN 1 END) as epic_badges,
          COUNT(CASE WHEN ub.rarity = 'rare' THEN 1 END) as rare_badges
        FROM core.user_badges ub
        LEFT JOIN core.users u ON ub.user_address = u.address
        WHERE ub.is_active = true
        GROUP BY ub.user_address, u.reputation
        ORDER BY legendary_badges DESC, epic_badges DESC, rare_badges DESC, total_badges DESC
        LIMIT 100
      `);

      return result.rows;
    } catch (error) {
      console.error('Error fetching badge leaderboard:', error);
      return [];
    }
  }
  /**
   * Check all badges for a user (wrapper for checkAndAwardBadges)
   */
  async checkAllBadges(userAddress) {
    return this.checkAndAwardBadges(userAddress);
  }

  /**
   * Check Oddyssey-specific badges for a user
   */
  async checkOddysseyBadges(userAddress) {
    // Get user stats
    const userStats = await this.getUserStats(userAddress);
    
    // Check only Oddyssey badges
    const oddysseyBadges = Object.entries(this.badges).filter(([_, badge]) => 
      badge.category === 'oddyssey'
    );
    
    for (const [badgeType, badgeConfig] of oddysseyBadges) {
      const eligible = await this.checkBadgeCriteria(userStats, badgeConfig);
      if (eligible) {
        await this.awardBadge(userAddress, badgeType, badgeConfig, userStats);
      }
    }
  }
}

module.exports = new BadgeManager(); 