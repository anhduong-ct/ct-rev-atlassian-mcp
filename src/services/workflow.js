import jiraService from './jira.js';
import confluenceService from './confluence.js';
import { config, getCurrentSprint } from '../config.js';
import { detectPlatforms, extractRequirements, estimateComplexity } from '../utils/parser.js';
import { calculatePriority } from '../utils/priority.js';

class WorkflowService {
  async getMySprintAssignments() {
    // Engineers are assigned to CRE tickets, not CPPF tickets
    // CPPF tickets are product requirements, CRE tickets are engineering implementations
    const jql = `project = ${config.jira.projects.cre} AND assignee = currentUser() ORDER BY updated DESC`;
    return await jiraService.searchIssues(jql, ['summary', 'description', 'status', 'priority', 'issuelinks']);
  }

  async getSprintOverview() {
    // Show overview of CRE project (engineering work) rather than CPPF (product requirements)
    const jql = `project = ${config.jira.projects.cre} ORDER BY updated DESC`;
    return await jiraService.searchIssues(jql, ['summary', 'description', 'status', 'assignee', 'priority', 'issuelinks']);
  }

  async getCPPFDetails(cppfId) {
    // Get the CPPF ticket details
    const cppfResponse = await jiraService.getIssue(cppfId);
    if (!cppfResponse.success) {
      return cppfResponse;
    }

    // Get linked Confluence docs
    const confluenceDocs = await this.getCPPFConfluenceDocs(cppfId);

    return {
      success: true,
      data: {
        cppf: cppfResponse.data,
        confluenceDocs: confluenceDocs.success ? confluenceDocs.data : []
      }
    };
  }

  async analyzeCPPFForRole(cppfId, role = config.user.role) {
    // Get CPPF details first
    const cppfResponse = await this.getCPPFDetails(cppfId);
    if (!cppfResponse.success) {
      return cppfResponse;
    }

    const cppfData = cppfResponse.data;
    const description = cppfData.cppf.fields.description || '';
    
    // Detect required platforms
    const detectedPlatforms = detectPlatforms(description);
    
    // Extract requirements based on role
    const requirements = extractRequirements(description, role);
    
    // Estimate complexity
    const complexity = estimateComplexity(requirements);
    
    // Get linked CRE stories if any
    const linkedCREStories = [];
    if (cppfData.cppf.fields.issuelinks) {
      for (const link of cppfData.cppf.fields.issuelinks) {
        const linkedIssue = link.inwardIssue || link.outwardIssue;
        if (linkedIssue && linkedIssue.key.startsWith(config.jira.projects.cre)) {
          linkedCREStories.push(linkedIssue);
        }
      }
    }

    return {
      success: true,
      data: {
        cppfId,
        summary: cppfData.cppf.fields.summary,
        detectedPlatforms,
        requirements,
        complexity,
        linkedCREStories,
        role
      }
    };
  }

  async getCPPFConfluenceDocs(cppfId) {
    try {
      // First get the CPPF issue to check for Confluence links
      const cppfResponse = await jiraService.getIssue(cppfId);
      if (!cppfResponse.success) {
        return cppfResponse;
      }
      
      const description = cppfResponse.data.fields.description || '';
      const summary = cppfResponse.data.fields.summary || '';
      
      // Extract Confluence page IDs from description (looking for confluence links)
      const confluencePageIds = this._extractConfluencePageIds(description);
      
      // Search for related Confluence pages by CPPF ID and summary terms
      const searchTerms = [cppfId, ...summary.split(' ').filter(term => term.length > 3)];
      const searchQuery = searchTerms.join(' OR ');
      
      const searchResponse = await confluenceService.searchAllSpaces(searchQuery);
      
      // Combine explicit links and search results
      const allDocs = [];
      
      // Add explicitly linked pages
      if (confluencePageIds.length > 0) {
        for (const pageId of confluencePageIds) {
          const pageResponse = await confluenceService.getPage(pageId);
          if (pageResponse.success) {
            allDocs.push(pageResponse.data);
          }
        }
      }
      
      // Add search results, avoiding duplicates
      if (searchResponse.success) {
        for (const page of searchResponse.data.results) {
          if (!allDocs.some(doc => doc.id === page.id)) {
            allDocs.push(page);
          }
        }
      }
      
      return { success: true, data: allDocs };
    } catch (error) {
      console.error(`Error getting Confluence docs for ${cppfId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async createCREStoryFromCPPF(cppfId, options = {}) {
    try {
      // Get CPPF details
      const cppfResponse = await jiraService.getIssue(cppfId);
      if (!cppfResponse.success) {
        return cppfResponse;
      }
      
      const cppf = cppfResponse.data;
      
      // Analyze CPPF for role if not provided
      const role = options.role || config.user.role;
      const analysisResponse = await this.analyzeCPPFForRole(cppfId, role);
      if (!analysisResponse.success) {
        return analysisResponse;
      }
      
      // Prepare CRE story data
      const storyData = {
        fields: {
          project: {
            key: config.jira.projects.cre
          },
          summary: `[${role.toUpperCase()}] ${cppf.fields.summary}`,
          description: this._generateCREDescription(cppf, analysisResponse.data),
          issuetype: {
            name: 'Story'
          },
          priority: cppf.fields.priority,
          // Add custom fields as needed
        }
      };
      
      // Create the CRE story
      const createResponse = await jiraService.createIssue(storyData);
      if (!createResponse.success) {
        return createResponse;
      }
      
      // Link the CRE story to the CPPF ticket
      const linkResponse = await jiraService.createIssueLink(
        createResponse.data.key,
        cppfId,
        'Implements'
      );
      
      // Return the created story data
      return {
        success: true,
        data: {
          creStory: createResponse.data,
          linkCreated: linkResponse.success
        }
      };
    } catch (error) {
      console.error(`Error creating CRE story from ${cppfId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async createCRETasksForStory(storyId, platforms = null) {
    try {
      // Get story details
      const storyResponse = await jiraService.getIssue(storyId);
      if (!storyResponse.success) {
        return storyResponse;
      }
      
      const story = storyResponse.data;
      
      // If platforms not specified, try to detect from story
      const targetPlatforms = platforms || detectPlatforms(story.fields.description) || config.workflow.platforms;
      
      const createdTasks = [];
      
      // Create a task for each platform
      for (const platform of targetPlatforms) {
        const taskData = {
          fields: {
            project: {
              key: config.jira.projects.cre
            },
            summary: `[${platform.toUpperCase()}] ${story.fields.summary}`,
            description: `Implementation task for ${platform} platform.\n\nParent Story: ${storyId}`,
            issuetype: {
              name: 'Task'
            },
            priority: story.fields.priority,
            // Link to parent
            parent: {
              key: storyId
            }
          }
        };
        
        const createResponse = await jiraService.createIssue(taskData);
        if (createResponse.success) {
          createdTasks.push(createResponse.data);
        }
      }
      
      return {
        success: true,
        data: {
          storyId,
          createdTasks
        }
      };
    } catch (error) {
      console.error(`Error creating tasks for story ${storyId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async getMyCREStories() {
    const jql = `project = ${config.jira.projects.cre} AND issuetype = Story AND assignee = currentUser() ORDER BY priority DESC`;
    return await jiraService.searchIssues(jql);
  }

  async getCREDetails(creId) {
    try {
      // Get the main ticket details
      const ticketResponse = await jiraService.getIssue(creId);
      if (!ticketResponse.success) {
        return ticketResponse;
      }

      const ticket = ticketResponse.data;
      
      // Get subtasks if this is a story
      let subtasks = [];
      if (ticket.fields.issuetype?.name === 'Story' && ticket.fields.subtasks) {
        for (const subtask of ticket.fields.subtasks) {
          const subtaskDetails = await jiraService.getIssue(subtask.key);
          if (subtaskDetails.success) {
            subtasks.push(subtaskDetails.data);
          }
        }
      }
      
      // Get parent if this is a subtask
      let parent = null;
      if (ticket.fields.parent) {
        const parentResponse = await jiraService.getIssue(ticket.fields.parent.key);
        if (parentResponse.success) {
          parent = parentResponse.data;
        }
      }
      
      // Get linked issues
      let linkedIssues = [];
      if (ticket.fields.issuelinks) {
        linkedIssues = ticket.fields.issuelinks;
      }
      
      // Get comments
      let comments = [];
      if (ticket.fields.comment && ticket.fields.comment.comments) {
        comments = ticket.fields.comment.comments;
      }
      
      // Get attachments
      let attachments = [];
      if (ticket.fields.attachment) {
        attachments = ticket.fields.attachment;
      }

      return {
        success: true,
        data: {
          ticket,
          subtasks,
          parent,
          linkedIssues,
          comments,
          attachments
        }
      };
    } catch (error) {
      console.error(`Error getting CRE details for ${creId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async updateCRETaskStatus(taskId, status) {
    try {
      // Get available transitions
      const transitionsResponse = await jiraService.getTransitions(taskId);
      if (!transitionsResponse.success) {
        return transitionsResponse;
      }
      
      // Find the transition that matches the requested status
      const transition = transitionsResponse.data.transitions.find(
        t => t.name.toLowerCase() === status.toLowerCase()
      );
      
      if (!transition) {
        return {
          success: false,
          error: `No transition found for status "${status}". Available transitions: ${transitionsResponse.data.transitions.map(t => t.name).join(', ')}`
        };
      }
      
      // Perform the transition
      const updateResponse = await jiraService.transitionIssue(taskId, transition.id);
      
      return {
        success: updateResponse.success,
        data: {
          taskId,
          status,
          transitionApplied: updateResponse.success,
          commentAdded: false
        }
      };
    } catch (error) {
      console.error(`Error updating task status for ${taskId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async getTaskPriorities() {
    // Get all my tasks
    const jql = `project = ${config.jira.projects.cre} AND assignee = currentUser() ORDER BY priority DESC`;
    const tasksResponse = await jiraService.searchIssues(jql);
    
    if (!tasksResponse.success) {
      return tasksResponse;
    }
    
    // Calculate priority for each task
    const prioritizedTasks = [];
    
    for (const issue of tasksResponse.data.issues) {
      // Get additional data needed for priority calculation
      const issueDetails = await jiraService.getIssue(issue.key);
      
      if (issueDetails.success) {
        const priority = calculatePriority(
          issueDetails.data,
          config.workflow.priorityWeights
        );
        
        prioritizedTasks.push({
          key: issue.key,
          summary: issue.fields.summary,
          priority: issue.fields.priority,
          calculatedPriority: priority,
          status: issue.fields.status
        });
      }
    }
    
    // Sort by calculated priority
    prioritizedTasks.sort((a, b) => b.calculatedPriority - a.calculatedPriority);
    
    return {
      success: true,
      data: prioritizedTasks
    };
  }

  async suggestNextTask() {
    // Get prioritized tasks
    const prioritiesResponse = await this.getTaskPriorities();
    if (!prioritiesResponse.success) {
      return prioritiesResponse;
    }
    
    // Filter to only include tasks that are ready to work on
    const readyTasks = prioritiesResponse.data.filter(task => {
      // Assuming "To Do" or "Ready" are valid statuses for tasks that can be worked on
      return task.status?.name === 'To Do' || task.status?.name === 'Ready';
    });
    
    if (readyTasks.length === 0) {
      return {
        success: true,
        data: {
          message: 'No tasks ready to work on',
          suggestion: null
        }
      };
    }
    
    // Return the highest priority task
    return {
      success: true,
      data: {
        message: 'Suggested next task based on priority',
        suggestion: readyTasks[0]
      }
    };
  }

  async getBlockedTasks() {
    // Get all tasks with blockers
    const jql = `project = ${config.jira.projects.cre} AND assignee = currentUser() AND issueFunction in hasLinks("is blocked by")`;
    const blockedResponse = await jiraService.searchIssues(jql);
    
    if (!blockedResponse.success) {
      return blockedResponse;
    }
    
    // Get details for each blocked task
    const blockedTasks = [];
    
    for (const issue of blockedResponse.data.issues) {
      const issueDetails = await jiraService.getIssue(issue.key);
      
      if (issueDetails.success) {
        const blockers = [];
        
        // Extract blockers from issue links
        if (issueDetails.data.fields.issuelinks) {
          for (const link of issueDetails.data.fields.issuelinks) {
            if (link.type.name === 'Blocks' && link.inwardIssue) {
              blockers.push({
                key: link.inwardIssue.key,
                summary: link.inwardIssue.fields.summary,
                status: link.inwardIssue.fields.status?.name || 'Unknown'
              });
            }
          }
        }
        
        blockedTasks.push({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status?.name || 'Unknown',
          blockers
        });
      }
    }
    
    return {
      success: true,
      data: blockedTasks
    };
  }

  async estimateRemainingWork() {
    // Get all my tasks in the current sprint
    const currentSprint = getCurrentSprint();
    const jql = `project = ${config.jira.projects.cre} AND assignee = currentUser() AND sprint = "${currentSprint}"`;
    const tasksResponse = await jiraService.searchIssues(jql);
    
    if (!tasksResponse.success) {
      return tasksResponse;
    }
    
    // Count tasks by status
    const tasksByStatus = {
      completed: 0,
      inProgress: 0,
      toDo: 0
    };
    
    // Calculate story points by status
    const pointsByStatus = {
      completed: 0,
      inProgress: 0,
      toDo: 0
    };
    
    for (const issue of tasksResponse.data.issues) {
      const status = issue.fields.status?.name?.toLowerCase() || 'unknown';
      const storyPoints = issue.fields.customfield_10002 || 0; // Assuming this is the story points field
      
      if (status === 'done' || status === 'closed' || status === 'completed') {
        tasksByStatus.completed++;
        pointsByStatus.completed += storyPoints;
      } else if (status === 'in progress' || status === 'review') {
        tasksByStatus.inProgress++;
        pointsByStatus.inProgress += storyPoints;
      } else {
        tasksByStatus.toDo++;
        pointsByStatus.toDo += storyPoints;
      }
    }
    
    // Calculate percentages
    const totalTasks = tasksByStatus.completed + tasksByStatus.inProgress + tasksByStatus.toDo;
    const totalPoints = pointsByStatus.completed + pointsByStatus.inProgress + pointsByStatus.toDo;
    
    const percentComplete = totalTasks > 0 ? (tasksByStatus.completed / totalTasks) * 100 : 0;
    const percentPointsComplete = totalPoints > 0 ? (pointsByStatus.completed / totalPoints) * 100 : 0;
    
    return {
      success: true,
      data: {
        sprint: currentSprint,
        tasksByStatus,
        pointsByStatus,
        percentComplete: Math.round(percentComplete),
        percentPointsComplete: Math.round(percentPointsComplete),
        totalTasks,
        totalPoints
      }
    };
  }

  async addProgressComment(ticketId, message, mentions = []) {
    try {
      let commentText = message;
      
      // Add mentions if provided
      if (mentions && mentions.length > 0) {
        const mentionText = mentions.map(user => `[~${user}]`).join(' ');
        commentText = `${mentionText} ${commentText}`;
      }
      
      return await jiraService.addComment(ticketId, commentText);
    } catch (error) {
      console.error(`Error adding comment to ${ticketId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async generateStatusReport(period = 'weekly') {
    try {
      // Get completed work in the last period
      const completedSince = period === 'weekly' ? '1w' : '1d';
      const completedJql = `project = ${config.jira.projects.cre} AND assignee = currentUser() AND status changed to (Done, Closed, Completed) DURING (-${completedSince}, now())`;
      const completedResponse = await jiraService.searchIssues(completedJql);
      
      // Get work in progress
      const inProgressJql = `project = ${config.jira.projects.cre} AND assignee = currentUser() AND status in ("In Progress", "Review")`;
      const inProgressResponse = await jiraService.searchIssues(inProgressJql);
      
      // Get blocked tasks
      const blockedTasksResponse = await this.getBlockedTasks();
      
      // Get upcoming work
      const upcomingJql = `project = ${config.jira.projects.cre} AND assignee = currentUser() AND status in ("To Do", "Ready") ORDER BY priority DESC`;
      const upcomingResponse = await jiraService.searchIssues(upcomingJql, undefined, 0, 5);
      
      // Generate report text
      const report = {
        period,
        timestamp: new Date().toISOString(),
        completed: completedResponse.success ? completedResponse.data.issues : [],
        inProgress: inProgressResponse.success ? inProgressResponse.data.issues : [],
        blocked: blockedTasksResponse.success ? blockedTasksResponse.data : [],
        upcoming: upcomingResponse.success ? upcomingResponse.data.issues : []
      };
      
      return {
        success: true,
        data: report
      };
    } catch (error) {
      console.error(`Error generating status report:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async flagDependencyIssue(taskId, description) {
    try {
      // Add a comment flagging the dependency issue
      const commentResponse = await jiraService.addComment(
        taskId,
        `[DEPENDENCY ISSUE] ${description}`
      );
      
      // Optionally create a blocker issue and link it
      // This would require additional implementation
      
      return commentResponse;
    } catch (error) {
      console.error(`Error flagging dependency for ${taskId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async getParentCREStory(taskId) {
    try {
      // Get the task details including links
      const taskResponse = await jiraService.getIssue(taskId);
      if (!taskResponse.success) {
        return taskResponse;
      }
      
      const task = taskResponse.data;
      const issueLinks = task.fields.issuelinks || [];
      
      // Look for parent story through different link types
      let parentStory = null;
      
      // Check direct parent field first (if it exists)
      if (task.fields.parent) {
        parentStory = task.fields.parent;
      } else {
        // Check issue links for parent-child relationships
        for (const link of issueLinks) {
          // Look for "is child of" relationships
          if (link.type && link.type.inward === 'is child of' && link.inwardIssue) {
            parentStory = link.inwardIssue;
            break;
          }
          // Alternative: look for "parent of" relationships from the other direction
          if (link.type && link.type.outward === 'is parent of' && link.outwardIssue) {
            parentStory = link.outwardIssue;
            break;
          }
          // Fallback: look for stories linked with generic relationships
          const linkedIssue = link.inwardIssue || link.outwardIssue;
          if (linkedIssue && linkedIssue.fields && linkedIssue.fields.issuetype && 
              linkedIssue.fields.issuetype.name === 'Story' && 
              linkedIssue.key.startsWith(config.jira.projects.cre)) {
            parentStory = linkedIssue;
            break;
          }
        }
      }
      
      if (!parentStory) {
        return {
          success: false,
          error: `No parent CRE story found for task ${taskId}`
        };
      }
      
      // Get full details of the parent story
      const parentResponse = await jiraService.getIssue(parentStory.key);
      if (!parentResponse.success) {
        return parentResponse;
      }
      
      return {
        success: true,
        data: {
          task: task,
          parentStory: parentResponse.data
        }
      };
    } catch (error) {
      console.error(`Error getting parent CRE story for ${taskId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async getCPPFFromCREStory(storyId) {
    try {
      // Get the story details including links
      const storyResponse = await jiraService.getIssue(storyId);
      if (!storyResponse.success) {
        return storyResponse;
      }
      
      const story = storyResponse.data;
      const issueLinks = story.fields.issuelinks || [];
      
      // Look for linked CPPF ticket
      let cppfTicket = null;
      
      for (const link of issueLinks) {
        const linkedIssue = link.inwardIssue || link.outwardIssue;
        if (linkedIssue && linkedIssue.key.startsWith(config.jira.projects.cppf)) {
          cppfTicket = linkedIssue;
          break;
        }
      }
      
      if (!cppfTicket) {
        return {
          success: false,
          error: `No CPPF ticket found linked to story ${storyId}`
        };
      }
      
      // Get full CPPF details including Confluence docs
      const cppfDetails = await this.getCPPFDetails(cppfTicket.key);
      
      return {
        success: true,
        data: {
          story: story,
          cppf: cppfDetails.success ? cppfDetails.data : null
        }
      };
    } catch (error) {
      console.error(`Error getting CPPF from CRE story ${storyId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async getTaskHierarchyAndCPPF(taskId) {
    try {
      // First get the parent CRE story
      const parentResponse = await this.getParentCREStory(taskId);
      if (!parentResponse.success) {
        return parentResponse;
      }
      
      // Then get the CPPF from the parent story
      const cppfResponse = await this.getCPPFFromCREStory(parentResponse.data.parentStory.key);
      if (!cppfResponse.success) {
        return {
          success: true,
          data: {
            task: parentResponse.data.task,
            parentStory: parentResponse.data.parentStory,
            cppf: null,
            warning: cppfResponse.error
          }
        };
      }
      
      return {
        success: true,
        data: {
          task: parentResponse.data.task,
          parentStory: parentResponse.data.parentStory,
          cppf: cppfResponse.data.cppf,
          hierarchy: {
            cppfId: cppfResponse.data.cppf ? cppfResponse.data.cppf.cppf.key : null,
            storyId: parentResponse.data.parentStory.key,
            taskId: taskId
          }
        }
      };
    } catch (error) {
      console.error(`Error getting task hierarchy and CPPF for ${taskId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Helper methods
  _extractConfluencePageIds(text) {
    const pageIds = [];
    // Look for Confluence page IDs in URLs like /pages/123456 or ?pageId=123456
    const pageIdRegex = /\/pages\/(\d+)|pageId=(\d+)/g;
    let match;
    
    while ((match = pageIdRegex.exec(text)) !== null) {
      const pageId = match[1] || match[2];
      if (pageId && !pageIds.includes(pageId)) {
        pageIds.push(pageId);
      }
    }
    
    return pageIds;
  }

  _generateCREDescription(cppfIssue, analysis) {
    const description = `
h2. CRE Story for ${cppfIssue.key}

h3. Summary
${cppfIssue.fields.summary}

h3. Requirements for ${analysis.role} role
${analysis.requirements.map(req => `* ${req}`).join('\n')}

h3. Platforms
${analysis.detectedPlatforms.map(platform => `* ${platform}`).join('\n')}

h3. Complexity
${analysis.complexity} story points

h3. Original CPPF
[${cppfIssue.key}|${cppfIssue.self}]
    `;
    
    return description;
  }
}

export default new WorkflowService(); 