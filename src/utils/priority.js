import { config } from '../config.js';

/**
 * Calculate priority score for a Jira issue
 * @param {Object} issue - Jira issue object
 * @param {Object} weights - Priority weight configuration
 * @returns {number} Priority score (0-100)
 */
function calculatePriority(issue, weights = config.workflow.priorityWeights) {
  if (!issue || !issue.fields) {
    return 0;
  }

  // Default weights if not provided
  const priorityWeights = {
    cppfPriority: weights?.cppfPriority || 0.4,
    dependencies: weights?.dependencies || 0.3,
    complexity: weights?.complexity || 0.2,
    deadline: weights?.deadline || 0.1
  };

  // Calculate CPPF priority score (0-100)
  const cppfPriorityScore = calculateCPPFPriorityScore(issue);
  
  // Calculate dependency score (0-100)
  const dependencyScore = calculateDependencyScore(issue);
  
  // Calculate complexity score (0-100)
  const complexityScore = calculateComplexityScore(issue);
  
  // Calculate deadline score (0-100)
  const deadlineScore = calculateDeadlineScore(issue);
  
  // Calculate weighted score
  const weightedScore = 
    (cppfPriorityScore * priorityWeights.cppfPriority) +
    (dependencyScore * priorityWeights.dependencies) +
    (complexityScore * priorityWeights.complexity) +
    (deadlineScore * priorityWeights.deadline);
  
  // Return normalized score (0-100)
  return Math.min(100, Math.max(0, Math.round(weightedScore)));
}

/**
 * Calculate priority score based on CPPF priority
 * @param {Object} issue - Jira issue object
 * @returns {number} Priority score (0-100)
 */
function calculateCPPFPriorityScore(issue) {
  if (!issue || !issue.fields || !issue.fields.priority) {
    return 50; // Default to medium priority
  }

  // Map Jira priority names to scores
  const priorityMap = {
    'Highest': 100,
    'High': 80,
    'Medium': 60,
    'Low': 40,
    'Lowest': 20
  };

  // Get priority name
  const priorityName = issue.fields.priority?.name;
  
  // Return mapped score or default
  return priorityMap[priorityName] || 50;
}

/**
 * Calculate dependency score based on issue links
 * @param {Object} issue - Jira issue object
 * @returns {number} Dependency score (0-100)
 */
function calculateDependencyScore(issue) {
  if (!issue || !issue.fields || !issue.fields.issuelinks) {
    return 50; // Default score
  }

  const issueLinks = issue.fields.issuelinks || [];
  
  // Count blocking and blocked-by links
  let blockingCount = 0;
  let blockedByCount = 0;
  
  for (const link of issueLinks) {
    if (link.type.name === 'Blocks' && link.outwardIssue) {
      // This issue blocks another issue
      blockingCount++;
    } else if (link.type.name === 'Blocks' && link.inwardIssue) {
      // This issue is blocked by another issue
      blockedByCount++;
    }
  }
  
  // Calculate score:
  // - High score if this issue blocks many others (it's a bottleneck)
  // - Low score if this issue is blocked by many others (can't work on it yet)
  
  // Blocking others increases priority
  const blockingScore = Math.min(100, blockingCount * 20);
  
  // Being blocked decreases priority
  const blockedPenalty = Math.min(80, blockedByCount * 20);
  
  // Calculate final score
  let finalScore = 50 + blockingScore - blockedPenalty;
  
  // Normalize to 0-100 range
  return Math.min(100, Math.max(0, finalScore));
}

/**
 * Calculate complexity score based on story points
 * @param {Object} issue - Jira issue object
 * @returns {number} Complexity score (0-100)
 */
function calculateComplexityScore(issue) {
  if (!issue || !issue.fields) {
    return 50; // Default score
  }

  // Assuming story points are stored in customfield_10002
  // This field name might be different in your Jira instance
  const storyPoints = issue.fields.customfield_10002 || 0;
  
  // Calculate score based on story points:
  // - Higher story points (more complex) = lower priority score
  // - We want to prioritize quick wins first
  
  if (storyPoints === 0) {
    return 50; // No story points assigned, use default
  }
  
  // Map common story point values to scores
  // Lower story points get higher priority scores
  const pointsToScore = {
    1: 90,  // Trivial tasks get high priority (quick wins)
    2: 80,
    3: 70,
    5: 60,
    8: 50,
    13: 40,
    21: 30
  };
  
  // Return mapped score or calculate for unusual values
  if (pointsToScore[storyPoints]) {
    return pointsToScore[storyPoints];
  }
  
  // For unusual story point values, calculate score
  // Formula: 100 - (storyPoints * 5), with min 20
  return Math.max(20, 100 - (storyPoints * 5));
}

/**
 * Calculate deadline score based on due date
 * @param {Object} issue - Jira issue object
 * @returns {number} Deadline score (0-100)
 */
function calculateDeadlineScore(issue) {
  if (!issue || !issue.fields || !issue.fields.duedate) {
    return 50; // Default score if no due date
  }

  const dueDate = new Date(issue.fields.duedate);
  const today = new Date();
  
  // Calculate days until due date
  const daysUntilDue = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));
  
  // Calculate score based on days until due:
  // - Overdue items get highest priority (100)
  // - Items due soon get high priority
  // - Items due far in the future get lower priority
  
  if (daysUntilDue < 0) {
    // Overdue
    return 100;
  } else if (daysUntilDue === 0) {
    // Due today
    return 95;
  } else if (daysUntilDue <= 1) {
    // Due tomorrow
    return 90;
  } else if (daysUntilDue <= 3) {
    // Due within 3 days
    return 85;
  } else if (daysUntilDue <= 7) {
    // Due within a week
    return 80;
  } else if (daysUntilDue <= 14) {
    // Due within two weeks
    return 70;
  } else if (daysUntilDue <= 30) {
    // Due within a month
    return 60;
  } else {
    // Due later
    return 50;
  }
}

/**
 * Sort issues by calculated priority
 * @param {Array} issues - Array of Jira issue objects
 * @param {Object} weights - Priority weight configuration
 * @returns {Array} Sorted issues with priority scores
 */
function sortIssuesByPriority(issues, weights = config.workflow.priorityWeights) {
  if (!issues || !Array.isArray(issues)) {
    return [];
  }

  // Calculate priority for each issue
  const issuesWithPriority = issues.map(issue => ({
    issue,
    priority: calculatePriority(issue, weights)
  }));
  
  // Sort by priority (highest first)
  issuesWithPriority.sort((a, b) => b.priority - a.priority);
  
  // Return sorted issues with priority scores
  return issuesWithPriority;
}

export {
  calculatePriority,
  calculateCPPFPriorityScore,
  calculateDependencyScore,
  calculateComplexityScore,
  calculateDeadlineScore,
  sortIssuesByPriority
}; 