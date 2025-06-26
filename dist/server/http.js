// HTTP Server implementation for MCP
import express from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { config } from '../config.js';

// Import all tools
import authTools from '../tools/auth.js';
import sprintTools from '../tools/sprint.js';
import sprintDetectionTools from '../tools/sprintTools.js';
import refactoredConfluenceSprintTools from '../tools/refactored/confluenceSprint.js';
import creTools from '../tools/cre.js';
import intelligenceTools from '../tools/intelligence.js';
import communicationTools from '../tools/communication.js';
import debugTools from '../tools/debug.js';

export function createHttpServer(port = 3000) {
  const app = express();
  app.use(express.json());
  app.use(cors());

  // Map to store transports by session ID
  const transports = {};
  
  // Collect all tools
  const allTools = [
    ...authTools,    // Authentication tools should come first for better UX
    ...debugTools,   // Debug tools for troubleshooting configuration issues
    ...sprintTools,
    ...sprintDetectionTools,
    ...refactoredConfluenceSprintTools,
    ...cppfTools,
    ...creTools,
    ...intelligenceTools,
    ...communicationTools
  ];
  
  console.error(`Found ${allTools.length} tools to register for HTTP server`);
  console.error(`User role: ${config.user.role}`);

  // Handle POST requests for client-to-server communication
  app.post('/mcp', async (req, res) => {
    // Check for existing session ID
    const sessionId = req.headers['mcp-session-id'];
    let transport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          // Store the transport by session ID
          transports[sessionId] = transport;
        }
      });

      // Clean up transport when closed
      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
          console.log(`Session ${transport.sessionId} closed`);
        }
      };
      
      const server = new Server(
        { name: 'atlassian-mcp', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );
      
      // Register tools/list handler
      server.setRequestHandler('tools/list', async () => {
        return {
          tools: allTools.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }))
        };
      });

      // Register tools/call handler
      server.setRequestHandler('tools/call', async (request) => {
        const { name, arguments: args } = request.params;
        
        // Find the tool
        const tool = allTools.find(t => t.name === name);
        if (!tool) {
          throw new Error(`Tool ${name} not found`);
        }

        try {
          // Call the tool handler
          const result = await tool.handler(args || {});
          
          return {
            content: [
              {
                type: 'text',
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
              }
            ]
          };
        } catch (error) {
          console.error(`Error executing tool ${name}:`, error);
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${error.message}`
              }
            ],
            isError: true
          };
        }
      });
      
      // Handle errors
      server.onerror = (error) => {
        console.error('[MCP Error]', error);
      };

      // Connect to the MCP server
      await server.connect(transport);
    } else {
      // Invalid request
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
      return;
    }

    // Handle the request
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  // Reusable handler for GET and DELETE requests
  const handleSessionRequest = async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = transports[sessionId];
    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error('Error handling session request:', error);
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      }
    }
  };

  // Handle GET requests for server-to-client notifications via SSE
  app.get('/mcp', handleSessionRequest);

  // Handle DELETE requests for session termination
  app.delete('/mcp', handleSessionRequest);

  // Add a simple health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      server: 'atlassian-mcp',
      version: '1.0.0'
    });
  });

  // Return the configured app
  return app;
}

export function startHttpServer(port = 3000) {
  const app = createHttpServer();
  const server = app.listen(port, () => {
    console.error(`🌐 MCP HTTP server running at http://localhost:${port}`);
    console.error(`Health check available at http://localhost:${port}/health`);
  });

  // Handle graceful shutdown
  const shutdown = () => {
    console.error('Shutting down HTTP server...');
    server.close(() => {
      console.error('HTTP server closed');
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}
