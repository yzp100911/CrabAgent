import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');

const CLAWHUB_API = 'https://clawhub.ai/api/v1';

async function clawhubFetch(url, options = {}) {
  const resp = await fetch(url, options);
  return resp;
}

/**
 * 提取 ZIP 中的 SKILL.md 到目标目录
 */
async function extractZip(buffer, destDir) {
  const { default: AdmZip } = await import('adm-zip');
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  for (const entry of entries) {
    if (path.basename(entry.entryName) === 'SKILL.md') {
      const content = entry.getData().toString('utf-8');
      const parentDir = path.dirname(entry.entryName);
      const extractDir = (parentDir && parentDir !== '.')
        ? path.join(destDir, '..')
        : destDir;
      fs.writeFileSync(path.join(extractDir, 'SKILL.md'), content);
      return;
    }
  }
  throw new Error('SKILL.md 未在 ZIP 包中找到');
}

/**
 * 提取 tar.gz 中的 SKILL.md 到目标目录
 */
async function extractTarGz(buffer, destDir) {
  const { ungzip } = await import('node:zlib');
  const { promisify } = await import('node:util');
  const gunzip = promisify(ungzip);

  const decompressed = await gunzip(buffer);

  let offset = 0;
  while (offset + 512 <= decompressed.length) {
    const header = decompressed.slice(offset, offset + 512);
    const fileName = header.toString('utf-8', 0, 100).replace(/\0/g, '').trim();
    if (!fileName) break;

    const sizeStr = header.toString('utf-8', 124, 136).replace(/\0/g, '').trim();
    const fileSize = parseInt(sizeStr, 8);
    offset += 512;

    if (fileSize > 0 && offset + fileSize <= decompressed.length) {
      const fileContent = decompressed.slice(offset, offset + fileSize);
      if (path.basename(fileName) === 'SKILL.md') {
        fs.writeFileSync(path.join(destDir, 'SKILL.md'), fileContent);
        return;
      }
      offset += Math.ceil(fileSize / 512) * 512;
    }
  }
  throw new Error('SKILL.md 未在 tar 包中找到');
}

/**
 * 从 ClawHub 搜索技能
 * @param {string} query - 搜索关键词
 * @param {object} options - 搜索选项
 * @returns {Promise<Array>} - 技能列表
 */
export async function searchSkills(query, options = {}) {
  const params = new URLSearchParams({ q: query, ...options });
  const url = `${CLAWHUB_API}/search?${params}`;

  const resp = await clawhubFetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!resp.ok) {
    throw new Error(`ClawHub 搜索失败 (${resp.status})`);
  }

  const data = await resp.json();
  const items = data.skills || data.results || data;
  // 统一字段名
  return (Array.isArray(items) ? items : []).map(r => ({
    name: r.slug || r.name,
    displayName: r.displayName || r.name,
    description: r.summary || r.description || '',
    downloads: r.downloads || 0,
    owner: r.ownerHandle || r.owner?.handle || '',
    updatedAt: r.updatedAt || r.updated,
  }));
}

/**
 * 获取技能详情
 * @param {string} slug - 技能标识
 * @returns {Promise<object>}
 */
export async function getSkillDetail(slug) {
  const url = `${CLAWHUB_API}/skills/${encodeURIComponent(slug)}`;

  const resp = await clawhubFetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!resp.ok) {
    throw new Error(`获取技能详情失败 (${resp.status})`);
  }

  return resp.json();
}

/**
 * 从 ClawHub 安装技能
 * @param {string} slug - 技能名称
 * @param {string} [version] - 版本号
 * @returns {Promise<{name: string, dir: string}>}
 */
export async function installSkill(slug, version) {
  // 1. 获取技能详情
  const detail = await getSkillDetail(slug);
  const skillName = detail.name || detail.displayName || slug;

  // 2. 如果已安装，先备份旧版本
  const targetDir = path.join(SKILLS_DIR, skillName);
  const existingSkillPath = path.join(targetDir, 'SKILL.md');
  if (fs.existsSync(existingSkillPath)) {
    try {
      const backupDir = path.join(targetDir, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const ver = version || detail.version || 'unknown';
      const backupPath = path.join(backupDir, `v${ver}-${ts}`);
      fs.mkdirSync(backupPath, { recursive: true });
      fs.copyFileSync(existingSkillPath, path.join(backupPath, 'SKILL.md'));
      // 复制安装元数据
      const metaFile = path.join(targetDir, '.install.json');
      if (fs.existsSync(metaFile)) {
        fs.copyFileSync(metaFile, path.join(backupPath, '.install.json'));
      }
    } catch (err) {
      console.error(`  ⚠️ 备份旧版本失败: ${err.message}`);
    }
  }

  // 3. 下载技能包
  const params = new URLSearchParams({ slug });
  if (version) params.set('version', version);
  const downloadUrl = `${CLAWHUB_API}/download?${params}`;

  const resp = await clawhubFetch(downloadUrl);

  if (!resp.ok) {
    throw new Error(`下载技能包失败 (${resp.status})`);
  }

  // 4. 创建目标目录
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 5. 按魔数检测格式并解压
  const buffer = Buffer.from(await resp.arrayBuffer());

  // ZIP 文件 (PK\x03\x04)
  if (buffer.length > 4 && buffer.readUInt32LE(0) === 0x04034b50) {
    await extractZip(buffer, targetDir);
    return { name: skillName, dir: targetDir };
  }

  // GZip 文件 (1f8b)
  if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    await extractTarGz(buffer, targetDir);
    return { name: skillName, dir: targetDir };
  }

  // 文本格式：直接写入 SKILL.md
  const text = buffer.toString('utf-8').trim();
  if (text) {
    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), text);
  } else {
    throw new Error('技能包内容为空');
  }

  // 6. 写入安装元数据
  try {
    const installMeta = {
      source: 'clawhub',
      slug,
      version: version || (detail.version || null),
      installedAt: Date.now(),
    };
    fs.writeFileSync(path.join(targetDir, '.install.json'), JSON.stringify(installMeta, null, 2), 'utf-8');
  } catch {
    // 元数据写入失败不影响安装
  }

  return { name: skillName, dir: targetDir };
}

/**
 * 列出已安装的技能
 * @returns {Array<{name: string, dir: string}>}
 */
export function listInstalledSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];

  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      skills.push({ name: entry.name, dir: path.join(SKILLS_DIR, entry.name) });
    }
  }

  return skills;
}

