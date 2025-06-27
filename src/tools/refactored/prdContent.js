import confluenceService from '../../services/confluence.js';
import workflowService from '../../services/refactored/workflow.js';
import { config } from '../../config.js';
import { getConfluenceWebUiUrl } from '../../utils/urls.js';

/**
 * Extract Confluence page IDs from ADF (Atlassian Document Format) content
 * @param {Object} adf - ADF object from Jira description
 * @returns {Array<string>} - Array of page IDs
 */
function extractConfluencePageIdsFromADF(adf) {
  const pageIds = [];
  
  if (!adf || typeof adf !== 'object') {
    return pageIds;
  }
  
  // Recursive function to traverse ADF structure
  function traverse(node) {
    if (!node || typeof node !== 'object') return;
    
    // Check for inline cards with Confluence URLs
    if (node.type === 'inlineCard' && node.attrs && node.attrs.url) {
      const url = node.attrs.url;
      const pageIdMatch = url.match(/\/pages\/(\d+)|pageId=(\d+)/);
      if (pageIdMatch) {
        const pageId = pageIdMatch[1] || pageIdMatch[2];
        if (pageId && !pageIds.includes(pageId)) {
          pageIds.push(pageId);
        }
      }
    }
    
    // Check for regular links
    if (node.type === 'link' && node.attrs && node.attrs.href) {
      const url = node.attrs.href;
      const pageIdMatch = url.match(/\/pages\/(\d+)|pageId=(\d+)/);
      if (pageIdMatch) {
        const pageId = pageIdMatch[1] || pageIdMatch[2];
        if (pageId && !pageIds.includes(pageId)) {
          pageIds.push(pageId);
        }
      }
    }
    
    // Recursively traverse content array
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        traverse(child);
      }
    }
  }
  
  traverse(adf);
  return pageIds;
}

/**
 * Extract text content from ADF for display purposes
 * @param {Object} adf - ADF object
 * @returns {string} - Extracted text
 */
function extractTextFromADF(adf) {
  if (!adf || typeof adf !== 'object') {
    return '';
  }
  
  let text = '';
  
  // Handle text nodes
  if (adf.type === 'text' && adf.text) {
    return adf.text;
  }
  
  // Handle inline cards
  if (adf.type === 'inlineCard' && adf.attrs && adf.attrs.url) {
    return `[Confluence Link: ${adf.attrs.url}]`;
  }
  
  // Handle content arrays
  if (adf.content && Array.isArray(adf.content)) {
    for (const item of adf.content) {
      text += extractTextFromADF(item) + ' ';
    }
  }
  
  return text.trim();
}

/**
 * Get PRD content from CPPF tickets - RAW CONTENT FOR LLM ANALYSIS
 * Returns raw PRD content for MCP clients to analyze directly, similar to get_sprint_planning
 */
const getPRDContent = {
  name: 'get_prd_content',
  description: 'Get raw PRD (Product Requirements Document) content from CPPF tickets for LLM analysis. Returns full raw content from linked Confluence documents for MCP clients to analyze directly.',
  inputSchema: {
    type: 'object',
    properties: {
      cppf_id: {
        type: 'string',
        description: 'CPPF ticket ID (e.g. CPPF-1234)'
      },
      include_ticket_description: {
        type: 'boolean',
        description: 'Whether to include the CPPF ticket description in the content',
        default: true
      },
      document_filter: {
        type: 'string',
        description: 'Optional filter to search for specific document titles (e.g., "PRD", "Requirements", "Design")'
      }
    },
    required: ['cppf_id']
  },
  handler: async ({ 
    cppf_id, 
    include_ticket_description = true, 
    document_filter = null 
  }) => {
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
      
      // Get CPPF details first - this gets some linked docs but may miss ADF inline cards
      const cppfResponse = await workflowService.getCPPFDetails(cppf_id);
      if (!cppfResponse.success) {
        return cppfResponse;
      }

      const cppf = cppfResponse.data.cppf;
      let confluenceDocs = cppfResponse.data.confluenceDocs || [];
      
      // ENHANCED: Extract page IDs directly from CPPF description ADF
      const descriptionPageIds = extractConfluencePageIdsFromADF(cppf.fields.description);
      
      // Fetch additional documents from ADF inline cards that may have been missed
      for (const pageId of descriptionPageIds) {
        // Check if we already have this document
        const alreadyExists = confluenceDocs.some(doc => doc.id === pageId);
        if (!alreadyExists) {
          try {
            const pageResponse = await confluenceService.getPage(pageId);
            if (pageResponse.success) {
              confluenceDocs.push(pageResponse.data);
            }
          } catch (error) {
            console.warn(`Failed to fetch Confluence page ${pageId}:`, error.message);
          }
        }
      }
      
      // Filter documents if requested
      let filteredDocs = confluenceDocs;
      if (document_filter) {
        filteredDocs = confluenceDocs.filter(doc => 
          doc.title.toLowerCase().includes(document_filter.toLowerCase())
        );
      }
      
      // Build raw content for analysis
      let rawContent = '';
      let documentInfo = [];
      
      // Include CPPF ticket description if requested
      if (include_ticket_description && cppf.fields.description) {
        const ticketDescription = extractTextFromADF(cppf.fields.description);
        
        rawContent += `=== CPPF TICKET DESCRIPTION ===\n`;
        rawContent += `Title: ${cppf.fields.summary}\n`;
        rawContent += `Description:\n${ticketDescription}\n\n`;
      }
      
      // Add Confluence document content
      for (const doc of filteredDocs) {
        if (doc.body?.storage?.value) {
          rawContent += `=== CONFLUENCE DOCUMENT: ${doc.title} ===\n`;
          rawContent += `Document ID: ${doc.id}\n`;
          rawContent += `Space: ${doc.space?.name || 'Unknown'}\n`;
          rawContent += `Last Modified: ${doc.version?.when || 'Unknown'}\n`;
          rawContent += `Modified By: ${doc.version?.by?.displayName || 'Unknown'}\n`;
          rawContent += `Content:\n${doc.body.storage.value}\n\n`;
          
          documentInfo.push({
            id: doc.id,
            title: doc.title,
            url: getConfluenceWebUiUrl(doc.id, doc._links?.webui),
            lastModified: doc.version?.when || 'Unknown',
            lastModifiedBy: doc.version?.by?.displayName || 'Unknown',
            space: doc.space?.name || 'Unknown',
            contentLength: doc.body.storage.value.length
          });
        }
      }
      
      if (!rawContent.trim()) {
        return {
          success: false,
          error: 'No PRD content found. The CPPF ticket may not have linked Confluence documents, or they may not contain readable content.'
        };
      }
      
      return {
        success: true,
        data: {
          // PRIMARY: Raw content for MCP client analysis
          rawContent: rawContent,
          
          // INSTRUCTION FOR MCP CLIENT
          instruction: "This is the raw PRD content from the CPPF ticket and its linked Confluence documents. Please analyze this content directly to understand the product requirements, user stories, acceptance criteria, and implementation details. The content may be in HTML/ADF format with structured sections.",
          
          // METADATA
          cppf: {
            key: cppf.key,
            title: cppf.fields.summary,
            status: cppf.fields.status?.name || 'Unknown',
            priority: cppf.fields.priority?.name || 'No Priority',
            assignee: cppf.fields.assignee ? cppf.fields.assignee.displayName : 'Unassigned',
            url: `${config.jira.host}/browse/${cppf.key}`
          },
          
          // DOCUMENT METADATA
          documents: documentInfo,
          
          // DEBUG INFO
          debug: {
            extractedPageIds: descriptionPageIds,
            originalDocCount: cppfResponse.data.confluenceDocs?.length || 0,
            finalDocCount: filteredDocs.length,
            hasDescription: !!cppf.fields.description
          },
          
          // SIMPLE STATS
          totalDocuments: filteredDocs.length,
          contentLength: rawContent.length,
          hasTicketDescription: include_ticket_description && !!cppf.fields.description,
          
          // FILTER INFO
          ...(document_filter && {
            appliedFilter: document_filter,
            originalDocumentCount: confluenceDocs.length
          })
        }
      };
    } catch (error) {
      console.error('Error getting PRD content:', error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Enhanced version that can also fetch PRD content by searching Confluence spaces
 */
const searchPRDContent = {
  name: 'search_prd_content',
  description: 'Search for PRD content across Confluence spaces by keywords or CPPF references',
  inputSchema: {
    type: 'object',
    properties: {
      search_terms: {
        type: 'array',
        items: { type: 'string' },
        description: 'Search terms to find PRD documents (e.g., ["CPPF-1234", "promotion", "voucher"])'
      },
      space_key: {
        type: 'string',
        description: 'Specific Confluence space to search in (optional)',
        default: null
      },
      limit: {
        type: 'number',
        description: 'Maximum number of documents to return',
        default: 10
      }
    },
    required: ['search_terms']
  },
  handler: async ({ search_terms, space_key = null, limit = 10 }) => {
    try {
      if (!search_terms || search_terms.length === 0) {
        return {
          success: false,
          error: 'Search terms are required'
        };
      }
      
      // Build search query
      const searchQuery = search_terms.map(term => {
        // If term contains spaces, wrap it properly
        if (term.includes(' ')) {
          return `(title ~ "\\"${term}\\"" OR text ~ "\\"${term}\\"")`; 
        }
        return `(title ~ "${term}" OR text ~ "${term}")`;
      }).join(' AND ');
      
      // Search Confluence
      let searchResult;
      if (space_key) {
        searchResult = await confluenceService.searchContent(searchQuery, space_key, 'page', limit);
      } else {
        searchResult = await confluenceService.searchAllSpaces(searchQuery, limit);
      }
      
      if (!searchResult.success) {
        return {
          success: false,
          error: `Failed to search Confluence: ${searchResult.error}`
        };
      }
      
      const results = searchResult.data.results || [];
      
      if (results.length === 0) {
        return {
          success: false,
          error: 'No PRD documents found matching the search criteria'
        };
      }
      
      // Build raw content from search results
      let rawContent = '';
      let documentInfo = [];
      
      for (const doc of results) {
        // Get full document content
        const fullDoc = await confluenceService.getPage(doc.id);
        if (fullDoc.success && fullDoc.data.body?.storage?.value) {
          rawContent += `=== CONFLUENCE DOCUMENT: ${fullDoc.data.title} ===\n`;
          rawContent += `Document ID: ${fullDoc.data.id}\n`;
          rawContent += `Space: ${fullDoc.data.space?.name || 'Unknown'}\n`;
          rawContent += `Last Modified: ${fullDoc.data.version?.when || 'Unknown'}\n`;
          rawContent += `Modified By: ${fullDoc.data.version?.by?.displayName || 'Unknown'}\n`;
          rawContent += `Content:\n${fullDoc.data.body.storage.value}\n\n`;
          
          documentInfo.push({
            id: fullDoc.data.id,
            title: fullDoc.data.title,
            url: getConfluenceWebUiUrl(fullDoc.data.id, fullDoc.data._links?.webui),
            lastModified: fullDoc.data.version?.when || 'Unknown',
            lastModifiedBy: fullDoc.data.version?.by?.displayName || 'Unknown',
            space: fullDoc.data.space?.name || 'Unknown',
            contentLength: fullDoc.data.body.storage.value.length
          });
        }
      }
      
      return {
        success: true,
        data: {
          // PRIMARY: Raw content for MCP client analysis
          rawContent: rawContent,
          
          // INSTRUCTION FOR MCP CLIENT
          instruction: "This is raw PRD content found by searching Confluence spaces. Please analyze this content directly to understand the product requirements, user stories, acceptance criteria, and implementation details.",
          
          // METADATA
          documents: documentInfo,
          searchInfo: {
            terms: search_terms,
            spaceKey: space_key || 'All spaces',
            resultsFound: results.length,
            totalContentLength: rawContent.length
          }
        }
      };
    } catch (error) {
      console.error('Error searching PRD content:', error.message);
      return { success: false, error: error.message };
    }
  }
};

export default [getPRDContent, searchPRDContent];
