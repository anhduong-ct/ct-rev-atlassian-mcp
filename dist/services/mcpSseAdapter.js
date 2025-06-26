/**
 * MCP to SSE Adapter
 * Adapts the Model Context Protocol to Server-Sent Events
 */
import { v4 as uuidv4 } from 'uuid';
import sseHandler from './sseHandler.js';
import configManager from './configManager.js';
import * as connectionDebug from '../utils/debugger.js';

class MCPSSEAdapter {
  constructor() {
    this.requests = new Map(); // Map of request ID to request data
    this.clientRequests = new Map(); // Map of client ID to set of request IDs
  }

  /**
   * Process an MCP request from an SSE client
   * @param {String} clientId - SSE client ID
   * @param {Object} mcpRequest - MCP request object
   * @returns {String} - Request ID
   */
  processRequest(clientId, mcpRequest) {
    // Generate a request ID
    const requestId = uuidv4();
    
    // Store the request
    this.requests.set(requestId, {
      clientId,
      requestData: mcpRequest,
      timestamp: Date.now()
    });
    
    // Add to client's requests
    if (!this.clientRequests.has(clientId)) {
      this.clientRequests.set(clientId, new Set());
    }
    this.clientRequests.get(clientId).add(requestId);
    
    return requestId;
  }
  
  /**
   * Send MCP response back to the SSE client
   * @param {String} requestId - Request ID
   * @param {Object} mcpResponse - MCP response object
   * @param {Object} directResponse - Optional Express response object for direct HTTP response
   * @returns {Boolean} - Success status
   */
  sendResponse(requestId, mcpResponse, directResponse = null) {
    if (!this.requests.has(requestId)) {
      console.error(`Request not found: ${requestId}`);
      return false;
    }
    
    const { clientId, requestData } = this.requests.get(requestId);
    
    // Get client type to customize the response format
    const clientType = configManager.getClientType(clientId);
    
    // If directResponse is provided (streamableHttp), send directly to the HTTP response
    if (directResponse) {
      try {
        // Make sure the response is still writable
        if (directResponse.writableEnded || directResponse.destroyed) {
          console.error('Cannot send to closed connection');
          return false;
        }
        
        // Format the response as JSON-RPC 2.0 for streamableHttp
        const jsonRpcResponse = {
          jsonrpc: "2.0",
          id: requestData?.id || requestId,
          result: mcpResponse
        };
        
        // For Cursor clients, ensure we're using proper formatting
        if (clientType === 'cursor') {
          // Make sure the response doesn't exceed limits
          const stringifiedResponse = JSON.stringify(jsonRpcResponse);
          console.error(`Sending JSON-RPC response for Cursor client ${clientId}, request ${requestId}`);
          
          // Add special handling for Cursor if needed
          if (stringifiedResponse.length > 500000) {
            console.error('Warning: Large response may cause issues with Cursor');
          }
        } else {
          console.error(`Sending JSON-RPC response for client ${clientId} (${clientType}), request ${requestId}:`, 
                       JSON.stringify(jsonRpcResponse).substring(0, 100) + '...');
        }
        
        // Trace the request/response cycle for debugging
        connectionDebug.traceRequestResponse(requestId, requestData, jsonRpcResponse);
        
        // Diagnose connection before sending
        connectionDebug.diagnoseConnection(clientId, directResponse);
        
        // Write the response and ensure it ends with a newline for NDJSON format
        directResponse.write(JSON.stringify(jsonRpcResponse) + '\n');
        
        // Force the response to be sent immediately if available
        if (typeof directResponse.flush === 'function') {
          directResponse.flush();
        }
        
        // Success with direct response
        return true;
      } catch (error) {
        console.error('Error sending direct response:', error);
        
        // Try to send an error response
        try {
          if (!directResponse.writableEnded) {
            const errorResponse = {
              jsonrpc: "2.0",
              id: requestData?.id || requestId,
              error: {
                code: -32000,
                message: `Server error: ${error.message}`
              }
            };
            
            directResponse.write(JSON.stringify(errorResponse) + '\n');
            
            if (typeof directResponse.flush === 'function') {
              directResponse.flush();
            }
          }
        } catch (e) {
          console.error('Failed to send error response:', e);
        }
        
        // Fall back to SSE if direct response fails
      }
    }
    
    // Send via SSE otherwise
    const success = sseHandler.sendToClient(clientId, 'mcp_response', {
      requestId,
      response: mcpResponse
    });
    
    // Clean up the request
    this.requests.delete(requestId);
    if (this.clientRequests.has(clientId)) {
      this.clientRequests.get(clientId).delete(requestId);
    }
    
    return success;
  }
  
  /**
   * Send an error response for JSON-RPC
   * @param {String} requestId - Request ID or null if unknown
   * @param {Object} error - Error object or message
   * @param {Object} directResponse - Express response object for direct HTTP response
   * @returns {Boolean} - Success status
   */
  sendErrorResponse(requestId, error, directResponse) {
    if (!directResponse || directResponse.writableEnded || directResponse.destroyed) {
      return false;
    }
    
    try {
      // Get the request data if we have it
      let id = requestId;
      if (requestId && this.requests.has(requestId)) {
        const { requestData } = this.requests.get(requestId);
        id = requestData?.id || requestId;
      }
      
      // Format error response according to JSON-RPC spec
      const errorObj = {
        jsonrpc: "2.0",
        id: id || null,
        error: {
          code: error.code || -32000,
          message: typeof error === 'string' ? error : (error.message || 'Unknown error')
        }
      };
      
      console.error(`Sending JSON-RPC error for request ${id}:`, errorObj.error.message);
      
      // Send the error response
      directResponse.write(JSON.stringify(errorObj) + '\n');
      
      // Force flush
      if (typeof directResponse.flush === 'function') {
        directResponse.flush();
      }
      
      return true;
    } catch (err) {
      console.error('Failed to send error response:', err);
      return false;
    }
  }
  
  /**
   * Handle List Tools request
   * @param {Array} allTools - Array of all available tools
   * @param {String} requestId - Request ID
   * @param {String} clientId - Client ID
   * @param {Object} directResponse - Optional Express response object for direct HTTP response
   */
  handleListTools(allTools, requestId, clientId, directResponse = null) {
    // Adapt tools for the client's configuration
    const config = configManager.getClientConfig(clientId);
    
    // Send the tools list
    this.sendResponse(requestId, {
      tools: allTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }))
    }, directResponse);
  }
  
  /**
   * Handle Call Tool request
   * @param {Array} allTools - Array of all available tools
   * @param {String} requestId - Request ID 
   * @param {Object} params - Tool call parameters
   * @param {String} clientId - Client ID
   * @param {Object} directResponse - Optional Express response object for direct HTTP response
   */
  async handleCallTool(allTools, requestId, params, clientId, directResponse = null) {
    const { name, arguments: args } = params;
    
    // Find the tool
    const tool = allTools.find(t => t.name === name);
    if (!tool) {
      this.sendResponse(requestId, {
        content: [
          {
            type: 'text',
            text: `Error: Tool ${name} not found`
          }
        ],
        isError: true
      }, directResponse);
      return;
    }

    try {
      // Get client-specific config
      const clientConfig = configManager.getClientConfig(clientId);
      
      // Call the tool handler with client config
      const result = await tool.handler(args || {}, clientConfig);
      
      // Send the result
      this.sendResponse(requestId, {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }
        ]
      }, directResponse);
    } catch (error) {
      console.error(`Error executing tool ${name}:`, error);
      
      // Send error response
      this.sendResponse(requestId, {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      }, directResponse);
    }
  }
  
  /**
   * Clean up client requests when a client disconnects
   * @param {String} clientId - Client ID
   */
  cleanupClient(clientId) {
    if (this.clientRequests.has(clientId)) {
      // Delete all requests from this client
      for (const requestId of this.clientRequests.get(clientId)) {
        this.requests.delete(requestId);
      }
      
      // Delete the client's request set
      this.clientRequests.delete(clientId);
    }
    
    // Clean up the client's configuration
    configManager.clearClientConfig(clientId);
  }
}

export default new MCPSSEAdapter();
