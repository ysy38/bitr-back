/**
 * SMART CACHING MIDDLEWARE
 * 
 * Implements intelligent caching strategies based on endpoint patterns.
 * Different endpoints get different cache TTLs based on their data volatility.
 */

const { cache } = require('../config/redis');

// Cache configuration for different endpoint patterns
const CACHE_CONFIG = {
  // Pool progress - moderate volatility, 2 minutes
  '/api/guided-markets/pools/.*/progress': {
    ttl: 120,
    description: 'Pool progress data'
  },
  
  // Recent bets - high volatility, 30 seconds
  '/api/guided-markets/recent-bets': {
    ttl: 30,
    description: 'Recent bets data'
  },
  
  // Market lists - low volatility, 5 minutes
  '/api/guided-markets/markets': {
    ttl: 300,
    description: 'Market listings'
  },
  
  // User data - moderate volatility, 1 minute
  '/api/user/.*': {
    ttl: 60,
    description: 'User data'
  },
  
  // Analytics - low volatility, 10 minutes
  '/api/analytics/.*': {
    ttl: 600,
    description: 'Analytics data'
  },
  
  // Default cache for other GET requests
  'default': {
    ttl: 60,
    description: 'General data'
  }
};

function getCacheConfig(path) {
  for (const [pattern, config] of Object.entries(CACHE_CONFIG)) {
    if (pattern === 'default') continue;
    
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    if (regex.test(path)) {
      return config;
    }
  }
  
  return CACHE_CONFIG.default;
}

function smartCaching(req, res, next) {
  // Only cache GET requests
  if (req.method !== 'GET') {
    return next();
  }

  // Skip caching for certain endpoints
  const skipCaching = [
    '/api/auth/',
    '/api/websocket',
    '/api/health',
    '/api/admin/'
  ];
  
  if (skipCaching.some(path => req.path.startsWith(path))) {
    return next();
  }

  const cacheConfig = getCacheConfig(req.path);
  const cacheKey = `smart_cache:${req.method}:${req.path}:${JSON.stringify(req.query)}`;
  
  // Check cache first
  cache.get(cacheKey)
    .then(cachedData => {
      if (cachedData) {
        console.log(`📦 Smart cache hit for ${req.path} (${cacheConfig.description})`);
        return res.json(cachedData);
      }
      
      // Cache miss - override res.json to cache response
      const originalJson = res.json.bind(res);
      
      res.json = function(data) {
        // Cache the response
        cache.set(cacheKey, data, cacheConfig.ttl)
          .then(() => {
            console.log(`💾 Smart cached ${req.path} for ${cacheConfig.ttl}s (${cacheConfig.description})`);
          })
          .catch(err => {
            console.error('Cache set error:', err);
          });
        
        return originalJson(data);
      };
      
      next();
    })
    .catch(err => {
      console.error('Cache get error:', err);
      next();
    });
}

module.exports = smartCaching;
