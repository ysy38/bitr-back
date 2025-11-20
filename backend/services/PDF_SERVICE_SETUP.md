# PDF Service Setup Guide

## Installation

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npx playwright install chromium
   ```

   This will download the Chromium browser needed for PDF generation.

## Quick Start

### Generate a Pitch Deck

```bash
curl -X POST http://localhost:3000/api/pdf/pitch-deck \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Bitredict",
    "subtitle": "Decentralized Prediction Markets",
    "companyName": "Bitredict",
    "date": "January 2024",
    "problemPoints": [
      "Traditional prediction markets are centralized",
      "High barriers to entry"
    ],
    "solution": "A decentralized prediction market platform...",
    "marketStats": [
      { "value": "$1B", "label": "Market Size" }
    ],
    "revenueStreams": ["Platform fees"],
    "keyMetrics": ["TVL", "Active Users"],
    "tractionStats": [
      { "value": "1,000", "label": "Users" }
    ],
    "teamMembers": [
      { "name": "John Doe", "role": "CEO", "background": "Ex-Google" }
    ],
    "fundingAmount": "$1M",
    "fundingUse": "Product development",
    "contactEmail": "contact@bitredict.com",
    "website": "www.bitredict.com"
  }' \
  --output pitch-deck.pdf
```

### Generate a One-Pager

```bash
curl -X POST http://localhost:3000/api/pdf/one-pager \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Bitredict",
    "subtitle": "Decentralized Prediction Markets",
    "companyName": "Bitredict",
    "tagline": "Predict. Bet. Win.",
    "contactEmail": "contact@bitredict.com",
    "website": "www.bitredict.com",
    "problem": "Traditional prediction markets lack transparency...",
    "solution": "A blockchain-based prediction market platform...",
    "solutionFeatures": [
      "Decentralized and transparent",
      "Low barriers to entry"
    ],
    "marketDescription": "The global prediction market is growing...",
    "marketSize": "$1B addressable market",
    "businessModel": "Revenue from platform fees",
    "revenueStreams": ["Platform fees"],
    "stats": [
      { "value": "1,000", "label": "Users" }
    ],
    "date": "January 2024"
  }' \
  --output one-pager.pdf
```

## API Endpoints

- `GET /api/pdf/templates` - List available templates
- `POST /api/pdf/generate` - Generate PDF from any template
- `POST /api/pdf/generate-from-html` - Generate PDF from custom HTML
- `POST /api/pdf/pitch-deck` - Generate pitch deck (convenience endpoint)
- `POST /api/pdf/one-pager` - Generate one-pager (convenience endpoint)
- `GET /api/pdf/preview/:template` - Get template schema/example data

## Production Deployment

For production (e.g., Fly.io), make sure to:

1. Install Playwright browsers in your Dockerfile or deployment script:
   ```dockerfile
   RUN npx playwright install chromium --with-deps
   ```

2. The service automatically handles browser initialization and cleanup.

3. For better performance, consider keeping the browser instance warm (the service uses a singleton pattern).

## Troubleshooting

- **Browser not found**: Run `npx playwright install chromium`
- **PDF generation fails**: Check that templates exist in `backend/templates/pdf/`
- **Memory issues**: The service closes pages after each generation to free memory

