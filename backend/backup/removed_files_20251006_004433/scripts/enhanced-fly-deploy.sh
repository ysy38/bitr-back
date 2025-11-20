#!/bin/bash

# Enhanced Fly.io Deployment Script for Bitredict Backend
# This script handles deployment to Fly.io with post-deployment verification

set -e  # Exit on any error

echo "🚀 Starting Enhanced Fly.io deployment for Bitredict Backend..."

# Check if we're in the right directory
if [ ! -f "fly.toml" ]; then
    echo "❌ Error: fly.toml not found. Please run this script from the backend directory."
    exit 1
fi

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
    echo "❌ Error: fly CLI not found. Please install it first."
    echo "Visit: https://fly.io/docs/hands-on/install-flyctl/"
    exit 1
fi

# Check if logged in to Fly.io
if ! fly auth whoami &> /dev/null; then
    echo "❌ Error: Not logged in to Fly.io. Please run 'fly auth login' first."
    exit 1
fi

echo "✅ Fly.io authentication verified"

# Load environment variables from .env file
if [ -f ".env" ]; then
    echo "📄 Loading environment variables from .env file..."
    export $(cat .env | grep -v '^#' | xargs)
    echo "✅ Environment variables loaded from .env"
else
    echo "⚠️ Warning: .env file not found. Using system environment variables."
fi

# Check required environment variables
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL environment variable is required"
    echo "Please ensure DATABASE_URL is set in .env file or system environment"
    exit 1
fi

echo "✅ Environment variables verified"

# Deploy to Fly.io
echo "🚀 Deploying to Fly.io..."
fly deploy

if [ $? -eq 0 ]; then
    echo "✅ Deployment completed successfully!"
    
    # Wait for machines to start and stabilize
    echo "⏳ Waiting for machines to start and stabilize..."
    sleep 30
    
    # Show status
    echo "📊 Checking deployment status..."
    fly status
    
    # Check machine regions and restart if needed
    echo "🔍 Checking machine regions..."
    MACHINES=$(fly machines list --json | jq -r '.[] | "\(.id) \(.region)"')
    
    echo "📋 Current machine distribution:"
    echo "$MACHINES"
    
    # Check if machines are in wrong region
    WRONG_REGION_MACHINES=$(echo "$MACHINES" | grep -v "fra" || true)
    if [ -n "$WRONG_REGION_MACHINES" ]; then
        echo "⚠️ Found machines in wrong region. Running region fix script..."
        ./scripts/fix-machine-regions.sh
    else
        echo "✅ All machines are in correct region (fra)"
    fi
    
    # Post-deployment verification
    echo "🔍 Running post-deployment verification..."
    
    # Wait a bit more for the application to fully start
    echo "⏳ Waiting for application to fully start..."
    sleep 20
    
    # Test API connectivity
    echo "🌐 Testing API connectivity..."
    API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" https://bitredict-backend.fly.dev/api/health || echo "000")
    
    if [ "$API_RESPONSE" = "200" ]; then
        echo "✅ API is responding (HTTP 200)"
    else
        echo "⚠️ API returned HTTP $API_RESPONSE (this might be normal if health endpoint doesn't exist)"
    fi
    
    # Test Oddyssey API endpoint
    echo "🎯 Testing Oddyssey API endpoint..."
    ODDYSSEY_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" https://bitredict-backend.fly.dev/api/oddyssey/matches || echo "000")
    
    if [ "$ODDYSSEY_RESPONSE" = "200" ]; then
        echo "✅ Oddyssey API is responding (HTTP 200)"
    else
        echo "⚠️ Oddyssey API returned HTTP $ODDYSSEY_RESPONSE"
    fi
    
    # Check application logs for any errors
    echo "📋 Checking recent application logs..."
    fly logs --app bitredict-backend --limit 20 | grep -E "(ERROR|error|Error)" || echo "✅ No recent errors found in logs"
    
    echo "🎉 Enhanced Bitredict Backend deployment completed!"
    echo ""
    echo "📋 Service Distribution:"
    echo "  • Main API Server: 2CPU, 2GB RAM (always running in fra)"
    echo "  • Workers VM: 2CPU, 1GB RAM (always running in fra)"
    echo "  • Indexer VM: 1CPU, 768MB RAM (always running in fra)"
    echo ""
    echo "🔗 Your API is available at: https://bitredict-backend.fly.dev"
    echo "📊 Monitor at: https://fly.io/apps/bitredict-backend"
    echo ""
    echo "🔍 Manual verification commands:"
    echo "  • Check logs: fly logs --app bitredict-backend"
    echo "  • Check status: fly status"
    echo "  • Test API: curl https://bitredict-backend.fly.dev/api/oddyssey/matches"
    echo ""
    echo "✅ Deployment verification completed!"
    
else
    echo "❌ Deployment failed!"
    exit 1
fi 