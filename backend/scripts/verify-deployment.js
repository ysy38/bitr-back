#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Verify that all changes will take effect on Fly.io deployment
 */
function verifyDeployment() {
  console.log('🚀 Verifying Fly.io deployment readiness...\n');

  const checks = [];

  // Check 1: Dockerfile includes all necessary files
  console.log('📦 Checking Dockerfile...');
  const dockerfilePath = path.join(__dirname, '../../Dockerfile');
  if (fs.existsSync(dockerfilePath)) {
    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
    
    if (dockerfile.includes('COPY backend/')) {
      checks.push({ name: 'Dockerfile copies backend files', status: '✅' });
    } else {
      checks.push({ name: 'Dockerfile copies backend files', status: '❌' });
    }
    
    if (dockerfile.includes('npm install') || dockerfile.includes('npm ci')) {
      checks.push({ name: 'Dockerfile installs dependencies', status: '✅' });
    } else {
      checks.push({ name: 'Dockerfile installs dependencies', status: '❌' });
    }
  } else {
    checks.push({ name: 'Dockerfile exists', status: '❌' });
  }

  // Check 2: Package.json has correct scripts
  console.log('📋 Checking package.json scripts...');
  const packageJsonPath = path.join(__dirname, '../package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    const requiredScripts = ['start', 'analytics:setup', 'abi:validate', 'oddyssey:fix'];
    requiredScripts.forEach(script => {
      if (packageJson.scripts && packageJson.scripts[script]) {
        checks.push({ name: `Script: ${script}`, status: '✅' });
      } else {
        checks.push({ name: `Script: ${script}`, status: '❌' });
      }
    });
  } else {
    checks.push({ name: 'Package.json exists', status: '❌' });
  }

  // Check 3: All new files exist
  console.log('📁 Checking new files...');
  const newFiles = [
    'backend/db/analytics-setup.js',
    'backend/scripts/validate-oddyssey-abi.js',
    'backend/scripts/fix-oddyssey-integration.js'
  ];

  newFiles.forEach(filePath => {
    const fullPath = path.join(__dirname, '../../', filePath);
    if (fs.existsSync(fullPath)) {
      checks.push({ name: `File: ${filePath}`, status: '✅' });
    } else {
      checks.push({ name: `File: ${filePath}`, status: '❌' });
    }
  });

  // Check 4: Environment variables
  console.log('🔐 Checking environment variables...');
  const requiredEnvVars = [
    'DATABASE_URL',
    'ODDYSSEY_ADDRESS',
    'RPC_URL'
  ];

  requiredEnvVars.forEach(envVar => {
    if (process.env[envVar]) {
      checks.push({ name: `ENV: ${envVar}`, status: '✅' });
    } else {
      checks.push({ name: `ENV: ${envVar}`, status: '⚠️' });
    }
  });

  // Check 5: Fly.io configuration
  console.log('✈️ Checking Fly.io configuration...');
  const flyTomlPath = path.join(__dirname, '../fly.toml');
  if (fs.existsSync(flyTomlPath)) {
    checks.push({ name: 'fly.toml exists', status: '✅' });
    
    const flyToml = fs.readFileSync(flyTomlPath, 'utf8');
    if (flyToml.includes('[env]') || flyToml.includes('PORT')) {
      checks.push({ name: 'fly.toml has environment config', status: '✅' });
    } else {
      checks.push({ name: 'fly.toml has environment config', status: '⚠️' });
    }
  } else {
    checks.push({ name: 'fly.toml exists', status: '❌' });
  }

  // Display results
  console.log('\n📊 Deployment Readiness Report:');
  console.log('================================');
  
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  checks.forEach(check => {
    console.log(`${check.status} ${check.name}`);
    if (check.status === '✅') passCount++;
    else if (check.status === '⚠️') warnCount++;
    else failCount++;
  });

  console.log('\n📈 Summary:');
  console.log(`✅ Passed: ${passCount}`);
  console.log(`⚠️ Warnings: ${warnCount}`);
  console.log(`❌ Failed: ${failCount}`);

  // Deployment recommendations
  console.log('\n🚀 Deployment Steps:');
  console.log('1. Commit all changes to git');
  console.log('2. Run: fly deploy');
  console.log('3. After deployment, run: fly ssh console -C "npm run oddyssey:fix"');
  console.log('4. Test endpoints: /api/oddyssey/contract-validation');
  console.log('5. Test analytics: /api/analytics/global');

  if (failCount > 0) {
    console.log('\n⚠️ WARNING: Some critical checks failed. Fix these before deploying.');
    return false;
  } else if (warnCount > 0) {
    console.log('\n⚠️ Some warnings detected. Review before deploying.');
    return true;
  } else {
    console.log('\n🎉 All checks passed! Ready for deployment.');
    return true;
  }
}

// Run verification if called directly
if (require.main === module) {
  const isReady = verifyDeployment();
  process.exit(isReady ? 0 : 1);
}

module.exports = { verifyDeployment };
