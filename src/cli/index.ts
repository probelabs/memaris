#!/usr/bin/env node

import { Command } from 'commander';
import { ProjectDiscovery } from '../parsers/project-discovery.js';
import { ProjectDetector } from '../parsers/project-detector.js';
import { JSONLParser } from '../parsers/jsonl-parser.js';
import { AIInsightAnalyzer } from '../analyzers/ai-insights.js';
import { UserPatternAnalyzer } from '../analyzers/user-patterns.js';
import { ClaudeCodeAnalyzer } from '../analyzers/claude-code-analysis.js';
import { ReportExporter } from '../exporters/report-generator.js';
import type { AnalysisConfig, ClaudeMessage, AnalysisReport } from '../types/index.js';
import { query } from '@anthropic-ai/claude-code';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

async function updateClaudeMd(projectPath: string, analysisResults: any, dryRun: boolean = false): Promise<void> {
  const claudeMdPath = join(resolve(projectPath), 'CLAUDE.md');
  
  if (dryRun) {
    console.log('\n👁️  Dry run: Showing proposed CLAUDE.md changes...');
  } else {
    console.log('\n📝 Updating CLAUDE.md with analysis recommendations...');
  }
  
  // Read existing CLAUDE.md content if it exists
  let existingContent = '';
  if (existsSync(claudeMdPath)) {
    existingContent = readFileSync(claudeMdPath, 'utf-8');
  }

  // Create prompt for Claude Code SDK to update CLAUDE.md
  const updatePrompt = `
You are updating a CLAUDE.md file for a software project based on conversation analysis insights.

<current-claude-md>
${existingContent || '[File does not exist yet]'}
</current-claude-md>

<analysis-results>
${JSON.stringify(analysisResults, null, 2)}
</analysis-results>

<task>
Based on the analysis of this user's conversation patterns, create or update the CLAUDE.md file to include:

1. Keep any existing project-specific instructions intact
2. Add a new section called "## AI Interaction Guidelines" (or update if it exists)
3. Include the most important recommendations from the analysis
4. Focus on actionable instructions that will help future AI sessions work better with this user
5. Write in a clear, concise style suitable for AI consumption

The updated content should:
- Preserve any existing project setup, build instructions, or domain knowledge
- Add specific guidance about this user's preferences and boundaries
- Include environment-specific considerations (OS: ${analysisResults.userProfile.environment.os})
- Mention communication style preferences (${analysisResults.userProfile.style.verbosity}, ${analysisResults.userProfile.style.techLevel} level)
- Include the most critical "mistakes to avoid" as specific instructions
</task>

<output-rules>
Return ONLY the complete CLAUDE.md file content. No explanations, no markdown code blocks, just the raw file content.
</output-rules>
`;

  try {
    console.log('🤖 Generating CLAUDE.md updates...');
    
    const response = query({
      prompt: updatePrompt,
      options: {
        allowedTools: [],
        maxTurns: 1,
        model: 'claude-sonnet-4-20250514',
        pathToClaudeCodeExecutable: '/Users/leonidbugaev/.local/bin/claude'
      }
    });

    let result = '';
    for await (const message of response) {
      if (message.type === 'assistant' && message.message?.content) {
        const content = message.message.content;
        if (typeof content === 'string') {
          result += content;
        } else if (Array.isArray(content)) {
          result += content.map(block => {
            if (typeof block === 'string') return block;
            if (block.type === 'text') return block.text || '';
            return '';
          }).join('');
        }
      }
    }

    if (dryRun) {
      // Show the proposed changes instead of writing
      console.log('\n📄 Proposed CLAUDE.md content:');
      console.log('─'.repeat(80));
      console.log(result);
      console.log('─'.repeat(80));
      console.log(`💡 Dry run complete. File NOT modified: ${claudeMdPath}`);
      console.log('   Run without --dry-run to apply these changes.');
    } else {
      // Write the updated CLAUDE.md
      writeFileSync(claudeMdPath, result, 'utf-8');
      console.log(`✅ CLAUDE.md updated successfully at: ${claudeMdPath}`);
    }
    
  } catch (error) {
    console.error('❌ Failed to update CLAUDE.md:', error);
    throw error;
  }
}

const program = new Command();

program
  .name('mnemaris')
  .description('Analyze Claude Code conversation history to extract AI insights and user patterns')
  .version('1.0.0');

program
  .command('scan')
  .description('Discover and rank all Claude Code projects by activity')
  .action(async () => {
    try {
      console.log('🔍 Discovering Claude Code projects...\n');
      
      const projects = await ProjectDiscovery.discoverProjects();
      
      if (projects.length === 0) {
        console.log('No Claude Code projects found in ~/.claude/projects/');
        return;
      }

      console.log(`Found ${projects.length} projects:\n`);
      
      projects.forEach((project, index) => {
        const lastActivity = new Date(project.lastModified).toLocaleDateString();
        console.log(`${index + 1}. ${project.name}`);
        console.log(`   Sessions: ${project.sessionCount} | Last active: ${lastActivity}`);
        console.log(`   Activity score: ${project.recentActivity.toFixed(0)}\n`);
      });

      console.log('Use "mnemaris analyze <project-name>" to analyze a specific project');
      console.log('Use "mnemaris analyze-all --recent" to analyze recent projects');
    } catch (error) {
      console.error('Failed to scan projects:', error);
      process.exit(1);
    }
  });

program
  .command('analyze')
  .argument('[path]', 'Path to project directory (defaults to current directory)')
  .description('Analyze Claude Code conversations for the specified or current project directory')
  .option('--deep', 'Perform deep analysis of all sessions')
  .option('--recent', 'Focus on recent sessions only') 
  .option('--ai-powered', 'Use AI-powered analysis with Claude (requires ANTHROPIC_API_KEY)')
  .option('--depth <number>', 'Maximum number of messages to analyze (default: 100)', '100')
  .option('--confidence <threshold>', 'Minimum confidence threshold for insights (0-1)', '0.5')
  .option('--debug', 'Show debug information about project detection')
  .option('--debug-messages', 'Show debug information for large messages (>1000 tokens)')
  .option('--exclude-patterns <patterns>', 'Comma-separated patterns to exclude sessions (e.g. "TASK:,You are analyzing")')
  .option('--update-claude-md', 'Update CLAUDE.md with analysis recommendations using Claude Code SDK')
  .option('--dry-run', 'Show proposed CLAUDE.md changes without writing them (requires --update-claude-md)')
  .action(async (path, options) => {
    try {
      if (options.debug) {
        await ProjectDetector.debugProjectDetection();
        return;
      }

      // Validate dry-run usage
      if (options.dryRun && !options.updateClaudeMd) {
        console.error('❌ Error: --dry-run can only be used with --update-claude-md');
        process.exit(1);
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

      const allMessages: ClaudeMessage[] = [];
      const messageToSessionMap = new Map<ClaudeMessage, string>();
      let processedSessions = 0;

      // Limit sessions for recent mode
      const sessionsToAnalyze = options.recent ? 
        project.sessions.slice(0, 10) : 
        project.sessions;

      for (const session of sessionsToAnalyze) {
        console.log(`📄 Processing: ${session.filePath}`);
        const messages = JSONLParser.parseSessionFile(session.filePath);
        if (messages.length > 0) {
          // Track which session each message came from
          messages.forEach(msg => messageToSessionMap.set(msg, session.filePath));
          allMessages.push(...messages);
          processedSessions++;
          console.log(`   ✅ Found ${messages.length} messages`);
          
          if (processedSessions % 5 === 0 || processedSessions === sessionsToAnalyze.length) {
            console.log(`Processed ${processedSessions}/${sessionsToAnalyze.length} sessions...`);
          }
        } else {
          console.log(`   ⚠️ No messages found`);
        }
      }

      if (allMessages.length === 0) {
        console.log('No messages found to analyze');
        return;
      }

      const maxDepth = parseInt(options.depth);
      console.log(`\n🔍 Analyzing ${allMessages.length} messages (depth: ${maxDepth})...`);

      let insights: any[] = [];
      let patterns: any[] = [];
        
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
          
          // Update CLAUDE.md if requested
          if (options.updateClaudeMd) {
            await updateClaudeMd(path || process.cwd(), aiResults, options.dryRun);
          }
          
          // For backward compatibility with export, create dummy insights/patterns
          insights = [];
          patterns = [];

        } else {
          // Use regular pattern-matching analysis
          console.log('🔍 Using pattern-matching analysis...');
          const allInsights = AIInsightAnalyzer.analyzeConversation(allMessages.slice(-maxDepth));
          const confidenceThreshold = parseFloat(options.confidence);
          insights = AIInsightAnalyzer.filterByConfidence(allInsights, confidenceThreshold);
          patterns = UserPatternAnalyzer.analyzeUserPatterns(allMessages.slice(-maxDepth));
        }

        // For non-AI-powered analysis, show traditional results
        if (!options.aiPowered) {
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
              .sort(([,a], [,b]) => (b as number) - (a as number))
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
  });

program
  .command('analyze-all')
  .description('Analyze all projects')
  .option('--recent', 'Focus on recently active projects only')
  .option('--limit <number>', 'Maximum number of projects to analyze', '10')
  .action(async (options) => {
    try {
      const limit = parseInt(options.limit);
      console.log(`🔄 Analyzing ${options.recent ? 'recent' : 'all'} projects (limit: ${limit})...\n`);
      
      const projects = await ProjectDiscovery.discoverProjects();
      const projectsToAnalyze = projects.slice(0, limit);

      for (const project of projectsToAnalyze) {
        console.log(`\n📊 Quick analysis: ${project.name}`);
        
        // Analyze only recent sessions for overview
        const recentSessions = project.sessions.slice(0, 3);
        const allMessages: ClaudeMessage[] = [];

        for (const session of recentSessions) {
          const messages = JSONLParser.parseSessionFile(session.filePath);
          allMessages.push(...messages);
        }

        if (allMessages.length > 0) {
          const insights = AIInsightAnalyzer.analyzeConversation(allMessages);
          const patterns = UserPatternAnalyzer.analyzeUserPatterns(allMessages);
          
          console.log(`  Messages: ${allMessages.length} | Insights: ${insights.length} | Patterns: ${patterns.length}`);
        } else {
          console.log('  No messages to analyze');
        }
      }

      console.log('\nUse "mnemaris analyze [project-name] --deep" for detailed analysis');
    } catch (error) {
      console.error('Bulk analysis failed:', error);
      process.exit(1);
    }
  });

program
  .command('export')
  .description('Export analysis results to different formats')
  .argument('[project-name]', 'Project to export (or most recent if not specified)')
  .option('--format <format>', 'Export format: json, markdown, csv', 'markdown')
  .option('--output <path>', 'Output file path')
  .option('--insights-only', 'Export only AI insights')
  .option('--patterns-only', 'Export only user patterns')
  .action(async (projectName: string | undefined, options) => {
    try {
      // This will use the ReportExporter once it's implemented
      console.log('🚀 Export functionality coming soon!');
      console.log(`Would export ${projectName || 'recent project'} in ${options.format} format`);
    } catch (error) {
      console.error('Export failed:', error);
      process.exit(1);
    }
  });

program
  .command('insights')
  .description('Focus on specific types of insights')
  .argument('[project-name]', 'Project to analyze')
  .option('--type <type>', 'Insight type: uncertainty, correction, learning, assumption, confusion, realization')
  .option('--confidence <threshold>', 'Minimum confidence threshold', '0.7')
  .action(async (projectName: string | undefined, options) => {
    try {
      console.log('🧠 Focused insight analysis...\n');
      
      let project;
      if (projectName) {
        project = await ProjectDiscovery.getProjectInfo(projectName);
      } else {
        const recent = await ProjectDiscovery.getRecentProjects(1);
        project = recent[0];
      }

      if (!project) {
        console.error('No project found to analyze');
        process.exit(1);
      }

      console.log(`Analyzing insights in: ${project.name}`);

      const allMessages: ClaudeMessage[] = [];
      for (const session of project.sessions.slice(0, 5)) { // Limit to 5 recent sessions
        const messages = JSONLParser.parseSessionFile(session.filePath);
        allMessages.push(...messages);
      }

      const insights = AIInsightAnalyzer.analyzeConversation(allMessages);
      const threshold = parseFloat(options.confidence);
      let filteredInsights = AIInsightAnalyzer.filterByConfidence(insights, threshold);

      if (options.type) {
        filteredInsights = filteredInsights.filter(insight => insight.type === options.type);
        console.log(`\nFiltered to "${options.type}" insights:`);
      }

      console.log(`\nFound ${filteredInsights.length} insights (confidence ≥ ${threshold}):\n`);

      filteredInsights.slice(0, 10).forEach((insight, index) => {
        console.log(`${index + 1}. [${insight.type}] (${(insight.confidence * 100).toFixed(0)}%)`);
        console.log(`   "${insight.content}"`);
        console.log(`   Context: ${insight.context.slice(0, 100)}...`);
        console.log(`   Session: ${insight.sessionId.slice(0, 8)}\n`);
      });

      if (filteredInsights.length > 10) {
        console.log(`... and ${filteredInsights.length - 10} more insights`);
      }
    } catch (error) {
      console.error('Insights analysis failed:', error);
      process.exit(1);
    }
  });

// Add help examples
program.on('--help', () => {
  console.log('');
  console.log('Examples:');
  console.log('  $ mnemaris scan                                      # Discover all projects');
  console.log('  $ mnemaris analyze --recent --depth 50              # Analyze recent 50 messages');
  console.log('  $ mnemaris analyze my-project --ai-powered          # AI-powered deep analysis');
  console.log('  $ mnemaris analyze --recent --ai-powered --depth 200 # AI analysis of 200 recent messages');
  console.log('  $ mnemaris insights --type uncertainty              # Focus on AI uncertainty patterns');
  console.log('  $ mnemaris export my-project --format json         # Export results as JSON');
  console.log('');
  console.log('Environment Variables:');
  console.log('  ANTHROPIC_API_KEY    Required for --ai-powered analysis');
  console.log('');
});

program.parse();