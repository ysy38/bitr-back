/**
 * WEBSOCKET SERVICE FOR REAL-TIME UPDATES
 * 
 * Provides real-time updates to frontend clients, eliminating the need for polling.
 * Clients subscribe to specific data streams and receive updates when data changes.
 */

const WebSocket = require('ws');
const { EventEmitter } = require('events');

class WebSocketService extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map(); // clientId -> { ws, subscriptions }
    this.subscriptions = new Map(); // dataKey -> Set of clientIds
    this.heartbeatInterval = null;
  }

  initialize(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws',
      perMessageDeflate: false
    });

    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      this.clients.set(clientId, {
        ws,
        subscriptions: new Set(),
        lastPing: Date.now()
      });

      console.log(`🔌 WebSocket client connected: ${clientId}`);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleMessage(clientId, data);
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(clientId);
      });

      ws.on('pong', () => {
        const client = this.clients.get(clientId);
        if (client) {
          client.lastPing = Date.now();
        }
      });

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'connected',
        clientId,
        timestamp: Date.now()
      });
    });

    // Start heartbeat
    this.startHeartbeat();
    
    console.log('🚀 WebSocket service initialized');
  }

  generateClientId() {
    return 'client_' + Math.random().toString(36).substr(2, 9);
  }

  handleMessage(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (data.type) {
      case 'subscribe':
        this.subscribe(clientId, data.channel);
        break;
      case 'unsubscribe':
        this.unsubscribe(clientId, data.channel);
        break;
      case 'ping':
        this.sendToClient(clientId, { type: 'pong', timestamp: Date.now() });
        break;
    }
  }

  subscribe(clientId, channel) {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions.add(channel);
    
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel).add(clientId);

    console.log(`📡 Client ${clientId} subscribed to ${channel}`);
    
    this.sendToClient(clientId, {
      type: 'subscribed',
      channel,
      timestamp: Date.now()
    });
  }

  unsubscribe(clientId, channel) {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions.delete(channel);
    
    if (this.subscriptions.has(channel)) {
      this.subscriptions.get(channel).delete(clientId);
    }

    console.log(`📡 Client ${clientId} unsubscribed from ${channel}`);
    
    this.sendToClient(clientId, {
      type: 'unsubscribed',
      channel,
      timestamp: Date.now()
    });
  }

  handleDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all subscriptions
    for (const channel of client.subscriptions) {
      if (this.subscriptions.has(channel)) {
        this.subscriptions.get(channel).delete(clientId);
      }
    }

    this.clients.delete(clientId);
    console.log(`🔌 WebSocket client disconnected: ${clientId}`);
  }

  sendToClient(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;

    try {
      // ✅ FIX: Handle BigInt serialization for WebSocket
      const serializedData = this.serializeForWebSocket(data);
      client.ws.send(JSON.stringify(serializedData));
    } catch (error) {
      console.error('WebSocket send error:', error);
    }
  }

  /**
   * Serialize data for WebSocket transmission, handling BigInt values
   */
  serializeForWebSocket(data) {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'bigint') {
      return data.toString();
    }

    if (Array.isArray(data)) {
      return data.map(item => this.serializeForWebSocket(item));
    }

    if (typeof data === 'object') {
      const serialized = {};
      for (const [key, value] of Object.entries(data)) {
        serialized[key] = this.serializeForWebSocket(value);
      }
      return serialized;
    }

    return data;
  }

  broadcastToChannel(channel, data) {
    if (!this.subscriptions.has(channel)) return;

    const subscribers = this.subscriptions.get(channel);
    console.log(`📢 Broadcasting to ${subscribers.size} clients on ${channel}`);

    for (const clientId of subscribers) {
      this.sendToClient(clientId, {
        type: 'update',
        channel,
        data,
        timestamp: Date.now()
      });
    }
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 30000; // 30 seconds

      for (const [clientId, client] of this.clients) {
        if (now - client.lastPing > timeout) {
          console.log(`💔 Client ${clientId} heartbeat timeout`);
          client.ws.terminate();
          this.handleDisconnect(clientId);
        } else {
          client.ws.ping();
        }
      }
    }, 10000); // Check every 10 seconds
  }

  // Public methods for triggering updates
  updatePoolProgress(poolId, data) {
    this.broadcastToChannel(`pool:${poolId}:progress`, data);
  }

  updateRecentBets(data) {
    this.broadcastToChannel('recent_bets', data);
  }

  // ✅ Broadcast pool created event for Live Activity feed
  broadcastPoolCreated(poolData) {
    this.broadcastToChannel('pool:created', poolData);
  }

  // ✅ Broadcast pool settled event for Live Activity feed
  broadcastPoolSettled(poolData) {
    this.broadcastToChannel('pool:settled', poolData);
  }

  // ✅ Broadcast reputation changed event
  broadcastReputationChanged(reputationData) {
    this.broadcastToChannel('reputation:changed', reputationData);
  }

  // ✅ Broadcast liquidity added event
  broadcastLiquidityAdded(liquidityData) {
    this.broadcastToChannel('liquidity:added', liquidityData);
  }

  // ✅ Broadcast cycle resolved event
  broadcastCycleResolved(cycleData) {
    this.broadcastToChannel('cycle:resolved', cycleData);
  }

  // ✅ Broadcast slip evaluated event
  broadcastSlipEvaluated(slipData) {
    this.broadcastToChannel('slip:evaluated', slipData);
  }

  // ✅ Broadcast prize claimed event
  broadcastPrizeClaimed(prizeData) {
    this.broadcastToChannel('prize:claimed', prizeData);
  }

  updateMarketList(data) {
    this.broadcastToChannel('markets', data);
  }

  // Match Center broadcasting methods
  broadcastScoreUpdate(fixtureId, score, status) {
    this.broadcastToChannel(`fixture:${fixtureId}`, {
      type: 'match:score_updated',
      fixtureId,
      score,
      status,
      timestamp: Date.now()
    });
    console.log(`📊 Score update broadcasted for fixture ${fixtureId}: ${score.current}`);
  }

  broadcastGoalScored(fixtureId, player, minute, team) {
    this.broadcastToChannel(`fixture:${fixtureId}`, {
      type: 'match:goal_scored',
      fixtureId,
      player,
      minute,
      team,
      timestamp: Date.now()
    });
    console.log(`⚽ Goal broadcasted for fixture ${fixtureId}: ${player} (${minute}')`);
  }

  broadcastMatchEvent(fixtureId, eventType, player, minute, team) {
    this.broadcastToChannel(`fixture:${fixtureId}`, {
      type: 'match:event',
      fixtureId,
      eventType,
      player,
      minute,
      team,
      timestamp: Date.now()
    });
    console.log(`📋 Match event broadcasted for fixture ${fixtureId}: ${eventType} - ${player}`);
  }

  broadcastStatusChange(fixtureId, status) {
    this.broadcastToChannel(`fixture:${fixtureId}`, {
      type: 'match:status_changed',
      fixtureId,
      status,
      timestamp: Date.now()
    });
    console.log(`🔄 Status change broadcasted for fixture ${fixtureId}: ${status}`);
  }

  // Notification broadcasting methods
  broadcastNotificationToUser(userAddress, notification) {
    // ✅ FIX: Only broadcast if WebSocket server is initialized
    if (!this.wss) {
      console.warn(`⚠️ WebSocket not initialized - notification saved to DB but not broadcast: ${notification.type} for ${userAddress}`);
      return;
    }
    
    const channel = `user:${userAddress.toLowerCase()}`;
    this.broadcastToChannel(channel, {
      type: 'notification',
      notification,
      timestamp: Date.now()
    });
    console.log(`🔔 Notification broadcasted to ${userAddress}: ${notification.type}`);
  }

  broadcastUnreadCountToUser(userAddress, unreadCount) {
    // ✅ FIX: Only broadcast if WebSocket server is initialized
    if (!this.wss) {
      return; // Silent fail for unread count (not critical)
    }
    
    const channel = `user:${userAddress.toLowerCase()}`;
    this.broadcastToChannel(channel, {
      type: 'notification:unread_count',
      unreadCount,
      timestamp: Date.now()
    });
  }

  getStats() {
    return {
      connectedClients: this.clients.size,
      totalSubscriptions: Array.from(this.subscriptions.values()).reduce((sum, set) => sum + set.size, 0),
      channels: Array.from(this.subscriptions.keys())
    };
  }
}

module.exports = new WebSocketService();
