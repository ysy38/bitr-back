const { ethers } = require('ethers');
const config = require('../config');

/**
 * 🔍 READ-ONLY WEB3 SERVICE
 * 
 * Simplified Web3Service for the new contract-first architecture:
 * - REMOVED: All transaction signing and broadcasting
 * - REMOVED: Wallet management and gas estimation  
 * - REMOVED: State-changing contract calls
 * - KEPT: Contract instance creation for read-only operations
 * - KEPT: Event listening and network utilities
 * - KEPT: View function calls for backend analytics
 */

class ReadOnlyWeb3Service {
  // Contract enums (kept for compatibility)
  BetType = {
    MONEYLINE: 0,
    OVER_UNDER: 1
  };
  
  MoneylineResult = {
    NotSet: 0,
    HomeWin: 1,
    Draw: 2,
    AwayWin: 3
  };
  
  OverUnderResult = {
    NotSet: 0,
    Over: 1,
    Under: 2
  };
  
  CycleState = {
    NotSet: 0,
    Active: 1,
    Resolved: 2,
    Cancelled: 3
  };
  
  constructor() {
    this.provider = null;
    this.contracts = {};
    this.isInitialized = false;
  }

  /**
   * Initialize read-only provider (no wallet needed)
   */
  async initialize() {
    try {
      console.log('🔍 Initializing Read-Only Web3 Service...');
      
      // Create read-only provider
      this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
      
      // Test connection
      const network = await this.provider.getNetwork();
      console.log(`✅ Connected to network: ${network.name} (${network.chainId})`);
      
      this.isInitialized = true;
      console.log('✅ Read-Only Web3 Service initialized');
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Read-Only Web3 Service:', error);
      throw error;
    }
  }

  /**
   * Get contract instances for read-only operations
   */
  async getContract(contractName) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.contracts[contractName]) {
      return this.contracts[contractName];
    }

    try {
      const contractConfig = this.getContractConfig(contractName);
      
      this.contracts[contractName] = new ethers.Contract(
        contractConfig.address,
        contractConfig.abi,
        this.provider
      );
      
      console.log(`✅ Created read-only ${contractName} contract instance`);
      return this.contracts[contractName];
      
    } catch (error) {
      console.error(`❌ Failed to create ${contractName} contract:`, error);
      throw error;
    }
  }

  /**
   * Get contract configuration
   */
  getContractConfig(contractName) {
    const contracts = {
      poolCore: {
        address: config.blockchain.contractAddresses.bitredictPoolCore,
        abi: require('../solidity/artifacts/contracts/BitredictPoolCore.sol/BitredictPoolCore.json').abi
      },
      boostSystem: {
        address: config.blockchain.contractAddresses.bitredictBoostSystem,
        abi: require('../solidity/artifacts/contracts/BitredictBoostSystem.sol/BitredictBoostSystem.json').abi
      },
      comboPools: {
        address: config.blockchain.contractAddresses.bitredictComboPools,
        abi: require('../solidity/artifacts/contracts/BitredictComboPools.sol/BitredictComboPools.json').abi
      },
      oddyssey: {
        address: config.blockchain.contractAddresses.oddyssey,
        abi: require('../oddyssey-contract-abi.json').abi
      },
      reputation: {
        address: config.blockchain.contractAddresses.enhancedReputationSystem,
        abi: require('../solidity/artifacts/contracts/ReputationSystem.sol/ReputationSystem.json').abi
      },
      oracle: {
        address: config.blockchain.contractAddresses.guidedOracle,
        abi: require('../solidity/artifacts/contracts/BitredictPool.sol/IGuidedOracle.json').abi
      },
      bitrToken: {
        address: config.blockchain.contractAddresses.bitrToken,
        abi: require('../solidity/artifacts/contracts/BitredictPool.sol/IERC20.json').abi
      },
      factory: {
        address: config.blockchain.contractAddresses.factory,
        abi: require('../solidity/BitredictPoolFactory.json').abi
      }
    };

    if (!contracts[contractName]) {
      throw new Error(`Unknown contract: ${contractName}`);
    }

    return contracts[contractName];
  }

  /**
   * READ-ONLY UTILITY FUNCTIONS
   */
  async getCurrentBlock() {
    return await this.provider.getBlockNumber();
  }

  async getNetwork() {
    return await this.provider.getNetwork();
  }

  async getBalance(address) {
    return await this.provider.getBalance(address);
  }

  async getTransactionReceipt(txHash) {
    return await this.provider.getTransactionReceipt(txHash);
  }

  /**
   * EVENT LISTENING (for smart indexer)
   */
  async subscribeToEvents(contractName, eventName, callback) {
    const contract = await this.getContract(contractName);
    
    contract.on(eventName, (...args) => {
      callback({
        contract: contractName,
        event: eventName,
        args: args.slice(0, -1), // Remove event object
        blockNumber: args[args.length - 1].blockNumber,
        transactionHash: args[args.length - 1].transactionHash
      });
    });
    
    console.log(`📡 Subscribed to ${contractName}.${eventName} events`);
  }

  /**
   * BATCH READ OPERATIONS (for analytics)
   */
  async batchCall(calls) {
    const promises = calls.map(async (call) => {
      try {
        const contract = await this.getContract(call.contract);
        return await contract[call.method](...call.params);
      } catch (error) {
        console.error(`❌ Batch call failed: ${call.contract}.${call.method}`, error);
        return null;
      }
    });

    return await Promise.allSettled(promises);
  }

  /**
   * ANALYTICS HELPER FUNCTIONS
   */
  async getPoolAnalytics(poolId) {
    const poolContract = await this.getContract('poolCore');
    
    try {
      const [pool, analytics] = await Promise.all([
        poolContract.pools(poolId),
        poolContract.poolAnalytics(poolId)
      ]);
      
      return { pool, analytics };
    } catch (error) {
      console.error(`❌ Failed to get pool analytics for ${poolId}:`, error);
      return null;
    }
  }

  async getUserAnalytics(userAddress) {
    const contracts = ['poolCore', 'oddyssey', 'reputation'];
    const analytics = {};
    
    for (const contractName of contracts) {
      try {
        const contract = await this.getContract(contractName);
        
        if (contractName === 'poolCore') {
          analytics.poolStats = await contract.getUserStats(userAddress);
        } else if (contractName === 'oddyssey') {
          analytics.oddysseyStats = await contract.userStats(userAddress);
        } else if (contractName === 'reputation') {
          analytics.reputation = await contract.getUserStats(userAddress);
        }
      } catch (error) {
        console.error(`❌ Failed to get ${contractName} analytics for ${userAddress}:`, error);
      }
    }
    
    return analytics;
  }

  /**
   * NETWORK UTILITIES
   */
  async isConnected() {
    try {
      await this.provider.getBlockNumber();
      return true;
    } catch {
      return false;
    }
  }

  async getGasPrice() {
    return await this.provider.getFeeData();
  }

  /**
   * CLEANUP
   */
  disconnect() {
    // Remove all event listeners
    Object.values(this.contracts).forEach(contract => {
      contract.removeAllListeners();
    });
    
    this.contracts = {};
    this.isInitialized = false;
    console.log('🔌 Disconnected from Web3 provider');
  }
}

// Export singleton instance
const readOnlyWeb3Service = new ReadOnlyWeb3Service();
module.exports = readOnlyWeb3Service;
