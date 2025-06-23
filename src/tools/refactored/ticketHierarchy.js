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

/**
 * Get comprehensive ticket information with hierarchy and documents - OPTIMIZED VERSION
 * Returns filtered data to prevent LLM overload while maintaining functionality
 */
const getTicketInfo = {
  name: 'get_ticket_info',
  description: 'Get comprehensive ticket information with hierarchy and documents - unified access to CPPF/CRE tickets',
  inputSchema: {
    type: 'object',
    properties: {
      ticketId: {
        type: 'string',
        description: 'Any ticket ID (CRE task, CRE story, or CPPF)'
      },
      direction: {
        type: 'string',
        enum: ['up', 'down', 'both'],
        description: 'Direction to traverse the hierarchy (up for parents, down for children)',
        default: 'both'
      },
      includeDocuments: {
        type: 'boolean',
        description: 'Whether to include linked Confluence documents',
        default: true
      },
      includeRawContent: {
        type: 'boolean',
        description: 'Whether to include raw content from linked documents',
        default: false
      },
      role: {
        type: 'string',
        description: 'Role-specific requirement analysis (defaults to user configured role)',
        default: config.user.role
      }
    },
    required: ['ticketId']
  },
  handler: async ({ ticketId, direction = 'both', includeDocuments = true, includeRawContent = false, role = config.user.role }) => {
    try {
      if (!ticketId) {
        return {
          success: false,
          error: 'Ticket ID is required'
        };
      }
      
      // Determine ticket type
      const isCPPF = ticketId.startsWith(config.jira.projects.cppf);
      const isCRE = ticketId.startsWith(config.jira.projects.cre);
      
      if (!isCPPF && !isCRE) {
        return {
          success: false,
          error: `Unsupported ticket type. Expected CPPF or CRE ticket, got: ${ticketId}`
        };
      }
      
      // Get ticket details with hierarchy
      const response = await workflowService.getTicketHierarchy(ticketId, direction);
      
      if (!response.success) {
        return response;
      }
      
      const { ticket, parents, children, linkedIssues } = response.data;
      
      // FILTERED TICKET DATA - Only essential fields
      const filteredTicket = {
        key: ticket.key,
        url: getJiraTicketUrl(ticket.key),
        summary: ticket.fields.summary,
        status: ticket.fields.status?.name || 'Unknown',
        priority: ticket.fields.priority?.name || 'No Priority',
        assignee: ticket.fields.assignee ? ticket.fields.assignee.displayName : 'Unassigned',
        reporter: ticket.fields.reporter ? ticket.fields.reporter.displayName : 'Unknown',
        created: ticket.fields.created,
        updated: ticket.fields.updated,
        type: ticket.fields.issuetype?.name || 'Unknown',
        components: (ticket.fields.components || []).map(comp => comp.name),
        labels: ticket.fields.labels || []
      };
      
      // FILTERED HIERARCHY DATA
      const filteredParents = parents.map(parent => ({
        key: parent.key,
        url: getJiraTicketUrl(parent.key),
        summary: parent.fields.summary,
        status: parent.fields.status?.name || 'Unknown',
        type: parent.fields.issuetype?.name || 'Unknown'
      }));
      
      const filteredChildren = children.map(child => ({
        key: child.key,
        url: getJiraTicketUrl(child.key),
        summary: child.fields.summary,
        status: child.fields.status?.name || 'Unknown',
        assignee: child.fields.assignee ? child.fields.assignee.displayName : 'Unassigned',
        type: child.fields.issuetype?.name || 'Unknown'
      }));
      
      const filteredLinkedIssues = linkedIssues.map(linked => ({
        key: linked.key,
        url: getJiraTicketUrl(linked.key),
        summary: linked.fields.summary,
        status: linked.fields.status?.name || 'Unknown',
        type: linked.fields.issuetype?.name || 'Unknown',
        linkType: linked.linkType || 'Unknown'
      }));
      
      const result = {
        success: true,
        data: {
          // STRUCTURED METADATA (efficient for LLM)
          ticket: filteredTicket,
          hierarchy: {
            parents: filteredParents,
            children: filteredChildren,
            linkedIssues: filteredLinkedIssues,
            totalRelated: filteredParents.length + filteredChildren.length + filteredLinkedIssues.length
          },
          
          // ANALYSIS SUMMARY
          analysis: {
            ticketType: isCPPF ? 'CPPF' : 'CRE',
            role,
            hasChildren: filteredChildren.length > 0,
            hasParents: filteredParents.length > 0,
            hierarchyLevel: isCPPF ? 'Epic' : (filteredChildren.length > 0 ? 'Story' : 'Task'),
            completionStatus: getTicketInfo.getCompletionStatus(filteredTicket.status)
          }
        }
      };
      
      // Add documents if requested
      if (includeDocuments && isCPPF) {
        try {
          // For CPPF tickets, get linked Confluence documents
          const docsResponse = await workflowService.getCPPFDetails(ticketId);
          if (docsResponse.success && docsResponse.data.confluenceDocs) {
            result.data.linkedDocuments = docsResponse.data.confluenceDocs.map(doc => ({
              id: doc.id,
              title: doc.title,
              url: doc._links?.webui ? `${config.confluence.host}/wiki${doc._links.webui}` : null,
              lastModified: doc.version?.when || 'Unknown',
              space: doc.space?.name || 'Unknown'
            }));
            
            // Add raw content only if specifically requested
            if (includeRawContent) {
              result.data.analysisContent = {
                description: ticket.fields.description,
                confluenceDocs: docsResponse.data.confluenceDocs.map(doc => ({
                  title: doc.title,
                  content: doc.body?.storage?.value
                }))
              };
            }
          }
        } catch (error) {
          console.warn('Failed to get Confluence documents:', error.message);
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error getting ticket info:', error.message);
      return { success: false, error: error.message };
    }
  },
  
  // Helper method
  getCompletionStatus(status) {
    const completedStatuses = ['Done', 'Closed', 'Completed', 'Resolved'];
    const inProgressStatuses = ['In Progress', 'In Review', 'Testing'];
    
    if (completedStatuses.includes(status)) {
      return 'Completed';
    } else if (inProgressStatuses.includes(status)) {
      return 'In Progress';
    } else {
      return 'Not Started';
    }
  }
};

export default [getTicketHierarchy, getTicketInfo];
