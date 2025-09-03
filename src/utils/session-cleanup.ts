import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Tracks and cleans up sessions created by memaris analysis
 */
export class SessionCleanup {
  private createdSessions: Set<string> = new Set();
  private projectPath: string;
  
  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Find the most recent session file created after a timestamp
   */
  findRecentSession(afterTimestamp: number): string | null {
    try {
      const files = fs.readdirSync(this.projectPath)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => {
          const fullPath = path.join(this.projectPath, f);
          const stats = fs.statSync(fullPath);
          return {
            name: f.replace('.jsonl', ''),
            path: fullPath,
            mtime: stats.mtimeMs
          };
        })
        .filter(f => f.mtime > afterTimestamp)
        .sort((a, b) => b.mtime - a.mtime);
      
      if (files.length > 0 && files[0]) {
        return files[0].name;
      }
    } catch (error) {
      console.error('Error finding recent session:', error);
    }
    return null;
  }

  /**
   * Mark a session as created by memaris
   */
  trackSession(sessionId: string) {
    this.createdSessions.add(sessionId);
    console.log(`🗑️  Tracked session for cleanup: ${sessionId}`);
  }

  /**
   * Clean up a specific session file
   */
  private cleanupSession(sessionId: string): boolean {
    try {
      const sessionFile = path.join(this.projectPath, `${sessionId}.jsonl`);
      
      if (fs.existsSync(sessionFile)) {
        // Check if it's a memaris session by looking for our analysis prompts
        const content = fs.readFileSync(sessionFile, 'utf-8');
        
        // Look for memaris-specific patterns
        const isMemarisSession = 
          content.includes('Analyze the entire AI–human development session transcript') ||
          content.includes('Analyze a development session and extract an engaging developer story') ||
          content.includes('development session between a human developer and an AI assistant') ||
          content.includes('CONFIDENCE SCORING CRITERIA') ||
          content.includes('session-context') ||
          content.includes('analysis-criteria');
        
        if (isMemarisSession) {
          fs.unlinkSync(sessionFile);
          console.log(`  ✅ Deleted memaris session: ${sessionId}`);
          return true;
        } else {
          // Silently skip real user sessions - no need to log
          return false;
        }
      }
    } catch (error) {
      console.error(`  ❌ Error cleaning up session ${sessionId}:`, error);
    }
    return false;
  }

  /**
   * Clean up all tracked sessions
   */
  cleanup() {
    if (this.createdSessions.size === 0) {
      return;
    }

    console.log(`\n🧹 Cleaning up ${this.createdSessions.size} memaris analysis session(s)...`);
    
    let cleaned = 0;
    for (const sessionId of this.createdSessions) {
      if (this.cleanupSession(sessionId)) {
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`✨ Cleaned up ${cleaned} session(s)`);
    }
    
    this.createdSessions.clear();
  }

  /**
   * Clean up existing memaris pollution (sessions from previous runs)
   */
  cleanupExistingPollution() {
    console.log('🔍 Scanning for existing memaris session pollution...');
    
    try {
      const files = fs.readdirSync(this.projectPath)
        .filter(f => f.endsWith('.jsonl'));
      
      let cleaned = 0;
      for (const file of files) {
        const sessionId = file.replace('.jsonl', '');
        // Don't clean up sessions we're tracking (they'll be cleaned later)
        if (!this.createdSessions.has(sessionId)) {
          if (this.cleanupSession(sessionId)) {
            cleaned++;
          }
        }
      }
      
      if (cleaned > 0) {
        console.log(`✨ Cleaned up ${cleaned} existing memaris session(s)`);
      } else {
        console.log('✅ No existing memaris sessions found to clean up');
      }
    } catch (error) {
      console.error('Error during pollution cleanup:', error);
    }
  }
}