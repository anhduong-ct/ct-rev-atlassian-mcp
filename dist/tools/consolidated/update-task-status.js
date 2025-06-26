import workflowService from '../../services/refactored/workflow.js';
import { getJiraTicketUrl } from '../../utils/urls.js';

/**
 * Consolidated Task Status Update Tool
 * Simplified from: update_cre_task_status
 * LLM-First Approach: Returns raw update data for LLM analysis
 */
const updateTaskStatus = {
  name: 'mcp_Atlassian_MCP_update_task_status',
  description: 'Update task status with validation and history tracking',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'CRE task ID (e.g. CRE-1234)'
      },
      status: {
        type: 'string',
        description: 'New status (e.g. "In Progress", "Done", "To Do", "In Review")'
      },
      comment: {
        type: 'string',
        description: 'Optional comment explaining the status change'
      },
      assignee: {
        type: 'string',
        description: 'Optional new assignee (username or email)'
      }
    },
    required: ['taskId', 'status']
  },
  
  handler: async ({ taskId, status, comment, assignee }) => {
    try {
      // Get current task details
      const taskResponse = await workflowService.getIssue(taskId, [
        'summary', 'description', 'status', 'assignee', 'priority', 'issuelinks',
        'labels', 'components', 'created', 'updated', 'issuetype', 'project'
      ]);
      
      if (!taskResponse.success) {
        return {
          success: false,
          error: `Failed to get task ${taskId}: ${taskResponse.error}`
        };
      }
      
      const task = taskResponse.data;
      const currentStatus = task.fields.status?.name;
      
      // Check if status change is needed
      if (currentStatus === status) {
        return {
          success: true,
          data: {
            task: {
              ...task,
              url: getJiraTicketUrl(task.key)
            },
            statusChange: {
              changed: false,
              message: `Task ${taskId} is already in status "${status}"`
            },
            metadata: {
              requestedAt: new Date().toISOString(),
              noChangeNeeded: true
            }
          }
        };
      }
      
      // Prepare update data
      const updateData = {
        fields: {}
      };
      
      // Add assignee if provided
      if (assignee) {
        updateData.fields.assignee = { name: assignee };
      }
      
      // Update the task
      const updateResponse = await workflowService.updateIssue(taskId, updateData);
      
      if (!updateResponse.success) {
        return {
          success: false,
          error: `Failed to update task ${taskId}: ${updateResponse.error}`
        };
      }
      
      // Transition status if needed
      let transitionResponse = { success: true };
      if (status !== currentStatus) {
        transitionResponse = await workflowService.transitionIssue(taskId, status);
      }
      
      // Add comment if provided
      let commentResponse = { success: true };
      if (comment) {
        const commentText = `Status changed from "${currentStatus}" to "${status}"\n\n${comment}`;
        commentResponse = await workflowService.addComment(taskId, commentText);
      }
      
      // Get updated task details
      const updatedTaskResponse = await workflowService.getIssue(taskId, [
        'summary', 'description', 'status', 'assignee', 'priority', 'issuelinks',
        'labels', 'components', 'created', 'updated', 'issuetype', 'project'
      ]);
      
      const updatedTask = updatedTaskResponse.success ? updatedTaskResponse.data : task;
      
      // Return raw update data for LLM analysis
      return {
        success: transitionResponse.success,
        data: {
          task: {
            before: {
              ...task,
              url: getJiraTicketUrl(task.key)
            },
            after: {
              ...updatedTask,
              url: getJiraTicketUrl(updatedTask.key)
            }
          },
          statusChange: {
            changed: true,
            from: currentStatus,
            to: status,
            successful: transitionResponse.success,
            error: transitionResponse.success ? null : transitionResponse.error
          },
          assigneeChange: assignee ? {
            changed: true,
            to: assignee,
            successful: updateResponse.success
          } : null,
          commentAdded: comment ? {
            added: true,
            successful: commentResponse.success,
            text: comment,
            error: commentResponse.success ? null : commentResponse.error
          } : null,
          metadata: {
            requestedAt: new Date().toISOString(),
            requestedBy: 'system', // Could be enhanced to track actual user
            operations: {
              fieldUpdate: updateResponse.success,
              statusTransition: transitionResponse.success,
              commentAdd: comment ? commentResponse.success : null
            }
          }
        }
      };
    } catch (error) {
      console.error('Error updating task status:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

export default [updateTaskStatus]; 