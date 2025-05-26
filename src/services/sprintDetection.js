import jiraService from './jira.js';
import { config } from '../config.js';

class SprintDetectionService {
  constructor() {
    this.cachedSprintContext = null;
    this.lastCacheUpdate = null;
    this.cacheExpiry = 15 * 60 * 1000; // 15 minutes
    this.targetBoardId = 260; // CRE board ID from the Go system
  }

  async getCurrentSprintFromBoard260() {
    try {
      console.log(`🔍 Checking board ${this.targetBoardId} for active sprints...`);
      
      // Get active sprints specifically from board 260
      const sprintsResponse = await jiraService.getSprints(this.targetBoardId, 'active');
      
      if (!sprintsResponse.success) {
        console.log(`❌ Failed to get active sprints from board ${this.targetBoardId}:`, sprintsResponse.error);
        
        // Fallback: try to get all sprints and find the most recent one
        const allSprintsResponse = await jiraService.getSprints(this.targetBoardId);
        if (allSprintsResponse.success && allSprintsResponse.data.values.length > 0) {
          // Sort by start date and get the most recent
          const sortedSprints = allSprintsResponse.data.values
            .sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));
          
          const latestSprint = sortedSprints[0];
          console.log(`📅 Using most recent sprint from board ${this.targetBoardId}: "${latestSprint.name}"`);
          
          return {
            success: true,
            data: {
              name: latestSprint.name,
              id: latestSprint.id,
              state: latestSprint.state,
              startDate: latestSprint.startDate,
              endDate: latestSprint.endDate,
              detectionMethod: 'board-260-latest',
              boardId: this.targetBoardId
            }
          };
        }
        
        return sprintsResponse;
      }

      const activeSprints = sprintsResponse.data.values;
      
      if (activeSprints.length === 0) {
        console.log(`❌ No active sprints found on board ${this.targetBoardId}`);
        return {
          success: false,
          error: `No active sprints found on board ${this.targetBoardId}`
        };
      }

      // If multiple active sprints, take the first one
      const currentSprint = activeSprints[0];
      console.log(`✅ Found active sprint on board ${this.targetBoardId}: "${currentSprint.name}"`);

      return {
        success: true,
        data: {
          name: currentSprint.name,
          id: currentSprint.id,
          state: currentSprint.state,
          startDate: currentSprint.startDate,
          endDate: currentSprint.endDate,
          goal: currentSprint.goal,
          detectionMethod: 'board-260-active',
          boardId: this.targetBoardId
        }
      };
    } catch (error) {
      console.error(`Error getting active sprint from board ${this.targetBoardId}:`, error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async getSprintContext(forceRefresh = false) {
    try {
      const now = Date.now();
      
      // Return cached data if still valid
      if (!forceRefresh && 
          this.cachedSprintContext && 
          this.lastCacheUpdate && 
          (now - this.lastCacheUpdate) < this.cacheExpiry) {
        return { success: true, data: this.cachedSprintContext };
      }

      // Fetch fresh sprint data
      const response = await jiraService.getSprintContext();
      
      if (response.success) {
        this.cachedSprintContext = response.data;
        this.lastCacheUpdate = now;
        
        // Update config with current sprint if available
        if (response.data.current) {
          config.user.currentSprint = response.data.current.name;
        }
      }

      return response;
    } catch (error) {
      console.error('Error getting sprint context:', error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async getCurrentSprintFromIssues() {
    try {
      // Get recent issues from CRE project to see what sprint they're in
      const jql = `project = ${config.jira.projects.cre} AND updated >= -7d ORDER BY updated DESC`;
      const issuesResponse = await jiraService.searchIssues(jql, [
        'summary', 'status', 'updated', config.jira.customFields.sprint
      ], 0, 20);
      
      if (!issuesResponse.success) {
        return issuesResponse;
      }

      // Count sprint occurrences from recent issues
      const sprintCounts = {};
      const sprintField = config.jira.customFields.sprint;
      
      for (const issue of issuesResponse.data.issues) {
        const sprints = issue.fields[sprintField];
        if (sprints && Array.isArray(sprints)) {
          // Get the most recent sprint for this issue
          const latestSprint = sprints[sprints.length - 1];
          if (latestSprint && latestSprint.name) {
            sprintCounts[latestSprint.name] = (sprintCounts[latestSprint.name] || 0) + 1;
          }
        }
      }

      // Find the most common sprint from recent work
      if (Object.keys(sprintCounts).length === 0) {
        return {
          success: false,
          error: 'No sprint information found in recent issues'
        };
      }

      // Get the sprint with the most issues
      const mostCommonSprint = Object.entries(sprintCounts)
        .sort(([,a], [,b]) => b - a)[0][0];

      return {
        success: true,
        data: {
          name: mostCommonSprint,
          detectionMethod: 'issues-analysis',
          issueCount: sprintCounts[mostCommonSprint],
          allSprintCounts: sprintCounts
        }
      };
    } catch (error) {
      console.error('Error detecting sprint from issues:', error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async getCurrentSprint() {
    try {
      const context = await this.getSprintContext();
      
      if (!context.success) {
        return context;
      }

      const currentSprint = context.data.current;
      
      if (!currentSprint) {
        return {
          success: false,
          error: 'No active sprint found'
        };
      }

      return {
        success: true,
        data: {
          id: currentSprint.id,
          name: currentSprint.name,
          state: currentSprint.state,
          startDate: currentSprint.startDate,
          endDate: currentSprint.endDate,
          goal: currentSprint.goal,
          boardId: context.data.board.id,
          boardName: context.data.board.name
        }
      };
    } catch (error) {
      console.error('Error getting current sprint:', error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async getBestAvailableSprint() {
    try {
      // PRIORITY 1: Try to get active sprint from board 260 (matching Go system)
      const board260Result = await this.getCurrentSprintFromBoard260();
      if (board260Result.success) {
        return {
          success: true,
          data: {
            name: board260Result.data.name,
            id: board260Result.data.id,
            state: board260Result.data.state,
            startDate: board260Result.data.startDate,
            endDate: board260Result.data.endDate,
            goal: board260Result.data.goal,
            detectionMethod: board260Result.data.detectionMethod,
            sprintType: 'current-active',
            boardId: board260Result.data.boardId
          }
        };
      }

      // PRIORITY 2: Try to detect from actual issues being worked on
      const issuesBasedResult = await this.getCurrentSprintFromIssues();
      if (issuesBasedResult.success) {
        return {
          success: true,
          data: {
            name: issuesBasedResult.data.name,
            detectionMethod: issuesBasedResult.data.detectionMethod,
            sprintType: 'current-work',
            issueCount: issuesBasedResult.data.issueCount
          }
        };
      }

      // PRIORITY 3: Fall back to board-based detection
      const context = await this.getSprintContext();
      
      if (!context.success) {
        return context;
      }

      // Priority order: active -> future -> recent closed
      let bestSprint = null;
      let sprintType = 'unknown';

      if (context.data.current) {
        bestSprint = context.data.current;
        sprintType = 'active';
      } else if (context.data.next) {
        bestSprint = context.data.next;
        sprintType = 'upcoming';
      } else if (context.data.previous) {
        bestSprint = context.data.previous;
        sprintType = 'recent';
      } else if (context.data.allSprints && context.data.allSprints.length > 0) {
        // Get the most recent sprint regardless of state
        bestSprint = context.data.allSprints[0];
        sprintType = 'latest';
      }

      if (!bestSprint) {
        return {
          success: false,
          error: 'No sprints found on the board'
        };
      }

      return {
        success: true,
        data: {
          id: bestSprint.id,
          name: bestSprint.name,
          state: bestSprint.state,
          startDate: bestSprint.startDate,
          endDate: bestSprint.endDate,
          goal: bestSprint.goal,
          boardId: context.data.board.id,
          boardName: context.data.board.name,
          sprintType,
          detectionMethod: 'board-analysis'
        }
      };
    } catch (error) {
      console.error('Error getting best available sprint:', error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async getPreviousSprint() {
    try {
      const context = await this.getSprintContext();
      
      if (!context.success) {
        return context;
      }

      const previousSprint = context.data.previous;
      
      if (!previousSprint) {
        return {
          success: false,
          error: 'No previous sprint found'
        };
      }

      return {
        success: true,
        data: {
          id: previousSprint.id,
          name: previousSprint.name,
          state: previousSprint.state,
          startDate: previousSprint.startDate,
          endDate: previousSprint.endDate,
          goal: previousSprint.goal,
          boardId: context.data.board.id,
          boardName: context.data.board.name
        }
      };
    } catch (error) {
      console.error('Error getting previous sprint:', error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async getNextSprint() {
    try {
      const context = await this.getSprintContext();
      
      if (!context.success) {
        return context;
      }

      const nextSprint = context.data.next;
      
      if (!nextSprint) {
        return {
          success: false,
          error: 'No next sprint found'
        };
      }

      return {
        success: true,
        data: {
          id: nextSprint.id,
          name: nextSprint.name,
          state: nextSprint.state,
          startDate: nextSprint.startDate,
          endDate: nextSprint.endDate,
          goal: nextSprint.goal,
          boardId: context.data.board.id,
          boardName: context.data.board.name
        }
      };
    } catch (error) {
      console.error('Error getting next sprint:', error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async getAllSprintInfo() {
    try {
      const context = await this.getSprintContext();
      
      if (!context.success) {
        return context;
      }

      const { current, previous, next, board, allSprints } = context.data;

      return {
        success: true,
        data: {
          current: current ? {
            id: current.id,
            name: current.name,
            state: current.state,
            startDate: current.startDate,
            endDate: current.endDate,
            goal: current.goal
          } : null,
          
          previous: previous ? {
            id: previous.id,
            name: previous.name,
            state: previous.state,
            startDate: previous.startDate,
            endDate: previous.endDate,
            goal: previous.goal
          } : null,

          next: next ? {
            id: next.id,
            name: next.name,
            state: next.state,
            startDate: next.startDate,
            endDate: next.endDate,
            goal: next.goal
          } : null,

          board: {
            id: board.id,
            name: board.name,
            type: board.type
          },

          sprintHistory: allSprints.slice(0, 10).map(sprint => ({
            id: sprint.id,
            name: sprint.name,
            state: sprint.state,
            startDate: sprint.startDate,
            endDate: sprint.endDate
          }))
        }
      };
    } catch (error) {
      console.error('Error getting all sprint info:', error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async refreshConfig() {
    try {
      // First try to get an active sprint
      let sprintResponse = await this.getCurrentSprint();
      
      // If no active sprint, try to get the best available sprint (now includes issue analysis)
      if (!sprintResponse.success) {
        sprintResponse = await this.getBestAvailableSprint();
      }
      
      if (sprintResponse.success) {
        const oldSprint = config.user.currentSprint;
        const newSprint = sprintResponse.data.name;
        const sprintType = sprintResponse.data.sprintType || 'active';
        const detectionMethod = sprintResponse.data.detectionMethod || 'board-api';
        
        config.user.currentSprint = newSprint;
        
        let logMessage = `Sprint auto-detection: Updated from "${oldSprint}" to "${newSprint}"`;
        if (sprintType !== 'active') {
          logMessage += ` (${sprintType} sprint)`;
        }
        if (detectionMethod !== 'board-api') {
          logMessage += ` via ${detectionMethod}`;
        }
        console.log(logMessage);
        
        return {
          success: true,
          data: {
            oldSprint,
            newSprint,
            sprintType,
            detectionMethod,
            updated: oldSprint !== newSprint
          }
        };
      }

      return sprintResponse;
    } catch (error) {
      console.error('Error refreshing config with current sprint:', error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  clearCache() {
    this.cachedSprintContext = null;
    this.lastCacheUpdate = null;
  }
}

export default new SprintDetectionService(); 