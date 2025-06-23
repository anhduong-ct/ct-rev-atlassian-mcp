#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { config, validateConfig, autoDetectSprint } from './config.js';
import { startHttpServer } from './server/http.js';

// Import original tools that we're keeping
import sprintDetectionTools from './tools/sprintTools.js';
import communicationTools from './tools/communication.js';

// Import refactored tools
import refactoredSprintTools from './tools/refactored/sprint.js';
import refactoredConfluenceSprintTools from './tools/refactored/confluenceSprint.js';
import refactoredTicketHierarchyTools from './tools/refactored/ticketHierarchy.js';
import refactoredCPPFTools from './tools/refactored/cppf.js';

// Continue to import original tools for backward compatibility
// These would be phased out gradually
import creTools from './tools/cre.js';
import debugTools from './tools/debug.js';

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
    
    // Filter out redundant tools from sprintDetectionTools
    const essentialSprintDetectionTools = sprintDetectionTools.filter(tool => 
      !['get_current_sprint', 'get_previous_sprint', 'get_next_sprint', 'get_sprint_context', 'refresh_sprint_detection'].includes(tool.name)
    );
    
    // Filter out redundant tools from refactoredSprintTools  
    const essentialRefactoredSprintTools = refactoredSprintTools.filter(tool =>
      !['parse_sprint_file'].includes(tool.name)
    );
    
    // Filter out redundant tools from refactoredCPPFTools
    const essentialRefactoredCPPFTools = refactoredCPPFTools.filter(tool =>
      !['get_cppf_confluence_docs'].includes(tool.name)
    );
    
    // Filter out redundant tools from creTools
    const essentialCreTools = creTools.filter(tool => 
      !['get_cre_details', 'get_parent_cre_story', 'get_cppf_from_cre_story', 'get_task_hierarchy_and_cppf'].includes(tool.name)
    );
    
    // Filter out redundant tools from refactoredTicketHierarchyTools
    const essentialTicketHierarchyTools = refactoredTicketHierarchyTools.filter(tool =>
      tool.name === 'get_ticket_hierarchy' || tool.name === 'get_ticket_info'
    );
    
    // Debug: Check if any tool arrays are undefined
    console.error('Debug: Checking tool arrays...');
    console.error('essentialRefactoredSprintTools:', essentialRefactoredSprintTools?.length || 'undefined');
    console.error('refactoredConfluenceSprintTools:', refactoredConfluenceSprintTools?.length || 'undefined');
    console.error('essentialTicketHierarchyTools:', essentialTicketHierarchyTools?.length || 'undefined');
    console.error('essentialRefactoredCPPFTools:', essentialRefactoredCPPFTools?.length || 'undefined');
    console.error('essentialSprintDetectionTools:', essentialSprintDetectionTools?.length || 'undefined');
    console.error('communicationTools:', communicationTools?.length || 'undefined');
    console.error('essentialCreTools:', essentialCreTools?.length || 'undefined');
    
    // Collect all tools (Essential tools for internal team - 11 total)
    this.allTools = [
      ...(debugTools || []),                            // discover_custom_fields, test_jira_configuration
      ...(essentialRefactoredSprintTools || []),        // get_sprint_assignments, get_sprint_info
      ...(refactoredConfluenceSprintTools || []),       // get_sprint_planning  
      ...(essentialTicketHierarchyTools || []),         // get_ticket_info, get_ticket_hierarchy
      ...(essentialRefactoredCPPFTools || []),          // analyze_cppf
      ...(essentialSprintDetectionTools || []),         // (none after filtering)
      ...(communicationTools || []),                    // add_progress_comment
      ...(essentialCreTools || [])                      // create_cre_story_from_cppf, create_cre_tasks_for_story, get_my_cre_stories, update_cre_task_status
    ];
    
    console.error(`Found ${this.allTools.length} essential tools to register`);
    console.error(`User role: ${config.user.role}`);
    
    this.setupHandlers();
    this.start();
  }

  setupHandlers() {
    // Register tools/list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.error('Handling list_tools request');
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
      
      // Check if we should start in HTTP mode
      const useHttp = process.argv.includes('--http') || config.server.mode === 'http';
      const httpPort = parseInt(config.server.port || '3000', 10);
      
      if (useHttp) {
        // Start HTTP server
        console.error(`Starting HTTP server on ${config.server.host}:${httpPort}...`);
        startHttpServer(httpPort);
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
          console.error('Shutting down server...');
          process.exit(0);
        });

        process.on('SIGTERM', () => {
          console.error('Shutting down server...');
          process.exit(0);
        });
      } else {
        // Start stdio server
        console.error('Starting MCP server in stdio mode');
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
      }
    } catch (error) {
      console.error('Error starting server:', error);
      process.exit(1);
    }
  }
}

// Create instance immediately
console.error('🔧 Initializing Atlassian MCP server with refactored tools...');
new AtlassianMCPServer();
