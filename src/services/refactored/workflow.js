import jiraService from '../jira.js';
import confluenceService from '../confluence.js';
import { config, getCurrentSprint } from '../../config.js';
import { detectPlatforms, extractRequirements, estimateComplexity } from '../../utils/parser.js';
import { calculatePriority } from '../../utils/priority.js';
import { extractFigmaLinks } from '../../utils/urls.js';

class WorkflowService {
  // Keep existing methods
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
  
  /**
   * Search for issues in Jira using JQL
   * @param {string} jql - JQL query
   * @param {Array<string>} fields - Fields to retrieve
   * @param {number} startAt - Starting index
   * @param {number} maxResults - Maximum results to return
   * @returns {Promise<object>} - Search response
   */
  async searchIssues(jql, fields = ['summary', 'description', 'status', 'assignee', 'priority', 'issuelinks'], startAt = 0, maxResults = 50) {
    return await jiraService.searchIssues(jql, fields, startAt, maxResults);
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
  
  // Add new methods for refactored tools
  
  /**
   * Get sprint assignments with flexible filtering
   * @param {string} jql - The JQL query to execute
   * @param {array} fields - Fields to retrieve
   */
  async getSprintAssignments(jql, fields = ['summary', 'description', 'status', 'assignee', 'priority', 'issuelinks', 'labels', 'components']) {
    return await jiraService.searchIssues(jql, fields);
  }
  
  /**
   * Get full ticket hierarchy for any ticket (CRE task, CRE story, or CPPF)
   * @param {string} ticketId - The ticket ID to start from
   * @param {string} direction - The direction to traverse ('up', 'down', 'both')
   * @param {boolean} includeDocuments - Whether to include linked documents
   */
  async getFullHierarchy(ticketId, direction = 'both', includeDocuments = true) {
    try {
      // First get the details of the starting ticket
      const ticketResponse = await jiraService.getIssue(ticketId);
      if (!ticketResponse.success) {
        return ticketResponse;
      }
      
      const ticket = ticketResponse.data;
      const isCPPF = ticket.key.startsWith(config.jira.projects.cppf);
      const isCRE = ticket.key.startsWith(config.jira.projects.cre);
      
      if (!isCPPF && !isCRE) {
        return {
          success: false,
          error: `Invalid ticket type: ${ticket.key}. Expected CPPF or CRE ticket.`
        };
      }
      
      const hierarchy = {
        current: {
          key: ticket.key,
          summary: ticket.fields.summary,
          issueType: ticket.fields.issuetype?.name || 'Unknown',
          status: ticket.fields.status?.name || 'Unknown'
        }
      };
      
      let cppf = null;
      let creStory = null;
      let creTasks = [];
      
      // If it's a CPPF ticket
      if (isCPPF) {
        cppf = ticket;
        
        // Find linked CRE stories (if direction is 'down' or 'both')
        if (direction === 'down' || direction === 'both') {
          const linkedIssues = await this.getLinkedIssues(ticket.key, 'outward');
          const creStories = linkedIssues.filter(i => 
            i.key.startsWith(config.jira.projects.cre) && 
            i.fields?.issuetype?.name?.toLowerCase()?.includes('story')
          );
          
          // Find tasks for each CRE story
          for (const story of creStories) {
            const taskResponse = await this.getLinkedIssues(story.key, 'outward');
            const tasks = taskResponse.filter(i => 
              i.key.startsWith(config.jira.projects.cre) && 
              i.fields?.issuetype?.name?.toLowerCase()?.includes('task')
            );
            
            creTasks.push(...tasks);
          }
          
          // Update hierarchy
          hierarchy.creStories = creStories.map(s => ({
            key: s.key,
            summary: s.fields.summary,
            status: s.fields.status?.name || 'Unknown',
            assignee: s.fields.assignee ? s.fields.assignee.displayName : 'Unassigned'
          }));
          
          hierarchy.creTasks = creTasks.map(t => ({
            key: t.key,
            summary: t.fields.summary,
            status: t.fields.status?.name || 'Unknown',
            assignee: t.fields.assignee ? t.fields.assignee.displayName : 'Unassigned',
            parentStory: this.getParentKey(t)
          }));
        }
      }
      // If it's a CRE task
      else if (isCRE && ticket.fields.issuetype?.name?.toLowerCase()?.includes('task')) {
        const task = ticket;
        
        // Find parent CRE story (if direction is 'up' or 'both')
        if (direction === 'up' || direction === 'both') {
          const parentStoryKey = this.getParentKey(task);
          
          if (parentStoryKey) {
            const storyResponse = await jiraService.getIssue(parentStoryKey);
            if (storyResponse.success) {
              creStory = storyResponse.data;
              
              // Find linked CPPF (if it exists)
              const cppfIssues = await this.getLinkedIssues(creStory.key, 'inward');
              const cppfTicket = cppfIssues.find(i => i.key.startsWith(config.jira.projects.cppf));
              
              if (cppfTicket) {
                cppf = cppfTicket;
              }
            }
          }
        }
        
        // Find sibling tasks (if direction is 'down' or 'both')
        if (direction === 'down' || direction === 'both') {
          const parentStoryKey = this.getParentKey(task);
          
          if (parentStoryKey) {
            const taskResponse = await this.getLinkedIssues(parentStoryKey, 'outward');
            creTasks = taskResponse.filter(i => 
              i.key.startsWith(config.jira.projects.cre) && 
              i.fields?.issuetype?.name?.toLowerCase()?.includes('task')
            );
          }
        }
        
        // Update hierarchy
        if (creStory) {
          hierarchy.parentStory = {
            key: creStory.key,
            summary: creStory.fields.summary,
            status: creStory.fields.status?.name || 'Unknown',
            assignee: creStory.fields.assignee ? creStory.fields.assignee.displayName : 'Unassigned'
          };
        }
        
        if (cppf) {
          hierarchy.cppf = {
            key: cppf.key,
            summary: cppf.fields.summary,
            status: cppf.fields.status?.name || 'Unknown'
          };
        }
        
        if (creTasks && creTasks.length > 0) {
          hierarchy.siblingTasks = creTasks.filter(t => t.key !== task.key).map(t => ({
            key: t.key,
            summary: t.fields.summary,
            status: t.fields.status?.name || 'Unknown',
            assignee: t.fields.assignee ? t.fields.assignee.displayName : 'Unassigned'
          }));
        }
      }
      // If it's a CRE story
      else if (isCRE) {
        const story = ticket;
        creStory = story;
        
        // Find linked CPPF (if direction is 'up' or 'both')
        if (direction === 'up' || direction === 'both') {
          const cppfIssues = await this.getLinkedIssues(story.key, 'inward');
          const cppfTicket = cppfIssues.find(i => i.key.startsWith(config.jira.projects.cppf));
          
          if (cppfTicket) {
            cppf = cppfTicket;
          }
        }
        
        // Find child tasks (if direction is 'down' or 'both')
        if (direction === 'down' || direction === 'both') {
          const taskResponse = await this.getLinkedIssues(story.key, 'outward');
          creTasks = taskResponse.filter(i => 
            i.key.startsWith(config.jira.projects.cre) && 
            i.fields?.issuetype?.name?.toLowerCase()?.includes('task')
          );
        }
        
        // Update hierarchy
        if (cppf) {
          hierarchy.cppf = {
            key: cppf.key,
            summary: cppf.fields.summary,
            status: cppf.fields.status?.name || 'Unknown'
          };
        }
        
        if (creTasks && creTasks.length > 0) {
          hierarchy.tasks = creTasks.map(t => ({
            key: t.key,
            summary: t.fields.summary,
            status: t.fields.status?.name || 'Unknown',
            assignee: t.fields.assignee ? t.fields.assignee.displayName : 'Unassigned'
          }));
        }
      }
      
      // Get linked documents if requested
      let documents = [];
      if (includeDocuments && cppf) {
        const docsResponse = await this.getCPPFConfluenceDocs(cppf.key);
        if (docsResponse.success) {
          documents = docsResponse.data.docs;
        }
      }
      
      return {
        success: true,
        data: {
          startingTicket: {
            summary: ticket.fields.summary,
            issueType: ticket.fields.issuetype?.name || 'Unknown',
            status: ticket.fields.status?.name || 'Unknown',
            assignee: ticket.fields.assignee ? ticket.fields.assignee.displayName : 'Unassigned'
          },
          hierarchy,
          cppf: cppf,
          story: creStory,
          tasks: creTasks,
          documents: includeDocuments ? documents : undefined
        }
      };
    } catch (error) {
      console.error('Error getting ticket hierarchy:', error.message);
      return { success: false, error: error.message };
    }
  }
  
  // Helper methods
  
  /**
   * Get parent key from issue links (for subtasks)
   * @param {object} issue - Jira issue object
   * @returns {string|null} - Parent key or null
   */
  getParentKey(issue) {
    if (issue.fields?.parent) {
      return issue.fields.parent.key;
    }
    
    // Or check issue links for a parent relationship
    if (issue.fields?.issuelinks) {
      for (const link of issue.fields.issuelinks) {
        if (link.type.name === 'Parent' && link.inwardIssue) {
          return link.inwardIssue.key;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Get linked issues in the specified direction
   * @param {string} issueKey - The issue key
   * @param {string} direction - 'inward' or 'outward'
   * @returns {array} - Array of linked issues
   */
  async getLinkedIssues(issueKey, direction = 'both') {
    try {
      const response = await jiraService.getIssue(issueKey, ['issuelinks']);
      
      if (!response.success) {
        return [];
      }
      
      const issue = response.data;
      const linkedIssues = [];
      
      if (!issue.fields?.issuelinks) {
        return [];
      }
      
      // Collect issue keys to fetch
      const keysToFetch = [];
      
      for (const link of issue.fields.issuelinks) {
        if (direction === 'inward' || direction === 'both') {
          if (link.inwardIssue) {
            keysToFetch.push(link.inwardIssue.key);
          }
        }
        
        if (direction === 'outward' || direction === 'both') {
          if (link.outwardIssue) {
            keysToFetch.push(link.outwardIssue.key);
          }
        }
      }
      
      // Fetch details for all linked issues at once if possible
      if (keysToFetch.length > 0) {
        const jql = `key in (${keysToFetch.join(',')})`;
        const linkedResponse = await jiraService.searchIssues(jql);
        
        if (linkedResponse.success && linkedResponse.data.issues) {
          return linkedResponse.data.issues;
        }
      }
      
      return [];
    } catch (error) {
      console.error('Error getting linked issues:', error.message);
      return [];
    }
  }
  
  /**
   * Get Confluence docs related to a CPPF ticket
   * @param {string} cppfId - CPPF ticket ID
   * @returns {Promise<object>} - Response with docs and figma links
   */
  async getCPPFConfluenceDocs(cppfId) {
    try {
      // First get the CPPF issue to check for Confluence links
      const cppfResponse = await jiraService.getIssue(cppfId);
      if (!cppfResponse.success) {
        return cppfResponse;
      }
      
      // Handle potential null or non-string values in the response
      const description = typeof cppfResponse.data.fields.description === 'string' 
        ? cppfResponse.data.fields.description 
        : '';
      const summary = typeof cppfResponse.data.fields.summary === 'string'
        ? cppfResponse.data.fields.summary
        : '';
      
      // Extract Confluence page IDs from description (looking for confluence links)
      const confluencePageIds = this._extractConfluencePageIds(description);
      
      // Extract Figma links from CPPF ticket description and summary
      let figmaLinks = [];
      figmaLinks.push(...extractFigmaLinks(description));
      figmaLinks.push(...extractFigmaLinks(summary));
      
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
  
  /**
   * Extract Confluence page IDs from text
   * @param {string|object} text - Text to extract page IDs from, handles Jira document objects
   * @returns {Array<string>} - Array of page IDs
   * @private
   */
  _extractConfluencePageIds(text) {
    const pageIds = [];
    
    // Check if text is a string before proceeding
    if (typeof text !== 'string') {
      // If it's an object, it might be a Jira document object with content property
      if (text && typeof text === 'object' && typeof text.content === 'string') {
        text = text.content;
      } else {
        // Silently return empty array instead of logging a warning
        return pageIds;
      }
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
}

export default new WorkflowService();
