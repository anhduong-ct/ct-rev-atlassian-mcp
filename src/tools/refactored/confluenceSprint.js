import confluenceService from '../../services/confluence.js';
import { parseSprintFile } from '../../utils/parser.js';
import { config } from '../../config.js';

/**
 * Get confluence sprint assignments - Consolidated tool that merges extract_assigned_tasks and get_engineer_assignments_from_confluence
 * A single tool that can extract tasks from either provided content or the latest sprint planning file
 */
const getConfluenceSprintAssignments = {
  name: 'get_confluence_sprint_assignments',
  description: 'Get sprint assignments from Confluence with flexible options (from content or latest file)',
  inputSchema: {
    type: 'object',
    properties: {
      engineerName: {
        type: 'string',
        description: 'Name of the engineer to get assignments for (optional)'
      },
      content: {
        type: 'string',
        description: 'Confluence page content (HTML or storage format, optional - if not provided, will fetch from the latest file)'
      },
      spaceKey: {
        type: 'string',
        description: 'Confluence space key to search in (defaults to configured SPRINT_PLANNING_SPACE)',
        default: config.confluence.sprintPlanningSpace
      },
      searchTerms: {
        type: 'array',
        items: { type: 'string' },
        description: 'Search terms to identify sprint planning files (only used when content is not provided)',
        default: ['sprint planning', 'Revenue', 'Start']
      }
    }
  },
  handler: async ({ engineerName = null, content = null, spaceKey = config.confluence.sprintPlanningSpace, searchTerms = ['sprint planning', 'Revenue', 'Start'] }) => {
    try {
      let pageContent = content;
      let pageInfo = null;
      
      // If no content provided, fetch from the latest sprint planning file
      if (!pageContent) {
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
        
        // Store the page information
        pageContent = pageResult.data.body.storage.value;
        const page = pageResult.data;
        
        // Properly construct Confluence page URL
        const cleanHost = config.confluence.host
          .replace(/^https?:\/\//, '')
          .replace(/\/$/, '');
        
        pageInfo = {
          pageId: page.id,
          title: page.title,
          url: `https://${cleanHost}/wiki${page._links.webui}`,
          lastModified: page.version.when,
          lastModifiedBy: page.version.by.displayName,
          space: page.space,
          otherFiles: sortedResults.slice(1, 5).map(file => ({
            id: file.id,
            title: file.title,
            lastModified: file.version.when,
            url: `https://${cleanHost}/wiki${file._links.webui}`
          }))
        };
      }
      
      if (!pageContent) {
        return {
          success: false,
          error: 'Failed to retrieve or use Confluence content'
        };
      }
      
      // Parse the sprint assignments from the content
      const parseResult = parseSprintFile(pageContent);
      
      if (!parseResult.success) {
        return parseResult;
      }
      
      const { assignments, sections } = parseResult.data;
      
      // Group assignments by engineer with enhanced metadata
      const engineerAssignments = {};
      
      assignments.forEach(assignment => {
        assignment.assignees.forEach(assignee => {
          const { name, role, platform, confident, storyPoints } = assignee;
          
          if (!engineerAssignments[name]) {
            engineerAssignments[name] = [];
          }
          
          // Construct proper links
          const cleanJiraHost = config.jira.host
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, '');

          const task = {
            cppfId: assignment.cppfId,
            creId: assignment.creId,
            section: assignment.section,
            description: assignment.description || 'No description',
            platforms: assignment.platforms || [],
            role,
            platform,
            status: assignment.status || {},
            confident,
            storyPoints,
            dates: assignment.dates || {},
            // URLs
            url: assignment.creId ? `https://${cleanJiraHost}/browse/${assignment.creId}` : null,
            cppfUrl: assignment.cppfId ? `https://${cleanJiraHost}/browse/${assignment.cppfId}` : null
          };
          
          engineerAssignments[name].push(task);
        });
      });
      
      // If specific engineer requested, filter for that engineer
      if (engineerName) {
        const normalizedEngineerName = engineerName.toLowerCase().trim();
        
        // Find matching engineer (case-insensitive, partial match)
        const matchingEngineer = Object.keys(engineerAssignments).find(name => 
          name.toLowerCase().includes(normalizedEngineerName) ||
          normalizedEngineerName.includes(name.toLowerCase())
        );
        
        if (!matchingEngineer) {
          return {
            success: false,
            error: `Engineer "${engineerName}" not found in assignments. Available engineers: ${Object.keys(engineerAssignments).join(', ')}`
          };
        }
        
        return {
          success: true,
          data: {
            engineer: matchingEngineer,
            tasks: engineerAssignments[matchingEngineer],
            totalTasks: engineerAssignments[matchingEngineer].length,
            availableEngineers: Object.keys(engineerAssignments),
            sections,
            pageInfo
          }
        };
      }
      
      // Return all assignments
      const summary = Object.entries(engineerAssignments).map(([engineer, tasks]) => ({
        engineer,
        taskCount: tasks.length,
        tasks,
        statistics: {
          bySection: tasks.reduce((acc, task) => {
            acc[task.section] = (acc[task.section] || 0) + 1;
            return acc;
          }, {}),
          byPlatform: tasks.reduce((acc, task) => {
            if (task.platform) {
              acc[task.platform] = (acc[task.platform] || 0) + 1;
            }
            return acc;
          }, {}),
          byStatus: tasks.reduce((acc, task) => {
            const status = task.status.deleted ? 'Deleted' : 
                          task.status.done ? 'Done' : 'In Progress';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          }, {})
        }
      }));
      
      // Calculate overall statistics
      const totalTasks = summary.reduce((sum, { taskCount }) => sum + taskCount, 0);
      const allSections = [...new Set(assignments.map(a => a.section))];
      const allPlatforms = [...new Set(assignments.flatMap(a => a.platforms || []))];

      return {
        success: true,
        data: {
          totalEngineers: summary.length,
          totalTasks,
          assignments: summary,
          sections: allSections,
          platforms: allPlatforms,
          statistics: {
            bySection: assignments.reduce((acc, a) => {
              acc[a.section] = (acc[a.section] || 0) + 1;
              return acc;
            }, {}),
            byPlatform: assignments.reduce((acc, a) => {
              (a.platforms || []).forEach(p => {
                acc[p] = (acc[p] || 0) + 1;
              });
              return acc;
            }, {}),
            byStatus: assignments.reduce((acc, a) => {
              const status = a.status.deleted ? 'Deleted' : 
                           a.status.done ? 'Done' : 'In Progress';
              acc[status] = (acc[status] || 0) + 1;
              return acc;
            }, {})
          },
          pageInfo,
          warnings: parseResult.warnings || []
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

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

export default [getConfluenceSprintAssignments, findLatestSprintPlanningFile];
