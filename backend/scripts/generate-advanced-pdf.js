const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

class AdvancedPDFGenerator {
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
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.7;
            color: #1a202c;
            background: #f7fafc;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            box-shadow: 0 25px 50px rgba(0,0,0,0.15);
            border-radius: 12px;
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            color: white;
            padding: 60px 40px;
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
            background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
            animation: float 6s ease-in-out infinite;
        }
        
        @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(180deg); }
        }
        
        .logo {
            width: 100px;
            height: 100px;
            background: white;
            border-radius: 20px;
            margin: 0 auto 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
            font-weight: 700;
            color: #667eea;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            position: relative;
            z-index: 1;
        }
        
        .header h1 {
            font-size: 3em;
            margin-bottom: 15px;
            font-weight: 700;
            position: relative;
            z-index: 1;
        }
        
        .header .subtitle {
            font-size: 1.3em;
            opacity: 0.95;
            font-weight: 400;
            position: relative;
            z-index: 1;
        }
        
        .content {
            padding: 50px;
        }
        
        h1 {
            color: #667eea;
            font-size: 2.5em;
            margin: 40px 0 25px 0;
            font-weight: 700;
            position: relative;
        }
        
        h1::after {
            content: '';
            position: absolute;
            bottom: -10px;
            left: 0;
            width: 60px;
            height: 4px;
            background: linear-gradient(90deg, #667eea, #764ba2);
            border-radius: 2px;
        }
        
        h2 {
            color: #764ba2;
            font-size: 2em;
            margin: 35px 0 20px 0;
            font-weight: 600;
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
            background: linear-gradient(180deg, #667eea, #764ba2);
            border-radius: 3px;
        }
        
        h3 {
            color: #5a67d8;
            font-size: 1.6em;
            margin: 25px 0 15px 0;
            font-weight: 600;
        }
        
        h4 {
            color: #4c51bf;
            font-size: 1.3em;
            margin: 20px 0 10px 0;
            font-weight: 500;
        }
        
        p {
            margin-bottom: 18px;
            text-align: justify;
            font-size: 1.05em;
        }
        
        ul, ol {
            margin: 20px 0;
            padding-left: 35px;
        }
        
        li {
            margin-bottom: 10px;
            font-size: 1.05em;
        }
        
        .user-story {
            background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
            border-left: 5px solid #4299e1;
            padding: 25px;
            margin: 20px 0;
            border-radius: 0 12px 12px 0;
            box-shadow: 0 4px 15px rgba(66, 153, 225, 0.1);
        }
        
        .user-story strong {
            color: #2b6cb0;
            display: block;
            margin-bottom: 12px;
            font-size: 1.1em;
            font-weight: 600;
        }
        
        .technical-requirements {
            background: linear-gradient(135deg, #f0fff4 0%, #e6fffa 100%);
            border-left: 5px solid #38a169;
            padding: 25px;
            margin: 20px 0;
            border-radius: 0 12px 12px 0;
            box-shadow: 0 4px 15px rgba(56, 161, 105, 0.1);
        }
        
        .technical-requirements strong {
            color: #2f855a;
            display: block;
            margin-bottom: 12px;
            font-size: 1.1em;
            font-weight: 600;
        }
        
        .functionality {
            background: linear-gradient(135deg, #fffaf0 0%, #fef5e7 100%);
            border-left: 5px solid #ed8936;
            padding: 25px;
            margin: 20px 0;
            border-radius: 0 12px 12px 0;
            box-shadow: 0 4px 15px rgba(237, 137, 54, 0.1);
        }
        
        .functionality strong {
            color: #c05621;
            display: block;
            margin-bottom: 12px;
            font-size: 1.1em;
            font-weight: 600;
        }
        
        code {
            background: #f1f5f9;
            padding: 4px 8px;
            border-radius: 6px;
            font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
            color: #e53e3e;
            font-size: 0.95em;
            border: 1px solid #e2e8f0;
        }
        
        pre {
            background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
            color: #e2e8f0;
            padding: 25px;
            border-radius: 12px;
            overflow-x: auto;
            margin: 20px 0;
            box-shadow: 0 8px 25px rgba(0,0,0,0.3);
            border: 1px solid #4a5568;
        }
        
        pre code {
            background: none;
            color: inherit;
            padding: 0;
            border: none;
        }
        
        .contract-function {
            background: linear-gradient(135deg, #edf2f7 0%, #e2e8f0 100%);
            border: 2px solid #cbd5e0;
            border-radius: 10px;
            padding: 20px;
            margin: 15px 0;
            font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
            box-shadow: 0 4px 15px rgba(0,0,0,0.05);
        }
        
        .contract-function strong {
            color: #2d3748;
            font-weight: 600;
        }
        
        .highlight {
            background: linear-gradient(135deg, #a8edea 0%, #fed6e3 50%, #d299c2 100%);
            padding: 30px;
            border-radius: 15px;
            margin: 25px 0;
            border: 2px solid #e2e8f0;
            box-shadow: 0 8px 25px rgba(168, 237, 234, 0.2);
        }
        
        .footer {
            background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        
        .footer p {
            margin: 8px 0;
            opacity: 0.9;
            font-size: 1.05em;
        }
        
        .footer strong {
            color: #a8edea;
            font-weight: 600;
        }
        
        .toc {
            background: #f8fafc;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
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
            color: #667eea;
            font-size: 0.8em;
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
            
            .header::before {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">B</div>
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
      
      console.log('🔄 Converting Markdown to HTML...');
      const { marked } = await import('marked');
      const htmlContent = marked(markdownContent);
      
      console.log('🎨 Applying advanced styling...');
      const styledHTML = this.template
        .replace('{{CONTENT}}', htmlContent)
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
      
      console.log('📄 Generating advanced PDF...');
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
      
      console.log(`✅ Advanced PDF generated successfully: ${outputFile}`);
      return outputFile;
      
    } catch (error) {
      console.error('❌ Error generating advanced PDF:', error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const generator = new AdvancedPDFGenerator();
  
  const markdownFile = '/home/leon/bitredict-linux/Bitredict_MVP_Specification.md';
  const outputFile = '/home/leon/bitredict-linux/Bitredict_MVP_Specification_Advanced.pdf';
  
  try {
    await generator.generatePDF(markdownFile, outputFile);
    console.log('🎉 Advanced PDF generation completed successfully!');
  } catch (error) {
    console.error('💥 Advanced PDF generation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = AdvancedPDFGenerator;
