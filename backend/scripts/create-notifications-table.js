const db = require('../db/db');

async function createNotificationsTable() {
  try {
    console.log('🔄 Creating notifications table...');
    
    // Create notifications table
    await db.query(`
      CREATE TABLE IF NOT EXISTS core.notifications (
        id SERIAL PRIMARY KEY,
        user_address VARCHAR(42) NOT NULL,
        type VARCHAR(50) NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        data JSONB,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    console.log('✅ Notifications table created');
    
    // Create index
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_user_notifications 
      ON core.notifications(user_address, read, created_at DESC)
    `);
    
    console.log('✅ Index created');
    
    console.log('🎉 Notifications table setup complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating notifications table:', error);
    process.exit(1);
  }
}

createNotificationsTable();

