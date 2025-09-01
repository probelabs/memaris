import type { ClaudeMessage, UserPattern, PatternExample } from '../types/index.js';
import { JSONLParser } from '../parsers/jsonl-parser.js';

export class UserPatternAnalyzer {
  private static readonly CORRECTION_PATTERNS = [
    /\b(?:no|not|don't|doesn't|wrong|incorrect|fix|change|instead|actually)\b/gi,
    /\b(?:try again|redo|restart|different|another way|better|improve)\b/gi,
    /\b(?:that's not|not what|not right|not correct|not working)\b/gi,
    /\b(?:i meant|what i want|i need|i'm looking for)\b/gi
  ];

  private static readonly REPETITIVE_INDICATORS = [
    /\b(?:again|once more|same|similar|like before|as usual)\b/gi,
    /\b(?:every time|always|usually|often|frequently)\b/gi,
    /\b(?:keep|continue|still|yet another|more of)\b/gi
  ];

  private static readonly WORKFLOW_PATTERNS = [
    /\b(?:first|then|next|after|finally|last|step)\b/gi,
    /\b(?:before you|make sure|don't forget|remember to)\b/gi,
    /\b(?:process|workflow|routine|procedure|steps)\b/gi
  ];

  private static readonly PREFERENCE_PATTERNS = [
    /\b(?:prefer|like|want|need|require|must have)\b/gi,
    /\b(?:use|utilize|implement|apply|follow)\b.*(?:pattern|style|approach|method)\b/gi,
    /\b(?:don't use|avoid|never|not|skip)\b/gi,
    /\b(?:always|never|only|just|specifically)\b/gi
  ];

  /**
   * Analyze user messages across all conversations to find patterns
   */
  static analyzeUserPatterns(allMessages: ClaudeMessage[]): UserPattern[] {
    const userMessages = allMessages.filter(msg => msg.type === 'user');
    const patterns: UserPattern[] = [];

    // Group messages by content similarity
    const similarMessages = this.findSimilarMessages(userMessages);
    
    // Analyze repetitive requests
    patterns.push(...this.analyzeRepetitiveRequests(similarMessages));
    
    // Analyze correction patterns
    patterns.push(...this.analyzeCorrectionPatterns(userMessages));
    
    // Analyze workflow patterns
    patterns.push(...this.analyzeWorkflowPatterns(userMessages));
    
    // Analyze preferences
    patterns.push(...this.analyzePreferences(userMessages));

    return patterns.sort((a, b) => b.frequency - a.frequency);
  }

  private static findSimilarMessages(messages: ClaudeMessage[]): Map<string, ClaudeMessage[]> {
    const groups = new Map<string, ClaudeMessage[]>();
    const processed = new Set<string>();

    for (const message of messages) {
      if (processed.has(message.uuid)) continue;

      const messageText = JSONLParser.extractUserText(message).toLowerCase();
      const words = this.extractKeywords(messageText);
      const groupKey = words.slice(0, 3).join('_'); // Use first 3 keywords as group key

      if (groupKey && words.length >= 2) {
        const similarMessages = messages.filter(m => {
          if (processed.has(m.uuid)) return false;
          
          const otherText = JSONLParser.extractUserText(m).toLowerCase();
          const otherWords = this.extractKeywords(otherText);
          
          // Check similarity based on common keywords
          const commonWords = words.filter(w => otherWords.includes(w));
          return commonWords.length >= Math.min(2, Math.min(words.length, otherWords.length) * 0.5);
        });

        if (similarMessages.length > 1) {
          similarMessages.forEach(m => processed.add(m.uuid));
          groups.set(groupKey, similarMessages);
        }
      }
    }

    return groups;
  }

  private static analyzeRepetitiveRequests(similarGroups: Map<string, ClaudeMessage[]>): UserPattern[] {
    const patterns: UserPattern[] = [];

    for (const [groupKey, messages] of similarGroups) {
      if (messages.length >= 2) {
        const examples = messages.map(msg => ({
          sessionId: msg.sessionId,
          timestamp: msg.timestamp,
          content: JSONLParser.extractUserText(msg).slice(0, 200) + '...',
          context: `Session: ${msg.sessionId.slice(0, 8)}`
        }));

        const pattern: UserPattern = {
          id: `repetitive_${groupKey}`,
          type: 'repetitive_request',
          pattern: this.extractPatternDescription(messages),
          frequency: messages.length,
          examples,
          firstSeen: messages[0]!.timestamp,
          lastSeen: messages[messages.length - 1]!.timestamp
        };

        patterns.push(pattern);
      }
    }

    return patterns;
  }

  private static analyzeCorrectionPatterns(userMessages: ClaudeMessage[]): UserPattern[] {
    const patterns: UserPattern[] = [];
    const corrections: ClaudeMessage[] = [];

    for (const message of userMessages) {
      const text = JSONLParser.extractUserText(message);
      
      // Check if message contains correction indicators
      const hasCorrection = this.CORRECTION_PATTERNS.some(pattern => 
        pattern.test(text)
      );

      if (hasCorrection) {
        corrections.push(message);
      }
    }

    if (corrections.length >= 2) {
      const correctionTypes = this.categorizeCorrections(corrections);
      
      for (const [type, messages] of correctionTypes) {
        const examples = messages.slice(0, 5).map(msg => ({
          sessionId: msg.sessionId,
          timestamp: msg.timestamp,
          content: JSONLParser.extractUserText(msg).slice(0, 150) + '...',
          context: `Correction type: ${type}`
        }));

        patterns.push({
          id: `correction_${type}`,
          type: 'correction',
          pattern: `User frequently corrects: ${type}`,
          frequency: messages.length,
          examples,
          firstSeen: messages[0]!.timestamp,
          lastSeen: messages[messages.length - 1]!.timestamp
        });
      }
    }

    return patterns;
  }

  private static analyzeWorkflowPatterns(userMessages: ClaudeMessage[]): UserPattern[] {
    const patterns: UserPattern[] = [];
    const workflowMessages = userMessages.filter(msg => {
      const text = JSONLParser.extractUserText(msg);
      return this.WORKFLOW_PATTERNS.some(pattern => pattern.test(text));
    });

    if (workflowMessages.length >= 2) {
      const commonWorkflows = this.extractWorkflows(workflowMessages);
      
      for (const workflow of commonWorkflows) {
        if (workflow.messages.length >= 2) {
          patterns.push({
            id: `workflow_${workflow.id}`,
            type: 'workflow',
            pattern: workflow.description,
            frequency: workflow.messages.length,
            examples: workflow.messages.slice(0, 3).map(msg => ({
              sessionId: msg.sessionId,
              timestamp: msg.timestamp,
              content: JSONLParser.extractUserText(msg).slice(0, 150) + '...',
              context: `Workflow step`
            })),
            firstSeen: workflow.messages[0]!.timestamp,
            lastSeen: workflow.messages[workflow.messages.length - 1]!.timestamp
          });
        }
      }
    }

    return patterns;
  }

  private static analyzePreferences(userMessages: ClaudeMessage[]): UserPattern[] {
    const patterns: UserPattern[] = [];
    const preferences = new Map<string, ClaudeMessage[]>();

    for (const message of userMessages) {
      const text = JSONLParser.extractUserText(message);
      const extractedPrefs = this.extractPreferences(text, message);
      
      for (const pref of extractedPrefs) {
        const existing = preferences.get(pref.key) || [];
        existing.push(message);
        preferences.set(pref.key, existing);
      }
    }

    for (const [prefKey, messages] of preferences) {
      if (messages.length >= 2) {
        patterns.push({
          id: `preference_${prefKey}`,
          type: 'preference',
          pattern: `User preference: ${prefKey}`,
          frequency: messages.length,
          examples: messages.slice(0, 3).map(msg => ({
            sessionId: msg.sessionId,
            timestamp: msg.timestamp,
            content: JSONLParser.extractUserText(msg).slice(0, 150) + '...',
            context: 'User preference'
          })),
          firstSeen: messages[0]!.timestamp,
          lastSeen: messages[messages.length - 1]!.timestamp
        });
      }
    }

    return patterns;
  }

  private static extractKeywords(text: string): string[] {
    // Remove common words and extract meaningful keywords
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
      'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.has(word))
      .slice(0, 20); // Limit to first 20 keywords
  }

  private static extractPatternDescription(messages: ClaudeMessage[]): string {
    const firstMessage = JSONLParser.extractUserText(messages[0]!);
    const keywords = this.extractKeywords(firstMessage);
    return `Repeated requests about: ${keywords.slice(0, 3).join(', ')}`;
  }

  private static categorizeCorrections(corrections: ClaudeMessage[]): Map<string, ClaudeMessage[]> {
    const categories = new Map<string, ClaudeMessage[]>();

    for (const message of corrections) {
      const text = JSONLParser.extractUserText(message).toLowerCase();
      let category = 'general';

      if (text.includes('code') || text.includes('function') || text.includes('variable')) {
        category = 'code_corrections';
      } else if (text.includes('format') || text.includes('style') || text.includes('structure')) {
        category = 'format_corrections';
      } else if (text.includes('approach') || text.includes('method') || text.includes('way')) {
        category = 'approach_corrections';
      } else if (text.includes('output') || text.includes('result') || text.includes('response')) {
        category = 'output_corrections';
      }

      const existing = categories.get(category) || [];
      existing.push(message);
      categories.set(category, existing);
    }

    return categories;
  }

  private static extractWorkflows(messages: ClaudeMessage[]): Array<{
    id: string;
    description: string;
    messages: ClaudeMessage[];
  }> {
    // Simple workflow extraction based on sequential patterns
    const workflows: Array<{
      id: string;
      description: string;
      messages: ClaudeMessage[];
    }> = [];

    const stepWords = ['first', 'then', 'next', 'after', 'finally'];
    const workflowMessages = messages.filter(msg => {
      const text = JSONLParser.extractUserText(msg).toLowerCase();
      return stepWords.some(step => text.includes(step));
    });

    if (workflowMessages.length >= 2) {
      workflows.push({
        id: 'sequential_steps',
        description: 'User follows sequential step-based workflow',
        messages: workflowMessages
      });
    }

    return workflows;
  }

  private static extractPreferences(text: string, message: ClaudeMessage): Array<{ key: string; value: string }> {
    const preferences: Array<{ key: string; value: string }> = [];
    const lowerText = text.toLowerCase();

    // Extract technology preferences
    const techs = ['react', 'vue', 'angular', 'node', 'python', 'javascript', 'typescript', 'java', 'go'];
    for (const tech of techs) {
      if (lowerText.includes(tech)) {
        if (lowerText.includes('prefer') || lowerText.includes('use') || lowerText.includes('like')) {
          preferences.push({ key: `technology_${tech}`, value: 'preferred' });
        }
      }
    }

    // Extract style preferences
    if (lowerText.includes('camelcase') || lowerText.includes('camel case')) {
      preferences.push({ key: 'naming_convention', value: 'camelCase' });
    }
    if (lowerText.includes('kebab-case') || lowerText.includes('kebab case')) {
      preferences.push({ key: 'naming_convention', value: 'kebab-case' });
    }

    return preferences;
  }

  /**
   * Get pattern summary statistics
   */
  static getPatternsSummary(patterns: UserPattern[]) {
    return {
      total: patterns.length,
      byType: patterns.reduce((acc, pattern) => {
        acc[pattern.type] = (acc[pattern.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      mostFrequent: patterns.slice(0, 5),
      totalFrequency: patterns.reduce((sum, p) => sum + p.frequency, 0)
    };
  }
}