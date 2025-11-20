/**
 * Validation utilities for API endpoints
 * Provides consistent validation and error handling
 */

/**
 * Validate date format (YYYY-MM-DD)
 * @param {string} date - Date string to validate
 * @returns {boolean} True if valid, false otherwise
 */
function isValidDateFormat(date) {
  if (typeof date !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/**
 * Validate that date is not in the past (for match selection)
 * @param {string} date - Date string in YYYY-MM-DD format
 * @returns {boolean} True if date is today or future, false if past
 */
function isValidFutureDate(date) {
  if (!isValidDateFormat(date)) return false;
  
  const inputDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time to start of day
  
  return inputDate >= today;
}

/**
 * Create standardized error response
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @returns {Object} Standardized error response
 */
function createErrorResponse(code, message, details = {}) {
  return {
    success: false,
    error: {
      code,
      message,
      details: {
        timestamp: new Date().toISOString(),
        ...details
      }
    }
  };
}

/**
 * Create standardized success response
 * @param {Object} data - Response data
 * @param {Object} meta - Metadata
 * @param {string} message - Optional success message
 * @returns {Object} Standardized success response
 */
function createSuccessResponse(data, meta = {}, message = null) {
  const response = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
  
  if (message) {
    response.message = message;
  }
  
  return response;
}

/**
 * Middleware to validate date parameter in request
 * @param {string} paramName - Name of the parameter to validate ('date', 'targetDate', etc.)
 * @param {boolean} required - Whether the parameter is required
 * @param {boolean} allowPast - Whether past dates are allowed
 * @returns {Function} Express middleware function
 */
function validateDateParam(paramName = 'date', required = false, allowPast = true) {
  return (req, res, next) => {
    const date = req.params[paramName] || req.query[paramName] || req.body[paramName];
    
    // Check if required parameter is missing
    if (required && !date) {
      return res.status(400).json(
        createErrorResponse(
          'MISSING_REQUIRED_PARAMETER',
          `Required parameter '${paramName}' is missing`,
          { parameter: paramName }
        )
      );
    }
    
    // Skip validation if parameter is not provided and not required
    if (!date) {
      return next();
    }
    
    // Validate date format
    if (!isValidDateFormat(date)) {
      return res.status(400).json(
        createErrorResponse(
          'INVALID_DATE_FORMAT',
          'Date must be in YYYY-MM-DD format',
          { 
            parameter: paramName,
            providedValue: date,
            expectedFormat: 'YYYY-MM-DD'
          }
        )
      );
    }
    
    // Validate date is not in the past (if required)
    if (!allowPast && !isValidFutureDate(date)) {
      return res.status(400).json(
        createErrorResponse(
          'INVALID_PAST_DATE',
          'Date cannot be in the past',
          { 
            parameter: paramName,
            providedDate: date,
            currentDate: new Date().toISOString().split('T')[0]
          }
        )
      );
    }
    
    // Validate date is a real date
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json(
        createErrorResponse(
          'INVALID_DATE_VALUE',
          'Date value is not a valid date',
          { 
            parameter: paramName,
            providedValue: date
          }
        )
      );
    }
    
    next();
  };
}

/**
 * Middleware to handle async route errors
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware function
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error handler middleware
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function globalErrorHandler(error, req, res, next) {
  console.error('❌ Global error handler:', error);
  
  // Default error response
  let statusCode = 500;
  let errorResponse = createErrorResponse(
    'INTERNAL_SERVER_ERROR',
    'An unexpected error occurred',
    {
      path: req.path,
      method: req.method
    }
  );
  
  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    errorResponse = createErrorResponse(
      'VALIDATION_ERROR',
      error.message,
      { validationErrors: error.details }
    );
  } else if (error.name === 'DatabaseError' || error.code?.startsWith('23')) {
    statusCode = 500;
    errorResponse = createErrorResponse(
      'DATABASE_ERROR',
      'Database operation failed',
      { errorCode: error.code }
    );
  } else if (error.name === 'TimeoutError') {
    statusCode = 504;
    errorResponse = createErrorResponse(
      'TIMEOUT_ERROR',
      'Request timed out',
      { timeout: error.timeout }
    );
  }
  
  // Add debug information in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.error.debug = {
      message: error.message,
      stack: error.stack,
      name: error.name
    };
  }
  
  res.status(statusCode).json(errorResponse);
}

module.exports = {
  isValidDateFormat,
  isValidFutureDate,
  createErrorResponse,
  createSuccessResponse,
  validateDateParam,
  asyncHandler,
  globalErrorHandler
};