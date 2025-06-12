import workflowService from '../../services/refactored/workflow.js';
import { parseSprintFile } from '../../utils/parser.js';
import { config, getCurrentSprint } from '../../config.js';
import { getJiraTicketUrl, enhanceWithUrls } from '../../utils/urls.js';

/**
 * Get sprint assignments - Consolidated tool that merges get_my_sprint_assignments and get_sprint_overview
 * Flexible tool that can filter by user, team, or get a full overview
 */
const getSprintAssignments = {
  name: 'get_sprint_assignments',
  description: 'Get sprint assignments with flexible filtering options (by user, team, status, or platform)',
  inputSchema: {
    type: 'object',
    properties: {
      assignee: {
        type: 'string',
        description: 'Filter by assignee (use "currentUser" for current user, "unassigned" for unassigned tickets, or provide exact username/email for specific user)'
      },
      status: {
        type: 'string',
        description: 'Filter by status (e.g., "In Progress", "Done", etc.)'
      },
      platform: {
        type: 'string',
        description: 'Filter by platform (e.g., "web", "backend", "app", "ios")'
      },
      groupBy: {
        type: 'string',
        enum: ['assignee', 'status', 'platform', 'priority', 'none'],
        description: 'Group results by specified field',
        default: 'assignee'
      }
    }
  },
  handler: async ({ assignee, status, platform, groupBy = 'assignee' }) => {
    try {
      let jql = `project = ${config.jira.projects.cre}`;
      
      // Build JQL based on filters
      if (assignee) {
        if (assignee.toLowerCase() === 'currentuser') {
          jql += ' AND assignee = currentUser()';
        } else if (assignee.toLowerCase() === 'unassigned') {
          jql += ' AND assignee IS EMPTY';
        } else {
          // For named users, use exact match first
          // If you know the exact username/email, this will work
          // For display names, users need to provide the exact match
          jql += ` AND assignee = "${assignee}"`;
        }
      }
      
      if (status) {
        jql += ` AND status = "${status}"`;
      }
      
      if (platform) {
        // This assumes you have component or label structure for platforms
        jql += ` AND (labels = "${platform}" OR component = "${platform}")`;
      }
      
      jql += ' ORDER BY updated DESC';
      
      // Execute the query
      const response = await workflowService.searchIssues(jql, ['summary', 'description', 'status', 'assignee', 'priority', 'issuelinks', 'labels', 'components']);
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to get sprint assignments'
        };
      }
      
      // Format the response for better readability
      const formattedIssues = response.data.issues.map(issue => ({
        key: issue.key,
        url: getJiraTicketUrl(issue.key),
        summary: issue.fields.summary,
        status: issue.fields.status?.name || 'Unknown',
        priority: issue.fields.priority?.name || 'No Priority',
        assignee: issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned',
        platform: getSprintAssignments.determinePlatform(issue),
        hasLinkedCPPF: (issue.fields.issuelinks || []).some(link => {
          const linkedIssue = link.inwardIssue || link.outwardIssue;
          return linkedIssue && linkedIssue.key.startsWith(config.jira.projects.cppf);
        })
      }));
      
      // Group results if requested
      let groupedIssues = formattedIssues;
      let statistics = { total: formattedIssues.length };
      
      if (groupBy !== 'none') {
        const groupedResult = getSprintAssignments.groupIssues(formattedIssues, groupBy);
        groupedIssues = groupedResult.issues;
        statistics = {
          ...statistics,
          ...groupedResult.statistics
        };
      }
      
      const result = {
        success: true,
        data: {
          total: formattedIssues.length,
          issues: groupedIssues,
          statistics,
          currentSprint: getCurrentSprint(),
          referenceLinks: {
            jiraProject: formattedIssues.length > 0 ? getJiraTicketUrl(formattedIssues[0].key).replace(/\/browse\/.*$/, `/projects/${formattedIssues[0].key.split('-')[0]}`) : null,
            jiraBoard: formattedIssues.length > 0 ? getJiraTicketUrl(formattedIssues[0].key).replace(/\/browse\/.*$/, `/secure/RapidBoard.jspa?projectKey=${formattedIssues[0].key.split('-')[0]}`) : null
          }
        }
      };
      
      return result;
    } catch (error) {
      console.error('Error getting sprint assignments:', error.message);
      return { success: false, error: error.message };
    }
  },
  
  // Helper methods
  determinePlatform(issue) {
    // First check components
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
    
    // Default
    return 'unknown';
  },
  
  groupIssues(issues, groupBy) {
    const groupedIssues = {};
    const statistics = {};
    
    switch(groupBy) {
      case 'assignee':
        // Group by assignee
        for (const issue of issues) {
          const assignee = issue.assignee || 'Unassigned';
          if (!groupedIssues[assignee]) groupedIssues[assignee] = [];
          groupedIssues[assignee].push(issue);
        }
        
        // Calculate completion percentage by assignee
        statistics.byAssignee = {};
        for (const [assignee, assigneeIssues] of Object.entries(groupedIssues)) {
          const total = assigneeIssues.length;
          const completed = assigneeIssues.filter(issue => 
            ['Done', 'Closed', 'Completed'].includes(issue.status)
          ).length;
          
          statistics.byAssignee[assignee] = {
            total,
            completed,
            percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0
          };
        }
        break;
        
      case 'status':
        // Group by status
        for (const issue of issues) {
          const status = issue.status;
          if (!groupedIssues[status]) groupedIssues[status] = [];
          groupedIssues[status].push(issue);
        }
        
        // Calculate stats by status
        statistics.byStatus = {};
        for (const [status, statusIssues] of Object.entries(groupedIssues)) {
          statistics.byStatus[status] = statusIssues.length;
        }
        break;
        
      case 'platform':
        // Group by platform
        for (const issue of issues) {
          const platform = issue.platform;
          if (!groupedIssues[platform]) groupedIssues[platform] = [];
          groupedIssues[platform].push(issue);
        }
        
        // Calculate stats by platform
        statistics.byPlatform = {};
        for (const [platform, platformIssues] of Object.entries(groupedIssues)) {
          statistics.byPlatform[platform] = platformIssues.length;
        }
        break;
        
      case 'priority':
        // Group by priority
        for (const issue of issues) {
          const priority = issue.priority;
          if (!groupedIssues[priority]) groupedIssues[priority] = [];
          groupedIssues[priority].push(issue);
        }
        
        // Calculate stats by priority
        statistics.byPriority = {};
        for (const [priority, priorityIssues] of Object.entries(groupedIssues)) {
          statistics.byPriority[priority] = priorityIssues.length;
        }
        break;
        
      default:
        return { issues, statistics: {} };
    }
    
    return { issues: groupedIssues, statistics };
  }
};

/**
 * Parse sprint assignment data
 */
const parseSprintAssignmentFile = {
  name: 'parse_sprint_file',
  description: 'Parse sprint assignment data',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Sprint assignment file content'
      }
    },
    required: ['content']
  },
  handler: async ({ content }) => {
    try {
      if (!content) {
        return {
          success: false,
          error: 'No content provided'
        };
      }
      
      const parseResult = parseSprintFile(content);
      return parseResult;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

export default [getSprintAssignments, parseSprintAssignmentFile];
