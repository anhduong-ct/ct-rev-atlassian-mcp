/**
 * SSE Client for Atlassian MCP
 * Provides a client-side library for connecting to the MCP server via SSE
 */

class AtlassianMCPClient {
  /**
   * Create a new MCP client
   * @param {Object} options - Configuration options
   * @param {String} options.serverUrl - MCP server URL (default: /mcp-events)
   */
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || '/mcp-events';
    this.baseUrl = new URL(this.serverUrl, window.location.origin).origin;
    this.eventSource = null;
    this.clientId = null;
    this.connected = false;
    this.connectionPromise = null;
    this.callbacks = {
      onConnect: null,
      onDisconnect: null,
      onMessage: null,
      onError: null
    };
    this.pendingRequests = new Map();
  }

  /**
   * Connect to the MCP server
   * @returns {Promise<String>} - Promise that resolves with the client ID when connected
   */
  connect() {
    // If already connected, return the existing promise
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      // Create a new EventSource connection
      this.eventSource = new EventSource(this.serverUrl);

      // Set up event handlers
      this.eventSource.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data);
        this.clientId = data.clientId;
        this.connected = true;
        
        if (this.callbacks.onConnect) {
          this.callbacks.onConnect(data);
        }
        
        resolve(this.clientId);
      });

      this.eventSource.addEventListener('error', (event) => {
        this.connected = false;
        
        if (this.callbacks.onError) {
          this.callbacks.onError(event);
        }
        
        // Only reject the promise if we're still trying to connect
        if (!this.clientId) {
          reject(new Error('Failed to connect to MCP server'));
          this.connectionPromise = null;
        }
      });

      this.eventSource.addEventListener('mcp_response', (event) => {
        const data = JSON.parse(event.data);
        const requestId = data.requestId;
        
        // Check if we have a pending request
        if (this.pendingRequests.has(requestId)) {
          const { resolve, reject } = this.pendingRequests.get(requestId);
          
          // Resolve or reject based on the response
          if (data.response.isError) {
            reject(new Error(data.response.content[0].text));
          } else {
            resolve(data.response);
          }
          
          // Remove the pending request
          this.pendingRequests.delete(requestId);
        }
        
        // Call the message callback if defined
        if (this.callbacks.onMessage) {
          this.callbacks.onMessage(data);
        }
      });
    });

    return this.connectionPromise;
  }

  /**
   * Disconnect from the MCP server
   */
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.clientId = null;
      this.connected = false;
      this.connectionPromise = null;
      
      if (this.callbacks.onDisconnect) {
        this.callbacks.onDisconnect();
      }
    }
  }

  /**
   * Set callback functions for events
   * @param {Object} callbacks - Callback functions
   * @param {Function} callbacks.onConnect - Called when connected
   * @param {Function} callbacks.onDisconnect - Called when disconnected
   * @param {Function} callbacks.onMessage - Called when a message is received
   * @param {Function} callbacks.onError - Called when an error occurs
   */
  setCallbacks(callbacks = {}) {
    this.callbacks = {
      ...this.callbacks,
      ...callbacks
    };
  }

  /**
   * Send a request to the MCP server
   * @param {Object} request - MCP request object
   * @returns {Promise<Object>} - Promise that resolves with the response
   */
  async sendRequest(request) {
    // Ensure we're connected
    await this.connect();

    return new Promise((resolve, reject) => {
      // Send the request to the server
      fetch(`${this.baseUrl}/mcp-request/${this.clientId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            // Store the promise resolvers for when we get the response
            this.pendingRequests.set(data.requestId, { resolve, reject });
          } else {
            reject(new Error(data.error || 'Failed to send request'));
          }
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  /**
   * Get the list of available tools
   * @returns {Promise<Array>} - Promise that resolves with the list of tools
   */
  async listTools() {
    const request = {
      method: 'tools/list',
      params: {}
    };

    const response = await this.sendRequest(request);
    return response.tools;
  }

  /**
   * Call an MCP tool
   * @param {String} name - Tool name
   * @param {Object} args - Tool arguments
   * @returns {Promise<Object>} - Promise that resolves with the tool result
   */
  async callTool(name, args = {}) {
    const request = {
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    };

    const response = await this.sendRequest(request);
    return response.content[0].text;
  }

  /**
   * Update the client's configuration
   * @param {Object} config - Configuration object
   * @returns {Promise<Object>} - Promise that resolves with the updated config
   */
  async updateConfig(config) {
    // Ensure we're connected
    await this.connect();

    const response = await fetch(`${this.baseUrl}/config/${this.clientId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    });

    return response.json();
  }

  /**
   * Test the connection with the current configuration
   * @returns {Promise<Object>} - Promise that resolves with the test result
   */
  async testConnection() {
    // Ensure we're connected
    await this.connect();

    const response = await fetch(`${this.baseUrl}/test-connection/${this.clientId}`, {
      method: 'POST'
    });

    return response.json();
  }
}

// Export for browser and CommonJS
if (typeof window !== 'undefined') {
  window.AtlassianMCPClient = AtlassianMCPClient;
}

if (typeof module !== 'undefined') {
  module.exports = AtlassianMCPClient;
}
