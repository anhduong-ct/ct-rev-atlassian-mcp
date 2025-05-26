import workflowService from '../services/workflow.js';
import { config, getCurrentSprint } from '../config.js';
import { getJiraTicketUrl } from '../utils/urls.js';

/**
 * Get prioritized task list
 */
const getTaskPriorities = {
  name: 'get_task_priorities',
  description: 'Get prioritized task list',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async () => {
    try {
      const response = await workflowService.getTaskPriorities();
      
      if (!response.success) {
        return response;
      }
      
      // Format the response for better readability
      const formattedTasks = response.data.map(task => ({
        key: task.key,
        url: getJiraTicketUrl(task.key),
        summary: task.summary,
        status: task.status?.name || 'Unknown',
        jiraPriority: task.priority?.name || 'No Priority',
        calculatedPriority: task.calculatedPriority,
        priorityScore: `${task.calculatedPriority}/100`
      }));
      
      return {
        success: true,
        data: {
          tasks: formattedTasks,
          count: formattedTasks.length,
          priorityWeights: config.workflow.priorityWeights
        }
      };
    } catch (error) {
      console.error('Error getting task priorities:', error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Suggest next task to work on
 */
const suggestNextTask = {
  name: 'suggest_next_task',
  description: 'AI-powered task recommendation',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async () => {
    try {
      const response = await workflowService.suggestNextTask();
      
      if (!response.success) {
        return response;
      }
      
      // Check if there's a suggestion
      if (!response.data.suggestion) {
        return {
          success: true,
          data: {
            message: response.data.message || 'No tasks ready to work on',
            suggestion: null
          }
        };
      }
      
      // Format the suggestion for better readability
      const suggestion = response.data.suggestion;
      const formattedSuggestion = {
        key: suggestion.key,
        url: getJiraTicketUrl(suggestion.key),
        summary: suggestion.summary,
        status: suggestion.status?.name || 'Unknown',
        jiraPriority: suggestion.priority?.name || 'No Priority',
        calculatedPriority: suggestion.calculatedPriority,
        priorityScore: `${suggestion.calculatedPriority}/100`,
        reasoning: `This task was selected based on priority (${suggestion.calculatedPriority}/100) and ready status.`
      };
      
      return {
        success: true,
        data: {
          message: response.data.message,
          suggestion: formattedSuggestion
        }
      };
    } catch (error) {
      console.error('Error suggesting next task:', error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Get blocked tasks and their blockers
 */
const getBlockedTasks = {
  name: 'get_blocked_tasks',
  description: 'Find blocked/dependent tasks',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async () => {
    try {
      const response = await workflowService.getBlockedTasks();
      
      if (!response.success) {
        return response;
      }
      
      // Format the response for better readability
      const formattedTasks = response.data.map(task => ({
        key: task.key,
        url: getJiraTicketUrl(task.key),
        summary: task.summary,
        status: task.status,
        blockers: task.blockers.map(blocker => ({
          key: blocker.key,
          url: getJiraTicketUrl(blocker.key),
          summary: blocker.summary,
          status: blocker.status
        }))
      }));
      
      return {
        success: true,
        data: {
          blockedTasks: formattedTasks,
          count: formattedTasks.length,
          message: formattedTasks.length > 0 ? 
            `Found ${formattedTasks.length} blocked tasks` : 
            'No blocked tasks found'
        }
      };
    } catch (error) {
      console.error('Error getting blocked tasks:', error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Estimate remaining work in sprint
 */
const estimateRemainingWork = {
  name: 'estimate_remaining_work',
  description: 'Calculate sprint capacity',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async () => {
    try {
      const response = await workflowService.estimateRemainingWork();
      
      if (!response.success) {
        return response;
      }
      
      // Format the response for better readability
      const data = response.data;
      
      // Add some insights based on the data
      const insights = [];
      
      if (data.percentComplete < 30 && data.tasksByStatus.toDo > data.tasksByStatus.completed * 2) {
        insights.push('Sprint progress is low with many tasks still to do. Consider reducing scope.');
      }
      
      if (data.tasksByStatus.inProgress > 3) {
        insights.push('Multiple tasks in progress. Consider focusing on completing in-progress work before starting new tasks.');
      }
      
      if (data.percentComplete > 80) {
        insights.push('Sprint is nearly complete. Consider planning for the next sprint.');
      }
      
      return {
        success: true,
        data: {
          sprint: getCurrentSprint(),
          tasksByStatus: data.tasksByStatus,
          pointsByStatus: data.pointsByStatus,
          percentComplete: data.percentComplete,
          percentPointsComplete: data.percentPointsComplete,
          totalTasks: data.totalTasks,
          totalPoints: data.totalPoints,
          insights
        }
      };
    } catch (error) {
      console.error('Error estimating remaining work:', error.message);
      return { success: false, error: error.message };
    }
  }
};

export default [
  getTaskPriorities,
  suggestNextTask,
  getBlockedTasks,
  estimateRemainingWork
]; 