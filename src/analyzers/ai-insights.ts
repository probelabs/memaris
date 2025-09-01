import type { ClaudeMessage, AIInsight } from '../types/index.js';
import { JSONLParser } from '../parsers/jsonl-parser.js';

export class AIInsightAnalyzer {
  private static readonly UNCERTAINTY_PATTERNS = [
    /\b(?:let me try|i'm not sure|not certain|might be|could be|perhaps|maybe|i think|i believe)\b/gi,
    /\b(?:let me check|let me see|let me look|let me examine|let me investigate)\b/gi,
    /\b(?:hmm|hm|um|uh|wait|hold on)\b/gi,
    /\b(?:actually|wait|oh|ah)\b.*(?:let me|i need to|i should)\b/gi
  ];

  private static readonly CORRECTION_PATTERNS = [
    /\b(?:actually|wait|sorry|my mistake|i was wrong|let me correct|i misunderstood)\b/gi,
    /\b(?:let me fix|let me adjust|let me modify|let me change|let me update)\b/gi,
    /\b(?:on second thought|thinking about it|reconsidering)\b/gi,
    /\b(?:instead|rather than|better approach|different way)\b/gi
  ];

  private static readonly LEARNING_PATTERNS = [
    /\b(?:i see|i understand|i realize|i notice|i discovered|i found)\b/gi,
    /\b(?:ah|oh|now i understand|that explains|that makes sense)\b/gi,
    /\b(?:interesting|fascinating|good to know|learned something)\b/gi,
    /\b(?:based on|looking at|examining|after analyzing)\b.*(?:i can see|i notice|i understand)\b/gi
  ];

  private static readonly ASSUMPTION_PATTERNS = [
    /\b(?:assuming|i assume|presumably|likely|probably|should be)\b/gi,
    /\b(?:based on|given that|since|because|as)\b.*(?:probably|likely|assume)\b/gi,
    /\b(?:i'll assume|let's assume|assuming that)\b/gi,
    /\b(?:this should|this would|this might|this could)\b/gi
  ];

  private static readonly CONFUSION_PATTERNS = [
    /\b(?:confused|confusing|unclear|not sure what|what exactly|which one)\b/gi,
    /\b(?:i don't understand|i'm lost|not following|not clear)\b/gi,
    /\b(?:strange|odd|weird|unexpected|surprising)\b/gi,
    /\b(?:wait|hold on|hang on).*(?:what|how|why)\b/gi
  ];

  private static readonly REALIZATION_PATTERNS = [
    /\b(?:oh|ah|wait|i see now|now i get it|that's it)\b/gi,
    /\b(?:eureka|got it|figured it out|makes sense now)\b/gi,
    /\b(?:the issue is|the problem is|i found|i discovered)\b/gi,
    /\b(?:turns out|it appears|it seems|the real)\b.*(?:issue|problem|cause)\b/gi
  ];

  /**
   * Analyze all AI messages in a conversation for insights
   */
  static analyzeConversation(messages: ClaudeMessage[]): AIInsight[] {
    const insights: AIInsight[] = [];
    
    for (const message of messages) {
      if (message.type === 'assistant') {
        const messageInsights = this.analyzeMessage(message);
        insights.push(...messageInsights);
      }
    }

    return insights.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * Analyze a single assistant message for insights
   */
  static analyzeMessage(message: ClaudeMessage): AIInsight[] {
    const insights: AIInsight[] = [];
    const textBlocks = JSONLParser.extractAssistantText(message);
    
    if (textBlocks.length === 0) {
      return insights;
    }

    const fullText = textBlocks.join('\n');
    
    // Analyze each type of pattern
    insights.push(...this.detectPatterns(message, fullText, 'uncertainty', this.UNCERTAINTY_PATTERNS));
    insights.push(...this.detectPatterns(message, fullText, 'correction', this.CORRECTION_PATTERNS));
    insights.push(...this.detectPatterns(message, fullText, 'learning', this.LEARNING_PATTERNS));
    insights.push(...this.detectPatterns(message, fullText, 'assumption', this.ASSUMPTION_PATTERNS));
    insights.push(...this.detectPatterns(message, fullText, 'confusion', this.CONFUSION_PATTERNS));
    insights.push(...this.detectPatterns(message, fullText, 'realization', this.REALIZATION_PATTERNS));

    return insights;
  }

  private static detectPatterns(
    message: ClaudeMessage, 
    text: string, 
    type: AIInsight['type'],
    patterns: RegExp[]
  ): AIInsight[] {
    const insights: AIInsight[] = [];
    
    for (const pattern of patterns) {
      const matches = Array.from(text.matchAll(pattern));
      
      for (const match of matches) {
        if (!match.index) continue;
        
        const matchedText = match[0];
        const context = this.extractContext(text, match.index, 100);
        const confidence = this.calculateConfidence(matchedText, type, context);
        
        // Only include high-confidence matches
        if (confidence > 0.3) {
          insights.push({
            id: `${message.uuid}-${type}-${match.index}`,
            timestamp: message.timestamp,
            content: matchedText.trim(),
            type,
            context: context.trim(),
            confidence,
            sessionId: message.sessionId,
            messageUuid: message.uuid
          });
        }
      }
    }

    return insights;
  }

  private static extractContext(text: string, matchIndex: number, contextLength: number): string {
    const start = Math.max(0, matchIndex - contextLength);
    const end = Math.min(text.length, matchIndex + contextLength);
    
    let context = text.slice(start, end);
    
    // Try to get complete sentences
    const sentences = context.split(/[.!?]+/);
    if (sentences.length >= 3) {
      context = sentences.slice(1, -1).join('.') + '.';
    }
    
    return context;
  }

  private static calculateConfidence(
    matchedText: string, 
    type: AIInsight['type'], 
    context: string
  ): number {
    let confidence = 0.5; // Base confidence
    
    // Adjust based on pattern strength
    const strongIndicators = [
      'actually', 'wait', 'sorry', 'my mistake', 'i was wrong',
      'let me correct', 'i misunderstood', 'i realize', 'i see now',
      'that explains', 'makes sense now', 'i don\'t understand'
    ];
    
    const lowerText = matchedText.toLowerCase();
    for (const indicator of strongIndicators) {
      if (lowerText.includes(indicator)) {
        confidence += 0.2;
        break;
      }
    }
    
    // Adjust based on context richness
    if (context.length > 50) {
      confidence += 0.1;
    }
    
    // Penalize very common/weak patterns
    const weakPatterns = ['let me', 'i think', 'might be'];
    for (const weak of weakPatterns) {
      if (lowerText.includes(weak)) {
        confidence -= 0.1;
        break;
      }
    }
    
    return Math.min(1.0, Math.max(0.0, confidence));
  }

  /**
   * Get insights summary statistics
   */
  static getInsightsSummary(insights: AIInsight[]) {
    const summary = {
      total: insights.length,
      byType: {} as Record<string, number>,
      averageConfidence: 0,
      topInsights: [] as AIInsight[]
    };

    // Count by type
    for (const insight of insights) {
      summary.byType[insight.type] = (summary.byType[insight.type] || 0) + 1;
    }

    // Calculate average confidence
    if (insights.length > 0) {
      summary.averageConfidence = insights.reduce((sum, insight) => 
        sum + insight.confidence, 0) / insights.length;
    }

    // Get top insights (highest confidence)
    summary.topInsights = insights
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);

    return summary;
  }

  /**
   * Filter insights by confidence threshold
   */
  static filterByConfidence(insights: AIInsight[], threshold: number = 0.5): AIInsight[] {
    return insights.filter(insight => insight.confidence >= threshold);
  }

  /**
   * Group insights by session
   */
  static groupBySession(insights: AIInsight[]): Map<string, AIInsight[]> {
    const groups = new Map<string, AIInsight[]>();
    
    for (const insight of insights) {
      const sessionInsights = groups.get(insight.sessionId) || [];
      sessionInsights.push(insight);
      groups.set(insight.sessionId, sessionInsights);
    }
    
    return groups;
  }
}