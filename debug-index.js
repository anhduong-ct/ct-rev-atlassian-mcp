#!/usr/bin/env node

/**
 * Debug Index File for Atlassian MCP Tools
 * 
 * This file allows you to test all MCP tools locally with Node.js
 * Usage: node debug-index.js [tool-name] [args-json]
 * 
 * Examples:
 * node debug-index.js list                                    # List all available tools
 * node debug-index.js test_jira_configuration                 # Test Jira config
 * node debug-index.js get_sprint_info                         # Get current sprint info
 * node debug-index.js get_ticket_info '{"ticketId":"CRE-1234"}' # Get ticket details
 * node debug-index.js analyze_cppf '{"cppf_id":"CPPF-1234"}'  # Analyze CPPF ticket
 */

import readline from 'readline';
import { config, validateConfig } from './src/config.js';

// Import all tool modules
import sprintDetectionTools from './src/tools/sprintTools.js';
import communicationTools from './src/tools/communication.js';
import refactoredSprintTools from './src/tools/refactored/sprint.js';
import refactoredConfluenceSprintTools from './src/tools/refactored/confluenceSprint.js';
import refactoredTicketHierarchyTools from './src/tools/refactored/ticketHierarchy.js';
import refactoredCPPFTools from './src/tools/refactored/cppf.js';
import prdContentTools from './src/tools/refactored/prdContent.js';

import creTools from './src/tools/cre.js';
import debugTools from './src/tools/debug.js';
import ticketManagementTools from './src/tools/ticketManagement.js';

class DebugMCPTools {
  constructor() {
    console.log('🚀 Initializing Atlassian MCP Debug Environment...\n');
    
    // Validate configuration
    if (!validateConfig()) {
      console.error('❌ Invalid configuration. Please check your .env file or environment variables.');
      console.error('   Make sure you have JIRA_API_TOKEN, JIRA_EMAIL, and JIRA_BASE_URL set.');
      process.exit(1);
    }
    
    console.log('✅ Configuration validated successfully');
    console.log(`📧 Jira User: ${config.jira.email}`);
    console.log(`🏢 Jira Base URL: ${config.jira.baseUrl}`);
    console.log(`👤 User Role: ${config.user.role}\n`);
    
    // Collect all tools (same filtering logic as main index.js)
    this.allTools = this.collectAllTools();
    
    console.log(`🔧 Loaded ${this.allTools.length} tools total\n`);
  }
  
  collectAllTools() {
    // Filter out redundant tools (same logic as main index.js)
    const essentialSprintDetectionTools = sprintDetectionTools?.filter(tool => 
      !['get_current_sprint', 'get_previous_sprint', 'get_next_sprint', 'get_sprint_context', 'refresh_sprint_detection'].includes(tool.name)
    ) || [];
    
    const essentialRefactoredSprintTools = refactoredSprintTools?.filter(tool =>
      !['parse_sprint_file'].includes(tool.name)
    ) || [];
    
    const essentialRefactoredCPPFTools = refactoredCPPFTools?.filter(tool =>
      !['get_cppf_confluence_docs'].includes(tool.name)
    ) || [];
    
    const essentialCreTools = creTools?.filter(tool => 
      !['get_cre_details', 'get_parent_cre_story', 'get_cppf_from_cre_story', 'get_task_hierarchy_and_cppf'].includes(tool.name)
    ) || [];
    
    const essentialTicketHierarchyTools = refactoredTicketHierarchyTools?.filter(tool =>
      tool.name === 'get_ticket_hierarchy' || tool.name === 'get_ticket_info'
    ) || [];
    
    // Collect all tools
    return [
      ...(debugTools || []),
      ...(essentialRefactoredSprintTools || []),
      ...(refactoredConfluenceSprintTools || []),
      ...(essentialTicketHierarchyTools || []),
      ...(essentialRefactoredCPPFTools || []),
      ...(essentialSprintDetectionTools || []),
      ...(communicationTools || []),
      ...(essentialCreTools || []),
      ...(ticketManagementTools || []),
      ...(prdContentTools || []),
    ];
  }
  
  listTools() {
    console.log('📋 Available Tools:\n');
    
    // Group tools by category for better readability
    const categories = {
      'Debug & Configuration': [],
      'Sprint Management': [],
      'Ticket Management': [],
      'CPPF Analysis': [],
      'CRE Management': [],
      'Communication': [],
      'Other': []
    };
    
    this.allTools.forEach(tool => {
      const name = tool.name;
      if (name.includes('debug') || name.includes('test') || name.includes('discover')) {
        categories['Debug & Configuration'].push(tool);
      } else if (name.includes('sprint')) {
        categories['Sprint Management'].push(tool);
      } else if (name.includes('ticket') || name.includes('hierarchy')) {
        categories['Ticket Management'].push(tool);
      } else if (name.includes('cppf') || name.includes('analyze')) {
        categories['CPPF Analysis'].push(tool);
      } else if (name.includes('cre')) {
        categories['CRE Management'].push(tool);
      } else if (name.includes('comment') || name.includes('progress')) {
        categories['Communication'].push(tool);
      } else {
        categories['Other'].push(tool);
      }
    });
    
    Object.entries(categories).forEach(([category, tools]) => {
      if (tools.length > 0) {
        console.log(`\n🏷️  ${category}:`);
        tools.forEach(tool => {
          console.log(`   • ${tool.name} - ${tool.description}`);
        });
      }
    });
    
    console.log(`\n📊 Total: ${this.allTools.length} tools available\n`);
  }
  
  async runTool(toolName, args = {}) {
    const tool = this.allTools.find(t => t.name === toolName);
    
    if (!tool) {
      console.error(`❌ Tool '${toolName}' not found`);
      console.log('\n💡 Available tools:');
      this.allTools.forEach(t => console.log(`   • ${t.name}`));
      return;
    }
    
    console.log(`🔧 Running tool: ${toolName}`);
    console.log(`📝 Description: ${tool.description}`);
    
    if (Object.keys(args).length > 0) {
      console.log(`📄 Arguments: ${JSON.stringify(args, null, 2)}`);
    }
    
    console.log('\n⏳ Executing...\n');
    
    try {
      const startTime = Date.now();
      const result = await tool.handler(args);
      const endTime = Date.now();
      
      console.log(`✅ Tool executed successfully in ${endTime - startTime}ms\n`);
      console.log('📋 Result:');
      console.log('=' .repeat(50));
      
      if (typeof result === 'string') {
        console.log(result);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
      
      console.log('=' .repeat(50));
      
    } catch (error) {
      console.error(`❌ Tool execution failed:`);
      console.error(`   Error: ${error.message}`);
      if (error.stack) {
        console.error(`   Stack: ${error.stack}`);
      }
    }
  }
  
  async interactiveMode() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('🎯 Interactive Mode - Enter tool names to execute them');
    console.log('💡 Commands:');
    console.log('   • list - Show all available tools');
    console.log('   • ticket-examples - Show ticket management examples');
    console.log('   • exit - Exit interactive mode');
    console.log('   • help - Show this help message');
    console.log('   • <tool-name> - Execute a tool (will prompt for arguments)\n');
    
    const askQuestion = (question) => {
      return new Promise((resolve) => {
        rl.question(question, resolve);
      });
    };
    
    while (true) {
      const input = await askQuestion('🔧 Tool> ');
      const command = input.trim();
      
      if (!command) continue;
      
      if (command === 'exit') {
        console.log('👋 Goodbye!');
        break;
      }
      
      if (command === 'list') {
        this.listTools();
        continue;
      }

      if (command === 'ticket-examples') {
        console.log('\n🎫 Ticket Management Examples:');
        console.log('=' .repeat(50));
        
        const examples = [
          {
            action: 'list_tickets',
            description: 'List your current tickets',
            example: '{"action":"list_tickets","filter_assignee":"currentUser"}'
          },
          {
            action: 'find_missing_fields',
            description: 'Find tickets missing DoS/TDoS/Story Points',
            example: '{"action":"find_missing_fields","filter_assignee":"currentUser"}'
          },
          {
            action: 'update_fields',
            description: 'Update Date on Staging and Story Points',
            example: '{"action":"update_fields","ticket_id":"CRE-1234","date_on_staging":"2025-07-05","story_points":3}'
          },
          {
            action: 'update_assignment',
            description: 'Change status and assignee (smart workflow transitions)',
            example: '{"action":"update_assignment","ticket_id":"CRE-1234","status":"On staging","assignee":"Thuan Ly Minh"}'
          },
          {
            action: 'bulk_move_sprint',
            description: 'Move tickets between sprints',
            example: '{"action":"bulk_move_sprint","ticket_ids":["CRE-1234","CRE-1235"],"target_sprint":"Revenue 25.26"}'
          }
        ];

        examples.forEach((ex, i) => {
          console.log(`\n${i + 1}. ${ex.description}:`);
          console.log(`   ${ex.example}`);
        });

        console.log('\n💡 To use: Type "ticket_management" and paste one of the examples above.\n');
        continue;
      }
      
      if (command === 'help') {
        console.log('💡 Commands:');
        console.log('   • list - Show all available tools');
        console.log('   • ticket-examples - Show ticket management examples');
        console.log('   • exit - Exit interactive mode');
        console.log('   • help - Show this help message');
        console.log('   • <tool-name> - Execute a tool (will prompt for arguments)\n');
        continue;
      }
      
      // Check if it's a valid tool
      const tool = this.allTools.find(t => t.name === command);
      if (!tool) {
        console.log(`❌ Tool '${command}' not found. Type 'list' to see available tools.\n`);
        continue;
      }
      
      // Check if tool requires arguments
      let args = {};
      if (tool.inputSchema && tool.inputSchema.properties && Object.keys(tool.inputSchema.properties).length > 0) {
        console.log(`📝 Tool '${command}' accepts the following parameters:`);
        Object.entries(tool.inputSchema.properties).forEach(([key, schema]) => {
          const required = tool.inputSchema.required?.includes(key) ? ' (required)' : ' (optional)';
          console.log(`   • ${key}: ${schema.description || 'No description'}${required}`);
        });
        
        const argsInput = await askQuestion('📄 Enter arguments as JSON (or press Enter for empty): ');
        if (argsInput.trim()) {
          try {
            args = JSON.parse(argsInput);
          } catch (error) {
            console.log(`❌ Invalid JSON: ${error.message}\n`);
            continue;
          }
        }
      }
      
      await this.runTool(command, args);
      console.log('\n');
    }
    
    rl.close();
  }
  
  // Quick test commands for common scenarios
  async quickTests() {
    console.log('🧪 Running Quick Tests...\n');
    
    const tests = [
      {
        name: 'Configuration Test',
        tool: 'test_jira_configuration',
        args: {}
      },
      {
        name: 'Sprint Info Test',
        tool: 'get_sprint_info',
        args: {}
      },
      {
        name: 'Custom Fields Discovery',
        tool: 'discover_custom_fields',
        args: {}
      }
    ];
    
    for (const test of tests) {
      console.log(`\n🧪 ${test.name}:`);
      console.log('-'.repeat(30));
      await this.runTool(test.tool, test.args);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause between tests
    }
  }

  // Test ticket management scenarios
  async testTicketManagement() {
    console.log('🎫 Testing Ticket Management Scenarios...\n');
    
    const scenarios = [
      {
        name: '📋 List My Current Tickets',
        tool: 'ticket_management',
        args: {
          action: 'list_tickets',
          filter_assignee: 'currentUser',
          sort_by: 'updated'
        }
      },
      {
        name: '🔍 Find Tickets Missing Fields',
        tool: 'ticket_management',
        args: {
          action: 'find_missing_fields',
          filter_assignee: 'currentUser'
        }
      },
      {
        name: '📋 List Tickets by Date on Staging',
        tool: 'ticket_management',
        args: {
          action: 'list_tickets',
          filter_assignee: 'currentUser',
          sort_by: 'date_on_staging'
        }
      },
      {
        name: '📋 List In Progress Tickets',
        tool: 'ticket_management',
        args: {
          action: 'list_tickets',
          filter_assignee: 'currentUser',
          filter_status: 'In Progress'
        }
      }
    ];

    console.log('⚠️  Note: The following scenarios require a valid ticket ID:');
    console.log('   • Update ticket fields (DoS, TDoS, Story Points)');
    console.log('   • Update assignment (status + assignee)');
    console.log('   • Bulk move tickets between sprints');
    console.log('   Replace "CRE-XXXX" with actual ticket IDs for testing.\n');
    
    for (const scenario of scenarios) {
      console.log(`\n🧪 ${scenario.name}:`);
      console.log('-'.repeat(50));
      await this.runTool(scenario.tool, scenario.args);
      await new Promise(resolve => setTimeout(resolve, 1500)); // Brief pause between tests
    }

    // Show example commands for scenarios requiring ticket IDs
    console.log('\n📝 Example Commands for Ticket-Specific Operations:');
    console.log('=' .repeat(60));
    
    const examples = [
      {
        title: '1️⃣  Update Date on Staging and Story Points',
        command: 'node debug-index.js ticket_management',
        args: '\'{"action":"update_fields","ticket_id":"CRE-1234","date_on_staging":"2025-07-05","story_points":3}\''
      },
      {
        title: '2️⃣  Update Status and Assignee (after implementation - smart workflow)',
        command: 'node debug-index.js ticket_management',
        args: '\'{"action":"update_assignment","ticket_id":"CRE-1234","status":"On staging","assignee":"Thuan Ly Minh"}\''
      },
      {
        title: '3️⃣  Bulk Move Tickets to New Sprint',
        command: 'node debug-index.js ticket_management',
        args: '\'{"action":"bulk_move_sprint","ticket_ids":["CRE-1234","CRE-1235"],"target_sprint":"Revenue 25.26"}\''
      },
      {
        title: '4️⃣  Update Test Done on Staging',
        command: 'node debug-index.js ticket_management',
        args: '\'{"action":"update_fields","ticket_id":"CRE-1234","test_done_staging":"2025-07-08"}\''
      },
      {
        title: '5️⃣  Update Multiple Fields at Once',
        command: 'node debug-index.js ticket_management',
        args: '\'{"action":"update_fields","ticket_id":"CRE-1234","date_on_staging":"2025-07-05","test_done_staging":"2025-07-08","story_points":5}\''
      }
    ];

    examples.forEach(example => {
      console.log(`\n${example.title}:`);
      console.log(`${example.command} ${example.args}`);
    });

    console.log('\n💡 Interactive Testing:');
    console.log('   You can also run: node debug-index.js');
    console.log('   Then type: ticket_management');
    console.log('   And follow the prompts to enter arguments interactively.');
  }
}

// Main execution logic
async function main() {
  const debug = new DebugMCPTools();
  
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // No arguments - show help and enter interactive mode
    console.log('🎯 Atlassian MCP Debug Tool');
    console.log('=' .repeat(50));
    debug.listTools();
    
    console.log('💡 Usage Options:');
    console.log('   node debug-index.js                              # Interactive mode');
    console.log('   node debug-index.js list                         # List all tools');
    console.log('   node debug-index.js quick-test                   # Run quick tests');
    console.log('   node debug-index.js ticket-test                  # Test ticket management scenarios');
    console.log('   node debug-index.js <tool-name>                  # Run specific tool');
    console.log('   node debug-index.js <tool-name> \'{"arg":"value"}\'  # Run tool with args\n');
    
    await debug.interactiveMode();
    return;
  }
  
  const [command, argsJson] = args;
  
  if (command === 'list') {
    debug.listTools();
    return;
  }
  
  if (command === 'quick-test') {
    await debug.quickTests();
    return;
  }

  if (command === 'ticket-test') {
    await debug.testTicketManagement();
    return;
  }
  
  // Parse arguments if provided
  let toolArgs = {};
  if (argsJson) {
    try {
      toolArgs = JSON.parse(argsJson);
    } catch (error) {
      console.error(`❌ Invalid JSON arguments: ${error.message}`);
      process.exit(1);
    }
  }
  
  // Run the specified tool
  await debug.runTool(command, toolArgs);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the main function
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
