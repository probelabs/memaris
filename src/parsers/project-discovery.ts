import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { ProjectInfo, SessionInfo } from '../types/index.js';

export class ProjectDiscovery {
  private static readonly CLAUDE_DIR = join(homedir(), '.claude');
  private static readonly PROJECTS_DIR = join(this.CLAUDE_DIR, 'projects');

  /**
   * Discover all Claude Code projects sorted by activity
   */
  static async discoverProjects(): Promise<ProjectInfo[]> {
    try {
      const projectDirs = readdirSync(this.PROJECTS_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      const projects: ProjectInfo[] = [];

      for (const projectDir of projectDirs) {
        const projectPath = join(this.PROJECTS_DIR, projectDir);
        const projectInfo = await this.analyzeProject(projectPath, projectDir);
        if (projectInfo) {
          projects.push(projectInfo);
        }
      }

      // Sort by recent activity (weighted score)
      return projects.sort((a, b) => b.recentActivity - a.recentActivity);
    } catch (error) {
      console.error('Failed to discover projects:', error);
      return [];
    }
  }

  /**
   * Get specific project info
   */
  static async getProjectInfo(projectName: string): Promise<ProjectInfo | null> {
    const projectPath = join(this.PROJECTS_DIR, projectName);
    try {
      const stats = statSync(projectPath);
      if (!stats.isDirectory()) {
        return null;
      }
      return this.analyzeProject(projectPath, projectName);
    } catch {
      return null;
    }
  }

  /**
   * Find most recently active projects
   */
  static async getRecentProjects(limit: number = 5): Promise<ProjectInfo[]> {
    const allProjects = await this.discoverProjects();
    return allProjects.slice(0, limit);
  }

  private static async analyzeProject(projectPath: string, projectName: string): Promise<ProjectInfo | null> {
    try {
      const sessions = await this.discoverSessions(projectPath);
      if (sessions.length === 0) {
        return null;
      }

      const lastModified = Math.max(...sessions.map(s => s.lastModified));
      const recentActivity = this.calculateActivityScore(sessions);

      return {
        path: projectPath,
        name: this.formatProjectName(projectName),
        lastModified,
        sessionCount: sessions.length,
        sessions: sessions.sort((a, b) => 
          new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
        ),
        recentActivity
      };
    } catch (error) {
      console.warn(`Failed to analyze project ${projectName}:`, error);
      return null;
    }
  }

  private static async discoverSessions(projectPath: string): Promise<SessionInfo[]> {
    try {
      const files = readdirSync(projectPath)
        .filter(file => file.endsWith('.jsonl'));

      const sessions: SessionInfo[] = [];

      for (const file of files) {
        const filePath = join(projectPath, file);
        const stats = statSync(filePath);
        
        // Extract session ID from filename (remove .jsonl extension)
        const sessionId = file.replace('.jsonl', '');

        // For message count and last message time, we'd need to parse the file
        // For now, we'll use file stats as approximation
        const sessionInfo: SessionInfo = {
          id: sessionId,
          filePath,
          lastModified: stats.mtime.getTime(),
          messageCount: 0, // Will be filled when parsing
          lastMessageTime: stats.mtime.toISOString(),
          size: stats.size
        };

        sessions.push(sessionInfo);
      }

      return sessions;
    } catch (error) {
      console.warn(`Failed to discover sessions in ${projectPath}:`, error);
      return [];
    }
  }

  private static calculateActivityScore(sessions: SessionInfo[]): number {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;

    let score = 0;

    for (const session of sessions) {
      const age = now - session.lastModified;
      
      if (age < oneDay) {
        score += 100; // Very recent
      } else if (age < oneWeek) {
        score += 50; // Recent
      } else if (age < oneMonth) {
        score += 20; // Somewhat recent
      } else {
        score += 5; // Old
      }

      // Bonus for larger sessions (more content)
      score += Math.min(session.size / 1000, 10);
    }

    return score;
  }

  private static formatProjectName(rawName: string): string {
    // Convert dash-separated paths back to readable names
    return rawName
      .replace(/^-/, '')  // Remove leading dash
      .replace(/-/g, '/')  // Convert dashes back to slashes
      .split('/')
      .pop() || rawName;  // Get just the project name (last part)
  }

  /**
   * Get Claude directory path
   */
  static getClaudeDir(): string {
    return this.CLAUDE_DIR;
  }

  /**
   * Get projects directory path
   */
  static getProjectsDir(): string {
    return this.PROJECTS_DIR;
  }
}