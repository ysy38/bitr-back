#!/bin/bash

# Bitredict Backend Deployment Script
# Ensures deployment to the correct Fly.io app: bitredict-backend

set -e  # Exit on any error

echo "🚀 Deploying Bitredict Backend..."
echo "📱 Target App: bitredict-backend"
echo "📁 Config: backend/fly.toml"
echo ""

# Change to the project root directory
cd "$(dirname "$0")/.."

# Verify we're in the right directory
if [ ! -f "backend/fly.toml" ]; then
    echo "❌ Error: backend/fly.toml not found!"
    echo "   Make sure you're running this from the project root directory"
    exit 1
fi

# Verify the fly.toml has the correct app name
if ! grep -q "app = \"bitredict-backend\"" backend/fly.toml; then
    echo "❌ Error: fly.toml does not specify 'bitredict-backend' as the app name!"
    echo "   Please check backend/fly.toml configuration"
    exit 1
fi

echo "✅ Configuration verified"
echo "🔧 Starting deployment..."
echo ""

# Deploy with explicit app name and config path
fly deploy --app bitredict-backend --config backend/fly.toml

echo ""
echo "✅ Deployment completed!"
echo "📊 Check status: fly status --app bitredict-backend"
echo "📋 View logs: fly logs --app bitredict-backend"
echo "🌐 Open app: fly open --app bitredict-backend"
