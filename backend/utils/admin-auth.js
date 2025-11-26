/**
 * ADMIN AUTHENTICATION HELPER
 * 
 * Provides secure admin authentication with rate limiting.
 * All admin endpoints should use this helper.
 */

const adminRateLimiting = require('../middleware/admin-rate-limiting');

/**
 * Middleware to check admin authentication
 * Should be used AFTER adminRateLimiting middleware
 */
function requireAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_KEY;
  
  if (!expectedKey) {
    console.error('❌ ADMIN_KEY not configured in environment');
    return res.status(500).json({
      success: false,
      error: 'Admin authentication not configured'
    });
  }
  
  if (!adminKey || adminKey !== expectedKey) {
    console.warn(`🚫 Unauthorized admin access attempt from ${req.ip}`);
    return res.status(403).json({
      success: false,
      error: 'Admin authorization required'
    });
  }
  
  // Admin authenticated successfully
  next();
}

/**
 * Combined middleware: rate limiting + admin auth
 * Use this for all admin endpoints
 */
function adminAuth() {
  return [adminRateLimiting, requireAdmin];
}

module.exports = {
  requireAdmin,
  adminAuth
};

