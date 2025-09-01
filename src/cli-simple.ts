#!/usr/bin/env node

import { Command } from 'commander';
import { analyzeCommand } from './cli/commands/analyze.js';

const program = new Command();

program
  .name('mnemaris')
  .description('Analyze Claude Code conversation history for current project')
  .version('1.0.0');

program
  .command('analyze')
  .description('Analyze Claude Code conversations for the current project directory')
  .option('--deep', 'Perform deep analysis of all sessions')
  .option('--recent', 'Focus on recent sessions only') 
  .option('--ai-powered', 'Use AI-powered analysis with Claude (requires ANTHROPIC_API_KEY)')
  .option('--depth <number>', 'Maximum number of messages to analyze (default: 100)', '100')
  .option('--confidence <threshold>', 'Minimum confidence threshold for insights (0-1)', '0.5')
  .option('--debug', 'Show debug information about project detection')
  .action(analyzeCommand);

program.on('--help', () => {
  console.log('');
  console.log('Examples:');
  console.log('  $ mnemaris analyze                    # Analyze current project');
  console.log('  $ mnemaris analyze --debug           # Debug project detection');
  console.log('  $ mnemaris analyze --depth 50        # Analyze recent 50 messages');
  console.log('  $ mnemaris analyze --ai-powered      # AI-powered analysis (requires API key)');
  console.log('');
  console.log('Environment Variables:');
  console.log('  ANTHROPIC_API_KEY    Required for --ai-powered analysis');
  console.log('');
});

program.parse();