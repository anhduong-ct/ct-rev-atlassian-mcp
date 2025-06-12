/**
 * Test utility for extracting text from Atlassian Document Format (ADF)
 * Used to verify our improved _extractJiraText function works correctly
 */

// Import the WorkflowService class to test text extraction
const WorkflowService = require('../services/workflow');

// Create a sample ADF document structure similar to what we're seeing in logs
const sampleADF = {
  type: 'doc',
  version: 1,
  content: [
    { 
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Sample Heading' }] 
    },
    { 
      type: 'paragraph', 
      content: [{ type: 'text', text: 'This is a sample paragraph.' }] 
    },
    { 
      type: 'bulletList', 
      content: [
        { 
          type: 'listItem', 
          content: [
            { 
              type: 'paragraph', 
              content: [{ type: 'text', text: 'Bullet point 1' }] 
            }
          ] 
        },
        { 
          type: 'listItem', 
          content: [
            { 
              type: 'paragraph', 
              content: [{ type: 'text', text: 'Bullet point 2' }] 
            }
          ] 
        }
      ] 
    },
    { 
      type: 'heading', 
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Another Heading' }] 
    },
    { 
      type: 'paragraph', 
      content: [
        { type: 'text', text: 'Text with a ' },
        { 
          type: 'link',
          attrs: { href: 'https://confluence.example.com/pages/12345' },
          content: [{ type: 'text', text: 'Confluence link' }] 
        }
      ] 
    },
    {
      type: 'mediaSingle',
      attrs: { layout: 'center' },
      content: [
        {
          type: 'media',
          attrs: { 
            id: 'abc123',
            type: 'file',
            collection: 'jira-content'
          }
        }
      ]
    }
  ]
};

// Create an instance of WorkflowService to test the _extractJiraText method
const workflowService = new WorkflowService();

// Test the extraction
const extractedText = workflowService._extractJiraText(sampleADF);
console.log('Extracted text from ADF:');
console.log(extractedText);

// Test Confluence page ID extraction
const extractedIds = workflowService._extractConfluencePageIds(sampleADF);
console.log('Extracted Confluence page IDs:');
console.log(extractedIds);

// Test with simple text that contains page IDs
const simpleTextWithIds = 'Check this page https://confluence.example.com/pages/54321 and also this one https://confluence.example.com?pageId=98765';
const extractedIdsFromText = workflowService._extractConfluencePageIds(simpleTextWithIds);
console.log('Extracted Confluence page IDs from text:');
console.log(extractedIdsFromText);
