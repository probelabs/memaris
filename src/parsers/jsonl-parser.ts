import { readFileSync } from 'fs';
import type { ClaudeMessage } from '../types/index.js';

export class JSONLParser {
  /**
   * Parse a JSONL file containing Claude Code conversation history
   */
  static parseSessionFile(filePath: string): ClaudeMessage[] {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      const messages: ClaudeMessage[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const parsed = JSON.parse(line) as ClaudeMessage;
          messages.push(parsed);
        } catch (parseError) {
          console.warn(`Failed to parse line in ${filePath}:`, parseError);
          continue;
        }
      }

      return messages.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    } catch (error) {
      console.error(`Failed to read session file ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Extract text content from assistant messages
   */
  static extractAssistantText(message: ClaudeMessage): string[] {
    if (message.type !== 'assistant' || !message.message?.content) {
      return [];
    }

    const content = message.message.content;
    const textBlocks: string[] = [];

    if (typeof content === 'string') {
      textBlocks.push(content);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          textBlocks.push(block.text);
        }
      }
    }

    return textBlocks;
  }

  /**
   * Extract user messages content
   */
  static extractUserText(message: ClaudeMessage): string {
    if (message.type !== 'user' || !message.message?.content) {
      return '';
    }

    const content = message.message.content;
    
    if (typeof content === 'string') {
      return content;
    } else if (Array.isArray(content)) {
      return content
        .filter(block => block.type === 'text' && block.text)
        .map(block => block.text!)
        .join('\n');
    }

    return '';
  }

  /**
   * Build conversation thread from messages
   */
  static buildConversationThread(messages: ClaudeMessage[]): ClaudeMessage[][] {
    const threads: ClaudeMessage[][] = [];
    const messageMap = new Map<string, ClaudeMessage>();
    
    // Build message lookup
    for (const message of messages) {
      messageMap.set(message.uuid, message);
    }

    // Find root messages (no parent)
    const roots = messages.filter(msg => !msg.parentUuid);
    
    for (const root of roots) {
      const thread = this.buildThread(root, messageMap);
      if (thread.length > 0) {
        threads.push(thread);
      }
    }

    return threads;
  }

  private static buildThread(
    message: ClaudeMessage, 
    messageMap: Map<string, ClaudeMessage>
  ): ClaudeMessage[] {
    const thread = [message];
    
    // Find children
    const children = Array.from(messageMap.values())
      .filter(msg => msg.parentUuid === message.uuid)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    for (const child of children) {
      thread.push(...this.buildThread(child, messageMap));
    }

    return thread;
  }

  /**
   * Extract conversation metadata
   */
  static extractMetadata(messages: ClaudeMessage[]) {
    if (messages.length === 0) {
      return null;
    }

    const first = messages[0]!;
    const last = messages[messages.length - 1]!;

    return {
      sessionId: first.sessionId,
      startTime: first.timestamp,
      endTime: last.timestamp,
      messageCount: messages.length,
      cwd: first.cwd,
      gitBranch: first.gitBranch,
      version: first.version,
      userMessages: messages.filter(m => m.type === 'user').length,
      assistantMessages: messages.filter(m => m.type === 'assistant').length,
      duration: new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()
    };
  }
}