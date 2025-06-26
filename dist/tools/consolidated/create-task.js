import workflowService from '../../services/refactored/workflow.js';
import { config } from '../../config.js';
import { getJiraTicketUrl } from '../../utils/urls.js';

/**
 * Consolidated Task Creation Tool
 * Merges: create_cre_story_from_cppf, create_cre_tasks_for_story
 * LLM-First Approach: Returns raw creation data for LLM analysis
 */
const createTask = {
  name: 'mcp_Atlassian_MCP_create_task',
  description: 'Create CRE stories and tasks with linking - unified task creation tool',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['story', 'task'],
        description: 'Type of task to create'
      },
      cppfId: {
        type: 'string',
        description: 'CPPF ticket ID (e.g. CPPF-1234) - required for stories'
      },
      storyId: {
        type: 'string',
        description: 'CRE story ID (e.g. CRE-1234) - required for tasks'
      },
      platforms: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['web', 'backend', 'app', 'ios']
        },
        description: 'Platforms to create tasks for (only used when creating tasks)'
      },
      role: {
        type: 'string',
        default: 'web',
        description: 'Engineering role (web, backend, app, ios, fullstack)'
      },
      title: {
        type: 'string',
        description: 'Custom title for the task (optional - will be generated from CPPF if not provided)'
      },
      description: {
        type: 'string',
        description: 'Custom description for the task (optional - will be generated from CPPF if not provided)'
      }
    },
    required: ['type']
  },
  
  handler: async ({ 
    type, 
    cppfId, 
    storyId, 
    platforms = [], 
    role = 'web', 
    title, 
    description 
  }) => {
    try {
      if (type === 'story') {
        return await createStoryFromCPPF(cppfId, role, title, description);
      } else if (type === 'task') {
        return await createTasksForStory(storyId, platforms);
      } else {
        return {
          success: false,
          error: 'Invalid task type. Must be "story" or "task"'
        };
      }
    } catch (error) {
      console.error('Error creating task:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

// Create CRE story from CPPF
async function createStoryFromCPPF(cppfId, role = 'web', customTitle, customDescription) {
  if (!cppfId) {
    return {
      success: false,
      error: 'CPPF ID is required to create a story'
    };
  }

  try {
    // Get CPPF details
    const cppfResponse = await workflowService.getIssue(cppfId, [
      'summary', 'description', 'priority', 'labels', 'components', 'issuelinks'
    ]);
    
    if (!cppfResponse.success) {
      return {
        success: false,
        error: `Failed to get CPPF ${cppfId}: ${cppfResponse.error}`
      };
    }
    
    const cppf = cppfResponse.data;
    
    // Generate story details from CPPF
    const storyTitle = customTitle || `[${role.toUpperCase()}] ${cppf.fields.summary}`;
    const storyDescription = customDescription || generateStoryDescription(cppf, role);
    
    // Create the CRE story
    const storyData = {
      fields: {
        project: { key: config.jira.projects.cre },
        issuetype: { name: 'Story' },
        summary: storyTitle,
        description: storyDescription,
        priority: cppf.fields.priority || { name: 'Medium' },
        labels: [...(cppf.fields.labels || []), role],
        components: determineComponents(role)
      }
    };
    
    const createResponse = await workflowService.createIssue(storyData);
    
    if (!createResponse.success) {
      return {
        success: false,
        error: `Failed to create story: ${createResponse.error}`
      };
    }
    
    const newStory = createResponse.data;
    
    // Link the story to the CPPF
    const linkResponse = await workflowService.linkIssues(
      newStory.key,
      cppfId,
      'Implements'
    );
    
    // Return raw creation data for LLM analysis
    return {
      success: true,
      data: {
        story: {
          ...newStory,
          url: getJiraTicketUrl(newStory.key),
          metadata: {
            createdFrom: cppfId,
            role: role,
            platform: role
          }
        },
        originalCPPF: {
          ...cppf,
          url: getJiraTicketUrl(cppfId)
        },
        linkResult: linkResponse.success ? 'linked' : 'link_failed',
        linkError: linkResponse.success ? null : linkResponse.error,
        creationMetadata: {
          createdAt: new Date().toISOString(),
          role: role,
          customTitle: !!customTitle,
          customDescription: !!customDescription
        }
      }
    };
  } catch (error) {
    console.error('Error creating story from CPPF:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Create tasks for a story
async function createTasksForStory(storyId, platforms = []) {
  if (!storyId) {
    return {
      success: false,
      error: 'Story ID is required to create tasks'
    };
  }
  
  if (platforms.length === 0) {
    return {
      success: false,
      error: 'At least one platform must be specified'
    };
  }

  try {
    // Get story details
    const storyResponse = await workflowService.getIssue(storyId, [
      'summary', 'description', 'priority', 'labels', 'components'
    ]);
    
    if (!storyResponse.success) {
      return {
        success: false,
        error: `Failed to get story ${storyId}: ${storyResponse.error}`
      };
    }
    
    const story = storyResponse.data;
    const createdTasks = [];
    const errors = [];
    
    // Create a task for each platform
    for (const platform of platforms) {
      try {
        const taskTitle = `[${platform.toUpperCase()}] ${story.fields.summary}`;
        const taskDescription = generateTaskDescription(story, platform);
        
        const taskData = {
          fields: {
            project: { key: config.jira.projects.cre },
            issuetype: { name: 'Task' },
            summary: taskTitle,
            description: taskDescription,
            priority: story.fields.priority || { name: 'Medium' },
            labels: [...(story.fields.labels || []), platform],
            components: determineComponents(platform)
          }
        };
        
        const createResponse = await workflowService.createIssue(taskData);
        
        if (createResponse.success) {
          const newTask = createResponse.data;
          
          // Link task to story
          const linkResponse = await workflowService.linkIssues(
            newTask.key,
            storyId,
            'Subtask'
          );
          
          createdTasks.push({
            ...newTask,
            url: getJiraTicketUrl(newTask.key),
            platform: platform,
            linkResult: linkResponse.success ? 'linked' : 'link_failed',
            linkError: linkResponse.success ? null : linkResponse.error
          });
        } else {
          errors.push({
            platform: platform,
            error: createResponse.error
          });
        }
      } catch (error) {
        errors.push({
          platform: platform,
          error: error.message
        });
      }
    }
    
    // Return raw creation data for LLM analysis
    return {
      success: createdTasks.length > 0,
      data: {
        story: {
          ...story,
          url: getJiraTicketUrl(storyId)
        },
        createdTasks: createdTasks,
        errors: errors,
        summary: {
          totalRequested: platforms.length,
          totalCreated: createdTasks.length,
          totalErrors: errors.length
        },
        creationMetadata: {
          createdAt: new Date().toISOString(),
          platforms: platforms
        }
      }
    };
  } catch (error) {
    console.error('Error creating tasks for story:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Helper functions
function generateStoryDescription(cppf, role) {
  const roleSpecificNote = getRoleSpecificNote(role);
  
  return `
**Story created from CPPF:** ${cppf.key}

**Original Description:**
${cppf.fields.description || 'No description provided'}

**Role-Specific Context (${role.toUpperCase()}):**
${roleSpecificNote}

**Acceptance Criteria:**
- [ ] Implement ${role} requirements as specified in CPPF
- [ ] Ensure cross-platform compatibility where applicable
- [ ] Add appropriate testing
- [ ] Update documentation if needed

**Definition of Done:**
- [ ] Code reviewed and approved
- [ ] Tests passing
- [ ] Deployed to staging
- [ ] Product owner acceptance
  `.trim();
}

function generateTaskDescription(story, platform) {
  const platformNote = getPlatformNote(platform);
  
  return `
**Task for platform:** ${platform.toUpperCase()}
**Parent Story:** ${story.key}

**Story Description:**
${story.fields.description || 'No description provided'}

**Platform-Specific Notes (${platform.toUpperCase()}):**
${platformNote}

**Implementation Checklist:**
- [ ] Analyze requirements for ${platform} platform
- [ ] Design solution architecture
- [ ] Implement core functionality
- [ ] Add unit tests
- [ ] Add integration tests
- [ ] Code review
- [ ] Deploy to staging
- [ ] QA testing

**Definition of Done:**
- [ ] All checklist items completed
- [ ] Code meets platform standards
- [ ] Tests pass in CI/CD
- [ ] Ready for production deployment
  `.trim();
}

function getRoleSpecificNote(role) {
  const notes = {
    web: 'Focus on frontend implementation, user experience, and web accessibility.',
    backend: 'Focus on API design, data persistence, and business logic implementation.',
    app: 'Focus on mobile user experience, performance, and platform-specific features.',
    ios: 'Focus on iOS-specific implementation, Apple guidelines compliance, and native features.',
    fullstack: 'Consider both frontend and backend implications, ensure end-to-end functionality.'
  };
  
  return notes[role] || 'Implement according to your platform requirements.';
}

function getPlatformNote(platform) {
  const notes = {
    web: 'Ensure responsive design, browser compatibility, and web performance standards.',
    backend: 'Follow API design principles, implement proper error handling, and ensure scalability.',
    app: 'Consider mobile UX patterns, offline capabilities, and app store guidelines.',
    ios: 'Follow iOS Human Interface Guidelines, use native components, and ensure iOS version compatibility.'
  };
  
  return notes[platform] || 'Follow platform-specific best practices.';
}

function determineComponents(platform) {
  // Map platforms to Jira components if they exist
  const componentMap = {
    web: 'Web',
    backend: 'Backend',
    app: 'Mobile App',
    ios: 'iOS'
  };
  
  const componentName = componentMap[platform];
  return componentName ? [{ name: componentName }] : [];
}

export default [createTask]; 