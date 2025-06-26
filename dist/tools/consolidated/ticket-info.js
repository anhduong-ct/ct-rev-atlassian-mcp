import workflowService from '../../services/refactored/workflow.js';
import { searchConfluence } from '../../services/confluence.js';
import { config } from '../../config.js';
import { getJiraTicketUrl } from '../../utils/urls.js';

/**
 * Consolidated Ticket Information Tool
 * Merges: analyze_cppf, get_cre_details, get_ticket_hierarchy, get_task_hierarchy_and_cppf, 
 *         get_parent_cre_story, get_cppf_from_cre_story, get_cppf_confluence_docs
 * LLM-First Approach: Returns raw ticket data for LLM analysis
 */
const getTicketInfo = {
  name: 'mcp_Atlassian_MCP_get_ticket_info',
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
        default: 'both',
        description: 'Direction to traverse the hierarchy (up for parents, down for children)'
      },
      includeDocuments: {
        type: 'boolean',
        default: true,
        description: 'Whether to include linked Confluence documents'
      },
      includeRawContent: {
        type: 'boolean',
        default: false,
        description: 'Whether to include raw content from linked documents'
      },
      role: {
        type: 'string',
        default: 'web',
        description: 'Role-specific requirement analysis (defaults to user configured role)'
      }
    },
    required: ['ticketId']
  },
  
  handler: async ({ 
    ticketId, 
    direction = 'both', 
    includeDocuments = true, 
    includeRawContent = false, 
    role = 'web' 
  }) => {
    try {
      // Get the main ticket information
      const ticketResponse = await workflowService.getIssue(ticketId, [
        'summary', 'description', 'status', 'assignee', 'priority', 'issuelinks', 
        'labels', 'components', 'created', 'updated', 'issuetype', 'project',
        'customfield_*', 'attachment', 'comment'
      ]);
      
      if (!ticketResponse.success) {
        return {
          success: false,
          error: `Failed to get ticket ${ticketId}: ${ticketResponse.error}`
        };
      }
      
      const ticket = ticketResponse.data;
      
      // Build hierarchy information
      let hierarchy = null;
      if (direction === 'up' || direction === 'both') {
        hierarchy = await buildHierarchyUp(ticket);
      }
      
      let children = null;
      if (direction === 'down' || direction === 'both') {
        children = await buildHierarchyDown(ticket);
      }
      
      // Get linked documents if requested
      let documents = null;
      if (includeDocuments) {
        documents = await getLinkedDocuments(ticket, includeRawContent);
      }
      
      // Return raw data for LLM analysis
      return {
        success: true,
        data: {
          ticket: {
            ...ticket, // Raw Jira ticket data
            url: getJiraTicketUrl(ticket.key),
            metadata: {
              ticketType: determineTicketType(ticket),
              platform: determinePlatform(ticket),
              roleRelevance: determineRoleRelevance(ticket, role)
            }
          },
          hierarchy: hierarchy ? {
            parents: hierarchy,
            direction: direction === 'both' ? 'up' : direction
          } : null,
          children: children ? {
            children: children,
            direction: direction === 'both' ? 'down' : direction
          } : null,
          documents: documents || null,
          filters: {
            direction,
            includeDocuments,
            includeRawContent,
            role
          },
          requestMetadata: {
            requestedAt: new Date().toISOString(),
            originalTicketId: ticketId
          }
        }
      };
    } catch (error) {
      console.error('Error getting ticket info:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

// Helper functions
async function buildHierarchyUp(ticket) {
  const parents = [];
  
  // Check for parent links
  if (ticket.fields.issuelinks) {
    for (const link of ticket.fields.issuelinks) {
      const linkedIssue = link.inwardIssue || link.outwardIssue;
      if (linkedIssue && isParentLink(link)) {
        try {
          const parentResponse = await workflowService.getIssue(linkedIssue.key, [
            'summary', 'description', 'status', 'assignee', 'priority', 'issuelinks',
            'labels', 'components', 'created', 'updated', 'issuetype'
          ]);
          
          if (parentResponse.success) {
            parents.push({
              ...parentResponse.data,
              url: getJiraTicketUrl(linkedIssue.key),
              linkType: link.type.name,
              relationship: getRelationshipType(link)
            });
          }
        } catch (error) {
          console.error(`Error fetching parent ${linkedIssue.key}:`, error);
        }
      }
    }
  }
  
  return parents;
}

async function buildHierarchyDown(ticket) {
  const children = [];
  
  // Check for child links
  if (ticket.fields.issuelinks) {
    for (const link of ticket.fields.issuelinks) {
      const linkedIssue = link.inwardIssue || link.outwardIssue;
      if (linkedIssue && isChildLink(link)) {
        try {
          const childResponse = await workflowService.getIssue(linkedIssue.key, [
            'summary', 'description', 'status', 'assignee', 'priority', 'issuelinks',
            'labels', 'components', 'created', 'updated', 'issuetype'
          ]);
          
          if (childResponse.success) {
            children.push({
              ...childResponse.data,
              url: getJiraTicketUrl(linkedIssue.key),
              linkType: link.type.name,
              relationship: getRelationshipType(link)
            });
          }
        } catch (error) {
          console.error(`Error fetching child ${linkedIssue.key}:`, error);
        }
      }
    }
  }
  
  return children;
}

async function getLinkedDocuments(ticket, includeRawContent = false) {
  const documents = [];
  
  // Search for Confluence documents that mention this ticket
  try {
    const searchResponse = await searchConfluence({
      cql: `text ~ "${ticket.key}" ORDER BY lastModified DESC`,
      limit: 10,
      expand: 'content.metadata.labels,content.version,content.body.storage'
    });
    
    if (searchResponse.success && searchResponse.data.results.length > 0) {
      for (const result of searchResponse.data.results) {
        const doc = {
          id: result.content.id,
          title: result.content.title,
          url: result.url,
          lastModified: result.content.version.when,
          author: result.content.version.by.displayName,
          space: result.content.space?.name,
          excerpt: result.excerpt
        };
        
        // Include raw content if requested
        if (includeRawContent && result.content.body?.storage?.value) {
          doc.rawContent = result.content.body.storage.value;
        }
        
        documents.push(doc);
      }
    }
  } catch (error) {
    console.error('Error searching for linked documents:', error);
    // Don't fail the whole request for document search failures
  }
  
  return documents;
}

// Utility functions
function determineTicketType(ticket) {
  const issueType = ticket.fields.issuetype?.name?.toLowerCase() || '';
  const project = ticket.fields.project?.key || '';
  
  if (project === config.jira.projects.cppf) {
    return 'CPPF';
  } else if (project === config.jira.projects.cre) {
    if (issueType.includes('story')) {
      return 'CRE_STORY';
    } else if (issueType.includes('task')) {
      return 'CRE_TASK';
    }
    return 'CRE';
  }
  
  return 'OTHER';
}

function determinePlatform(ticket) {
  // Check components first
  if (ticket.fields.components && ticket.fields.components.length > 0) {
    const platformComponent = ticket.fields.components.find(comp => 
      ['web', 'backend', 'app', 'ios'].includes(comp.name.toLowerCase())
    );
    if (platformComponent) return platformComponent.name;
  }
  
  // Then check labels
  if (ticket.fields.labels && ticket.fields.labels.length > 0) {
    const platformLabel = ticket.fields.labels.find(label => 
      ['web', 'backend', 'app', 'ios'].includes(label.toLowerCase())
    );
    if (platformLabel) return platformLabel;
  }
  
  return 'unknown';
}

function determineRoleRelevance(ticket, role) {
  const platform = determinePlatform(ticket);
  const assignee = ticket.fields.assignee?.displayName || '';
  const currentUser = config.user.displayName || '';
  
  return {
    platformMatch: platform.toLowerCase() === role.toLowerCase(),
    assignedToUser: assignee === currentUser,
    relevanceScore: calculateRelevanceScore(ticket, role)
  };
}

function calculateRelevanceScore(ticket, role) {
  let score = 0;
  
  // Platform match
  if (determinePlatform(ticket).toLowerCase() === role.toLowerCase()) {
    score += 50;
  }
  
  // Assignment match
  if (ticket.fields.assignee?.displayName === config.user.displayName) {
    score += 30;
  }
  
  // Status relevance
  const status = ticket.fields.status?.name?.toLowerCase() || '';
  if (['in progress', 'selected for development'].includes(status)) {
    score += 20;
  }
  
  return score;
}

function isParentLink(link) {
  const linkType = link.type.name.toLowerCase();
  return linkType.includes('epic') || linkType.includes('story') || linkType.includes('parent');
}

function isChildLink(link) {
  const linkType = link.type.name.toLowerCase();
  return linkType.includes('subtask') || linkType.includes('child') || linkType.includes('task');
}

function getRelationshipType(link) {
  if (link.inwardIssue) {
    return `${link.type.inward} ${link.inwardIssue.key}`;
  } else if (link.outwardIssue) {
    return `${link.type.outward} ${link.outwardIssue.key}`;
  }
  return link.type.name;
}

export default [getTicketInfo]; 