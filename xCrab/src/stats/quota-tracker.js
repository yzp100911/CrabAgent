/**
 * xCrab 配额追踪器
 * 监控 MiniMax MCP 工具（web_search / understand_image）的调用配额
 * MiniMax 限制：60次/5小时/每工具
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', '..', 'data', 'quota.db');

const QUOTA_WINDOW_MS = 5 * 60 * 60 * 1000;
const MAX_CALLS = 60;
const WARN_AT = 10;
const CRITICAL_AT = 5;

export class QuotaTracker {
  constructor(dbPath) {
    this.dbPath = dbPath || DB_PATH;
    this.db = null;
    this._init();
  }

  _init() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS quota_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_name TEXT NOT NULL,
        called_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_quota_tool_time ON quota_calls(tool_name, called_at);
    `);
  }

  recordCall(toolName) {
    this.db.prepare('INSERT INTO quota_calls (tool_name, called_at) VALUES (?, ?)').run(toolName, Date.now());
    this.db.prepare('DELETE FROM quota_calls WHERE tool_name = ? AND called_at < ?').run(toolName, Date.now() - QUOTA_WINDOW_MS);
  }

  getCallCount(toolName) {
    const cutoff = Date.now() - QUOTA_WINDOW_MS;
    const row = this.db.prepare('SELECT COUNT(*) as count FROM quota_calls WHERE tool_name = ? AND called_at >= ?').get(toolName, cutoff);
    return row?.count || 0;
  }

  getRemaining(toolName) {
    return Math.max(0, MAX_CALLS - this.getCallCount(toolName));
  }

  checkQuota(toolName) {
    const remaining = this.getRemaining(toolName);
    if (remaining <= 0) {
      const resetInfo = this._getResetInfo();
      return { allowed: false, remaining: 0, message: `⚠️ 配额已耗尽 — web_search/understand_image 在最近5小时内已达到调用上限(60次)${resetInfo}后重试。` };
    }
    if (remaining <= CRITICAL_AT) {
      return { allowed: true, remaining, message: `⚠️ 配额紧张 — web_search/understand_image 剩余仅 ${remaining} 次(上限60次/5小时)，即将用完！` };
    }
    if (remaining <= WARN_AT) {
      return { allowed: true, remaining, message: `⚠️ 配额提醒 — web_search/understand_image 剩余 ${remaining} 次(上限60次/5小时)。` };
    }
    return { allowed: true, remaining, message: null };
  }

  /**
   * 原子性检查并记录配额调用
   * 在同一个事务中完成 check + record，避免并发竞态
   * @param {string} toolName
   * @returns {{ allowed: boolean, remaining: number, message: string|null }}
   */
  checkAndRecord(toolName) {
    const txn = this.db.transaction(() => {
      const cutoff = Date.now() - QUOTA_WINDOW_MS;
      const row = this.db.prepare('SELECT COUNT(*) as count FROM quota_calls WHERE tool_name = ? AND called_at >= ?').get(toolName, cutoff);
      const currentCount = row?.count || 0;
      const remaining = Math.max(0, MAX_CALLS - currentCount);

      if (remaining <= 0) {
        // 配额已耗尽，不记录（避免配额耗尽后无限累加）
        return { allowed: false, remaining: 0, message: `⚠️ 配额已耗尽 — 最近5小时内已达到调用上限(60次)` };
      }

      // 原子性写入调用记录
      this.db.prepare('INSERT INTO quota_calls (tool_name, called_at) VALUES (?, ?)').run(toolName, Date.now());
      // 清理过期记录
      this.db.prepare('DELETE FROM quota_calls WHERE tool_name = ? AND called_at < ?').run(toolName, cutoff);

      if (remaining <= CRITICAL_AT) {
        return { allowed: true, remaining: remaining - 1, message: `⚠️ 配额紧张 — 剩余仅 ${remaining - 1} 次(上限60次/5小时)` };
      }
      if (remaining <= WARN_AT) {
        return { allowed: true, remaining: remaining - 1, message: `⚠️ 配额提醒 — 剩余 ${remaining - 1} 次(上限60次/5小时)` };
      }
      return { allowed: true, remaining: remaining - 1, message: null };
    });

    return txn();
  }

  _getResetInfo() {
    const cutoff = Date.now() - QUOTA_WINDOW_MS;
    const oldest = this.db.prepare('SELECT MIN(called_at) as oldest FROM quota_calls WHERE called_at >= ?').get(cutoff);
    if (oldest?.oldest) {
      const resetAt = new Date(oldest.oldest + QUOTA_WINDOW_MS);
      const h = resetAt.getHours().toString().padStart(2, '0');
      const m = resetAt.getMinutes().toString().padStart(2, '0');
      return `，大约 ${h}:${m}`;
    }
    return '，稍后';
  }

  getSummary() {
    const tools = ['understand_image', 'web_search'];
    const summary = {};
    for (const t of tools) {
      summary[t] = { used: this.getCallCount(t), remaining: this.getRemaining(t), maxPerWindow: MAX_CALLS };
    }
    return summary;
  }

  close() {
    if (this.db) this.db.close();
  }
}
