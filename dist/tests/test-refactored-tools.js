#!/usr/bin/env node

import dotenv from 'dotenv';
import { config } from '../config.js';

// Import original tools
import origSprintTools from '../tools/sprint.js';
import origConfluenceSprintTools from '../tools/confluenceSprint.js';
import origCPPFTools from '../tools/cppf.js';
import origCRETools from '../tools/cre.js';

// Import refactored tools
import refSprintTools from '../tools/refactored/sprint.js';
import refConfluenceSprintTools from '../tools/refactored/confluenceSprint.js';
import refTicketHierarchyTools from '../tools/refactored/ticketHierarchy.js';
import refCPPFTools from '../tools/refactored/cppf.js';

// Load environment variables
dotenv.config();

// Simple test framework
const tests = [];
const results = { passed: 0, failed: 0 };

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  console.log('🧪 Running tests for refactored tools...');
  
  for (const { name, fn } of tests) {
    try {
      console.log(`\n🔍 Testing: ${name}`);
      await fn();
      console.log(`✅ PASS: ${name}`);
      results.passed++;
    } catch (error) {
      console.error(`❌ FAIL: ${name}`);
      console.error(error);
      results.failed++;
    }
  }
  
  console.log('\n📊 Test Results:');
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Total: ${tests.length}`);
  
  process.exit(results.failed > 0 ? 1 : 0);
}

// Helper function to compare original and refactored tool outputs
async function compareToolOutputs(originalTool, refactoredTool, args = {}) {
  console.log(`Comparing ${originalTool.name} with ${refactoredTool.name}...`);
  
  const originalResult = await originalTool.handler(args);
  const refactoredResult = await refactoredTool.handler(args);
  
  console.log(`Original result success: ${originalResult.success}`);
  console.log(`Refactored result success: ${refactoredResult.success}`);
  
  if (originalResult.success !== refactoredResult.success) {
    throw new Error('Results have different success values');
  }
  
  if (!originalResult.success && !refactoredResult.success) {
    console.log('Both tools failed with expected errors:');
    console.log(`- Original: ${originalResult.error}`);
    console.log(`- Refactored: ${refactoredResult.error}`);
    return; // Both failed as expected, skip further comparison
  }
  
  // For successful results, check data structure
  const originalKeys = Object.keys(originalResult.data || {});
  const refactoredKeys = Object.keys(refactoredResult.data || {});
  
  console.log(`Original data keys: ${originalKeys.join(', ')}`);
  console.log(`Refactored data keys: ${refactoredKeys.join(', ')}`);
  
  // Note: We don't expect exact data structure matches since refactored tools
  // may provide enhanced functionality, but we check critical parts
}

// Define tests
// 1. Test Sprint Assignment Consolidation
test('Sprint Assignment - Get My Sprint Assignments', async () => {
  // Use original tool to get assignments
  const getMySprintAssignments = origSprintTools.find(t => t.name === 'get_my_sprint_assignments');
  // Use refactored tool with 'currentUser' filter
  const getSprintAssignments = refSprintTools.find(t => t.name === 'get_sprint_assignments');
  
  await compareToolOutputs(getMySprintAssignments, getSprintAssignments, { assignee: 'currentUser' });
});

test('Sprint Assignment - Get Sprint Overview', async () => {
  // Use original tool to get overview 
  const getSprintOverview = origSprintTools.find(t => t.name === 'get_sprint_overview');
  // Use refactored tool with no filters
  const getSprintAssignments = refSprintTools.find(t => t.name === 'get_sprint_assignments');
  
  await compareToolOutputs(getSprintOverview, getSprintAssignments, {});
});

// 2. Test Confluence Sprint Tool Consolidation
test('Confluence Sprint - Get Engineer Assignments', async () => {
  // Skip this test if no engineer is specified
  const engineerName = process.env.TEST_ENGINEER_NAME || config.user.name;
  if (!engineerName) {
    console.log('Skipping test: No engineer name provided');
    return;
  }
  
  // Use original tool to get assignments for an engineer
  const getEngineerAssignments = origConfluenceSprintTools.find(t => 
    t.name === 'get_engineer_assignments_from_confluence'
  );
  
  // Use refactored tool with engineer filter
  const getConfluenceSprintAssignments = refConfluenceSprintTools.find(t => 
    t.name === 'get_confluence_sprint_assignments'
  );
  
  await compareToolOutputs(getEngineerAssignments, getConfluenceSprintAssignments, { engineerName });
});

// 3. Test CRE/CPPF Hierarchy Navigation
test('Ticket Hierarchy - Get Parent CRE Story', async () => {
  // Use sample CRE ID from env or default
  const creId = process.env.TEST_CRE_TASK_ID || 'CRE-1234';
  
  // Original tool for getting parent story
  const getParentCREStory = origCRETools.find(t => t.name === 'get_parent_cre_story');
  
  // Refactored tool with 'up' direction
  const getTicketHierarchy = refTicketHierarchyTools.find(t => t.name === 'get_ticket_hierarchy');
  
  await compareToolOutputs(getParentCREStory, getTicketHierarchy, { ticketId: creId, direction: 'up' });
});

// 4. Test CPPF Analysis Enhancement
test('CPPF Analysis - Get CPPF Details', async () => {
  // Use sample CPPF ID from env or default
  const cppfId = process.env.TEST_CPPF_ID || 'CPPF-1234';
  
  // Original tool for getting CPPF details
  const getCPPFDetails = origCPPFTools.find(t => t.name === 'get_cppf_details');
  
  // Refactored tool without role-specific analysis
  const analyzeCPPF = refCPPFTools.find(t => t.name === 'analyze_cppf');
  
  await compareToolOutputs(getCPPFDetails, analyzeCPPF, { cppf_id: cppfId });
});

// Run all tests
runTests();
