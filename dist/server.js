/**
 * Express server for the Atlassian MCP with SSE support
 */
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import sseHandler from './services/sseHandler.js';
import configManager from './services/configManager.js';
import mcpAdapter from './services/mcpSseAdapter.js';
import { config as globalConfig } from './config.js';
import * as connectionDebug from './utils/debugger.js';

// Get __dirname equivalent in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicPath = path.join(__dirname, '..', 'public');

class AtlassianMCPServer {
  constructor(port = 3000) {
    this.port = port;
    this.app = express();
    this.allTools = [];
    
    // Set up middleware
    this.setupMiddleware();
    // Set up routes
    this.setupRoutes();
  }
  
  /**
   * Set up Express middleware
   */
  setupMiddleware() {
    this.app.use(cors());
    this.app.use(bodyParser.json());
    this.app.use(express.static(publicPath));
  }
  
  /**
   * Set up Express routes
   */
  setupRoutes() {
    // Serve the configuration page
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(publicPath, 'index.html'));
    });
    
    // SSE connection endpoint
    this.app.get('/mcp-events', (req, res) => {
      // Set up SSE connection
      const clientId = sseHandler.addClient(res);
      
      // Handle client disconnect
      req.on('close', () => {
        sseHandler.removeClient(clientId);
        mcpAdapter.cleanupClient(clientId);
      });
    });
    
    // StreamableHttp support - used by Cursor
    this.app.post('/mcp-events', (req, res) => {
      // Parse the initial request
      const mcpRequest = req.body;
      const clientId = req.query.clientId || mcpRequest?.clientId || `client-${Date.now()}`;
      
      // Detect client type
      const clientType = configManager.detectClientType(req.headers['user-agent'] || '');
      configManager.setClientType(clientId, clientType);
      
      console.error(`StreamableHttp client connected: ${clientId} (type: ${clientType})`);
      
      // Setup for streamable response - using NDJSON content type
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in Nginx
      
      // Send initial response - this is critical for the handshake
      res.write(JSON.stringify({ 
        jsonrpc: "2.0",
        id: mcpRequest?.id || "handshake",
        result: {
          clientId,
          message: 'StreamableHttp connection established',
          server: 'atlassian-mcp',
          version: '1.0.0'
        }
      }) + '\n');
      
      // Force the response to be sent immediately
      if (typeof res.flush === 'function') {
        res.flush();
      }
      
      console.error(`StreamableHttp client connected: ${clientId}`);
      
      // Get client-specific configuration
      const clientConfig = configManager.getClientSpecificConfig(clientId, clientType);
      
      // Setup ping interval to keep the connection alive - use a more sophisticated approach
      let pingCounter = 0;
      const pingInterval = setInterval(() => {
        try {
          if (!res.writableEnded && !res.destroyed) {
            // Increment the counter for this connection
            pingCounter++;
            
            // Send a proper JSON-RPC ping with incremental counter to track missing pings
            res.write(JSON.stringify({ 
              jsonrpc: "2.0", 
              method: "ping", 
              params: { 
                timestamp: Date.now(), 
                clientId,
                counter: pingCounter,
                keepalive: true,
                clientType
              } 
            }) + '\n');
            
            // Force flush to send immediately
            if (typeof res.flush === 'function') {
              res.flush();
            }
            
            // Log ping but not too frequently to avoid log spam
            if (pingCounter % 10 === 0) {
              console.error(`Ping #${pingCounter} sent to StreamableHttp client: ${clientId}`);
            }
          } else {
            clearInterval(pingInterval);
            console.error(`StreamableHttp connection ended for client: ${clientId}`);
          }
        } catch (error) {
          console.error(`Ping error for client ${clientId}:`, error);
          clearInterval(pingInterval);
          
          // Try to clean up
          try {
            if (!res.writableEnded) {
              res.end();
            }
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      }, clientConfig.pingInterval); // Use client-specific ping interval
      
      // Process the request if it's provided in the initial call
      if (mcpRequest && mcpRequest.method) {
        const requestId = mcpAdapter.processRequest(clientId, mcpRequest);
        
        // Handle the request based on its type
        switch (mcpRequest.method) {
          case 'tools/list':
            mcpAdapter.handleListTools(this.allTools, requestId, clientId, res);
            break;
            
          case 'tools/call':
            mcpAdapter.handleCallTool(this.allTools, requestId, mcpRequest.params, clientId, res);
            break;
            
          default:
            mcpAdapter.sendResponse(requestId, {
              error: `Unsupported method: ${mcpRequest.method}`
            }, res);
        }
      }
      
      // Keep connection open and clean up on close
      req.on('close', () => {
        clearInterval(pingInterval);
        mcpAdapter.cleanupClient(clientId);
      });
      
      // Handle errors to prevent crashes
      req.on('error', (err) => {
        console.error('StreamableHttp request error:', err);
        clearInterval(pingInterval);
        mcpAdapter.cleanupClient(clientId);
      });
    });
    
    // Client configuration endpoint
    this.app.post('/config/:clientId', async (req, res) => {
      const { clientId } = req.params;
      const configData = req.body;
      
      try {
        // Update client configuration
        const config = configManager.setClientConfig(clientId, configData);
        
        // Validate the configuration
        const validation = configManager.validateClientConfig(clientId);
        
        res.json({
          success: true,
          config,
          validation
        });
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    });
    
    // Test connection endpoint
    this.app.post('/test-connection/:clientId', async (req, res) => {
      const { clientId } = req.params;
      
      try {
        const result = await configManager.testConnection(clientId);
        res.json(result);
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
    
    // Add OPTIONS handler for CORS preflight requests
    this.app.options('/jsonrpc', (req, res) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      res.sendStatus(200);
    });
    
    // JSON-RPC compatible endpoint for Cursor's streamableHttp
    this.app.post('/jsonrpc', (req, res) => {
      // Set headers for CORS - important for cross-origin requests
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      
      // Log detailed connection info for debugging
      connectionDebug.logConnectionDetails(req, 'jsonrpc');
      
      const rpcRequest = req.body;
      console.error('Received JSON-RPC request:', JSON.stringify(rpcRequest));
      
      // Check if this is a valid JSON-RPC request
      if (!rpcRequest || typeof rpcRequest !== 'object') {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid Request'
          },
          id: null
        });
      }
      
      // Setup streaming response with proper headers for Cursor
      res.setHeader('Content-Type', 'application/x-ndjson');  // Changed to NDJSON
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');  // Important for Nginx proxies
      
      // Get client ID and detect client type
      const clientId = rpcRequest.params?.clientId || `jsonrpc-${Date.now()}`;
      const clientType = configManager.detectClientType(req.headers['user-agent'] || '');
      
      // Store the client type for future requests
      configManager.setClientType(clientId, clientType);
      
      console.error(`JSON-RPC client connected: ${clientId} (type: ${clientType})`);
      
      // For initial handshake request, respond immediately
      if (rpcRequest.method === 'handshake' || !rpcRequest.method) {
        // Send a proper handshake response that Cursor expects
        const handshakeResponse = {
          jsonrpc: '2.0',
          id: rpcRequest.id || 'handshake-response',
          result: {
            clientId,
            status: 'connected',
            server: 'atlassian-mcp',
            version: '1.0.0'
          }
        };
        
        res.write(JSON.stringify(handshakeResponse) + '\n');
        
        // Force flush - important for immediate delivery
        if (typeof res.flush === 'function') {
          res.flush();
        }
        
        console.error(`Handshake response sent for client: ${clientId}`);
      }
      
      // Create a more sophisticated ping interval - critical for Cursor connections
      let pingCounter = 0;
      const initialPing = setTimeout(() => {
        // Send an immediate initial ping to establish the connection
        if (!res.writableEnded && !res.destroyed) {
          res.write(JSON.stringify({ 
            jsonrpc: '2.0', 
            method: 'ping', 
            params: { timestamp: Date.now(), clientId, initial: true } 
          }) + '\n');
          
          if (typeof res.flush === 'function') {
            res.flush();
          }
          
          console.error(`Initial ping sent to client: ${clientId}`);
        }
      }, 500); // Send first ping quickly
      
      // Get client-specific configuration
      const clientConfig = configManager.getClientSpecificConfig(clientId, clientType);
      
      // Regular ping interval based on client type
      const pingInterval = setInterval(() => {
        try {
          if (!res.writableEnded && !res.destroyed) {
            // Increment the counter for this connection
            pingCounter++;
            
            // Send a proper JSON-RPC ping with incremental counter
            const ping = { 
              jsonrpc: '2.0', 
              method: 'ping', 
              params: { 
                timestamp: Date.now(), 
                clientId, 
                counter: pingCounter,
                keepalive: true,
                clientType
              } 
            };
            
            res.write(JSON.stringify(ping) + '\n');
            
            // Force flush
            if (typeof res.flush === 'function') {
              res.flush();
            }
            
            // Log ping but not too frequently to avoid log spam
            if (pingCounter % 10 === 0) {
              console.error(`Ping #${pingCounter} sent to client: ${clientId}`);
            }
          } else {
            clearInterval(pingInterval);
            console.error(`Connection ended for client: ${clientId}`);
          }
        } catch (error) {
          console.error(`Ping error for client ${clientId}:`, error);
          clearInterval(pingInterval);
          
          // Try to clean up the connection
          try {
            if (!res.writableEnded) {
              res.end();
            }
          } catch (e) {
            // Ignore any errors during cleanup
          }
        }
      }, clientConfig.pingInterval); // Use client-specific ping interval
      
      // Map JSON-RPC methods to MCP methods
      if (rpcRequest.method === 'tools/list' || rpcRequest.method === 'tools/call') {
        const requestId = mcpAdapter.processRequest(clientId, {
          method: rpcRequest.method,
          params: rpcRequest.params,
          id: rpcRequest.id
        });
        
        // Handle the request based on method
        if (rpcRequest.method === 'tools/list') {
          mcpAdapter.handleListTools(this.allTools, requestId, clientId, res);
        } else {
          mcpAdapter.handleCallTool(this.allTools, requestId, rpcRequest.params, clientId, res);
        }
      }
      
      // Handle connection close and errors more thoroughly
      req.on('close', () => {
        console.error(`Connection closed for client: ${clientId}`);
        clearTimeout(initialPing);
        clearInterval(pingInterval);
        mcpAdapter.cleanupClient(clientId);
        
        try {
          if (!res.writableEnded) {
            res.end();
          }
        } catch (e) {
          // Ignore any errors during cleanup
        }
      });
      
      req.on('error', (err) => {
        console.error(`Error in request for client ${clientId}:`, err);
        clearTimeout(initialPing);
        clearInterval(pingInterval);
        mcpAdapter.cleanupClient(clientId);
        
        try {
          if (!res.writableEnded) {
            res.end();
          }
        } catch (e) {
          // Ignore any errors during cleanup
        }
      });
      
      // Add similar handlers for response
      res.on('error', (err) => {
        console.error(`Error in response for client ${clientId}:`, err);
        clearInterval(pingInterval);
        mcpAdapter.cleanupClient(clientId);
      });
    });
    
    // MCP request endpoint
    this.app.post('/mcp-request/:clientId', (req, res) => {
      const { clientId } = req.params;
      const mcpRequest = req.body;
      
      // Process the MCP request
      const requestId = mcpAdapter.processRequest(clientId, mcpRequest);
      
      // Handle the request based on its type
      switch (mcpRequest.method) {
        case 'tools/list':
          mcpAdapter.handleListTools(this.allTools, requestId, clientId);
          break;
          
        case 'tools/call':
          mcpAdapter.handleCallTool(this.allTools, requestId, mcpRequest.params, clientId);
          break;
          
        default:
          mcpAdapter.sendResponse(requestId, {
            error: `Unsupported method: ${mcpRequest.method}`
          });
      }
      
      // Send immediate acknowledgment
      res.json({ success: true, requestId });
    });
    
    // Debug endpoint for testing Cursor connections
    this.app.get('/debug/cursor-connection', (req, res) => {
      // Detect client type from user agent
      const clientType = configManager.detectClientType(req.headers['user-agent'] || '');
      const clientConfig = configManager.getClientSpecificConfig(null, clientType);
      
      res.setHeader('Content-Type', 'application/json');
      res.json({
        success: true,
        message: 'Debug endpoint accessible',
        server: 'atlassian-mcp',
        version: '1.0.0',
        timestamp: Date.now(),
        detectedClient: {
          type: clientType,
          userAgent: req.headers['user-agent'] || 'Unknown',
          config: clientConfig
        },
        endpoints: {
          jsonrpc: '/jsonrpc',
          mcp_events: '/mcp-events',
          sse: '/mcp-events (GET)',
          streamableHttp: '/mcp-events (POST)'
        },
        supportedClients: ['Cursor', 'VSCode', 'Claude Desktop'],
        clientConfigs: configManager.clientTypeConfigs,
        note: 'If you can see this message, the server is running and accessible.'
      });
    });
  }
  
  /**
   * Register MCP tools
   * @param {Array} tools - Array of MCP tools
   */
  registerTools(tools) {
    this.allTools = tools;
  }
  
  /**
   * Start the server
   * @returns {Promise} - Promise that resolves when the server starts
   */
  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.error(`🚀 Atlassian MCP Server with SSE support running at http://localhost:${this.port}`);
        
        // Start the SSE heartbeat
        sseHandler.startHeartbeat();
        
        resolve(this.server);
      });
    });
  }
  
  /**
   * Stop the server
   */
  stop() {
    if (this.server) {
      sseHandler.stopHeartbeat();
      this.server.close();
    }
  }
}

export default AtlassianMCPServer;
