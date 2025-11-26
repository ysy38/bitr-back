#!/bin/bash

# Bitredict Backend Deployment Script
# This script sets up the complete database and starts all services

set -e  # Exit on any error

echo "🚀 Starting Bitredict Backend Deployment..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the backend directory."
    exit 1
fi

# Load environment variables
if [ -f "../.env" ]; then
    echo "📄 Loading environment variables from ../.env"
    export $(cat ../.env | grep -v '^#' | xargs)
else
    echo "⚠️ Warning: .env file not found. Using system environment variables."
fi

# Check required environment variables
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL environment variable is required"
    exit 1
fi

echo "✅ Environment variables loaded"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Initialize database
echo "🗄️ Initializing database..."
node scripts/init-database.js

if [ $? -eq 0 ]; then
    echo "✅ Database initialization completed"
else
    echo "❌ Database initialization failed"
    exit 1
fi

# Populate initial data (using real SportMonks API)
echo "📊 Populating initial data from SportMonks API..."
echo "⚠️  Note: This requires SPORTMONKS_API_TOKEN to be set"
echo "   Run manually with: curl -X POST https://bitredict-backend.fly.dev/api/admin/populate-fixtures"

# Start the application
echo "🚀 Starting Bitredict Backend..."
npm start 