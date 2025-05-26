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

The following environment variables are required:

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

## Usage

Start the MCP server locally:

```bash
pnpm start
```

The server will start and listen for MCP requests.

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

### Sprint Management Tools
- `get_my_sprint_assignments`: Get assigned CPPF tickets for current user
- `get_sprint_overview`: Full sprint status across team
- `parse_sprint_file`: Parse sprint assignment data

### Confluence Sprint Planning Tools
- `find_latest_sprint_planning_file`: Find the latest sprint planning Confluence file in a specific space
- `extract_assigned_tasks`: Extract assigned tasks from Confluence sprint planning content
- `get_engineer_assignments_from_confluence`: Get tasks assigned to a specific engineer from the latest sprint planning Confluence file

### CPPF Analysis Tools  
- `get_cppf_details`: Get CPPF ticket + linked Confluence docs
- `analyze_cppf_for_role`: Role-specific requirement analysis
- `get_cppf_confluence_docs`: Get all linked documentation

### CRE Management Tools
- `create_cre_story_from_cppf`: Create CRE story with linking
- `create_cre_tasks_for_story`: Create platform tasks
- `get_my_cre_stories`: Get user's current CRE stories
- `update_cre_task_status`: Update task status
- `get_parent_cre_story`: Get parent CRE story information from a CRE task
- `get_cppf_from_cre_story`: Get linked CPPF ticket information from a CRE story
- `get_task_hierarchy_and_cppf`: Get complete hierarchy: CRE task -> parent CRE story -> linked CPPF ticket with documentation

### Intelligence Tools
- `get_task_priorities`: Get prioritized task list
- `suggest_next_task`: AI-powered task recommendation
- `get_blocked_tasks`: Find blocked/dependent tasks
- `estimate_remaining_work`: Calculate sprint capacity

### Communication Tools
- `add_progress_comment`: Add progress comments
- `generate_status_report`: Generate status reports
- `flag_dependency_issue`: Flag blockers

## Example Workflows

### Create CRE story from CPPF ticket
```
"Create CRE story for CPPF-1376"
```

### Get role-specific requirements
```
"What backend work is needed for CPPF-1376?"
```

### Update task status
```
"Update task CRE-1234 status to In Progress and add progress note"
```

### Generate status report
```
"Generate my weekly status report"
```

### Find blocked tasks
```
"What tasks are blocked and why?"
```

### Get parent CRE story from task
```
"Get parent story for task CRE-1234"
```

### Get CPPF from CRE story
```
"Get CPPF information for story CRE-5678"
```

### Get complete task hierarchy
```
"Show me the complete hierarchy for task CRE-1234 including CPPF details"
```

### Find latest sprint planning and extract assignments
```
"Find the latest sprint planning file and show all assignments"
```

### Get assignments for specific engineer from Confluence
```
"In latest sprint planning file, list all assigned tasks of AnhD"
```

### Extract tasks from specific Confluence content
```
"Extract assigned tasks from this Confluence page content for John Smith"
```

## Troubleshooting

If you encounter issues:
1. Check your `.env` configuration
2. Ensure your Atlassian API token is valid
3. Verify your account has access to the CPPF and CRE projects
4. Check the console output for error messages

## License

MIT 