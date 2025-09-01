import { writeFileSync } from 'fs';
import { join } from 'path';
import type { AnalysisReport, AIInsight, UserPattern } from '../types/index.js';

export class ReportExporter {
  /**
   * Export report in multiple formats
   */
  static async exportReport(
    report: AnalysisReport, 
    format: 'json' | 'markdown' | 'csv',
    outputPath?: string
  ): Promise<string> {
    const timestamp = new Date().toISOString().split('T')[0];
    const defaultPath = `claude-analysis-${report.projectName}-${timestamp}`;
    
    switch (format) {
      case 'json':
        return this.exportJSON(report, outputPath || `${defaultPath}.json`);
      case 'markdown':
        return this.exportMarkdown(report, outputPath || `${defaultPath}.md`);
      case 'csv':
        return this.exportCSV(report, outputPath || `${defaultPath}.csv`);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private static exportJSON(report: AnalysisReport, outputPath: string): string {
    const content = JSON.stringify(report, null, 2);
    writeFileSync(outputPath, content, 'utf-8');
    return outputPath;
  }

  private static exportMarkdown(report: AnalysisReport, outputPath: string): string {
    const content = this.generateMarkdownReport(report);
    writeFileSync(outputPath, content, 'utf-8');
    return outputPath;
  }

  private static exportCSV(report: AnalysisReport, outputPath: string): string {
    const content = this.generateCSVReport(report);
    writeFileSync(outputPath, content, 'utf-8');
    return outputPath;
  }

  private static generateMarkdownReport(report: AnalysisReport): string {
    const lines: string[] = [];

    lines.push(`# Claude Code Analysis Report`);
    lines.push(`**Project:** ${report.projectName}`);
    lines.push(`**Analysis Date:** ${new Date(report.analysisDate).toLocaleDateString()}`);
    lines.push(`**Sessions Analyzed:** ${report.totalSessions}`);
    lines.push(`**Total Messages:** ${report.totalMessages}`);
    lines.push(`**Time Range:** ${new Date(report.timeRange.from).toLocaleDateString()} - ${new Date(report.timeRange.to).toLocaleDateString()}`);
    lines.push('');

    // Summary section
    lines.push('## 📊 Summary');
    lines.push(`- **AI Insights Found:** ${report.aiInsights.length}`);
    lines.push(`- **User Patterns Found:** ${report.userPatterns.length}`);
    lines.push('');

    // Top insight types
    if (report.summary.topInsightTypes.length > 0) {
      lines.push('### 🧠 Top AI Insight Types');
      report.summary.topInsightTypes.forEach(({ type, count }) => {
        lines.push(`- **${type}**: ${count} instances`);
      });
      lines.push('');
    }

    // Top patterns
    if (report.summary.topPatterns.length > 0) {
      lines.push('### 👤 Top User Patterns');
      report.summary.topPatterns.forEach(({ pattern, frequency }) => {
        lines.push(`- **${pattern}** (${frequency} occurrences)`);
      });
      lines.push('');
    }

    // Detailed AI insights
    if (report.aiInsights.length > 0) {
      lines.push('## 🧠 AI Insights Details');
      lines.push('');

      const insightsByType = this.groupInsightsByType(report.aiInsights);
      
      for (const [type, insights] of insightsByType) {
        lines.push(`### ${this.formatInsightType(type)} (${insights.length} instances)`);
        lines.push('');

        const topInsights = insights.slice(0, 10);
        topInsights.forEach((insight, index) => {
          lines.push(`#### ${index + 1}. Confidence: ${(insight.confidence * 100).toFixed(0)}%`);
          lines.push(`**Content:** "${insight.content}"`);
          lines.push(`**Context:** ${insight.context}`);
          lines.push(`**Session:** ${insight.sessionId.slice(0, 8)}...`);
          lines.push(`**Timestamp:** ${new Date(insight.timestamp).toLocaleString()}`);
          lines.push('');
        });

        if (insights.length > 10) {
          lines.push(`*... and ${insights.length - 10} more ${type} insights*`);
          lines.push('');
        }
      }
    }

    // Detailed user patterns
    if (report.userPatterns.length > 0) {
      lines.push('## 👤 User Patterns Details');
      lines.push('');

      const patternsByType = this.groupPatternsByType(report.userPatterns);
      
      for (const [type, patterns] of patternsByType) {
        lines.push(`### ${this.formatPatternType(type)} (${patterns.length} patterns)`);
        lines.push('');

        patterns.forEach((pattern, index) => {
          lines.push(`#### ${index + 1}. ${pattern.pattern}`);
          lines.push(`**Frequency:** ${pattern.frequency} occurrences`);
          lines.push(`**First Seen:** ${new Date(pattern.firstSeen).toLocaleDateString()}`);
          lines.push(`**Last Seen:** ${new Date(pattern.lastSeen).toLocaleDateString()}`);
          
          if (pattern.examples.length > 0) {
            lines.push('**Examples:**');
            pattern.examples.slice(0, 3).forEach(example => {
              lines.push(`- "${example.content.slice(0, 100)}..."`);
              lines.push(`  *${new Date(example.timestamp).toLocaleDateString()}*`);
            });
          }
          lines.push('');
        });
      }
    }

    // Analysis metadata
    lines.push('## 🔧 Analysis Metadata');
    lines.push(`- **Generated by:** Claude Story Analyzer v1.0.0`);
    lines.push(`- **Generation Time:** ${new Date().toLocaleString()}`);
    lines.push('');

    return lines.join('\n');
  }

  private static generateCSVReport(report: AnalysisReport): string {
    const lines: string[] = [];

    // AI Insights CSV
    lines.push('# AI Insights');
    lines.push('Type,Content,Context,Confidence,Session,Timestamp');
    
    report.aiInsights.forEach(insight => {
      const row = [
        insight.type,
        `"${insight.content.replace(/"/g, '""')}"`,
        `"${insight.context.slice(0, 100).replace(/"/g, '""')}"`,
        insight.confidence.toFixed(3),
        insight.sessionId.slice(0, 8),
        insight.timestamp
      ];
      lines.push(row.join(','));
    });

    lines.push('');
    lines.push('# User Patterns');
    lines.push('Type,Pattern,Frequency,FirstSeen,LastSeen');
    
    report.userPatterns.forEach(pattern => {
      const row = [
        pattern.type,
        `"${pattern.pattern.replace(/"/g, '""')}"`,
        pattern.frequency.toString(),
        pattern.firstSeen,
        pattern.lastSeen
      ];
      lines.push(row.join(','));
    });

    return lines.join('\n');
  }

  private static groupInsightsByType(insights: AIInsight[]): Map<string, AIInsight[]> {
    const groups = new Map<string, AIInsight[]>();
    
    for (const insight of insights) {
      const existing = groups.get(insight.type) || [];
      existing.push(insight);
      groups.set(insight.type, existing);
    }
    
    // Sort each group by confidence
    for (const [type, typeInsights] of groups) {
      groups.set(type, typeInsights.sort((a, b) => b.confidence - a.confidence));
    }
    
    return groups;
  }

  private static groupPatternsByType(patterns: UserPattern[]): Map<string, UserPattern[]> {
    const groups = new Map<string, UserPattern[]>();
    
    for (const pattern of patterns) {
      const existing = groups.get(pattern.type) || [];
      existing.push(pattern);
      groups.set(pattern.type, existing);
    }
    
    return groups;
  }

  private static formatInsightType(type: string): string {
    const typeMap: Record<string, string> = {
      'uncertainty': '🤔 Uncertainty Moments',
      'correction': '🔧 Course Corrections',
      'learning': '💡 Learning Realizations',
      'assumption': '🎯 Assumptions Made',
      'confusion': '😕 Confusion Points',
      'realization': '⚡ Eureka Moments'
    };
    
    return typeMap[type] || type;
  }

  private static formatPatternType(type: string): string {
    const typeMap: Record<string, string> = {
      'repetitive_request': '🔄 Repetitive Requests',
      'correction': '✏️ User Corrections',
      'workflow': '🔄 Workflow Patterns',
      'preference': '⭐ User Preferences'
    };
    
    return typeMap[type] || type;
  }

  /**
   * Export insights only
   */
  static async exportInsights(
    insights: AIInsight[], 
    format: 'json' | 'csv' | 'markdown',
    outputPath: string
  ): Promise<string> {
    switch (format) {
      case 'json':
        writeFileSync(outputPath, JSON.stringify(insights, null, 2), 'utf-8');
        break;
      case 'csv':
        const csvContent = this.generateInsightsCSV(insights);
        writeFileSync(outputPath, csvContent, 'utf-8');
        break;
      case 'markdown':
        const mdContent = this.generateInsightsMarkdown(insights);
        writeFileSync(outputPath, mdContent, 'utf-8');
        break;
    }
    
    return outputPath;
  }

  /**
   * Export patterns only
   */
  static async exportPatterns(
    patterns: UserPattern[], 
    format: 'json' | 'csv' | 'markdown',
    outputPath: string
  ): Promise<string> {
    switch (format) {
      case 'json':
        writeFileSync(outputPath, JSON.stringify(patterns, null, 2), 'utf-8');
        break;
      case 'csv':
        const csvContent = this.generatePatternsCSV(patterns);
        writeFileSync(outputPath, csvContent, 'utf-8');
        break;
      case 'markdown':
        const mdContent = this.generatePatternsMarkdown(patterns);
        writeFileSync(outputPath, mdContent, 'utf-8');
        break;
    }
    
    return outputPath;
  }

  private static generateInsightsCSV(insights: AIInsight[]): string {
    const lines = ['Type,Content,Context,Confidence,Session,Timestamp'];
    
    insights.forEach(insight => {
      const row = [
        insight.type,
        `"${insight.content.replace(/"/g, '""')}"`,
        `"${insight.context.slice(0, 100).replace(/"/g, '""')}"`,
        insight.confidence.toFixed(3),
        insight.sessionId.slice(0, 8),
        insight.timestamp
      ];
      lines.push(row.join(','));
    });
    
    return lines.join('\n');
  }

  private static generatePatternsCSV(patterns: UserPattern[]): string {
    const lines = ['Type,Pattern,Frequency,FirstSeen,LastSeen'];
    
    patterns.forEach(pattern => {
      const row = [
        pattern.type,
        `"${pattern.pattern.replace(/"/g, '""')}"`,
        pattern.frequency.toString(),
        pattern.firstSeen,
        pattern.lastSeen
      ];
      lines.push(row.join(','));
    });
    
    return lines.join('\n');
  }

  private static generateInsightsMarkdown(insights: AIInsight[]): string {
    const lines = ['# AI Insights Report', ''];
    
    const grouped = this.groupInsightsByType(insights);
    
    for (const [type, typeInsights] of grouped) {
      lines.push(`## ${this.formatInsightType(type)}`);
      lines.push('');
      
      typeInsights.slice(0, 20).forEach((insight, index) => {
        lines.push(`### ${index + 1}. ${(insight.confidence * 100).toFixed(0)}% Confidence`);
        lines.push(`**Content:** "${insight.content}"`);
        lines.push(`**Context:** ${insight.context}`);
        lines.push('');
      });
    }
    
    return lines.join('\n');
  }

  private static generatePatternsMarkdown(patterns: UserPattern[]): string {
    const lines = ['# User Patterns Report', ''];
    
    const grouped = this.groupPatternsByType(patterns);
    
    for (const [type, typePatterns] of grouped) {
      lines.push(`## ${this.formatPatternType(type)}`);
      lines.push('');
      
      typePatterns.forEach((pattern, index) => {
        lines.push(`### ${index + 1}. ${pattern.pattern}`);
        lines.push(`**Frequency:** ${pattern.frequency}`);
        lines.push(`**Duration:** ${new Date(pattern.firstSeen).toLocaleDateString()} - ${new Date(pattern.lastSeen).toLocaleDateString()}`);
        lines.push('');
      });
    }
    
    return lines.join('\n');
  }
}