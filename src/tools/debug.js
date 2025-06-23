import jiraService from '../services/jira.js';
import { config } from '../config.js';

/**
 * Debug tool to discover available custom fields in Jira projects
 */
const discoverCustomFields = {
  name: 'discover_custom_fields',
  description: 'Discover available custom fields for CRE/CPPF projects to help configure correct field IDs',
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description: 'Project key (defaults to CRE project)',
        default: config.jira.projects.cre
      },
      issueType: {
        type: 'string',
        description: 'Issue type to check fields for (Story, Task, Bug, etc.)',
        default: 'Story'
      }
    }
  },
  handler: async ({ project = config.jira.projects.cre, issueType = 'Story' }) => {
    try {
      console.log(`Discovering custom fields for project ${project}, issue type ${issueType}`);
      
      // Get create metadata for the project
      const metaResponse = await jiraService.getCreateMeta(project);
      if (!metaResponse.success) {
        return {
          success: false,
          error: `Failed to get create metadata for project ${project}: ${metaResponse.error}`
        };
      }

      const projectData = metaResponse.data.projects[0];
      if (!projectData) {
        return {
          success: false,
          error: `Project ${project} not found or accessible`
        };
      }

      const issueTypeData = projectData.issuetypes?.find(type => 
        type.name.toLowerCase() === issueType.toLowerCase()
      );
      
      if (!issueTypeData) {
        return {
          success: false,
          error: `Issue type ${issueType} not found in project ${project}. Available types: ${projectData.issuetypes?.map(t => t.name).join(', ')}`
        };
      }

      const fields = issueTypeData.fields || {};
      const customFields = [];
      const potentialSprintFields = [];

      // Analyze all fields
      Object.entries(fields).forEach(([fieldId, fieldData]) => {
        if (fieldId.startsWith('customfield_')) {
          const fieldInfo = {
            id: fieldId,
            name: fieldData.name,
            required: fieldData.required || false,
            fieldType: fieldData.schema?.type || 'unknown',
            allowedValues: fieldData.allowedValues ? 
              fieldData.allowedValues.slice(0, 5).map(v => v.value || v.name || v) : null
          };
          
          customFields.push(fieldInfo);
          
          // Look for potential sprint fields
          const name = fieldData.name?.toLowerCase() || '';
          if (name.includes('sprint') || name.includes('iteration') || fieldId === 'customfield_10020') {
            potentialSprintFields.push(fieldInfo);
          }
        }
      });

      // Sort by field ID for easier reading
      customFields.sort((a, b) => a.id.localeCompare(b.id));

      return {
        success: true,
        data: {
          project,
          issueType,
          currentSprintConfig: config.jira.customFields.sprint,
          totalCustomFields: customFields.length,
          potentialSprintFields,
          allCustomFields: customFields,
          suggestions: {
            sprintField: potentialSprintFields.length > 0 ? 
              `Consider using one of these sprint fields: ${potentialSprintFields.map(f => `${f.id} (${f.name})`).join(', ')}` :
              'No obvious sprint fields found. You may need to check with your Jira admin.',
            configuration: potentialSprintFields.length > 0 ?
              `To fix the issue, set the JIRA_FIELD_SPRINT environment variable to: ${potentialSprintFields[0].id}` :
              'Remove sprint field assignment or check with Jira admin for correct field ID'
          }
        }
      };
    } catch (error) {
      console.error('Error discovering custom fields:', error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
};

/**
 * Test current configuration by attempting to get field metadata
 */
const testConfiguration = {
  name: 'test_jira_configuration',
  description: 'Test current Jira configuration and identify potential issues',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async () => {
    try {
      const results = {
        authentication: { status: 'unknown', details: null },
        projects: { status: 'unknown', details: null },
        customFields: { status: 'unknown', details: null },
        configuration: {
          jiraHost: config.jira.host,
          creProject: config.jira.projects.cre,
          cppfProject: config.jira.projects.cppf,
          sprintField: config.jira.customFields.sprint,
          userAccountId: config.user.accountId ? 'Set' : 'Not set'
        }
      };

      // Test authentication and project access by getting create metadata
      try {
        const metaResponse = await jiraService.getCreateMeta(config.jira.projects.cre);
        if (metaResponse.success) {
          results.authentication = {
            status: 'success',
            details: 'Successfully authenticated with Jira'
          };
          results.projects = {
            status: 'success',
            details: `CRE project accessible: ${config.jira.projects.cre}`
          };
        } else {
          results.authentication = {
            status: 'failed',
            details: 'Authentication or project access failed'
          };
          results.projects = {
            status: 'failed',
            details: `Cannot access CRE project ${config.jira.projects.cre}: ${metaResponse.error}`
          };
        }
      } catch (error) {
        results.authentication = {
          status: 'error',
          details: error.message
        };
        results.projects = {
          status: 'error',
          details: error.message
        };
      }

      // Test custom field configuration
      try {
        const metaResponse = await jiraService.getCreateMeta(config.jira.projects.cre);
        if (metaResponse.success) {
          const storyFields = metaResponse.data.projects[0]?.issuetypes
            ?.find(type => type.name === 'Story')?.fields;
          
          const sprintField = storyFields?.[config.jira.customFields.sprint];
          if (sprintField) {
            results.customFields = {
              status: 'success',
              details: `Sprint field ${config.jira.customFields.sprint} found: ${sprintField.name}`
            };
          } else {
            results.customFields = {
              status: 'failed',
              details: `Sprint field ${config.jira.customFields.sprint} not found in Story create screen`
            };
          }
        } else {
          results.customFields = {
            status: 'error',
            details: `Cannot get create metadata: ${metaResponse.error}`
          };
        }
      } catch (error) {
        results.customFields = {
          status: 'error',
          details: error.message
        };
      }

      const hasIssues = Object.values(results).some(result => 
        result.status === 'failed' || result.status === 'error'
      );

      return {
        success: !hasIssues,
        data: {
          overallStatus: hasIssues ? 'Issues found' : 'Configuration looks good',
          results,
          recommendations: hasIssues ? [
            'Use the discover_custom_fields tool to find the correct sprint field ID',
            'Check your .env file for correct JIRA credentials and configuration',
            'Verify that your user has access to the CRE project'
          ] : [
            'Configuration appears to be working correctly'
          ]
        }
      };
    } catch (error) {
      console.error('Error testing configuration:', error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
};

export default [
  discoverCustomFields,
  testConfiguration
]; 