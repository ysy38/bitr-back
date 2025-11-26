/**
 * ADMIN RATE LIMITING MIDDLEWARE
 * 
 * Implements strict rate limiting for admin endpoints to prevent brute force attacks.
 * Uses in-memory fallback when Redis is unavailable (fails closed for security).
 */

const { cache } = require('../config/redis');

// In-memory fallback for rate limiting (used when Redis fails)
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

// Admin rate limit configuration
const ADMIN_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 30, // 30 requests per 15 minutes
  message: 'Too many admin requests, please try again later'
};

/**
 * Admin rate limiting middleware
 * Fails closed for security - if Redis is unavailable, uses in-memory store
 */
function adminRateLimiting(req, res, next) {
  const clientId = req.ip || req.connection.remoteAddress || 'unknown';
  const key = `admin_rate_limit:${clientId}`;
  const now = Date.now();
  const windowStart = now - ADMIN_RATE_LIMIT.windowMs;

  // Try Redis first
  cache.get(key)
    .then(data => {
      const requests = data ? JSON.parse(data) : [];
      const validRequests = requests.filter(timestamp => timestamp > windowStart);
      
      if (validRequests.length >= ADMIN_RATE_LIMIT.maxRequests) {
        console.warn(`🚫 Admin rate limit exceeded for ${clientId}: ${validRequests.length}/${ADMIN_RATE_LIMIT.maxRequests}`);
        return res.status(429).json({
          success: false,
          error: ADMIN_RATE_LIMIT.message,
          retryAfter: Math.ceil((validRequests[0] + ADMIN_RATE_LIMIT.windowMs - now) / 1000)
        });
      }
      
      validRequests.push(now);
      
      // Store updated requests
      return cache.set(key, JSON.stringify(validRequests), Math.ceil(ADMIN_RATE_LIMIT.windowMs / 1000))
        .then(() => {
          next();
        })
        .catch(err => {
          console.error('Admin rate limit cache set error:', err);
          // Fallback to memory store
          return useMemoryStore(key, validRequests, res, next);
        });
    })
    .catch(err => {
      console.error('Admin rate limit cache get error:', err);
      // Fallback to memory store (fails closed)
      return useMemoryStore(key, [], res, next);
    });
}

/**
 * Use in-memory store as fallback (fails closed for security)
 */
function useMemoryStore(key, existingRequests, res, next) {
  const now = Date.now();
  const windowStart = now - ADMIN_RATE_LIMIT.windowMs;
  
  // Get from memory store
  const stored = memoryStore.get(key);
  let requests = existingRequests.length > 0 ? existingRequests : (stored ? JSON.parse(stored).timestamps : []);
  
  // Filter valid requests
  const validRequests = requests.filter(timestamp => timestamp > windowStart);
  
  if (validRequests.length >= ADMIN_RATE_LIMIT.maxRequests) {
    console.warn(`🚫 Admin rate limit exceeded (memory store) for ${key}: ${validRequests.length}/${ADMIN_RATE_LIMIT.maxRequests}`);
    return res.status(429).json({
      success: false,
      error: ADMIN_RATE_LIMIT.message,
      retryAfter: Math.ceil((validRequests[0] + ADMIN_RATE_LIMIT.windowMs - now) / 1000)
    });
  }
  
  validRequests.push(now);
  memoryStore.set(key, JSON.stringify({ 
    timestamps: validRequests, 
    windowMs: ADMIN_RATE_LIMIT.windowMs 
  }));
  
  next();
}

module.exports = adminRateLimiting;

