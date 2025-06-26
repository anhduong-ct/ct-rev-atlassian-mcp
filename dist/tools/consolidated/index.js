/**
 * Consolidated MCP Tools - Main Export
 * 6 Core Tools following enhancement prompt plan
 * LLM-First Approach: Raw data responses for better analysis
 */

// Import all consolidated tools
import sprintInfoTools from './sprint-info.js';
import sprintPlanningTools from './sprint-planning.js';
import ticketInfoTools from './ticket-info.js';
import createTaskTools from './create-task.js';
import updateTaskStatusTools from './update-task-status.js';
import addTaskCommentTools from './add-task-comment.js';

// Combine all tools into single export
const consolidatedTools = [
  ...sprintInfoTools,      // get_sprint_info
  ...sprintPlanningTools,  // get_sprint_planning  
  ...ticketInfoTools,      // get_ticket_info
  ...createTaskTools,      // create_task
  ...updateTaskStatusTools, // update_task_status
  ...addTaskCommentTools   // add_task_comment
];

// Tool summary for debugging
console.error(`Consolidated Tools Summary:
✅ Sprint Info: ${sprintInfoTools.length} tool(s)
✅ Sprint Planning: ${sprintPlanningTools.length} tool(s)
✅ Ticket Info: ${ticketInfoTools.length} tool(s)
✅ Create Task: ${createTaskTools.length} tool(s)
✅ Update Status: ${updateTaskStatusTools.length} tool(s)
✅ Add Comment: ${addTaskCommentTools.length} tool(s)
Total: ${consolidatedTools.length} consolidated tools
`);

export default consolidatedTools; 