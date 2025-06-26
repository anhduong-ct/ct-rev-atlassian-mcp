import axios from 'axios';
import { config } from '../config.js';
import credentialsManager from './credentialsManager.js';

class JiraService {
  constructor() {
    this.baseUrl = `${config.jira.host}/rest/api/3`;
    this.headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }
  
  // Get current auth credentials - check at runtime to allow dynamic updates
  get auth() {
    return {
      username: config.jira.email,
      password: config.jira.apiToken
    };
  }
  
  // Check if required credentials are available
  checkCredentials() {
    if (!config.jira.email || !config.jira.apiToken) {
      throw new Error(
        'Jira credentials not configured. Please use the set_credentials tool first.'
      );
    }
  }

  async getIssue(issueKey) {
    try {
      // Check if credentials are available
      this.checkCredentials();
      
      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/issue/${issueKey}`,
        auth: this.auth,
        headers: this.headers,
        params: {
          expand: 'renderedFields,names,schema,transitions,operations,editmeta,changelog,issuelinks'
        }
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`Error getting issue ${issueKey}:`, error.message);
      return { 
        success: false, 
        error: error.response?.data?.errorMessages || error.message 
      };
    }
  }

  async createIssue(issueData) {
    try {
      // Get the project's metadata to validate the issue creation
      // const projectKey = issueData.fields?.project?.key;
      // if (projectKey) {
      //   const metaResponse = await this.getCreateMeta(projectKey);
      //   if (metaResponse.success) {
      //     console.log('Available fields:', JSON.stringify(metaResponse.data, null, 2));
      //   }
      // }

      // Log the request data for debugging
      // console.log('Creating issue with data:', JSON.stringify(issueData, null, 2));

      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/issue`,
        auth: this.auth,
        headers: this.headers,
        data: issueData
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Error creating issue:', error.message);
      // Log detailed error response for debugging
      if (error.response?.data) {
        console.error('Detailed error response:', JSON.stringify(error.response.data, null, 2));
      }
      return { 
        success: false, 
        error: error.response?.data?.errors || error.response?.data?.errorMessages || error.message 
      };
    }
  }

  async getCreateMeta(projectKey) {
    try {
      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/issue/createmeta`,
        auth: this.auth,
        headers: this.headers,
        params: {
          projectKeys: projectKey,
          expand: 'projects.issuetypes.fields'
        }
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Error getting create metadata:', error.message);
      return { 
        success: false, 
        error: error.response?.data?.errorMessages || error.message 
      };
    }
  }

  async updateIssue(issueKey, issueData) {
    try {
      const response = await axios({
        method: 'PUT',
        url: `${this.baseUrl}/issue/${issueKey}`,
        auth: this.auth,
        headers: this.headers,
        data: issueData
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`Error updating issue ${issueKey}:`, error.message);
      // Log detailed error response for debugging
      if (error.response?.data) {
        console.error('Detailed error response:', JSON.stringify(error.response.data, null, 2));
      }
      return { 
        success: false, 
        error: error.response?.data?.errors || error.response?.data?.errorMessages || error.message 
      };
    }
  }

  async addComment(issueKey, comment) {
    try {
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/issue/${issueKey}/comment`,
        auth: this.auth,
        headers: this.headers,
        data: {
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: comment
                  }
                ]
              }
            ]
          }
        }
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`Error adding comment to ${issueKey}:`, error.message);
      return { 
        success: false, 
        error: error.response?.data?.errorMessages || error.message 
      };
    }
  }

  async searchIssues(jql, fields = ['summary', 'status', 'assignee', 'description', 'issuetype'], startAt = 0, maxResults = 50) {
    try {
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/search`,
        auth: this.auth,
        headers: this.headers,
        data: {
          jql,
          startAt,
          maxResults,
          fields
        }
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Error searching issues:', error.message);
      return { 
        success: false, 
        error: error.response?.data?.errorMessages || error.message 
      };
    }
  }

  async getTransitions(issueKey) {
    try {
      this.checkCredentials();
      
      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/issue/${issueKey}/transitions`,
        auth: this.auth,
        headers: this.headers
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`Error getting transitions for ${issueKey}:`, error.message);
      return { 
        success: false, 
        error: error.response?.data?.errorMessages || error.message 
      };
    }
  }

  async transitionIssue(issueKey, transitionId, fields = {}) {
    try {
      this.checkCredentials();
      
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/issue/${issueKey}/transitions`,
        auth: this.auth,
        headers: this.headers,
        data: {
          transition: { id: transitionId },
          fields: fields
        }
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`Error transitioning issue ${issueKey}:`, error.message);
      return { 
        success: false, 
        error: error.response?.data?.errorMessages || error.message 
      };
    }
  }

  async searchUsers(query) {
    try {
      this.checkCredentials();
      
      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/user/search`,
        auth: this.auth,
        headers: this.headers,
        params: {
          query: query,
          maxResults: 50
        }
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`Error searching users with query "${query}":`, error.message);
      return { 
        success: false, 
        error: error.response?.data?.errorMessages || error.message 
      };
    }
  }

  async getIssueLinks(issueKey) {
    try {
      const response = await this.getIssue(issueKey);
      if (!response.success) {
        return response;
      }
      
      const links = response.data.fields.issuelinks || [];
      return { success: true, data: links };
    } catch (error) {
      console.error(`Error getting issue links for ${issueKey}:`, error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async createIssueLink(inwardIssueKey, outwardIssueKey, linkType = 'Relates') {
    try {
      // First verify both issues exist
      const [inwardResponse, outwardResponse] = await Promise.all([
        this.getIssue(inwardIssueKey),
        this.getIssue(outwardIssueKey)
      ]);

      if (!inwardResponse.success) {
        console.error(`Inward issue ${inwardIssueKey} not found:`, inwardResponse.error);
        return inwardResponse;
      }
      if (!outwardResponse.success) {
        console.error(`Outward issue ${outwardIssueKey} not found:`, outwardResponse.error);
        return outwardResponse;
      }

      // Get available link types
      const linkTypesResponse = await this.getIssueLinkTypes();
      if (linkTypesResponse.success) {
        const availableTypes = linkTypesResponse.data.issueLinkTypes;
        console.log('Available link types:', availableTypes.map(t => 
          `${t.name} (inward: ${t.inward}, outward: ${t.outward})`).join(', '));
        // Try to find the requested link type, prioritizing exact match
        let matchingType = availableTypes.find(t => t.name === linkType);

        // If no exact match, look for case-insensitive variations
        if (!matchingType) {
          matchingType = availableTypes.find(t => 
            t.name.toLowerCase() === linkType.toLowerCase() ||
            (t.inward.toLowerCase().includes(linkType.toLowerCase()) && t.outward.toLowerCase().includes(linkType.toLowerCase()))
          );
        }
        
        if (matchingType) {
          console.log(`Found matching link type: ${matchingType.name} (inward: ${matchingType.inward}, outward: ${matchingType.outward})`);
          linkType = matchingType.name;
        } else {
          console.log(`No exact match found for "Relates" type, using as-is`);
        }
      }

      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/issueLink`,
        auth: this.auth,
        headers: this.headers,
        data: {
          type: {
            name: linkType
          },
          inwardIssue: {
            key: inwardIssueKey
          },
          outwardIssue: {
            key: outwardIssueKey
          }
        }
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`Error creating issue link between ${inwardIssueKey} and ${outwardIssueKey}:`, error.message);
      return { 
        success: false, 
        error: error.response?.data?.errorMessages || error.message 
      };
    }
  }

  async getIssueChangeLog(issueKey) {
    try {
      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/issue/${issueKey}/changelog`,
        auth: this.auth,
        headers: this.headers
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`Error getting changelog for ${issueKey}:`, error.message);
      return { 
        success: false, 
        error: error.response?.data?.errorMessages || error.message 
      };
    }
  }

  async getBoards(projectKeyOrId) {
    try {
      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl.replace('/rest/api/3', '/rest/agile/1.0')}/board`,
        auth: this.auth,
        headers: this.headers,
        params: {
          projectKeyOrId
        }
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`Error getting boards for ${projectKeyOrId}:`, error.message);
      return { 
        success: false, 
        error: error.response?.data?.message || error.message 
      };
    }
  }

  async getSprints(boardId, state = null) {
    try {
      const params = { maxResults: 50 };
      if (state) {
        params.state = state;
      }
      
      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl.replace('/rest/api/3', '/rest/agile/1.0')}/board/${boardId}/sprint`,
        auth: this.auth,
        headers: this.headers,
        params
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`Error getting sprints for board ${boardId}:`, error.message);
      return { 
        success: false, 
        error: error.response?.data?.message || error.message 
      };
    }
  }

  async getSprint(sprintId) {
    try {
      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl.replace('/rest/api/3', '/rest/agile/1.0')}/sprint/${sprintId}`,
        auth: this.auth,
        headers: this.headers
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`Error getting sprint ${sprintId}:`, error.message);
      return { 
        success: false, 
        error: error.response?.data?.message || error.message 
      };
    }
  }

  async getCurrentSprint(projectKey = null) {
    try {
      const project = projectKey || config.jira.projects.cre;
      
      // Get all boards for the project
      const boardsResponse = await this.getBoards(project);
      if (!boardsResponse.success) {
        return boardsResponse;
      }

      // Find scrum boards
      const scrumBoards = boardsResponse.data.values.filter(
        board => board.type === 'scrum'
      );

      if (scrumBoards.length === 0) {
        return {
          success: false,
          error: 'No scrum boards found for the project'
        };
      }

      // Check each board for active sprints
      for (const board of scrumBoards) {
        const sprintsResponse = await this.getSprints(board.id, 'active');
        
        if (sprintsResponse.success && sprintsResponse.data.values.length > 0) {
          const activeSprint = sprintsResponse.data.values[0]; // Get the first active sprint
          return {
            success: true,
            data: {
              sprint: activeSprint,
              board: board
            }
          };
        }
      }

      return {
        success: false,
        error: 'No active sprint found'
      };
    } catch (error) {
      console.error('Error getting current sprint:', error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async searchSprintsByName(sprintName, projectKey = null) {
    try {
      this.checkCredentials();
      
      const project = projectKey || config.jira.projects.cre;
      
      // Use Greenhopper sprint picker API for efficient sprint search
      const response = await axios({
        method: 'GET',
        url: `${config.jira.host}/rest/greenhopper/1.0/sprint/picker`,
        auth: this.auth,
        headers: this.headers,
        params: {
          query: sprintName || '', // Search query (can be empty to get all)
          maxResults: 50,
          maxActiveSprints: 10,
          projectKey: project
        }
      });

      if (!response.data) {
        return {
          success: false,
          error: 'No data returned from sprint picker API'
        };
      }

      // Get all sprints from the suggestions array
      const allSprints = [
        ...(response.data.suggestions || []),
        ...(response.data.allMatches || [])
      ];

      // Filter sprints by name if a specific name was provided
      let matchingSprints = allSprints;
      if (sprintName) {
        matchingSprints = allSprints.filter(sprint => 
          sprint.name && sprint.name.toLowerCase().includes(sprintName.toLowerCase())
        );
      }

      if (matchingSprints.length === 0) {
        return {
          success: false,
          error: `No sprints found matching name: ${sprintName}`
        };
      }

      // Convert to consistent format and sort by state
      const formattedSprints = matchingSprints.map(sprint => ({
        id: sprint.id,
        name: sprint.name,
        state: sprint.stateKey ? sprint.stateKey.toLowerCase() : 'unknown',
        boardName: sprint.boardName,
        projectKeys: sprint.projectKeys,
        // Add additional fields if available
        date: sprint.date
      }));

      // Sort by state priority (active first, then future, then closed)
      const stateOrder = { active: 0, future: 1, closed: 2, unknown: 3 };
      formattedSprints.sort((a, b) => {
        const stateCompare = (stateOrder[a.state] || 4) - (stateOrder[b.state] || 4);
        if (stateCompare !== 0) return stateCompare;
        return a.name.localeCompare(b.name);
      });

      return {
        success: true,
        data: {
          sprints: formattedSprints,
          total: formattedSprints.length
        }
      };
    } catch (error) {
      console.error(`Error searching sprints by name ${sprintName}:`, error.message);
      return { 
        success: false, 
        error: error.response?.data?.message || error.message 
      };
    }
  }

  async getIssueLinkTypes() {
    try {
      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/issueLinkType`,
        auth: this.auth,
        headers: this.headers
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Error getting issue link types:', error.message);
      return { 
        success: false, 
        error: error.response?.data?.errorMessages || error.message 
      };
    }
  }
}

export default new JiraService();