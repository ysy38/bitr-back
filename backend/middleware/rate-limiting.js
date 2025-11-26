/**
 * RATE LIMITING MIDDLEWARE
 * 
 * Implements intelligent rate limiting to prevent API abuse and excessive polling.
 * Uses sliding window algorithm for fair rate limiting.
 */

const { cache } = require('../config/redis');

// Rate limit configurations
const RATE_LIMITS = {
  // General API endpoints
  'general': {
    windowMs: 60000, // 1 minute
    maxRequests: 100,
    message: 'Too many requests, please slow down'
  },
  
  // Pool progress endpoints (more restrictive)
  'pool_progress': {
    windowMs: 10000, // 10 seconds
    maxRequests: 5,
    message: 'Pool progress requests limited to 5 per 10 seconds'
  },
  
  // Recent bets (very restrictive)
  'recent_bets': {
    windowMs: 5000, // 5 seconds
    maxRequests: 2,
    message: 'Recent bets requests limited to 2 per 5 seconds'
  }
};

function getRateLimitConfig(path) {
  if (path.includes('/pools/') && path.includes('/progress')) {
    return RATE_LIMITS.pool_progress;
  }
  if (path.includes('/recent-bets')) {
    return RATE_LIMITS.recent_bets;
  }
  return RATE_LIMITS.general;
}

// In-memory fallback for rate limiting (used when Redis fails - fails closed for security)
const memoryStore = new Map();
const MEMORY_CLEANUP_INTERVAL = 15 * 60 * 1000; // 15 minutes

// Clean up old entries from memory store periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of memoryStore.entries()) {
    const { timestamps, windowMs } = JSON.parse(data);
    const windowStart = now - windowMs;
    const validTimestamps = timestamps.filter(ts => ts > windowStart);
    
    if (validTimestamps.length === 0) {
      memoryStore.delete(key);
    } else {
      memoryStore.set(key, JSON.stringify({ timestamps: validTimestamps, windowMs }));
    }
  }
}, MEMORY_CLEANUP_INTERVAL);

function rateLimiting(req, res, next) {
  const config = getRateLimitConfig(req.path);
  const clientId = req.ip || req.connection.remoteAddress;
  const key = `rate_limit:${clientId}:${req.path}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Get current requests for this client/endpoint
  cache.get(key)
    .then(data => {
      const requests = data ? JSON.parse(data) : [];
      
      // Remove old requests outside the window
      const validRequests = requests.filter(timestamp => timestamp > windowStart);
      
      // Check if limit exceeded
      if (validRequests.length >= config.maxRequests) {
        console.log(`🚫 Rate limit exceeded for ${clientId} on ${req.path}: ${validRequests.length}/${config.maxRequests}`);
        
        return res.status(429).json({
          success: false,
          error: config.message,
          retryAfter: Math.ceil((validRequests[0] + config.windowMs - now) / 1000)
        });
      }
      
      // Add current request
      validRequests.push(now);
      
      // Store updated requests
      cache.set(key, JSON.stringify(validRequests), Math.ceil(config.windowMs / 1000))
        .then(() => {
          console.log(`✅ Rate limit OK for ${clientId} on ${req.path}: ${validRequests.length}/${config.maxRequests}`);
          next();
        })
        .catch(err => {
          console.error('Rate limit cache error:', err);
          // Fallback to memory store (fails closed for security)
          useMemoryStoreFallback(key, validRequests, config, res, next);
        });
    })
    .catch(err => {
      console.error('Rate limit check error:', err);
      // Fallback to memory store (fails closed for security)
      useMemoryStoreFallback(key, [], config, res, next);
    });
}

/**
 * Use in-memory store as fallback (fails closed for security)
 */
function useMemoryStoreFallback(key, existingRequests, config, res, next) {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  
  // Get from memory store
  const stored = memoryStore.get(key);
  let requests = existingRequests.length > 0 ? existingRequests : (stored ? JSON.parse(stored).timestamps : []);
  
  // Filter valid requests
  const validRequests = requests.filter(timestamp => timestamp > windowStart);
  
  if (validRequests.length >= config.maxRequests) {
    console.log(`🚫 Rate limit exceeded (memory store) for ${key}: ${validRequests.length}/${config.maxRequests}`);
    return res.status(429).json({
      success: false,
      error: config.message,
      retryAfter: Math.ceil((validRequests[0] + config.windowMs - now) / 1000)
    });
  }
  
  validRequests.push(now);
  memoryStore.set(key, JSON.stringify({ 
    timestamps: validRequests, 
    windowMs: config.windowMs 
  }));
  
  next();
}

module.exports = rateLimiting;
