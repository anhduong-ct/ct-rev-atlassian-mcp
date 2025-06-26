import jiraService from './jira.js';
import confluenceService from './confluence.js';
import { config, getCurrentSprint } from '../config.js';
import { detectPlatforms, extractRequirements, estimateComplexity } from '../utils/parser.js';
import { calculatePriority } from '../utils/priority.js';
import { extractFigmaLinks } from '../utils/urls.js';

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
        confluenceDocs: confluenceDocs.success ? confluenceDocs.data.docs : [],
        figmaLinks: confluenceDocs.success ? confluenceDocs.data.figmaLinks : []
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

      // Determine which field to use for description and summary
      const descriptionField = cppfResponse?.data?.fields?.description || cppfResponse?.data?.renderFields?.description;
      const summaryField = cppfResponse?.data?.fields?.summary || cppfResponse?.data?.renderFields?.summary;
      
      // Log the structure of descriptionField before extraction if in debug mode
      if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
        console.log('Description field structure:', typeof descriptionField, 
          descriptionField && typeof descriptionField === 'object' ? `(type: ${descriptionField.type || 'unknown'})` : '');
      }
      
      // Use the enhanced helper function to safely extract text from fields
      const description = this._extractJiraText(descriptionField);
      const summary = this._extractJiraText(summaryField);
      
      // Log just the extracted description, not the full field objects
      console.log('Extracted description text:', description ? `${description.slice(0, 100)}${description.length > 100 ? '...' : ''}` : 'Empty');

      // Extract Confluence page IDs from description (looking for confluence links)
      const confluencePageIds = this._extractConfluencePageIds(description);

      console.log('Extracted Confluence page IDs from CPPF', confluencePageIds);
      
      // Extract Figma links from CPPF ticket description and summary
      let figmaLinks = [];
      figmaLinks.push(...extractFigmaLinks(description));
      figmaLinks.push(...extractFigmaLinks(summary));
      
      // Search for related Confluence pages by CPPF ID and summary terms
      const searchTerms = [cppfId, ...summary.split(' ').filter(term => term.length > 3)];
      const searchQuery = searchTerms.join(' ');
      
      const searchResponse = await confluenceService.searchAllSpaces(searchQuery);
      
      // Combine explicit links and search results
      const allDocs = [];
      
      // Add explicitly linked pages
      if (confluencePageIds?.length > 0) {
        for (const pageId of confluencePageIds) {
          const pageResponse = await confluenceService.getPage(pageId);
          if (pageResponse.success) {
            allDocs.push(pageResponse.data);
            // Extract Figma links from explicitly linked Confluence page content
            if (pageResponse.data.body && pageResponse.data.body.storage && pageResponse.data.body.storage.value) {
              figmaLinks.push(...extractFigmaLinks(pageResponse.data.body.storage.value));
            }
          }
        }
      }
      
      // Add search results, avoiding duplicates
      if (searchResponse.success) {
        for (const page of searchResponse.data.results) {
          if (!allDocs.some(doc => doc.id === page.id)) {
            allDocs.push(page);
            // Extract Figma links from Confluence page content
            if (page.body && page.body.storage && page.body.storage.value) {
              figmaLinks.push(...extractFigmaLinks(page.body.storage.value));
            }
          }
        }
      }
      
      return { success: true, data: { docs: allDocs, figmaLinks: Array.from(new Set(figmaLinks)) } };
    } catch (error) {
      console.error(`Error getting Confluence docs for ${cppfId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async createCREStoryFromCPPF(cppfId) {
    try {
      // Get CPPF details
      const cppfResponse = await jiraService.getIssue(cppfId);
      if (!cppfResponse.success) {
        return cppfResponse;
      }
      
      const cppf = cppfResponse.data;
      
      // Get create metadata first to check available fields
      const metaResponse = await jiraService.getCreateMeta(config.jira.projects.cre);
      if (!metaResponse.success) {
        console.error('Failed to get create metadata:', metaResponse.error);
      } 

      // Get Confluence docs to detect platforms from linked docs
      const confluenceDocs = await this.getCPPFConfluenceDocs(cppfId);
      const platformPrefix = await this._determinePlatformPrefix(cppf, confluenceDocs.success ? confluenceDocs.data.docs : []);

      // Start with minimal required fields
      const storyData = {
        fields: {
          project: {
            key: config.jira.projects.cre
          },
          summary: `${platformPrefix}${cppf.fields.summary}`,
          issuetype: {
            name: 'Story'
          },
          assignee: {
            accountId: config.user.accountId // Auto-fill assignee
          }
        }
      };

      // Add optional fields based on what's available in the project
      try {
        if (metaResponse.success) {
          const storyFields = metaResponse.data.projects[0]?.issuetypes
            ?.find(type => type.name === 'Story')?.fields;
          
          if (storyFields) {
            // Add sprint field if available
            const sprintField = storyFields[config.jira.customFields.sprint];
            // Auto-detect current sprint instead of using config
            const currentSprint = await this._getCurrentSprintForField();
            if (sprintField && currentSprint) {
              storyData.fields[config.jira.customFields.sprint] = currentSprint;
            }

            // Add Release PIC field
            const releasePicField = Object.values(storyFields)
              .find(field => field.name?.toLowerCase().includes('release') && field.name?.toLowerCase().includes('pic'));
            
            if (releasePicField) {
              storyData.fields[releasePicField.key] = {
                accountId: config.user.accountId
              };
            }
            
            // Add QA field
            const qaField = Object.values(storyFields)
              .find(field => field.name?.toLowerCase().includes('qa'));
            
            if (qaField) {
              storyData.fields[qaField.key] = {
                emailAddress: 'vuhoang@chotot.vn'
              };
            }
          }
        } else {
          console.warn('Could not get create metadata - sprint field will not be set');
        }
      } catch (metaError) {
        console.warn('Could not get create meta for auto-fill fields:', metaError.message);
      }

      // Log the story data before creation
      console.log('Creating story with data:', JSON.stringify(storyData, null, 2));
      
      // Log the prepared data
      console.log('Preparing CRE story data:', JSON.stringify(storyData, null, 2));
      
      // Create the CRE story
      const createResponse = await jiraService.createIssue(storyData);
      if (!createResponse.success) {
        return createResponse;
      }

      // Get available link types and ensure we use "Relates" type
      const linkTypesResponse = await jiraService.getIssueLinkTypes();
      let linkType = 'Relates'; // Default fallback
      
      if (linkTypesResponse.success) {
        const availableTypes = linkTypesResponse.data.issueLinkTypes;
        console.log('Available JIRA link types:', 
          JSON.stringify(availableTypes, null, 2));
        
        // Use helper method to find the "Relates" link type
        linkType = this._findRelatesLinkType(availableTypes);
        console.log(`Using link type: ${linkType} for CRE-CPPF connection`);
      }
      
      // Link the CRE story to the CPPF ticket using the found link type
      console.log(`Creating link of type '${linkType}' between CRE story ${createResponse.data.key} and CPPF ${cppfId}`);
      const linkResponse = await jiraService.createIssueLink(
        createResponse.data.key,
        cppfId,
        linkType
      );
      
      // Log link creation result
      if (!linkResponse.success) {
        console.error('Failed to create link:', linkResponse.error);
      }

      // Return the created story data
      return {
        success: true,
        data: {
          creStory: createResponse.data,
          linkCreated: linkResponse.success,
          linkType: linkType
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
      
      // If platforms not specified, try to get from story platform field or detect from description
      let targetPlatforms = platforms;
      
      if (!targetPlatforms) {
        // First try to get platforms from the platform field (if CRE stories have it)
        // TODO: improve after: get platforms from CPPF
        const platformField = story.fields.customfield_10601;
        if (platformField && Array.isArray(platformField) && platformField.length > 0) {
          targetPlatforms = platformField.map(item => item?.value || item).filter(Boolean);
        }
        
        // Fallback to content parsing if no platform field
        if (!targetPlatforms || targetPlatforms.length === 0) {
          const description = this._extractJiraText(story.fields.description);
          targetPlatforms = detectPlatforms(description, story) || config.workflow.platforms;
        }
      }
      
      const createdTasks = [];
      
      // Create a task for each platform
      for (const platform of targetPlatforms) {
        const taskData = {
          fields: {
            project: {
              key: config.jira.projects.cre
            },
            summary: this._generateTaskSummary(story.fields.summary, platform),
            issuetype: {
              name: 'Task'
            },
            assignee: {
              accountId: config.user.accountId // Auto-fill assignee
            }
          }
        };
        
        // Add optional fields based on what's available in the project
        try {
          const createMeta = await jiraService.getCreateMeta(config.jira.projects.cre);
          if (createMeta.success) {
            const taskFields = createMeta.data.projects[0]?.issuetypes
              ?.find(type => type.name === 'Task')?.fields;
            
            if (taskFields) {
              // Add sprint field if available
              const sprintField = taskFields[config.jira.customFields.sprint];
              // Auto-detect current sprint instead of using config
              const currentSprint = await this._getCurrentSprintForField();
              if (sprintField && currentSprint) {
                taskData.fields[config.jira.customFields.sprint] = currentSprint;
              } else {
                console.warn(`Sprint field ${config.jira.customFields.sprint} not available in Task create screen or no current sprint detected`);
              }

              // Add Engineer field
              const engineerField = Object.values(taskFields)
                .find(field => field.name?.toLowerCase().includes('engineer'));
              
              if (engineerField) {
                taskData.fields[engineerField.key] = {
                  accountId: config.user.accountId
                };
              }
              
              // Add QA field
              const qaField = Object.values(taskFields)
                .find(field => field.name?.toLowerCase().includes('qa'));
              
              if (qaField) {
                taskData.fields[qaField.key] = {
                  emailAddress: 'vuhoang@chotot.vn'
                };
              }
            }
          } else {
            console.warn('Could not get create metadata for tasks - sprint field will not be set');
          }
        } catch (metaError) {
          console.warn('Could not get create meta for auto-fill fields:', metaError.message);
        }
        const createResponse = await jiraService.createIssue(taskData);
        if (createResponse.success) {
          const newTask = createResponse.data;
          createdTasks.push(newTask);
          
          // Create issue link between task and story using "is child of"/"is parent of" relationship
          try {
            // Create child-parent relationship (task is child of story)
            const linkResponse = await jiraService.createIssueLink(newTask.key, storyId, 'Parent Child');
            // log error if link creation failed
            if (!linkResponse.success) {
              console.warn(`Failed to create Parent Child link for ${newTask.key} -> ${storyId}:`, linkResponse.error);
            }
            
            if (!linkResponse.success) {
              await jiraService.createIssueLink(newTask.key, storyId, 'Relates');
              console.warn(`Used Relates link as fallback for ${newTask.key} -> ${storyId}`);
            }
          } catch (linkError) {
            console.warn(`Could not create issue link between ${newTask.key} and ${storyId}:`, linkError.message);
          }
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

  async updateCRETaskStatus(taskId, targetStatus) {
    try {
      // Get current issue details to know the starting point
      const issueResponse = await jiraService.getIssue(taskId);
      if (!issueResponse.success) {
        return issueResponse;
      }
      
      const currentStatus = issueResponse.data.fields.status.name;
      console.log(`Current status for ${taskId}: ${currentStatus}`);
      
      // Define workflow paths and allowed transitions based on the provided image
      const workflowPaths = {
        'NEW': ['FOR DEVELOPMENT', 'CLOSED'], // Reordered to prioritize direct 'FOR DEVELOPMENT'
        'DISCUSSION': ['NEW', 'FOR DEVELOPMENT', 'CLOSED'],
        'FOR DEVELOPMENT': ['NEW', 'DISCUSSION', 'DEVELOPING'],
        'DEVELOPING': ['FOR DEVELOPMENT', 'WAITING FOR REVIEW'],
        'WAITING FOR REVIEW': ['DEVELOPING', 'ON STAGING'],
        'ON STAGING': ['WAITING FOR REVIEW', 'READY TO UAT'],
        'READY TO UAT': ['ON STAGING', 'ON UAT'],
        'ON UAT': ['READY TO PROD'],
        'READY TO PROD': ['ON PRODUCTION', 'ON STAGING'],
        'ON PRODUCTION': ['CLOSED']
        // CLOSED is a terminal state, no outgoing paths from it in this map
      };

      // Normalize status names for comparison
      const normalizeStatus = (s) => s.toUpperCase().replace(/-/g, ' ').trim();
      const normalizedTarget = normalizeStatus(targetStatus);
      const normalizedCurrent = normalizeStatus(currentStatus);

      // If already in the target status, no action needed.
      if (normalizedCurrent === normalizedTarget) {
        return {
          success: true,
          data: {
            taskId,
            originalStatus: currentStatus,
            targetStatus,
            path: [], // No transitions executed
            transitionApplied: false,
            message: "Issue is already in the target status."
          }
        };
      }

      // Get available transitions
      const transitionsResponse = await jiraService.getTransitions(taskId);
      if (!transitionsResponse.success) {
        return transitionsResponse;
      }

      // Find valid path to target status using backward tracing with smart path selection
      // This approach finds the shortest path while preferring logical workflow sequences
      const findOptimalPath = (currentStatus, targetStatus) => {
        // Create reverse mapping to find which statuses can lead to each status
        const reverseWorkflowPaths = {};
        for (const [fromStatus, toStatuses] of Object.entries(workflowPaths)) {
          for (const toStatus of toStatuses) {
            if (!reverseWorkflowPaths[toStatus]) {
              reverseWorkflowPaths[toStatus] = [];
            }
            reverseWorkflowPaths[toStatus].push(fromStatus);
          }
        }

        // Define logical workflow sequences to prefer direct progression for ALL statuses
        // This maps each status to its preferred predecessor(s) based on natural workflow flow
        const preferredPredecessors = {
          // Development flow preferences
          'FOR DEVELOPMENT': ['NEW'], // Prefer coming from NEW rather than DISCUSSION
          'DEVELOPING': ['FOR DEVELOPMENT'], // Prefer coming from FOR DEVELOPMENT rather than ON STAGING
          'WAITING FOR REVIEW': ['DEVELOPING'], // Natural progression from development
          'ON STAGING': ['WAITING FOR REVIEW'], // Prefer coming from review rather than backtracking
          
          // UAT flow preferences  
          'READY TO UAT': ['ON STAGING'], // Natural progression to UAT preparation
          'ON UAT': ['READY TO UAT'], // Natural progression from ready to UAT
          
          // Production flow preferences
          'READY TO PROD': ['ON UAT'], // Prefer coming from UAT rather than staging (main fix)
          'ON PRODUCTION': ['READY TO PROD'], // Natural progression from ready to prod
          
          // Terminal state preferences
          'CLOSED': ['ON PRODUCTION'], // Prefer completing full workflow rather than early closure
          
          // Discussion flow (less common paths)
          'DISCUSSION': ['NEW'], // If going to discussion, prefer from NEW
        };

        // Fallback strategy: if no preferred predecessors are defined for a status,
        // prefer predecessors that represent forward progression (avoid backtracking)
        const getPreferredPredecessorsWithFallback = (status, allPredecessors) => {
          // If we have explicit preferences, use them
          if (preferredPredecessors[status]) {
            return preferredPredecessors[status];
          }
          
          // Fallback: prefer predecessors that don't represent backtracking
          // Define "forward progression" order based on typical workflow stages
          const progressionOrder = [
            'NEW', 'DISCUSSION', 'FOR DEVELOPMENT', 'DEVELOPING', 
            'WAITING FOR REVIEW', 'ON STAGING', 'READY TO UAT', 'ON UAT', 
            'READY TO PROD', 'ON PRODUCTION', 'CLOSED'
          ];
          
          const currentIndex = progressionOrder.indexOf(status);
          if (currentIndex > 0) {
            // Prefer predecessors that come immediately before in the progression
            const preferredByProgression = allPredecessors.filter(pred => {
              const predIndex = progressionOrder.indexOf(pred);
              return predIndex >= 0 && predIndex < currentIndex;
            });
            
            if (preferredByProgression.length > 0) {
              // Sort by proximity to current status (closer = more preferred)
              return preferredByProgression.sort((a, b) => {
                const aIndex = progressionOrder.indexOf(a);
                const bIndex = progressionOrder.indexOf(b);
                return (currentIndex - aIndex) - (currentIndex - bIndex);
              });
            }
          }
          
          // If no logical progression found, return empty array (no preference)
          return [];
        };

        // Use BFS to find shortest path by working backwards from target
        const queue = [{ status: targetStatus, path: [targetStatus] }];
        const visited = new Set([targetStatus]);

        while (queue.length > 0) {
          const { status, path } = queue.shift();
          
          // If we've reached the current status, we found the path
          if (status === currentStatus) {
            return path.reverse(); // Reverse because we built it backwards
          }
          
          // Get all statuses that can lead to the current status
          let predecessors = reverseWorkflowPaths[status] || [];
          
          // Sort predecessors to prefer logical workflow sequences
          predecessors = predecessors.sort((a, b) => {
            // Get preferred predecessors for current status (with fallback logic)
            const preferred = getPreferredPredecessorsWithFallback(status, predecessors);
            
            const aIndex = preferred.indexOf(a);
            const bIndex = preferred.indexOf(b);
            
            // If both a and b are in preferred list, sort by their order in the preferred list
            if (aIndex !== -1 && bIndex !== -1) {
              return aIndex - bIndex;
            }
            
            // If only a is preferred, it comes first
            if (aIndex !== -1) {
              return -1;
            }
            
            // If only b is preferred, it comes first
            if (bIndex !== -1) {
              return 1;
            }
            
            // If neither is explicitly preferred, maintain original order
            return 0;
          });
          
          for (const predecessor of predecessors) {
            if (!visited.has(predecessor)) {
              visited.add(predecessor);
              queue.push({
                status: predecessor,
                path: [...path, predecessor]
              });
            }
          }
        }
        
        return null; // No path found
      };

      const path = findOptimalPath(normalizedCurrent, normalizedTarget);
      
      if (!path || path.length === 0) {
        return {
          success: false,
          error: `No valid transition path found from "${currentStatus}" to "${targetStatus}" based on defined workflow paths.`
        };
      }

      // Execute transitions along the path
      // path[0] is the current status. Transitions start from path[1].
      let currentIssueStatusForLogging = currentStatus;
      let currentTransitionsResponse = transitionsResponse; // Use initial transitions for first step
      
      for (let i = 1; i < path.length; i++) {
        const nextStateInPath = path[i];
        // Find a Jira transition whose TARGET status matches the nextStateInPath
        const targetTransition = currentTransitionsResponse.data.transitions.find(
          t => t.to && t.to.name && normalizeStatus(t.to.name) === nextStateInPath
        );
        
        if (!targetTransition) {
          const availableTargets = currentTransitionsResponse.data.transitions
            .map(t => t.to && t.to.name ? normalizeStatus(t.to.name) : null)
            .filter(name => name)
            .join(', ');
          return {
            success: false,
            error: `Required transition to "${nextStateInPath}" not available from "${currentIssueStatusForLogging}". Available Jira transitions lead to: [${availableTargets || 'None'}]`
          };
        }

        const updateResponse = await jiraService.transitionIssue(taskId, targetTransition.id);
        if (!updateResponse.success) {
          return {
            success: false,
            error: `Failed to transition from "${currentIssueStatusForLogging}" to "${nextStateInPath}" (using Jira transition "${targetTransition.name}" to status "${targetTransition.to.name}"): ${updateResponse.error}`
          };
        }
        
        currentIssueStatusForLogging = nextStateInPath; // Update for logging in the next iteration
        
        // Refetch available transitions for the next step (if there are more steps)
        if (i + 1 < path.length) {
          const refreshedTransitionsResponse = await jiraService.getTransitions(taskId);
          if (!refreshedTransitionsResponse.success) {
            return {
              success: false,
              error: `Failed to fetch transitions after moving to "${nextStateInPath}": ${refreshedTransitionsResponse.error}`
            };
          }
          currentTransitionsResponse = refreshedTransitionsResponse;
        }
      }

      return {
        success: true,
        data: {
          taskId,
          originalStatus: currentStatus,
          targetStatus,
          path: path.slice(1), // Exclude current status from the reported path of transitions
          transitionApplied: true
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
  /**
   * Get current sprint using auto-detection mechanism with smart next-sprint logic
   * @returns {string|null} - The current sprint name or next sprint if near end date
   * @private
   */
  async _getCurrentSprintForField() {
    try {
      // Get current sprint information with dates
      const { default: sprintDetectionService } = await import('./sprintDetection.js');
      const currentSprintResponse = await sprintDetectionService.getCurrentSprint();
      
      if (currentSprintResponse.success) {
        const currentSprint = currentSprintResponse.data;
        const now = new Date();
        
        if (currentSprint.endDate) {
          const endDate = new Date(currentSprint.endDate);
          const daysUntilEnd = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
                    
          const thresholdDays = config.sprint.nextSprintThresholdDays || 3;
          if (daysUntilEnd <= thresholdDays) {            
            const nextSprintResponse = await sprintDetectionService.getNextSprint();
            if (nextSprintResponse.success) {
              const nextSprint = nextSprintResponse.data;
              return nextSprint.id;
            } else {
              console.warn('Could not get next sprint, falling back to current sprint');
            }
          }
        }
        return currentSprint.id;
      }
      
      // Fallback to previous logic if getCurrentSprint fails
      console.warn('Could not get current sprint with dates, falling back to auto-detection...');
      
      // First try to get current sprint from config if already available
      if (config.user.currentSprint && config.user.currentSprint !== 'No Sprint Detected') {
        return config.user.currentSprint;
      }
      
      // Use auto-detection to get current sprint
      const { autoDetectSprint } = await import('../config.js');
      const detectedSprint = await autoDetectSprint();
      
      if (detectedSprint && detectedSprint !== 'No Sprint Detected') {
        return detectedSprint;
      }
      
      console.warn('Could not detect current sprint');
      return null;
    } catch (error) {
      console.error('Error getting current sprint for field:', error.message);
      return null;
    }
  }

  /**
   * Safely extract text from a Jira field that could be a string or an object with a content property
   * Handles Atlassian Document Format (ADF) structure used in Jira descriptions
   * @param {string|object} field - The field to extract text from
   * @returns {string} - The extracted text, or empty string if not found
   * @private
   */
  _extractJiraText(field) {
    if (!field) return '';
    
    // If field is a string, return it directly
    if (typeof field === 'string') {
      return field;
    } 
    
    // Handle objects (including ADF structure)
    if (typeof field === 'object') {
      // Handle arrays by recursively extracting text from each element and joining
      if (Array.isArray(field)) {
        return field.map(item => this._extractJiraText(item)).join(' ');
      }
      
      // Handle text nodes in ADF
      if (field.type === 'text' && field.text) {
        return field.text;
      }
      
      // Handle ADF structures with specific text handling for common node types
      if (field.type) {
        const type = field.type.toLowerCase();
        // Special handling for specific node types
        if (['paragraph', 'heading', 'bulletList', 'listItem', 'orderedList'].includes(type)) {
          if (field.content) {
            return this._extractJiraText(field.content);
          }
        }
      }
      
      // General case for objects with content property
      if (field.content) {
        if (typeof field.content === 'string') {
          return field.content;
        } else if (Array.isArray(field.content)) {
          return field.content.map(item => this._extractJiraText(item)).join(' ');
        } else if (typeof field.content === 'object') {
          return this._extractJiraText(field.content);
        }
      }
      
      // Handle case where the object might have text property directly
      if (field.text && typeof field.text === 'string') {
        return field.text;
      }
      
      // For doc type at the root level (ADF specific)
      if (field.type === 'doc' && field.version) {
        return this._extractJiraText(field.content || '');
      }
    }
    
    return '';
  }
  
  _extractConfluencePageIds(text) {
    const pageIds = [];
    
    // Return empty array if text is undefined or empty
    if (!text) {
      console.log('No text provided to extract Confluence page IDs');
      return pageIds;
    }
    
    // Use the helper function to extract text if needed
    text = this._extractJiraText(text);
    
    // Log extracted text length for debugging
    const textLength = text ? text.length : 0;
    console.log(`Processing text for Confluence page IDs (${textLength} characters)`);
    
    // Skip regex processing if text is empty
    if (!text) {
      return pageIds;
    }
    
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
    try {
      // Create a basic plain text description as fallback
      let plainText = [
        `CRE Story for ${cppfIssue.key}`,
        '',
        'Summary:',
        cppfIssue.fields.summary,
        '',
        `Requirements for ${analysis.role} role:`,
        ...(analysis.requirements || []).map(req => `* ${req}`),
        '',
        'Platforms:',
        ...(analysis.detectedPlatforms || []).map(platform => `* ${platform}`),
        '',
        'Complexity:',
        `${analysis.complexity} story points`,
        '',
        'Original CPPF:',
        cppfIssue.key
      ].join('\n');

      return plainText;
    } catch (error) {
      console.error('Error generating CRE description:', error);
      // Return a minimal description if there's an error
      return `Story created from CPPF ${cppfIssue.key}`;
    }
  }

  _findRelatesLinkType(availableTypes) {
    // First look for exact "Relates" name match
    const exactMatch = availableTypes.find(t => t.name === 'Relates');
    if (exactMatch) {
      return exactMatch.name;
    }

    // Then look for case-insensitive "relates to" variations
    const relatesMatch = availableTypes.find(t => 
      t.name.toLowerCase() === 'relates to' ||
      (t.inward.toLowerCase().includes('relates') && t.outward.toLowerCase().includes('relates'))
    );

    return relatesMatch ? relatesMatch.name : 'Relates'; // Default to 'Relates' if not found
  }

  async _determinePlatformPrefix(cppf, confluenceDocs) {
    try {
      // Get platforms directly from the platform field
      const platformField = cppf.fields.customfield_10601;
      
      if (platformField && Array.isArray(platformField) && platformField.length > 0) {
        const platforms = platformField.map(item => item?.value || item).filter(Boolean);
        
        if (platforms.length > 0) {
          // Handle "All Platforms" case
          if (platforms.some(p => p === 'All Platforms')) {
            return '[+][FE/BE]';
          }
          
          // Map Jira platform names to prefixes
          const platformMap = {
            'Web browser': 'Web',
            'Mobile browser': 'Web',
            'Android': 'Android',
            'iOS': 'iOS',
            'Internal': 'BE'
          };
          
          const platformAbbrs = platforms
            .map(p => platformMap[p] || p.toUpperCase())
            .filter(Boolean);
          
          return `[+][${platformAbbrs.join('/')}]`;
        }
      }
      
      // Fallback if no platform field found
      return '[+][FE/BE]';
    } catch (error) {
      console.error('Error determining platform prefix:', error);
      return '[+][FE/BE]';
    }
  }

  /**
   * Generate task summary with proper platform prefix
   * @param {string} storySummary - The original story summary
   * @param {string} platform - The platform name (web, backend, app, ios)
   * @returns {string} - The formatted task summary
   * @private
   */
  _generateTaskSummary(storySummary, platform) {
    // Platform mapping to display names
    const platformMap = {
      'web': 'Web',
      'backend': 'BE', 
      'app': 'Android',
      'ios': 'iOS'
    };
    
    const platformDisplay = platformMap[platform.toLowerCase()] || platform.toUpperCase();
    
    // Check if story already has [+] prefix
    if (storySummary.startsWith('[+]')) {
      // Extract everything after the first platform prefix
      // Pattern: [+][Platform] or [+][Platform1/Platform2] followed by the rest
      const match = storySummary.match(/^\[\+\]\[([^\]]+)\](.*)$/);
      if (match) {
        const restOfSummary = match[2].trim();
        return `[+][${platformDisplay}]${restOfSummary}`;
      }
    }
    
    // Check if story has old format [Platform] prefix
    const oldFormatMatch = storySummary.match(/^\[([^\]]+)\](.*)$/);
    if (oldFormatMatch) {
      const restOfSummary = oldFormatMatch[2].trim();
      return `[+][${platformDisplay}]${restOfSummary}`;
    }
    
    // If no recognizable prefix, add the new format prefix
    return `[+][${platformDisplay}] ${storySummary}`;
  }
}

export default new WorkflowService();