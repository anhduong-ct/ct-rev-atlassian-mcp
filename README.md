# Atlassian MCP Server

A Model Context Protocol (MCP) server for Atlassian integration that helps engineers manage their CPPF → CRE workflow.

## Overview

This MCP server provides tools for:
- Sprint planning and management
- CPPF ticket analysis
- CRE story and task creation
- Task prioritization and recommendations
- Status reporting and communication

## Installation

1. Clone the repository:
```bash
git clone https://github.com/your-org/atlassian-mcp.git
cd atlassian-mcp
```

2. Install dependencies:
```bash
pnpm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Edit the `.env` file with your Atlassian credentials and configuration.

## Configuration

### Using VS Code Input System (Recommended)

When using the MCP server with VS Code, you can configure it to prompt for credentials using VS Code's secure input system. The server is configured to ask for the following inputs:

1. Atlassian account email
2. Atlassian API token 
3. Atlassian user account ID

These credentials are securely stored by VS Code and automatically passed to the MCP server as environment variables. This is the simplest and most secure way to use the MCP server.

### Using Environment Variables

Alternatively, you can set the following environment variables:

- `JIRA_EMAIL`: Your Atlassian account email
- `JIRA_API_TOKEN`: Your Atlassian API token (create at https://id.atlassian.com/manage-profile/security/api-tokens)
- `USER_ACCOUNT_ID`: Your Atlassian account ID

Additional configuration options:
- `JIRA_HOST`: Your Atlassian instance hostname (default: company.atlassian.net)
- `JIRA_CPPF_PROJECT`: CPPF project key (default: CPPF)
- `JIRA_CRE_PROJECT`: CRE project key (default: CRE)
- `CONFLUENCE_HOST`: Your Confluence instance hostname (default: company.atlassian.net)
- `CONFLUENCE_SPACES`: Comma-separated list of Confluence spaces to search (default: PROD,ENG,DESIGN)
- `SPRINT_PLANNING_SPACE`: Confluence space for sprint planning files (default: ~629041681a437e007044041e)
- `USER_ROLE`: Your engineering role (web, backend, app, ios, fullstack) (default: fullstack)
- `CURRENT_SPRINT`: Current sprint name (default: Sprint 24)
- `PLATFORMS`: Comma-separated list of platforms (default: web,backend,app,ios)
- `MCP_SERVER_MODE`: Server transport mode (stdio or http) (default: stdio)
- `MCP_HTTP_PORT`: HTTP server port when using http mode (default: 3000)
- `MCP_HTTP_HOST`: HTTP server host when using http mode (default: localhost)

## Usage

### Using with VS Code (Recommended)

The MCP server can be directly used with VS Code's MCP integration:

1. Open VS Code in the project directory
2. VS Code will detect the `.vscode/modelcontextprotocol.json` configuration
3. When connecting to the server for the first time, VS Code will prompt for your Atlassian credentials
4. The credentials are securely stored by VS Code and automatically passed to the server

### Manual Startup

The MCP server can be started manually in two different modes:

#### Stdio Transport Mode (Default)

This mode uses standard input/output for communication, making it compatible with the MCP Inspector and other tools that connect via stdio:

```bash
pnpm start
```

#### HTTP Transport Mode

This mode exposes an HTTP endpoint for communication, allowing direct integration with web applications or API clients:

```bash
pnpm http
```

By default, the HTTP server runs on port 3000. You can configure this by setting the `MCP_HTTP_PORT` environment variable.

To use the HTTP transport in development mode:

```bash
pnpm http:dev
```

#### HTTP Endpoints

- `POST /mcp`: Main MCP communication endpoint
- `GET /mcp`: Server-to-client notifications endpoint (SSE)
- `DELETE /mcp`: Session termination
- `GET /health`: Simple health check endpoint

#### Server Configuration

You can configure the server mode via:

- Command line: Use `--http` flag
- Environment variable: Set `MCP_SERVER_MODE=http`
- .env file: Set `MCP_SERVER_MODE=http`

## Build and Deploy

To build the project for deployment to the MCP host:

```bash
pnpm build
```

This will create optimized production files in the `dist` directory. 

### Using in MCP Host

After building, the build files can be used directly in the MCP host without requiring a running server. This allows for:

1. **Direct Integration**: The MCP host can load the build files directly
2. **Improved Performance**: Optimized build has better performance
3. **Simplified Deployment**: No need to maintain a separate server instance

To deploy to the MCP host, follow these steps:

1. Build the project as described above
2. Copy or upload the contents of the `dist` directory to your MCP host
3. Configure the MCP host to use the uploaded files

For more information on MCP host configuration, consult the MCP host documentation.

## Available Tools

> **Note:** The tools have been refactored to improve usability and reduce redundancy. The consolidated tools provide more flexible and powerful functionality than their predecessors.

### Sprint Management Tools

- `get_sprint_assignments`: Get sprint assignments with flexible filtering options (by user, team, status, or platform)
  - Replaces previous `get_my_sprint_assignments` and `get_sprint_overview` tools
- `parse_sprint_file`: Parse sprint assignment data
- `get_sprint_context`: Get comprehensive information about current, previous, and next sprints
- `get_current_sprint`: Get information about the active sprint
- `get_previous_sprint`: Get information about the last completed sprint
- `get_next_sprint`: Get information about the upcoming sprint
- `refresh_sprint_detection`: Manually update sprint detection configuration

### Confluence Sprint Planning Tools

- `find_latest_sprint_planning_file`: Find the latest sprint planning Confluence file in a specific space
- `get_confluence_sprint_assignments`: Extract assignments from Confluence sprint planning content with flexible filtering
  - Replaces previous `extract_assigned_tasks` and `get_engineer_assignments_from_confluence` tools

### CPPF Analysis Tools

- `analyze_cppf`: Comprehensive CPPF analysis with role-specific requirements and documentation
  - Replaces previous `get_cppf_details`, `analyze_cppf_for_role`, and `get_cppf_confluence_docs` tools

### CRE Management Tools

- `create_cre_story_from_cppf`: Create CRE story with linking
- `create_cre_tasks_for_story`: Create platform tasks
- `get_my_cre_stories`: Get user's current CRE stories
- `update_cre_task_status`: Update task status
- `get_ticket_hierarchy`: Navigate ticket hierarchy in any direction (task → story → CPPF)
  - Replaces previous `get_parent_cre_story`, `get_cppf_from_cre_story`, and `get_task_hierarchy_and_cppf` tools

### Intelligence Tools

- `get_task_priorities`: Get prioritized task list
- `suggest_next_task`: AI-powered task recommendation

### Communication Tools

- `add_progress_comment`: Add progress comments

## Example Workflows

### Create CRE story from CPPF ticket

```text
"Create CRE story for CPPF-1376"
```

### Get role-specific requirements

```text
"What backend work is needed for CPPF-1376?"
```

### Update task status

```text
"Update task CRE-1234 status to In Progress and add progress note"
```

### Get ticket hierarchy information

```text
"Show me the hierarchy for task CRE-1234"
"Get parent story and CPPF details for task CRE-1234"
"Show ticket relationships for CPPF-5678"
```

### Get sprint assignments with filtering

```text
"Show me all tasks assigned to me in the current sprint"
"List all in-progress tasks for the web platform"
"Show tasks assigned to AnhD grouped by status"
```

### Get Confluence sprint assignments

```text
"Find the latest sprint planning file and show all assignments"
"In latest sprint planning file, list all assigned tasks of AnhD"
"Extract assigned tasks from this Confluence page content for John Smith"
```

### Comprehensive CPPF analysis

```text
"Analyze CPPF-1234 for web development"
"What are the requirements for CPPF-5678 from a backend perspective?"
"Show me all details and documentation for CPPF-9012"
```

### Sprint context management

```text
"Show me information about the current sprint"
"When did the previous sprint end?"
"What's planned for the next sprint?"
"Get comprehensive sprint context information"
"Refresh sprint detection for the current project"
```

## Troubleshooting

If you encounter issues:
1. Check your `.env` configuration
2. Ensure your Atlassian API token is valid
3. Verify your account has access to the CPPF and CRE projects
4. Check the console output for error messages

## License

MIT 