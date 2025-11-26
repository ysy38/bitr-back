const db = require('../db/db');
const websocketService = require('../services/websocket-service');
const notificationService = require('../services/notification-service');

async function diagnoseNotifications() {
  try {
    console.log('\n🔍 NOTIFICATION SYSTEM DIAGNOSTICS\n');
    console.log('='.repeat(60));
    
    // 1. Check WebSocket Service
    console.log('\n1️⃣ WebSocket Service Status:');
    console.log('-'.repeat(60));
    if (websocketService.wss) {
      console.log('✅ WebSocket server is initialized');
      console.log(`   Path: ${websocketService.wss.options.path || '/ws'}`);
      
      const stats = websocketService.getStats();
      console.log(`   Connected Clients: ${stats.connectedClients}`);
      console.log(`   Total Subscriptions: ${stats.totalSubscriptions}`);
      console.log(`   Active Channels: ${stats.channels.length}`);
      
      if (stats.connectedClients === 0) {
        console.log('   ⚠️ WARNING: No clients connected!');
        console.log('      → Frontend may not be connecting to WebSocket');
        console.log('      → Check frontend WebSocket connection');
        console.log('      → Verify WS_URL in frontend: wss://bitredict-backend.fly.dev/ws');
      }
      
      if (stats.channels.length === 0) {
        console.log('   ⚠️ WARNING: No channels subscribed!');
        console.log('      → Frontend may not be subscribing to user channels');
        console.log('      → Check frontend subscription logic');
      } else {
        console.log(`   Channels: ${stats.channels.join(', ')}`);
      }
    } else {
      console.log('❌ WebSocket server NOT initialized!');
      console.log('   → WebSocket must be initialized in server.js');
      console.log('   → Check if API server is running');
      console.log('   → Verify websocketService.initialize(server) is called');
    }
    
    // 2. Check Database Notifications
    console.log('\n2️⃣ Database Notifications:');
    console.log('-'.repeat(60));
    
    const totalCount = await db.query('SELECT COUNT(*) as count FROM core.notifications');
    console.log(`   Total Notifications: ${totalCount.rows[0].count}`);
    
    const unreadCount = await db.query('SELECT COUNT(*) as count FROM core.notifications WHERE read = FALSE');
    console.log(`   Unread Notifications: ${unreadCount.rows[0].count}`);
    
    const recentNotifications = await db.query(`
      SELECT user_address, type, title, created_at, read
      FROM core.notifications
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    if (recentNotifications.rows.length === 0) {
      console.log('   ⚠️ WARNING: No notifications found in database!');
      console.log('      → Notifications may not be being created');
      console.log('      → Check notification service calls in:');
      console.log('        - event-driven-pool-sync.js (PoolCreated)');
      console.log('        - api/oddyssey.js (SlipPlaced)');
      console.log('        - event-driven-pool-sync.js (PoolSettled, BetWon, BetLost)');
    } else {
      console.log(`   Recent Notifications (last 10):`);
      recentNotifications.rows.forEach((notif, idx) => {
        console.log(`      ${idx + 1}. [${notif.type}] ${notif.title}`);
        console.log(`         User: ${notif.user_address}`);
        console.log(`         Created: ${notif.created_at}`);
        console.log(`         Read: ${notif.read}`);
      });
    }
    
    // 3. Check Notification Types Distribution
    console.log('\n3️⃣ Notification Types Distribution:');
    console.log('-'.repeat(60));
    
    const typeDistribution = await db.query(`
      SELECT type, COUNT(*) as count
      FROM core.notifications
      GROUP BY type
      ORDER BY count DESC
    `);
    
    if (typeDistribution.rows.length === 0) {
      console.log('   No notification types found');
    } else {
      typeDistribution.rows.forEach(type => {
        console.log(`   ${type.type}: ${type.count}`);
      });
    }
    
    // 4. Test Notification Creation
    console.log('\n4️⃣ Testing Notification Creation:');
    console.log('-'.repeat(60));
    
    const testAddress = '0x0000000000000000000000000000000000000000';
    console.log(`   Creating test notification for ${testAddress}...`);
    
    try {
      const testNotif = await notificationService.createNotification({
        userAddress: testAddress,
        type: 'slip_placed',
        title: 'Test Notification',
        message: 'This is a test notification to verify the system',
        data: { test: true }
      });
      
      console.log('   ✅ Test notification created successfully!');
      console.log(`      ID: ${testNotif.id}`);
      console.log(`      Type: ${testNotif.type}`);
      
      // Check if it was broadcasted
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
      const statsAfter = websocketService.getStats();
      
      if (websocketService.wss && statsAfter.connectedClients > 0) {
        console.log(`   ✅ WebSocket is available - notification should be broadcasted`);
        console.log(`      → Check if client subscribed to: user:${testAddress.toLowerCase()}`);
      } else if (!websocketService.wss) {
        console.log('   ⚠️ WebSocket not initialized - notification saved to DB but not broadcasted');
      } else {
        console.log('   ⚠️ No WebSocket clients connected - notification saved to DB but not delivered');
      }
      
      // Clean up test notification
      await db.query('DELETE FROM core.notifications WHERE id = $1', [testNotif.id]);
      console.log('   🧹 Test notification cleaned up');
      
    } catch (error) {
      console.error('   ❌ Error creating test notification:', error.message);
      console.error('   → This indicates a problem with notification service');
    }
    
    // 5. Recommendations
    console.log('\n5️⃣ Recommendations:');
    console.log('-'.repeat(60));
    
    if (!websocketService.wss) {
      console.log('   🔧 FIX: Ensure WebSocket is initialized in server.js');
      console.log('      → Check API server is running');
      console.log('      → Verify websocketService.initialize(server) is called');
    }
    
    if (websocketService.wss && websocketService.getStats().connectedClients === 0) {
      console.log('   🔧 FIX: Frontend not connecting to WebSocket');
      console.log('      → Check frontend WebSocket connection code');
      console.log('      → Verify WS_URL is correct: wss://bitredict-backend.fly.dev/ws');
      console.log('      → Check browser console for connection errors');
      console.log('      → Ensure frontend is using useWebSocket hook with proper channel');
    }
    
    if (websocketService.wss && websocketService.getStats().channels.length === 0) {
      console.log('   🔧 FIX: Frontend not subscribing to user channels');
      console.log('      → Frontend must subscribe to: user:{address}');
      console.log('      → Check frontend subscription logic in useWebSocket hook');
      console.log('      → Verify channel format: user:{address.toLowerCase()}');
    }
    
    if (parseInt(totalCount.rows[0].count) === 0) {
      console.log('   🔧 FIX: No notifications in database');
      console.log('      → Notifications may not be being created');
      console.log('      → Check notification service is being called');
      console.log('      → Check event-driven-pool-sync.js, api/oddyssey.js');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Diagnostic complete!\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Diagnostic Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

diagnoseNotifications();

