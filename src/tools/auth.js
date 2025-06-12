// Authentication tools for MCP host
// Allows users to set credentials at runtime

import { z } from 'zod';
import credentialsManager from '../services/credentialsManager.js';

// Tool to set credentials
const setCredentialsTool = {
  name: 'set_credentials',
  description: 'Set Atlassian credentials for API access. These are stored temporarily and will be used for all subsequent API calls.',
  inputSchema: {
    jira_email: z.string().email().optional().describe('Jira email address'),
    jira_api_token: z.string().optional().describe('Jira API token'),
    user_account_id: z.string().optional().describe('Atlassian user account ID')
  },
  handler: async ({ jira_email, jira_api_token, user_account_id }) => {
    try {
      // Format credentials
      const credentials = {
        jira: {
          email: jira_email,
          apiToken: jira_api_token
        },
        user: {
          accountId: user_account_id
        }
      };
      
      // Update the credentials
      credentialsManager.setCredentials(credentials);
      
      // Get masked values for confirmation
      const maskedCreds = credentialsManager.getMaskedCredentials();
      
      // Check if required credentials are now set
      const hasRequired = credentialsManager.hasRequiredCredentials();
      
      return {
        success: true,
        message: 'Credentials updated successfully.',
        credentials: maskedCreds,
        hasRequiredCredentials: hasRequired,
        missingCredentials: hasRequired ? [] : getMissingCredentials(maskedCreds)
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to set credentials: ${error.message}`
      };
    }
  }
};

// Tool to check the current credential status
const checkCredentialsTool = {
  name: 'check_credentials',
  description: 'Check the status of your Atlassian credentials.',
  inputSchema: {},
  handler: async () => {
    try {
      const maskedCreds = credentialsManager.getMaskedCredentials();
      const hasRequired = credentialsManager.hasRequiredCredentials();
      
      return {
        success: true,
        credentials: maskedCreds,
        hasRequiredCredentials: hasRequired,
        missingCredentials: hasRequired ? [] : getMissingCredentials(maskedCreds)
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to check credentials: ${error.message}`
      };
    }
  }
};

// Tool to clear credentials
const clearCredentialsTool = {
  name: 'clear_credentials',
  description: 'Clear all stored Atlassian credentials.',
  inputSchema: {},
  handler: async () => {
    try {
      credentialsManager.clearCredentials();
      
      return {
        success: true,
        message: 'All credentials have been cleared.'
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to clear credentials: ${error.message}`
      };
    }
  }
};

// Helper function to identify missing credentials
function getMissingCredentials(creds) {
  const missing = [];
  
  if (!creds?.jira?.email) missing.push('jira_email');
  if (!creds?.jira?.apiToken) missing.push('jira_api_token');
  if (!creds?.user?.accountId) missing.push('user_account_id');
  
  return missing;
}

const authTools = [
  setCredentialsTool,
  checkCredentialsTool,
  clearCredentialsTool
];

export default authTools;
