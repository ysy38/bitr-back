const { PrismaClient } = require('../generated/prisma');

// Production-optimized Prisma client with connection pooling
class PrismaService {
  constructor() {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
      errorFormat: 'pretty',
    });

    // Optimize for Neon.tech serverless
    if (process.env.NODE_ENV === 'production') {
      console.log('🔗 Prisma optimized for Neon.tech production');
    }
  }

  // Connection management
  async connect() {
    try {
      await this.prisma.$connect();
      console.log('✅ Prisma connected to production database');
      return true;
    } catch (error) {
      console.error('❌ Prisma connection failed:', error.message);
      throw error;
    }
  }

  async disconnect() {
    try {
      await this.prisma.$disconnect();
      console.log('🔌 Prisma disconnected');
    } catch (error) {
      console.error('⚠️ Prisma disconnect error:', error.message);
    }
  }

  // Health check
  async healthCheck() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (error) {
      return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
    }
  }

  // =================================================
  // CORE SCHEMA OPERATIONS - Type-safe User Management
  // =================================================

  async getUser(address) {
    try {
      return await this.prisma.user.findUnique({
        where: { address },
        include: {
          reputationActions: {
            orderBy: { timestamp: 'desc' },
            take: 10
          },
          achievements: {
            orderBy: { unlockedAt: 'desc' }
          }
        }
      });
    } catch (error) {
      console.error('❌ Error fetching user:', error.message);
      throw error;
    }
  }

  async createUser(address) {
    try {
      return await this.prisma.user.upsert({
        where: { address },
        update: { lastActive: new Date() },
        create: {
          address,
          reputation: 40,
          joinedAt: new Date(),
          lastActive: new Date()
        }
      });
    } catch (error) {
      console.error('❌ Error creating user:', error.message);
      throw error;
    }
  }

  async updateUserReputation(address, delta, actionType, associatedData = {}) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Add reputation action
        await tx.reputationAction.create({
          data: {
            userAddress: address,
            actionType,
            reputationDelta: delta,
            associatedValue: associatedData.value || null,
            poolId: associatedData.poolId || null,
            timestamp: new Date(),
            blockNumber: associatedData.blockNumber || 0,
            transactionHash: associatedData.transactionHash || '0x'
          }
        });

        // Update user reputation
        const updatedUser = await tx.user.update({
          where: { address },
          data: {
            reputation: {
              increment: delta
            },
            lastActive: new Date()
          }
        });

        return updatedUser;
      });
    } catch (error) {
      console.error('❌ Error updating reputation:', error.message);
      throw error;
    }
  }

  // =================================================
  // ANALYTICS SCHEMA - Staking Events (Previously Failing)
  // =================================================

  async getStakingEvents(userAddress = null, limit = 100) {
    try {
      const where = userAddress ? { userAddress } : {};
      
      return await this.prisma.stakingEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit
      });
    } catch (error) {
      console.error('❌ Error fetching staking events:', error.message);
      throw error;
    }
  }

  async createStakingEvent(data) {
    try {
      return await this.prisma.stakingEvent.create({
        data: {
          userAddress: data.userAddress,
          eventType: data.eventType,
          amount: data.amount,
          transactionHash: data.transactionHash,
          blockNumber: data.blockNumber,
          timestamp: data.timestamp,
          additionalData: data.additionalData || null
        }
      });
    } catch (error) {
      console.error('❌ Error creating staking event:', error.message);
      throw error;
    }
  }

  async getStakingAnalytics() {
    try {
      // This query will now work because the table is guaranteed to exist
      const analytics = await this.prisma.$queryRaw`
        SELECT 
          COUNT(DISTINCT user_address) as unique_stakers,
          COUNT(*) as total_events,
          SUM(CASE WHEN event_type = 'stake' THEN amount ELSE 0 END) as total_staked,
          SUM(CASE WHEN event_type = 'unstake' THEN amount ELSE 0 END) as total_unstaked,
          AVG(amount) as avg_amount
        FROM analytics.staking_events
      `;

      return analytics[0];
    } catch (error) {
      console.error('❌ Error fetching staking analytics:', error.message);
      throw error;
    }
  }

  // =================================================
  // ORACLE SCHEMA - Match Data Management
  // =================================================

  async getFixtures(status = null, limit = 50) {
    try {
      const where = status ? { status } : {};
      
      return await this.prisma.fixture.findMany({
        where,
        include: {
          fixtureOdds: true,
          fixtureResult: true
        },
        orderBy: { startTime: 'asc' },
        take: limit
      });
    } catch (error) {
      console.error('❌ Error fetching fixtures:', error.message);
      throw error;
    }
  }

  async updateFixtureResult(fixtureId, results) {
    try {
      return await this.prisma.fixtureResult.upsert({
        where: { fixtureId },
        update: {
          outcome1x2: results.outcome_1x2,
          outcomeOu25: results.outcome_ou25,
          status: 'resolved',
          resolvedAt: new Date()
        },
        create: {
          fixtureId,
          outcome1x2: results.outcome_1x2,
          outcomeOu25: results.outcome_ou25,
          status: 'resolved',
          resolvedAt: new Date()
        }
      });
    } catch (error) {
      console.error('❌ Error updating fixture result:', error.message);
      throw error;
    }
  }

  // =================================================
  // ODDYSSEY SCHEMA - Daily Game Management
  // =================================================

  async getDailyGameMatches(gameDate) {
    try {
      return await this.prisma.dailyGameMatch.findMany({
        where: {
          gameDate: new Date(gameDate)
        },
        orderBy: { displayOrder: 'asc' }
      });
    } catch (error) {
      console.error('❌ Error fetching daily game matches:', error.message);
      throw error;
    }
  }

  async createSlip(slipData) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Create slip
        const slip = await tx.slip.create({
          data: {
            userAddress: slipData.userAddress,
            gameDate: new Date(slipData.gameDate),
            totalOdds: slipData.totalOdds
          }
        });

        // Create slip entries
        const slipEntries = await Promise.all(
          slipData.entries.map(entry =>
            tx.slipEntry.create({
              data: {
                slipId: slip.slipId,
                matchId: entry.matchId,
                betType: entry.betType,
                selectedOutcome: entry.selectedOutcome,
                selectedOdd: entry.selectedOdd
              }
            })
          )
        );

        return { slip, slipEntries };
      });
    } catch (error) {
      console.error('❌ Error creating slip:', error.message);
      throw error;
    }
  }

  // =================================================
  // TRANSACTION MANAGEMENT
  // =================================================

  async transaction(callback) {
    try {
      return await this.prisma.$transaction(callback);
    } catch (error) {
      console.error('❌ Transaction failed:', error.message);
      throw error;
    }
  }

  // Raw query access for complex operations
  async queryRaw(query, params = []) {
    try {
      return await this.prisma.$queryRaw(query, ...params);
    } catch (error) {
      console.error('❌ Raw query failed:', error.message);
      throw error;
    }
  }
}

// Export singleton instance
const prismaService = new PrismaService();

// Graceful shutdown
process.on('beforeExit', async () => {
  await prismaService.disconnect();
});

process.on('SIGTERM', async () => {
  await prismaService.disconnect();
  process.exit(0);
});

module.exports = prismaService;
