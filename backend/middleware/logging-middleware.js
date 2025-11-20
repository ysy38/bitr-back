const healthMonitor = require('../services/system-monitor');
const { safeStringify } = require('../utils/bigint-serializer');

/**
 * API Request/Response Logging Middleware
 * Implements Requirement 6.4: API request/response logging for debugging
 */
class LoggingMiddleware {
  // BigInt-safe JSON.stringify helper
  static safeStringify(obj) {
    return safeStringify(obj);
  }

  /**
   * Request/Response logging middleware
   */
  static requestResponseLogger(req, res, next) {
    const startTime = Date.now();
    const originalSend = res.send;

    // Override res.send to capture response data
    res.send = function(data) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Log request details
      console.log(`📝 ${req.method} ${req.originalUrl} - ${duration}ms`);
      
      // Log request body if present (for POST/PUT requests)
      if (req.body && Object.keys(req.body).length > 0) {
        try {
          console.log(`📤 Request Body:`, safeStringify(req.body, 2));
        } catch (error) {
          console.log(`📤 Request Body: [Error serializing: ${error.message}]`);
        }
      }
      
      // Log response data (truncated for large responses)
      if (data) {
        try {
          const responseData = typeof data === 'string' ? JSON.parse(data) : data;
          const truncatedData = LoggingMiddleware.truncateResponseData(responseData);
          console.log(`📥 Response:`, safeStringify(truncatedData, 2));
        } catch (error) {
          console.log(`📥 Response: [Error serializing: ${error.message}]`);
        }
      }
      
      // Call original send method
      return originalSend.call(this, data);
    }.bind(res);

    next();
  }

  /**
   * Truncate large response data for logging
   */
  static truncateResponseData(data, maxDepth = 3, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
      return '[Truncated]';
    }

    if (Array.isArray(data)) {
      if (data.length > 10) {
        return data.slice(0, 10).map(item => 
          this.truncateResponseData(item, maxDepth, currentDepth + 1)
        ).concat([`... and ${data.length - 10} more items`]);
      }
      return data.map(item => 
        this.truncateResponseData(item, maxDepth, currentDepth + 1)
      );
    }

    if (data && typeof data === 'object') {
      const result = {};
      const keys = Object.keys(data);
      const maxKeys = 20;
      
      for (let i = 0; i < Math.min(keys.length, maxKeys); i++) {
        const key = keys[i];
        result[key] = this.truncateResponseData(data[key], maxDepth, currentDepth + 1);
      }
      
      if (keys.length > maxKeys) {
        result['...'] = `and ${keys.length - maxKeys} more properties`;
      }
      
      return result;
    }

    return data;
  }

  /**
   * Database query logging wrapper
   */
  static databaseQueryLogger(originalQuery) {
    return async function(text, params = []) {
      const startTime = Date.now();
      
      try {
        const result = await originalQuery(text, params);
        const duration = Date.now() - startTime;
        
        // Log successful queries (only if they take more than 100ms or have errors)
        if (duration > 100) {
          console.log(`🗄️ DB Query (${duration}ms): ${text.substring(0, 100)}...`);
        }
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ DB Query Error (${duration}ms): ${text.substring(0, 100)}...`);
        console.error(`   Error: ${error.message}`);
        throw error;
      }
    };
  }

  /**
   * Error logging middleware
   */
  static errorLogger(err, req, res, next) {
    const errorDetails = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      error: {
        message: err.message,
        stack: err.stack,
        name: err.name
      },
      request: {
        headers: req.headers,
        body: req.body,
        query: req.query,
        params: req.params
      }
    };

    console.error('❌ API Error:', safeStringify(errorDetails, 2));
    
    // Update health monitor
    healthMonitor.recordError(err);

    next(err);
  }

  /**
   * Performance monitoring middleware
   */
  static performanceLogger(req, res, next) {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;
      
      // Log slow requests
      if (duration > 1000) {
        console.warn(`🐌 Slow Request: ${req.method} ${req.originalUrl} - ${duration}ms (${statusCode})`);
      }
      
      // Update health monitor
      healthMonitor.recordRequest(duration, statusCode);
    });

    next();
  }
}

module.exports = LoggingMiddleware;