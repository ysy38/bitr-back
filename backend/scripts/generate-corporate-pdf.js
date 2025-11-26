const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

class CorporatePDFGenerator {
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
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #1a202c;
            background: #ffffff;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
        }
        
        .header {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
            color: white;
            padding: 80px 60px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }
        
        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: 
                radial-gradient(circle at 20% 80%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
                radial-gradient(circle at 40% 40%, rgba(16, 185, 129, 0.1) 0%, transparent 50%);
        }
        
        .logo-section {
            position: relative;
            z-index: 1;
            margin-bottom: 50px;
        }
        
        .logo {
            width: 100px;
            height: 100px;
            background: white;
            border-radius: 24px;
            margin: 0 auto 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            border: 3px solid rgba(255,255,255,0.2);
            position: relative;
        }
        
        .logo::after {
            content: '';
            position: absolute;
            top: -2px;
            left: -2px;
            right: -2px;
            bottom: -2px;
            background: linear-gradient(45deg, #3b82f6, #8b5cf6, #10b981);
            border-radius: 26px;
            z-index: -1;
        }
        
        .logo img {
            width: 70px;
            height: 70px;
            object-fit: contain;
        }
        
        .header h1 {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 4.5em;
            font-weight: 700;
            margin-bottom: 20px;
            letter-spacing: -3px;
            position: relative;
            z-index: 1;
            background: linear-gradient(135deg, #ffffff 0%, #e2e8f0 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .header .subtitle {
            font-size: 1.4em;
            font-weight: 500;
            opacity: 0.9;
            position: relative;
            z-index: 1;
            letter-spacing: 1px;
            color: #cbd5e1;
        }
        
        .content {
            padding: 60px;
        }
        
        h1 {
            color: #0f172a;
            font-family: 'Space Grotesk', sans-serif;
            font-size: 3.2em;
            font-weight: 700;
            margin: 60px 0 40px 0;
            text-align: center;
            letter-spacing: -2px;
            position: relative;
        }
        
        h1::after {
            content: '';
            position: absolute;
            bottom: -15px;
            left: 50%;
            transform: translateX(-50%);
            width: 80px;
            height: 4px;
            background: linear-gradient(90deg, #3b82f6, #8b5cf6);
            border-radius: 2px;
        }
        
        h2 {
            color: #1e293b;
            font-size: 2.4em;
            font-weight: 600;
            margin: 50px 0 30px 0;
            position: relative;
            padding-left: 20px;
        }
        
        h2::before {
            content: '';
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 6px;
            height: 30px;
            background: linear-gradient(180deg, #3b82f6, #8b5cf6);
            border-radius: 3px;
        }
        
        h3 {
            color: #334155;
            font-size: 2em;
            font-weight: 600;
            margin: 40px 0 25px 0;
        }
        
        h4 {
            color: #475569;
            font-size: 1.6em;
            font-weight: 600;
            margin: 30px 0 20px 0;
        }
        
        p {
            margin-bottom: 25px;
            font-size: 1.1em;
            line-height: 1.8;
            color: #475569;
        }
        
        ul, ol {
            margin: 30px 0;
            padding-left: 35px;
        }
        
        li {
            margin-bottom: 12px;
            font-size: 1.1em;
            line-height: 1.7;
            color: #475569;
        }
        
        .user-story {
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            border-left: 5px solid #0ea5e9;
            padding: 30px;
            margin: 30px 0;
            border-radius: 0 12px 12px 0;
            box-shadow: 0 4px 20px rgba(14, 165, 233, 0.1);
        }
        
        .user-story strong {
            color: #0369a1;
            font-weight: 700;
            display: block;
            margin-bottom: 15px;
            font-size: 1.2em;
        }
        
        .technical-requirements {
            background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
            border-left: 5px solid #22c55e;
            padding: 30px;
            margin: 30px 0;
            border-radius: 0 12px 12px 0;
            box-shadow: 0 4px 20px rgba(34, 197, 94, 0.1);
        }
        
        .technical-requirements strong {
            color: #15803d;
            font-weight: 700;
            display: block;
            margin-bottom: 15px;
            font-size: 1.2em;
        }
        
        .functionality {
            background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
            border-left: 5px solid #f59e0b;
            padding: 30px;
            margin: 30px 0;
            border-radius: 0 12px 12px 0;
            box-shadow: 0 4px 20px rgba(245, 158, 11, 0.1);
        }
        
        .functionality strong {
            color: #d97706;
            font-weight: 700;
            display: block;
            margin-bottom: 15px;
            font-size: 1.2em;
        }
        
        code {
            background: #f1f5f9;
            padding: 6px 12px;
            border-radius: 6px;
            font-family: 'JetBrains Mono', monospace;
            color: #dc2626;
            font-size: 0.9em;
            border: 1px solid #e2e8f0;
            font-weight: 500;
        }
        
        pre {
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            color: #e2e8f0;
            padding: 30px;
            border-radius: 12px;
            overflow-x: auto;
            margin: 30px 0;
            font-family: 'JetBrains Mono', monospace;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            border: 1px solid #334155;
        }
        
        pre code {
            background: none;
            color: inherit;
            padding: 0;
            border: none;
        }
        
        .contract-function {
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            padding: 25px;
            margin: 25px 0;
            font-family: 'JetBrains Mono', monospace;
            box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        }
        
        .contract-function strong {
            color: #1e293b;
            font-weight: 700;
        }
        
        .footer {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: white;
            padding: 50px 60px;
            text-align: center;
            position: relative;
        }
        
        .footer::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, #3b82f6, #8b5cf6, #10b981);
        }
        
        .footer p {
            margin: 10px 0;
            opacity: 0.8;
            font-size: 1.1em;
        }
        
        .footer strong {
            color: #60a5fa;
            font-weight: 700;
        }
        
        .toc {
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            padding: 30px;
            margin: 40px 0;
        }
        
        .toc h3 {
            color: #475569;
            margin-bottom: 20px;
            font-size: 1.4em;
        }
        
        .toc ul {
            list-style: none;
            padding-left: 0;
        }
        
        .toc li {
            margin: 10px 0;
            padding-left: 25px;
            position: relative;
        }
        
        .toc li::before {
            content: '▶';
            position: absolute;
            left: 0;
            color: #3b82f6;
            font-size: 0.9em;
            font-weight: 600;
        }
        
        @media print {
            body {
                background: white;
            }
            
            .header {
                background: #0f172a !important;
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
      
      console.log('🎨 Applying corporate styling...');
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
      
      console.log('📄 Generating corporate PDF...');
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
      
      console.log(`✅ Corporate PDF generated successfully: ${outputFile}`);
      return outputFile;
      
    } catch (error) {
      console.error('❌ Error generating corporate PDF:', error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const generator = new CorporatePDFGenerator();
  
  const markdownFile = '/home/leon/bitredict-linux/Bitredict_MVP_Specification.md';
  const outputFile = '/home/leon/bitredict-linux/Bitredict_MVP_Specification_Corporate.pdf';
  
  try {
    await generator.generatePDF(markdownFile, outputFile);
    console.log('🎉 Corporate PDF generation completed successfully!');
  } catch (error) {
    console.error('💥 Corporate PDF generation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = CorporatePDFGenerator;
