import axios from 'axios';
import { config } from '../config.js';

class ConfluenceService {
  constructor() {
    // Properly construct the base URL, handling cases where host may or may not include protocol
    const cleanHost = config.confluence.host
      .replace(/^https?:\/\//, '') // Remove any existing protocol
      .replace(/\/$/, ''); // Remove trailing slash
    
    this.baseUrl = `https://${cleanHost}/wiki/rest/api`;
    this.auth = {
      username: config.jira.email,
      password: config.jira.apiToken
    };
    this.headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  async getPage(pageId) {
    try {
      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/content/${pageId}`,
        auth: this.auth,
        headers: this.headers,
        params: {
          expand: 'body.storage,version,space,ancestors,children.page,descendants.page'
        }
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || error.message 
      };
    }
  }

  async searchContent(query, spaceKey = null, type = 'page', limit = 20) {
    try {
      let cql;
      
      // Build CQL query properly
      if (spaceKey) {
        cql = `type=${type} AND space="${spaceKey}" AND (${query})`;
      } else {
        cql = `type=${type} AND (${query})`;
      }
      
      const params = {
        cql,
        limit,
        expand: 'body.storage,version,space'
      };

      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/content/search`,
        auth: this.auth,
        headers: this.headers,
        params
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || error.message 
      };
    }
  }

  async searchByLabels(labels, spaceKey = null, limit = 20) {
    if (!Array.isArray(labels) || labels.length === 0) {
      return { success: false, error: 'Labels must be a non-empty array' };
    }

    try {
      const labelQuery = labels.map(label => `labelText ~ "${label}"`).join(' AND ');
      const cql = `type=page AND ${labelQuery}${spaceKey ? ` AND space="${spaceKey}"` : ''}`;
      
      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/content/search`,
        auth: this.auth,
        headers: this.headers,
        params: {
          cql,
          limit,
          expand: 'body.storage,version,space'
        }
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || error.message 
      };
    }
  }

  async getPagesBySpaceKey(spaceKey, limit = 50, start = 0) {
    try {
      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/content`,
        auth: this.auth,
        headers: this.headers,
        params: {
          spaceKey,
          type: 'page',
          limit,
          start,
          expand: 'body.storage,version,space'
        }
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || error.message 
      };
    }
  }

  async getChildPages(pageId) {
    try {
      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/content/${pageId}/child/page`,
        auth: this.auth,
        headers: this.headers,
        params: {
          expand: 'body.storage,version,space'
        }
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || error.message 
      };
    }
  }

  async getAttachments(pageId) {
    try {
      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/content/${pageId}/child/attachment`,
        auth: this.auth,
        headers: this.headers
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || error.message 
      };
    }
  }

  async searchAllSpaces(query, limit = 100) {
    try {
      const results = [];
      
      for (const space of config.confluence.spaces) {
        const response = await this.searchContent(query, space, 'page', limit);
        if (response.success && response.data.results) {
          results.push(...response.data.results);
        }
      }
      
      return { success: true, data: { results } };
    } catch (error) {
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
}

export default new ConfluenceService(); 