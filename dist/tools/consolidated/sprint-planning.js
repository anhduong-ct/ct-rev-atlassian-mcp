import { searchConfluence, getPageContent } from '../../services/confluence.js';
import { parseSprintFile } from '../../utils/parser.js';
import { config } from '../../config.js';

/**
 * Consolidated Sprint Planning Tool
 * Merges: find_latest_sprint_planning_file, get_confluence_sprint_assignments, parse_sprint_file
 * LLM-First Approach: Returns raw Confluence content for LLM analysis
 */
const getSprintPlanning = {
  name: 'mcp_Atlassian_MCP_get_sprint_planning',
  description: 'Get raw sprint planning content from Confluence for LLM analysis - unified access to sprint planning documents',
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
      searchTerms: {
        type: 'array',
        items: { type: 'string' },
        default: ['sprint planning', 'Revenue', 'Start'],
        description: 'Search terms to identify sprint planning files (only used when content is not provided)'
      },
      spaceKey: {
        type: 'string',
        default: '~629041681a437e007044041e',
        description: 'Confluence space key to search in (defaults to configured SPRINT_PLANNING_SPACE)'
      }
    }
  },
  
  handler: async ({ 
    content, 
    engineerName, 
    searchTerms = ['sprint planning', 'Revenue', 'Start'], 
    spaceKey = '~629041681a437e007044041e' 
  }) => {
    try {
      let rawContent = content;
      let pageMetadata = null;
      
      // If no content provided, find the latest sprint planning file
      if (!rawContent) {
        try {
          // Build search query
          const searchQuery = searchTerms.map(term => `"${term}"`).join(' AND ');
          
          // Search for sprint planning documents
          const searchResponse = await searchConfluence({
            cql: `space = "${spaceKey}" AND text ~ "${searchQuery}" ORDER BY lastModified DESC`,
            limit: 10,
            expand: 'content.metadata.labels,content.version,content.body.storage'
          });
          
          if (searchResponse.success && searchResponse.data.results.length > 0) {
            // Get the most recent document
            const latestDoc = searchResponse.data.results[0];
            pageMetadata = {
              id: latestDoc.content.id,
              title: latestDoc.content.title,
              url: latestDoc.url,
              lastModified: latestDoc.content.version.when,
              author: latestDoc.content.version.by.displayName,
              space: latestDoc.content.space?.name || spaceKey
            };
            
            // Get full page content
            const pageResponse = await getPageContent(latestDoc.content.id, {
              expand: 'body.storage,version,metadata.labels'
            });
            
            if (pageResponse.success) {
              rawContent = pageResponse.data.body.storage.value;
              pageMetadata = {
                ...pageMetadata,
                labels: pageResponse.data.metadata?.labels?.results || []
              };
            }
          }
        } catch (error) {
          console.error('Error finding sprint planning file:', error);
          return {
            success: false,
            error: `Failed to find sprint planning file: ${error.message}`
          };
        }
      }
      
      if (!rawContent) {
        return {
          success: false,
          error: 'No sprint planning content found'
        };
      }
      
      // Parse content if needed (optional - LLM can handle raw content)
      let parsedData = null;
      try {
        if (rawContent.includes('<table') || rawContent.includes('|')) {
          // Only parse if it looks like structured data
          parsedData = parseSprintFile(rawContent);
        }
      } catch (parseError) {
        console.error('Parsing failed, returning raw content:', parseError);
        // Don't fail - LLM can handle raw content better than failed parsing
      }
      
      // Filter by engineer if requested
      let filteredAssignments = null;
      if (engineerName && parsedData && parsedData.assignments) {
        filteredAssignments = parsedData.assignments.filter(assignment => 
          assignment.assignee && 
          assignment.assignee.toLowerCase().includes(engineerName.toLowerCase())
        );
      }
      
      // Return raw data for LLM analysis
      return {
        success: true,
        data: {
          content: rawContent, // Raw Confluence HTML/storage format
          metadata: pageMetadata ? {
            ...pageMetadata,
            searchTerms,
            spaceKey,
            fetchedAt: new Date().toISOString()
          } : {
            providedContent: true,
            searchTerms,
            spaceKey,
            processedAt: new Date().toISOString()
          },
          parsedData: parsedData || null, // Optional parsed structure
          filteredAssignments: filteredAssignments || null, // Optional filtered results
          filters: {
            engineerName
          }
        }
      };
    } catch (error) {
      console.error('Error getting sprint planning:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

export default [getSprintPlanning]; 