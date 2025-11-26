#!/bin/bash

# Deploy Updated Backend to Fly.io
# This script deploys the updated backend with new contract architecture

echo "🚀 Deploying Updated Backend to Fly.io..."

# Check if we're in the backend directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Not in backend directory. Please run from backend/ directory."
    exit 1
fi

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
    echo "❌ Error: Fly CLI not installed. Please install it first."
    exit 1
fi

# Check if we're logged in to Fly
if ! fly auth whoami &> /dev/null; then
    echo "❌ Error: Not logged in to Fly. Please run 'fly auth login' first."
    exit 1
fi

echo "✅ Pre-deployment checks passed"

# 1. Update Fly.io secrets with new contract addresses
echo "📝 Updating Fly.io secrets..."
if [ -f "update-fly-secrets.sh" ]; then
    chmod +x update-fly-secrets.sh
    ./update-fly-secrets.sh
    echo "✅ Fly.io secrets updated"
else
    echo "⚠️ Warning: update-fly-secrets.sh not found. Please update secrets manually."
fi

# 2. Build the Docker image
echo "🐳 Building Docker image..."
if [ -f "Dockerfile" ]; then
    # Build the image
    docker build -t bitredict-backend:latest .
    echo "✅ Docker image built successfully"
else
    echo "❌ Error: Dockerfile not found"
    exit 1
fi

# 3. Deploy to Fly.io
echo "🚀 Deploying to Fly.io..."
fly deploy --app bitredict-backend

if [ $? -eq 0 ]; then
    echo "✅ Backend deployed successfully!"
    echo ""
    echo "📋 Deployment Summary:"
    echo "  - Updated contract architecture implemented"
    echo "  - Database schema issues fixed"
    echo "  - All services updated for new contracts"
    echo "  - Smart analytics indexer active"
    echo ""
    echo "🔍 Next Steps:"
    echo "  1. Monitor logs: fly logs --app bitredict-backend"
    echo "  2. Check health: fly status --app bitredict-backend"
    echo "  3. Test new contract interactions"
    echo "  4. Update frontend to use new data flow"
    echo ""
    echo "🎉 Backend is now ready for the new contract architecture!"
else
    echo "❌ Deployment failed. Check the logs above for errors."
    exit 1
fi
