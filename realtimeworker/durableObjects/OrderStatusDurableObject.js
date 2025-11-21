/**
 * Durable Object for managing WebSocket connections for order status updates
 */

export class OrderStatusDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set(); // WebSocket connections
    this.currentStatus = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    
    if (url.pathname === '/connect') {
      // Handle WebSocket upgrade
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }
      
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      
      // Accept the WebSocket connection
      this.handleSession(server);
      
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    } else if (url.pathname === '/update') {
      // Update status and broadcast to all connected clients
      const body = await request.json();
      this.currentStatus = body.status || body;
      
      // Broadcast to all connected sessions
      this.broadcast(JSON.stringify({
        type: 'status_update',
        status: this.currentStatus,
        timestamp: new Date().toISOString(),
      }));
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (url.pathname === '/status') {
      // Get current status
      return new Response(JSON.stringify({ status: this.currentStatus }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }

  handleSession(ws) {
    this.sessions.add(ws);
    
    // Send current status if available
    if (this.currentStatus) {
      ws.send(JSON.stringify({
        type: 'status_update',
        status: this.currentStatus,
        timestamp: new Date().toISOString(),
      }));
    }
    
    ws.addEventListener('message', (event) => {
      // Handle incoming messages if needed
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (error) {
        // Ignore invalid messages
      }
    });
    
    ws.addEventListener('close', () => {
      this.sessions.delete(ws);
    });
    
    ws.addEventListener('error', () => {
      this.sessions.delete(ws);
    });
  }

  broadcast(message) {
    this.sessions.forEach(ws => {
      try {
        ws.send(message);
      } catch (error) {
        // Remove dead connections
        this.sessions.delete(ws);
      }
    });
  }
}

