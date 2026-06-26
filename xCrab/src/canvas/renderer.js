/**
 * xCrab Canvas 渲染器
 * AI 生成的图表/可视化数据验证、存储和检索
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.resolve(__dirname, '..', '..', 'data', 'canvas');

/** 支持的图表类型 */
const VALID_TYPES = ['bar', 'line', 'pie', 'table'];

/** Canvas 存储（内存 Map + JSON 文件持久化）*/
const canvases = new Map();

/**
 * 确保存储目录存在
 */
function ensureDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

/**
 * 验证 Canvas 数据结构
 */
function validateCanvas(type, data) {
  if (!type || !VALID_TYPES.includes(type)) {
    return { valid: false, error: `不支持的图表类型: ${type}，支持: ${VALID_TYPES.join(', ')}` };
  }
  if (!data) {
    return { valid: false, error: '数据不能为空' };
  }
  switch (type) {
    case 'bar':
    case 'line':
      if (!data.labels || !Array.isArray(data.labels)) return { valid: false, error: '缺少 labels（标签数组）' };
      if (!data.datasets || !Array.isArray(data.datasets) || data.datasets.length === 0) {
        return { valid: false, error: '缺少 datasets（数据集数组）' };
      }
      for (const ds of data.datasets) {
        if (!ds.values || !Array.isArray(ds.values)) return { valid: false, error: 'dataset 缺少 values 数组' };
        if (ds.values.length !== data.labels.length) return { valid: false, error: 'values 长度与 labels 不匹配' };
      }
      break;
    case 'pie':
      if (!data.labels || !Array.isArray(data.labels)) return { valid: false, error: '缺少 labels' };
      if (!data.values || !Array.isArray(data.values)) return { valid: false, error: '缺少 values' };
      if (data.labels.length !== data.values.length) return { valid: false, error: 'labels 与 values 长度不匹配' };
      break;
    case 'table':
      if (!data.headers || !Array.isArray(data.headers)) return { valid: false, error: '缺少 headers（表头数组）' };
      if (!data.rows || !Array.isArray(data.rows)) return { valid: false, error: '缺少 rows（行数组）' };
      for (const row of data.rows) {
        if (!Array.isArray(row)) return { valid: false, error: '每行必须是一个数组' };
        if (row.length !== data.headers.length) return { valid: false, error: '行长度与表头长度不匹配' };
      }
      break;
  }
  return { valid: true };
}

/**
 * 生成 ID
 */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * 保存 Canvas 数据
 * @param {string} type - 图表类型（bar/line/pie/table）
 * @param {object} data - 图表数据
 * @param {string} [title] - 图表标题
 * @returns {{ id: string, error?: string }}
 */
export function saveCanvas(type, data, title) {
  const validation = validateCanvas(type, data);
  if (!validation.valid) return { error: validation.error };

  const id = genId();
  const entry = {
    id,
    type,
    title: title || '',
    data,
    createdAt: Date.now(),
  };
  canvases.set(id, entry);

  // 持久化到 JSON 文件
  ensureDir();
  try {
    fs.writeFileSync(
      path.join(STORAGE_DIR, `${id}.json`),
      JSON.stringify(entry, null, 2),
      'utf-8',
    );
  } catch (err) {
    // 持久化失败不影响内存使用
    console.error(`  ⚠️ Canvas 持久化失败: ${err.message}`);
  }

  return { id };
}

/**
 * 根据 ID 获取 Canvas
 * @param {string} id
 * @returns {object|null}
 */
export function getCanvas(id) {
  if (canvases.has(id)) return canvases.get(id);

  // 尝试从文件加载
  ensureDir();
  const filePath = path.join(STORAGE_DIR, `${id}.json`);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const entry = JSON.parse(raw);
      canvases.set(id, entry);
      return entry;
    }
  } catch {
    // 文件损坏忽略
  }
  return null;
}

/**
 * 列出所有 Canvas
 * @returns {Array<{id: string, type: string, title: string, createdAt: number}>}
 */
export function listCanvases() {
  return Array.from(canvases.values()).map(c => ({
    id: c.id,
    type: c.type,
    title: c.title,
    createdAt: c.createdAt,
  }));
}

/**
 * 加载已持久化的所有 Canvas
 */
export function loadPersisted() {
  ensureDir();
  try {
    const files = fs.readdirSync(STORAGE_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(STORAGE_DIR, file), 'utf-8');
        const entry = JSON.parse(raw);
        canvases.set(entry.id, entry);
      } catch { /* 跳过坏文件 */ }
    }
  } catch { /* 目录不存在忽略 */ }
}

/**
 * 获取 Canvas 引用标记（供 AI 回复中嵌入）
 * @param {string} id
 * @returns {string}
 */
export function getCanvasRef(id) {
  return `[canvas:${id}]`;
}
