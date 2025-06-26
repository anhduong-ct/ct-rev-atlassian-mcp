/**
 * Server-Sent Events (SSE) Handler
 * Manages SSE connections and dispatches events to connected clients
 */

import { v4 as uuidv4 } from 'uuid';

class SSEHandler {
  constructor() {
    this.clients = new Map(); // Map of client ID to response object
  }

  /**
   * Add a new client connection
   * @param {Object} res - Express response object
   * @returns {String} - Client ID
   */
  addClient(res) {
    const clientId = uuidv4();
    
    // Configure response for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable buffering in Nginx
    });
    
    // Write the initial connection message
    res.write(`id: ${clientId}\n`);
    res.write(`event: connected\n`);
    res.write(`data: ${JSON.stringify({ clientId, message: 'Connection established' })}\n\n`);
    
    // Add client to the map
    this.clients.set(clientId, res);
    
    console.error(`SSE client connected: ${clientId}`);
    
    // Return the client ID
    return clientId;
  }
  
  /**
   * Remove a client connection
   * @param {String} clientId - Client ID
   */
  removeClient(clientId) {
    if (this.clients.has(clientId)) {
      console.error(`SSE client disconnected: ${clientId}`);
      this.clients.delete(clientId);
    }
  }
  
  /**
   * Send an event to a specific client
   * @param {String} clientId - Client ID
   * @param {String} event - Event name
   * @param {Object} data - Event data
   * @returns {Boolean} - Success status
   */
  sendToClient(clientId, event, data) {
    if (!this.clients.has(clientId)) {
      console.error(`Cannot send to client ${clientId}: client not found`);
      return false;
    }
    
    try {
      const res = this.clients.get(clientId);
      
      // Make sure the connection is still open
      if (res.writableEnded || res.destroyed) {
        console.error(`Cannot send to client ${clientId}: connection closed`);
        this.removeClient(clientId);
        return false;
      }
      
      // Format event according to SSE specification
      const eventId = Date.now();
      res.write(`id: ${eventId}\n`);
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      
      console.error(`Event sent to client ${clientId}: ${event}`);
      return true;
    } catch (error) {
      console.error(`Error sending event to client ${clientId}:`, error);
      this.removeClient(clientId);
      return false;
    }
  }
  
  /**
   * Send an event to all connected clients
   * @param {String} event - Event name
   * @param {Object} data - Event data
   */
  broadcast(event, data) {
    for (const clientId of this.clients.keys()) {
      this.sendToClient(clientId, event, data);
    }
  }
  
  /**
   * Send a ping event to keep connections alive
   */
  sendHeartbeat() {
    this.broadcast('heartbeat', { timestamp: Date.now() });
  }
  
  /**
   * Start the heartbeat interval
   * @param {Number} interval - Interval in milliseconds (default: 30000 ms)
   */
  startHeartbeat(interval = 30000) {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, interval);
  }
  
  /**
   * Stop the heartbeat interval
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
}

export default new SSEHandler();
