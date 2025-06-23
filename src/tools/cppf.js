import workflowService from '../services/workflow.js';
import { config } from '../config.js';
import { getJiraTicketUrl, getConfluenceWebUiUrl, enhanceWithUrls } from '../utils/urls.js';

/**
 * Get CPPF ticket + linked Confluence docs
 */
const getCPPFDetails = {
  name: 'get_cppf_details',
  description: 'Get CPPF ticket + linked Confluence docs',
  inputSchema: {
    type: 'object',
    properties: {
      cppf_id: {
        type: 'string',
        description: 'CPPF ticket ID (e.g. CPPF-1234)'
      }
    },
    required: ['cppf_id']
  },
  handler: async ({ cppf_id }) => {
    try {
      if (!cppf_id) {
        return {
          success: false,
          error: 'CPPF ID is required'
        };
      }
      
      // Ensure CPPF ID is in correct format
      if (!cppf_id.startsWith(config.jira.projects.cppf + '-')) {
        cppf_id = `${config.jira.projects.cppf}-${cppf_id}`;
      }
      
      const response = await workflowService.getCPPFDetails(cppf_id);
      
      if (!response.success) {
        return response;
      }
      
      // Format the response for better readability
      const cppf = response.data.cppf;
      const confluenceDocs = response.data.confluenceDocs;
      const figmaLinks = response.data.figmaLinks;
      
      const formattedResponse = {
        key: cppf.key,
        url: getJiraTicketUrl(cppf.key),
        summary: cppf.fields.summary,
        description: cppf.fields.description,
        status: cppf.fields.status?.name || 'Unknown',
        priority: cppf.fields.priority?.name || 'No Priority',
        assignee: cppf.fields.assignee ? cppf.fields.assignee.displayName : 'Unassigned',
        created: cppf.fields.created,
        updated: cppf.fields.updated,
        confluenceDocs: confluenceDocs.map(doc => ({
          id: doc.id,
          title: doc.title,
          url: getConfluenceWebUiUrl(doc),
          space: doc.space ? doc.space.name : 'Unknown'
        })),
        figmaLinks
      };
      
      // Add reference links
      const enhanced = enhanceWithUrls(formattedResponse);
      
      return {
        success: true,
        data: enhanced
      };
    } catch (error) {
      console.error(`Error getting CPPF details for ${cppf_id}:`, error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Analyze CPPF ticket for specific role
 */
const analyzeCPPFForRole = {
  name: 'analyze_cppf_for_role',
  description: 'Role-specific requirement analysis',
  inputSchema: {
    type: 'object',
    properties: {
      cppf_id: {
        type: 'string',
        description: 'CPPF ticket ID (e.g. CPPF-1234)'
      },
      role: {
        type: 'string',
        description: 'Engineering role (web, backend, app, ios, fullstack)',
        default: config.user.role
      }
    },
    required: ['cppf_id']
  },
  handler: async ({ cppf_id, role = config.user.role }) => {
    try {
      if (!cppf_id) {
        return {
          success: false,
          error: 'CPPF ID is required'
        };
      }
      
      // Ensure CPPF ID is in correct format
      if (!cppf_id.startsWith(config.jira.projects.cppf + '-')) {
        cppf_id = `${config.jira.projects.cppf}-${cppf_id}`;
      }
      
      // Validate role
      const validRoles = ['web', 'backend', 'app', 'ios', 'fullstack'];
      if (!validRoles.includes(role)) {
        return {
          success: false,
          error: `Invalid role: ${role}. Valid roles are: ${validRoles.join(', ')}`
        };
      }
      
      const response = await workflowService.analyzeCPPFForRole(cppf_id, role);
      
      if (!response.success) {
        return response;
      }
      
      // Enhance the response with URLs
      const enhanced = { ...response.data };
      enhanced.url = getJiraTicketUrl(cppf_id);
      
      // Add URLs to linked CRE stories if any
      if (enhanced.linkedCREStories && Array.isArray(enhanced.linkedCREStories)) {
        enhanced.linkedCREStories = enhanced.linkedCREStories.map(story => ({
          ...story,
          url: getJiraTicketUrl(story.key)
        }));
      }
      
      // Add reference links
      enhanced.referenceLinks = {
        jiraProject: getJiraTicketUrl(cppf_id) ? getJiraTicketUrl(cppf_id).replace(/\/browse\/.*$/, `/projects/${cppf_id.split('-')[0]}`) : null,
        jiraBoard: getJiraTicketUrl(cppf_id) ? getJiraTicketUrl(cppf_id).replace(/\/browse\/.*$/, `/secure/RapidBoard.jspa?projectKey=${cppf_id.split('-')[0]}`) : null
      };
      
      return {
        success: true,
        data: enhanced
      };
    } catch (error) {
      console.error(`Error analyzing CPPF ${cppf_id} for role ${role}:`, error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Get all Confluence docs linked to a CPPF ticket
 */
const getCPPFConfluenceDocs = {
  name: 'get_cppf_confluence_docs',
  description: 'Get all linked documentation',
  inputSchema: {
    type: 'object',
    properties: {
      cppf_id: {
        type: 'string',
        description: 'CPPF ticket ID (e.g. CPPF-1234)'
      }
    },
    required: ['cppf_id']
  },
  handler: async ({ cppf_id }) => {
    try {
      if (!cppf_id) {
        return {
          success: false,
          error: 'CPPF ID is required'
        };
      }
      
      // Ensure CPPF ID is in correct format
      if (!cppf_id.startsWith(config.jira.projects.cppf + '-')) {
        cppf_id = `${config.jira.projects.cppf}-${cppf_id}`;
      }
      
      const response = await workflowService.getCPPFConfluenceDocs(cppf_id);
      
      if (!response.success || !response.data || !Array.isArray(response.data)) {
        console.error(`Error fetching Confluence docs for ${cppf_id}:`, response.error || 'No data found');
        return response;
      }
      
      // Format the response for better readability
      const formattedDocs = response.data.map(doc => ({
        id: doc.id,
        title: doc.title,
        url: getConfluenceWebUiUrl(doc),
        space: doc.space ? doc.space.name : 'Unknown',
        lastUpdated: doc.version ? doc.version.when : 'Unknown',
        excerpt: doc.body && doc.body.storage ? 
          doc.body.storage.value.substring(0, 200).replace(/<[^>]*>/g, '') + '...' : 
          'No content available'
      }));
      
      return {
        success: true,
        data: {
          cppf_id,
          cppf_url: getJiraTicketUrl(cppf_id),
          documentCount: formattedDocs.length,
          documents: formattedDocs,
          referenceLinks: {
            jiraProject: getJiraTicketUrl(cppf_id) ? getJiraTicketUrl(cppf_id).replace(/\/browse\/.*$/, `/projects/${cppf_id.split('-')[0]}`) : null,
            jiraBoard: getJiraTicketUrl(cppf_id) ? getJiraTicketUrl(cppf_id).replace(/\/browse\/.*$/, `/secure/RapidBoard.jspa?projectKey=${cppf_id.split('-')[0]}`) : null
          }
        }
      };
    } catch (error) {
      console.error(`Error getting Confluence docs for ${cppf_id}:`, error.message);
      return { success: false, error: error.message };
    }
  }
};

export default [
  getCPPFDetails,
  analyzeCPPFForRole,
  getCPPFConfluenceDocs
]; 