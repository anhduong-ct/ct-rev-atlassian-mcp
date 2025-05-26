import workflowService from '../services/workflow.js';
import { config } from '../config.js';

/**
 * Add progress comment to a ticket
 */
const addProgressComment = {
  name: 'add_progress_comment',
  description: 'Add progress comments',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_id: {
        type: 'string',
        description: 'Ticket ID (e.g. CPPF-1234 or CRE-1234)'
      },
      message: {
        type: 'string',
        description: 'Comment message'
      },
      mentions: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'User IDs to mention'
      }
    },
    required: ['ticket_id', 'message']
  },
  handler: async ({ ticket_id, message, mentions = [] }) => {
    try {
      if (!ticket_id) {
        return {
          success: false,
          error: 'Ticket ID is required'
        };
      }
      
      if (!message) {
        return {
          success: false,
          error: 'Comment message is required'
        };
      }
      
      // Ensure ticket ID is in correct format
      const validPrefixes = [config.jira.projects.cppf, config.jira.projects.cre];
      const hasPrefix = validPrefixes.some(prefix => ticket_id.startsWith(prefix + '-'));
      
      if (!hasPrefix) {
        // Try to guess the project
        if (ticket_id.match(/^\d+$/)) {
          // If it's just a number, assume it's a CRE ticket
          ticket_id = `${config.jira.projects.cre}-${ticket_id}`;
        } else {
          return {
            success: false,
            error: `Invalid ticket ID format. Must start with ${validPrefixes.join('-')} or ${validPrefixes.join('-')}`
          };
        }
      }
      
      const response = await workflowService.addProgressComment(ticket_id, message, mentions);
      
      if (!response.success) {
        return response;
      }
      
      return {
        success: true,
        data: {
          ticketId: ticket_id,
          commentAdded: true,
          mentions: mentions.length > 0 ? mentions : [],
          message: `Successfully added comment to ${ticket_id}`
        }
      };
    } catch (error) {
      console.error(`Error adding comment to ${ticket_id}:`, error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Generate status report
 */
const generateStatusReport = {
  name: 'generate_status_report',
  description: 'Generate status reports',
  inputSchema: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        enum: ['daily', 'weekly'],
        description: 'Report period',
        default: 'weekly'
      }
    }
  },
  handler: async ({ period = 'weekly' }) => {
    try {
      // Validate period
      if (period !== 'daily' && period !== 'weekly') {
        return {
          success: false,
          error: 'Invalid period. Must be "daily" or "weekly"'
        };
      }
      
      const response = await workflowService.generateStatusReport(period);
      
      if (!response.success) {
        return response;
      }
      
      // Format the report data for better readability
      const report = response.data;
      
      // Format completed issues
      const completedIssues = report.completed.map(issue => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status?.name || 'Unknown'
      }));
      
      // Format in-progress issues
      const inProgressIssues = report.inProgress.map(issue => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status?.name || 'Unknown'
      }));
      
      // Format upcoming issues
      const upcomingIssues = report.upcoming.map(issue => ({
        key: issue.key,
        summary: issue.fields.summary,
        priority: issue.fields.priority?.name || 'No Priority'
      }));
      
      // Generate a summary text
      const summaryText = `${period.charAt(0).toUpperCase() + period.slice(1)} status report for ${config.user.currentSprint}:\n` +
        `- Completed: ${completedIssues.length} tasks\n` +
        `- In progress: ${inProgressIssues.length} tasks\n` +
        `- Blocked: ${report.blocked.length} tasks\n` +
        `- Upcoming: ${upcomingIssues.length} tasks`;
      
      return {
        success: true,
        data: {
          period,
          timestamp: report.timestamp,
          sprint: config.user.currentSprint,
          summary: summaryText,
          completed: completedIssues,
          inProgress: inProgressIssues,
          blocked: report.blocked,
          upcoming: upcomingIssues
        }
      };
    } catch (error) {
      console.error(`Error generating ${period} status report:`, error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Flag dependency issue
 */
const flagDependencyIssue = {
  name: 'flag_dependency_issue',
  description: 'Flag blockers',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'Task ID (e.g. CRE-1234)'
      },
      description: {
        type: 'string',
        description: 'Description of the dependency issue'
      }
    },
    required: ['task_id', 'description']
  },
  handler: async ({ task_id, description }) => {
    try {
      if (!task_id) {
        return {
          success: false,
          error: 'Task ID is required'
        };
      }
      
      if (!description) {
        return {
          success: false,
          error: 'Description is required'
        };
      }
      
      // Ensure task ID is in correct format
      if (!task_id.startsWith(config.jira.projects.cre + '-')) {
        task_id = `${config.jira.projects.cre}-${task_id}`;
      }
      
      const response = await workflowService.flagDependencyIssue(task_id, description);
      
      if (!response.success) {
        return response;
      }
      
      return {
        success: true,
        data: {
          taskId: task_id,
          flagAdded: true,
          message: `Successfully flagged dependency issue on ${task_id}`
        }
      };
    } catch (error) {
      console.error(`Error flagging dependency for ${task_id}:`, error.message);
      return { success: false, error: error.message };
    }
  }
};

export default [
  addProgressComment,
  generateStatusReport,
  flagDependencyIssue
]; 