import { config } from '../config.js';

/**
 * Get platform-specific requirements from a set of requirements
 * @param {string[]} requirements - Array of requirement strings
 * @param {string} platform - Target platform (web, backend, app, ios)
 * @returns {string[]} Filtered requirements for the platform
 */
function getPlatformRequirements(requirements, platform) {
  if (!requirements || !platform) {
    return [];
  }

  // Define platform-specific keywords
  const platformKeywords = {
    web: ['web', 'frontend', 'front-end', 'ui', 'ux', 'interface', 'react', 'angular', 'vue', 'javascript', 'typescript', 'html', 'css'],
    backend: ['backend', 'back-end', 'api', 'server', 'database', 'db', 'service', 'endpoint', 'java', 'python', 'node'],
    app: ['app', 'mobile', 'android', 'ui', 'ux', 'interface', 'react native', 'flutter'],
    ios: ['ios', 'swift', 'objective-c', 'apple']
  };

  // Get keywords for the specified platform
  const keywords = platformKeywords[platform] || [];

  // Filter requirements by platform keywords
  return requirements.filter(req => {
    const lowerReq = req.toLowerCase();
    return keywords.some(keyword => lowerReq.includes(keyword));
  });
}

/**
 * Check if a requirement is applicable to a specific platform
 * @param {string} requirement - Requirement text
 * @param {string} platform - Target platform
 * @returns {boolean} True if requirement applies to platform
 */
function isRequirementForPlatform(requirement, platform) {
  if (!requirement || !platform) {
    return false;
  }

  // Define platform-specific keywords
  const platformKeywords = {
    web: ['web', 'frontend', 'front-end', 'ui', 'ux', 'interface', 'react', 'angular', 'vue', 'javascript', 'typescript', 'html', 'css'],
    backend: ['backend', 'back-end', 'api', 'server', 'database', 'db', 'service', 'endpoint', 'java', 'python', 'node'],
    app: ['app', 'mobile', 'android', 'ui', 'ux', 'interface', 'react native', 'flutter'],
    ios: ['ios', 'swift', 'objective-c', 'apple']
  };

  // Get keywords for the specified platform
  const keywords = platformKeywords[platform] || [];
  
  // Check if requirement contains any platform keywords
  const lowerReq = requirement.toLowerCase();
  return keywords.some(keyword => lowerReq.includes(keyword));
}

/**
 * Get all platforms that a requirement applies to
 * @param {string} requirement - Requirement text
 * @returns {string[]} Array of applicable platforms
 */
function getPlatformsForRequirement(requirement) {
  if (!requirement) {
    return [];
  }

  const applicablePlatforms = [];
  const lowerReq = requirement.toLowerCase();

  for (const platform of config.workflow.platforms) {
    if (isRequirementForPlatform(lowerReq, platform)) {
      applicablePlatforms.push(platform);
    }
  }

  // If no specific platforms detected, it might be a general requirement
  // that applies to all platforms
  if (applicablePlatforms.length === 0) {
    return config.workflow.platforms;
  }

  return applicablePlatforms;
}

/**
 * Determine if a user with a specific role should work on a requirement
 * @param {string} requirement - Requirement text
 * @param {string} role - User role (web, backend, app, ios, fullstack)
 * @returns {boolean} True if user should work on requirement
 */
function isRequirementForRole(requirement, role) {
  if (!requirement || !role) {
    return false;
  }

  // Fullstack developers work on all requirements
  if (role === 'fullstack') {
    return true;
  }

  // For specific roles, check if the requirement applies to their platform
  return isRequirementForPlatform(requirement, role);
}

/**
 * Get dependencies between platforms for a set of requirements
 * @param {string[]} requirements - Array of requirement strings
 * @returns {Object} Map of platform dependencies
 */
function getPlatformDependencies(requirements) {
  if (!requirements || requirements.length === 0) {
    return {};
  }

  const dependencies = {};
  
  // Initialize dependencies for each platform
  for (const platform of config.workflow.platforms) {
    dependencies[platform] = [];
  }

  // Keywords indicating dependencies between platforms
  const dependencyKeywords = [
    { source: 'web', target: 'backend', keywords: ['api', 'endpoint', 'service', 'data', 'fetch'] },
    { source: 'backend', target: 'web', keywords: ['ui', 'display', 'render', 'frontend'] },
    { source: 'app', target: 'backend', keywords: ['api', 'endpoint', 'service', 'data', 'fetch'] },
    { source: 'ios', target: 'backend', keywords: ['api', 'endpoint', 'service', 'data', 'fetch'] },
    { source: 'backend', target: 'app', keywords: ['mobile', 'notification', 'push'] },
    { source: 'backend', target: 'ios', keywords: ['mobile', 'notification', 'push'] }
  ];

  // Analyze each requirement for dependencies
  for (const req of requirements) {
    const lowerReq = req.toLowerCase();
    
    for (const { source, target, keywords } of dependencyKeywords) {
      // Check if requirement contains source platform keywords
      if (isRequirementForPlatform(lowerReq, source)) {
        // Check if requirement also contains dependency keywords
        if (keywords.some(keyword => lowerReq.includes(keyword))) {
          // Add dependency if not already present
          if (!dependencies[source].includes(target)) {
            dependencies[source].push(target);
          }
        }
      }
    }
  }

  return dependencies;
}

export {
  getPlatformRequirements,
  isRequirementForPlatform,
  getPlatformsForRequirement,
  isRequirementForRole,
  getPlatformDependencies
}; 