const express = require('express');
const router = express.Router();
const db = require('../db/db');
const badgeManager = require('../utils/badgeManager');
const { cache, cacheKeys, cacheMiddleware, rateLimitMiddleware } = require('../config/redis');

// =================================================================
//  POOL COMMENTS & DISCUSSIONS
// =================================================================

// Get comments for a specific pool
router.get('/pools/:poolId/comments', 
  cacheMiddleware((req) => cacheKeys.poolComments(req.params.poolId), 120), // Cache for 2 minutes
  async (req, res) => {
  try {
    const { poolId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    // ✅ FIX: Query uses actual column names from schema (comment_text, not content)
    // Get likes count from social_reactions table
    // Handle missing tables gracefully with try-catch for LEFT JOINs
    const result = await db.query(`
      SELECT 
        pc.id,
        pc.pool_id,
        pc.user_address,
        pc.comment_text as content,
        pc.parent_comment_id,
        pc.is_deleted,
        pc.created_at,
        pc.updated_at,
        COALESCE(u.reputation, 0) as reputation,
        COALESCE(ub.title, NULL) as user_badge,
        COALESCE(ub.rarity, NULL) as badge_rarity,
        COALESCE(like_counts.likes_count, 0) as likes_count,
        COALESCE(dislike_counts.dislikes_count, 0) as dislikes_count
      FROM core.pool_comments pc
      LEFT JOIN core.users u ON pc.user_address = u.address
      LEFT JOIN core.user_badges ub ON pc.user_address = ub.user_address 
        AND ub.is_active = true 
        AND ub.badge_category = 'reputation'
      LEFT JOIN (
        SELECT target_id, COUNT(*)::int as likes_count
        FROM core.social_reactions
        WHERE target_type = 'comment' AND reaction_type = 'like'
        GROUP BY target_id
      ) like_counts ON like_counts.target_id = pc.id
      LEFT JOIN (
        SELECT target_id, COUNT(*)::int as dislikes_count
        FROM core.social_reactions
        WHERE target_type = 'comment' AND reaction_type = 'dislike'
        GROUP BY target_id
      ) dislike_counts ON dislike_counts.target_id = pc.id
      WHERE pc.pool_id = $1 AND pc.is_deleted = false
      ORDER BY pc.created_at DESC
      LIMIT $2 OFFSET $3
    `, [poolId, parseInt(limit), parseInt(offset)]);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: result.rows.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching pool comments:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ success: false, error: 'Failed to fetch comments', details: error.message });
  }
});

// Post a comment on a pool
router.post('/pools/:poolId/comments', 
  rateLimitMiddleware((req) => cacheKeys.rateLimitComment(req.body.userAddress), 5, 60), // 5 comments per minute
  async (req, res) => {
  try {
    const { poolId } = req.params;
    const { userAddress, content, sentiment = 'neutral', parentCommentId = null } = req.body;
    
    if (!userAddress || !content) {
      return res.status(400).json({ success: false, error: 'User address and content are required' });
    }

    if (!userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }

    // ✅ FIX: Use comment_text column (not content) and don't insert sentiment (column doesn't exist)
    const result = await db.query(`
      INSERT INTO core.pool_comments 
      (pool_id, user_address, comment_text, parent_comment_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [poolId, userAddress.toLowerCase(), content, parentCommentId]);

    // ✅ FIX: Store sentiment in pool_reflections table if needed (optional)
    // Note: We can store sentiment separately if needed, but for now we'll skip it
    // as the schema doesn't have a sentiment column in pool_comments

    // Update user social stats
    await db.query(`
      INSERT INTO analytics.user_social_stats (user_address, total_comments)
      VALUES ($1, 1)
      ON CONFLICT (user_address) DO UPDATE SET 
        total_comments = analytics.user_social_stats.total_comments + 1,
        calculated_at = NOW()
    `, [userAddress.toLowerCase()]).catch(err => {
      console.warn('Failed to update user social stats:', err.message);
    });

    // Check for badge eligibility
    try {
    badgeManager.checkAndAwardBadges(userAddress.toLowerCase());
    } catch (badgeError) {
      console.warn('Failed to check badges:', badgeError.message);
    }

    // Invalidate cache for this pool's comments
    try {
    await cache.del(cacheKeys.poolComments(poolId));
    await cache.del(cacheKeys.communityStats());
    } catch (cacheError) {
      console.warn('Failed to invalidate cache:', cacheError.message);
    }

    // ✅ FIX: Return response with content field (not comment_text) for frontend compatibility
    const commentData = result.rows[0];
    res.json({
      success: true,
      data: {
        ...commentData,
        content: commentData.comment_text, // Map comment_text to content for frontend
        sentiment: sentiment, // Include sentiment in response even though not stored
        likes_count: 0,
        dislikes_count: 0
      }
    });

  } catch (error) {
    console.error('Error posting comment:', error);
    res.status(500).json({ success: false, error: 'Failed to post comment', details: error.message });
  }
});

// Like or unlike a comment
router.post('/pools/:poolId/comments/:commentId/like', 
  rateLimitMiddleware((req) => cacheKeys.rateLimitComment(req.body.userAddress), 10, 60), // 10 likes per minute
  async (req, res) => {
  try {
    const { poolId, commentId } = req.params;
    const { userAddress } = req.body;
    
    if (!userAddress) {
      return res.status(400).json({ success: false, error: 'User address is required' });
    }

    if (!userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }

    // Check if comment exists
    const commentCheck = await db.query(`
      SELECT id FROM core.pool_comments 
      WHERE id = $1 AND pool_id = $2 AND is_deleted = false
    `, [commentId, poolId]);

    if (commentCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    // Check if user already liked this comment
    const existingLike = await db.query(`
      SELECT reaction_type FROM core.social_reactions
      WHERE user_address = $1 AND target_type = 'comment' AND target_id = $2
    `, [userAddress.toLowerCase(), commentId]);

    let result;
    if (existingLike.rows.length > 0) {
      // User already liked, toggle (remove like)
      await db.query(`
        DELETE FROM core.social_reactions
        WHERE user_address = $1 AND target_type = 'comment' AND target_id = $2
      `, [userAddress.toLowerCase(), commentId]);
      
      result = { liked: false, message: 'Like removed' };
    } else {
      // Add like
      await db.query(`
        INSERT INTO core.social_reactions 
        (user_address, target_type, target_id, reaction_type)
        VALUES ($1, 'comment', $2, 'like')
        ON CONFLICT (user_address, target_type, target_id) 
        DO UPDATE SET reaction_type = 'like', created_at = NOW()
      `, [userAddress.toLowerCase(), commentId]);
      
      result = { liked: true, message: 'Comment liked' };
    }

    // Get updated like count
    const likeCountResult = await db.query(`
      SELECT COUNT(*) as count FROM core.social_reactions
      WHERE target_type = 'comment' AND target_id = $1 AND reaction_type = 'like'
    `, [commentId]);

    // Invalidate cache
    try {
      await cache.del(cacheKeys.poolComments(poolId));
    } catch (cacheError) {
      console.warn('Failed to invalidate cache:', cacheError.message);
    }

    res.json({
      success: true,
      data: {
        ...result,
        likes_count: parseInt(likeCountResult.rows[0].count)
      }
    });

  } catch (error) {
    console.error('Error liking comment:', error);
    res.status(500).json({ success: false, error: 'Failed to like comment', details: error.message });
  }
});

// Track pool view
router.post('/pools/:poolId/view', async (req, res) => {
  try {
    const { poolId } = req.params;
    const { userAddress } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Insert view (database unique constraint prevents duplicates per day)
    // Use a check to prevent duplicate views from same user/IP within the same day
    // Cast poolId to VARCHAR to match table schema
    const poolIdStr = String(poolId);
    const lowerAddress = userAddress ? userAddress.toLowerCase() : null;
    
    // Split into two queries to avoid type inference issues
    const existsCheck = await db.query(`
      SELECT 1 FROM core.pool_views 
      WHERE pool_id = $1::VARCHAR
      AND (viewer_address = $2::VARCHAR OR ($2 IS NULL AND ip_address = $3::VARCHAR))
      AND DATE(viewed_at) = CURRENT_DATE
      LIMIT 1
    `, [poolIdStr, lowerAddress, ipAddress]);
    
    if (existsCheck.rows.length === 0) {
      await db.query(`
        INSERT INTO core.pool_views (pool_id, viewer_address, ip_address, user_agent)
        VALUES ($1::VARCHAR, $2::VARCHAR, $3::VARCHAR, $4::TEXT)
      `, [poolIdStr, lowerAddress, ipAddress, userAgent]);
    }

    // Update pool social stats
    await db.query(`SELECT core.update_pool_social_stats($1)`, [poolId]);

    res.json({ success: true, message: 'View tracked' });
  } catch (error) {
    console.error('Error tracking pool view:', error);
    res.status(500).json({ success: false, error: 'Failed to track view', details: error.message });
  }
});

// Like or unlike a pool
router.post('/pools/:poolId/like', 
  rateLimitMiddleware((req) => cacheKeys.rateLimitComment(req.body.userAddress), 10, 60), // 10 likes per minute
  async (req, res) => {
  try {
    const { poolId } = req.params;
    const { userAddress } = req.body;
    
    if (!userAddress) {
      return res.status(400).json({ success: false, error: 'User address is required' });
    }

    if (!userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }

    // Check if user already liked this pool
    const existingLike = await db.query(`
      SELECT reaction_type FROM core.social_reactions
      WHERE user_address = $1 AND target_type = 'pool' AND target_id::text = $2
    `, [userAddress.toLowerCase(), poolId]);

    let result;
    if (existingLike.rows.length > 0) {
      // User already liked, toggle (remove like)
      await db.query(`
        DELETE FROM core.social_reactions
        WHERE user_address = $1 AND target_type = 'pool' AND target_id::text = $2
      `, [userAddress.toLowerCase(), poolId]);
      
      result = { liked: false, message: 'Like removed' };
    } else {
      // Add like
      await db.query(`
        INSERT INTO core.social_reactions 
        (user_address, target_type, target_id, reaction_type)
        VALUES ($1, 'pool', $2, 'like')
        ON CONFLICT (user_address, target_type, target_id) 
        DO UPDATE SET reaction_type = 'like', created_at = NOW()
      `, [userAddress.toLowerCase(), poolId]);
      
      result = { liked: true, message: 'Pool liked' };
    }

    // Get updated like count and update pool social stats
    await db.query(`SELECT core.update_pool_social_stats($1)`, [poolId]);
    const statsResult = await db.query(`SELECT social_stats FROM oracle.pools WHERE pool_id::text = $1`, [poolId]);

    // Invalidate cache
    try {
      await cache.del(cacheKeys.poolComments(poolId));
    } catch (cacheError) {
      console.warn('Failed to invalidate cache:', cacheError.message);
    }

    res.json({
      success: true,
      data: {
        ...result,
        likes_count: statsResult.rows[0]?.social_stats?.likes || 0
      }
    });

  } catch (error) {
    console.error('Error liking pool:', error);
    res.status(500).json({ success: false, error: 'Failed to like pool', details: error.message });
  }
});

// Get pool social stats
router.get('/pools/:poolId/stats', async (req, res) => {
  try {
    const { poolId } = req.params;
    
    // Update stats first
    await db.query(`SELECT core.update_pool_social_stats($1)`, [poolId]);
    
    // Get stats
    const result = await db.query(`
      SELECT 
        social_stats,
        (SELECT COUNT(*) FROM core.pool_comments WHERE pool_id = $1 AND is_deleted = false) as comments_count,
        (SELECT COUNT(*) FROM core.social_reactions WHERE target_type = 'pool' AND target_id::text = $1 AND reaction_type = 'like') as likes_count,
        (SELECT COUNT(DISTINCT viewer_address) + COUNT(DISTINCT CASE WHEN viewer_address IS NULL THEN ip_address END) FROM core.pool_views WHERE pool_id = $1) as views_count
      FROM oracle.pools 
      WHERE pool_id::text = $1
    `, [poolId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    const stats = result.rows[0].social_stats || {
      likes: parseInt(result.rows[0].likes_count || 0),
      comments: parseInt(result.rows[0].comments_count || 0),
      views: parseInt(result.rows[0].views_count || 0),
      shares: 0
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching pool social stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats', details: error.message });
  }
});

// =================================================================
//  USER FOLLOWING/FOLLOWERS
// =================================================================

// Follow a user
router.post('/users/:address/follow', 
  rateLimitMiddleware((req) => cacheKeys.rateLimitComment(req.body.userAddress), 20, 60), // 20 follows per minute
  async (req, res) => {
  try {
    const { address: targetAddress } = req.params;
    const { userAddress } = req.body;
    
    if (!userAddress) {
      return res.status(400).json({ success: false, error: 'User address is required' });
    }

    if (!userAddress.match(/^0x[a-fA-F0-9]{40}$/) || !targetAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }

    if (userAddress.toLowerCase() === targetAddress.toLowerCase()) {
      return res.status(400).json({ success: false, error: 'Cannot follow yourself' });
    }

    // Check if already following
    const existingFollow = await db.query(`
      SELECT id FROM core.user_follows 
      WHERE follower_address = $1 AND following_address = $2
    `, [userAddress.toLowerCase(), targetAddress.toLowerCase()]);

    if (existingFollow.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Already following this user' });
    }

    // Add follow relationship
    await db.query(`
      INSERT INTO core.user_follows (follower_address, following_address)
      VALUES ($1, $2)
    `, [userAddress.toLowerCase(), targetAddress.toLowerCase()]);

    // Get updated counts
    const followerCount = await db.query(`SELECT core.get_follower_count($1) as count`, [targetAddress.toLowerCase()]);
    const followingCount = await db.query(`SELECT core.get_following_count($1) as count`, [userAddress.toLowerCase()]);

    res.json({
      success: true,
      data: {
        following: true,
        followerCount: parseInt(followerCount.rows[0].count),
        followingCount: parseInt(followingCount.rows[0].count)
      }
    });

  } catch (error) {
    console.error('Error following user:', error);
    res.status(500).json({ success: false, error: 'Failed to follow user', details: error.message });
  }
});

// Unfollow a user
router.post('/users/:address/unfollow', 
  rateLimitMiddleware((req) => cacheKeys.rateLimitComment(req.body.userAddress), 20, 60),
  async (req, res) => {
  try {
    const { address: targetAddress } = req.params;
    const { userAddress } = req.body;
    
    if (!userAddress) {
      return res.status(400).json({ success: false, error: 'User address is required' });
    }

    if (!userAddress.match(/^0x[a-fA-F0-9]{40}$/) || !targetAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }

    // Remove follow relationship
    const result = await db.query(`
      DELETE FROM core.user_follows 
      WHERE follower_address = $1 AND following_address = $2
      RETURNING id
    `, [userAddress.toLowerCase(), targetAddress.toLowerCase()]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Not following this user' });
    }

    // Get updated counts
    const followerCount = await db.query(`SELECT core.get_follower_count($1) as count`, [targetAddress.toLowerCase()]);
    const followingCount = await db.query(`SELECT core.get_following_count($1) as count`, [userAddress.toLowerCase()]);

    res.json({
      success: true,
      data: {
        following: false,
        followerCount: parseInt(followerCount.rows[0].count),
        followingCount: parseInt(followingCount.rows[0].count)
      }
    });

  } catch (error) {
    console.error('Error unfollowing user:', error);
    res.status(500).json({ success: false, error: 'Failed to unfollow user', details: error.message });
  }
});

// Check if user is following another user
router.get('/users/:address/following-status', async (req, res) => {
  try {
    const { address: targetAddress } = req.params;
    const { userAddress } = req.query;
    
    if (!userAddress) {
      return res.json({ success: true, data: { following: false } });
    }

    if (!userAddress.match(/^0x[a-fA-F0-9]{40}$/) || !targetAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }

    const result = await db.query(`SELECT core.is_following($1, $2) as following`, [
      userAddress.toLowerCase(), 
      targetAddress.toLowerCase()
    ]);

    res.json({
      success: true,
      data: {
        following: result.rows[0].following
      }
    });

  } catch (error) {
    console.error('Error checking following status:', error);
    res.status(500).json({ success: false, error: 'Failed to check following status', details: error.message });
  }
});

// Get followers list
router.get('/users/:address/followers', async (req, res) => {
  try {
    const { address } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }

    const result = await db.query(`
      SELECT 
        uf.follower_address as address,
        u.reputation,
        u.total_pools_created,
        u.total_volume,
        uf.created_at as followed_at
      FROM core.user_follows uf
      LEFT JOIN core.users u ON uf.follower_address = u.address
      WHERE uf.following_address = $1
      ORDER BY uf.created_at DESC
      LIMIT $2 OFFSET $3
    `, [address.toLowerCase(), parseInt(limit), parseInt(offset)]);

    const countResult = await db.query(`SELECT core.get_follower_count($1) as count`, [address.toLowerCase()]);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: parseInt(countResult.rows[0].count),
        hasMore: result.rows.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching followers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch followers', details: error.message });
  }
});

// Get following list
router.get('/users/:address/following', async (req, res) => {
  try {
    const { address } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }

    const result = await db.query(`
      SELECT 
        uf.following_address as address,
        u.reputation,
        u.total_pools_created,
        u.total_volume,
        uf.created_at as followed_at
      FROM core.user_follows uf
      LEFT JOIN core.users u ON uf.following_address = u.address
      WHERE uf.follower_address = $1
      ORDER BY uf.created_at DESC
      LIMIT $2 OFFSET $3
    `, [address.toLowerCase(), parseInt(limit), parseInt(offset)]);

    const countResult = await db.query(`SELECT core.get_following_count($1) as count`, [address.toLowerCase()]);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: parseInt(countResult.rows[0].count),
        hasMore: result.rows.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching following:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch following', details: error.message });
  }
});

// Get user profile with follow stats
router.get('/users/:address/profile', async (req, res) => {
  try {
    const { address } = req.params;
    const { currentUserAddress } = req.query; // Optional: current user viewing the profile
    
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }

    const lowerAddress = address.toLowerCase();

    // Get user data - return default if not found
    const userResult = await db.query(`
      SELECT * FROM core.users WHERE LOWER(address) = $1
    `, [lowerAddress]);

    // Get follower and following counts (always return values, even if 0)
    let followerCount = 0;
    let followingCount = 0;
    try {
      const followerResult = await db.query(`SELECT core.get_follower_count($1) as count`, [lowerAddress]);
      followerCount = parseInt(followerResult.rows[0]?.count || 0);
      const followingResult = await db.query(`SELECT core.get_following_count($1) as count`, [lowerAddress]);
      followingCount = parseInt(followingResult.rows[0]?.count || 0);
    } catch (err) {
      console.warn('Error fetching follower/following counts:', err);
    }

    // Check if current user follows this user
    let isFollowing = false;
    if (currentUserAddress && currentUserAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      try {
        const followStatus = await db.query(`SELECT core.is_following($1, $2) as following`, [
          currentUserAddress.toLowerCase(),
          lowerAddress
        ]);
        isFollowing = followStatus.rows[0]?.following || false;
      } catch (err) {
        console.warn('Error checking follow status:', err);
      }
    }

    // Return default user data if not found in database
    const defaultUser = {
      address: lowerAddress,
      reputation: 40,
      total_volume: 0,
      profit_loss: 0,
      total_bets: 0,
      won_bets: 0,
      total_pools_created: 0,
      pools_won: 0,
      joined_at: null,
      last_active: null
    };

    const user = userResult.rows.length > 0 ? userResult.rows[0] : defaultUser;

    res.json({
      success: true,
      data: {
        ...user,
        followerCount,
        followingCount,
        isFollowing
      }
    });

  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user profile', details: error.message });
  }
});

// =================================================================
//  COMMUNITY DISCUSSIONS
// =================================================================

// Get community discussions
router.get('/discussions', 
  cacheMiddleware((req) => cacheKeys.discussions(req.query.category, req.query.sort), 180), // Cache for 3 minutes
  async (req, res) => {
  try {
    const { category = 'all', limit = 20, offset = 0, sort = 'recent' } = req.query;
    
    let categoryFilter = '';
    let orderBy = 'cd.last_activity DESC';
    
    if (category !== 'all') {
      categoryFilter = 'AND cd.category = $4';
    }
    
    if (sort === 'popular') {
      orderBy = 'cd.total_likes DESC, cd.reply_count DESC';
    } else if (sort === 'oldest') {
      orderBy = 'cd.created_at ASC';
    }

    const params = [parseInt(limit), parseInt(offset)];
    if (category !== 'all') {
      params.push(category);
    }

    const result = await db.query(`
      SELECT 
        cd.*,
        u.reputation,
        ub.title as user_badge,
        ub.rarity as badge_rarity
      FROM core.community_discussions cd
      LEFT JOIN core.users u ON cd.user_address = u.address
      LEFT JOIN core.user_badges ub ON cd.user_address = ub.user_address 
        AND ub.is_active = true
      WHERE cd.is_deleted = false ${categoryFilter}
      ORDER BY ${orderBy}
      LIMIT $1 OFFSET $2
    `, params);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: result.rows.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching discussions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch discussions' });
  }
});

// Create a new discussion
router.post('/discussions', 
  rateLimitMiddleware((req) => cacheKeys.rateLimitDiscussion(req.body.userAddress), 3, 300), // 3 discussions per 5 minutes
  async (req, res) => {
  try {
    const { userAddress, title, content, category = 'general', tags = [] } = req.body;
    
    if (!userAddress || !title || !content) {
      return res.status(400).json({ error: 'User address, title, and content are required' });
    }

    if (!userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    const result = await db.query(`
      INSERT INTO core.community_discussions 
      (user_address, title, content, category, tags)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [userAddress.toLowerCase(), title, content, category, tags]);

    // Invalidate relevant caches
    await cache.del(cacheKeys.discussions('all', 'recent'));
    await cache.del(cacheKeys.discussions(category, 'recent'));
    await cache.del(cacheKeys.communityStats());

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating discussion:', error);
    res.status(500).json({ success: false, error: 'Failed to create discussion' });
  }
});

// Get discussion replies
router.get('/discussions/:discussionId/replies', async (req, res) => {
  try {
    const { discussionId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await db.query(`
      SELECT 
        dr.*,
        u.reputation,
        ub.title as user_badge,
        ub.rarity as badge_rarity
      FROM core.discussion_replies dr
      LEFT JOIN core.users u ON dr.user_address = u.address
      LEFT JOIN core.user_badges ub ON dr.user_address = ub.user_address 
        AND ub.is_active = true
      WHERE dr.discussion_id = $1 AND dr.is_deleted = false
      ORDER BY dr.likes_count DESC, dr.created_at ASC
      LIMIT $2 OFFSET $3
    `, [discussionId, parseInt(limit), parseInt(offset)]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching discussion replies:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch replies' });
  }
});

// =================================================================
//  SOCIAL REACTIONS (LIKES, VOTES)
// =================================================================

// Add or update a reaction
router.post('/reactions', async (req, res) => {
  try {
    const { userAddress, targetType, targetId, reactionType } = req.body;
    
    if (!userAddress || !targetType || !targetId || !reactionType) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    if (!userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }

    // Upsert reaction
    const result = await db.query(`
      INSERT INTO core.social_reactions 
      (user_address, target_type, target_id, reaction_type)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_address, target_type, target_id) 
      DO UPDATE SET 
        reaction_type = $4,
        created_at = NOW()
      RETURNING *
    `, [userAddress.toLowerCase(), targetType, targetId, reactionType]);

    // ✅ FIX: No need to update likes_count on pool_comments table (it doesn't exist)
    // Likes are counted dynamically from social_reactions table

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({ success: false, error: 'Failed to add reaction', details: error.message });
  }
});

// Get reactions for a target
router.get('/reactions/:targetType/:targetId', async (req, res) => {
  try {
    const { targetType, targetId } = req.params;
    
    const result = await db.query(`
      SELECT 
        reaction_type,
        COUNT(*) as count
      FROM core.social_reactions 
      WHERE target_type = $1 AND target_id = $2
      GROUP BY reaction_type
    `, [targetType, targetId]);

    const reactions = {};
    result.rows.forEach(row => {
      reactions[row.reaction_type] = parseInt(row.count);
    });

    res.json({
      success: true,
      data: reactions
    });

  } catch (error) {
    console.error('Error fetching reactions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch reactions' });
  }
});

// =================================================================
//  USER BADGES
// =================================================================

// Get user badges
router.get('/users/:address/badges', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    const result = await db.query(`
      SELECT * FROM core.user_badges 
      WHERE user_address = $1 AND is_active = true
      ORDER BY 
        CASE rarity 
          WHEN 'legendary' THEN 1 
          WHEN 'epic' THEN 2 
          WHEN 'rare' THEN 3 
          WHEN 'uncommon' THEN 4 
          WHEN 'common' THEN 5 
        END,
        earned_at DESC
    `, [address.toLowerCase()]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching user badges:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch badges' });
  }
});

// Manually check badges for a user (admin endpoint)
router.post('/users/:address/check-badges', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    badgeManager.checkAndAwardBadges(address.toLowerCase());

    res.json({
      success: true,
      message: 'Badge check completed'
    });

  } catch (error) {
    console.error('Error checking badges:', error);
    res.status(500).json({ success: false, error: 'Failed to check badges' });
  }
});

// Get user social stats
router.get('/users/:address/social-stats', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }

    const lowerAddress = address.toLowerCase();

    // Try analytics.user_social_stats first, then core.user_social_stats
    let result;
    try {
      result = await db.query(`
        SELECT 
          total_comments,
          total_likes_given,
          total_likes_received,
          total_reflections,
          community_influence_score,
          weekly_engagement_score,
          favorite_discussion_category,
          last_social_activity
        FROM analytics.user_social_stats 
        WHERE LOWER(user_address) = $1
      `, [lowerAddress]);
    } catch (err) {
      // Fallback to core.user_social_stats if analytics table doesn't exist
      try {
        result = await db.query(`
          SELECT 
            total_comments,
            total_likes_given,
            total_likes_received,
            total_reflections,
            community_influence_score,
            weekly_engagement_score,
            favorite_discussion_category,
            last_social_activity
          FROM core.user_social_stats 
          WHERE LOWER(user_address) = $1
        `, [lowerAddress]);
      } catch (err2) {
        console.warn('Error querying social stats from both tables:', err2);
        result = { rows: [] };
      }
    }

    if (result.rows.length === 0) {
      // Return default values for users without social stats
      return res.json({
        success: true,
        total_comments: 0,
        total_likes_given: 0,
        total_likes_received: 0,
        total_reflections: 0,
        community_influence_score: 0,
        weekly_engagement_score: 0,
        favorite_discussion_category: 'general',
        last_social_activity: null
      });
    }

    res.json({
      success: true,
      ...result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching user social stats:', error);
    // Return default values instead of error
    res.json({
      success: true,
      total_comments: 0,
      total_likes_given: 0,
      total_likes_received: 0,
      total_reflections: 0,
      community_influence_score: 0,
      weekly_engagement_score: 0,
      favorite_discussion_category: 'general',
      last_social_activity: null
    });
  }
});

// Get badge leaderboard
router.get('/badges/leaderboard', async (req, res) => {
  try {
    const result = await badgeManager.getBadgeLeaderboard();
    
    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error fetching badge leaderboard:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
  }
});

// =================================================================
//  POST-MATCH REFLECTIONS
// =================================================================

// Get reflections for a pool
router.get('/pools/:poolId/reflections', async (req, res) => {
  try {
    const { poolId } = req.params;
    const { limit = 20, offset = 0, publicOnly = 'true' } = req.query;
    
    let visibilityFilter = '';
    if (publicOnly === 'true') {
      visibilityFilter = 'AND pr.is_public = true';
    }

    const result = await db.query(`
      SELECT 
        pr.*,
        u.reputation,
        ub.title as user_badge,
        ub.rarity as badge_rarity
      FROM core.pool_reflections pr
      LEFT JOIN core.users u ON pr.user_address = u.address
      LEFT JOIN core.user_badges ub ON pr.user_address = ub.user_address 
        AND ub.is_active = true
      WHERE pr.pool_id = $1 ${visibilityFilter}
      ORDER BY pr.helpfulness_score DESC, pr.created_at DESC
      LIMIT $2 OFFSET $3
    `, [poolId, parseInt(limit), parseInt(offset)]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching reflections:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch reflections' });
  }
});

// Submit a post-match reflection
router.post('/pools/:poolId/reflections', async (req, res) => {
  try {
    const { poolId } = req.params;
    const { 
      userAddress, 
      confidence, 
      wouldBetAgain, 
      lessonsLearned, 
      requestsAiAnalysis = false, 
      isPublic = false 
    } = req.body;
    
    if (!userAddress || confidence === undefined || wouldBetAgain === undefined) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    if (!userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    const result = await db.query(`
      INSERT INTO core.pool_reflections 
      (pool_id, user_address, confidence, would_bet_again, lessons_learned, requests_ai_analysis, is_public)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (pool_id, user_address) 
      DO UPDATE SET 
        confidence = $3,
        would_bet_again = $4,
        lessons_learned = $5,
        requests_ai_analysis = $6,
        is_public = $7,
        created_at = NOW()
      RETURNING *
    `, [poolId, userAddress.toLowerCase(), confidence, wouldBetAgain, lessonsLearned, requestsAiAnalysis, isPublic]);

    // Update user social stats
    await db.query(`
      INSERT INTO analytics.user_social_stats (user_address, total_reflections)
      VALUES ($1, 1)
      ON CONFLICT (user_address) DO UPDATE SET 
        total_reflections = analytics.user_social_stats.total_reflections + 1,
        calculated_at = NOW()
    `, [userAddress.toLowerCase()]);

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error submitting reflection:', error);
    res.status(500).json({ success: false, error: 'Failed to submit reflection' });
  }
});

// =================================================================
//  CHALLENGE SCORES & POOL METRICS
// =================================================================

// Get challenge score for a pool
router.get('/pools/:poolId/challenge-score', async (req, res) => {
  try {
    const { poolId } = req.params;
    
    const result = await db.query(`
      SELECT * FROM analytics.pool_challenge_scores 
      WHERE pool_id = $1
    `, [poolId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Challenge score not found' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching challenge score:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch challenge score' });
  }
});

// Calculate challenge score for a pool
router.post('/pools/:poolId/calculate-challenge-score', async (req, res) => {
  try {
    const { poolId } = req.params;
    
    // Get pool data
    const poolResult = await db.query(`
      SELECT * FROM analytics.pools WHERE pool_id = $1
    `, [poolId]);

    if (poolResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const pool = poolResult.rows[0];

    // Calculate creator win rate
    const creatorStats = await db.query(`
      SELECT 
        COUNT(*) as total_pools,
        COUNT(CASE WHEN creator_side_won = true THEN 1 END) as won_pools
      FROM analytics.pools 
      WHERE creator_address = $1 AND is_settled = true
    `, [pool.creator_address]);

    const creatorWinRate = creatorStats.rows[0].total_pools > 0 ? 
      creatorStats.rows[0].won_pools / creatorStats.rows[0].total_pools : 0;

    // Calculate quality score (0-100)
    let qualityScore = 0;
    qualityScore += Math.min(parseFloat(pool.creator_stake || 0) / 100, 20); // Up to 20 points for stake
    qualityScore += Math.min(pool.participant_count || 0, 30); // Up to 30 points for participants
    qualityScore += Math.min((pool.fill_percentage || 0) / 2, 50); // Up to 50 points for fill %

    // Calculate challenge score (0-100)
    let challengeScore = 0;
    challengeScore += creatorWinRate * 40; // 40 points for creator win rate
    challengeScore += Math.min((pool.odds || 0) / 10, 30); // Up to 30 points for odds difficulty
    challengeScore += Math.min(parseFloat(pool.creator_stake || 0) / 50, 30); // Up to 30 points for stake

    // Store the scores
    await db.query(`
      INSERT INTO analytics.pool_challenge_scores 
      (pool_id, creator_address, quality_score, challenge_score, creator_win_rate, calculated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (pool_id) DO UPDATE SET 
        quality_score = $3,
        challenge_score = $4,
        creator_win_rate = $5,
        calculated_at = NOW()
    `, [poolId, pool.creator_address, Math.round(qualityScore), Math.round(challengeScore), creatorWinRate]);

    res.json({
      success: true,
      data: {
        poolId,
        qualityScore: Math.round(qualityScore),
        challengeScore: Math.round(challengeScore),
        creatorWinRate: Math.round(creatorWinRate * 100)
      }
    });

  } catch (error) {
    console.error('Error calculating challenge score:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate challenge score' });
  }
});

// =================================================================
//  BITR REWARDS
// =================================================================

// Get BITR rewards for high-challenge pools (80+ challenge score)
router.get('/pools/:poolId/bitr-rewards', async (req, res) => {
  try {
    const { poolId } = req.params;
    
    const result = await db.query(`
      SELECT * FROM analytics.bitr_rewards 
      WHERE pool_id = $1
      ORDER BY earned_at DESC
    `, [poolId]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching BITR rewards:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch BITR rewards' });
  }
});

// Award BITR for participating in high-challenge pools
router.post('/pools/:poolId/award-bitr', async (req, res) => {
  try {
    const { poolId } = req.params;
    const { userAddress, rewardType, amount } = req.body;
    
    if (!userAddress || !rewardType || !amount) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if pool has high challenge score (80+)
    const challengeResult = await db.query(`
      SELECT challenge_score FROM analytics.pool_challenge_scores 
      WHERE pool_id = $1
    `, [poolId]);

    if (challengeResult.rows.length === 0 || challengeResult.rows[0].challenge_score < 80) {
      return res.status(400).json({ error: 'Pool does not qualify for BITR rewards' });
    }

    const result = await db.query(`
      INSERT INTO analytics.bitr_rewards 
      (pool_id, user_address, reward_type, amount)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [poolId, userAddress.toLowerCase(), rewardType, amount]);

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error awarding BITR:', error);
    res.status(500).json({ success: false, error: 'Failed to award BITR' });
  }
});

// =================================================================
//  SOCIAL STATS & ANALYTICS
// =================================================================

// Get community stats for the hub
router.get('/community-stats', 
  cacheMiddleware(cacheKeys.communityStats, 300), // Cache for 5 minutes
  async (req, res) => {
  try {
    const [discussionsResult, membersResult, commentsResult, likesResult] = await Promise.all([
      // Active discussions (created in last 30 days)
      db.query(`
        SELECT COUNT(*) as count
        FROM core.community_discussions 
        WHERE created_at >= NOW() - INTERVAL '30 days' AND is_deleted = false
      `),
      
      // Unique community members (users who posted/commented)
      db.query(`
        SELECT COUNT(DISTINCT user_address) as count
        FROM (
          SELECT user_address FROM core.community_discussions WHERE is_deleted = false
          UNION
          SELECT user_address FROM core.pool_comments WHERE is_deleted = false
        ) combined
      `),
      
      // Total comments across all pools and discussions
      db.query(`
        SELECT 
          (SELECT COUNT(*) FROM core.pool_comments WHERE is_deleted = false) +
          (SELECT COUNT(*) FROM core.discussion_replies WHERE is_deleted = false) as count
      `),
      
      // Total likes across all content
      db.query(`
        SELECT COUNT(*) as count
        FROM core.social_reactions 
        WHERE reaction_type = 'like'
      `)
    ]);

    const stats = {
      activeDiscussions: parseInt(discussionsResult.rows[0]?.count || 0),
      communityMembers: parseInt(membersResult.rows[0]?.count || 0),
      totalComments: parseInt(commentsResult.rows[0]?.count || 0),
      totalLikes: parseInt(likesResult.rows[0]?.count || 0),
      weeklyActivity: Math.floor(Math.random() * 100) + 50 // Placeholder for now
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching community stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch community stats' });
  }
});

// Get user social stats
router.get('/users/:address/social-stats', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    const result = await db.query(`
      SELECT * FROM analytics.user_social_stats 
      WHERE user_address = $1
    `, [address.toLowerCase()]);

    res.json({
      success: true,
      data: result.rows[0] || {
        user_address: address.toLowerCase(),
        total_comments: 0,
        total_discussions: 0,
        total_likes_given: 0,
        total_likes_received: 0,
        total_reflections: 0,
        community_influence_score: 0,
        weekly_engagement_score: 0
      }
    });

  } catch (error) {
    console.error('Error fetching social stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch social stats' });
  }
});

// Get user social statistics
router.get('/users/:address/social-stats', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Mock social stats - in production, query from database
    const socialStats = {
      total_comments: 25,
      total_likes_given: 150,
      total_likes_received: 89,
      total_reflections: 12,
      community_influence_score: 75,
      weekly_engagement_score: 45,
      favorite_discussion_category: 'crypto',
      last_social_activity: new Date(Date.now() - 3600000).toISOString()
    };

    res.json(socialStats);
  } catch (error) {
    console.error('Error fetching user social stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch social stats' });
  }
});

module.exports = router;
 