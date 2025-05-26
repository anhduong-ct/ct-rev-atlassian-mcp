import axios from 'axios';
import { config } from '../config.js';

class JiraService {
  constructor() {
    this.baseUrl = `${config.jira.host}/rest/api/3`;
    this.auth = {
      username: config.jira.email,
      password: config.jira.apiToken
    };
    this.headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  async getIssue(issueKey) {
    try {
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
      return { 
        success: false, 
        error: error.response?.data?.errorMessages || error.message 
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

  async searchIssues(jql, fields = ['summary', 'status', 'assignee', 'description'], startAt = 0, maxResults = 50) {
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
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/issue/${issueKey}/transitions`,
        auth: this.auth,
        headers: this.headers,
        data: {
          transition: { id: transitionId },
          fields
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

  async getSprintContext(projectKey = null) {
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

      const board = scrumBoards[0]; // Use the first scrum board
      
      // Get all sprints for this board
      const allSprintsResponse = await this.getSprints(board.id);
      if (!allSprintsResponse.success) {
        return allSprintsResponse;
      }

      const allSprints = allSprintsResponse.data.values;
      
      // Sort sprints by start date (most recent first)
      const sortedSprints = allSprints.sort((a, b) => {
        const dateA = a.startDate ? new Date(a.startDate) : new Date(0);
        const dateB = b.startDate ? new Date(b.startDate) : new Date(0);
        return dateB - dateA;
      });

      // Find current, previous, and next sprints
      const currentSprint = sortedSprints.find(sprint => sprint.state === 'active');
      const closedSprints = sortedSprints.filter(sprint => sprint.state === 'closed');
      const futureSprints = sortedSprints.filter(sprint => sprint.state === 'future');

      const previousSprint = closedSprints.length > 0 ? closedSprints[0] : null;
      const nextSprint = futureSprints.length > 0 ? futureSprints[futureSprints.length - 1] : null;

      return {
        success: true,
        data: {
          current: currentSprint,
          previous: previousSprint,
          next: nextSprint,
          board: board,
          allSprints: sortedSprints
        }
      };
    } catch (error) {
      console.error('Error getting sprint context:', error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
}

export default new JiraService(); 