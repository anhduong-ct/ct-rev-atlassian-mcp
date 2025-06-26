import workflowService from '../services/workflow.js';
import { config } from '../config.js';
import { getJiraTicketUrl, getConfluenceWebUiUrl, enhanceWithUrls } from '../utils/urls.js';

/**
 * Get CRE ticket details
 */
const getCREDetails = {
  name: 'get_cre_details',
  description: 'Get detailed information about a CRE ticket (story or task)',
  inputSchema: {
    type: 'object',
    properties: {
      cre_id: {
        type: 'string',
        description: 'CRE ticket ID (e.g. CRE-1234)'
      }
    },
    required: ['cre_id']
  },
  handler: async ({ cre_id }) => {
    try {
      if (!cre_id) {
        return {
          success: false,
          error: 'CRE ID is required'
        };
      }
      
      // Ensure CRE ID is in correct format
      if (!cre_id.startsWith(config.jira.projects.cre + '-')) {
        cre_id = `${config.jira.projects.cre}-${cre_id}`;
      }
      
      const response = await workflowService.getCREDetails(cre_id);
      
      if (!response.success) {
        return response;
      }
      
      const ticket = response.data.ticket;
      
      // Format the response for better readability
      const formattedResponse = {
        ticket: {
          key: ticket.key,
          url: getJiraTicketUrl(ticket.key),
          summary: ticket.fields.summary,
          description: ticket.fields.description || 'No description',
          issueType: ticket.fields.issuetype?.name || 'Unknown',
          status: ticket.fields.status?.name || 'Unknown',
          priority: ticket.fields.priority?.name || 'No Priority',
          assignee: ticket.fields.assignee?.displayName || 'Unassigned',
          reporter: ticket.fields.reporter?.displayName || 'Unknown',
          created: ticket.fields.created,
          updated: ticket.fields.updated,
          duedate: ticket.fields.duedate || null,
          resolution: ticket.fields.resolution?.name || null,
          labels: ticket.fields.labels || [],
          components: ticket.fields.components?.map(c => c.name) || [],
          fixVersions: ticket.fields.fixVersions?.map(v => v.name) || [],
          affectsVersions: ticket.fields.versions?.map(v => v.name) || []
        },
        subtasks: response.data.subtasks?.map(subtask => ({
          key: subtask.key,
          url: getJiraTicketUrl(subtask.key),
          summary: subtask.fields.summary,
          status: subtask.fields.status?.name,
          assignee: subtask.fields.assignee?.displayName || 'Unassigned',
          issueType: subtask.fields.issuetype?.name
        })) || [],
        parent: response.data.parent ? {
          key: response.data.parent.key,
          url: getJiraTicketUrl(response.data.parent.key),
          summary: response.data.parent.fields.summary,
          status: response.data.parent.fields.status?.name,
          issueType: response.data.parent.fields.issuetype?.name
        } : null,
        linkedIssues: response.data.linkedIssues?.map(link => ({
          key: link.outwardIssue?.key || link.inwardIssue?.key,
          url: getJiraTicketUrl(link.outwardIssue?.key || link.inwardIssue?.key),
          summary: link.outwardIssue?.fields?.summary || link.inwardIssue?.fields?.summary,
          linkType: link.type?.name,
          direction: link.outwardIssue ? 'outward' : 'inward'
        })) || [],
        comments: response.data.comments?.slice(-5)?.map(comment => ({
          id: comment.id,
          author: comment.author?.displayName,
          body: comment.body && typeof comment.body === 'string' 
            ? (comment.body.substring(0, 200) + (comment.body.length > 200 ? '...' : '')) 
            : comment.body && typeof comment.body === 'object' && comment.body.content
              ? JSON.stringify(comment.body).substring(0, 200) + '...'
              : String(comment.body || ''),
          created: comment.created,
          updated: comment.updated
        })) || [],
        attachments: response.data.attachments?.map(attachment => ({
          id: attachment.id,
          filename: attachment.filename,
          size: attachment.size,
          mimeType: attachment.mimeType,
          author: attachment.author?.displayName,
          created: attachment.created
        })) || [],
        message: `Retrieved details for ${cre_id}`,
        referenceLinks: {
          jiraProject: getJiraTicketUrl(cre_id) ? getJiraTicketUrl(cre_id).replace(/\/browse\/.*$/, `/projects/${cre_id.split('-')[0]}`) : null,
          jiraBoard: getJiraTicketUrl(cre_id) ? getJiraTicketUrl(cre_id).replace(/\/browse\/.*$/, `/secure/RapidBoard.jspa?projectKey=${cre_id.split('-')[0]}`) : null
        }
      };
      
      return {
        success: true,
        data: formattedResponse
      };
    } catch (error) {
      console.error(`Error getting CRE details for ${cre_id}:`, error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Create CRE story from CPPF ticket
 */
const createCREStoryFromCPPF = {
  name: 'create_cre_story_from_cppf',
  description: 'Create CRE story with linking',
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
      
      const response = await workflowService.createCREStoryFromCPPF(cppf_id);
      
      if (!response.success) {
        return response;
      }
      
      // Format the response for better readability
      const formattedResponse = {
        createdStory: {
          key: response.data.creStory.key,
          url: getJiraTicketUrl(response.data.creStory.key),
          self: response.data.creStory.self,
          summary: `Story created from ${cppf_id}`
        },
        linkedToCPPF: response.data.linkCreated,
        cppf: {
          key: cppf_id,
          url: getJiraTicketUrl(cppf_id)
        },
        message: `Successfully created CRE story ${response.data.creStory.key} from ${cppf_id}`,
        referenceLinks: {
          jiraProject: getJiraTicketUrl(response.data.creStory.key) ? getJiraTicketUrl(response.data.creStory.key).replace(/\/browse\/.*$/, `/projects/${response.data.creStory.key.split('-')[0]}`) : null,
          jiraBoard: getJiraTicketUrl(response.data.creStory.key) ? getJiraTicketUrl(response.data.creStory.key).replace(/\/browse\/.*$/, `/secure/RapidBoard.jspa?projectKey=${response.data.creStory.key.split('-')[0]}`) : null
        }
      };
      
      return {
        success: true,
        data: formattedResponse
      };
    } catch (error) {
      console.error(`Error creating CRE story from ${cppf_id}:`, error.message);
      return { success: false, error: error.message ?? error };
    }
  }
};

/**
 * Create platform-specific tasks for CRE story
 */
const createCRETasksForStory = {
  name: 'create_cre_tasks_for_story',
  description: 'Create platform tasks',
  inputSchema: {
    type: 'object',
    properties: {
      story_id: {
        type: 'string',
        description: 'CRE story ID (e.g. CRE-1234)'
      },
      platforms: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['web', 'backend', 'android', 'ios']
        },
        description: 'Platforms to create tasks for'
      }
    },
    required: ['story_id']
  },
  handler: async ({ story_id, platforms }) => {
    try {
      if (!story_id) {
        return {
          success: false,
          error: 'Story ID is required'
        };
      }
      
      // Ensure story ID is in correct format
      if (!story_id.startsWith(config.jira.projects.cre + '-')) {
        story_id = `${config.jira.projects.cre}-${story_id}`;
      }
      
      const response = await workflowService.createCRETasksForStory(story_id, platforms);
      
      if (!response.success) {
        return response;
      }
      
      // Format the response for better readability
      const formattedTasks = response.data.createdTasks.map(task => ({
        key: task.key,
        url: getJiraTicketUrl(task.key),
        self: task.self
      }));
      
      return {
        success: true,
        data: {
          storyId: story_id,
          storyUrl: getJiraTicketUrl(story_id),
          createdTasks: formattedTasks,
          count: formattedTasks.length,
          message: `Successfully created ${formattedTasks.length} tasks for story ${story_id}`,
          referenceLinks: {
            jiraProject: getJiraTicketUrl(story_id) ? getJiraTicketUrl(story_id).replace(/\/browse\/.*$/, `/projects/${story_id.split('-')[0]}`) : null,
            jiraBoard: getJiraTicketUrl(story_id) ? getJiraTicketUrl(story_id).replace(/\/browse\/.*$/, `/secure/RapidBoard.jspa?projectKey=${story_id.split('-')[0]}`) : null
          }
        }
      };
    } catch (error) {
      console.error(`Error creating tasks for story ${story_id}:`, error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Get current user's CRE stories
 */
const getMyCREStories = {
  name: 'get_my_cre_stories',
  description: 'Get user\'s current CRE stories',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async () => {
    try {
      const response = await workflowService.getMyCREStories();
      
      if (!response.success) {
        return response;
      }
      
      // Format the response for better readability
      const formattedStories = response.data.issues.map(issue => ({
        key: issue.key,
        url: getJiraTicketUrl(issue.key),
        summary: issue.fields.summary,
        description: issue.fields.description || 'No description',
        status: issue.fields.status?.name || 'Unknown',
        priority: issue.fields.priority?.name || 'No Priority',
        created: issue.fields.created,
        updated: issue.fields.updated
      }));
      
      return {
        success: true,
        data: {
          total: formattedStories.length,
          stories: formattedStories,
          referenceLinks: {
            jiraProject: formattedStories.length > 0 ? getJiraTicketUrl(formattedStories[0].key).replace(/\/browse\/.*$/, `/projects/${formattedStories[0].key.split('-')[0]}`) : null,
            jiraBoard: formattedStories.length > 0 ? getJiraTicketUrl(formattedStories[0].key).replace(/\/browse\/.*$/, `/secure/RapidBoard.jspa?projectKey=${formattedStories[0].key.split('-')[0]}`) : null
          }
        }
      };
    } catch (error) {
      console.error('Error getting CRE stories:', error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Update CRE task status
 */
const updateCRETaskStatus = {
  name: 'update_cre_task_status',
  description: 'Update task status',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'CRE task ID (e.g. CRE-1234)'
      },
      status: {
        type: 'string',
        description: 'New status (e.g. "In Progress", "Done")'
      }
    },
    required: ['task_id', 'status']
  },
  handler: async ({ task_id, status }) => {
    try {
      if (!task_id) {
        return {
          success: false,
          error: 'Task ID is required'
        };
      }
      
      if (!status) {
        return {
          success: false,
          error: 'Status is required'
        };
      }
      
      // Ensure task ID is in correct format
      if (!task_id.startsWith(config.jira.projects.cre + '-')) {
        task_id = `${config.jira.projects.cre}-${task_id}`;
      }
      
      const response = await workflowService.updateCRETaskStatus(task_id, status);
      
      if (!response.success) {
        return response;
      }
      
      return {
        success: true,
        data: {
          taskId: task_id,
          taskUrl: getJiraTicketUrl(task_id),
          newStatus: status,
          transitionApplied: response.data.transitionApplied,
          commentAdded: false,
          message: `Successfully updated ${task_id} status to "${status}"`,
          referenceLinks: {
            jiraProject: getJiraTicketUrl(task_id) ? getJiraTicketUrl(task_id).replace(/\/browse\/.*$/, `/projects/${task_id.split('-')[0]}`) : null,
            jiraBoard: getJiraTicketUrl(task_id) ? getJiraTicketUrl(task_id).replace(/\/browse\/.*$/, `/secure/RapidBoard.jspa?projectKey=${task_id.split('-')[0]}`) : null
          }
        }
      };
    } catch (error) {
      console.error(`Error updating task ${task_id} status:`, error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Get parent CRE story from task
 */
const getParentCREStory = {
  name: 'get_parent_cre_story',
  description: 'Get parent CRE story information from a CRE task',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'CRE task ID (e.g. CRE-1234)'
      }
    },
    required: ['task_id']
  },
  handler: async ({ task_id }) => {
    try {
      if (!task_id) {
        return {
          success: false,
          error: 'Task ID is required'
        };
      }
      
      // Ensure task ID is in correct format
      if (!task_id.startsWith(config.jira.projects.cre + '-')) {
        task_id = `${config.jira.projects.cre}-${task_id}`;
      }
      
      const response = await workflowService.getParentCREStory(task_id);
      
      if (!response.success) {
        return response;
      }
      
      // Format the response for better readability
      const formattedResponse = {
        task: {
          key: response.data.task.key,
          url: getJiraTicketUrl(response.data.task.key),
          summary: response.data.task.fields.summary,
          description: response.data.task.fields.description || 'No description',
          status: response.data.task.fields.status.name,
          issuetype: response.data.task.fields.issuetype.name
        },
        parentStory: {
          key: response.data.parentStory.key,
          url: getJiraTicketUrl(response.data.parentStory.key),
          summary: response.data.parentStory.fields.summary,
          description: response.data.parentStory.fields.description || 'No description',
          status: response.data.parentStory.fields.status.name,
          priority: response.data.parentStory.fields.priority?.name,
          created: response.data.parentStory.fields.created,
          updated: response.data.parentStory.fields.updated
        },
        message: `Found parent story ${response.data.parentStory.key} for task ${task_id}`,
        referenceLinks: {
          jiraProject: getJiraTicketUrl(task_id) ? getJiraTicketUrl(task_id).replace(/\/browse\/.*$/, `/projects/${task_id.split('-')[0]}`) : null,
          jiraBoard: getJiraTicketUrl(task_id) ? getJiraTicketUrl(task_id).replace(/\/browse\/.*$/, `/secure/RapidBoard.jspa?projectKey=${task_id.split('-')[0]}`) : null
        }
      };
      
      return {
        success: true,
        data: formattedResponse
      };
    } catch (error) {
      console.error(`Error getting parent CRE story for ${task_id}:`, error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Get CPPF information from CRE story
 */
const getCPPFFromCREStory = {
  name: 'get_cppf_from_cre_story',
  description: 'Get linked CPPF ticket information from a CRE story',
  inputSchema: {
    type: 'object',
    properties: {
      story_id: {
        type: 'string',
        description: 'CRE story ID (e.g. CRE-1234)'
      }
    },
    required: ['story_id']
  },
  handler: async ({ story_id }) => {
    try {
      if (!story_id) {
        return {
          success: false,
          error: 'Story ID is required'
        };
      }
      
      // Ensure story ID is in correct format
      if (!story_id.startsWith(config.jira.projects.cre + '-')) {
        story_id = `${config.jira.projects.cre}-${story_id}`;
      }
      
      const response = await workflowService.getCPPFFromCREStory(story_id);
      
      if (!response.success) {
        return response;
      }
      
      // Format the response for better readability
      const formattedResponse = {
        story: {
          key: response.data.story.key,
          url: getJiraTicketUrl(response.data.story.key),
          summary: response.data.story.fields.summary,
          description: response.data.story.fields.description || 'No description',
          status: response.data.story.fields.status.name
        },
        cppf: response.data.cppf ? {
          ticket: {
            key: response.data.cppf.cppf.key,
            url: getJiraTicketUrl(response.data.cppf.cppf.key),
            summary: response.data.cppf.cppf.fields.summary,
            priority: response.data.cppf.cppf.fields.priority?.name,
            status: response.data.cppf.cppf.fields.status.name,
            description: response.data.cppf.cppf.fields.description
          },
          confluenceDocs: response.data.cppf.confluenceDocs?.length || 0
        } : null,
        message: response.data.cppf ? 
          `Found CPPF ${response.data.cppf.cppf.key} linked to story ${story_id}` :
          `No CPPF found for story ${story_id}`,
        referenceLinks: {
          jiraProject: getJiraTicketUrl(story_id) ? getJiraTicketUrl(story_id).replace(/\/browse\/.*$/, `/projects/${story_id.split('-')[0]}`) : null,
          jiraBoard: getJiraTicketUrl(story_id) ? getJiraTicketUrl(story_id).replace(/\/browse\/.*$/, `/secure/RapidBoard.jspa?projectKey=${story_id.split('-')[0]}`) : null
        }
      };
      
      return {
        success: true,
        data: formattedResponse
      };
    } catch (error) {
      console.error(`Error getting CPPF from CRE story ${story_id}:`, error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Get complete task hierarchy and CPPF information
 */
const getTaskHierarchyAndCPPF = {
  name: 'get_task_hierarchy_and_cppf',
  description: 'Get complete hierarchy: CRE task -> parent CRE story -> linked CPPF ticket with documentation',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'string',
        description: 'CRE task ID (e.g. CRE-1234)'
      }
    },
    required: ['task_id']
  },
  handler: async ({ task_id }) => {
    try {
      if (!task_id) {
        return {
          success: false,
          error: 'Task ID is required'
        };
      }
      
      // Ensure task ID is in correct format
      if (!task_id.startsWith(config.jira.projects.cre + '-')) {
        task_id = `${config.jira.projects.cre}-${task_id}`;
      }
      
      const response = await workflowService.getTaskHierarchyAndCPPF(task_id);
      
      if (!response.success) {
        return response;
      }
      
      // Format the response for better readability
      const formattedResponse = {
        hierarchy: response.data.hierarchy,
        task: {
          key: response.data.task.key,
          url: getJiraTicketUrl(response.data.task.key),
          summary: response.data.task.fields.summary,
          description: response.data.task.fields.description || 'No description',
          status: response.data.task.fields.status.name,
          issuetype: response.data.task.fields.issuetype.name,
          assignee: response.data.task.fields.assignee?.displayName
        },
        parentStory: {
          key: response.data.parentStory.key,
          url: getJiraTicketUrl(response.data.parentStory.key),
          summary: response.data.parentStory.fields.summary,
          description: response.data.parentStory.fields.description || 'No description',
          status: response.data.parentStory.fields.status.name,
          priority: response.data.parentStory.fields.priority?.name
        },
        cppf: response.data.cppf ? {
          ticket: {
            key: response.data.cppf.cppf.key,
            url: getJiraTicketUrl(response.data.cppf.cppf.key),
            summary: response.data.cppf.cppf.fields.summary,
            priority: response.data.cppf.cppf.fields.priority?.name,
            status: response.data.cppf.cppf.fields.status.name,
            description: typeof response.data.cppf.cppf.fields.description === 'string'
              ? (response.data.cppf.cppf.fields.description.substring(0, 500) + '...') 
              : String(response.data.cppf.cppf.fields.description || '') // Truncate for readability
          },
          confluenceDocs: response.data.cppf.confluenceDocs?.map(doc => ({
            id: doc.id,
            title: doc.title,
            url: getConfluenceWebUiUrl(doc)
          })) || []
        } : null,
        warning: response.data.warning,
        message: response.data.cppf ? 
          `Complete hierarchy mapped: ${task_id} -> ${response.data.parentStory.key} -> ${response.data.cppf.cppf.key}` :
          `Partial hierarchy mapped: ${task_id} -> ${response.data.parentStory.key} (no CPPF found)`,
        referenceLinks: {
          jiraProject: getJiraTicketUrl(task_id) ? getJiraTicketUrl(task_id).replace(/\/browse\/.*$/, `/projects/${task_id.split('-')[0]}`) : null,
          jiraBoard: getJiraTicketUrl(task_id) ? getJiraTicketUrl(task_id).replace(/\/browse\/.*$/, `/secure/RapidBoard.jspa?projectKey=${task_id.split('-')[0]}`) : null
        }
      };
      
      return {
        success: true,
        data: formattedResponse
      };
    } catch (error) {
      console.error(`Error getting task hierarchy and CPPF for ${task_id}:`, error.message);
      return { success: false, error: error.message };
    }
  }
};

export default [
  getCREDetails,
  createCREStoryFromCPPF,
  createCRETasksForStory,
  getMyCREStories,
  updateCRETaskStatus,
  getParentCREStory,
  getCPPFFromCREStory,
  getTaskHierarchyAndCPPF
]; 