import workflowService from '../../services/refactored/workflow.js';
import { config } from '../../config.js';
import { getJiraTicketUrl, getConfluenceWebUiUrl, enhanceWithUrls, extractFigmaLinks } from '../../utils/urls.js';
import { detectPlatforms, extractRequirements, estimateComplexity } from '../../utils/parser.js';

/**
 * Analyze CPPF - Consolidated tool that merges get_cppf_details, analyze_cppf_for_role, and get_cppf_confluence_docs
 * Enhanced CPPF analysis tool with comprehensive output
 */
const analyzeCPPF = {
  name: 'analyze_cppf',
  description: 'Analyze CPPF ticket with comprehensive details and role-specific requirements',
  inputSchema: {
    type: 'object',
    properties: {
      cppf_id: {
        type: 'string',
        description: 'CPPF ticket ID (e.g. CPPF-1234)'
      },
      role: {
        type: 'string',
        description: 'Role-specific requirement analysis (defaults to user configured role)',
        default: config.user.role
      },
      includeRawContent: {
        type: 'boolean',
        description: 'Whether to include raw content from linked documents',
        default: false
      }
    },
    required: ['cppf_id']
  },
  handler: async ({ cppf_id, role = config.user.role, includeRawContent = false }) => {
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
      
      // Get the CPPF ticket details
      const cppfResponse = await workflowService.getCPPFDetails(cppf_id);
      if (!cppfResponse.success) {
        return cppfResponse;
      }
      
      const cppf = cppfResponse.data.cppf;
      const confluenceDocs = cppfResponse.data.confluenceDocs;
      const figmaLinks = cppfResponse.data.figmaLinks;
      
      // Format the response for better readability
      const formattedResponse = {
        key: cppf.key,
        url: getJiraTicketUrl(cppf.key),
        summary: cppf.fields.summary,
        description: cppf.fields.description,
        status: cppf.fields.status?.name || 'Unknown',
        priority: cppf.fields.priority?.name || 'No Priority',
        components: (cppf.fields.components || []).map(comp => comp.name),
        labels: cppf.fields.labels || [],
        assignee: cppf.fields.assignee ? cppf.fields.assignee.displayName : 'Unassigned',
        reporter: cppf.fields.reporter ? cppf.fields.reporter.displayName : 'Unknown',
        created: cppf.fields.created,
        updated: cppf.fields.updated
      };
      
      // Get linked Confluence docs
      const formattedDocs = confluenceDocs.map(doc => ({
        id: doc.id,
        title: doc.title,
        url: getConfluenceWebUiUrl(doc.id, doc._links?.webui),
        lastModified: doc.version?.when || 'Unknown',
        lastModifiedBy: doc.version?.by?.displayName || 'Unknown',
        space: doc.space?.name || 'Unknown',
        content: includeRawContent ? doc.body?.storage?.value : undefined
      }));
      
      // Extract platforms and requirements based on CPPF description and linked docs
      let allContent = typeof cppf.fields.description === 'string' ? cppf.fields.description : '';
      let formattedContent = '';
      
      for (const doc of confluenceDocs) {
        if (doc.body?.storage?.value && typeof doc.body.storage.value === 'string') {
          allContent += '\n\n' + doc.body.storage.value;
          formattedContent += `\n## ${doc.title}\n${doc.body.storage.value}`;
        }
      }
      
      // Analyze content for role-specific requirements
      const detectedPlatforms = detectPlatforms(allContent);
      const roleMatches = detectedPlatforms.includes(role);
      
      // Extract requirements relevant to the specified role
      const requirementsByRole = extractRequirements(allContent, role);
      
      // Estimate complexity (numeric value)
      const complexityScore = estimateComplexity(requirementsByRole, role);
      
      // Convert numeric complexity to text label
      const complexityLabel = analyzeCPPF.getComplexityLabel(complexityScore);
      
      return {
        success: true,
        data: {
          cppf: formattedResponse,
          linkedDocuments: formattedDocs,
          figmaLinks: figmaLinks || [],
          analysis: {
            detectedPlatforms,
            roleRelevant: roleMatches,
            userRole: role,
            requirements: requirementsByRole,
            complexityScore,
            complexity: complexityLabel, // Use text label for compatibility
            estimatedEffort: analyzeCPPF.getEffortEstimate(complexityLabel),
            suggestedNextSteps: analyzeCPPF.getSuggestedNextSteps(formattedResponse.status, roleMatches)
          },
          content: includeRawContent ? formattedContent : undefined,
          referenceLinks: {
            jiraProject: getJiraTicketUrl(cppf.key).replace(/\/browse\/.*$/, `/projects/${cppf.key.split('-')[0]}`),
            jiraBoard: getJiraTicketUrl(cppf.key).replace(/\/browse\/.*$/, `/secure/RapidBoard.jspa?projectKey=${cppf.key.split('-')[0]}`)
          }
        }
      };
    } catch (error) {
      console.error('Error analyzing CPPF:', error.message);
      return { success: false, error: error.message };
    }
  },
  
  // Helper methods
  getComplexityLabel(complexityScore) {
    if (typeof complexityScore !== 'number') {
      return 'Unknown';
    }
    
    if (complexityScore <= 2) {
      return 'Very Low';
    } else if (complexityScore <= 5) {
      return 'Low';
    } else if (complexityScore <= 8) {
      return 'Medium';
    } else if (complexityScore <= 13) {
      return 'High';
    } else {
      return 'Very High';
    }
  },
  
  getEffortEstimate(complexity) {
    if (!complexity || typeof complexity !== 'string') {
      return 'Unable to estimate';
    }
    
    switch (complexity.toLowerCase()) {
      case 'very low':
        return '1-2 days';
      case 'low':
        return '2-3 days';
      case 'medium':
        return '3-5 days';
      case 'high':
        return '1-2 weeks';
      case 'very high':
        return '2+ weeks';
      default:
        return 'Unable to estimate';
    }
  },
  
  getSuggestedNextSteps(status, isRelevant) {
    if (!isRelevant) {
      return ['This CPPF does not appear to be relevant to your role.'];
    }
    
    const steps = [];
    
    switch (status) {
      case 'Open':
        steps.push('Review the CPPF details and linked documents');
        steps.push('Discuss requirements with the product team');
        steps.push('Create CRE story tickets based on this CPPF');
        break;
      case 'In Progress':
        steps.push('Check associated CRE stories and tasks');
        steps.push('Coordinate with other teams on implementation');
        steps.push('Update the CPPF with progress reports');
        break;
      case 'Review':
        steps.push('Review the implementation against the requirements');
        steps.push('Provide feedback on any discrepancies');
        steps.push('Prepare for QA testing');
        break;
      case 'Done':
      case 'Closed':
      case 'Resolved':
        steps.push('Verify all associated CRE stories are completed');
        steps.push('Document lessons learned for future reference');
        steps.push('Close any related tasks or stories');
        break;
      default:
        steps.push('Review the CPPF details and linked documents');
        steps.push('Coordinate with the product team on next steps');
    }
    
    return steps;
  }
};

/**
 * Get CPPF confluence documents - Keep this standalone tool for backward compatibility
 */
const getCPPFConfluenceDocs = {
  name: 'get_cppf_confluence_docs',
  description: 'Get all Confluence documents linked to a CPPF ticket',
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
      
      // Use the analyze_cppf implementation but only return the documents part
      const result = await analyzeCPPF.handler({ cppf_id, includeRawContent: true });
      
      if (!result.success) {
        return result;
      }
      
      return {
        success: true,
        data: {
          cppf: result.data.cppf,
          docs: result.data.linkedDocuments,
          figmaLinks: result.data.figmaLinks,
          content: result.data.content
        }
      };
    } catch (error) {
      console.error('Error getting CPPF Confluence docs:', error.message);
      return { success: false, error: error.message };
    }
  }
};

export default [analyzeCPPF, getCPPFConfluenceDocs];
