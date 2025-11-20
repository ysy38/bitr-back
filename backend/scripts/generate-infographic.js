const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function generateInfographic() {
  console.log('🎨 Starting infographic generation...');
  
  const publicDir = path.join(__dirname, '../public');
  const htmlFile = path.join(publicDir, 'faucet-airdrop-infographic.html');
  const outputFile = path.join(publicDir, 'faucet-airdrop-infographic.png');
  
  // Check if HTML file exists
  if (!fs.existsSync(htmlFile)) {
    console.error('❌ HTML file not found:', htmlFile);
    process.exit(1);
  }
  
  // Convert to file:// URL
  const htmlUrl = `file://${htmlFile}`;
  
  console.log('📄 HTML file:', htmlFile);
  console.log('💾 Output file:', outputFile);
  
  let browser;
  try {
    // Launch browser
    console.log('🚀 Launching browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set viewport to match infographic dimensions
    await page.setViewport({
      width: 1200,
      height: 1600,
      deviceScaleFactor: 2 // Higher quality
    });
    
    console.log('📖 Loading HTML file...');
    await page.goto(htmlUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    
    // Wait a bit for fonts and images to load
    console.log('⏳ Waiting for assets to load...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Take screenshot
    console.log('📸 Capturing screenshot...');
    await page.screenshot({
      path: outputFile,
      type: 'png',
      fullPage: false,
      clip: {
        x: 0,
        y: 0,
        width: 1200,
        height: 1600
      }
    });
    
    console.log('✅ Infographic generated successfully!');
    console.log('📁 Saved to:', outputFile);
    
    // Get file size
    const stats = fs.statSync(outputFile);
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`📊 File size: ${fileSizeInMB} MB`);
    
  } catch (error) {
    console.error('❌ Error generating infographic:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed');
    }
  }
}

// Run the script
generateInfographic().catch(console.error);

