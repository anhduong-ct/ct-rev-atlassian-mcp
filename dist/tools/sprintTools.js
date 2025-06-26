import sprintDetectionService from '../services/sprintDetection.js';
import { config, getCurrentSprintInfo } from '../config.js';

/**
 * Get current sprint information
 */
const getCurrentSprintTool = {
  name: 'get_current_sprint',
  description: 'Get current active sprint information',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async () => {
    try {
      const response = await sprintDetectionService.getCurrentSprint();
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to get current sprint'
        };
      }

      return {
        success: true,
        data: {
          sprint: response.data,
          autoDetected: config.sprint.autoDetection,
          lastUpdated: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Error getting current sprint:', error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Get previous sprint information
 */
const getPreviousSprintTool = {
  name: 'get_previous_sprint',
  description: 'Get previous completed sprint information',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async () => {
    try {
      const response = await sprintDetectionService.getPreviousSprint();
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to get previous sprint'
        };
      }

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Error getting previous sprint:', error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Get next sprint information
 */
const getNextSprintTool = {
  name: 'get_next_sprint',
  description: 'Get next planned sprint information',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async () => {
    try {
      const response = await sprintDetectionService.getNextSprint();
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to get next sprint'
        };
      }

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Error getting next sprint:', error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Get comprehensive sprint context (current, previous, next)
 */
const getSprintContextTool = {
  name: 'get_sprint_context',
  description: 'Get comprehensive sprint information including current, previous, and next sprints',
  inputSchema: {
    type: 'object',
    properties: {
      forceRefresh: {
        type: 'boolean',
        description: 'Force refresh the sprint cache',
        default: false
      }
    }
  },
  handler: async ({ forceRefresh = false }) => {
    try {
      const response = await getCurrentSprintInfo();
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to get sprint context'
        };
      }

      // Add some helpful metadata
      const currentDate = new Date().toISOString().split('T')[0];
      const currentSprint = response.data.current;
      
      let sprintStatus = 'unknown';
      if (currentSprint) {
        const startDate = new Date(currentSprint.startDate);
        const endDate = new Date(currentSprint.endDate);
        const now = new Date();
        
        if (now < startDate) {
          sprintStatus = 'upcoming';
        } else if (now > endDate) {
          sprintStatus = 'overdue';
        } else {
          sprintStatus = 'active';
        }
      }

      return {
        success: true,
        data: {
          ...response.data,
          metadata: {
            currentDate,
            sprintStatus,
            autoDetectionEnabled: config.sprint.autoDetection,
            lastCacheUpdate: sprintDetectionService.lastCacheUpdate,
            configSprint: config.user.currentSprint
          }
        }
      };
    } catch (error) {
      console.error('Error getting sprint context:', error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Refresh sprint detection and update config
 */
const refreshSprintDetectionTool = {
  name: 'refresh_sprint_detection',
  description: 'Manually refresh sprint detection and update configuration',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async () => {
    try {
      // Clear cache first
      sprintDetectionService.clearCache();
      
      const response = await sprintDetectionService.refreshConfig();
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to refresh sprint detection'
        };
      }

      return {
        success: true,
        data: {
          ...response.data,
          timestamp: new Date().toISOString(),
          currentConfig: config.user.currentSprint
        }
      };
    } catch (error) {
      console.error('Error refreshing sprint detection:', error.message);
      return { success: false, error: error.message };
    }
  }
};

export default [
  getCurrentSprintTool,
  getPreviousSprintTool,
  getNextSprintTool,
  getSprintContextTool,
  refreshSprintDetectionTool
]; 