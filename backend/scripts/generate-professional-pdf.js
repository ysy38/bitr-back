const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

class ProfessionalPDFGenerator {
  constructor() {
    this.template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bitredict MVP Specification</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #2d3748;
            background: #ffffff;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
        }
        
        .header {
            background: linear-gradient(135deg, #1a202c 0%, #2d3748 100%);
            color: white;
            padding: 60px 50px;
            text-align: center;
            position: relative;
        }
        
        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="0.5"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)"/></svg>');
            opacity: 0.3;
        }
        
        .logo-section {
            position: relative;
            z-index: 1;
            margin-bottom: 40px;
        }
        
        .logo {
            width: 80px;
            height: 80px;
            background: white;
            border-radius: 20px;
            margin: 0 auto 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            border: 2px solid rgba(255,255,255,0.2);
        }
        
        .logo img {
            width: 60px;
            height: 60px;
            object-fit: contain;
        }
        
        .header h1 {
            font-size: 3.5em;
            font-weight: 800;
            margin-bottom: 15px;
            letter-spacing: -2px;
            position: relative;
            z-index: 1;
        }
        
        .header .subtitle {
            font-size: 1.3em;
            font-weight: 400;
            opacity: 0.9;
            position: relative;
            z-index: 1;
            letter-spacing: 0.5px;
        }
        
        .content {
            padding: 50px;
        }
        
        h1 {
            color: #1a202c;
            font-size: 2.8em;
            font-weight: 800;
            margin: 50px 0 30px 0;
            text-align: center;
            letter-spacing: -1px;
        }
        
        h2 {
            color: #2d3748;
            font-size: 2.2em;
            font-weight: 700;
            margin: 40px 0 25px 0;
            border-bottom: 3px solid #4299e1;
            padding-bottom: 10px;
        }
        
        h3 {
            color: #4a5568;
            font-size: 1.8em;
            font-weight: 600;
            margin: 30px 0 20px 0;
        }
        
        h4 {
            color: #718096;
            font-size: 1.4em;
            font-weight: 600;
            margin: 25px 0 15px 0;
        }
        
        p {
            margin-bottom: 20px;
            font-size: 1.1em;
            line-height: 1.7;
            color: #4a5568;
        }
        
        ul, ol {
            margin: 25px 0;
            padding-left: 30px;
        }
        
        li {
            margin-bottom: 10px;
            font-size: 1.1em;
            line-height: 1.6;
            color: #4a5568;
        }
        
        .user-story {
            background: #f7fafc;
            border-left: 4px solid #4299e1;
            padding: 25px;
            margin: 25px 0;
            border-radius: 0 8px 8px 0;
        }
        
        .user-story strong {
            color: #2b6cb0;
            font-weight: 700;
            display: block;
            margin-bottom: 10px;
            font-size: 1.1em;
        }
        
        .technical-requirements {
            background: #f0fff4;
            border-left: 4px solid #38a169;
            padding: 25px;
            margin: 25px 0;
            border-radius: 0 8px 8px 0;
        }
        
        .technical-requirements strong {
            color: #2f855a;
            font-weight: 700;
            display: block;
            margin-bottom: 10px;
            font-size: 1.1em;
        }
        
        .functionality {
            background: #fffaf0;
            border-left: 4px solid #ed8936;
            padding: 25px;
            margin: 25px 0;
            border-radius: 0 8px 8px 0;
        }
        
        .functionality strong {
            color: #c05621;
            font-weight: 700;
            display: block;
            margin-bottom: 10px;
            font-size: 1.1em;
        }
        
        code {
            background: #edf2f7;
            padding: 4px 8px;
            border-radius: 4px;
            font-family: 'JetBrains Mono', monospace;
            color: #e53e3e;
            font-size: 0.9em;
            border: 1px solid #e2e8f0;
        }
        
        pre {
            background: #2d3748;
            color: #e2e8f0;
            padding: 25px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 25px 0;
            font-family: 'JetBrains Mono', monospace;
        }
        
        pre code {
            background: none;
            color: inherit;
            padding: 0;
            border: none;
        }
        
        .contract-function {
            background: #f7fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            font-family: 'JetBrains Mono', monospace;
        }
        
        .contract-function strong {
            color: #2d3748;
            font-weight: 600;
        }
        
        .footer {
            background: #1a202c;
            color: white;
            padding: 40px 50px;
            text-align: center;
        }
        
        .footer p {
            margin: 8px 0;
            opacity: 0.8;
            font-size: 1em;
        }
        
        .footer strong {
            color: #a8edea;
            font-weight: 600;
        }
        
        .toc {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 25px;
            margin: 30px 0;
        }
        
        .toc h3 {
            color: #4a5568;
            margin-bottom: 15px;
            font-size: 1.3em;
        }
        
        .toc ul {
            list-style: none;
            padding-left: 0;
        }
        
        .toc li {
            margin: 8px 0;
            padding-left: 20px;
            position: relative;
        }
        
        .toc li::before {
            content: '▶';
            position: absolute;
            left: 0;
            color: #4299e1;
            font-size: 0.8em;
        }
        
        @media print {
            body {
                background: white;
            }
            
            .header {
                background: #1a202c !important;
                -webkit-print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo-section">
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
      
      console.log('🎨 Applying professional styling...');
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
      
      console.log('📄 Generating professional PDF...');
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
      
      console.log(`✅ Professional PDF generated successfully: ${outputFile}`);
      return outputFile;
      
    } catch (error) {
      console.error('❌ Error generating professional PDF:', error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const generator = new ProfessionalPDFGenerator();
  
  const markdownFile = '/home/leon/bitredict-linux/Bitredict_MVP_Specification.md';
  const outputFile = '/home/leon/bitredict-linux/Bitredict_MVP_Specification_Professional.pdf';
  
  try {
    await generator.generatePDF(markdownFile, outputFile);
    console.log('🎉 Professional PDF generation completed successfully!');
  } catch (error) {
    console.error('💥 Professional PDF generation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = ProfessionalPDFGenerator;
