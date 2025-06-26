import workflowService from '../../services/refactored/workflow.js';
import { config, getCurrentSprint, getNextSprint, getPreviousSprint } from '../../config.js';
import { getJiraTicketUrl } from '../../utils/urls.js';

/**
 * Consolidated Sprint Information Tool
 * Merges: get_current_sprint, get_next_sprint, get_previous_sprint, get_sprint_context
 * LLM-First Approach: Returns raw data for LLM analysis
 */
const getSprintInfo = {
  name: 'mcp_Atlassian_MCP_get_sprint_info',
  description: 'Get sprint information (current/next/previous) with optional assignments - unified tool for all sprint queries',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['current', 'next', 'previous'],
        default: 'current',
        description: 'Which sprint to get information for'
      },
      includeAssignments: {
        type: 'boolean',
        default: true,
        description: 'Whether to include sprint assignments'
      },
      assignee: {
        type: 'string',
        description: 'Filter assignments by assignee (use "currentUser" for current user, "unassigned" for unassigned tickets, or provide exact username/email)'
      },
      status: {
        type: 'string',
        description: 'Filter assignments by status (e.g., "In Progress", "Done", etc.)'
      },
      platform: {
        type: 'string',
        description: 'Filter assignments by platform (e.g., "web", "backend", "app", "ios")'
      }
    }
  },
  
  handler: async ({ 
    type = 'current', 
    includeAssignments = true, 
    assignee, 
    status, 
    platform 
  }) => {
    try {
      // Get sprint information based on type
      let sprintInfo = null;
      switch (type) {
        case 'current':
          sprintInfo = getCurrentSprint();
          break;
        case 'next':
          sprintInfo = await getNextSprint();
          break;
        case 'previous':
          sprintInfo = await getPreviousSprint();
          break;
      }

      // Get assignments if requested
      let assignments = null;
      if (includeAssignments && sprintInfo) {
        try {
          // Build JQL for assignments
          let jql = `project = ${config.jira.projects.cre}`;
          
          // Add assignee filter
          if (assignee) {
            if (assignee.toLowerCase() === 'currentuser') {
              jql += ' AND assignee = currentUser()';
            } else if (assignee.toLowerCase() === 'unassigned') {
              jql += ' AND assignee IS EMPTY';
            } else {
              jql += ` AND assignee = "${assignee}"`;
            }
          }
          
          // Add status filter
          if (status) {
            jql += ` AND status = "${status}"`;
          }
          
          // Add platform filter
          if (platform) {
            jql += ` AND (labels = "${platform}" OR component = "${platform}")`;
          }
          
          jql += ' ORDER BY updated DESC';
          
          // Execute JQL query to get assignments
          const assignmentsResponse = await workflowService.searchIssues(
            jql, 
            ['summary', 'description', 'status', 'assignee', 'priority', 'issuelinks', 'labels', 'components', 'created', 'updated']
          );
          
          if (assignmentsResponse.success) {
            assignments = assignmentsResponse.data;
          }
        } catch (error) {
          console.error('Error fetching assignments:', error);
          // Continue without assignments rather than failing
        }
      }

      // Return raw data for LLM analysis
      return {
        success: true,
        data: {
          sprint: {
            type,
            info: sprintInfo, // Raw sprint configuration
            metadata: {
              requestedAt: new Date().toISOString(),
              config: {
                currentSprint: config.user.currentSprint,
                nextSprint: config.user.nextSprint,
                previousSprint: config.user.previousSprint
              }
            }
          },
          assignments: assignments ? {
            total: assignments.total,
            issues: assignments.issues.map(issue => ({
              ...issue, // Raw Jira issue data
              url: getJiraTicketUrl(issue.key),
              metadata: {
                platform: determinePlatform(issue),
                hasLinkedCPPF: hasLinkedCPPF(issue)
              }
            }))
          } : null,
          filters: {
            assignee,
            status,
            platform
          }
        }
      };
    } catch (error) {
      console.error('Error getting sprint info:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

// Helper functions
function determinePlatform(issue) {
  // Check components first
  if (issue.fields.components && issue.fields.components.length > 0) {
    const platformComponent = issue.fields.components.find(comp => 
      ['web', 'backend', 'app', 'ios'].includes(comp.name.toLowerCase())
    );
    if (platformComponent) return platformComponent.name;
  }
  
  // Then check labels
  if (issue.fields.labels && issue.fields.labels.length > 0) {
    const platformLabel = issue.fields.labels.find(label => 
      ['web', 'backend', 'app', 'ios'].includes(label.toLowerCase())
    );
    if (platformLabel) return platformLabel;
  }
  
  return 'unknown';
}

function hasLinkedCPPF(issue) {
  return (issue.fields.issuelinks || []).some(link => {
    const linkedIssue = link.inwardIssue || link.outwardIssue;
    return linkedIssue && linkedIssue.key.startsWith(config.jira.projects.cppf);
  });
}

export default [getSprintInfo]; 