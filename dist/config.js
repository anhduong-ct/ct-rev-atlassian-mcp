import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env file
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Create config object from environment variables
const config = {
  server: {
    mode: process.env.MCP_SERVER_MODE || 'stdio', // 'stdio' or 'http'
    http: {
      port: parseInt(process.env.MCP_HTTP_PORT || '3000', 10),
      host: process.env.MCP_HTTP_HOST || 'localhost'
    }
  },
  jira: {
    host: process.env.JIRA_HOST || 'https://company.atlassian.net',
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
    projects: { 
      cppf: process.env.JIRA_CPPF_PROJECT || 'CPPF', 
      cre: process.env.JIRA_CRE_PROJECT || 'CRE'
    },
    customFields: {
      sprint: process.env.JIRA_FIELD_SPRINT || 'customfield_10004',
      storyPoints: process.env.JIRA_FIELD_STORY_POINTS || 'customfield_10006'
    }
  },
  confluence: {
    host: process.env.CONFLUENCE_HOST || process.env.JIRA_HOST || 'https://company.atlassian.net',
    spaces: (process.env.CONFLUENCE_SPACES || 'PROD,TD').split(','),
    sprintPlanningSpace: process.env.SPRINT_PLANNING_SPACE || '~629041681a437e007044041e'
  },
  user: {
    accountId: process.env.USER_ACCOUNT_ID,
    role: process.env.USER_ROLE || 'fullstack',
    currentSprint: null // Will be auto-detected and populated
  },
  workflow: {
    platforms: (process.env.PLATFORMS || 'web,backend,android,ios').split(','),
    priorityWeights: {
      cppfPriority: parseFloat(process.env.PRIORITY_WEIGHT_CPPF || 0.4),
      dependencies: parseFloat(process.env.PRIORITY_WEIGHT_DEPENDENCIES || 0.3),
      complexity: parseFloat(process.env.PRIORITY_WEIGHT_COMPLEXITY || 0.2),
      deadline: parseFloat(process.env.PRIORITY_WEIGHT_DEADLINE || 0.1)
    },
    doneStatuses: ['Done', 'Closed', 'Completed', 'On Production']
  },
  sprint: {
    autoDetection: process.env.SPRINT_AUTO_DETECTION !== 'false', // Defaults to true
    cacheExpiry: parseInt(process.env.SPRINT_CACHE_EXPIRY || '900000'), // 15 minutes in ms
    nextSprintThresholdDays: parseInt(process.env.SPRINT_NEXT_THRESHOLD_DAYS || '3') // Switch to next sprint when within X days of end
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};

// Validate required configuration
function validateConfig() {
  const requiredFields = [
    { path: 'jira.email', value: config.jira.email },
    { path: 'jira.apiToken', value: config.jira.apiToken },
    { path: 'user.accountId', value: config.user.accountId }
  ];

  const missingFields = requiredFields
    .filter(field => !field.value)
    .map(field => field.path);

  if (missingFields.length > 0) {
    // console.warn(`Warning: Missing configuration for: ${missingFields.join(', ')}`);
    // console.warn('Some tools may not work properly without proper credentials.');
    // console.warn('Please either:');
    // console.warn('1. Create a .env file with the required variables, or');
    // console.warn('2. Use the set_credentials tool at runtime to provide your credentials');
    // Don't fail validation in development mode - just warn
    return true;
  }

  return true;
}

// Auto-detect sprint on startup if enabled
async function autoDetectSprint() {
  if (!config.sprint.autoDetection) {
    // console.log('Sprint auto-detection is disabled');
    config.user.currentSprint = 'Auto-detection disabled';
    return config.user.currentSprint;
  }

  try {
    // Dynamic import to avoid circular dependency
    const { default: sprintDetectionService } = await import('./services/sprintDetection.js');
    
    // console.log('🔍 Auto-detecting current sprint...');
    const result = await sprintDetectionService.refreshConfig();
    
    if (result.success) {
      // console.log(`✅ Sprint auto-detected: "${result.data.newSprint}"`);
      // if (result.data.detectionMethod) {
      //   console.log(`   Detection method: ${result.data.detectionMethod}`);
      // }
      return result.data.newSprint;
    } else {
      // console.warn(`⚠️ Sprint auto-detection failed: ${result.error}`);
      
      // Try to get the most recent sprint as fallback
      const contextResult = await sprintDetectionService.getAllSprintInfo();
      if (contextResult.success) {
        // Try to use the most recent closed sprint if no active sprint
        const recentSprint = contextResult.data.previous || 
                           (contextResult.data.sprintHistory && contextResult.data.sprintHistory[0]);
        
        if (recentSprint) {
          config.user.currentSprint = recentSprint.name;
          // console.log(`📅 Using most recent sprint: "${recentSprint.name}"`);
          return recentSprint.name;
        }
      }
      
      // Fallback to known working sprint
      config.user.currentSprint = 'Revenue 25.20';
      // console.warn(`Using fallback sprint: "${config.user.currentSprint}"`);
      return config.user.currentSprint;
    }
  } catch (error) {
    // console.warn(`⚠️ Sprint auto-detection error: ${error.message}`);
    // Fallback to known sprint even on error
    config.user.currentSprint = 'Revenue 25.20';
    // console.warn(`Using error fallback: "${config.user.currentSprint}"`);
    return config.user.currentSprint;
  }
}

// Helper function to get current sprint info
async function getCurrentSprintInfo() {
  try {
    const { default: sprintDetectionService } = await import('./services/sprintDetection.js');
    return await sprintDetectionService.getAllSprintInfo();
  } catch (error) {
    // console.error('Error getting sprint info:', error.message);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

// Helper function to ensure we have a current sprint
function getCurrentSprint() {
  if (!config.user.currentSprint) {
    return 'No Sprint Detected';
  }
  return config.user.currentSprint;
}

export { config, validateConfig, autoDetectSprint, getCurrentSprintInfo, getCurrentSprint };