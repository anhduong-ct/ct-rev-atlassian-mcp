import workflowService from '../../services/refactored/workflow.js';
import { getJiraTicketUrl } from '../../utils/urls.js';

/**
 * Consolidated Task Comment Tool
 * Unified from: add_progress_comment
 * LLM-First Approach: Returns raw comment data for LLM analysis
 */
const addTaskComment = {
  name: 'mcp_Atlassian_MCP_add_task_comment',
  description: 'Add comments to tickets with optional mentions and formatting',
  inputSchema: {
    type: 'object',
    properties: {
      ticketId: {
        type: 'string',
        description: 'Ticket ID (e.g. CPPF-1234 or CRE-1234)'
      },
      message: {
        type: 'string',
        description: 'Comment message'
      },
      mentions: {
        type: 'array',
        items: { type: 'string' },
        description: 'User IDs to mention in the comment'
      },
      commentType: {
        type: 'string',
        enum: ['progress', 'issue', 'question', 'update', 'general'],
        default: 'general',
        description: 'Type of comment for better formatting'
      },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'urgent'],
        default: 'normal',
        description: 'Comment priority level'
      }
    },
    required: ['ticketId', 'message']
  },
  
  handler: async ({ 
    ticketId, 
    message, 
    mentions = [], 
    commentType = 'general', 
    priority = 'normal' 
  }) => {
    try {
      // Get ticket details for context
      const ticketResponse = await workflowService.getIssue(ticketId, [
        'summary', 'description', 'status', 'assignee', 'priority', 'issuelinks',
        'labels', 'components', 'created', 'updated', 'issuetype', 'project'
      ]);
      
      if (!ticketResponse.success) {
        return {
          success: false,
          error: `Failed to get ticket ${ticketId}: ${ticketResponse.error}`
        };
      }
      
      const ticket = ticketResponse.data;
      
      // Format the comment based on type and priority
      const formattedComment = formatComment(message, commentType, priority, mentions);
      
      // Add the comment
      const commentResponse = await workflowService.addComment(ticketId, formattedComment);
      
      if (!commentResponse.success) {
        return {
          success: false,
          error: `Failed to add comment to ${ticketId}: ${commentResponse.error}`
        };
      }
      
      // Return raw comment data for LLM analysis
      return {
        success: true,
        data: {
          ticket: {
            ...ticket,
            url: getJiraTicketUrl(ticket.key),
            metadata: {
              ticketType: determineTicketType(ticket),
              currentStatus: ticket.fields.status?.name,
              assignee: ticket.fields.assignee?.displayName || 'Unassigned'
            }
          },
          comment: {
            original: message,
            formatted: formattedComment,
            type: commentType,
            priority: priority,
            mentions: mentions,
            addedAt: new Date().toISOString()
          },
          commentResponse: commentResponse.data || null,
          metadata: {
            requestedAt: new Date().toISOString(),
            ticketId: ticketId,
            commentLength: message.length,
            hasMentions: mentions.length > 0,
            isHighPriority: priority === 'high' || priority === 'urgent'
          }
        }
      };
    } catch (error) {
      console.error('Error adding task comment:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

// Helper functions
function formatComment(message, commentType, priority, mentions = []) {
  let formattedComment = '';
  
  // Add priority indicator
  if (priority === 'high' || priority === 'urgent') {
    formattedComment += `*${priority.toUpperCase()} PRIORITY* \n\n`;
  }
  
  // Add comment type header
  const typeHeaders = {
    progress: '📈 Progress Update',
    issue: '⚠️ Issue Report',
    question: '❓ Question',
    update: '📄 Status Update',
    general: '💬 Comment'
  };
  
  const header = typeHeaders[commentType] || typeHeaders.general;
  formattedComment += `${header}\n\n`;
  
  // Add mentions at the start if provided
  if (mentions.length > 0) {
    const mentionText = mentions.map(userId => `[~${userId}]`).join(' ');
    formattedComment += `${mentionText}\n\n`;
  }
  
  // Add the main message
  formattedComment += message;
  
  // Add timestamp
  formattedComment += `\n\n---\n_Added: ${new Date().toISOString()}_`;
  
  return formattedComment;
}

function determineTicketType(ticket) {
  const issueType = ticket.fields.issuetype?.name?.toLowerCase() || '';
  const project = ticket.fields.project?.key || '';
  
  if (project.startsWith('CPPF')) {
    return 'CPPF';
  } else if (project.startsWith('CRE')) {
    if (issueType.includes('story')) {
      return 'CRE_STORY';
    } else if (issueType.includes('task')) {
      return 'CRE_TASK';
    }
    return 'CRE';
  }
  
  return 'OTHER';
}

export default [addTaskComment]; 