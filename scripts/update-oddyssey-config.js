const fs = require('fs');
const path = require('path');

async function updateConfig() {
  try {
    console.log('🔧 Updating Oddyssey configuration...');
    
    // Read deployment info
    const deploymentInfoPath = path.join(__dirname, '../solidity/deployment-info.json');
    if (!fs.existsSync(deploymentInfoPath)) {
      console.error('❌ deployment-info.json not found. Please deploy the contract first.');
      process.exit(1);
    }
    
    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentInfoPath, 'utf8'));
    console.log('📋 Deployment info loaded:', deploymentInfo.address);
    
    // Update backend .env file
    const backendEnvPath = path.join(__dirname, '../backend/.env');
    let backendEnv = '';
    
    if (fs.existsSync(backendEnvPath)) {
      backendEnv = fs.readFileSync(backendEnvPath, 'utf8');
    }
    
    // Update or add ODDYSSEY_ADDRESS
    const oddysseyAddressRegex = /ODDYSSEY_ADDRESS=.*/;
    const newOddysseyAddress = `ODDYSSEY_ADDRESS=${deploymentInfo.address}`;
    
    if (oddysseyAddressRegex.test(backendEnv)) {
      backendEnv = backendEnv.replace(oddysseyAddressRegex, newOddysseyAddress);
    } else {
      backendEnv += `\n${newOddysseyAddress}`;
    }
    
    fs.writeFileSync(backendEnvPath, backendEnv);
    console.log('✅ Backend .env updated');
    
    // Update frontend configuration
    const frontendConfigPath = path.join(__dirname, '../predict-linux/config/contracts.ts');
    if (fs.existsSync(frontendConfigPath)) {
      let frontendConfig = fs.readFileSync(frontendConfigPath, 'utf8');
      
      // Update Oddyssey address
      const oddysseyAddressRegex = /ODDYSSEY_ADDRESS: ['"][^'"]*['"]/;
      const newOddysseyConfig = `ODDYSSEY_ADDRESS: '${deploymentInfo.address}'`;
      
      if (oddysseyAddressRegex.test(frontendConfig)) {
        frontendConfig = frontendConfig.replace(oddysseyAddressRegex, newOddysseyConfig);
      } else {
        // Add to the contracts object
        const contractsRegex = /export const contracts = {([^}]*)}/;
        const match = frontendConfig.match(contractsRegex);
        if (match) {
          const contractsContent = match[1];
          const updatedContracts = contractsContent + `\n  ODDYSSEY_ADDRESS: '${deploymentInfo.address}',`;
          frontendConfig = frontendConfig.replace(contractsRegex, `export const contracts = {${updatedContracts}}`);
        }
      }
      
      fs.writeFileSync(frontendConfigPath, frontendConfig);
      console.log('✅ Frontend config updated');
    }
    
    // Create deployment summary
    const summary = {
      contract: 'Oddyssey',
      address: deploymentInfo.address,
      network: deploymentInfo.network,
      deploymentTime: deploymentInfo.deploymentTime,
      backendEnvUpdated: true,
      frontendConfigUpdated: fs.existsSync(frontendConfigPath),
      nextSteps: [
        'Deploy the updated backend to Fly.io',
        'Update frontend deployment',
        'Test the new contract integration',
        'Verify cycle creation works properly'
      ]
    };
    
    const summaryPath = path.join(__dirname, 'deployment-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    
    console.log('📄 Deployment summary saved to scripts/deployment-summary.json');
    console.log('🎉 Configuration update completed!');
    console.log('\n📋 Next steps:');
    summary.nextSteps.forEach((step, index) => {
      console.log(`  ${index + 1}. ${step}`);
    });
    
  } catch (error) {
    console.error('❌ Error updating configuration:', error);
    process.exit(1);
  }
}

updateConfig(); 