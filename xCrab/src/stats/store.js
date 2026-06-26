/**
 * xCrab 统计数据存储
 * 使用 SQLite 记录 Token 用量、工具调用、响应时间等
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', '..', 'data', 'stats.db');

export class StatsStore {
  constructor(dbPath) {
    this.db = null;
    this.dbPath = dbPath || DB_PATH;
    this._init();
  }

  _init() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS llm_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model TEXT,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tool_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_name TEXT NOT NULL,
        success INTEGER DEFAULT 1,
        duration_ms INTEGER DEFAULT 0,
        error TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content_length INTEGER DEFAULT 0,
        session_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS daily_stats (
        date TEXT PRIMARY KEY,
        llm_calls INTEGER DEFAULT 0,
        tool_calls INTEGER DEFAULT 0,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0
      );
    `);
  }

  /** 记录 LLM 调用 */
  recordLLMCall({ model, promptTokens, completionTokens, durationMs }) {
    const total = (promptTokens || 0) + (completionTokens || 0);
    this.db.prepare(`
      INSERT INTO llm_calls (model, prompt_tokens, completion_tokens, total_tokens, duration_ms)
      VALUES (?, ?, ?, ?, ?)
    `).run(model || 'unknown', promptTokens || 0, completionTokens || 0, total, durationMs || 0);

    // 更新日统计
    const today = new Date().toISOString().slice(0, 10);
    this.db.prepare(`
      INSERT INTO daily_stats (date, llm_calls, prompt_tokens, completion_tokens, total_tokens)
      VALUES (?, 1, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        llm_calls = llm_calls + 1,
        prompt_tokens = prompt_tokens + excluded.prompt_tokens,
        completion_tokens = completion_tokens + excluded.completion_tokens,
        total_tokens = total_tokens + excluded.total_tokens
    `).run(today, promptTokens || 0, completionTokens || 0, total);
  }

  /** 记录工具调用 */
  recordToolCall({ toolName, success, durationMs, error }) {
    this.db.prepare(`
      INSERT INTO tool_calls (tool_name, success, duration_ms, error)
      VALUES (?, ?, ?, ?)
    `).run(toolName, success ? 1 : 0, durationMs || 0, error || null);

    const today = new Date().toISOString().slice(0, 10);
    this.db.prepare(`
      INSERT INTO daily_stats (date, tool_calls)
      VALUES (?, 1)
      ON CONFLICT(date) DO UPDATE SET tool_calls = tool_calls + 1
    `).run(today);
  }

  /** 获取汇总统计 */
  getSummary() {
    const llmRow = this.db.prepare(`
      SELECT COUNT(*) as calls, COALESCE(SUM(prompt_tokens),0) as pt, COALESCE(SUM(completion_tokens),0) as ct,
             COALESCE(SUM(total_tokens),0) as tt, COALESCE(ROUND(AVG(duration_ms)),0) as avg_ms
      FROM llm_calls
    `).get();

    const toolRow = this.db.prepare(`
      SELECT COUNT(*) as calls, COALESCE(SUM(CASE WHEN success=1 THEN 1 ELSE 0 END),0) as ok,
             COALESCE(SUM(CASE WHEN success=0 THEN 1 ELSE 0 END),0) as fail
      FROM tool_calls
    `).get();

    const msgRow = this.db.prepare(`
      SELECT COUNT(*) as total FROM messages
    `).get();

    const todayRow = this.db.prepare(`
      SELECT * FROM daily_stats WHERE date = ?
    `).get(new Date().toISOString().slice(0, 10));

    return {
      llmCalls: llmRow.calls,
      totalTokens: llmRow.tt,
      promptTokens: llmRow.pt,
      completionTokens: llmRow.ct,
      avgDurationMs: llmRow.avg_ms,
      toolCalls: toolRow.calls,
      toolSuccess: toolRow.ok,
      toolFail: toolRow.fail,
      messages: msgRow.total,
      today: todayRow || { llm_calls: 0, tool_calls: 0, total_tokens: 0 },
    };
  }

  /** 获取最近 LLM 调用记录 */
  getRecentLLMCalls(limit = 20) {
    return this.db.prepare(`
      SELECT * FROM llm_calls ORDER BY created_at DESC LIMIT ?
    `).all(limit);
  }

  /** 获取最近工具调用记录 */
  getRecentToolCalls(limit = 20) {
    return this.db.prepare(`
      SELECT * FROM tool_calls ORDER BY created_at DESC LIMIT ?
    `).all(limit);
  }

  /** 获取日统计 */
  getDailyStats(days = 30) {
    return this.db.prepare(`
      SELECT * FROM daily_stats ORDER BY date DESC LIMIT ?
    `).all(days);
  }

  close() {
    if (this.db) this.db.close();
  }
}
