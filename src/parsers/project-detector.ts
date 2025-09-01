import { readdirSync, statSync, existsSync } from 'fs';
import { join, resolve, basename } from 'path';
import { homedir } from 'os';
import type { ProjectInfo, SessionInfo } from '../types/index.js';

export class ProjectDetector {
  private static readonly CLAUDE_DIR = join(homedir(), '.claude');
  private static readonly PROJECTS_DIR = join(this.CLAUDE_DIR, 'projects');

  /**
   * Convert a file system path to Claude Code's folder name format
   * e.g., /Users/username/go/src/mnemaris -> -Users-username-go-src-mnemaris
   */
  private static pathToClaudeFolderName(absolutePath: string): string {
    // Remove leading slash and replace all slashes with dashes
    return '-' + absolutePath.substring(1).replace(/\//g, '-');
  }

  /**
   * Detect Claude Code conversations for the current project directory
   */
  static async detectCurrentProject(currentDir: string = process.cwd()): Promise<ProjectInfo | null> {
    try {
      const absolutePath = resolve(currentDir);
      const projectName = basename(absolutePath);
      
      console.log(`🔍 Detecting Claude Code conversations for project: ${projectName}`);
      console.log(`📁 Project directory: ${absolutePath}`);

      // First, try direct path conversion (most reliable)
      const expectedFolderName = this.pathToClaudeFolderName(absolutePath);
      const expectedProjectPath = join(this.PROJECTS_DIR, expectedFolderName);
      
      if (existsSync(expectedProjectPath)) {
        const project = await this.createProjectInfo(expectedProjectPath, expectedFolderName, 'exact-path');
        if (project && project.sessions.length > 0) {
          console.log(`✅ Found Claude Code conversations: ${project.sessions.length} sessions`);
          console.log(`🎯 Match type: ${project.matchType}`);
          return project;
        }
      }

      // Fallback: Try multiple strategies to find matching conversation files
      const matchingProjects = await this.findMatchingProjects(absolutePath, projectName);
      
      if (matchingProjects.length === 0) {
        console.log(`❌ No Claude Code conversations found for this project.`);
        console.log(`💡 Make sure you've used Claude Code in this directory before.`);
        return null;
      }

      if (matchingProjects.length === 1) {
        console.log(`✅ Found Claude Code conversations: ${matchingProjects[0]!.sessions.length} sessions`);
        return matchingProjects[0]!;
      }

      // Multiple matches - pick the most relevant one
      console.log(`🤔 Found ${matchingProjects.length} potential matches:`);
      matchingProjects.forEach((project, i) => {
        console.log(`  ${i + 1}. ${project.name} (${project.sessions.length} sessions, last active: ${new Date(project.lastModified).toLocaleDateString()})`);
      });

      // Return the most recently active one
      const mostRecent = matchingProjects.sort((a, b) => b.lastModified - a.lastModified)[0];
      if (!mostRecent) {
        return null;
      }
      console.log(`✅ Using most recent: ${mostRecent.name}`);
      return mostRecent;

    } catch (error) {
      console.error('Failed to detect project:', error);
      return null;
    }
  }

  /**
   * Find Claude Code project directories that might match the current project
   */
  private static async findMatchingProjects(absolutePath: string, projectName: string): Promise<ProjectInfo[]> {
    try {
      if (!this.claudeDirectoryExists()) {
        return [];
      }

      const projectDirs = readdirSync(this.PROJECTS_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      const matchingProjects: ProjectInfo[] = [];

      for (const projectDir of projectDirs) {
        const claudeProjectPath = join(this.PROJECTS_DIR, projectDir);
        
        // Strategy 1: Exact path match (most reliable)
        if (this.isExactPathMatch(projectDir, absolutePath)) {
          const project = await this.createProjectInfo(claudeProjectPath, projectDir, 'exact-path');
          if (project) matchingProjects.push(project);
          continue;
        }

        // Strategy 2: Project name match
        if (this.isProjectNameMatch(projectDir, projectName)) {
          const project = await this.createProjectInfo(claudeProjectPath, projectDir, 'project-name');
          if (project) matchingProjects.push(project);
          continue;
        }

        // Strategy 3: Partial path match
        if (this.isPartialPathMatch(projectDir, absolutePath)) {
          const project = await this.createProjectInfo(claudeProjectPath, projectDir, 'partial-path');
          if (project) matchingProjects.push(project);
        }
      }

      return matchingProjects;
    } catch (error) {
      console.warn('Error finding matching projects:', error);
      return [];
    }
  }

  private static isExactPathMatch(claudeProjectDir: string, currentPath: string): boolean {
    // Claude Code stores paths like: -Users-username-path-to-project
    // Project names often contain dashes, so we need to preserve them
    
    if (!claudeProjectDir.startsWith('-')) {
      return false;
    }
    
    // Remove the leading dash
    const pathWithoutLeadingDash = claudeProjectDir.substring(1);
    const segments = pathWithoutLeadingDash.split('-');
    
    // Strategy: Try different combinations to handle project names with dashes
    const normalizedCurrentPath = currentPath.replace(/\/$/, '');
    
    // Method 1: Simple replacement (works for paths without dashes in names)
    const simplePath = '/' + pathWithoutLeadingDash.replace(/-/g, '/');
    if (simplePath === normalizedCurrentPath) {
      return true;
    }
    
    // Method 2: Keep last 2 segments as one (works for names like "mnemaris", "big-brain")
    if (segments.length >= 2) {
      const pathSegments = segments.slice(0, -2);
      const projectName = segments.slice(-2).join('-');
      const reconstructedPath = '/' + pathSegments.join('/') + '/' + projectName;
      if (reconstructedPath === normalizedCurrentPath) {
        return true;
      }
    }
    
    // Method 3: Keep last 3 segments as one (for names like "my-awesome-project")
    if (segments.length >= 3) {
      const pathSegments = segments.slice(0, -3);
      const projectName = segments.slice(-3).join('-');
      const reconstructedPath = '/' + pathSegments.join('/') + '/' + projectName;
      if (reconstructedPath === normalizedCurrentPath) {
        return true;
      }
    }
    
    return false;
  }

  private static isProjectNameMatch(claudeProjectDir: string, projectName: string): boolean {
    // Extract the project name from the Claude directory
    const claudeProjectName = claudeProjectDir
      .split('-')
      .pop(); // Get the last segment

    return claudeProjectName?.toLowerCase() === projectName.toLowerCase();
  }

  private static isPartialPathMatch(claudeProjectDir: string, currentPath: string): boolean {
    // Check if the Claude project directory contains parts of the current path
    const normalizedClaudePath = claudeProjectDir
      .replace(/^-/, '')
      .replace(/-/g, '/');

    const currentPathSegments = currentPath.split('/').filter(Boolean);
    const claudePathSegments = normalizedClaudePath.split('/').filter(Boolean);

    // Check if the last 2-3 segments match
    const segmentsToCheck = Math.min(3, currentPathSegments.length, claudePathSegments.length);
    const currentTail = currentPathSegments.slice(-segmentsToCheck);
    const claudeTail = claudePathSegments.slice(-segmentsToCheck);

    return currentTail.some((segment, i) => 
      claudeTail[i] && segment.toLowerCase() === claudeTail[i].toLowerCase()
    );
  }

  private static async createProjectInfo(
    claudeProjectPath: string, 
    claudeProjectDir: string, 
    matchType: string
  ): Promise<ProjectInfo | null> {
    try {
      const sessions = await this.discoverSessions(claudeProjectPath);
      if (sessions.length === 0) {
        return null;
      }

      const lastModified = Math.max(...sessions.map(s => s.lastModified));
      const displayName = this.formatProjectName(claudeProjectDir);

      return {
        path: claudeProjectPath,
        name: displayName,
        lastModified,
        sessionCount: sessions.length,
        sessions: sessions.sort((a, b) => 
          new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
        ),
        recentActivity: this.calculateActivityScore(sessions),
        matchType
      };
    } catch (error) {
      console.warn(`Failed to create project info for ${claudeProjectDir}:`, error);
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
        
        const sessionId = file.replace('.jsonl', '');

        const sessionInfo: SessionInfo = {
          id: sessionId,
          filePath,
          lastModified: stats.mtime.getTime(),
          messageCount: 0,
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

    let score = 0;
    for (const session of sessions) {
      const age = now - session.lastModified;
      
      if (age < oneDay) {
        score += 100;
      } else if (age < oneWeek) {
        score += 50;
      } else {
        score += 20;
      }

      score += Math.min(session.size / 1000, 10);
    }

    return score;
  }

  private static formatProjectName(rawName: string): string {
    return rawName
      .replace(/^-/, '')
      .replace(/-/g, '/')
      .split('/')
      .pop() || rawName;
  }

  private static claudeDirectoryExists(): boolean {
    try {
      const stats = statSync(this.PROJECTS_DIR);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Show debug information about project detection
   */
  static async debugProjectDetection(currentDir: string = process.cwd()): Promise<void> {
    console.log('\n🔍 Project Detection Debug Info:');
    console.log(`Current directory: ${resolve(currentDir)}`);
    console.log(`Project name: ${basename(resolve(currentDir))}`);
    console.log(`Claude projects directory: ${this.PROJECTS_DIR}`);
    
    if (!this.claudeDirectoryExists()) {
      console.log('❌ Claude projects directory not found');
      return;
    }

    try {
      const projectDirs = readdirSync(this.PROJECTS_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      console.log(`\nFound ${projectDirs.length} Claude projects:`);
      projectDirs.slice(0, 10).forEach(dir => {
        console.log(`  ${dir}`);
      });
      
      if (projectDirs.length > 10) {
        console.log(`  ... and ${projectDirs.length - 10} more`);
      }

    } catch (error) {
      console.error('Error reading projects directory:', error);
    }
  }
}

// Add matchType to ProjectInfo interface
declare module '../types/index.js' {
  interface ProjectInfo {
    matchType?: string;
  }
}