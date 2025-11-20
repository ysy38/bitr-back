const redis = require('redis');
const { convertBigIntToStrings } = require('../utils/bigint-serializer');

// Redis configuration for Fly.io deployment
// NOTE: convertBigIntToStrings is imported to fix "Do not know how to serialize a BigInt" errors
// when caching analytics data that contains BigInt values from the contract
const redisConfig = {
  // Use Redis URL from environment or default to localhost
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // Connection options
  socket: {
    connectTimeout: 60000,
    lazyConnect: true,
    reconnectStrategy: (retries) => {
      if (retries > 3) {
        console.error('Redis connection failed after 3 retries');
        return new Error('Redis connection failed');
      }
      return Math.min(retries * 100, 3000);
    }
  },
  
  // Redis options
  database: 0,
  
  // Handle connection errors gracefully
  retry_strategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      console.error('Redis server connection refused');
      return new Error('Redis server connection refused');
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      console.error('Redis retry time exhausted');
      return new Error('Retry time exhausted');
    }
    if (options.attempt > 10) {
      console.error('Redis max retry attempts reached');
      return undefined;
    }
    return Math.min(options.attempt * 100, 3000);
  }
};

// Create Redis client
let redisClient = null;
let redisDisabled = false;

const createRedisClient = async () => {
  // Skip Redis if disabled or no URL provided
  if (redisDisabled || !process.env.REDIS_URL) {
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  try {
    redisClient = redis.createClient(redisConfig);
    
    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
      // Disable Redis on persistent errors
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        console.log('🔌 Redis disabled - continuing without cache');
        redisDisabled = true;
        redisClient = null;
      }
    });

    redisClient.on('connect', () => {
      console.log('Redis Client Connected');
    });

    redisClient.on('ready', () => {
      console.log('Redis Client Ready');
    });

    redisClient.on('end', () => {
      console.log('Redis Client Disconnected');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('Error creating Redis client:', error);
    // Disable Redis on connection errors
    redisDisabled = true;
    return null;
  }
};

// Cache helper functions
const cache = {
  // Get cached data
  get: async (key) => {
    try {
      const client = await createRedisClient();
      if (!client) return null;
      
      const data = await client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis GET error:', error);
      return null;
    }
  },

  // Set cached data with TTL
  set: async (key, data, ttlSeconds = 300) => {
    try {
      const client = await createRedisClient();
      if (!client) return false;
      
      // Convert BigInt values to strings before JSON.stringify
      const safeData = convertBigIntToStrings(data);
      await client.setEx(key, ttlSeconds, JSON.stringify(safeData));
      return true;
    } catch (error) {
      console.error('Redis SET error:', error);
      return false;
    }
  },

  // Delete cached data
  del: async (key) => {
    try {
      const client = await createRedisClient();
      if (!client) return false;
      
      await client.del(key);
      return true;
    } catch (error) {
      console.error('Redis DEL error:', error);
      return false;
    }
  },

  // Check if key exists
  exists: async (key) => {
    try {
      const client = await createRedisClient();
      if (!client) return false;
      
      const exists = await client.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('Redis EXISTS error:', error);
      return false;
    }
  },

  // Increment counter
  incr: async (key, ttlSeconds = 86400) => {
    try {
      const client = await createRedisClient();
      if (!client) return 0;
      
      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, ttlSeconds);
      }
      return count;
    } catch (error) {
      console.error('Redis INCR error:', error);
      return 0;
    }
  },

  // Add to set
  sadd: async (key, member, ttlSeconds = 3600) => {
    try {
      const client = await createRedisClient();
      if (!client) return false;
      
      await client.sAdd(key, member);
      await client.expire(key, ttlSeconds);
      return true;
    } catch (error) {
      console.error('Redis SADD error:', error);
      return false;
    }
  },

  // Check if member exists in set
  sismember: async (key, member) => {
    try {
      const client = await createRedisClient();
      if (!client) return false;
      
      const exists = await client.sIsMember(key, member);
      return exists;
    } catch (error) {
      console.error('Redis SISMEMBER error:', error);
      return false;
    }
  },

  // Get all members of a set
  smembers: async (key) => {
    try {
      const client = await createRedisClient();
      if (!client) return [];
      
      const members = await client.sMembers(key);
      return members;
    } catch (error) {
      console.error('Redis SMEMBERS error:', error);
      return [];
    }
  }
};

// Cache key generators
const cacheKeys = {
  // Social data cache keys
  communityStats: () => 'community:stats',
  discussions: (category = 'all', sort = 'recent') => `discussions:${category}:${sort}`,
  userBadges: (address) => `user:${address.toLowerCase()}:badges`,
  poolComments: (poolId) => `pool:${poolId}:comments`,
  userReputation: (address) => `user:${address.toLowerCase()}:reputation`,
  
  // Rate limiting keys
  rateLimitComment: (address) => `rate_limit:comment:${address.toLowerCase()}`,
  rateLimitReaction: (address) => `rate_limit:reaction:${address.toLowerCase()}`,
  rateLimitDiscussion: (address) => `rate_limit:discussion:${address.toLowerCase()}`,
  
  // Activity tracking
  dailyActiveUsers: (date) => `dau:${date}`,
  weeklyActiveUsers: (week) => `wau:${week}`,
  
  // Leaderboards
  badgeLeaderboard: (period = 'weekly') => `leaderboard:badges:${period}`,
  reputationLeaderboard: (period = 'weekly') => `leaderboard:reputation:${period}`
};

// Middleware for caching
const cacheMiddleware = (keyGenerator, ttlSeconds = 300) => {
  return async (req, res, next) => {
    try {
      const key = typeof keyGenerator === 'function' ? keyGenerator(req) : keyGenerator;
      const cachedData = await cache.get(key);
      
      if (cachedData) {
        return res.json(cachedData);
      }
      
      // Store original send function
      const originalSend = res.json;
      
      // Override send function to cache response
      res.json = function(data) {
        // Cache successful responses
        if (data && data.success !== false) {
          cache.set(key, data, ttlSeconds).catch(console.error);
        }
        
        // Call original send
        return originalSend.call(this, data);
      };
      
      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

// Rate limiting middleware
const rateLimitMiddleware = (keyGenerator, maxRequests = 10, windowSeconds = 60) => {
  return async (req, res, next) => {
    try {
      const key = typeof keyGenerator === 'function' ? keyGenerator(req) : keyGenerator;
      const count = await cache.incr(key, windowSeconds);
      
      if (count > maxRequests) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          message: `Too many requests. Limit: ${maxRequests} per ${windowSeconds} seconds`
        });
      }
      
      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': maxRequests,
        'X-RateLimit-Remaining': Math.max(0, maxRequests - count),
        'X-RateLimit-Reset': Date.now() + (windowSeconds * 1000)
      });
      
      next();
    } catch (error) {
      console.error('Rate limit middleware error:', error);
      next();
    }
  };
};

// Graceful shutdown
const closeRedisConnection = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('Redis connection closed');
    } catch (error) {
      console.error('Error closing Redis connection:', error);
    }
  }
};

module.exports = {
  createRedisClient,
  cache,
  cacheKeys,
  cacheMiddleware,
  rateLimitMiddleware,
  closeRedisConnection
}; 