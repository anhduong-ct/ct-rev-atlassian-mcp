import confluenceService from '../services/confluence.js';
import { parseSprintFile } from '../utils/parser.js';
import { config } from '../config.js';

/**
 * Find the latest sprint planning Confluence file in a specific space
 */
const findLatestSprintPlanningFile = {
  name: 'find_latest_sprint_planning_file',
  description: 'Find the latest sprint planning Confluence file in a specific space',
  inputSchema: {
    type: 'object',
    properties: {
      spaceKey: {
        type: 'string',
        description: 'Confluence space key to search in (defaults to configured SPRINT_PLANNING_SPACE)',
        default: config.confluence.sprintPlanningSpace
      },
      searchTerms: {
        type: 'array',
        items: { type: 'string' },
        description: 'Search terms to identify sprint planning files',
        default: ['sprint planning', 'Revenue', 'Start']
      }
    }
  },
  handler: async ({ spaceKey = config.confluence.sprintPlanningSpace, searchTerms = ['sprint planning', 'Revenue', 'Start'] }) => {
    try {
      // Search for pages containing sprint planning terms
      // Use proper CQL text search syntax
      const searchQuery = searchTerms.map(term => `text ~ "${term}"`).join(' AND ');
      const searchResult = await confluenceService.searchContent(searchQuery, spaceKey, 'page', 50);
      
      if (!searchResult.success) {
        return {
          success: false,
          error: `Failed to search Confluence space: ${searchResult.error}`
        };
      }
      
      if (!searchResult.data.results || searchResult.data.results.length === 0) {
        return {
          success: false,
          error: 'No sprint planning files found in the specified space'
        };
      }
      
      // Sort by created date descending to get the latest file
      const sortedResults = searchResult.data.results.sort((a, b) => {
        const dateA = new Date(a.version.when);
        const dateB = new Date(b.version.when);
        return dateB.getTime() - dateA.getTime();
      });
      
      const latestFile = sortedResults[0];
      
      // Get the full page content
      const pageResult = await confluenceService.getPage(latestFile.id);
      
      if (!pageResult.success) {
        return {
          success: false,
          error: `Failed to retrieve page content: ${pageResult.error}`
        };
      }
      
      const page = pageResult.data;
      
      // Properly construct Confluence page URL
      const cleanHost = config.confluence.host
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');
      
      return {
        success: true,
        data: {
          pageId: page.id,
          title: page.title,
          url: `https://${cleanHost}/wiki${page._links.webui}`,
          lastModified: page.version.when,
          lastModifiedBy: page.version.by.displayName,
          content: page.body.storage.value,
          space: page.space,
          totalResults: sortedResults.length,
          otherFiles: sortedResults.slice(1, 5).map(file => ({
            id: file.id,
            title: file.title,
            lastModified: file.version.when,
            url: `https://${cleanHost}/wiki${file._links.webui}`
          }))
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

/**
 * Extract assigned tasks from Confluence sprint planning content
 */
const extractAssignedTasks = {
  name: 'extract_assigned_tasks',
  description: 'Extract assigned tasks from Confluence sprint planning content',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Confluence page content (HTML or storage format)'
      },
      engineerName: {
        type: 'string',
        description: 'Name of the engineer to extract tasks for (optional - if not provided, returns all assignments)'
      }
    },
    required: ['content']
  },
  handler: async ({ content, engineerName = null }) => {
    try {
      if (!content) {
        return {
          success: false,
          error: 'No content provided'
        };
      }
      
      // Clean HTML content and convert to plain text for parsing
      // const cleanContent = cleanConfluenceContent(content);
      
      // Use the existing sprint file parser
      const parseResult = parseSprintFile(content);
      
      if (!parseResult.success) {
        return parseResult;
      }
      
      const assignments = parseResult.data;
      
      // If specific engineer requested, filter for that engineer
      if (engineerName) {
        const normalizedEngineerName = engineerName.toLowerCase().trim();
        
        // Find matching engineer (case-insensitive, partial match)
        const matchingEngineer = Object.keys(assignments).find(name => 
          name.toLowerCase().includes(normalizedEngineerName) ||
          normalizedEngineerName.includes(name.toLowerCase())
        );
        
        if (!matchingEngineer) {
          return {
            success: false,
            error: `Engineer "${engineerName}" not found in assignments. Available engineers: ${Object.keys(assignments).join(', ')}`
          };
        }
        
        return {
          success: true,
          data: {
            engineer: matchingEngineer,
            tasks: assignments[matchingEngineer],
            totalTasks: assignments[matchingEngineer].length,
            availableEngineers: Object.keys(assignments)
          }
        };
      }
      
      // Return all assignments
      const summary = Object.entries(assignments).map(([engineer, tasks]) => ({
        engineer,
        taskCount: tasks.length,
        tasks: tasks.map(task => {
          // Properly construct Jira ticket URL
          const cleanJiraHost = config.jira.host
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, '');
          
          return {
            ticketId: task.ticketId,
            description: task.description || 'No description',
            url: task.ticketId ? `https://${cleanJiraHost}/browse/${task.ticketId}` : null
          };
        })
      }));
      
      return {
        success: true,
        data: {
          totalEngineers: Object.keys(assignments).length,
          totalTasks: Object.values(assignments).reduce((sum, tasks) => sum + tasks.length, 0),
          assignments: summary
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

/**
 * Get tasks assigned to a specific engineer from the latest sprint planning file
 */
const getEngineerAssignments = {
  name: 'get_engineer_assignments_from_confluence',
  description: 'Get tasks assigned to a specific engineer from the latest sprint planning Confluence file',
  inputSchema: {
    type: 'object',
    properties: {
      engineerName: {
        type: 'string',
        description: 'Name of the engineer to get assignments for'
      },
      spaceKey: {
        type: 'string',
        description: 'Confluence space key to search in (defaults to configured SPRINT_PLANNING_SPACE)',
        default: config.confluence.sprintPlanningSpace
      }
    },
    required: ['engineerName']
  },
  handler: async ({ engineerName, spaceKey = config.confluence.sprintPlanningSpace }) => {
    try {
      // First, find the latest sprint planning file
      const fileResult = await findLatestSprintPlanningFile.handler({ spaceKey });
      
      if (!fileResult.success) {
        return fileResult;
      }
      
      // Then extract tasks for the specific engineer
      const tasksResult = await extractAssignedTasks.handler({ 
        content: fileResult.data.content, 
        engineerName 
      });
      
      if (!tasksResult.success) {
        return tasksResult;
      }
      
      // Combine the results
      return {
        success: true,
        data: {
          engineer: tasksResult.data.engineer,
          tasks: tasksResult.data.tasks,
          totalTasks: tasksResult.data.totalTasks,
          sourceFile: {
            title: fileResult.data.title,
            url: fileResult.data.url,
            lastModified: fileResult.data.lastModified,
            lastModifiedBy: fileResult.data.lastModifiedBy
          },
          availableEngineers: tasksResult.data.availableEngineers
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

/**
 * Helper function to clean Confluence HTML content
 */
function cleanConfluenceContent(content) {
  if (!content) return '';
  
  // Remove HTML tags
  let cleaned = content.replace(/<[^>]*>/g, ' ');
  
  // Decode HTML entities
  cleaned = cleaned
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  
  // Clean up whitespace
  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
  
  return cleaned;
}

export default [
  findLatestSprintPlanningFile,
  extractAssignedTasks,
  getEngineerAssignments
]; 