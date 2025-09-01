import { ProjectDetector } from '../../parsers/project-detector.js';
import { JSONLParser } from '../../parsers/jsonl-parser.js';
import { AIInsightAnalyzer } from '../../analyzers/ai-insights.js';
import { UserPatternAnalyzer } from '../../analyzers/user-patterns.js';
import { ClaudeCodeAnalyzer } from '../../analyzers/claude-code-analysis.js';

interface AnalyzeOptions {
  deep?: boolean;
  recent?: boolean;
  aiPowered?: boolean;
  depth: string;
  confidence: string;
  debug?: boolean;
  debugMessages?: boolean;
  excludePatterns?: string;
  updateClaudeMd?: boolean;
  dryRun?: boolean;
}

export async function analyzeCommand(path: string | undefined, options: AnalyzeOptions) {
  try {
    if (options.debug) {
      await ProjectDetector.debugProjectDetection();
      return;
    }

    console.log('🧠 Starting conversation analysis for current project...\n');

    // Detect the project's Claude Code conversations
    const project = await ProjectDetector.detectCurrentProject(path);
    
    if (!project) {
      console.log('\n💡 Troubleshooting tips:');
      console.log('1. Make sure you are in a directory where you\'ve used Claude Code');
      console.log('2. Check that Claude Code has created conversation files');
      console.log('3. Run with --debug to see detection details');
      console.log('4. Use the "scan" command to see all available projects');
      process.exit(1);
    }

    console.log(`🎯 Match type: ${project.matchType}`);
    console.log(`📊 Found ${project.sessionCount} conversation sessions\n`);
    console.log(`📊 Analyzing project: ${project.name}`);

    const allMessages = [];
    const messageToSessionMap = new Map();
    let processedSessions = 0;

    // Limit sessions for recent mode
    const sessionsToAnalyze = options.recent ? 
      project.sessions.slice(0, 10) : 
      project.sessions;

    for (const session of sessionsToAnalyze) {
      const messages = JSONLParser.parseSessionFile(session.filePath);
      if (messages.length > 0) {
        // Track which session each message came from
        messages.forEach(msg => messageToSessionMap.set(msg, session.filePath));
        allMessages.push(...messages);
        processedSessions++;
        
        if (processedSessions % 5 === 0 || processedSessions === sessionsToAnalyze.length) {
          console.log(`Processed ${processedSessions}/${sessionsToAnalyze.length} sessions...`);
        }
      }
    }

    if (allMessages.length === 0) {
      console.log('No messages found to analyze');
      return;
    }

    const maxDepth = parseInt(options.depth);
    console.log(`\n🔍 Analyzing ${allMessages.length} messages (depth: ${maxDepth})...`);

    let insights, patterns;
    
    if (options.aiPowered) {
      // Use Claude Code SDK analysis (no API key required)
      console.log('🚀 Using Claude Code SDK for AI analysis...');
      const claudeAnalyzer = new ClaudeCodeAnalyzer();
      // Parse exclude patterns if provided
      const excludePatterns = options.excludePatterns ? 
        options.excludePatterns.split(',').map((p: string) => p.trim()) : 
        undefined;
        
      const aiResults = await claudeAnalyzer.analyzeConversation(allMessages, maxDepth, options.debugMessages, messageToSessionMap, excludePatterns);
      
      console.log('\n📊 AI Analysis Results:');
      console.log(`❌ Mistakes to avoid: ${aiResults.mistakes.length}`);
      console.log(`✅ Successful patterns: ${aiResults.successes.length}`);
      
      if (aiResults.mistakes.length > 0) {
        console.log('\n🚫 Top Mistakes to Avoid:');
        aiResults.mistakes.slice(0, 3).forEach((mistake, i) => {
          console.log(`  ${i + 1}. ${mistake.type}: ${mistake.lesson}`);
        });
      }
      
      if (aiResults.successes.length > 0) {
        console.log('\n✨ Successful Patterns:');
        aiResults.successes.slice(0, 3).forEach((success, i) => {
          console.log(`  ${i + 1}. ${success.type}: ${success.lesson}`);
        });
      }
      
      console.log('\n👤 User Profile:');
      console.log(`  OS: ${aiResults.userProfile.environment.os}`);
      console.log(`  Style: ${aiResults.userProfile.style.verbosity}, ${aiResults.userProfile.style.techLevel} level`);
      
      if (aiResults.recommendations.length > 0) {
        console.log('\n💡 Recommendations for Future Sessions:');
        aiResults.recommendations.forEach((rec, i) => {
          console.log(`  ${i + 1}. ${rec}`);
        });
      }
      
      // For backward compatibility with export, create dummy data
      insights = [];
      patterns = [];

    } else {
      // Use regular pattern-matching analysis
      console.log('🔍 Using pattern-matching analysis...');
      const allInsights = AIInsightAnalyzer.analyzeConversation(allMessages.slice(-maxDepth));
      const confidenceThreshold = parseFloat(options.confidence);
      insights = AIInsightAnalyzer.filterByConfidence(allInsights, confidenceThreshold);
      patterns = UserPatternAnalyzer.analyzeUserPatterns(allMessages.slice(-maxDepth));

      // Display pattern-matching results
      console.log('\n📈 Pattern-Matching Analysis Results:');
      console.log(`AI Insights found: ${insights.length} (confidence ≥ ${options.confidence})`);
      console.log(`User Patterns found: ${patterns.length}`);

      if (insights.length > 0) {
        const insightTypes = insights.reduce((acc, insight) => {
          acc[insight.type] = (acc[insight.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        console.log('\n🧠 Top AI Insights:');
        Object.entries(insightTypes)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .forEach(([type, count]) => {
            console.log(`  ${type}: ${count} instances`);
          });
      }

      if (patterns.length > 0) {
        console.log('\n👤 Top User Patterns:');
        patterns.slice(0, 3).forEach(pattern => {
          console.log(`  ${pattern.type}: ${pattern.pattern} (${pattern.frequency}x)`);
        });
      }
    }

    console.log(`\nUse export commands to generate detailed reports.`);
    
  } catch (error) {
    console.error('Analysis failed:', error);
    process.exit(1);
  }
}