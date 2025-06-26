import workflowService from '../services/workflow.js';
import { parseSprintFile } from '../utils/parser.js';
import { config, getCurrentSprint } from '../config.js';
import { getJiraTicketUrl, enhanceWithUrls } from '../utils/urls.js';

/**
 * Get assigned CRE tickets for the current user
 */
const getMySprintAssignments = {
  name: 'get_my_sprint_assignments',
  description: 'Get assigned CRE tickets for current user',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async () => {
    try {
      const response = await workflowService.getMySprintAssignments();
      
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
        hasLinkedCPPF: (issue.fields.issuelinks || []).some(link => {
          const linkedIssue = link.inwardIssue || link.outwardIssue;
          return linkedIssue && linkedIssue.key.startsWith(config.jira.projects.cppf);
        })
      }));
      
      return {
        success: true,
        data: {
          total: formattedIssues.length,
          issues: formattedIssues,
          currentSprint: getCurrentSprint(),
          referenceLinks: {
            jiraProject: formattedIssues.length > 0 ? getJiraTicketUrl(formattedIssues[0].key).replace(/\/browse\/.*$/, `/projects/${formattedIssues[0].key.split('-')[0]}`) : null,
            jiraBoard: formattedIssues.length > 0 ? getJiraTicketUrl(formattedIssues[0].key).replace(/\/browse\/.*$/, `/secure/RapidBoard.jspa?projectKey=${formattedIssues[0].key.split('-')[0]}`) : null
          }
        }
      };
    } catch (error) {
      console.error('Error getting sprint assignments:', error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Get full sprint status across team
 */
const getSprintOverview = {
  name: 'get_sprint_overview',
  description: 'Get full sprint status across team',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async () => {
    try {
      const response = await workflowService.getSprintOverview();
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to get sprint overview'
        };
      }
      
      // Group issues by assignee
      const issuesByAssignee = {};
      
      for (const issue of response.data.issues) {
        const assignee = issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned';
        
        if (!issuesByAssignee[assignee]) {
          issuesByAssignee[assignee] = [];
        }
        
        issuesByAssignee[assignee].push({
          key: issue.key,
          url: getJiraTicketUrl(issue.key),
          summary: issue.fields.summary,
          status: issue.fields.status?.name || 'Unknown',
          priority: issue.fields.priority?.name || 'No Priority'
        });
      }
      
      // Calculate progress statistics
      const statistics = {
        total: response.data.issues.length,
        byStatus: {},
        byAssignee: {}
      };
      
      // Count issues by status
      for (const issue of response.data.issues) {
        const status = issue.fields.status?.name || 'Unknown';
        
        if (!statistics.byStatus[status]) {
          statistics.byStatus[status] = 0;
        }
        
        statistics.byStatus[status]++;
      }
      
      // Calculate completion percentage by assignee
      for (const [assignee, issues] of Object.entries(issuesByAssignee)) {
        const total = issues.length;
        const completed = issues.filter(issue => 
          issue.status === 'Done' || 
          issue.status === 'Closed' || 
          issue.status === 'Completed'
        ).length;
        
        statistics.byAssignee[assignee] = {
          total,
          completed,
          percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0
        };
      }
      
      return {
        success: true,
        data: {
          sprint: getCurrentSprint(),
          statistics,
          issuesByAssignee,
          referenceLinks: {
            jiraProject: response.data.issues.length > 0 ? getJiraTicketUrl(response.data.issues[0].key).replace(/\/browse\/.*$/, `/projects/${response.data.issues[0].key.split('-')[0]}`) : null,
            jiraBoard: response.data.issues.length > 0 ? getJiraTicketUrl(response.data.issues[0].key).replace(/\/browse\/.*$/, `/secure/RapidBoard.jspa?projectKey=${response.data.issues[0].key.split('-')[0]}`) : null
          }
        }
      };
    } catch (error) {
      console.error('Error getting sprint overview:', error.message);
      return { success: false, error: error.message };
    }
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
      
      if (!parseResult.success) {
        return parseResult;
      }
      
      // Format the response for better readability
      return {
        success: true,
        data: {
          engineers: Object.keys(parseResult.data),
          assignments: parseResult.data
        }
      };
    } catch (error) {
      console.error('Error parsing sprint file:', error.message);
      return { success: false, error: error.message };
    }
  }
};

export default [
  getMySprintAssignments,
  getSprintOverview,
  parseSprintAssignmentFile
]; 