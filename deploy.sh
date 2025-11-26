
#!/bin/bash

# Deployment Script for Bitredict Backend
echo "🚀 Starting Bitredict Backend Deployment..."

# 1. Stop existing services
echo "🛑 Stopping existing services..."
flyctl scale count 0 --app bitredict-backend

# 2. Wait for services to stop
echo "⏳ Waiting for services to stop..."
sleep 30

# 3. Deploy the application
echo "📦 Deploying application..."
flyctl deploy --app bitredict-backend

# 4. Scale up services
echo "📈 Scaling up services..."
flyctl scale count 1 --app bitredict-backend

# 5. Check deployment status
echo "🔍 Checking deployment status..."
flyctl status --app bitredict-backend

echo "✅ Deployment completed!"
echo ""
echo "📋 Next steps:"
echo "1. Monitor logs: flyctl logs --app bitredict-backend"
echo "2. Check results fetcher: Look for 'Results fetcher cron job initialized'"
echo "3. Test contract calls: Look for successful contract interactions"
echo "4. Monitor block indexing: Look for successful block processing"
    