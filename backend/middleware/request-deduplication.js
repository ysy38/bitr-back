/**
 * REQUEST DEDUPLICATION MIDDLEWARE
 * 
 * Prevents duplicate requests for the same data within a short time window.
 * This is essential for preventing excessive API calls from frontend polling.
 * 
 * How it works:
 * 1. Creates a unique key for each request (method + path + query params)
 * 2. If the same request is made within the deduplication window, returns cached response
 * 3. Automatically cleans up expired cache entries
 */

const cache = new Map();
const CACHE_TTL = 5000; // 5 seconds deduplication window
const CLEANUP_INTERVAL = 30000; // Clean up every 30 seconds

// Cleanup expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

function createRequestKey(req) {
  const { method, path, query } = req;
  const queryString = Object.keys(query).length > 0 ? 
    '?' + Object.keys(query).sort().map(key => `${key}=${query[key]}`).join('&') : '';
  return `${method}:${path}${queryString}`;
}

function requestDeduplication(req, res, next) {
  // Skip deduplication for non-GET requests
  if (req.method !== 'GET') {
    return next();
  }

  // Skip deduplication for certain endpoints that need real-time data
  const skipDeduplication = [
    '/api/auth/',
    '/api/user/',
    '/api/websocket',
    '/api/health'
  ];
  
  if (skipDeduplication.some(path => req.path.startsWith(path))) {
    return next();
  }

  const requestKey = createRequestKey(req);
  const now = Date.now();
  
  // Check if we have a recent identical request
  if (cache.has(requestKey)) {
    const cached = cache.get(requestKey);
    
    // If request is within deduplication window, return cached response
    if (now - cached.timestamp < CACHE_TTL) {
      console.log(`🔄 Request deduplication: Returning cached response for ${requestKey}`);
      return res.json(cached.response);
    }
  }

  // Store original res.json method
  const originalJson = res.json.bind(res);
  
  // Override res.json to cache the response
  res.json = function(data) {
    // Cache the response
    cache.set(requestKey, {
      response: data,
      timestamp: now
    });
    
    console.log(`💾 Cached response for deduplication: ${requestKey}`);
    
    // Call original json method
    return originalJson(data);
  };

  next();
}

module.exports = requestDeduplication;
