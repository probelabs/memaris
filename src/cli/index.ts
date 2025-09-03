#!/usr/bin/env node

import { Command } from 'commander';
import { ProjectDiscovery } from '../parsers/project-discovery.js';
import { ProjectDetector } from '../parsers/project-detector.js';
import { JSONLParser } from '../parsers/jsonl-parser.js';
import { processBatches, estimateTokens } from '../utils/batching.js';

// Helper function to check if a message has substantial content
function hasSubstantialContent(message: ClaudeMessage): boolean {
  let content = '';
  if (message.type === 'user') {
    content = JSONLParser.extractUserText(message);
  } else if (message.type === 'assistant') {
    const textBlocks = JSONLParser.extractAssistantText(message);
    content = textBlocks.join('\n');
  } else if (message.type === 'summary' && message.summary) {
    content = `[Session Summary: ${message.summary}]`;
  } else {
    content = '[Non-text message]';
  }
  
  return content.trim().length > 10;
}

import { AIInsightAnalyzer } from '../analyzers/ai-insights.js';
import { UserPatternAnalyzer } from '../analyzers/user-patterns.js';
import { ClaudeCodeAnalyzer } from '../analyzers/claude-code-analysis.js';
import { ReportExporter } from '../exporters/report-generator.js';
import type { AnalysisConfig, ClaudeMessage, AnalysisReport } from '../types/index.js';
import { query } from '@anthropic-ai/claude-code';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import readlineSync from 'readline-sync';

async function updateClaudeMd(projectPath: string, analysisResults: any, dryRun: boolean = false, debug: boolean = false): Promise<string> {
  const claudeMdPath = join(resolve(projectPath), 'CLAUDE.md');
  
  if (!dryRun) {
    console.log('\n🤖 Generating CLAUDE.md updates...');
  }
  
  // Read existing CLAUDE.md content if it exists
  let existingContent = '';
  if (existsSync(claudeMdPath)) {
    existingContent = readFileSync(claudeMdPath, 'utf-8');
  }

  // Create prompt for Claude Code SDK to update CLAUDE.md
  const updatePrompt = `
Naturally merge the conversation analysis insights into this CLAUDE.md file. Add only what is specific enough and actionable. Follow common sense - don't repeat yourself or add obvious things. If the file doesn't exist, create it.

<current-claude-md>
${existingContent || '[File does not exist yet]'}
</current-claude-md>

<analysis-data>
This XML tag contains the structured analysis results from examining Claude Code conversation history. 
It includes AI-generated insights about user patterns, mistakes to avoid, successful approaches, and preferences.
Base your CLAUDE.md updates ONLY on the data contained within this tag.

${JSON.stringify(analysisResults, null, 2)}
</analysis-data>

Guidelines for merging:
- Keep existing content that's still relevant
- Add specific user preferences, boundaries, and lessons learned that will genuinely help future AI sessions
- Only include insights that are concrete and actionable (avoid vague generalities)
- Group related insights logically
- Don't duplicate existing information
- Use clear, direct language that other AIs can easily follow
- Base all updates exclusively on the data provided within the <analysis-data> XML tag above

IMPORTANT: You MUST actually use the tools to update the file, not just describe what you would do.

Step by step:
1. First, use the Read tool to check if CLAUDE.md exists in the current directory
2. Then use the Write tool to create or Edit tool to update the CLAUDE.md file with the merged insights  
3. After making the file changes, return a summary in unified diff format

You must actually execute the Read and Write/Edit tools, not just talk about them.

Return format: A unified diff showing the changes you made, using proper diff format with:
- File headers: --- a/CLAUDE.md and +++ b/CLAUDE.md  
- Hunk headers with line numbers: @@ -start,count +start,count @@
- Lines starting with - for removals, + for additions, and space for context
- If no changes are needed, return "No changes needed"
`;

  try {
    const response = query({
      prompt: updatePrompt,
      options: {
        allowedTools: ['*'], // Allow all tools including file operations
        maxTurns: 20, // Allow many turns for complex file operations
        model: 'claude-sonnet-4-20250514',
        cwd: projectPath, // Set working directory
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
      // In preview mode, don't actually update files, just return what would happen
      return result;
    } else {
      // The Claude Code agent has already updated the file, show the diff summary
      if (result.trim() === "No changes needed") {
        console.log('\n✅ No changes needed - CLAUDE.md is already up to date');
      } else {
        console.log('\n🔍 Changes applied to CLAUDE.md:');
        console.log('─'.repeat(80));
        console.log(result);
        console.log('─'.repeat(80));
        console.log(`\n✅ CLAUDE.md updated successfully at: ${claudeMdPath}`);
      }
      
      return result;
    }
    
  } catch (error) {
    console.error('❌ Failed to update CLAUDE.md:', error);
    throw error;
  }
}

const program = new Command();

program
  .name('memaris')
  .description('Analyze Claude Code conversation history to extract AI insights and improve future sessions')
  .version('0.3.0');

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

      console.log('Use "memaris analyze <project-name>" to analyze a specific project');
      console.log('Use "memaris analyze-all --recent" to analyze recent projects');
    } catch (error) {
      console.error('Failed to scan projects:', error);
      process.exit(1);
    }
  });

// Default action when no command is specified
program
  .argument('[path]', 'Path to project directory (defaults to current directory)')
  .description('Analyze Claude Code conversations and improve future AI sessions')
  .option('--pattern-only', 'Use pattern-matching analysis instead of AI-powered')
  .option('--update', 'Actually write the CLAUDE.md file (by default only preview)')
  .option('--all', 'Process all conversation history in batches (default: recent sessions only)')
  .option('--depth <number>', 'Maximum number of messages to analyze (deprecated)', '0')
  .option('--tokens <number>', 'Maximum tokens to analyze when not using --all (default: 50000)', '50000')
  .option('--batch-size <number>', 'Token batch size when using --all (default: 50000)', '50000')
  .option('--confidence <threshold>', 'Minimum confidence threshold for insights (0-1)', '0.5')
  .option('--debug', 'Show debug information about project detection')
  .option('--debug-messages', 'Show debug information for large messages (>1000 tokens)')
  .option('--exclude-patterns <patterns>', 'Comma-separated patterns to exclude sessions')
  .action(async (path, options) => {
    try {
      if (options.debug) {
        await ProjectDetector.debugProjectDetection();
        return;
      }

      // Preview mode is now default, --update flag is needed to write files
      const isPreviewMode = !options.update;

      console.log('🧠 Starting conversation analysis for current project...\n');

      // Detect the project's Claude Code conversations
      const project = await ProjectDetector.detectCurrentProject(path);
      
      if (!project) {
        console.log('\n🔍 No project detected. Let me scan for available projects...');
        const projects = await ProjectDiscovery.discoverProjects();
        
        if (projects.length === 0) {
          console.log('\n💡 No Claude Code projects found. Make sure you\'ve used Claude Code in this directory.');
        } else {
          console.log(`\nFound ${projects.length} projects:`);
          projects.slice(0, 5).forEach((p, i) => {
            console.log(`  ${i + 1}. ${p.name} (${p.sessionCount} sessions)`);
          });
          console.log('\nUse: memaris /path/to/project');
        }
        process.exit(1);
      }

      console.log(`🎯 Match type: ${project.matchType}`);
      console.log(`📊 Found ${project.sessionCount} conversation sessions\n`);
      console.log(`📊 Analyzing project: ${project.name}`);

      const allMessages: ClaudeMessage[] = [];
      let messageToSessionMap = new Map<ClaudeMessage, string>();
      let processedSessions = 0;
      
      // Use token limit (new default) or fall back to message depth if specified
      const maxTokens = parseInt(options.tokens);
      const maxDepth = parseInt(options.depth);
      const useTokenLimit = maxDepth === 0; // Use tokens when depth is 0 (default)
      let currentTokenCount = 0;
      
      // For --all mode, collect ALL messages and process in batches
      if (options.all) {
        console.log('📦 Batch mode: Collecting all conversation history...');
        const allHistoryMessages: ClaudeMessage[] = [];
        const allMessageToSessionMap = new Map<ClaudeMessage, string>();
        
        // Collect ALL messages from ALL sessions
        for (const session of project.sessions) {
          console.log(`📄 Collecting from: ${session.filePath}`);
          const messages = JSONLParser.parseSessionFile(session.filePath);
          const substantialMessages = messages.filter(hasSubstantialContent);
          
          substantialMessages.forEach(msg => allMessageToSessionMap.set(msg, session.filePath));
          allHistoryMessages.push(...substantialMessages);
          
          console.log(`   ✅ Collected ${substantialMessages.length} substantial messages (${messages.length} total)`);
        }
        
        console.log(`\n📊 Total collected: ${allHistoryMessages.length} messages`);
        
        // Calculate total tokens
        const totalTokens = allHistoryMessages.reduce((sum, msg) => sum + estimateTokens(msg), 0);
        console.log(`📊 Estimated total tokens: ${totalTokens.toLocaleString()}`);
        
        const batchSize = parseInt(options.batchSize);
        
        // Use shared batching logic
        const batchOptions = {
          batchSize,
          excludePatterns: options.excludePatterns ? 
            options.excludePatterns.split(',').map((p: string) => p.trim()) : 
            undefined,
          debugMessages: options.debugMessages,
          messageToSessionMap: allMessageToSessionMap
        };
        const aiResults = await processBatches(allHistoryMessages, batchOptions);
        
        // Continue with merged results (skip normal collection)
        allMessages.push(...allHistoryMessages.slice(0, 100)); // Add some for display
        messageToSessionMap = allMessageToSessionMap;
        
        // Display results and handle CLAUDE.md update
        console.log('\n📊 Complete History Analysis Results:');
        console.log(`❌ Mistakes to avoid: ${aiResults.mistakes.length}`);
        console.log(`✅ Successful patterns: ${aiResults.successes.length}`);
        console.log(`📊 Total messages analyzed: ${allHistoryMessages.length.toLocaleString()}`);
        console.log(`📊 Total estimated tokens: ${totalTokens.toLocaleString()}`);
        
        if (aiResults.mistakes.length > 0) {
          console.log('\n🚫 Mistakes to Avoid:');
          aiResults.mistakes.forEach((mistake: any, i: number) => {
            console.log(`  ${i + 1}. ${mistake.type}: ${mistake.lesson}`);
          });
        }
        
        if (aiResults.successes.length > 0) {
          console.log('\n✨ Successful Patterns:');
          aiResults.successes.forEach((success: any, i: number) => {
            console.log(`  ${i + 1}. ${success.type}: ${success.lesson}`);
          });
        }
        
        console.log('\n👤 User Profile:');
        console.log(`  OS: ${aiResults.userProfile.environment.os}`);
        console.log(`  Style: ${aiResults.userProfile.style.verbosity}, ${aiResults.userProfile.style.techLevel} level`);
        
        if (aiResults.userProfile.preferences && aiResults.userProfile.preferences.length > 0) {
          console.log('\n🎯 User Preferences:');
          aiResults.userProfile.preferences.forEach((pref: string, i: number) => {
            console.log(`  ${i + 1}. ${pref}`);
          });
        }
        
        if (aiResults.userProfile.boundaries && aiResults.userProfile.boundaries.length > 0) {
          console.log('\n🚫 Boundaries & Constraints:');
          aiResults.userProfile.boundaries.forEach((boundary: string, i: number) => {
            console.log(`  ${i + 1}. ${boundary}`);
          });
        }
        
        if (aiResults.recommendations.length > 0) {
          console.log('\n💡 Recommendations for Future Sessions:');
          aiResults.recommendations.forEach((rec: string, i: number) => {
            console.log(`  ${i + 1}. ${rec}`);
          });
        }
        
        // Handle CLAUDE.md update
        const isPreviewMode = !options.update;
        if (isPreviewMode) {
          console.log('\n💡 Tip: Use --update flag to apply changes automatically next time');
          const shouldApply = readlineSync.keyInYN('\n📝 Would you like to apply these changes to CLAUDE.md?');
          
          if (shouldApply) {
            await updateClaudeMd(path || process.cwd(), aiResults, false, options.debug);
          } else {
            console.log('\n👍 No changes applied. To apply automatically next time, run:');
            console.log(`   memaris --all --update`);
          }
        } else {
          await updateClaudeMd(path || process.cwd(), aiResults, false, options.debug);
        }
        
        return; // Exit early, batch processing complete
      }

      // Use recent sessions by default (this code only runs when --all is NOT used)
      const sessionsToAnalyze = project.sessions.slice(0, 10);

      // Collect messages based on token limit or message depth
      for (const session of sessionsToAnalyze) {
        // Check limits before processing
        if (useTokenLimit && currentTokenCount >= maxTokens) break;
        if (!useTokenLimit && allMessages.length >= maxDepth) break;
        
        console.log(`📄 Processing: ${session.filePath}`);
        const messages = JSONLParser.parseSessionFile(session.filePath);
        if (messages.length > 0) {
          // Filter for substantial content first
          const substantialMessages = messages.filter(hasSubstantialContent);
          
          const messagesToAdd: ClaudeMessage[] = [];
          let sessionTokens = 0;
          
          // Add messages until we hit the limit
          for (const msg of substantialMessages) {
            if (useTokenLimit) {
              const msgTokens = estimateTokens(msg);
              if (currentTokenCount + msgTokens > maxTokens) break;
              currentTokenCount += msgTokens;
              sessionTokens += msgTokens;
            } else {
              if (allMessages.length + messagesToAdd.length >= maxDepth) break;
            }
            messagesToAdd.push(msg);
          }
          
          // Track which session each message came from
          messagesToAdd.forEach(msg => messageToSessionMap.set(msg, session.filePath));
          allMessages.push(...messagesToAdd);
          processedSessions++;
          
          if (useTokenLimit) {
            console.log(`   ✅ Found ${messagesToAdd.length} substantial messages (~${sessionTokens} tokens, ${messages.length} total)`);
          } else {
            console.log(`   ✅ Found ${messagesToAdd.length} substantial messages (${messages.length} total)`);
          }
          
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

      if (useTokenLimit) {
        console.log(`\n🔍 Analyzing ${allMessages.length} messages (~${currentTokenCount} tokens)...`);
      } else {
        console.log(`\n🔍 Analyzing ${allMessages.length} messages...`);
      }

      let insights: any[] = [];
      let patterns: any[] = [];
        
      if (!options.patternOnly) {
        // Use Claude Code SDK analysis by default
        console.log('🚀 Using AI-powered analysis...');
        const claudeAnalyzer = new ClaudeCodeAnalyzer();
        // Parse exclude patterns if provided
        const excludePatterns = options.excludePatterns ? 
          options.excludePatterns.split(',').map((p: string) => p.trim()) : 
          undefined;
          
        // Calculate appropriate maxDepth based on limits
        const effectiveDepth = useTokenLimit ? 
          Math.min(allMessages.length, maxTokens / 50) : // Rough estimate: 50 tokens per message average
          Math.min(allMessages.length, maxDepth || 100);
          
        // Determine if batching is needed based on total token count
        const totalTokens = allMessages.reduce((sum, msg) => sum + estimateTokens(msg), 0);
        const batchSizeLimit = parseInt(options.batchSize);
        const needsBatching = totalTokens > batchSizeLimit;
        
        console.log(`📊 Estimated total tokens: ${totalTokens.toLocaleString()}`);
        
        let aiResults: any;
        if (needsBatching) {
          console.log('🔄 Using batching due to large token count...');
          // Use shared batching logic
          const batchOptions = {
            batchSize: batchSizeLimit,
            excludePatterns,
            debugMessages: options.debugMessages,
            messageToSessionMap
          };
          aiResults = await processBatches(allMessages, batchOptions);
        } else {
          console.log('🚀 Using single analysis (tokens within limits)...');
          // Use single analysis for smaller datasets
          aiResults = await claudeAnalyzer.analyzeConversation(allMessages, effectiveDepth, options.debugMessages, messageToSessionMap, excludePatterns);
        }
          
        console.log('\n📊 AI Analysis Results:');
        console.log(`❌ Mistakes to avoid: ${aiResults.mistakes.length}`);
        console.log(`✅ Successful patterns: ${aiResults.successes.length}`);
        
        if (aiResults.mistakes.length > 0) {
          console.log('\n🚫 Mistakes to Avoid:');
          aiResults.mistakes.forEach((mistake: any, i: number) => {
            console.log(`  ${i + 1}. ${mistake.type}: ${mistake.lesson}`);
          });
        }
        
        if (aiResults.successes.length > 0) {
          console.log('\n✨ Successful Patterns:');
          aiResults.successes.forEach((success: any, i: number) => {
            console.log(`  ${i + 1}. ${success.type}: ${success.lesson}`);
          });
        }
        
        console.log('\n👤 User Profile:');
        console.log(`  OS: ${aiResults.userProfile.environment.os}`);
        console.log(`  Style: ${aiResults.userProfile.style.verbosity}, ${aiResults.userProfile.style.techLevel} level`);
        
        if (aiResults.userProfile.preferences && aiResults.userProfile.preferences.length > 0) {
          console.log('\n🎯 User Preferences:');
          aiResults.userProfile.preferences.slice(0, 5).forEach((pref: any, i: number) => {
            console.log(`  ${i + 1}. ${pref}`);
          });
        }
        
        if (aiResults.userProfile.boundaries && aiResults.userProfile.boundaries.length > 0) {
          console.log('\n🚫 Boundaries & Constraints:');
          aiResults.userProfile.boundaries.slice(0, 5).forEach((boundary: any, i: number) => {
            console.log(`  ${i + 1}. ${boundary}`);
          });
        }
        
        if (aiResults.recommendations.length > 0) {
          console.log('\n💡 Recommendations for Future Sessions:');
          aiResults.recommendations.forEach((rec: any, i: number) => {
            console.log(`  ${i + 1}. ${rec}`);
          });
        }
        
        // Update CLAUDE.md based on mode
        if (isPreviewMode) {
          // Preview mode: ask if user wants to apply changes without showing preview
          console.log('\n💡 Tip: Use --update flag to apply changes automatically next time');
          const shouldApply = readlineSync.keyInYN('\n📝 Would you like to apply these changes to CLAUDE.md?');
          
          if (shouldApply) {
            await updateClaudeMd(path || process.cwd(), aiResults, false, options.debug);
          } else {
            console.log('\n👍 No changes applied. To apply automatically next time, run:');
            console.log(`   memaris --update`);
          }
        } else {
          // Direct update mode
          await updateClaudeMd(path || process.cwd(), aiResults, false, options.debug);
        }
        
        // For backward compatibility with export, create dummy insights/patterns
        insights = [];
        patterns = [];

      } else {
        // Use pattern-matching analysis when requested
        console.log('🔍 Using pattern-matching analysis...');
        const allInsights = AIInsightAnalyzer.analyzeConversation(allMessages);
        const confidenceThreshold = parseFloat(options.confidence);
        insights = AIInsightAnalyzer.filterByConfidence(allInsights, confidenceThreshold);
        patterns = UserPatternAnalyzer.analyzeUserPatterns(allMessages);
        
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

      if (options.update) {
        console.log('\n✨ Analysis complete! Your CLAUDE.md has been updated with AI insights.');
      } else if (!options.patternOnly) {
        // Message already shown in interactive prompt
      } else {
        console.log('\n👁️  Analysis complete! Run with --update to apply these changes to CLAUDE.md.');
      }
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
        console.log(`   Sessions: ${project.sessionCount}`);
        
        // Perform quick analysis
        const allMessages: ClaudeMessage[] = [];
        for (const session of project.sessions.slice(0, 3)) {
          const messages = JSONLParser.parseSessionFile(session.filePath);
          allMessages.push(...messages);
        }
        
        if (allMessages.length > 0) {
          const insights = AIInsightAnalyzer.analyzeConversation(allMessages);
          const patterns = UserPatternAnalyzer.analyzeUserPatterns(allMessages);
          
          console.log(`   Insights: ${insights.length}`);
          console.log(`   Patterns: ${patterns.length}`);
        }
      }
    } catch (error) {
      console.error('Failed to analyze projects:', error);
      process.exit(1);
    }
  });

program
  .command('export')
  .description('Export analysis results to different formats')
  .argument('<project-name>', 'Name of the project to export')
  .option('--format <format>', 'Export format (json, markdown, csv)', 'json')
  .option('--output <path>', 'Output file path')
  .action(async (projectName, options) => {
    try {
      console.log(`📦 Exporting analysis for project: ${projectName}`);
      
      // Find the project
      const projects = await ProjectDiscovery.discoverProjects();
      const project = projects.find(p => p.name.toLowerCase().includes(projectName.toLowerCase()));
      
      if (!project) {
        console.error(`Project "${projectName}" not found`);
        process.exit(1);
      }
      
      // Analyze the project
      const allMessages: ClaudeMessage[] = [];
      for (const session of project.sessions) {
        const messages = JSONLParser.parseSessionFile(session.filePath);
        allMessages.push(...messages);
      }
      
      const insights = AIInsightAnalyzer.analyzeConversation(allMessages);
      const patterns = UserPatternAnalyzer.analyzeUserPatterns(allMessages);
      
      // Generate report
      const report: AnalysisReport = {
        projectName: project.name,
        totalSessions: project.sessionCount,
        totalMessages: allMessages.length,
        analysisDate: new Date().toISOString(),
        timeRange: {
          from: allMessages[0]?.timestamp || new Date().toISOString(),
          to: allMessages[allMessages.length - 1]?.timestamp || new Date().toISOString()
        },
        aiInsights: insights,
        userPatterns: patterns,
        summary: {
          topInsightTypes: [],
          topPatterns: [],
          activityTrend: 'stable' as const
        }
      };
      
      // Export based on format
      const outputPath = options.output || `${projectName}-analysis.${options.format}`;
      await ReportExporter.exportReport(report, options.format, outputPath);
      
      console.log(`✅ Analysis exported to: ${outputPath}`);
    } catch (error) {
      console.error('Export failed:', error);
      process.exit(1);
    }
  });

program
  .command('insights')
  .description('Focus on specific types of insights')
  .argument('[project-name]', 'Name of the project (optional)')
  .option('--type <type>', 'Type of insights to focus on (uncertainty, corrections, frustration, preferences)')
  .action(async (projectName, options) => {
    try {
      // Implementation for insights command
      console.log('🎯 Analyzing specific insights...');
      
      // Find project
      let project;
      if (projectName) {
        const projects = await ProjectDiscovery.discoverProjects();
        project = projects.find(p => p.name.toLowerCase().includes(projectName.toLowerCase()));
      } else {
        project = await ProjectDetector.detectCurrentProject();
      }
      
      if (!project) {
        console.error('No project found');
        process.exit(1);
      }
      
      // Analyze messages
      const allMessages: ClaudeMessage[] = [];
      for (const session of project.sessions.slice(0, 10)) {
        const messages = JSONLParser.parseSessionFile(session.filePath);
        allMessages.push(...messages);
      }
      
      const insights = AIInsightAnalyzer.analyzeConversation(allMessages);
      
      // Filter by type if specified
      if (options.type) {
        const filtered = insights.filter(i => i.type === options.type);
        console.log(`Found ${filtered.length} insights of type "${options.type}"`);
        filtered.slice(0, 10).forEach((insight, i) => {
          console.log(`\n${i + 1}. ${insight.content}`);
          console.log(`   Confidence: ${(insight.confidence * 100).toFixed(0)}%`);
        });
      } else {
        // Show summary
        const types = [...new Set(insights.map(i => i.type))];
        types.forEach(type => {
          const count = insights.filter(i => i.type === type).length;
          console.log(`${type}: ${count} insights`);
        });
      }
    } catch (error) {
      console.error('Insights analysis failed:', error);
      process.exit(1);
    }
  });

program.on('--help', () => {
  console.log('');
  console.log('Examples:');
  console.log('  $ memaris                                          # Preview insights (no file changes)');
  console.log('  $ memaris --update                                # Apply changes to CLAUDE.md');
  console.log('  $ memaris --pattern-only                          # Use pattern-matching instead of AI');
  console.log('  $ memaris --all-sessions --depth 500             # Deep analysis of all sessions');
  console.log('  $ memaris /path/to/project                        # Analyze specific project');
  console.log('  $ memaris scan                                    # Discover all available projects');
  console.log('  $ memaris insights --type uncertainty            # Focus on specific insight types');
  console.log('');
  console.log('Advanced Options:');
  console.log('  --update             Write changes to CLAUDE.md (default: preview only)');
  console.log('  --exclude-patterns   Exclude sessions matching patterns');
  console.log('  --debug              Show project detection details');
  console.log('');
});

program.parseAsync(process.argv);