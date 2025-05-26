import { config } from '../config.js';
import * as cheerio from 'cheerio';

/**
 * Analyzes text to detect required platforms
 * @param {string} content - The text content to analyze
 * @returns {string[]} Array of detected platforms
 */
function detectPlatforms(content) {
  if (!content) {
    return [];
  }

  const platforms = [];
  const platformKeywords = {
    web: ['web', 'frontend', 'front-end', 'react', 'angular', 'vue', 'javascript', 'typescript', 'html', 'css'],
    backend: ['backend', 'back-end', 'api', 'server', 'database', 'db', 'java', 'python', 'node', 'express', 'spring'],
    app: ['app', 'mobile', 'android', 'kotlin', 'react native', 'flutter'],
    ios: ['ios', 'swift', 'objective-c', 'apple']
  };

  // Convert content to lowercase for case-insensitive matching
  const lowerContent = content.toLowerCase();

  // Check for platform keywords
  for (const [platform, keywords] of Object.entries(platformKeywords)) {
    for (const keyword of keywords) {
      if (lowerContent.includes(keyword)) {
        platforms.push(platform);
        break;
      }
    }
  }

  // If no platforms detected, return all configured platforms as fallback
  if (platforms.length === 0) {
    return config.workflow.platforms;
  }

  return [...new Set(platforms)]; // Remove duplicates
}

/**
 * Extracts requirements from text based on user role
 * @param {string} content - The text content to analyze
 * @param {string} role - The user role to filter requirements for
 * @returns {string[]} Array of extracted requirements
 */
function extractRequirements(content, role = config.user.role) {
  if (!content) {
    return [];
  }

  const requirements = [];
  const lines = content.split('\n');
  
  // Define role-specific keywords
  const roleKeywords = {
    web: ['web', 'frontend', 'front-end', 'ui', 'ux', 'interface', 'react', 'angular', 'vue', 'javascript', 'typescript', 'html', 'css'],
    backend: ['backend', 'back-end', 'api', 'server', 'database', 'db', 'service', 'endpoint', 'java', 'python', 'node'],
    app: ['app', 'mobile', 'android', 'ui', 'ux', 'interface', 'react native', 'flutter'],
    ios: ['ios', 'swift', 'objective-c', 'apple'],
    fullstack: [] // Fullstack matches everything
  };

  // Get keywords for the specified role
  const keywords = roleKeywords[role] || [];

  // If fullstack role, include all requirements
  const isFullstack = role === 'fullstack';

  // Look for requirement patterns
  for (let line of lines) {
    line = line.trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Look for common requirement patterns
    const isRequirement = 
      line.match(/^[-*•]/) || // Bullet points
      line.match(/^\d+\./) || // Numbered lists
      line.match(/^(must|should|shall|will)/i) || // Requirement language
      line.match(/^(requirement|req):/i); // Explicit requirement
    
    if (isRequirement) {
      // For fullstack, include all requirements
      if (isFullstack) {
        requirements.push(line);
        continue;
      }
      
      // For specific roles, check if the line contains role-specific keywords
      const lowerLine = line.toLowerCase();
      const matchesRole = keywords.some(keyword => lowerLine.includes(keyword));
      
      if (matchesRole) {
        requirements.push(line);
      }
    }
  }
  
  // If no requirements were found with the structured approach, try a more lenient approach
  if (requirements.length === 0) {
    // Split content into sentences
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
    
    for (let sentence of sentences) {
      sentence = sentence.trim();
      
      // Skip short sentences
      if (sentence.length < 15) continue;
      
      // Look for requirement-like sentences
      const isRequirementLike = 
        sentence.match(/\b(implement|create|develop|build|add|support|enable|allow|provide)\b/i);
      
      if (isRequirementLike) {
        // For fullstack, include all requirements
        if (isFullstack) {
          requirements.push(sentence);
          continue;
        }
        
        // For specific roles, check if the sentence contains role-specific keywords
        const lowerSentence = sentence.toLowerCase();
        const matchesRole = keywords.some(keyword => lowerSentence.includes(keyword));
        
        if (matchesRole) {
          requirements.push(sentence);
        }
      }
    }
  }

  return requirements;
}

/**
 * Estimates complexity based on requirements
 * @param {string[]} requirements - Array of requirement strings
 * @returns {number} Estimated complexity as story points
 */
function estimateComplexity(requirements) {
  if (!requirements || requirements.length === 0) {
    return 1; // Default minimum complexity
  }

  // Base complexity based on number of requirements
  let complexity = Math.ceil(requirements.length / 2);
  
  // Adjust complexity based on requirement content
  for (const req of requirements) {
    const lowerReq = req.toLowerCase();
    
    // Increase complexity for certain keywords
    if (lowerReq.includes('complex') || 
        lowerReq.includes('difficult') || 
        lowerReq.includes('challenging')) {
      complexity += 1;
    }
    
    // Increase complexity for integration requirements
    if (lowerReq.includes('integrat') || 
        lowerReq.includes('connect') || 
        lowerReq.includes('third-party')) {
      complexity += 1;
    }
    
    // Increase complexity for performance requirements
    if (lowerReq.includes('performance') || 
        lowerReq.includes('optimize') || 
        lowerReq.includes('scale')) {
      complexity += 1;
    }
    
    // Decrease complexity for simple requirements
    if (lowerReq.includes('simple') || 
        lowerReq.includes('easy') || 
        lowerReq.includes('straightforward')) {
      complexity -= 1;
    }
  }
  
  // Ensure complexity is within reasonable bounds (1-13 Fibonacci)
  const fibonacciPoints = [1, 2, 3, 5, 8, 13];
  
  // Find the closest Fibonacci number
  let closestFib = fibonacciPoints[0];
  let minDiff = Math.abs(complexity - closestFib);
  
  for (let i = 1; i < fibonacciPoints.length; i++) {
    const diff = Math.abs(complexity - fibonacciPoints[i]);
    if (diff < minDiff) {
      minDiff = diff;
      closestFib = fibonacciPoints[i];
    }
  }
  
  return closestFib;
}

// Regex patterns for parsing (as constants)
const TASK_ID_PATTERNS = {
  CPPF: /CPPF-\d+/gi,
  CRE: /CRE-\d+/gi
};

const ASSIGNEE_PATTERNS = {
  PIC: /(\w+)(?:PIC|\.PIC)/gi,
  WEB: /Web\.(\w+)/gi,
  BE: /BE\.(\w+)/gi,
  APP: /App\.(\w+)/gi
};

const STORY_POINTS_PATTERN = /(\d+)\s*SP/gi;

const NOTES_PATTERNS = {
  RELEASE_DATE: /released on \d{2}\/\d{2}\/\d{4}|release .*?(?=\s*(?:<|$))/gi,
  TIMELINE: /Preferred timeline to Prod:.*?Asap.*?(?=\s*(?:<|$))|→.*?(?=\s*(?:<|$))/gi,
  THREAD_LINK: /Thread link HERE/gi,
  COMMENTS: /PM:.*?(?=\s*(?:<|$))|\?\?\!\!.*?(?=\s*(?:<|$))|@.*?:.*?(?=\s*(?:<|$))/gi
};

/**
 * Extracts task ID from text (CPPF or CRE)
 * @param {string} text - Text to extract from
 * @param {boolean} preferCppf - Whether to prefer CPPF over CRE
 * @returns {string|null} - Found task ID or null
 */
function extractTaskId(text, preferCppf = true) {
  if (!text) return null;
  
  const cppfMatches = text.match(TASK_ID_PATTERNS.CPPF);
  const creMatches = text.match(TASK_ID_PATTERNS.CRE);
  
  if (preferCppf && cppfMatches) {
    return cppfMatches[0];
  }
  
  if (creMatches) {
    return creMatches[0];
  }
  
  if (cppfMatches) {
    return cppfMatches[0];
  }
  
  return null;
}

/**
 * Extracts assignee information from text
 * @param {string} text - Text to extract from
 * @returns {string|null} - Combined assignee string or null
 */
function extractAssignee(text) {
  if (!text) return null;
  
  const assignees = new Set();
  
  // Extract all different assignee patterns
  const patterns = [
    { regex: /(\w+)PIC(?!\w)/gi, format: (match) => `${match[1]}PIC` },
    { regex: /(\w+)\.PIC/gi, format: (match) => `${match[1]}.PIC` },
    { regex: /Web\.(\w+)/gi, format: (match) => `Web.${match[1]}` },
    { regex: /BE\.(\w+)/gi, format: (match) => `BE.${match[1]}` },
    { regex: /App\.(\w+)/gi, format: (match) => `App.${match[1]}` },
    { regex: /(\w+)\s+PIC/gi, format: (match) => `${match[1]} PIC` }
  ];
  
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern.regex)];
    for (const match of matches) {
      assignees.add(pattern.format(match));
    }
  }
  
  return assignees.size > 0 ? Array.from(assignees).join(', ') : null;
}

/**
 * Extracts story points for a specific engineer
 * @param {string} text - Text to extract from
 * @param {string} engineerName - Engineer name to look for
 * @returns {number|null} - Story points or null
 */
function extractStoryPoints(text, engineerName) {
  if (!text || !engineerName) return null;
  
  // Look for patterns like "@Name: Confident: X SP" or "X SP"
  const confidencePattern = new RegExp(`@${engineerName}:\\s*(?:Confident|confident):\\s*(\\d+)\\s*SP`, 'gi');
  const spPattern = new RegExp(`@${engineerName}:.*?(\\d+)\\s*SP`, 'gi');
  const generalSpPattern = new RegExp(`(\\d+)\\s*SP`, 'gi');
  
  let match = confidencePattern.exec(text);
  if (match) {
    return parseInt(match[1], 10);
  }
  
  match = spPattern.exec(text);
  if (match) {
    return parseInt(match[1], 10);
  }
  
  // Fallback to general SP pattern if engineer name appears in text
  if (text.toLowerCase().includes(engineerName.toLowerCase())) {
    match = generalSpPattern.exec(text);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  
  return null;
}

/**
 * Extracts all story points from text regardless of engineer name
 * @param {string} text - Text to extract from
 * @returns {Object} - Object mapping engineer names to story points
 */
function extractAllStoryPoints(text) {
  if (!text) return {};
  
  const storyPoints = {};
  
  // Look for patterns like "@Name: Confident: X SP" or "@Name: confident, X SP"
  const patterns = [
    /@(\w+):\s*(?:Confident|confident):\s*(\d+)\s*SP/gi,
    /@(\w+):\s*(?:confident|Confident),?\s*(\d+)\s*SP/gi
  ];
  
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const engineerName = match[1];
      const sp = parseInt(match[2], 10);
      if (!isNaN(sp)) {
        storyPoints[engineerName] = sp;
      }
    }
  }
  
  return storyPoints;
}

/**
 * Extracts notes and metadata from text
 * @param {string} text - Text to extract from
 * @returns {string[]} - Array of extracted notes
 */
function extractNotes(text) {
  if (!text) return [];
  
  const notes = [];
  
  // Extract different types of notes
  for (const [type, pattern] of Object.entries(NOTES_PATTERNS)) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      notes.push(match[0].trim());
    }
  }
  
  return notes;
}

/**
 * Cleans task name by removing task IDs and brackets
 * @param {string} name - Raw task name
 * @returns {string} - Cleaned task name
 */
function cleanTaskName(name) {
  if (!name) return '';
  
  return name
    .replace(TASK_ID_PATTERNS.CPPF, '')
    .replace(TASK_ID_PATTERNS.CRE, '')
    .replace(/\[.*?\]/g, '') // Remove square brackets content
    .replace(/\(.*?\)/g, '') // Remove parentheses content
    .replace(/^\s*[-–—:|\s]+/, '') // Remove leading separators
    .replace(/[-–—:|\s]+$/, '') // Remove trailing separators
    .trim();
}

/**
 * Parses HTML sprint planning content into structured JSON
 * @param {string} html - HTML content to parse
 * @returns {Object} - Parsed sprint planning data
 */
function parseSprintPlanning(html) {
  if (!html) {
    return { sections: [], total_story_points: {} };
  }
  
  try {
    const $ = cheerio.load(html);
    const sections = [];
    const storyPointsTracker = {};
    
    // Find section headers (code tags or h3 tags)
    const sectionSelectors = ['code', 'h3'];
    
    for (const selector of sectionSelectors) {
      $(selector).each((index, element) => {
        const sectionText = $(element).text().trim();
        
        // Match known section patterns
        const sectionPatterns = [
          'TO BE RELEASED',
          'CONTINUE FROM LAST SPRINT', 
          'NEW FOR NEXT SPRINT',
          'Techdebt'
        ];
        
        const matchedSection = sectionPatterns.find(pattern => 
          sectionText.includes(pattern)
        );
        
        if (matchedSection) {
          const tasks = [];
          
          // Handle different element types differently
          if (selector === 'h3') {
            // For h3 elements (like Techdebt), look for the next ol directly
            const nextOl = $(element).next('ol');
            if (nextOl.length > 0) {
              // Process each li in the ol
              nextOl.children('li').each((taskIndex, taskLi) => {
                const $taskLi = $(taskLi);
                const taskText = $taskLi.text();
                const taskHtml = $taskLi.html();
                
                // Skip if task is cancelled (wrapped in del tags)
                if ($taskLi.find('del').length > 0 && $taskLi.text().trim().startsWith('[')) {
                  return; // Continue to next task
                }
                
                // Extract task ID (CRE for Techdebt)
                const taskId = extractTaskId(taskText, false); // Prefer CRE for Techdebt
                
                if (!taskId) return; // Skip if no task ID found
                
                // For techdebt, the name comes after the CRE ID
                const parts = taskText.split(taskId);
                let rawName = parts.length > 1 ? parts[1] : parts[0];
                const cleanedName = cleanTaskName(rawName);
                
                // Extract assignee
                const assignee = extractAssignee(taskText);
                
                // Extract notes from all task content
                const allTaskContent = $taskLi.html() || '';
                const notes = extractNotes(allTaskContent);
                
                // Track story points for engineers
                if (assignee) {
                  // Extract engineer names from assignee string
                  const engineerMatches = [
                    ...assignee.matchAll(/(\w+)(?:PIC|\.PIC)/g),
                    ...assignee.matchAll(/Web\.(\w+)/g),
                    ...assignee.matchAll(/BE\.(\w+)/g),
                    ...assignee.matchAll(/App\.(\w+)/g)
                  ];
                  
                  for (const match of engineerMatches) {
                    const engineerName = match[1];
                    const sp = extractStoryPoints(allTaskContent, engineerName);
                    if (sp !== null) {
                      storyPointsTracker[engineerName] = sp; // Update with latest SP
                    }
                  }
                }
                
                // Also check for story points with different engineer names in the task content
                const allStoryPoints = extractAllStoryPoints(allTaskContent);
                Object.assign(storyPointsTracker, allStoryPoints);
                
                // Create task object
                const task = {
                  task_id: taskId,
                  name: cleanedName,
                  assignee: assignee,
                  cre_id: null, // Techdebt tasks don't have nested CRE IDs
                  notes: notes.length > 0 ? notes.join('; ') : null
                };
                
                tasks.push(task);
              });
            }
          } else {
            // For code elements, they are inside p elements, so check parent's siblings
            const parent = $(element).parent();
            let currentElement = parent;
            
            // Special handling for NEW FOR NEXT SPRINT section
            if (matchedSection === 'NEW FOR NEXT SPRINT') {
              // Look for all elements after the section header until the next section
              while (currentElement.length > 0) {
                currentElement = currentElement.next();
                if (currentElement.length === 0) break;
                
                const tagName = currentElement.prop('tagName');
                
                // Stop at next section
                if (tagName === 'H3' || (tagName === 'P' && currentElement.find('code').length > 0)) {
                  break;
                }
                
                // Process paragraph with CPPF task (like CPPF-1412)
                if (tagName === 'P') {
                  const taskText = currentElement.text();
                  const taskHtml = currentElement.html();
                  
                  // Check if this paragraph contains a CPPF task
                  const taskId = extractTaskId(taskText, true);
                  if (taskId && taskId.startsWith('CPPF')) {
                    // Extract task name by removing the CPPF ID and cleaning
                    let rawName = taskText.replace(taskId, '').trim();
                    // Remove leading numbers and dots (e.g., "#0.")
                    rawName = rawName.replace(/^#?\d+\.\s*/, '');
                    const cleanedName = cleanTaskName(rawName);
                    
                    // Extract assignee and story points from the paragraph
                    const assignee = extractAssignee(taskText);
                    
                    // Extract notes from the paragraph
                    const notes = extractNotes(taskHtml || '');
                    
                    // Track story points for engineers
                    if (assignee) {
                      const engineerMatches = [
                        ...assignee.matchAll(/(\w+)(?:PIC|\.PIC)/g),
                        ...assignee.matchAll(/Web\.(\w+)/g),
                        ...assignee.matchAll(/BE\.(\w+)/g),
                        ...assignee.matchAll(/App\.(\w+)/g)
                      ];
                      
                      for (const match of engineerMatches) {
                        const engineerName = match[1];
                        const sp = extractStoryPoints(taskHtml || '', engineerName);
                        if (sp !== null) {
                          storyPointsTracker[engineerName] = sp;
                        }
                      }
                    }
                    
                    // Also check for story points with different engineer names in the task content
                    const allStoryPoints = extractAllStoryPoints(taskHtml || '');
                    Object.assign(storyPointsTracker, allStoryPoints);
                    
                    tasks.push({
                      task_id: taskId,
                      name: cleanedName,
                      assignee: assignee,
                      cre_id: null, // Will be extracted from subtasks if any
                      notes: notes.length > 0 ? notes.join('; ') : null
                    });
                  }
                }
                
                // Process OL elements
                if (tagName === 'OL') {
                  // Process each li in the ol
                  currentElement.children('li').each((taskIndex, taskLi) => {
                    const $taskLi = $(taskLi);
                    const taskText = $taskLi.text();
                    const taskHtml = $taskLi.html();
                    
                    // Skip if task is cancelled (wrapped in del tags)
                    if ($taskLi.find('del').length > 0 && $taskLi.text().trim().startsWith('[')) {
                      return; // Continue to next task
                    }
                    
                    // Extract task ID (CPPF for main tasks, CRE for Techdebt)
                    const isTechtdebt = matchedSection === 'Techdebt';
                    const taskId = extractTaskId(taskText, !isTechtdebt);
                    
                    if (!taskId) return; // Skip if no task ID found
                    
                    // Extract task name and clean it
                    // For main tasks, get text before the CPPF link
                    let rawName = '';
                    if (isTechtdebt) {
                      // For techdebt, the name comes after the CRE ID
                      const parts = taskText.split(taskId);
                      rawName = parts.length > 1 ? parts[1] : parts[0];
                    } else {
                      // For regular tasks, the name comes before the CPPF ID
                      const parts = taskText.split(taskId);
                      rawName = parts[0] || '';
                    }
                    
                    const cleanedName = cleanTaskName(rawName);
                    
                    // Extract assignee
                    const assignee = extractAssignee(taskText);
                    
                    // Extract CRE ID from subtasks (first nested ol > li)
                    let creId = null;
                    const subOl = $taskLi.find('ol').first();
                    if (subOl.length > 0 && !isTechtdebt) {
                      const firstSubLi = subOl.children('li').first();
                      if (firstSubLi.length > 0) {
                        creId = extractTaskId(firstSubLi.text(), false); // Prefer CRE for subtasks
                      }
                    }
                    
                    // Extract notes from all task content including subtasks
                    const allTaskContent = $taskLi.html() || '';
                    const notes = extractNotes(allTaskContent);
                    
                    // Track story points for engineers
                    if (assignee) {
                      // Extract engineer names from assignee string
                      const engineerMatches = [
                        ...assignee.matchAll(/(\w+)(?:PIC|\.PIC)/g),
                        ...assignee.matchAll(/Web\.(\w+)/g),
                        ...assignee.matchAll(/BE\.(\w+)/g),
                        ...assignee.matchAll(/App\.(\w+)/g)
                      ];
                      
                      for (const match of engineerMatches) {
                        const engineerName = match[1];
                        const sp = extractStoryPoints(allTaskContent, engineerName);
                        if (sp !== null) {
                          storyPointsTracker[engineerName] = sp; // Update with latest SP
                        }
                      }
                    }
                    
                    // Also check for story points with different engineer names in the task content
                    const allStoryPoints = extractAllStoryPoints(allTaskContent);
                    Object.assign(storyPointsTracker, allStoryPoints);
                    
                    // Create task object
                    const task = {
                      task_id: taskId,
                      name: cleanedName,
                      assignee: assignee,
                      cre_id: creId,
                      notes: notes.length > 0 ? notes.join('; ') : null
                    };
                    
                    tasks.push(task);
                  });
                }
              }
            } else {
              // Standard processing for other sections (TO BE RELEASED, CONTINUE FROM LAST SPRINT)
              let nextOl = parent.next('ol');
              if (nextOl.length === 0) {
                nextOl = parent.nextAll('ol').first();
              }
              
              if (nextOl.length > 0) {
                // Process each li in the ol
                nextOl.children('li').each((taskIndex, taskLi) => {
                  const $taskLi = $(taskLi);
                  const taskText = $taskLi.text();
                  const taskHtml = $taskLi.html();
                  
                  // Skip if task is cancelled (wrapped in del tags)
                  if ($taskLi.find('del').length > 0 && $taskLi.text().trim().startsWith('[')) {
                    return; // Continue to next task
                  }
                  
                  // Extract task ID (CPPF for main tasks, CRE for Techdebt)
                  const isTechtdebt = matchedSection === 'Techdebt';
                  const taskId = extractTaskId(taskText, !isTechtdebt);
                  
                  if (!taskId) return; // Skip if no task ID found
                  
                  // Extract task name and clean it
                  // For main tasks, get text before the CPPF link
                  let rawName = '';
                  if (isTechtdebt) {
                    // For techdebt, the name comes after the CRE ID
                    const parts = taskText.split(taskId);
                    rawName = parts.length > 1 ? parts[1] : parts[0];
                  } else {
                    // For regular tasks, the name comes before the CPPF ID
                    const parts = taskText.split(taskId);
                    rawName = parts[0] || '';
                  }
                  
                  const cleanedName = cleanTaskName(rawName);
                  
                  // Extract assignee
                  const assignee = extractAssignee(taskText);
                  
                  // Extract CRE ID from subtasks (first nested ol > li)
                  let creId = null;
                  const subOl = $taskLi.find('ol').first();
                  if (subOl.length > 0 && !isTechtdebt) {
                    const firstSubLi = subOl.children('li').first();
                    if (firstSubLi.length > 0) {
                      creId = extractTaskId(firstSubLi.text(), false); // Prefer CRE for subtasks
                    }
                  }
                  
                  // Extract notes from all task content including subtasks
                  const allTaskContent = $taskLi.html() || '';
                  const notes = extractNotes(allTaskContent);
                  
                  // Track story points for engineers
                  if (assignee) {
                    // Extract engineer names from assignee string
                    const engineerMatches = [
                      ...assignee.matchAll(/(\w+)(?:PIC|\.PIC)/g),
                      ...assignee.matchAll(/Web\.(\w+)/g),
                      ...assignee.matchAll(/BE\.(\w+)/g),
                      ...assignee.matchAll(/App\.(\w+)/g)
                    ];
                    
                    for (const match of engineerMatches) {
                      const engineerName = match[1];
                      const sp = extractStoryPoints(allTaskContent, engineerName);
                      if (sp !== null) {
                        storyPointsTracker[engineerName] = sp; // Update with latest SP
                      }
                    }
                  }
                  
                  // Also check for story points with different engineer names in the task content
                  const allStoryPoints = extractAllStoryPoints(allTaskContent);
                  Object.assign(storyPointsTracker, allStoryPoints);
                  
                  // Create task object
                  const task = {
                    task_id: taskId,
                    name: cleanedName,
                    assignee: assignee,
                    cre_id: creId,
                    notes: notes.length > 0 ? notes.join('; ') : null
                  };
                  
                  tasks.push(task);
                });
              }
            }
          }
          
          // Add section to results
          sections.push({
            section: matchedSection,
            tasks: tasks
          });
        }
      });
    }
    
    return {
      sections: sections,
      total_story_points: storyPointsTracker
    };
    
  } catch (error) {
    console.error('Error parsing sprint planning HTML:', error.message);
    return { sections: [], total_story_points: {} };
  }
}

/**
 * Legacy function for backward compatibility - now delegates to parseSprintPlanning
 * @param {string} content - Content to parse (HTML or text)
 * @returns {Object} - Parse result with success flag
 */
function parseSprintFile(content) {
  if (!content) {
    return { success: false, error: 'No content provided' };
  }

  try {
    // Check if content looks like HTML
    const isHtml = content.trim().startsWith('<') || content.includes('<p>') || content.includes('<ol>');
    
    if (isHtml) {
      // Use new HTML parser
      const result = parseSprintPlanning(content);
      
      // Convert to legacy format for backward compatibility
      const assignments = {};
      
      for (const section of result.sections) {
        for (const task of section.tasks) {
          if (task.assignee) {
            // Extract engineer names from assignee string
            const engineerMatches = [
              ...task.assignee.matchAll(/(\w+)(?:PIC|\.PIC)/g),
              ...task.assignee.matchAll(/Web\.(\w+)/g),
              ...task.assignee.matchAll(/BE\.(\w+)/g),
              ...task.assignee.matchAll(/App\.(\w+)/g)
            ];
            
            for (const match of engineerMatches) {
              const engineerName = match[1];
              
              if (!assignments[engineerName]) {
                assignments[engineerName] = [];
              }
              
              assignments[engineerName].push({
                ticketId: task.cre_id || task.task_id,
                parentTicket: task.task_id !== task.cre_id ? task.task_id : null,
                description: task.name || 'No description',
                fullAssignmentText: task.assignee,
                section: section.section
              });
            }
          }
        }
      }
      
      return { success: true, data: assignments };
    } else {
      // Fall back to original text parsing logic for non-HTML content
      return parseSprintFileLegacy(content);
    }
  } catch (error) {
    console.error('Error parsing sprint file:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Original legacy parsing function for text-based content
 * @param {string} content - Text content to parse
 * @returns {Object} - Parse result
 */
function parseSprintFileLegacy(content) {
  if (!content) {
    return { success: false, error: 'No content provided' };
  }

  try {
    const assignments = {};
    
    // Split content by common separators and clean up
    let lines = content.split(/[\n\r]+/);
    
    // If content is all in one line (common with Confluence), split by CPPF patterns
    if (lines.length === 1) {
      lines = content.split(/(?=\d+\.)/); // Split by numbered items
    }
    
    // Additional splitting for better parsing
    const allSegments = [];
    for (const line of lines) {
      if (line.length > 500) {
        // Split by numbered tasks and lettered sub-items
        const segments = line.split(/(?=\d+\.\s)|(?=\s+[a-z]\.\s)|(?=\s+[A-Z]\.\s)/);
        allSegments.push(...segments);
      } else {
        allSegments.push(line);
      }
    }
    
    let currentTask = null;
    let currentTaskDescription = '';
    
    for (let segment of allSegments) {
      segment = segment.trim();
      
      // Skip empty segments
      if (!segment || segment.length < 5) continue;
      
      // Remove common Confluence formatting artifacts
      segment = segment
        .replace(/&rarr;/g, '→') // Replace HTML arrows
        .replace(/&ldquo;|&rdquo;/g, '"') // Replace smart quotes
        .replace(/&[a-zA-Z]+;/g, ' ') // Replace other HTML entities
        .trim();
      
      // Check if this is a numbered task with CPPF at the end
      // Pattern: "1. [Optional tags] Task description CPPF-1234"
      const numberedTaskMatch = segment.match(/^(\d+)\.\s*(.+?)\s+(CPPF-\d+)(?:\s*→.*)?$/i);
      if (numberedTaskMatch) {
        currentTask = numberedTaskMatch[3]; // CPPF ticket
        currentTaskDescription = numberedTaskMatch[2].trim();
        continue;
      }
      
      // Check if this is a lettered sub-item that contains a CRE ticket with assignments
      // Pattern: "a. CRE-10909: DanhPIC + Web.AnhD + Android + iOS"
      const creAssignmentMatch = segment.match(/^[a-zA-Z]\.\s*(CRE-\d+):\s*(.+)$/i);
      if (creAssignmentMatch && currentTask) {
        const creTicket = creAssignmentMatch[1];
        const assigneesText = creAssignmentMatch[2];
        
        // Parse assignees from the format: "DanhPIC + Web.AnhD + Android + iOS"
        const assigneeParts = assigneesText.split(/\s*\+\s*/);
        
        for (const part of assigneeParts) {
          const trimmedPart = part.trim();
          
          // Skip platform names without engineers
          if (['Android', 'iOS', 'Web', 'Backend', 'BE', 'App'].includes(trimmedPart)) {
            continue;
          }
          
          let engineerName = null;
          
          // Pattern matching for different assignee formats
          if (trimmedPart.match(/^([A-Za-z]+)PIC$/)) {
            // Format: "DanhPIC", "KunPIC", "NhuPIC"
            engineerName = trimmedPart.replace('PIC', '');
          } else if (trimmedPart.match(/^Web\.([A-Za-z]+)$/)) {
            // Format: "Web.AnhD", "Web.AnhL"
            engineerName = trimmedPart.split('.')[1];
          } else if (trimmedPart.match(/^([A-Za-z]+)\.PIC$/)) {
            // Format: "AnhL.PIC", "Danh.PIC"
            engineerName = trimmedPart.split('.')[0];
          } else if (trimmedPart.match(/^BE\.([A-Za-z]+)$/)) {
            // Format: "BE.Viet"
            engineerName = trimmedPart.split('.')[1];
          } else if (trimmedPart.match(/^App\.([A-Za-z]+)$/)) {
            // Format: "App.Engineer"
            engineerName = trimmedPart.split('.')[1];
          } else if (trimmedPart.match(/^[A-Za-z]+$/) && trimmedPart.length >= 3) {
            // Format: Just the name (for cases where engineer name appears standalone)
            engineerName = trimmedPart;
          }
          
          if (engineerName) {
            if (!assignments[engineerName]) {
              assignments[engineerName] = [];
            }
            
            // Check if this task is already assigned to this engineer
            const existingAssignment = assignments[engineerName].find(task => 
              task.ticketId === creTicket
            );
            
            if (!existingAssignment) {
              assignments[engineerName].push({
                ticketId: creTicket,
                parentTicket: currentTask,
                description: currentTaskDescription || 'No description',
                fullAssignmentText: assigneesText
              });
            }
          }
        }
        continue;
      }
      
      // Skip other lettered sub-items that are not CRE assignments (notes, timelines, etc.)
      if (segment.match(/^[a-zA-Z]\.\s/)) {
        continue;
      }
      
      // Fallback to original parsing logic for other formats (legacy support)
      const engineerPatterns = [
        /^([A-Za-z\s]+):$/,                    // "Name:"
        /^([A-Za-z\s]+)\s*-\s*$/,             // "Name -"
        /^([A-Za-z\s]+)\s*\|\s*$/,            // "Name |"
        /^([A-Za-z\s]+)\s*assignments?:?$/i,   // "Name assignments"
        /^Engineer:\s*([A-Za-z\s]+)$/i,       // "Engineer: Name"
        /^Assignee:\s*([A-Za-z\s]+)$/i,       // "Assignee: Name"
        /^([A-Z][a-z]*(?:\s+[A-Z][a-z]*)*)\s*\([^)]*\):\s*$/, // "Name (role):"
        // Patterns for embedded assignments (legacy format)
        /([A-Za-z]+)PIC/,                     // "AnhPIC", "TrangPIC", etc.
        /Web\.([A-Za-z]+)/,                   // "Web.AnhD", "Web.AnhL"
        /([A-Za-z]+)\.PIC/,                   // "AnhL.PIC", "Danh.PIC"
        /([A-Za-z]+)\s+PIC/,                  // "AnhD PIC"
        /BE\.([A-Za-z]+)/,                    // "BE.Viet"
        /Android\+([A-Za-z]+)/,               // "Android+Engineer"
        /iOS\+([A-Za-z]+)/                    // "iOS+Engineer"
      ];
      
      // Check for engineer patterns within the segment (for legacy formats)
      const engineersInSegment = new Set();
      
      for (const pattern of engineerPatterns) {
        const matches = segment.matchAll(new RegExp(pattern, 'gi'));
        for (const match of matches) {
          if (match[1]) {
            const engineerName = match[1].trim();
            // Filter out common false positives
            if (engineerName.length >= 3 && 
                !['PIC', 'Web', 'iOS', 'Android', 'Backend', 'BE'].includes(engineerName) &&
                engineerName.match(/^[A-Za-z]+$/)) {
              engineersInSegment.add(engineerName);
            }
          }
        }
      }
      
      // Look for CPPF/CRE tickets in the segment
      const ticketPatterns = [
        /\b(CPPF-\d+)\b/gi,  // Standard CPPF tickets
        /\b(CRE-\d+)\b/gi,   // CRE tickets
        /\b([A-Z]{2,10}-\d+)\b/g // Any project key with ticket number
      ];
      
      const ticketsInSegment = [];
      for (const pattern of ticketPatterns) {
        const matches = segment.matchAll(pattern);
        for (const match of matches) {
          ticketsInSegment.push(match[1].toUpperCase());
        }
      }
      
      // If we found both engineers and tickets, create assignments (legacy format support)
      if (engineersInSegment.size > 0 && ticketsInSegment.length > 0) {
        for (const engineer of engineersInSegment) {
          if (!assignments[engineer]) {
            assignments[engineer] = [];
          }
          
          for (const ticketId of ticketsInSegment) {
            // Extract description around the ticket
            const ticketIndex = segment.toUpperCase().indexOf(ticketId);
            let description = '';
            
            if (ticketIndex >= 0) {
              // Get text around the ticket (before and after)
              const start = Math.max(0, ticketIndex - 100);
              const end = Math.min(segment.length, ticketIndex + ticketId.length + 100);
              description = segment.substring(start, end).trim();
              
              // Clean up the description
              description = description
                .replace(new RegExp(ticketId, 'gi'), '')
                .replace(/^[-–—:|\s]+/, '')
                .replace(/[-–—:|\s]+$/, '')
                .trim();
              
              // Limit description length
              if (description.length > 200) {
                description = description.substring(0, 200) + '...';
              }
            }
            
            // Check if this ticket is already assigned to this engineer
            const existingAssignment = assignments[engineer].find(task => task.ticketId === ticketId);
            if (!existingAssignment) {
              assignments[engineer].push({
                ticketId,
                description: description || 'No description'
              });
            }
          }
        }
      }
      
      // Also check for traditional engineer: task patterns (legacy support)
      const traditionalEngineerMatch = segment.match(/^([A-Za-z\s]+):(.*)$/);
      if (traditionalEngineerMatch) {
        const currentEngineer = traditionalEngineerMatch[1].trim();
        const taskContent = traditionalEngineerMatch[2].trim();
        
        if (!assignments[currentEngineer]) {
          assignments[currentEngineer] = [];
        }
        
        // Look for tickets in the task content
        for (const pattern of ticketPatterns) {
          const matches = taskContent.matchAll(pattern);
          for (const match of matches) {
            const ticketId = match[1].toUpperCase();
            let description = taskContent.replace(match[0], '').trim()
              .replace(/^[-–—:|\s]+/, '')
              .replace(/[-–—:|\s]+$/, '')
              .trim();
            
            assignments[currentEngineer].push({
              ticketId,
              description: description || 'No description'
            });
          }
        }
      }
    }
    
    // Filter out engineers with no assignments and deduplicate
    const filteredAssignments = {};
    for (const [engineer, tasks] of Object.entries(assignments)) {
      if (tasks && tasks.length > 0) {
        // Deduplicate tasks by ticket ID
        const uniqueTasks = [];
        const seenTickets = new Set();
        
        for (const task of tasks) {
          if (!seenTickets.has(task.ticketId)) {
            seenTickets.add(task.ticketId);
            uniqueTasks.push(task);
          }
        }
        
        if (uniqueTasks.length > 0) {
          filteredAssignments[engineer] = uniqueTasks;
        }
      }
    }
    
    return { success: true, data: filteredAssignments };
  } catch (error) {
    console.error('Error parsing sprint file:', error.message);
    return { success: false, error: error.message };
  }
}

export {
  detectPlatforms,
  extractRequirements,
  estimateComplexity,
  parseSprintFile,
  parseSprintPlanning
}; 