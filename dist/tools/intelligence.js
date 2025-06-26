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

export default [
  getTaskPriorities,
  suggestNextTask
]; 