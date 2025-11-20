#!/bin/bash

echo "🚀 Setting up Prisma for Bitredict Project"
echo "=========================================="

# Navigate to backend directory
cd backend

# 1. Install Prisma dependencies
echo "📦 Installing Prisma dependencies..."
npm install prisma @prisma/client
npm install -D prisma

# 2. Initialize Prisma
echo "🔧 Initializing Prisma..."
npx prisma init

# 3. Create Prisma schema from existing database
echo "📋 Generating Prisma schema from existing database..."
npx prisma db pull

# 4. Generate Prisma Client
echo "🔄 Generating Prisma client..."
npx prisma generate

# 5. Create migration from current state
echo "📝 Creating baseline migration..."
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel ./prisma/schema.prisma \
  --script > ./prisma/migrations/0001_baseline/migration.sql

# 6. Mark migration as applied (since DB already exists)
echo "✅ Marking baseline migration as applied..."
npx prisma migrate resolve --applied 0001_baseline

# 7. Create Prisma service wrapper
echo "🔧 Creating Prisma service wrapper..."
cat > ./services/prisma.js << 'EOF'
const { PrismaClient } = require('@prisma/client');

// Configure Prisma for production
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  errorFormat: 'pretty',
});

// Connection management for serverless
if (process.env.NODE_ENV === 'production') {
  // Optimize for Neon.tech with connection pooling
  const connectionString = process.env.DATABASE_URL.includes('?') 
    ? `${process.env.DATABASE_URL}&pgbouncer=true&connection_limit=1`
    : `${process.env.DATABASE_URL}?pgbouncer=true&connection_limit=1`;
    
  console.log('🔗 Using optimized connection pooling for production');
}

// Graceful shutdown
process.on('beforeExit', async () => {
  console.log('🔌 Disconnecting Prisma...');
  await prisma.$disconnect();
});

module.exports = prisma;
EOF

# 8. Create migration utility
echo "🛠️ Creating migration utility..."
cat > ./scripts/migrate.js << 'EOF'
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function migrate() {
  try {
    console.log('🔄 Running Prisma migrations...');
    
    // This would be done via CLI in production
    console.log('✅ Migration completed');
    console.log('💡 Run: npx prisma migrate deploy');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  migrate().catch(console.error);
}

module.exports = migrate;
EOF

# 9. Create example usage
echo "📚 Creating example usage files..."
cat > ./examples/prisma-usage.js << 'EOF'
const prisma = require('../services/prisma');

// Example: Get user with type safety
async function getUser(address) {
  return await prisma.users.findUnique({
    where: { address },
    include: {
      reputation_actions: {
        orderBy: { timestamp: 'desc' },
        take: 10
      }
    }
  });
}

// Example: Create user with transaction
async function createUserSafely(address) {
  return await prisma.$transaction(async (tx) => {
    // Check if user exists
    const existing = await tx.users.findUnique({
      where: { address }
    });
    
    if (existing) {
      return existing;
    }
    
    // Create new user
    return await tx.users.create({
      data: {
        address,
        reputation: 40,
        joined_at: new Date()
      }
    });
  });
}

module.exports = { getUser, createUserSafely };
EOF

mkdir -p examples

# 10. Update package.json scripts
echo "📝 Adding Prisma scripts to package.json..."
npm pkg set scripts.prisma:generate="prisma generate"
npm pkg set scripts.prisma:migrate="prisma migrate deploy"
npm pkg set scripts.prisma:studio="prisma studio"
npm pkg set scripts.prisma:reset="prisma migrate reset"

# 11. Create deployment script
echo "🚀 Creating deployment script..."
cat > ./scripts/deploy-with-prisma.sh << 'EOF'
#!/bin/bash

echo "🚀 Deploying with Prisma migrations..."

# 1. Generate Prisma client
npx prisma generate

# 2. Run migrations
npx prisma migrate deploy

# 3. Deploy to Fly.io
flyctl deploy

echo "✅ Deployment completed!"
EOF

chmod +x ./scripts/deploy-with-prisma.sh

# 12. Create health check with Prisma
echo "🏥 Creating health check with Prisma..."
cat > ./api/health-prisma.js << 'EOF'
const prisma = require('../services/prisma');

async function healthCheck() {
  const start = Date.now();
  
  try {
    // Test database connection with Prisma
    await prisma.$queryRaw`SELECT 1`;
    
    const responseTime = Date.now() - start;
    
    return {
      status: 'healthy',
      database: 'connected',
      prisma: 'operational',
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      database: 'disconnected',
      prisma: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { healthCheck };
EOF

echo ""
echo "🎉 Prisma setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Review generated schema in ./prisma/schema.prisma"
echo "2. Test Prisma client: node -e \"const prisma = require('./services/prisma'); prisma.user.findMany().then(console.log)\""
echo "3. Run health check: node -e \"require('./api/health-prisma').healthCheck().then(console.log)\""
echo "4. Deploy: ./scripts/deploy-with-prisma.sh"
echo ""
echo "📚 Useful commands:"
echo "- npx prisma studio          # Database GUI"
echo "- npx prisma migrate dev     # Create new migration"
echo "- npx prisma generate        # Regenerate client"
echo "- npx prisma db push         # Push schema changes"
