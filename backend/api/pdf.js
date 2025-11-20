/**
 * PDF Generation API
 * 
 * Provides endpoints for generating professional PDFs:
 * - Pitch decks
 * - One-pagers
 * - Infographics
 * - Custom templates
 */

const express = require('express');
const router = express.Router();
const getPDFService = require('../services/pdf-service');

/**
 * GET /api/pdf/templates
 * Get list of available PDF templates
 */
router.get('/templates', async (req, res) => {
  try {
    const pdfService = getPDFService();
    const templates = await pdfService.getAvailableTemplates();
    
    res.json({
      success: true,
      templates,
      count: templates.length
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
      message: error.message
    });
  }
});

/**
 * POST /api/pdf/generate
 * Generate PDF from template
 * 
 * Body:
 * {
 *   template: "pitch-deck" | "one-pager" | etc.,
 *   data: { ... }, // Template data
 *   options: { ... } // PDF options (format, margin, etc.)
 * }
 */
router.post('/generate', async (req, res) => {
  try {
    const { template, data = {}, options = {} } = req.body;

    if (!template) {
      return res.status(400).json({
        success: false,
        error: 'Template name is required'
      });
    }

    const pdfService = getPDFService();
    await pdfService.initialize();

    const pdfBuffer = await pdfService.generatePDF(template, data, options);

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${template}-${Date.now()}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate PDF',
      message: error.message
    });
  }
});

/**
 * POST /api/pdf/generate-from-html
 * Generate PDF from custom HTML
 * 
 * Body:
 * {
 *   html: "<html>...</html>",
 *   options: { ... } // PDF options
 * }
 */
router.post('/generate-from-html', async (req, res) => {
  try {
    const { html, options = {} } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required'
      });
    }

    const pdfService = getPDFService();
    await pdfService.initialize();

    const pdfBuffer = await pdfService.generatePDFFromHTML(html, options);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="custom-${Date.now()}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF from HTML:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate PDF from HTML',
      message: error.message
    });
  }
});

/**
 * POST /api/pdf/pitch-deck
 * Generate pitch deck PDF (convenience endpoint)
 * 
 * Body:
 * {
 *   title: "Company Name",
 *   subtitle: "Tagline",
 *   companyName: "Company",
 *   date: "2024",
 *   problemPoints: ["Problem 1", "Problem 2"],
 *   solution: "Our solution...",
 *   marketStats: [{ value: "1B", label: "Market Size" }],
 *   revenueStreams: ["Stream 1", "Stream 2"],
 *   keyMetrics: ["Metric 1", "Metric 2"],
 *   tractionStats: [{ value: "1000", label: "Users" }],
 *   teamMembers: [{ name: "John", role: "CEO", background: "Ex-Google" }],
 *   fundingAmount: "$1M",
 *   fundingUse: "Product development",
 *   contactEmail: "contact@example.com",
 *   website: "www.example.com"
 * }
 */
router.post('/pitch-deck', async (req, res) => {
  try {
    const data = req.body;
    
    // Set default date if not provided
    if (!data.date) {
      data.date = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long' 
      });
    }

    const pdfService = getPDFService();
    await pdfService.initialize();

    const pdfBuffer = await pdfService.generatePDF('pitch-deck', data, {
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true // Respect CSS @page rules in template
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="pitch-deck-${Date.now()}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating pitch deck:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate pitch deck',
      message: error.message
    });
  }
});

/**
 * POST /api/pdf/one-pager
 * Generate one-pager PDF (convenience endpoint)
 * 
 * Body:
 * {
 *   title: "Company Name",
 *   subtitle: "Tagline",
 *   companyName: "Company",
 *   tagline: "Tagline",
 *   contactEmail: "contact@example.com",
 *   website: "www.example.com",
 *   problem: "Problem description",
 *   solution: "Solution description",
 *   solutionFeatures: ["Feature 1", "Feature 2"],
 *   marketDescription: "Market description",
 *   marketSize: "$1B market",
 *   businessModel: "Business model description",
 *   revenueStreams: ["Stream 1", "Stream 2"],
 *   traction: "Traction description",
 *   tractionPoints: ["Point 1", "Point 2"],
 *   team: "Team description",
 *   teamMembers: [{ name: "John", role: "CEO" }],
 *   competitiveAdvantage: [{ title: "Advantage 1", description: "..." }],
 *   fundingAmount: "$1M",
 *   fundingUse: "Product development",
 *   stats: [{ value: "1000", label: "Users" }],
 *   footerText: "Footer text",
 *   date: "2024"
 * }
 */
router.post('/one-pager', async (req, res) => {
  try {
    const data = req.body;
    
    // Set default date if not provided
    if (!data.date) {
      data.date = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long' 
      });
    }

    const pdfService = getPDFService();
    await pdfService.initialize();

    const pdfBuffer = await pdfService.generatePDF('one-pager', data, {
      format: 'A4',
      printBackground: true
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="one-pager-${Date.now()}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating one-pager:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate one-pager',
      message: error.message
    });
  }
});

/**
 * GET /api/pdf/preview/:template
 * Preview template structure (returns template data schema)
 */
router.get('/preview/:template', async (req, res) => {
  try {
    const { template } = req.params;
    const pdfService = getPDFService();
    const templates = await pdfService.getAvailableTemplates();

    if (!templates.includes(template)) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
        availableTemplates: templates
      });
    }

    // Return template schema/example data
    const schemas = {
      'pitch-deck': {
        description: 'Pitch deck template for presentations',
        requiredFields: ['title', 'subtitle', 'companyName'],
        exampleData: {
          title: 'Your Company Name',
          subtitle: 'Revolutionizing the Industry',
          companyName: 'YourCompany',
          date: 'January 2024',
          problemPoints: ['Problem 1', 'Problem 2', 'Problem 3'],
          solution: 'Our innovative solution addresses these problems...',
          marketStats: [
            { value: '$1B', label: 'Market Size' },
            { value: '10M', label: 'Target Users' }
          ],
          revenueStreams: ['Subscription', 'Commission'],
          keyMetrics: ['MRR', 'CAC', 'LTV'],
          tractionStats: [
            { value: '1,000', label: 'Users' },
            { value: '$50K', label: 'MRR' }
          ],
          teamMembers: [
            { name: 'John Doe', role: 'CEO', background: 'Ex-Google' }
          ],
          fundingAmount: '$1M',
          fundingUse: 'Product development and team expansion',
          contactEmail: 'contact@example.com',
          website: 'www.example.com'
        }
      },
      'one-pager': {
        description: 'One-page company overview',
        requiredFields: ['title', 'companyName', 'problem', 'solution'],
        exampleData: {
          title: 'Your Company Name',
          subtitle: 'Revolutionizing the Industry',
          companyName: 'YourCompany',
          tagline: 'Your tagline here',
          contactEmail: 'contact@example.com',
          website: 'www.example.com',
          problem: 'The problem we are solving...',
          solution: 'Our solution...',
          solutionFeatures: ['Feature 1', 'Feature 2', 'Feature 3'],
          marketDescription: 'Market opportunity description...',
          marketSize: '$1B addressable market',
          businessModel: 'How we make money...',
          revenueStreams: ['Stream 1', 'Stream 2'],
          stats: [
            { value: '1,000', label: 'Users' },
            { value: '$50K', label: 'MRR' }
          ],
          date: 'January 2024'
        }
      }
    };

    res.json({
      success: true,
      template,
      schema: schemas[template] || { description: 'Template schema not available' }
    });
  } catch (error) {
    console.error('Error fetching template preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch template preview',
      message: error.message
    });
  }
});

module.exports = router;

