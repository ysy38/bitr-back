require('dotenv').config();

module.exports = {
  // Database configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    name: process.env.DB_NAME || 'bitredict',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    maxConnections: 20,
    connectionTimeout: 30000
  },

  // Blockchain configuration
  blockchain: {
    rpcUrl: process.env.RPC_URL || 'https://dream-rpc.somnia.network/',
    fallbackRpcUrl: process.env.FALLBACK_RPC_URL || 'https://rpc.ankr.com/somnia_testnet/c8e336679a7fe85909f310fbbdd5fbb18d3b7560b1d3eca7aa97874b0bb81e97',
    chainId: process.env.CHAIN_ID || 50312,
    privateKey: process.env.PRIVATE_KEY,
    contractAddresses: {
      bitredictPool: process.env.POOL_CORE_ADDRESS || '0x7055e853562c7306264F3E0d50C56160C3F0d5Cf', // BitredictPoolCore (SOMNIA DEPLOYMENT)
      poolCore: process.env.POOL_CORE_ADDRESS || '0x7055e853562c7306264F3E0d50C56160C3F0d5Cf',
      boostSystem: process.env.BOOST_SYSTEM_ADDRESS || '0x54E46a1B9170C5218C953713dBB4Fd61F73bf5d2',
      comboPools: process.env.COMBO_POOLS_ADDRESS || '0x30222540A36D838e36FA4029fAb931e0f9010CFF',
      factory: process.env.POOL_FACTORY_ADDRESS || '0x7e686149322Ce8de0a0E047bf7590fe3fF353a98',
      guidedOracle: process.env.GUIDED_ORACLE_ADDRESS || '0x1Ef65F8F1D11829CB72E5D66038B3900d441d944',
      optimisticOracle: process.env.OPTIMISTIC_ORACLE_ADDRESS || '0xa6CE0C52Be110815F973AF68f8CEe04D2D218771',
      reputationSystem: process.env.REPUTATION_SYSTEM_ADDRESS || '0x868A0d50A12bABdAE1148807E08223EB76Dd32eb',
      bitrToken: process.env.BITR_TOKEN_ADDRESS || '0xfD8263CB7B270c09D589CFEAa5Ba3C5AE1C6b1AC',
      stakingContract: process.env.STAKING_ADDRESS || '0x9C2d0083d733866202e6ff7d8514851Bb4715f96',
      bitrFaucet: process.env.FAUCET_ADDRESS || '0x64C8a33f4D5938968eB51a33f62F14b514d342d7',
      oddyssey: process.env.ODDYSSEY_ADDRESS || '0x91eAf09ea6024F88eDB26F460429CdfD52349259'
    }
  },

  // API configuration
  api: {
    port: process.env.PORT || 3000,
    cors: {
      origin: (() => {
        if (process.env.CORS_ORIGIN) {
          return process.env.CORS_ORIGIN.split(',');
        }
        // Production: only allow production domains
        if (process.env.NODE_ENV === 'production') {
          return [
            'https://bitredict.xyz',
            'https://www.bitredict.xyz',
            'https://bitredict.vercel.app',
            'https://bitredict.io'
          ];
        }
        // Development: include localhost
        return [
          'https://bitredict.xyz',
          'https://www.bitredict.xyz',
          'https://bitredict.vercel.app',
          'https://bitredict.io',
          'http://localhost:8080',
          'http://localhost:3000'
        ];
      })(),
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-Requested-With',
        'X-API-Key',
        'Accept',
        'Origin',
        'Cache-Control' // ✅ Added to fix CORS error for faucet statistics
      ],
      credentials: true,
      optionsSuccessStatus: 200,
      preflightContinue: false
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10000, // Temporarily increased to 10000 to prevent frontend loop issues
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: false,
      skipFailedRequests: false
    },
    // Specific rate limits for different endpoints
    endpointLimits: {
      faucet: {
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 120 // Increased to 120 requests per minute for faucet endpoints
      },
      statistics: {
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 240 // Increased to 240 requests per minute for statistics
      },
      oddyssey: {
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 300 // 300 requests per minute for oddyssey endpoints
      }
    }
  },

  // Oracle configuration
  oracle: {
    port: process.env.ORACLE_PORT || 3001,
    signerPrivateKey: process.env.ORACLE_SIGNER_PRIVATE_KEY,
    updateInterval: process.env.ORACLE_UPDATE_INTERVAL || 60000, // 1 minute
    dataSources: {
      sports: process.env.SPORTS_API_KEY,
      crypto: process.env.CRYPTO_API_KEY,
      weather: process.env.WEATHER_API_KEY
    }
  },

  // SportMonks API configuration
  sportmonks: {
    baseUrl: process.env.SPORTMONKS_BASE_URL || 'https://api.sportmonks.com/v3/football',
    apiToken: process.env.SPORTMONKS_API_TOKEN,
    rateLimitDelay: process.env.SPORTMONKS_RATE_LIMIT_DELAY || 100, // ms between requests
    timeout: process.env.SPORTMONKS_TIMEOUT || 30000, // 30 seconds
    retryAttempts: process.env.SPORTMONKS_RETRY_ATTEMPTS || 3,
    popularLeagues: [
      2,    // UEFA Champions League
      5,    // UEFA Europa League
      8,    // Premier League
      82,   // Bundesliga
      564,  // La Liga
      301,  // Serie A
      501,  // Ligue 1
      271,  // Eredivisie
      2105, // World Cup
      1     // FIFA World Cup
    ]
  },

  // Coinpaprika API configuration
  coinpaprika: {
    baseUrl: process.env.COINPAPRIKA_BASE_URL || 'https://api.coinpaprika.com/v1',
    apiToken: process.env.COINPAPRIKA_API_TOKEN, // Optional - API is free without token
    rateLimitDelay: process.env.COINPAPRIKA_RATE_LIMIT_DELAY || 1000, // 1 second between requests
    timeout: process.env.COINPAPRIKA_TIMEOUT || 30000, // 30 seconds
    retryAttempts: process.env.COINPAPRIKA_RETRY_ATTEMPTS || 3,
    popularCoins: [
      'btc-bitcoin',
      'eth-ethereum', 
      'sol-solana',
      'ada-cardano',
      'matic-polygon',
      'avax-avalanche',
      'dot-polkadot',
      'link-chainlink',
      'uni-uniswap',
      'ltc-litecoin'
    ]
  },

  // Indexer configuration
  indexer: {
    startBlock: process.env.START_BLOCK || '164312555', // Start from recent block instead of 0
    batchSize: process.env.BATCH_SIZE || 50, // Smaller batch size for real-time performance
    pollInterval: process.env.POLL_INTERVAL || 30000, // 30 seconds to reduce database usage and enable autosuspend
    confirmationBlocks: process.env.CONFIRMATION_BLOCKS || 6, // 6 confirmation blocks for faster processing
    maxRetries: process.env.MAX_RETRIES || 5,
    retryDelay: process.env.RETRY_DELAY || 2000 // 2 seconds for faster recovery
  },

  // External services
  externalServices: {
    feeCollector: process.env.FEE_COLLECTOR,
    oracleSigners: process.env.ORACLE_SIGNERS ? process.env.ORACLE_SIGNERS.split(',') : []
  },

  // Airdrop configuration
  airdrop: {
    totalSupply: '5000000000000000000000000', // 5M BITR
    faucetAmount: '20000000000000000000000', // 20K BITR per user
    requirements: {
      minBITRActions: 20,
      minOddysseySlips: 3,
      stakingRequired: true,
      sttActivityRequired: true
    },
    snapshotSchedule: '0 0 * * 0', // Weekly on Sunday at midnight
    eligibilityUpdateInterval: 300000 // 5 minutes
  },

  // Contract addresses for airdrop indexing
  contracts: {
    bitrToken: process.env.BITR_TOKEN_ADDRESS || '0xfD8263CB7B270c09D589CFEAa5Ba3C5AE1C6b1AC',
    bitrFaucet: process.env.FAUCET_ADDRESS || '0x64C8a33f4D5938968eB51a33f62F14b514d342d7',
    staking: process.env.STAKING_ADDRESS || '0x9C2d0083d733866202e6ff7d8514851Bb4715f96'
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log'
  }
};
