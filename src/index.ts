export { ProjectDiscovery } from './parsers/project-discovery.js';
export { JSONLParser } from './parsers/jsonl-parser.js';
export { ClaudeCodeAnalyzer } from './analyzers/claude-code-analysis.js';
export { StoryAnalyzer } from './analyzers/story-analyzer.js';
export { ReportExporter } from './exporters/report-generator.js';

export type {
  ClaudeMessage,
  ProjectInfo,
  SessionInfo,
  AIInsight,
  UserPattern,
  PatternExample,
  AnalysisReport,
  AnalysisConfig
} from './types/index.js';

// Main analysis function for programmatic usage
export async function analyzeProject(projectName: string) {
  const { ProjectDiscovery } = await import('./parsers/project-discovery.js');
  const { JSONLParser } = await import('./parsers/jsonl-parser.js');
  const { ClaudeCodeAnalyzer } = await import('./analyzers/claude-code-analysis.js');

  const project = await ProjectDiscovery.getProjectInfo(projectName);
  if (!project) {
    throw new Error(`Project "${projectName}" not found`);
  }

  const allMessages = [];
  for (const session of project.sessions) {
    const messages = JSONLParser.parseSessionFile(session.filePath);
    allMessages.push(...messages);
  }

  // Use AI-powered analysis
  const analyzer = new ClaudeCodeAnalyzer();
  const results = await analyzer.analyzeConversation(allMessages);

  return {
    project,
    ...results,
    messages: allMessages
  };
}

// Convenience function for analyzing recent projects
export async function analyzeRecentProjects(limit: number = 5) {
  const { ProjectDiscovery } = await import('./parsers/project-discovery.js');
  
  const projects = await ProjectDiscovery.getRecentProjects(limit);
  const results = [];

  for (const project of projects) {
    try {
      const result = await analyzeProject(project.name);
      results.push(result);
    } catch (error) {
      console.warn(`Failed to analyze project ${project.name}:`, error);
    }
  }

  return results;
}