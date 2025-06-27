# Atlassian MCP Server

A Model Context Protocol (MCP) server for Atlassian integration that helps engineers manage their CPPF → CRE workflow through AI assistants.

## Overview

This MCP server provides AI assistants with direct access to Atlassian (Jira/Confluence) APIs for engineering workflow automation:

- **Sprint Planning**: Analyze Confluence sprint planning documents
- **CPPF Analysis**: Extract requirements and complexity from CPPF tickets  
- **CRE Workflow**: Create stories and tasks across platforms (web, backend, app, iOS)
- **Task Management**: Update status, add comments, track progress
- **Ticket Navigation**: Navigate full hierarchy (Task → Story → CPPF)

## Quick Start

### Prerequisites
- Node.js (version 16+)
- Valid Atlassian account with CPPF/CRE project access

### Setup (4 Simple Steps)

1. **Get Atlassian API Token**
   - Go to [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
   - Create token with label "MCP Server"
   - Save the token immediately

2. **Get Your Account ID**
   - Visit: https://701search.atlassian.net/rest/api/3/myself
   - Copy your `accountId` from the response

3. **Clone Repository**
   ```bash
   git clone https://github.com/anhduong-ct/ct-rev-atlassian-mcp
   cd ct-rev-atlassian-mcp
   # dist/index.js is pre-built and ready to use!
   ```

4. **Configure Your MCP Client**
   
   **For VS Code/Cursor** - Add to `~/.cursor/mcp.json`:
   ```json
   {
     "mcpServers": {
       "Atlassian MCP": {
         "type": "stdio",
         "command": "node",
         "args": ["/path/to/ct-rev-atlassian-mcp/dist/index.js"],
         "env": {
           "JIRA_EMAIL": "${input:jira-email}",
           "JIRA_API_TOKEN": "${input:jira-api-token}",
           "USER_ACCOUNT_ID": "${input:user-account-id}",
           "JIRA_HOST": "https://701search.atlassian.net",
           "USER_ROLE": "web",
           "MCP_SERVER_MODE": "stdio"
         }
       }
     },
     "inputs": [
       {
         "id": "jira-email",
         "type": "promptString",
         "description": "Jira Email",
         "password": false
       },
       {
         "id": "jira-api-token",
         "type": "promptString",
         "description": "Jira API Token",
         "password": true
       },
       {
         "id": "user-account-id",
         "type": "promptString",
         "description": "Jira User Account ID",
         "password": false
       }
     ]
   }
   ```

   **For Claude Desktop** - Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "atlassian": {
         "command": "node",
         "args": ["/path/to/ct-rev-atlassian-mcp/dist/index.js"],
         "env": {
           "JIRA_EMAIL": "your.email@company.com",
           "JIRA_API_TOKEN": "your_token_here",
           "USER_ACCOUNT_ID": "your_account_id_here",
           "JIRA_HOST": "https://701search.atlassian.net",
           "USER_ROLE": "web"
         }
       }
     }
   }
   ```

That's it! Your AI assistant now has access to all Atlassian tools.

## Available Tools (13 Total)

### Core Workflow Tools
- `get_sprint_assignments` - Get filtered sprint assignments by user/status/platform
- `get_sprint_info` - Current sprint context and assignments  
- `get_sprint_planning` - Raw Confluence sprint planning content
- `analyze_cppf` - Comprehensive CPPF analysis with role-specific requirements
- `get_ticket_hierarchy` - Navigate ticket relationships (Task → Story → CPPF)
- `get_ticket_info` - Complete ticket information with hierarchy
- `get_prd_content` - Get raw PRD content from CPPF tickets for analysis
- `search_prd_content` - Search for PRD content across Confluence spaces

### CRE Management Tools
- `create_cre_story_from_cppf` - Create properly linked CRE stories
- `create_cre_tasks_for_story` - Generate platform-specific tasks
- `get_my_cre_stories` - Get your current CRE stories
- `update_cre_task_status` - Update task status

### Utility Tools
- `add_progress_comment` - Add progress comments to tickets
- `discover_custom_fields` - Discover available Jira custom fields
- `test_jira_configuration` - Test Atlassian connectivity

## Example Usage

Ask your AI assistant natural language questions:

### Sprint Planning
- "What tasks are assigned to me in the current sprint?"
- "Show me all in-progress web platform tasks"
- "Get the latest sprint planning assignments"

### CPPF Analysis  
- "Analyze CPPF-1234 for web development requirements"
- "What's the complexity of CPPF-5678 for backend work?"
- "Show me all documentation for CPPF-9012"

### PRD Content Analysis
- "Get PRD content for CPPF-1396"
- "Show me the requirements document for CPPF-1234"
- "Search for PRD documents related to promotion vouchers"

### CRE Workflow
- "Create a CRE story for CPPF-1376" 
- "Generate platform tasks for story CRE-2345"
- "Update CRE-1234 status to In Progress"

### Ticket Navigation
- "Show me the hierarchy for task CRE-1234"
- "What CPPF is linked to this story?"
- "Get full ticket relationships for CPPF-5678"

## Configuration Options

The MCP client configuration supports these environment variables:

**Required:**
- `JIRA_EMAIL` - Your Atlassian email
- `JIRA_API_TOKEN` - API token from step 1
- `USER_ACCOUNT_ID` - Account ID from step 2
- `JIRA_HOST` - Set to `https://701search.atlassian.net`

**Optional:**
- `USER_ROLE` - Your role: `web`, `backend`, `app`, `ios`, `fullstack` (default: `fullstack`)
- `CURRENT_SPRINT` - Sprint name (auto-detected if not specified)
- `JIRA_CPPF_PROJECT` - CPPF project key (default: `CPPF`)
- `JIRA_CRE_PROJECT` - CRE project key (default: `CRE`)

## For Contributors

If you need to modify the server code:

```bash
# Clone and setup development environment
git clone https://github.com/anhduong-ct/ct-rev-atlassian-mcp
cd ct-rev-atlassian-mcp

# Install dependencies
pnpm install

# Make changes to src/ files

# Build to update dist/index.js
pnpm build
```

The main difference is you'll need to run `pnpm build` after making changes to update the `dist/index.js` file.

## Troubleshooting

**Authentication Issues:**
- Double-check your API token and account ID
- Ensure your account has CPPF/CRE project access

**File Path Issues:**
- Verify the path to `dist/index.js` in your MCP configuration
- Make sure the repository is cloned and file exists

**Permission Issues:**
- Check your Atlassian account permissions
- Verify API token has sufficient access

## Architecture

- **Transport**: Stdio mode (recommended) for MCP client integration
- **Authentication**: Atlassian API tokens with proper access controls
- **Data Sources**: Jira tickets, Confluence pages, sprint planning documents  
- **Platforms**: Supports web, backend, app, iOS cross-platform coordination

## License

MIT 