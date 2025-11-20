#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

class LogoComparisonGenerator {
  constructor() {
    this.template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Logo Background Comparison</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', sans-serif;
            background: #f7fafc;
            padding: 40px;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }
        
        h1 {
            text-align: center;
            color: #2d3748;
            margin-bottom: 40px;
            font-size: 2.5em;
        }
        
        .comparison {
            display: flex;
            gap: 40px;
            justify-content: center;
            align-items: center;
            margin: 40px 0;
        }
        
        .logo-container {
            text-align: center;
        }
        
        .logo-container h3 {
            margin-bottom: 20px;
            color: #4a5568;
            font-size: 1.2em;
        }
        
        .logo {
            width: 120px;
            height: 120px;
            border-radius: 25px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 15px 35px rgba(0,0,0,0.3);
            position: relative;
            overflow: hidden;
        }
        
        .logo-white {
            background: white;
        }
        
        .logo-black {
            background: #1a202c;
        }
        
        .logo img {
            width: 100px;
            height: 100px;
            object-fit: contain;
        }
        
        .description {
            text-align: center;
            margin-top: 40px;
            color: #718096;
            font-size: 1.1em;
            line-height: 1.6;
        }
        
        .highlight {
            background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
            padding: 20px;
            border-radius: 15px;
            margin: 30px 0;
            text-align: center;
        }
        
        .highlight strong {
            color: #2d3748;
            font-size: 1.1em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Bitredict Logo Background Comparison</h1>
        
        <div class="comparison">
            <div class="logo-container">
                <h3>White Background</h3>
                <div class="logo logo-white">
                    <img src="data:image/png;base64,{{LOGO_BASE64}}" alt="Bitredict Logo" />
                </div>
            </div>
            
            <div class="logo-container">
                <h3>Black Background</h3>
                <div class="logo logo-black">
                    <img src="data:image/png;base64,{{LOGO_BASE64}}" alt="Bitredict Logo" />
                </div>
            </div>
        </div>
        
        <div class="highlight">
            <strong>Updated PDFs now use the black background for better logo visibility!</strong>
        </div>
        
        <div class="description">
            The black background provides better contrast and makes the Bitredict logo stand out more prominently in the PDF documents. This creates a more professional and visually appealing presentation.
        </div>
    </div>
</body>
</html>`;
  }

  async generateComparison() {
    try {
      console.log('🖼️ Loading Bitredict logo...');
      const logoPath = '/home/leon/bitredict-linux/backend/public/logo.png';
      let logoBase64 = '';
      
      try {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = logoBuffer.toString('base64');
        console.log('✅ Logo loaded successfully');
      } catch (error) {
        console.warn('⚠️ Could not load logo');
        return;
      }
      
      console.log('🎨 Creating comparison HTML...');
      const htmlContent = this.template.replace('{{LOGO_BASE64}}', logoBase64);
      
      console.log('🌐 Launching browser...');
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      
      console.log('📄 Generating comparison PDF...');
      const pdf = await page.pdf({
        path: '/home/leon/bitredict-linux/Logo_Background_Comparison.pdf',
        format: 'A4',
        printBackground: true,
        margin: {
          top: '15mm',
          right: '15mm',
          bottom: '15mm',
          left: '15mm'
        }
      });
      
      await browser.close();
      
      console.log('✅ Logo comparison PDF generated successfully!');
      return '/home/leon/bitredict-linux/Logo_Background_Comparison.pdf';
      
    } catch (error) {
      console.error('❌ Error generating comparison:', error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const generator = new LogoComparisonGenerator();
  
  try {
    await generator.generateComparison();
    console.log('🎉 Logo background comparison completed!');
  } catch (error) {
    console.error('💥 Comparison generation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = LogoComparisonGenerator;
