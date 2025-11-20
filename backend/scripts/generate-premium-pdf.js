const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

class PremiumPDFGenerator {
  constructor() {
    this.template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bitredict MVP Specification</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800;900&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.8;
            color: #1a202c;
            background: #f7fafc;
        }
        
        .container {
            max-width: 850px;
            margin: 0 auto;
            background: white;
            box-shadow: 0 35px 70px rgba(0,0,0,0.2);
            border-radius: 20px;
            overflow: hidden;
            position: relative;
        }
        
        .container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 6px;
            background: linear-gradient(90deg, #667eea, #764ba2, #f093fb, #667eea);
            background-size: 200% 100%;
            animation: gradientShift 3s ease-in-out infinite;
        }
        
        @keyframes gradientShift {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 30%, #f093fb 70%, #667eea 100%);
            color: white;
            padding: 80px 50px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }
        
        .header::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%);
            animation: float 8s ease-in-out infinite;
        }
        
        .header::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
        }
        
        @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-30px) rotate(180deg); }
        }
        
        .logo-container {
            position: relative;
            z-index: 1;
            margin-bottom: 40px;
        }
        
        .logo {
            width: 140px;
            height: 140px;
            background: #1a202c;
            border-radius: 35px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 20px 50px rgba(0,0,0,0.4);
            position: relative;
            overflow: hidden;
            border: 4px solid rgba(255,255,255,0.3);
        }
        
        .logo::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: linear-gradient(45deg, transparent, rgba(102, 126, 234, 0.1), transparent);
            animation: logoShine 3s ease-in-out infinite;
        }
        
        @keyframes logoShine {
            0%, 100% { transform: translateX(-100%) translateY(-100%) rotate(45deg); }
            50% { transform: translateX(100%) translateY(100%) rotate(45deg); }
        }
        
        .logo img {
            width: 120px;
            height: 120px;
            object-fit: contain;
            position: relative;
            z-index: 1;
        }
        
        .header h1 {
            font-family: 'Playfair Display', serif;
            font-size: 4em;
            margin-bottom: 20px;
            font-weight: 900;
            position: relative;
            z-index: 1;
            text-shadow: 0 4px 8px rgba(0,0,0,0.3);
            letter-spacing: -1px;
        }
        
        .header .subtitle {
            font-size: 1.5em;
            opacity: 0.95;
            font-weight: 500;
            position: relative;
            z-index: 1;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
            letter-spacing: 1px;
        }
        
        .content {
            padding: 60px;
        }
        
        h1 {
            color: #667eea;
            font-family: 'Playfair Display', serif;
            font-size: 3.2em;
            margin: 60px 0 40px 0;
            font-weight: 900;
            position: relative;
            text-align: center;
            letter-spacing: -1px;
        }
        
        h1::after {
            content: '';
            position: absolute;
            bottom: -20px;
            left: 50%;
            transform: translateX(-50%);
            width: 100px;
            height: 6px;
            background: linear-gradient(90deg, #667eea, #764ba2);
            border-radius: 3px;
        }
        
        h2 {
            color: #764ba2;
            font-size: 2.5em;
            margin: 50px 0 30px 0;
            font-weight: 800;
            position: relative;
            padding-left: 30px;
        }
        
        h2::before {
            content: '';
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 10px;
            height: 40px;
            background: linear-gradient(180deg, #667eea, #764ba2);
            border-radius: 5px;
        }
        
        h3 {
            color: #5a67d8;
            font-size: 2em;
            margin: 40px 0 25px 0;
            font-weight: 700;
        }
        
        h4 {
            color: #4c51bf;
            font-size: 1.6em;
            margin: 30px 0 20px 0;
            font-weight: 600;
        }
        
        p {
            margin-bottom: 25px;
            text-align: justify;
            font-size: 1.15em;
            line-height: 1.9;
        }
        
        ul, ol {
            margin: 30px 0;
            padding-left: 45px;
        }
        
        li {
            margin-bottom: 15px;
            font-size: 1.15em;
            line-height: 1.8;
        }
        
        .user-story {
            background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
            border-left: 8px solid #4299e1;
            padding: 40px;
            margin: 30px 0;
            border-radius: 0 20px 20px 0;
            box-shadow: 0 12px 35px rgba(66, 153, 225, 0.2);
            position: relative;
            border: 1px solid rgba(66, 153, 225, 0.1);
        }
        
        .user-story::before {
            content: '👤';
            position: absolute;
            top: 25px;
            right: 25px;
            font-size: 28px;
        }
        
        .user-story strong {
            color: #2b6cb0;
            display: block;
            margin-bottom: 20px;
            font-size: 1.3em;
            font-weight: 800;
        }
        
        .technical-requirements {
            background: linear-gradient(135deg, #f0fff4 0%, #e6fffa 100%);
            border-left: 8px solid #38a169;
            padding: 40px;
            margin: 30px 0;
            border-radius: 0 20px 20px 0;
            box-shadow: 0 12px 35px rgba(56, 161, 105, 0.2);
            position: relative;
            border: 1px solid rgba(56, 161, 105, 0.1);
        }
        
        .technical-requirements::before {
            content: '⚙️';
            position: absolute;
            top: 25px;
            right: 25px;
            font-size: 28px;
        }
        
        .technical-requirements strong {
            color: #2f855a;
            display: block;
            margin-bottom: 20px;
            font-size: 1.3em;
            font-weight: 800;
        }
        
        .functionality {
            background: linear-gradient(135deg, #fffaf0 0%, #fef5e7 100%);
            border-left: 8px solid #ed8936;
            padding: 40px;
            margin: 30px 0;
            border-radius: 0 20px 20px 0;
            box-shadow: 0 12px 35px rgba(237, 137, 54, 0.2);
            position: relative;
            border: 1px solid rgba(237, 137, 54, 0.1);
        }
        
        .functionality::before {
            content: '🚀';
            position: absolute;
            top: 25px;
            right: 25px;
            font-size: 28px;
        }
        
        .functionality strong {
            color: #c05621;
            display: block;
            margin-bottom: 20px;
            font-size: 1.3em;
            font-weight: 800;
        }
        
        code {
            background: #f1f5f9;
            padding: 8px 16px;
            border-radius: 10px;
            font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
            color: #e53e3e;
            font-size: 0.95em;
            border: 2px solid #e2e8f0;
            font-weight: 600;
        }
        
        pre {
            background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
            color: #e2e8f0;
            padding: 40px;
            border-radius: 20px;
            overflow-x: auto;
            margin: 30px 0;
            box-shadow: 0 15px 45px rgba(0,0,0,0.5);
            border: 2px solid #4a5568;
            position: relative;
        }
        
        pre::before {
            content: '💻';
            position: absolute;
            top: 20px;
            right: 25px;
            font-size: 24px;
        }
        
        pre code {
            background: none;
            color: inherit;
            padding: 0;
            border: none;
        }
        
        .contract-function {
            background: linear-gradient(135deg, #edf2f7 0%, #e2e8f0 100%);
            border: 3px solid #cbd5e0;
            border-radius: 15px;
            padding: 30px;
            margin: 25px 0;
            font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
            box-shadow: 0 12px 35px rgba(0,0,0,0.1);
            position: relative;
        }
        
        .contract-function::before {
            content: '📄';
            position: absolute;
            top: 20px;
            right: 25px;
            font-size: 24px;
        }
        
        .contract-function strong {
            color: #2d3748;
            font-weight: 800;
        }
        
        .highlight {
            background: linear-gradient(135deg, #a8edea 0%, #fed6e3 50%, #d299c2 100%);
            padding: 45px;
            border-radius: 25px;
            margin: 40px 0;
            border: 3px solid #e2e8f0;
            box-shadow: 0 15px 45px rgba(168, 237, 234, 0.3);
            position: relative;
        }
        
        .highlight::before {
            content: '✨';
            position: absolute;
            top: 25px;
            right: 30px;
            font-size: 28px;
        }
        
        .footer {
            background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
            color: white;
            padding: 60px;
            text-align: center;
            position: relative;
        }
        
        .footer::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 6px;
            background: linear-gradient(90deg, #667eea, #764ba2, #f093fb);
        }
        
        .footer p {
            margin: 12px 0;
            opacity: 0.9;
            font-size: 1.2em;
        }
        
        .footer strong {
            color: #a8edea;
            font-weight: 800;
        }
        
        .toc {
            background: #f8fafc;
            border: 3px solid #e2e8f0;
            border-radius: 20px;
            padding: 40px;
            margin: 40px 0;
            position: relative;
        }
        
        .toc::before {
            content: '📋';
            position: absolute;
            top: 25px;
            right: 30px;
            font-size: 28px;
        }
        
        .toc h3 {
            color: #4a5568;
            margin-bottom: 25px;
            font-size: 1.6em;
        }
        
        .toc ul {
            list-style: none;
            padding-left: 0;
        }
        
        .toc li {
            margin: 12px 0;
            padding-left: 30px;
            position: relative;
        }
        
        .toc li::before {
            content: '▶';
            position: absolute;
            left: 0;
            color: #667eea;
            font-size: 1em;
            font-weight: 700;
        }
        
        @media print {
            body {
                background: white;
            }
            
            .container {
                box-shadow: none;
                border-radius: 0;
            }
            
            .header {
                background: #667eea !important;
                -webkit-print-color-adjust: exact;
            }
            
            .header::before,
            .header::after {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo-container">
                <div class="logo">
                    <img src="data:image/png;base64,{{LOGO_BASE64}}" alt="Bitredict Logo" />
                </div>
            </div>
            <h1>Bitredict</h1>
            <div class="subtitle">MVP Specification Document</div>
        </div>
        
        <div class="content">
            {{CONTENT}}
        </div>
        
        <div class="footer">
            <p><strong>Bitredict Platform</strong></p>
            <p>Decentralized Prediction Markets on Somnia Blockchain</p>
            <p>Generated on {{DATE}}</p>
        </div>
    </div>
</body>
</html>`;
  }

  async generatePDF(markdownFile, outputFile) {
    try {
      console.log('📄 Reading Markdown file...');
      const markdownContent = fs.readFileSync(markdownFile, 'utf8');
      
      console.log('🖼️ Loading Bitredict logo...');
      const logoPath = '/home/leon/bitredict-linux/backend/public/logo.png';
      let logoBase64 = '';
      
      try {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = logoBuffer.toString('base64');
        console.log('✅ Logo loaded successfully');
      } catch (error) {
        console.warn('⚠️ Could not load logo, using fallback');
        logoBase64 = '';
      }
      
      console.log('🔄 Converting Markdown to HTML...');
      const { marked } = await import('marked');
      const htmlContent = marked(markdownContent);
      
      console.log('🎨 Applying premium styling with logo...');
      const styledHTML = this.template
        .replace('{{CONTENT}}', htmlContent)
        .replace('{{LOGO_BASE64}}', logoBase64)
        .replace('{{DATE}}', new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }));
      
      console.log('🌐 Launching browser...');
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setContent(styledHTML, { waitUntil: 'networkidle0' });
      
      console.log('📄 Generating premium PDF with logo...');
      const pdf = await page.pdf({
        path: outputFile,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '15mm',
          right: '15mm',
          bottom: '15mm',
          left: '15mm'
        },
        displayHeaderFooter: false
      });
      
      await browser.close();
      
      console.log(`✅ Premium PDF with logo generated successfully: ${outputFile}`);
      return outputFile;
      
    } catch (error) {
      console.error('❌ Error generating premium PDF:', error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const generator = new PremiumPDFGenerator();
  
  const markdownFile = '/home/leon/bitredict-linux/Bitredict_MVP_Specification.md';
  const outputFile = '/home/leon/bitredict-linux/Bitredict_MVP_Specification_Premium.pdf';
  
  try {
    await generator.generatePDF(markdownFile, outputFile);
    console.log('🎉 Premium PDF with logo generation completed successfully!');
  } catch (error) {
    console.error('💥 Premium PDF generation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = PremiumPDFGenerator;
