import jiraService from '../services/jira.js';
import workflowService from '../services/workflow.js';
import { config } from '../config.js';
import { getJiraTicketUrl } from '../utils/urls.js';

/**
 * Unified ticket management tool for all ticket operations
 */
const ticketManagement = {
  name: 'ticket_management',
  description: 'Unified tool for managing tickets - update fields, change assignments, list tickets, bulk operations',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'update_fields',
          'update_assignment', 
          'list_tickets',
          'bulk_move_sprint',
          'find_missing_fields'
        ],
        description: 'Action to perform: update_fields (DoS, TDoS, story points), update_assignment (status + assignee), list_tickets (filter tickets), bulk_move_sprint (move tickets between sprints), find_missing_fields (find tickets missing DoS/TDoS/story points)'
      },
      ticket_id: {
        type: 'string',
        description: 'Ticket ID for single ticket operations (e.g. CRE-1234)'
      },
      ticket_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of ticket IDs for bulk operations'
      },
      // Field update parameters
      date_on_staging: {
        type: 'string',
        description: 'Date on Staging (DoS) in YYYY-MM-DD format'
      },
      test_done_staging: {
        type: 'string',
        description: 'Test Done on STG (TDoS) in YYYY-MM-DD format'
      },
      story_points: {
        type: 'number',
        description: 'Story points (1-8)'
      },
      // Assignment parameters
      status: {
        type: 'string',
        description: 'New status (e.g. "On staging", "In Progress", "Done", "For Development", "Developing", "Waiting for Review", "Ready to UAT", "On UAT", "Ready to Prod", "On Production", "Closed")'
      },
      assignee: {
        type: 'string',
        description: 'Assignee name or email for assignment changes'
      },
      // Filtering parameters
      filter_status: {
        type: 'string',
        description: 'Filter tickets by status'
      },
      filter_assignee: {
        type: 'string',
        description: 'Filter by assignee ("currentUser" for your tickets)'
      },
      sort_by: {
        type: 'string',
        enum: ['date_on_staging', 'updated', 'created', 'priority'],
        description: 'Sort tickets by field'
      },
      // Sprint operations
      target_sprint: {
        type: 'string',
        description: 'Target sprint name for bulk move operations'
      },
      source_sprint: {
        type: 'string',
        description: 'Source sprint name for bulk move operations'
      }
    },
    required: ['action']
  },
  handler: async (params) => {
    const { action } = params;

    try {
      switch (action) {
        case 'update_fields':
          return await updateTicketFields(params);
        case 'update_assignment':
          return await updateTicketAssignment(params);
        case 'list_tickets':
          return await listTicketsWithFilters(params);
        case 'bulk_move_sprint':
          return await bulkMoveToSprint(params);
        case 'find_missing_fields':
          return await findTicketsMissingFields(params);
        default:
          return {
            success: false,
            error: `Unknown action: ${action}`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};

/**
 * Update ticket custom fields (DoS, TDoS, Story Points)
 */
async function updateTicketFields(params) {
  const { ticket_id, date_on_staging, test_done_staging, story_points } = params;
  
  if (!ticket_id) {
    return { success: false, error: 'ticket_id is required for update_fields action' };
  }

  const updateData = { fields: {} };

  // Date on Staging (customfield_10834)
  if (date_on_staging) {
    updateData.fields.customfield_10834 = date_on_staging;
  }

  // Test Done on STG (customfield_10835)
  if (test_done_staging) {
    updateData.fields.customfield_10835 = test_done_staging;
  }

  // Story Points (customfield_10006)
  if (story_points !== undefined) {
    updateData.fields.customfield_10006 = story_points;
  }

  if (Object.keys(updateData.fields).length === 0) {
    return { success: false, error: 'No fields to update specified' };
  }

  const result = await jiraService.updateIssue(ticket_id, updateData);
  
  if (result.success) {
    return {
      success: true,
      message: `Updated ${ticket_id} fields successfully`,
      ticket_url: getJiraTicketUrl(ticket_id),
      updated_fields: updateData.fields
    };
  }

  return result;
}

/**
 * Update ticket status and assignee
 */
async function updateTicketAssignment(params) {
  const { ticket_id, status, assignee } = params;
  
  if (!ticket_id) {
    return { success: false, error: 'ticket_id is required for update_assignment action' };
  }

  const results = [];

  // Update status if provided
  if (status) {
    const statusResult = await updateTicketStatus(ticket_id, status);
    results.push({ operation: 'status_update', ...statusResult });
  }

  // Update assignee if provided
  if (assignee) {
    const assigneeResult = await updateTicketAssignee(ticket_id, assignee);
    results.push({ operation: 'assignee_update', ...assigneeResult });
  }

  if (results.length === 0) {
    return { success: false, error: 'No status or assignee specified' };
  }

  const allSuccessful = results.every(r => r.success);
  
  return {
    success: allSuccessful,
    message: `Updated ${ticket_id} assignment`,
    ticket_url: getJiraTicketUrl(ticket_id),
    results
  };
}

/**
 * Update ticket status via existing workflow service
 */
async function updateTicketStatus(ticketId, status) {
  try {
    // Use the existing updateCRETaskStatus method which handles workflow transitions intelligently
    const response = await workflowService.updateCRETaskStatus(ticketId, status);
    
    if (!response.success) {
      return response;
    }
    
    return {
      success: true,
      data: {
        taskId: ticketId,
        newStatus: status,
        transitionApplied: response.data.transitionApplied,
        message: response.data.message
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Update ticket assignee
 */
async function updateTicketAssignee(ticketId, assignee) {
  try {
    // Search for user by display name or email
    const userResponse = await jiraService.searchUsers(assignee);
    if (!userResponse.success || !userResponse.data.length) {
      return {
        success: false,
        error: `User not found: ${assignee}`
      };
    }

    const user = userResponse.data[0];
    const updateData = {
      fields: {
        assignee: {
          accountId: user.accountId
        }
      }
    };

    return await jiraService.updateIssue(ticketId, updateData);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * List tickets with advanced filtering
 */
async function listTicketsWithFilters(params) {
  const { filter_status, filter_assignee = 'currentUser', sort_by = 'updated' } = params;
  
  let jql = `project = ${config.jira.projects.cre}`;
  
  // Add assignee filter
  if (filter_assignee === 'currentUser') {
    jql += ' AND assignee = currentUser()';
  } else if (filter_assignee && filter_assignee !== 'all') {
    jql += ` AND assignee = "${filter_assignee}"`;
  }
  
  // Add status filter
  if (filter_status) {
    jql += ` AND status = "${filter_status}"`;
  }
  
  // Add sorting
  const sortField = sort_by === 'date_on_staging' ? 'cf[10834]' : sort_by;
  jql += ` ORDER BY ${sortField} DESC`;

  const fields = [
    'summary', 'status', 'assignee', 'priority', 'updated',
    'customfield_10834', // Date on Staging
    'customfield_10835', // Test Done on STG
    'customfield_10006', // Story Points
    'customfield_10831', // Engineer
    'customfield_10841', // QA
    'customfield_10004'  // Sprint
  ];

  const result = await jiraService.searchIssues(jql, fields);
  
  if (!result.success) {
    return result;
  }

  // Format response for better readability
  const formattedTickets = result.data.issues.map(ticket => ({
    key: ticket.key,
    url: getJiraTicketUrl(ticket.key),
    summary: ticket.fields.summary,
    status: ticket.fields.status?.name,
    assignee: ticket.fields.assignee?.displayName,
    engineer: ticket.fields.customfield_10831?.displayName,
    qa: ticket.fields.customfield_10841?.displayName,
    date_on_staging: ticket.fields.customfield_10834,
    test_done_staging: ticket.fields.customfield_10835,
    story_points: ticket.fields.customfield_10006,
    sprint: ticket.fields.customfield_10004?.[0]?.name,
    priority: ticket.fields.priority?.name,
    updated: ticket.fields.updated
  }));

  return {
    success: true,
    total: result.data.total,
    tickets: formattedTickets,
    jql_used: jql
  };
}

/**
 * Bulk move tickets to different sprint
 */
async function bulkMoveToSprint(params) {
  const { ticket_ids, target_sprint, source_sprint } = params;
  
  if (!ticket_ids || !ticket_ids.length) {
    return { success: false, error: 'ticket_ids array is required for bulk_move_sprint action' };
  }
  
  if (!target_sprint) {
    return { success: false, error: 'target_sprint is required for bulk_move_sprint action' };
  }

  // Find sprint by name
  const sprintResult = await findSprintByName(target_sprint);
  if (!sprintResult.success) {
    return sprintResult;
  }

  const results = [];
  
  for (const ticketId of ticket_ids) {
    try {
      const updateData = {
        fields: {
          customfield_10004: parseInt(sprintResult.data.id)
        }
      };
      
      const result = await jiraService.updateIssue(ticketId, updateData);
      results.push({
        ticket: ticketId,
        success: result.success,
        error: result.error
      });
    } catch (error) {
      results.push({
        ticket: ticketId,
        success: false,
        error: error.message
      });
    }
  }

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return {
    success: failed === 0,
    message: `Moved ${successful} tickets to sprint "${target_sprint}". ${failed} failed.`,
    results,
    summary: { successful, failed, total: ticket_ids.length }
  };
}

/**
 * Find tickets missing required fields (Stories and Tasks only, excludes Bugs)
 */
async function findTicketsMissingFields(params) {
  const { filter_assignee = 'currentUser' } = params;
  
  let jql = `project = ${config.jira.projects.cre}`;
  
  if (filter_assignee === 'currentUser') {
    jql += ' AND assignee = currentUser()';
  } else if (filter_assignee && filter_assignee !== 'all') {
    jql += ` AND assignee = "${filter_assignee}"`;
  }
  
  // Only include Stories and Tasks, exclude Bugs since they don't require DoS/TDoS/Story Points
  jql += ' AND issuetype in ("Story", "Task")';
  
  jql += ' ORDER BY updated DESC';

  const fields = [
    'summary', 'status', 'assignee', 'issuetype',
    'customfield_10834', // Date on Staging
    'customfield_10835', // Test Done on STG  
    'customfield_10006'  // Story Points
  ];

  const result = await jiraService.searchIssues(jql, fields);
  
  if (!result.success) {
    return result;
  }

  const analysis = {
    missing_dos: [],      // Missing Date on Staging
    missing_tdos: [],     // Missing Test Done on STG
    missing_story_points: [],
    missing_multiple: []
  };

  result.data.issues.forEach(ticket => {
    const missing = [];
    
    if (!ticket.fields.customfield_10834) missing.push('DoS');
    if (!ticket.fields.customfield_10835) missing.push('TDoS');
    if (!ticket.fields.customfield_10006) missing.push('Story Points');
    
    if (missing.length > 0) {
      const ticketInfo = {
        key: ticket.key,
        url: getJiraTicketUrl(ticket.key),
        summary: ticket.fields.summary,
        status: ticket.fields.status?.name,
        issue_type: ticket.fields.issuetype?.name,
        missing_fields: missing
      };
      
      if (missing.includes('DoS')) analysis.missing_dos.push(ticketInfo);
      if (missing.includes('TDoS')) analysis.missing_tdos.push(ticketInfo);
      if (missing.includes('Story Points')) analysis.missing_story_points.push(ticketInfo);
      if (missing.length > 1) analysis.missing_multiple.push(ticketInfo);
    }
  });

  return {
    success: true,
    summary: {
      total_tickets: result.data.total,
      ticket_types_included: ['Story', 'Task'],
      ticket_types_excluded: ['Bug'],
      missing_dos_count: analysis.missing_dos.length,
      missing_tdos_count: analysis.missing_tdos.length,
      missing_story_points_count: analysis.missing_story_points.length,
      missing_multiple_count: analysis.missing_multiple.length
    },
    analysis,
    jql_used: jql
  };
}

/**
 * Helper function to find sprint by name
 */
async function findSprintByName(sprintName) {
  try {
    const result = await jiraService.searchSprintsByName(sprintName);
    
    if (!result.success) {
      return result;
    }
    
    // If multiple sprints match, prioritize active ones and return the first match
    const sprints = result.data.sprints;
    
    if (sprints.length === 0) {
      return {
        success: false,
        error: `No sprints found matching name: ${sprintName}`
      };
    }
    
    // Return the first sprint (already sorted by priority: active > future > closed)
    const selectedSprint = sprints[0];
    
    return {
      success: true,
      data: {
        id: selectedSprint.id,
        name: selectedSprint.name,
        state: selectedSprint.state,
        boardName: selectedSprint.boardName,
        projectKeys: selectedSprint.projectKeys,
        alternatives: sprints.length > 1 ? sprints.slice(1).map(s => ({
          id: s.id,
          name: s.name,
          state: s.state,
          boardName: s.boardName
        })) : null
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default [ticketManagement];
