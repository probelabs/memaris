#!/usr/bin/env node

import { ProjectDetector } from './src/parsers/project-detector.js';
import { JSONLParser } from './src/parsers/jsonl-parser.js';
import { AIInsightAnalyzer } from './src/analyzers/ai-insights.js';

async function testAnalysis() {
  console.log('🧪 Testing Simple Analysis...\n');
  
  const project = await ProjectDetector.detectCurrentProject();
  
  if (!project) {
    console.log('No project found');
    return;
  }

  console.log(`📊 Analyzing ${project.name} with ${project.sessionCount} sessions`);
  
  // Get recent 5 sessions
  const recentSessions = project.sessions.slice(0, 5);
  console.log(`📝 Loading ${recentSessions.length} recent sessions...`);
  
  const allMessages = [];
  let totalMessages = 0;
  
  for (const session of recentSessions) {
    const messages = JSONLParser.parseSessionFile(session.filePath);
    allMessages.push(...messages);
    totalMessages += messages.length;
    console.log(`  Session ${session.id.slice(0, 8)}: ${messages.length} messages`);
  }
  
  console.log(`\n🔍 Analyzing ${totalMessages} messages (last 20)...`);
  
  // Analyze only last 20 messages for quick test
  const recentMessages = allMessages.slice(-20);
  const insights = AIInsightAnalyzer.analyzeConversation(recentMessages);
  const highConfidenceInsights = insights.filter(i => i.confidence > 0.5);
  
  console.log(`\n📊 Results:`);
  console.log(`Total insights: ${insights.length}`);
  console.log(`High confidence: ${highConfidenceInsights.length}`);
  
  if (highConfidenceInsights.length > 0) {
    console.log('\n🧠 Top Insights:');
    highConfidenceInsights.slice(0, 3).forEach((insight, i) => {
      console.log(`  ${i + 1}. [${insight.type}] ${insight.content}`);
      console.log(`     Context: ${insight.context.slice(0, 100)}...`);
      console.log(`     Confidence: ${(insight.confidence * 100).toFixed(0)}%\n`);
    });
  }
}

testAnalysis().catch(console.error);