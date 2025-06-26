/**
 * Configuration Manager Service
 * Manages dynamic configuration settings and validates Atlassian credentials
 */
import NodeCache from 'node-cache';
import axios from 'axios';
import { config as globalConfig } from '../config.js';

class ConfigManager {
  constructor() {
    // Initialize cache with TTL of 1 hour
    this.configCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
    
    // Default client type mapping by user agent
    this.clientTypeDetection = {
      'Cursor': 'cursor',
      'VSCode': 'vscode',
      'Claude Desktop': 'claude',
      'Mozilla': 'browser'
    };
    
    // Special configurations by client type
    this.clientTypeConfigs = {
      'cursor': {
        pingInterval: 3000,
        protocol: 'jsonrpc',
        endpoint: '/jsonrpc'
      },
      'vscode': {
        pingInterval: 30000,
        protocol: 'sse',
        endpoint: '/mcp-events'
      },
      'claude': {
        pingInterval: 20000,
        protocol: 'jsonrpc',
        endpoint: '/jsonrpc'
      },
      'browser': {
        pingInterval: 30000,
        protocol: 'sse',
        endpoint: '/mcp-events'
      }
    };
  }

  /**
   * Detect client type from user agent string
   * @param {String} userAgent - User agent string
   * @returns {String} - Detected client type (cursor, vscode, claude, browser)
   */
  detectClientType(userAgent) {
    if (!userAgent) {
      return 'unknown';
    }
    
    userAgent = userAgent.toLowerCase();
    
    if (userAgent.includes('cursor')) {
      return 'cursor';
    } else if (userAgent.includes('vscode')) {
      return 'vscode';
    } else if (userAgent.includes('claude')) {
      return 'claude';
    } else if (userAgent.includes('mozilla') || userAgent.includes('chrome') || userAgent.includes('safari')) {
      return 'browser';
    } else {
      return 'unknown';
    }
  }
  
  /**
   * Set client type for a specific client ID
   * @param {String} clientId - Unique client identifier
   * @param {String} clientType - Client type (cursor, vscode, claude, browser)
   */
  setClientType(clientId, clientType) {
    if (clientId) {
      this.configCache.set(`${clientId}:type`, clientType);
    }
  }
  
  /**
   * Get client type for a specific client ID
   * @param {String} clientId - Unique client identifier
   * @returns {String} - Client type or 'unknown' if not set
   */
  getClientType(clientId) {
    if (clientId) {
      return this.configCache.get(`${clientId}:type`) || 'unknown';
    }
    return 'unknown';
  }
  
  /**
   * Get client-specific configuration based on client type
   * @param {String} clientId - Unique client identifier (optional)
   * @param {String} clientType - Client type (optional, will be detected from clientId if not provided)
   * @returns {Object} - Client-specific configuration
   */
  getClientSpecificConfig(clientId, clientType) {
    let type = clientType;
    
    // If clientType not provided but clientId is, try to get saved type
    if (!type && clientId) {
      type = this.getClientType(clientId);
    }
    
    // If still not determined or unknown, use default
    if (!type || type === 'unknown') {
      type = 'browser';
    }
    
    return this.clientTypeConfigs[type] || this.clientTypeConfigs['browser'];
  }

  /**
   * Set a configuration for a client
   * @param {String} clientId - Unique client identifier
   * @param {Object} configData - Configuration object
   * @returns {Object} - The updated configuration
   */
  setClientConfig(clientId, configData) {
    // Merge with default config structure
    const clientConfig = {
      jira: {
        host: configData.jira_host || 'https://company.atlassian.net',
        email: configData.jira_email || null,
        apiToken: configData.jira_api_token || null,
        projects: {
          cppf: configData.jira_cppf_project || 'CPPF',
          cre: configData.jira_cre_project || 'CRE'
        },
        customFields: {
          sprint: configData.jira_field_sprint || 'customfield_10020',
          storyPoints: configData.jira_field_story_points || 'customfield_10016'
        }
      },
      confluence: {
        host: configData.confluence_host || configData.jira_host || 'https://company.atlassian.net',
        spaces: (configData.confluence_spaces || 'PROD,ENG,DESIGN').split(','),
        sprintPlanningSpace: configData.sprint_planning_space || '~629041681a437e007044041e'
      },
      user: {
        accountId: configData.user_account_id || null,
        role: configData.user_role || 'fullstack',
        currentSprint: configData.current_sprint || null
      },
      workflow: {
        platforms: (configData.platforms || 'web,backend,app,ios').split(','),
        priorityWeights: {
          cppfPriority: parseFloat(configData.priority_weight_cppf || 0.4),
          dependencies: parseFloat(configData.priority_weight_dependencies || 0.3),
          complexity: parseFloat(configData.priority_weight_complexity || 0.2),
          deadline: parseFloat(configData.priority_weight_deadline || 0.1)
        },
        doneStatuses: ['Done', 'Closed', 'Completed', 'On Production']
      }
    };
    
    // Store in cache
    this.configCache.set(clientId, clientConfig);
    
    return clientConfig;
  }
  
  /**
   * Get a client's configuration
   * @param {String} clientId - Unique client identifier
   * @returns {Object|null} - The client's configuration or null if not found
   */
  getClientConfig(clientId) {
    return this.configCache.get(clientId) || null;
  }
  
  /**
   * Clear a client's configuration
   * @param {String} clientId - Unique client identifier
   * @returns {Boolean} - Success status
   */
  clearClientConfig(clientId) {
    return this.configCache.del(clientId);
  }
  
  /**
   * Validate the client's configuration
   * @param {String} clientId - Unique client identifier
   * @returns {Object} - Validation result
   */
  validateClientConfig(clientId) {
    const config = this.getClientConfig(clientId);
    
    if (!config) {
      return { isValid: false, errors: ['Configuration not found'] };
    }
    
    const errors = [];
    
    // Check required fields
    if (!config.jira.email) errors.push('Jira email is required');
    if (!config.jira.apiToken) errors.push('Jira API token is required');
    if (!config.user.accountId) errors.push('User account ID is required');
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Test Atlassian connection with the client's configuration
   * @param {String} clientId - Unique client identifier
   * @returns {Promise<Object>} - Connection test result
   */
  async testConnection(clientId) {
    const config = this.getClientConfig(clientId);
    
    if (!config) {
      return { success: false, error: 'Configuration not found' };
    }
    
    try {
      // Create auth header
      const auth = Buffer.from(`${config.jira.email}:${config.jira.apiToken}`).toString('base64');
      
      // Test Jira connection
      const jiraResponse = await axios.get(`${config.jira.host}/rest/api/3/myself`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      });
      
      // Test Confluence connection if host is different
      let confluenceResponse = null;
      if (config.confluence.host !== config.jira.host) {
        confluenceResponse = await axios.get(`${config.confluence.host}/rest/api/space`, {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          }
        });
      }
      
      return { 
        success: true, 
        jira: { success: true, data: jiraResponse.data },
        confluence: confluenceResponse ? { success: true, data: confluenceResponse.data } : null
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        details: error.response?.data || null
      };
    }
  }
  
  /**
   * Detect client type from user agent
   * @param {String} userAgent - User agent string
   * @returns {String} - Client type ('cursor', 'vscode', 'claude', 'browser')
   */
  detectClientType(userAgent) {
    if (!userAgent) return 'browser';
    
    // Try to match user agent to client type
    for (const [clientName, clientType] of Object.entries(this.clientTypeDetection)) {
      if (userAgent.includes(clientName)) {
        return clientType;
      }
    }
    
    // Advanced detection for Cursor
    if (
      userAgent.includes('streamableHttp') || 
      userAgent.includes('jsonrpc') || 
      userAgent.includes('JSON-RPC')
    ) {
      return 'cursor';
    }
    
    // Default to browser
    return 'browser';
  }
  
  /**
   * Get client-specific configuration settings
   * @param {String} clientId - Client ID
   * @param {String} clientType - Optional client type to override detection
   * @returns {Object} - Client-specific configuration
   */
  getClientSpecificConfig(clientId, clientType = null) {
    // If client has stored configuration, use that
    const storedConfig = this.configCache.get(`client-type-${clientId}`);
    if (storedConfig && !clientType) {
      clientType = storedConfig;
    }
    
    // Default to browser if not specified
    clientType = clientType || 'browser';
    
    // Return the config for this client type
    return this.clientTypeConfigs[clientType] || this.clientTypeConfigs['browser'];
  }
  
  /**
   * Store the client type for this client
   * @param {String} clientId - Client ID
   * @param {String} clientType - Client type
   */
  setClientType(clientId, clientType) {
    this.configCache.set(`client-type-${clientId}`, clientType);
  }
}

export default new ConfigManager();
