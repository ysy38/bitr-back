#!/bin/bash

echo "🚀 Bitredict Project Setup Script"
echo "=================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "✅ .env file created. Please edit it with your configuration values."
else
    echo "✅ .env file already exists."
fi

# Check Node.js and npm
echo "📦 Checking Node.js and npm..."
if command -v node &> /dev/null && command -v npm &> /dev/null; then
    echo "✅ Node.js $(node --version) and npm $(npm --version) are installed."
else
    echo "❌ Node.js or npm not found. Please install them first."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install
cd backend && npm install && cd ..
cd solidity && npm install && cd ..

# Check Docker
echo "🐳 Checking Docker..."
if command -v docker &> /dev/null; then
    echo "✅ Docker is installed."
    if docker ps &> /dev/null; then
        echo "✅ Docker daemon is running."
    else
        echo "⚠️  Docker daemon is not running. Please start Docker Desktop or run: sudo dockerd"
    fi
else
    echo "❌ Docker not found. Please install Docker first."
fi

# Check PostgreSQL
echo "🗄️  Checking PostgreSQL..."
if command -v psql &> /dev/null; then
    echo "✅ PostgreSQL is installed."
else
    echo "⚠️  PostgreSQL not found. You can:"
    echo "   1. Install PostgreSQL locally: sudo apt install postgresql postgresql-contrib"
    echo "   2. Use Docker: docker run --name postgres -e POSTGRES_PASSWORD=password -d -p 5432:5432 postgres"
    echo "   3. Use a cloud database service"
fi

# Check Redis
echo "🔴 Checking Redis..."
if command -v redis-server &> /dev/null; then
    echo "✅ Redis is installed."
else
    echo "⚠️  Redis not found. You can:"
    echo "   1. Install Redis locally: sudo apt install redis-server"
    echo "   2. Use Docker: docker run --name redis -d -p 6379:6379 redis"
fi

# Create logs directory
echo "📁 Creating logs directory..."
mkdir -p logs

# Check if contracts are compiled
echo "🔧 Checking smart contracts..."
if [ -d "solidity/artifacts" ]; then
    echo "✅ Smart contracts are compiled."
else
    echo "⚠️  Smart contracts not compiled. Run: cd solidity && npx hardhat compile"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env file with your configuration values"
echo "2. Set up your database (PostgreSQL)"
echo "3. Set up Redis (optional but recommended)"
echo "4. Deploy smart contracts: cd solidity && npx hardhat deploy:somnia"
echo "5. Update contract addresses in .env file"
echo "6. Start the backend: npm run backend:dev"
echo ""
echo "📚 For more information, check the README.md files in each directory."
