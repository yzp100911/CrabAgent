/**
 * xCrab 技能管理器
 * 加载/管理 skills/ 目录下的 SKILL.md 技能
 * 支持依赖解析、版本回滚、配置面板、分类标签
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');

// --- 解析 YAML frontmatter ---
function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, content: text };

  const yamlBlock = match[1];
  const content = match[2].trim();
  const metadata = {};

  for (const line of yamlBlock.split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) {
      const val = kv[2].replace(/^["']|["']$/g, '');
      if (kv[1] === 'tags') {
        metadata[kv[1]] = val.split(',').map(t => t.trim()).filter(Boolean);
      } else if (kv[1] === 'dependencies') {
        try {
          // 支持 YAML 内联 JSON 或简单的 key: value 格式
          const depMatch = val.match(/\{([\s\S]*)\}/);
          if (depMatch) {
            metadata[kv[1]] = JSON.parse('{' + depMatch[1] + '}');
          } else {
            metadata[kv[1]] = { skills: [], mcp: [] };
          }
        } catch {
          metadata[kv[1]] = { skills: [], mcp: [] };
        }
      } else if (kv[1] === 'config_schema') {
        try {
          metadata[kv[1]] = JSON.parse(val);
        } catch {
          metadata[kv[1]] = {};
        }
      } else {
        metadata[kv[1]] = val;
      }
    }
  }

  return { metadata, content };
}

export class SkillManager {
  constructor() {
    this.skills = new Map();
    this._ensureDir();
  }

  _ensureDir() {
    if (!fs.existsSync(SKILLS_DIR)) {
      fs.mkdirSync(SKILLS_DIR, { recursive: true });
    }
  }

  /** 扫描 skills 目录，加载所有 SKILL.md（跳过带 .disabled 标记的技能） */
  loadAll() {
    this.skills.clear();
    this._ensureDir();

    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(SKILLS_DIR, entry.name);
      const skillPath = path.join(skillDir, 'SKILL.md');

      if (!fs.existsSync(skillPath)) continue;

      const disabledFile = path.join(skillDir, '.disabled');
      if (fs.existsSync(disabledFile)) continue;

      try {
        const raw = fs.readFileSync(skillPath, 'utf-8');
        const { metadata, content } = parseFrontmatter(raw);
        const name = metadata.name || entry.name;

        this.skills.set(name, {
          name,
          description: metadata.description || '',
          tags: metadata.tags || [],
          dependencies: metadata.dependencies || { skills: [], mcp: [] },
          configSchema: metadata.config_schema || {},
          dir: skillDir,
          filePath: skillPath,
          content,
          raw,
        });
      } catch (err) {
        console.error(`  ⚠️ 加载 skill "${entry.name}" 失败:`, err.message);
      }
    }

    return this.skills;
  }

  /** 获取所有 skill 的摘要列表 */
  getSummaryList(filterByTag) {
    let list = Array.from(this.skills.values());
    if (filterByTag) {
      const tag = filterByTag.toLowerCase();
      list = list.filter(s => s.tags.some(t => t.toLowerCase() === tag));
    }
    return list.map(s => ({ name: s.name, description: s.description }));
  }

  /** 格式化 skills 为提示文本 */
  formatSkillsPrompt() {
    const list = this.getSummaryList();
    if (list.length === 0) return '';

    const items = list.map(s =>
      `  <skill name="${s.name}">${s.description}</skill>`
    ).join('\n');

    return `

## 可用技能 (Skills)

你可以使用以下技能来扩展你的能力。当用户请求匹配某个技能描述时，使用 \`read_skill\` 工具加载该技能的完整指令。

\`\`\`xml
${items}
\`\`\``;
  }

  /** 获取某个 skill 的完整内容 */
  getSkillContent(name) {
    const skill = this.skills.get(name);
    return skill ? skill.content : null;
  }

  /** 获取某个 skill 的原始 SKILL.md */
  getSkillRaw(name) {
    const skill = this.skills.get(name);
    return skill ? skill.raw : null;
  }

  /** 获取技能数量 */
  get count() {
    return this.skills.size;
  }

  // ========== 依赖管理 ==========

  /** 获取技能的依赖树 */
  getDependencyTree(name, depth = 0) {
    const skill = this.skills.get(name);
    if (!skill) return null;

    const tree = {
      name: skill.name,
      description: skill.description,
      skills: [],
      mcp: skill.dependencies.mcp || [],
    };

    for (const depName of (skill.dependencies.skills || [])) {
      const dep = this.getDependencyTree(depName, depth + 1);
      if (dep) tree.skills.push(dep);
      else tree.skills.push({ name: depName, missing: true });
    }

    return tree;
  }

  /** 检查技能依赖是否满足 */
  checkDependencies(name) {
    const skill = this.skills.get(name);
    if (!skill) return { ok: false, missing: [], message: `技能 "${name}" 未找到` };

    const missing = [];
    for (const depName of (skill.dependencies.skills || [])) {
      if (!this.skills.has(depName)) {
        missing.push({ type: 'skill', name: depName });
      }
    }

    return {
      ok: missing.length === 0,
      missing,
      message: missing.length > 0
        ? `缺少依赖: ${missing.map(m => `${m.type}:${m.name}`).join(', ')}`
        : '依赖满足',
    };
  }

  // ========== 版本管理 ==========

  /** 回滚技能到上一个版本 */
  rollback(name) {
    const skill = this.skills.get(name);
    if (!skill) return `技能 "${name}" 未找到`;

    const backupDir = path.join(skill.dir, 'backups');
    if (!fs.existsSync(backupDir)) return `技能 "${name}" 没有可回滚的版本`;

    const backups = fs.readdirSync(backupDir).sort().reverse();
    if (backups.length === 0) return `技能 "${name}" 没有可回滚的版本`;

    const latest = backups[0];
    const backupPath = path.join(backupDir, latest, 'SKILL.md');
    if (!fs.existsSync(backupPath)) return `备份文件缺失: ${backupPath}`;

    // 备份当前版本
    try {
      const currentRaw = fs.readFileSync(skill.filePath, 'utf-8');
      const tempBackupDir = path.join(backupDir, `pre-rollback-${Date.now()}`);
      fs.mkdirSync(tempBackupDir, { recursive: true });
      fs.writeFileSync(path.join(tempBackupDir, 'SKILL.md'), currentRaw, 'utf-8');

      // 恢复备份
      const backupContent = fs.readFileSync(backupPath, 'utf-8');
      fs.writeFileSync(skill.filePath, backupContent, 'utf-8');

      this.loadAll();
      return `技能 "${name}" 已回滚到 ${latest.replace(/^v/, '版本 ')}`;
    } catch (err) {
      return `回滚失败: ${err.message}`;
    }
  }

  /** 列出备份版本 */
  listBackups(name) {
    const dir = path.join(SKILLS_DIR, name, 'backups');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).sort().reverse().map(v => ({
      version: v,
      path: path.join(dir, v),
    }));
  }

  // ========== 配置管理 ==========

  /** 获取技能配置 schema */
  getConfigSchema(name) {
    const skill = this.skills.get(name);
    return skill ? skill.configSchema : null;
  }

  /** 获取技能当前配置 */
  getConfig(name) {
    const skill = this.skills.get(name);
    if (!skill) return null;
    const configFile = path.join(skill.dir, 'config.json');
    try {
      if (fs.existsSync(configFile)) {
        return JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      }
    } catch {}
    // 返回默认配置
    const defaults = {};
    const schema = skill.configSchema;
    if (schema && schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        defaults[key] = prop.default || '';
      }
    }
    return defaults;
  }

  /** 设置技能配置 */
  setConfig(name, key, value) {
    const skill = this.skills.get(name);
    if (!skill) return `技能 "${name}" 未找到`;
    const configFile = path.join(skill.dir, 'config.json');
    let config = {};
    try {
      if (fs.existsSync(configFile)) {
        config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      }
    } catch {}
    config[key] = value;
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
    return `技能 "${name}" 配置已更新: ${key} = ${value}`;
  }

  /** 获取技能注入到 system prompt 的配置文本 */
  formatConfigForPrompt() {
    const parts = [];
    for (const [name] of this.skills) {
      const config = this.getConfig(name);
      if (config && Object.keys(config).length > 0) {
        const items = Object.entries(config)
          .map(([k, v]) => `    ${k}: ${v}`).join('\n');
        parts.push(`技能 "${name}" 配置:\n${items}`);
      }
    }
    return parts.length > 0 ? '\n## 技能配置\n' + parts.join('\n\n') : '';
  }

  // ========== 安装/卸载 ==========

  uninstall(name) {
    const skill = this.skills.get(name);
    if (!skill) return `技能 "${name}" 未找到`;
    if (!fs.existsSync(skill.dir)) return `技能目录不存在: ${skill.dir}`;
    fs.rmSync(skill.dir, { recursive: true, force: true });
    this.skills.delete(name);
    return `技能 "${name}" 已卸载`;
  }

  async update(name) {
    const skill = this.skills.get(name);
    if (!skill) return `技能 "${name}" 未找到`;

    // 备份旧版本
    try {
      const backupDir = path.join(skill.dir, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `v${ts}`);
      fs.mkdirSync(backupPath, { recursive: true });
      fs.copyFileSync(skill.filePath, path.join(backupPath, 'SKILL.md'));

      // 复制安装元数据
      const metaFile = path.join(skill.dir, '.install.json');
      if (fs.existsSync(metaFile)) {
        fs.copyFileSync(metaFile, path.join(backupPath, '.install.json'));
      }
    } catch (err) {
      return `备份旧版本失败: ${err.message}`;
    }

    const { installSkill } = await import('./clawhub.js');
    const result = await installSkill(name);
    this.loadAll();
    return `技能 "${name}" 已更新 (旧版本已备份)`;
  }

  disable(name) {
    const skill = this.skills.get(name);
    if (!skill) return `技能 "${name}" 未找到`;
    const flagFile = path.join(skill.dir, '.disabled');
    if (!fs.existsSync(flagFile)) {
      fs.writeFileSync(flagFile, `disabled at ${new Date().toISOString()}\n`, 'utf-8');
    }
    this.skills.delete(name);
    return `技能 "${name}" 已禁用`;
  }

  enable(name) {
    const skillDir = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(skillDir)) return `技能目录不存在: ${name}`;
    const flagFile = path.join(skillDir, '.disabled');
    if (fs.existsSync(flagFile)) {
      fs.unlinkSync(flagFile);
    }
    this.loadAll();
    if (!this.skills.has(name)) return `技能 "${name}" 未找到 SKILL.md`;
    return `技能 "${name}" 已启用`;
  }

  // ========== 查询 ==========

  getInfo(name) {
    const skill = this.skills.get(name);
    if (!skill) return null;

    const disabledFile = path.join(skill.dir, '.disabled');
    const installMetaFile = path.join(skill.dir, '.install.json');

    const info = {
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
      dir: skill.dir,
      disabled: fs.existsSync(disabledFile),
      dependencies: skill.dependencies,
    };

    try {
      if (fs.existsSync(installMetaFile)) {
        const meta = JSON.parse(fs.readFileSync(installMetaFile, 'utf-8'));
        info.source = meta.source || 'unknown';
        info.installedAt = meta.installedAt || null;
        info.version = meta.version || null;
      }
    } catch {
      info.source = 'local';
    }

    // 检查是否有备份
    const backupDir = path.join(skill.dir, 'backups');
    info.hasBackups = fs.existsSync(backupDir) && fs.readdirSync(backupDir).length > 0;

    return info;
  }

  getAllInfo() {
    return Array.from(this.skills.keys()).map(name => this.getInfo(name));
  }
}
