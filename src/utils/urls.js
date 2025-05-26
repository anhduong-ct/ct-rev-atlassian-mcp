import { config } from '../config.js';

/**
 * Utility functions for constructing Atlassian URLs
 */

/**
 * Get the Jira ticket URL for a given ticket key
 * @param {string} ticketKey - The Jira ticket key (e.g. "CPPF-1234")
 * @returns {string} The full URL to the Jira ticket
 */
export function getJiraTicketUrl(ticketKey) {
  if (!ticketKey) return null;
  
  // Ensure we have a clean base URL
  const baseUrl = config.jira.host.replace(/\/$/, '');
  return `${baseUrl}/browse/${ticketKey}`;
}

/**
 * Get the Confluence page URL for a given page ID
 * @param {string} pageId - The Confluence page ID
 * @returns {string} The full URL to the Confluence page
 */
export function getConfluencePageUrl(pageId) {
  if (!pageId) return null;
  
  // Ensure we have a clean base URL
  const baseUrl = config.confluence.host.replace(/\/$/, '');
  return `${baseUrl}/pages/viewpage.action?pageId=${pageId}`;
}

/**
 * Get the Confluence page URL from a webui link (if available)
 * @param {object} confluencePage - The Confluence page object from API
 * @returns {string} The full URL to the Confluence page
 */
export function getConfluenceWebUiUrl(confluencePage) {
  if (confluencePage._links && confluencePage._links.webui) {
    // The webui link is relative, so we need to add the base URL
    const baseUrl = config.confluence.host.replace(/\/$/, '');
    const webuiPath = confluencePage._links.webui.startsWith('/') 
      ? confluencePage._links.webui 
      : `/${confluencePage._links.webui}`;
    return `${baseUrl}${webuiPath}`;
  }
  
  // Fallback to constructing from page ID
  return getConfluencePageUrl(confluencePage.id);
}

/**
 * Get Jira project URL
 * @param {string} projectKey - The project key (e.g. "CPPF")
 * @returns {string} The full URL to the Jira project
 */
export function getJiraProjectUrl(projectKey) {
  if (!projectKey) return null;
  
  const baseUrl = config.jira.host.replace(/\/$/, '');
  return `${baseUrl}/projects/${projectKey}`;
}

/**
 * Get Jira board URL for a project
 * @param {string} projectKey - The project key (e.g. "CRE")
 * @returns {string} The full URL to the project's board
 */
export function getJiraBoardUrl(projectKey) {
  if (!projectKey) return null;
  
  const baseUrl = config.jira.host.replace(/\/$/, '');
  return `${baseUrl}/secure/RapidBoard.jspa?projectKey=${projectKey}`;
}

/**
 * Get Confluence space URL
 * @param {string} spaceKey - The space key
 * @returns {string} The full URL to the Confluence space
 */
export function getConfluenceSpaceUrl(spaceKey) {
  if (!spaceKey) return null;
  
  const baseUrl = config.confluence.host.replace(/\/$/, '');
  return `${baseUrl}/spaces/${spaceKey}`;
}

/**
 * Extract ticket key from various formats (e.g. URLs, text)
 * @param {string} text - Text that might contain a ticket reference
 * @returns {string|null} The extracted ticket key or null
 */
export function extractTicketKey(text) {
  if (!text) return null;
  
  // Look for patterns like PROJ-123, CRE-456, CPPF-789
  const ticketPattern = /([A-Z]+)-(\d+)/;
  const match = text.match(ticketPattern);
  
  return match ? match[0] : null;
}

/**
 * Format a response object with enhanced URL information
 * @param {object} responseData - The original response data
 * @param {object} options - Options for URL enhancement
 * @returns {object} Enhanced response with URLs
 */
export function enhanceWithUrls(responseData, options = {}) {
  const enhanced = { ...responseData };
  
  // Add URLs to the response if we can identify relevant tickets/pages
  if (enhanced.key) {
    enhanced.url = getJiraTicketUrl(enhanced.key);
  }
  
  if (enhanced.confluenceDocs && Array.isArray(enhanced.confluenceDocs)) {
    enhanced.confluenceDocs = enhanced.confluenceDocs.map(doc => ({
      ...doc,
      url: doc.url || getConfluenceWebUiUrl(doc)
    }));
  }
  
  // Add reference links section
  if (options.includeReferenceLinks !== false) {
    enhanced.referenceLinks = {
      jiraProject: enhanced.key ? getJiraProjectUrl(enhanced.key.split('-')[0]) : null,
      jiraBoard: enhanced.key ? getJiraBoardUrl(enhanced.key.split('-')[0]) : null
    };
  }
  
  return enhanced;
} 