/**
 * WorkspaceManager — 轻量级工作区/角色系统
 *
 * 每个 workspace 是一个目录，包含 .md 文件来定义 AI 的人格和上下文：
 *   IDENTITY.md — AI 身份（名字、性格）
 *   SOUL.md     — 核心行为准则
 *   USER.md     — 用户信息
 *   HEARTBEAT.md— 状态跟踪（可选）
 *
 * 目录结构：
 *   <baseDir>/workspace-main/    — 默认工作区
 *   <baseDir>/workspaces/<name>/ — 其他工作区
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASE = path.resolve(__dirname, '..', '..', 'data');

const WORKSPACE_FILES = ['IDENTITY.md', 'SOUL.md', 'USER.md', 'HEARTBEAT.md'];

const DEFAULT_CONTENT = {
  'IDENTITY.md': `# IDENTITY.md — 我是谁

- **名称:** xCrab
- **类型:** AI 智能助手
- **Emoji:** 🦀
- **性格:** 简洁、准确、友好
`,
  'SOUL.md': `# SOUL.md — 核心准则

- 回答要简洁直接，避免冗长
- 不确定时坦承不确定
- 优先使用工具来提供准确信息
- 尊重用户隐私和选择
`,
  'USER.md': `# USER.md — 关于用户

- **名称:** 用户
- **时区:** Asia/Shanghai
- **语言:** 简体中文
`,
  'HEARTBEAT.md': `# HEARTBEAT.md — 定期任务

（可选 — 取消注释以下行来启用定期任务）
# - 每 30 分钟自动总结当前工作状态
`,
};

export class WorkspaceManager {
  /**
   * @param {string} [baseDir] - 工作区根目录，默认 data/
   */
  constructor(baseDir) {
    this.baseDir = baseDir || DEFAULT_BASE;
    /** @type {string} 当前激活的工作区名称 */
    this.activeName = 'main';
    /** @type {object|null} 当前工作区的文件内容 */
    this.currentFiles = null;
    /** @type {number} 版本号，切换/创建工作区时递增，供 History 检测变更 */
    this._version = 0;
  }

  /** 当前工作区版本号 */
  get version() {
    return this._version;
  }

  /** 初始化：确保默认工作区存在，加载当前工作区 */
  async init(activeName) {
    if (activeName) this.activeName = activeName;
    this._ensureDir(this.baseDir);
    this._ensureDefaultWorkspace();
    this.currentFiles = this._loadWorkspace(this.activeName);
  }

  /**
   * 加载指定工作区的全部 .md 文件
   * @param {string} name - 工作区名称
   * @returns {object} { identity, soul, user, heartbeat, raw }
   */
  _loadWorkspace(name) {
    const dir = this._resolveDir(name);
    const result = { identity: '', soul: '', user: '', heartbeat: '' };

    if (!fs.existsSync(dir)) return result;

    for (const file of WORKSPACE_FILES) {
      const fp = path.join(dir, file);
      try {
        const content = fs.readFileSync(fp, 'utf-8').trim();
        const key = file.replace('.md', '').toLowerCase();
        result[key] = content;
      } catch {
        // 文件不存在或读取失败
      }
    }

    return result;
  }

  /**
   * 切换到指定工作区
   * @param {string} name
   * @returns {{ success: boolean, error?: string }}
   */
  switchWorkspace(name) {
    const dir = this._resolveDir(name);
    if (!fs.existsSync(dir)) {
      return { success: false, error: `工作区 "${name}" 不存在` };
    }

    this.activeName = name;
    this.currentFiles = this._loadWorkspace(name);
    this._version++;
    return { success: true };
  }

  /**
   * 列出所有可用工作区
   * @returns {Array<{ name: string, desc: string, fileCount: number }>}
   */
  listWorkspaces() {
    const list = [];

    // workspace-main 始终存在
    const mainDir = this._resolveDir('main');
    if (fs.existsSync(mainDir)) {
      list.push({ name: 'main', desc: '默认工作区', fileCount: this._countFiles(mainDir) });
    }

    // 扫描 workspaces/ 子目录
    const wsDir = path.join(this.baseDir, 'workspaces');
    if (fs.existsSync(wsDir)) {
      try {
        const entries = fs.readdirSync(wsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const infoPath = path.join(wsDir, entry.name, 'IDENTITY.md');
            let desc = '';
            try {
              const firstLine = fs.readFileSync(infoPath, 'utf-8').split('\n')[0] || '';
              desc = firstLine.replace(/^#\s*/, '').trim();
            } catch {}
            list.push({
              name: entry.name,
              desc: desc || `角色: ${entry.name}`,
              fileCount: this._countFiles(path.join(wsDir, entry.name)),
            });
          }
        }
      } catch {}
    }

    return list;
  }

  /**
   * 创建新的工作区（从默认模板复制）
   * @param {string} name
   * @returns {{ success: boolean, error?: string }}
   */
  initWorkspace(name) {
    if (!name || name === 'main') {
      return { success: false, error: '无效的工作区名称' };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return { success: false, error: '名称只能包含字母、数字、下划线和连字符' };
    }

    const dir = path.join(this.baseDir, 'workspaces', name);
    if (fs.existsSync(dir)) {
      return { success: false, error: `工作区 "${name}" 已存在` };
    }

    this._ensureDir(dir);
    for (const file of WORKSPACE_FILES) {
      const fp = path.join(dir, file);
      try {
        fs.writeFileSync(fp, DEFAULT_CONTENT[file], 'utf-8');
      } catch {}
    }

    // 切换到新工作区
    this.activeName = name;
    this.currentFiles = this._loadWorkspace(name);
    this._version++;
    return { success: true };
  }

  /**
   * 格式化当前工作区为 system prompt 文本
   * @param {string} [userId] - 用户标识，用于加载用户级文件（IDENTITY/SOUL/USER）
   * @param {number} [tokenBudget=10000] - token 预算上限
   * @returns {string}
   */
  formatForPrompt(userId = null, tokenBudget = 10000) {
    // 热更新：每次从磁盘重新读取，确保文件修改立即生效
    this.currentFiles = this._loadWorkspace(this.activeName);

    if (!this.currentFiles) return '';

    const parts = [];
    let usedTokens = 0;
    const estimateTokens = (text) => Math.ceil(text.length * 0.75);

    const wsDir = this._resolveDir(this.activeName);

    // 绝对用户隔离：所有工作区文件只读取用户级文件
    // 首次访问时自动从默认模板创建，之后完全隔离
    const userFiles = ['IDENTITY.md', 'SOUL.md', 'USER.md', 'HEARTBEAT.md'];
    const resolved = {};
    for (const file of userFiles) {
      const key = file.replace('.md', '').toLowerCase();
      let content = '';
      let filePath = path.join(wsDir, file);
      if (userId) {
        const userPath = this._getUserFilePath(userId, file);
        filePath = userPath;
        try {
          if (fs.existsSync(userPath)) {
            content = fs.readFileSync(userPath, 'utf-8').trim();
          } else {
            // 首次访问：从默认模板创建用户专属文件
            const userDir = path.dirname(userPath);
            if (!fs.existsSync(userDir)) {
              fs.mkdirSync(userDir, { recursive: true });
            }
            const defaultContent = DEFAULT_CONTENT[file] || '';
            fs.writeFileSync(userPath, defaultContent, 'utf-8');
            content = defaultContent.trim();
            console.log(`  📝 已为用户 ${userId} 创建 ${file}`);
          }
        } catch (err) {
          console.warn(`  ⚠️ 用户文件 ${file} 处理失败: ${err.message}`);
        }
      } else {
        // 无 userId 时使用共享文件（兼容 CLI 等无用户场景）
        content = this.currentFiles[key] || '';
      }
      resolved[key] = { content, path: filePath };
    }

    const header = `\n## 当前工作区 (${this.activeName})\n以下是你的个性化配置文件，用于补充系统提示词中已定义的身份、能力和行为规则（可直接用 write_file 工具按路径修改）：\n\n`;
    usedTokens += estimateTokens(header);

    const entries = [
      { label: 'IDENTITY.md', ...resolved.identity },
      { label: 'SOUL.md', ...resolved.soul },
      { label: 'USER.md', ...resolved.user },
      { label: 'HEARTBEAT.md', ...resolved.heartbeat },
    ];

    for (const { label, path: filePath, content } of entries) {
      if (!content) continue;
      const block = `### ${label} (${filePath})\n${content}`;
      const blockTokens = estimateTokens(block);
      if (usedTokens + blockTokens > tokenBudget) {
        const over = Math.ceil(usedTokens + blockTokens - tokenBudget);
        console.warn(`⚠️ 工作区 ${label} 超出 token 预算，已截断（超出 ~${over} tokens）`);
        parts.push(`### ${label}\n⚠️ 内容过长，已截断`);
        break;
      }
      parts.push(block);
      usedTokens += blockTokens;
    }

    if (parts.length === 0) return '';

    return header + parts.join('\n\n');
  }

  /**
   * 获取用户级工作区文件路径
   * @param {string} userId
   * @param {string} [fileName='USER.md']
   * @returns {string}
   * @private
   */
  _getUserFilePath(userId, fileName = 'USER.md') {
    return path.join(this.baseDir, 'users', userId, fileName);
  }

  /** 获取简短的当前工作区摘要（用于 CLI 显示） */
  getSummary() {
    if (!this.currentFiles) return '未加载';

    const { identity, soul, user } = this.currentFiles;
    const nameMatch = identity?.match(/\*\*名称[：:]\s*(.+)/);
    const typeMatch = identity?.match(/\*\*类型[：:]\s*(.+)/) || identity?.match(/\*\*Type[：:]\s*(.+)/);
    const userName = user?.match(/\*\*名称[：:]\s*(.+)/);

    const lines = [`工作区: ${this.activeName}`];
    if (nameMatch) lines.push(`  AI: ${nameMatch[1].trim()}`);
    if (typeMatch) lines.push(`  类型: ${typeMatch[1].trim()}`);
    if (userName) lines.push(`  用户: ${userName[1].trim()}`);

    const soulLines = soul ? soul.split('\n').filter(l => l.startsWith('- ')).length : 0;
    if (soulLines > 0) lines.push(`  准则: ${soulLines} 条`);

    return lines.join('\n');
  }

  // ---- 内部辅助 ----

  /** 确保默认工作区文件存在 */
  _ensureDefaultWorkspace() {
    const dir = this._resolveDir('main');
    this._ensureDir(dir);

    for (const file of WORKSPACE_FILES) {
      const fp = path.join(dir, file);
      if (!fs.existsSync(fp)) {
        try {
          fs.writeFileSync(fp, DEFAULT_CONTENT[file], 'utf-8');
        } catch (err) {
          console.error(`  ⚠️ 无法创建 ${file}: ${err.message}`);
        }
      }
    }
  }

  /** 解析工作区目录路径 */
  _resolveDir(name) {
    if (name === 'main') {
      return path.join(this.baseDir, 'workspace-main');
    }
    return path.join(this.baseDir, 'workspaces', name);
  }

  /** 确保目录存在 */
  _ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }
  }

  /** 统计目录中的 .md 文件数 */
  _countFiles(dir) {
    let count = 0;
    try {
      const entries = fs.readdirSync(dir);
      for (const e of entries) {
        if (e.endsWith('.md')) count++;
      }
    } catch {}
    return count;
  }
}
