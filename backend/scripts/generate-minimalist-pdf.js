const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

class MinimalistPDFGenerator {
  constructor() {
    this.template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bitredict MVP Specification</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #1f2937;
            background: #ffffff;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
        }
        
        .header {
            background: #000000;
            color: white;
            padding: 80px 60px;
            text-align: center;
        }
        
        .logo {
            width: 60px;
            height: 60px;
            background: white;
            border-radius: 16px;
            margin: 0 auto 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        }
        
        .logo img {
            width: 40px;
            height: 40px;
            object-fit: contain;
        }
        
        .header h1 {
            font-size: 3.5em;
            font-weight: 700;
            margin-bottom: 20px;
            letter-spacing: -2px;
        }
        
        .header .subtitle {
            font-size: 1.2em;
            font-weight: 400;
            opacity: 0.8;
            letter-spacing: 0.5px;
        }
        
        .content {
            padding: 60px;
        }
        
        h1 {
            color: #111827;
            font-size: 2.8em;
            font-weight: 700;
            margin: 50px 0 30px 0;
            text-align: center;
            letter-spacing: -1px;
        }
        
        h2 {
            color: #374151;
            font-size: 2.2em;
            font-weight: 600;
            margin: 40px 0 25px 0;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 10px;
        }
        
        h3 {
            color: #4b5563;
            font-size: 1.8em;
            font-weight: 600;
            margin: 30px 0 20px 0;
        }
        
        h4 {
            color: #6b7280;
            font-size: 1.4em;
            font-weight: 600;
            margin: 25px 0 15px 0;
        }
        
        p {
            margin-bottom: 20px;
            font-size: 1.1em;
            line-height: 1.7;
            color: #4b5563;
        }
        
        ul, ol {
            margin: 25px 0;
            padding-left: 30px;
        }
        
        li {
            margin-bottom: 10px;
            font-size: 1.1em;
            line-height: 1.6;
            color: #4b5563;
        }
        
        .user-story {
            background: #f9fafb;
            border-left: 4px solid #3b82f6;
            padding: 25px;
            margin: 25px 0;
            border-radius: 0 8px 8px 0;
        }
        
        .user-story strong {
            color: #1d4ed8;
            font-weight: 600;
            display: block;
            margin-bottom: 10px;
            font-size: 1.1em;
        }
        
        .technical-requirements {
            background: #f0fdf4;
            border-left: 4px solid #10b981;
            padding: 25px;
            margin: 25px 0;
            border-radius: 0 8px 8px 0;
        }
        
        .technical-requirements strong {
            color: #059669;
            font-weight: 600;
            display: block;
            margin-bottom: 10px;
            font-size: 1.1em;
        }
        
        .functionality {
            background: #fffbeb;
            border-left: 4px solid #f59e0b;
            padding: 25px;
            margin: 25px 0;
            border-radius: 0 8px 8px 0;
        }
        
        .functionality strong {
            color: #d97706;
            font-weight: 600;
            display: block;
            margin-bottom: 10px;
            font-size: 1.1em;
        }
        
        code {
            background: #f3f4f6;
            padding: 4px 8px;
            border-radius: 4px;
            font-family: 'JetBrains Mono', monospace;
            color: #dc2626;
            font-size: 0.9em;
            border: 1px solid #e5e7eb;
        }
        
        pre {
            background: #1f2937;
            color: #f9fafb;
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
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            font-family: 'JetBrains Mono', monospace;
        }
        
        .contract-function strong {
            color: #374151;
            font-weight: 600;
        }
        
        .footer {
            background: #000000;
            color: white;
            padding: 40px 60px;
            text-align: center;
        }
        
        .footer p {
            margin: 8px 0;
            opacity: 0.7;
            font-size: 1em;
        }
        
        .footer strong {
            color: #ffffff;
            font-weight: 600;
        }
        
        .toc {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 25px;
            margin: 30px 0;
        }
        
        .toc h3 {
            color: #6b7280;
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
            color: #3b82f6;
            font-size: 0.8em;
        }
        
        @media print {
            body {
                background: white;
            }
            
            .header {
                background: #000000 !important;
                -webkit-print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">
                <img src="data:image/png;base64,{{LOGO_BASE64}}" alt="Bitredict Logo" />
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
      
      console.log('🎨 Applying minimalist styling...');
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
      
      console.log('📄 Generating minimalist PDF...');
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
      
      console.log(`✅ Minimalist PDF generated successfully: ${outputFile}`);
      return outputFile;
      
    } catch (error) {
      console.error('❌ Error generating minimalist PDF:', error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const generator = new MinimalistPDFGenerator();
  
  const markdownFile = '/home/leon/bitredict-linux/Bitredict_MVP_Specification.md';
  const outputFile = '/home/leon/bitredict-linux/Bitredict_MVP_Specification_Minimalist.pdf';
  
  try {
    await generator.generatePDF(markdownFile, outputFile);
    console.log('🎉 Minimalist PDF generation completed successfully!');
  } catch (error) {
    console.error('💥 Minimalist PDF generation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = MinimalistPDFGenerator;
