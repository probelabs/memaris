#!/usr/bin/env node

import { ProjectDetector } from './src/parsers/project-detector.js';

async function test() {
  console.log('🧪 Testing Project Detector...\n');
  
  // Test debug mode first
  await ProjectDetector.debugProjectDetection();
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test actual detection
  const project = await ProjectDetector.detectCurrentProject();
  
  if (project) {
    console.log('✅ Detection successful!');
    console.log(`Project: ${project.name}`);
    console.log(`Sessions: ${project.sessionCount}`);
    console.log(`Match type: ${project.matchType}`);
    console.log(`Recent activity score: ${project.recentActivity}`);
  } else {
    console.log('❌ No project detected');
  }
}

test().catch(console.error);