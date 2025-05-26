#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { config, validateConfig, autoDetectSprint } from './config.js';

// Import all tools
import sprintTools from './tools/sprint.js';
import sprintDetectionTools from './tools/sprintTools.js';
import confluenceSprintTools from './tools/confluenceSprint.js';
import cppfTools from './tools/cppf.js';
import creTools from './tools/cre.js';
import intelligenceTools from './tools/intelligence.js';
import communicationTools from './tools/communication.js';

class AtlassianMCPServer {
  constructor() {
    // Validate configuration
    if (!validateConfig()) {
      console.error('Invalid configuration. Please check your .env file or environment variables.');
      process.exit(1);
    }

    this.server = new Server(
      { name: 'atlassian-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    
    // Collect all tools
    this.allTools = [
      ...sprintTools,
      ...sprintDetectionTools,
      ...confluenceSprintTools,
      ...cppfTools,
      ...creTools,
      ...intelligenceTools,
      ...communicationTools
    ];
    
    console.error(`Found ${this.allTools.length} tools to register`);
    console.error(`User role: ${config.user.role}`);
    
    this.setupHandlers();
    this.start();
  }
  
  setupHandlers() {
    // Register tools/list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.allTools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      };
    });

    // Register tools/call handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      // Find the tool
      const tool = this.allTools.find(t => t.name === name);
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
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };
  }
  
  async start() {
    try {
      // Auto-detect sprint before starting server
      const detectedSprint = await autoDetectSprint();
      console.error(`Current sprint: ${detectedSprint || config.user.currentSprint || 'Unknown'}`);
      
      const transport = new StdioServerTransport();
      
      // Add transport error listeners
      transport.onerror = (error) => {
        console.error('Transport error:', error);
      };

      transport.onclose = () => {
        console.error('Transport closed');
      };

      this.server.connect(transport);
      console.error('🚀 Atlassian MCP Server connected and ready!');

      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.error('Shutting down server...');
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        console.error('Shutting down server...');
        process.exit(0);
      });

    } catch (error) {
      console.error('Error starting server:', error);
      process.exit(1);
    }
  }
}

// Create instance immediately
console.error('🔧 Initializing Atlassian MCP server...');
new AtlassianMCPServer();