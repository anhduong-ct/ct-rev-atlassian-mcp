import confluenceService from '../../services/confluence.js';
import { parseSprintFile as parseSprintFileUtil } from '../../utils/parser.js';
import { config } from '../../config.js';

/**
 * Get sprint planning content and assignments - RAW CONTENT FOR LLM ANALYSIS
 * Returns raw content for MCP clients (Copilot, Cursor) to analyze directly
 */
const getSprintPlanning = {
  name: 'get_sprint_planning',
  description: 'Get raw sprint planning content from Confluence for LLM analysis - PRIMARY TOOL for sprint assignments. Returns full raw content for MCP clients to analyze directly rather than pre-processed data.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Confluence page content (HTML or storage format, optional - if not provided, will fetch from the latest file)'
      },
      engineerName: {
        type: 'string',
        description: 'Name of the engineer to get assignments for (optional)'
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
  handler: async ({ content = null, engineerName = null, spaceKey = config.confluence.sprintPlanningSpace, searchTerms = ['sprint planning', 'Revenue', 'Start'] }) => {
    try {
      let rawContent = content;
      let pageInfo = null;
      
      // If no content provided, fetch from the latest sprint planning file
      if (!rawContent) {
        const searchQuery = searchTerms.map(term => {
          // If term looks like a sprint version number (e.g. 25.16)
          if (/^\d+\.\d+$/.test(term)) {
            // Convert 25.16 to both patterns: 2025-16 and 25.16
            const [major, minor] = term.split('.');
            const patterns = [
              `20${major}-${minor}`, // 2025-16 format
              term // 25.16 format
            ];
            return `(${patterns.map(p => `title ~ "${p}"`).join(' OR ')})`;
          }
          // If term contains spaces, wrap it properly
          if (term.includes(' ')) {
            return `(title ~ "\\"${term}\\"" OR text ~ "\\"${term}\\"")`;
          }
          return `(title ~ "${term}" OR text ~ "${term}")`;
        }).join(' AND ');
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
        rawContent = page.body.storage.value;
        
        // Properly construct Confluence page URL
        const cleanHost = config.confluence.host
          .replace(/^https?:\/\//, '')
          .replace(/\/$/, '');
        
        pageInfo = {
          title: page.title,
          url: `https://${cleanHost}/wiki${page._links.webui}`,
          lastModified: page.version.when,
          lastModifiedBy: page.version.by.displayName
        };
      }
      
      if (!rawContent) {
        return {
          success: false,
          error: 'No content provided or found'
        };
      }
      
      // RETURN RAW CONTENT FOR LLM ANALYSIS - No heavy processing
      // Let MCP clients (Copilot, Cursor) analyze the content directly
      
      // Get basic engineer list from simple parsing (for reference only)
      let availableEngineers = [];
      try {
        const parseResult = parseSprintFileUtil(rawContent);
        if (parseResult.success) {
          availableEngineers = Object.keys(parseResult.data || {});
        }
      } catch (error) {
        // Don't fail if parsing has issues - raw content is primary
        console.warn('Warning: Could not extract engineer list:', error.message);
      }
      
      return {
        success: true,
        data: {
          // PRIMARY: Raw content for MCP client analysis
          rawContent: rawContent,
          
          // INSTRUCTION FOR MCP CLIENT
          instruction: "This is the raw sprint planning content from Confluence. Please analyze this content directly to find sprint assignments. Look for engineer names followed by task assignments, CPPF tickets, and CRE tickets. The content may be in HTML format with nested lists.",
          
          // MINIMAL METADATA (don't over-process)
          pageInfo,
          availableEngineers,
          
          // SIMPLE STATS
          contentLength: rawContent.length,
          lastUpdated: pageInfo?.lastModified,
          
          // HINT FOR ENGINEER FILTERING (if requested)
          ...(engineerName && {
            engineerFilter: engineerName,
            hint: `Look for assignments for engineer: ${engineerName}. Check for patterns like '${engineerName}PIC', 'Web.${engineerName}', 'BE.${engineerName}', or '${engineerName}.PIC' in the content.`
          })
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Export only the essential tool - ONE tool that does it all
export default [getSprintPlanning];
