#!/usr/bin/env node

/**
 * Deploy Enhanced Indexer
 * 
 * This script safely replaces the old indexer with the enhanced version
 * that includes RPC failover and better error handling
 */

const fs = require('fs');
const path = require('path');

async function deployEnhancedIndexer() {
  console.log('🚀 Deploying Enhanced Indexer...');
  
  const backendDir = path.join(__dirname, '..');
  const oldIndexerPath = path.join(backendDir, 'indexer.js');
  const newIndexerPath = path.join(backendDir, 'indexer-enhanced.js');
  const backupPath = path.join(backendDir, 'indexer-backup.js');
  
  try {
    // 1. Backup the original indexer
    console.log('📦 Backing up original indexer...');
    if (fs.existsSync(oldIndexerPath)) {
      fs.copyFileSync(oldIndexerPath, backupPath);
      console.log('✅ Original indexer backed up to indexer-backup.js');
    }
    
    // 2. Replace with enhanced version
    console.log('🔄 Replacing with enhanced indexer...');
    if (fs.existsSync(newIndexerPath)) {
      fs.copyFileSync(newIndexerPath, oldIndexerPath);
      console.log('✅ Enhanced indexer deployed as indexer.js');
    } else {
      throw new Error('Enhanced indexer file not found');
    }
    
    // 3. Update package.json scripts if needed
    console.log('📝 Checking package.json scripts...');
    const packageJsonPath = path.join(backendDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      if (!packageJson.scripts) {
        packageJson.scripts = {};
      }
      
      // Add enhanced indexer scripts
      packageJson.scripts['indexer:enhanced'] = 'node indexer.js';
      packageJson.scripts['indexer:test'] = 'node -e "const RpcManager = require(\'./utils/rpc-manager\'); const rm = new RpcManager(); rm.getBlockNumber().then(b => console.log(\'Block:\', b)).catch(console.error);"';
      packageJson.scripts['indexer:status'] = 'node -e "const RpcManager = require(\'./utils/rpc-manager\'); const rm = new RpcManager(); rm.logStatus();"';
      
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log('✅ Package.json scripts updated');
    }
    
    // 4. Create database table for indexed blocks if not exists
    console.log('🗄️ Ensuring database schema...');
    const db = require('../db/db');
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS oracle.indexed_blocks (
        block_number BIGINT PRIMARY KEY,
        indexed_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    console.log('✅ Database schema ready');
    
    // 5. Test the enhanced indexer
    console.log('🧪 Testing enhanced indexer...');
    const EnhancedIndexer = require('../indexer.js');
    const testIndexer = new EnhancedIndexer();
    
    await testIndexer.initialize();
    console.log('✅ Enhanced indexer initialization test passed');
    
    console.log('\\n🎉 Enhanced Indexer Deployment Complete!');
    console.log('\\n📋 Next Steps:');
    console.log('1. Restart your indexer service');
    console.log('2. Monitor logs for improved error handling');
    console.log('3. Use npm run indexer:status to check RPC health');
    console.log('\\n🔧 Available Commands:');
    console.log('- npm run indexer:enhanced  # Start enhanced indexer');
    console.log('- npm run indexer:test      # Test RPC connections');
    console.log('- npm run indexer:status    # Check RPC status');
    
  } catch (error) {
    console.error('❌ Deployment failed:', error);
    
    // Rollback if possible
    if (fs.existsSync(backupPath)) {
      console.log('🔄 Rolling back to original indexer...');
      fs.copyFileSync(backupPath, oldIndexerPath);
      console.log('✅ Rollback complete');
    }
    
    process.exit(1);
  }
}

// Run deployment
deployEnhancedIndexer().catch(error => {
  console.error('❌ Deployment script failed:', error);
  process.exit(1);
});
