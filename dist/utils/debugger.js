/**
 * Debugging utilities for MCP server connections
 */

/**
 * Log connection details for debugging purposes
 * @param {Object} req - Express request object
 * @param {String} source - Connection source identifier (e.g., 'jsonrpc', 'sse')
 */
export function logConnectionDetails(req, source) {
  const headers = req.headers;
  const clientIp = req.ip || req.connection.remoteAddress;
  const userAgent = headers['user-agent'] || 'Unknown';
  
  console.error(`
========== CONNECTION DEBUG INFO (${source}) ==========
Time: ${new Date().toISOString()}
Client IP: ${clientIp}
User Agent: ${userAgent}
Content-Type: ${headers['content-type'] || 'Not provided'}
Accept: ${headers['accept'] || 'Not provided'}
Origin: ${headers['origin'] || 'Not provided'}
Method: ${req.method}
URL: ${req.url}
Query: ${JSON.stringify(req.query)}
=====================================================
`);
}

/**
 * Checks if the client is likely to be Cursor
 * @param {Object} req - Express request object
 * @returns {Boolean} - True if the client appears to be Cursor
 */
export function isCursorClient(req) {
  const userAgent = req.headers['user-agent'] || '';
  return userAgent.includes('Cursor') || 
         userAgent.includes('streamableHttp') ||
         (req.body && req.body.jsonrpc === '2.0');
}

/**
 * Trace request/response cycle for debugging
 * @param {String} requestId - Request ID
 * @param {Object} request - Request object
 * @param {Object} response - Response object
 */
export function traceRequestResponse(requestId, request, response) {
  console.error(`
========== REQUEST/RESPONSE TRACE ==========
Request ID: ${requestId}
Request: ${JSON.stringify(request).substring(0, 200)}...
Response: ${JSON.stringify(response).substring(0, 200)}...
===========================================
`);
}

/**
 * Connection diagnosis tool
 * @param {String} clientId - Client ID
 * @param {Object} res - Express response object
 */
export function diagnoseConnection(clientId, res) {
  let diagnosis = {
    clientId,
    timestamp: Date.now(),
    connectionState: res.writableEnded ? 'closed' : 'open',
    headers: res.getHeaders ? res.getHeaders() : 'Unknown',
    issues: []
  };
  
  // Check for common issues
  if (res.writableEnded) {
    diagnosis.issues.push('Connection already closed');
  }
  
  if (res.destroyed) {
    diagnosis.issues.push('Connection destroyed');
  }
  
  if (!res.headersSent) {
    diagnosis.issues.push('Headers not sent yet');
  }
  
  console.error(`Connection diagnosis for ${clientId}:`, diagnosis);
  return diagnosis;
}

export default {
  logConnectionDetails,
  isCursorClient,
  traceRequestResponse,
  diagnoseConnection
};
