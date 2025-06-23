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
      // if (!forceRefresh && 
      //     this.cachedSprintContext && 
      //     this.lastCacheUpdate && 
      //     (now - this.lastCacheUpdate) < this.cacheExpiry) {
      //   return { success: true, data: this.cachedSprintContext };
      // }

      // Don't use jiraService.getSprintContext() anymore as it returns wrong sprint names
      // Instead, use alternative methods to get the correct current sprint
      console.log('🔄 Getting current sprint using alternative methods (not using jiraService.getSprintContext)...');
      
      let currentSprint = null;
      let boardInfo = null;
      let allSprints = [];
      
      // Try to get current sprint from board 260 first
      const board260Result = await this.getCurrentSprintFromBoard260();
      if (board260Result.success) {
        currentSprint = {
          id: board260Result.data.id,
          name: board260Result.data.name,
          state: board260Result.data.state,
          startDate: board260Result.data.startDate,
          endDate: board260Result.data.endDate,
          goal: board260Result.data.goal
        };
        boardInfo = { id: board260Result.data.boardId, name: 'CRE Board' };
        console.log(`✅ Got current sprint from board 260: "${currentSprint.name}"`);
      } else {
        // Fallback to issues-based detection
        console.log('⚠️ Board 260 method failed, trying issues-based detection...');
        const issuesResult = await this.getCurrentSprintFromIssues();
        if (issuesResult.success) {
          currentSprint = {
            name: issuesResult.data.name,
            state: 'active', // Assume active if found from recent issues
            detectionMethod: issuesResult.data.detectionMethod
          };
          console.log(`✅ Got current sprint from issues analysis: "${currentSprint.name}"`);
        } else {
          console.log('❌ All alternative methods failed');
          return {
            success: false,
            error: 'Could not determine current sprint using alternative methods'
          };
        }
      }

      if (!currentSprint) {
        return {
          success: false,
          error: 'No current sprint found using alternative methods'
        };
      }

      console.log('currentSprintName', currentSprint.name);
      
      // Now calculate previous and next sprints using the correct current sprint name
      const currentSprintName = currentSprint.name;
      let previousSprint = null;
      let nextSprint = null;
      
      // Calculate previous sprint
      const calculatedPreviousName = this.calculateSprintName(currentSprintName, 'previous');
      if (calculatedPreviousName) {
        previousSprint = {
          name: calculatedPreviousName,
          state: 'closed',
          calculatedSprint: true
        };
        console.log(`🔧 Calculated previous sprint: "${calculatedPreviousName}"`);
      }
      
      // Calculate next sprint
      const calculatedNextName = this.calculateSprintName(currentSprintName, 'next');
      if (calculatedNextName) {
        nextSprint = {
          name: calculatedNextName,
          state: 'future',
          calculatedSprint: true
        };
        console.log(`🔧 Calculated next sprint: "${calculatedNextName}"`);
      }

      const data = {
        current: currentSprint,
        previous: previousSprint,
        next: nextSprint,
        board: boardInfo || { id: this.targetBoardId, name: 'CRE Board' },
        allSprints: allSprints
      };
      
      this.cachedSprintContext = data;
      this.lastCacheUpdate = now;
      
      // Update config with current sprint
      if (currentSprint) {
        config.user.currentSprint = currentSprint.name;
      }

      return {
        success: true,
        data: data
      };
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

  /**
   * Calculate previous/next sprint names based on even number rule
   * Current: 25.24 -> Previous: 25.22, Next: 25.26
   */
  calculateSprintName(currentSprintName, direction) {
    try {
      // Extract pattern like "Revenue 25.24" or "25.24"
      const match = currentSprintName.match(/(\d+)\.(\d+)/);
      if (!match) {
        return null;
      }
      
      const [, majorVersion, minorVersion] = match;
      const currentMinor = parseInt(minorVersion, 10);
      
      let newMinor;
      if (direction === 'previous') {
        newMinor = currentMinor - 2; // 24 -> 22
      } else if (direction === 'next') {
        newMinor = currentMinor + 2; // 24 -> 26
      } else {
        return null;
      }
      
      // Ensure we don't go below 0
      if (newMinor < 0) {
        return null;
      }
      
      // Reconstruct the sprint name
      const newSprintName = currentSprintName.replace(/(\d+)\.(\d+)/, `${majorVersion}.${newMinor.toString().padStart(2, '0')}`);
      return newSprintName;
    } catch (error) {
      console.error('Error calculating sprint name:', error.message);
      return null;
    }
  }

  async getPreviousSprint() {
    try {
      const context = await this.getSprintContext();
      
      if (!context.success) {
        return context;
      }

      let previousSprint = context.data.previous;

      console.log('previousSprint', previousSprint);
      
      // If Jira API doesn't provide previous sprint, calculate it based on current sprint name
      if (!previousSprint && context.data.current) {
        const calculatedName = this.calculateSprintName(context.data.current.name, 'previous');
        if (calculatedName) {
          // Try to find this sprint in the sprint history
          const matchingSprint = context.data.allSprints.find(sprint => sprint.name === calculatedName);
          if (matchingSprint) {
            previousSprint = matchingSprint;
          } else {
            // Create a synthetic sprint object
            previousSprint = {
              name: calculatedName,
              state: 'closed',
              calculatedSprint: true
            };
          }
        }
      }
      
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
          boardId: context.data.board?.id,
          boardName: context.data.board?.name,
          calculatedSprint: previousSprint.calculatedSprint || false
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

      let nextSprint = context.data.next;
      
      // If Jira API doesn't provide next sprint, calculate it based on current sprint name
      if (!nextSprint && context.data.current) {
        const calculatedName = this.calculateSprintName(context.data.current.name, 'next');
        if (calculatedName) {
          // Try to find this sprint in the sprint history
          const matchingSprint = context.data.allSprints.find(sprint => sprint.name === calculatedName);
          if (matchingSprint) {
            nextSprint = matchingSprint;
          } else {
            // Create a synthetic sprint object
            nextSprint = {
              name: calculatedName,
              state: 'future',
              calculatedSprint: true
            };
          }
        }
      }
      
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
          boardId: context.data.board?.id,
          boardName: context.data.board?.name,
          calculatedSprint: nextSprint.calculatedSprint || false
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