/**
 * BigInt Serialization Utility
 * 
 * Provides safe JSON serialization for BigInt values to prevent
 * "Do not know how to serialize a BigInt" errors throughout the system.
 */

/**
 * Safe JSON.stringify that handles BigInt values
 * @param {any} obj - Object to stringify
 * @param {number} space - Optional spacing for pretty printing
 * @returns {string} JSON string with BigInt values converted to strings
 */
function safeStringify(obj, space = null) {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }, space);
}

/**
 * Safe JSON.parse that can handle stringified BigInt values
 * @param {string} jsonString - JSON string to parse
 * @returns {any} Parsed object
 */
function safeParse(jsonString) {
  return JSON.parse(jsonString);
}

/**
 * Convert BigInt values in an object to strings recursively
 * @param {any} obj - Object to process
 * @returns {any} Object with BigInt values converted to strings
 */
function convertBigIntToStrings(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(convertBigIntToStrings);
  }
  
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertBigIntToStrings(value);
    }
    return result;
  }
  
  return obj;
}

/**
 * Check if an object contains BigInt values
 * @param {any} obj - Object to check
 * @returns {boolean} True if object contains BigInt values
 */
function containsBigInt(obj) {
  if (obj === null || obj === undefined) {
    return false;
  }
  
  if (typeof obj === 'bigint') {
    return true;
  }
  
  if (Array.isArray(obj)) {
    return obj.some(containsBigInt);
  }
  
  if (typeof obj === 'object') {
    return Object.values(obj).some(containsBigInt);
  }
  
  return false;
}

/**
 * Safely convert a value to BigInt, handling floating-point numbers
 * @param {any} value - Value to convert to BigInt
 * @returns {bigint} BigInt value
 */
function safeBigInt(value) {
  if (typeof value === 'bigint') {
    return value;
  }
  
  if (typeof value === 'number') {
    return BigInt(Math.floor(value));
  }
  
  if (typeof value === 'string') {
    // Handle floating-point strings like "5000.0"
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      throw new Error(`Cannot convert "${value}" to BigInt: not a valid number`);
    }
    return BigInt(Math.floor(numValue));
  }
  
  throw new Error(`Cannot convert ${typeof value} to BigInt`);
}

module.exports = {
  safeStringify,
  safeParse,
  convertBigIntToStrings,
  containsBigInt,
  safeBigInt
};