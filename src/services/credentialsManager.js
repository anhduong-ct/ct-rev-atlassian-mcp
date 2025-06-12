// Credentials Manager service
// Handles dynamic credential management from MCP host

import NodeCache from 'node-cache';
import { config } from '../config.js';

class CredentialsManager {
  constructor() {
    // Initialize cache with standard TTL of 1 hour
    this.cache = new NodeCache({ stdTTL: 3600 });
    
    // Load initial credentials from config if available
    this.initializeFromEnv();
  }
  
  // Initialize credentials from environment if available
  initializeFromEnv() {
    const credentials = {
      jira: {
        email: config.jira.email,
        apiToken: config.jira.apiToken
      },
      user: {
        accountId: config.user.accountId
      }
    };
    
    // Only store if at least one credential is provided
    if (credentials.jira.email || credentials.jira.apiToken || credentials.user.accountId) {
      this.setCredentials(credentials);
    }
  }
  
  // Set credentials - merges with existing ones
  setCredentials(credentials) {
    // Get current credentials or empty object
    const currentCredentials = this.getCredentials() || {
      jira: { email: null, apiToken: null },
      user: { accountId: null }
    };
    
    // Update jira credentials if provided
    if (credentials.jira) {
      if (credentials.jira.email) currentCredentials.jira.email = credentials.jira.email;
      if (credentials.jira.apiToken) currentCredentials.jira.apiToken = credentials.jira.apiToken;
    }
    
    // Update user credentials if provided
    if (credentials.user) {
      if (credentials.user.accountId) currentCredentials.user.accountId = credentials.user.accountId;
    }
    
    // Store updated credentials
    this.cache.set('credentials', currentCredentials);
    
    // Update config object to use these credentials
    if (currentCredentials.jira.email) config.jira.email = currentCredentials.jira.email;
    if (currentCredentials.jira.apiToken) config.jira.apiToken = currentCredentials.jira.apiToken;
    if (currentCredentials.user.accountId) config.user.accountId = currentCredentials.user.accountId;
    
    return true;
  }
  
  // Get all current credentials
  getCredentials() {
    return this.cache.get('credentials');
  }
  
  // Check if required credentials are set
  hasRequiredCredentials() {
    const creds = this.getCredentials();
    if (!creds) return false;
    
    // Check for all required fields
    return (
      creds.jira.email && 
      creds.jira.apiToken && 
      creds.user.accountId
    );
  }
  
  // Clear all credentials (useful for logout or reset)
  clearCredentials() {
    this.cache.del('credentials');
    
    // Also reset config values
    config.jira.email = process.env.JIRA_EMAIL || null;
    config.jira.apiToken = process.env.JIRA_API_TOKEN || null;
    config.user.accountId = process.env.USER_ACCOUNT_ID || null;
    
    return true;
  }
  
  // Get masked credentials for display
  getMaskedCredentials() {
    const creds = this.getCredentials();
    if (!creds) return null;
    
    const masked = {
      jira: {
        email: creds.jira.email ? maskEmail(creds.jira.email) : null,
        apiToken: creds.jira.apiToken ? maskString(creds.jira.apiToken) : null
      },
      user: {
        accountId: creds.user.accountId ? maskString(creds.user.accountId) : null
      }
    };
    
    return masked;
  }
}

// Helper to mask email
function maskEmail(email) {
  if (!email) return '';
  const [name, domain] = email.split('@');
  if (!domain) return '***@***';
  
  const maskedName = name.length > 2 
    ? `${name.substring(0, 2)}${'*'.repeat(name.length - 2)}`
    : `${'*'.repeat(name.length)}`;
    
  const domainParts = domain.split('.');
  const maskedDomain = domainParts[0].length > 2
    ? `${domainParts[0].substring(0, 2)}${'*'.repeat(domainParts[0].length - 2)}`
    : `${'*'.repeat(domainParts[0].length)}`;
  
  return `${maskedName}@${maskedDomain}.${domainParts.slice(1).join('.')}`;
}

// Helper to mask a string
function maskString(str) {
  if (!str) return '';
  
  const visibleChars = Math.min(3, str.length);
  const maskedLength = str.length - visibleChars;
  
  return `${str.substring(0, visibleChars)}${'*'.repeat(maskedLength)}`;
}

// Create singleton instance
const credentialsManager = new CredentialsManager();

// Export singleton instance
export default credentialsManager;
