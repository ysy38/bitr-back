/**
 * RPC Manager with Failover and Retry Logic
 * 
 * Handles multiple RPC endpoints with automatic failover,
 * exponential backoff, and circuit breaker pattern
 */

const { ethers } = require('ethers');

class RpcManager {
  constructor(rpcUrls = [], options = {}) {
    this.rpcUrls = rpcUrls.length > 0 ? rpcUrls : [
      'https://dream-rpc.somnia.network/',
      'https://rpc.ankr.com/somnia_testnet/c8e336679a7fe85909f310fbbdd5fbb18d3b7560b1d3eca7aa97874b0bb81e97',
      'https://somnia-testnet.rpc.thirdweb.com',
      'https://testnet-rpc.somnia.network'
    ];
    
    this.options = {
      maxRetries: options.maxRetries || 5,
      baseDelay: options.baseDelay || 500, // 500ms for faster retries
      maxDelay: options.maxDelay || 10000,   // 10 seconds max
      circuitBreakerThreshold: options.circuitBreakerThreshold || 3, // Fail faster
      circuitBreakerTimeout: options.circuitBreakerTimeout || 30000, // 30 seconds
      ...options
    };
    
    this.providers = new Map();
    this.currentProviderIndex = 0;
    this.failureCounts = new Map();
    this.circuitBreakerState = new Map(); // 'closed', 'open', 'half-open'
    
    this.initializeProviders();
  }
  
  initializeProviders() {
    this.rpcUrls.forEach((url, index) => {
      try {
        const provider = new ethers.JsonRpcProvider(url, null, {
          timeout: 15000, // 15 second timeout for faster failover
          retryLimit: 0,   // We handle retries ourselves
          polling: false,  // Disable polling for better performance
          staticNetwork: true // Assume network is static for better performance
        });
        this.providers.set(index, { url, provider });
        this.failureCounts.set(index, 0);
        this.circuitBreakerState.set(index, 'closed');
        console.log(`✅ RPC Provider ${index} initialized: ${url}`);
      } catch (error) {
        console.error(`❌ Failed to initialize RPC Provider ${index} (${url}):`, error.message);
      }
    });
  }
  
  getCurrentProvider() {
    const providerInfo = this.providers.get(this.currentProviderIndex);
    if (!providerInfo) {
      throw new Error('No RPC providers available');
    }
    return providerInfo;
  }
  
  switchToNextProvider() {
    const totalProviders = this.providers.size;
    if (totalProviders === 0) {
      throw new Error('No RPC providers available');
    }
    
    // Try to find next working provider
    for (let i = 0; i < totalProviders; i++) {
      this.currentProviderIndex = (this.currentProviderIndex + 1) % totalProviders;
      const state = this.circuitBreakerState.get(this.currentProviderIndex);
      
      if (state === 'closed' || state === 'half-open') {
        const providerInfo = this.providers.get(this.currentProviderIndex);
        console.log(`🔄 Switched to RPC Provider ${this.currentProviderIndex}: ${providerInfo.url}`);
        return providerInfo;
      }
    }
    
    // If all providers are in 'open' state, reset the first one to 'half-open'
    this.currentProviderIndex = 0;
    this.circuitBreakerState.set(0, 'half-open');
    const providerInfo = this.providers.get(0);
    console.log(`🔄 All providers failed, trying first provider again: ${providerInfo.url}`);
    return providerInfo;
  }
  
  recordFailure(providerIndex, error) {
    const currentCount = this.failureCounts.get(providerIndex) || 0;
    const newCount = currentCount + 1;
    this.failureCounts.set(providerIndex, newCount);
    
    const providerInfo = this.providers.get(providerIndex);
    console.warn(`⚠️ RPC Provider ${providerIndex} failure ${newCount}: ${error.message}`);
    
    // Open circuit breaker if threshold reached
    if (newCount >= this.options.circuitBreakerThreshold) {
      this.circuitBreakerState.set(providerIndex, 'open');
      console.error(`🚫 Circuit breaker OPEN for Provider ${providerIndex} (${providerInfo.url})`);
      
      // Schedule circuit breaker reset
      setTimeout(() => {
        this.circuitBreakerState.set(providerIndex, 'half-open');
        this.failureCounts.set(providerIndex, 0);
        console.log(`🔄 Circuit breaker HALF-OPEN for Provider ${providerIndex} (${providerInfo.url})`);
      }, this.options.circuitBreakerTimeout);
    }
  }
  
  recordSuccess(providerIndex) {
    this.failureCounts.set(providerIndex, 0);
    this.circuitBreakerState.set(providerIndex, 'closed');
  }
  
  calculateDelay(attempt) {
    const delay = Math.min(
      this.options.baseDelay * Math.pow(2, attempt),
      this.options.maxDelay
    );
    // Add jitter to prevent thundering herd
    return delay + Math.random() * 1000;
  }
  
  isRetryableError(error) {
    const retryableErrors = [
      'SERVER_ERROR',           // 502 Bad Gateway
      'TIMEOUT',               // Request timeout
      'NETWORK_ERROR',         // Network issues
      'ENOTFOUND',            // DNS resolution failed
      'ECONNREFUSED',         // Connection refused
      'ECONNRESET',           // Connection reset
      'socket hang up',       // Socket errors
      '502 Bad Gateway',      // HTTP 502
      '503 Service Unavailable', // HTTP 503
      '504 Gateway Timeout'   // HTTP 504
    ];
    
    const errorMessage = error.message || error.toString();
    return retryableErrors.some(retryableError => 
      errorMessage.includes(retryableError) || 
      error.code === retryableError
    );
  }
  
  async executeWithRetry(operation, operationName = 'RPC call') {
    let lastError;
    let attempt = 0;
    
    while (attempt < this.options.maxRetries) {
      const startProviderIndex = this.currentProviderIndex;
      
      try {
        const { provider } = this.getCurrentProvider();
        const result = await operation(provider);
        
        // Record success
        this.recordSuccess(this.currentProviderIndex);
        
        if (attempt > 0) {
          console.log(`✅ ${operationName} succeeded on attempt ${attempt + 1}`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        attempt++;
        
        console.error(`❌ ${operationName} failed (attempt ${attempt}/${this.options.maxRetries}):`, error.message);
        
        // Record failure for current provider
        this.recordFailure(this.currentProviderIndex, error);
        
        // If it's a retryable error and we have more attempts, try next provider
        if (this.isRetryableError(error) && attempt < this.options.maxRetries) {
          try {
            this.switchToNextProvider();
          } catch (switchError) {
            console.error('❌ No more providers available:', switchError.message);
            break;
          }
          
          // Wait with exponential backoff
          const delay = this.calculateDelay(attempt - 1);
          console.log(`⏳ Waiting ${Math.round(delay)}ms before retry...`);
          await this.sleep(delay);
        } else {
          // Non-retryable error or out of attempts
          break;
        }
      }
    }
    
    throw new Error(`${operationName} failed after ${attempt} attempts. Last error: ${lastError.message}`);
  }
  
  async getProvider() {
    const providerInfo = this.getCurrentProvider();
    return providerInfo.provider;
  }
  
  async getBlockNumber() {
    return this.executeWithRetry(
      (provider) => provider.getBlockNumber(),
      'Get block number'
    );
  }
  
  async getBlock(blockNumber) {
    return this.executeWithRetry(
      (provider) => provider.getBlock(blockNumber),
      `Get block ${blockNumber}`
    );
  }
  
  async queryFilter(contract, filter, fromBlock, toBlock) {
    return this.executeWithRetry(
      (provider) => {
        // Create contract instance with current provider
        const contractWithProvider = contract.connect(provider);
        return contractWithProvider.queryFilter(filter, fromBlock, toBlock);
      },
      `Query filter ${filter.fragment?.name || 'unknown'}`
    );
  }
  
  async call(contract, method, args = []) {
    return this.executeWithRetry(
      async (provider) => {
        const contractWithProvider = contract.connect(provider);
        return contractWithProvider[method](...args);
      },
      `Contract call ${method}`
    );
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  getStatus() {
    const status = {
      totalProviders: this.providers.size,
      currentProvider: this.currentProviderIndex,
      providers: []
    };
    
    this.providers.forEach((providerInfo, index) => {
      status.providers.push({
        index,
        url: providerInfo.url,
        failures: this.failureCounts.get(index),
        circuitState: this.circuitBreakerState.get(index),
        isCurrent: index === this.currentProviderIndex
      });
    });
    
    return status;
  }
  
  logStatus() {
    const status = this.getStatus();
    console.log('📊 RPC Manager Status:');
    status.providers.forEach(provider => {
      const indicator = provider.isCurrent ? '👉' : '  ';
      const state = provider.circuitState === 'closed' ? '✅' : 
                   provider.circuitState === 'open' ? '🚫' : '⚠️';
      console.log(`${indicator} ${state} Provider ${provider.index}: ${provider.url} (failures: ${provider.failures})`);
    });
  }
}

module.exports = RpcManager;
