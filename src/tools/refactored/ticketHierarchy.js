import workflowService from '../../services/refactored/workflow.js';
import { config } from '../../config.js';
import { getJiraTicketUrl, getConfluenceWebUiUrl, enhanceWithUrls } from '../../utils/urls.js';

/**
 * Get ticket hierarchy - Consolidated tool that merges get_parent_cre_story, get_cppf_from_cre_story and get_task_hierarchy_and_cppf
 * A single tool that can navigate the ticket hierarchy in any direction
 */
const getTicketHierarchy = {
  name: 'get_ticket_hierarchy',
  description: 'Get full ticket hierarchy information for any ticket (CRE task, CRE story, or CPPF)',
  inputSchema: {
    type: 'object',
    properties: {
      ticketId: {
        type: 'string',
        description: 'Any ticket ID (CRE task, CRE story, CPPF)'
      },
      direction: {
        type: 'string',
        enum: ['up', 'down', 'both'],
        default: 'both',
        description: 'Direction to traverse the hierarchy (up for parents, down for children)'
      },
      includeDocuments: {
        type: 'boolean',
        default: true,
        description: 'Whether to include linked Confluence documents'
      }
    },
    required: ['ticketId']
  },
  handler: async ({ ticketId, direction = 'both', includeDocuments = true }) => {
    try {
      if (!ticketId) {
        return {
          success: false,
          error: 'Ticket ID is required'
        };
      }
      
      // Determine the ticket type (CRE task, CRE story, or CPPF)
      let ticketType = 'unknown';
      let formattedTicketId = ticketId;
      
      // Ensure ticket ID is in correct format with project key prefix
      if (ticketId.startsWith(config.jira.projects.cre + '-')) {
        ticketType = 'cre';
      } else if (ticketId.startsWith(config.jira.projects.cppf + '-')) {
        ticketType = 'cppf';
      } else if (!isNaN(ticketId)) {
        // Assume CRE by default for numeric IDs without project code
        ticketType = 'cre';
        formattedTicketId = `${config.jira.projects.cre}-${ticketId}`;
      }
      
      if (ticketType === 'unknown') {
        return {
          success: false,
          error: `Invalid ticket ID format: ${ticketId}. Expected format: {PROJECT}-{NUMBER}`
        };
      }
      
      // Get full hierarchy with one call to avoid multiple API requests
      const response = await workflowService.getFullHierarchy(formattedTicketId, direction, includeDocuments);
      
      if (!response.success) {
        return response;
      }
      
      // Format the response with all links and details
      const result = {
        success: true,
        data: {
          startingTicket: {
            id: formattedTicketId,
            type: ticketType,
            url: getJiraTicketUrl(formattedTicketId),
            ...response.data.startingTicket
          },
          hierarchy: response.data.hierarchy,
          referenceLinks: {}
        }
      };
      
      // Add reference links based on available data
      if (response.data.cppf) {
        result.data.referenceLinks.cppfProject = getJiraTicketUrl(response.data.cppf.key).replace(/\/browse\/.*$/, `/projects/${response.data.cppf.key.split('-')[0]}`);
      }
      
      if (response.data.story) {
        result.data.referenceLinks.creProject = getJiraTicketUrl(response.data.story.key).replace(/\/browse\/.*$/, `/projects/${response.data.story.key.split('-')[0]}`);
      }
      
      if (includeDocuments && response.data.documents) {
        result.data.documents = response.data.documents;
      }
      
      return result;
    } catch (error) {
      console.error('Error getting ticket hierarchy:', error.message);
      return { success: false, error: error.message };
    }
  }
};

export default [getTicketHierarchy];
