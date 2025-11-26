#!/bin/bash

# Oddyssey Contract Deployment Script
# This script deploys the Oddyssey contract and updates all configurations

set -e  # Exit on any error

echo "🚀 Starting Oddyssey contract deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "solidity/contracts/Oddyssey.sol" ]; then
    print_error "Oddyssey contract not found. Please run this script from the project root."
    exit 1
fi

# Check if Hardhat is installed
if ! command -v npx &> /dev/null; then
    print_error "npx not found. Please install Node.js and npm."
    exit 1
fi

print_status "Checking prerequisites..."

# Check if .env file exists
if [ ! -f "solidity/.env" ]; then
    print_warning "No .env file found in solidity directory. Creating template..."
    cat > solidity/.env << EOF
# Network Configuration
RPC_URL=https://dream-rpc.somnia.network/
CHAIN_ID=50312

# Deployment Configuration
PRIVATE_KEY=your_private_key_here
DEV_WALLET=your_dev_wallet_address_here

# Contract Configuration
DEV_FEE_PERCENTAGE=500
PRIZE_ROLLOVER_FEE_PERCENTAGE=200
ENTRY_FEE=0.5
EOF
    print_warning "Please update solidity/.env with your private key and dev wallet address."
    exit 1
fi

# Load environment variables
source solidity/.env

print_status "Environment loaded. Checking configuration..."

# Validate required environment variables
if [ -z "$PRIVATE_KEY" ] || [ "$PRIVATE_KEY" = "your_private_key_here" ]; then
    print_error "PRIVATE_KEY not set in solidity/.env"
    exit 1
fi

if [ -z "$DEV_WALLET" ] || [ "$DEV_WALLET" = "your_dev_wallet_address_here" ]; then
    print_error "DEV_WALLET not set in solidity/.env"
    exit 1
fi

print_success "Configuration validated"

# Compile contracts
print_status "Compiling contracts..."
cd solidity
npx hardhat compile

if [ $? -ne 0 ]; then
    print_error "Contract compilation failed"
    exit 1
fi

print_success "Contracts compiled successfully"

# Deploy contract
print_status "Deploying Oddyssey contract..."
npx hardhat run scripts/deploy-oddyssey.js --network somnia

if [ $? -ne 0 ]; then
    print_error "Contract deployment failed"
    exit 1
fi

print_success "Contract deployed successfully"

# Update configurations
print_status "Updating configurations..."
cd ..
node scripts/update-oddyssey-config.js

if [ $? -ne 0 ]; then
    print_error "Configuration update failed"
    exit 1
fi

print_success "Configurations updated"

# Display deployment summary
if [ -f "scripts/deployment-summary.json" ]; then
    print_status "Deployment Summary:"
    cat scripts/deployment-summary.json | jq '.'
fi

print_success "🎉 Oddyssey deployment completed successfully!"
print_status "Next steps:"
echo "  1. Deploy the updated backend: cd backend && fly deploy"
echo "  2. Update frontend deployment"
echo "  3. Test the new contract integration"
echo "  4. Verify cycle creation works properly"

print_status "Contract address and configuration have been updated in:"
echo "  - Backend .env file"
echo "  - Frontend config"
echo "  - deployment-info.json"
echo "  - deployment-summary.json" 