/**
 * xCrab 统计追踪器
 * 提供轻量级 API 供 llm.js 和 tools.js 埋点调用
 */

import { StatsStore } from './store.js';

let _store = null;

/**
 * 初始化统计追踪器
 * @param {string} [dbPath]
 * @returns {StatsStore}
 */
export function initTracker(dbPath) {
  _store = new StatsStore(dbPath);
  return _store;
}

/**
 * 记录 LLM 调用
 * @param {object} data - { model, promptTokens, completionTokens, durationMs }
 */
export function trackLLMCall(data) {
  if (!_store) return;
  try {
    _store.recordLLMCall(data);
  } catch { /* 统计失败不影响主流程 */ }
}

/**
 * 记录工具调用
 * @param {object} data - { toolName, success, durationMs, error }
 */
export function trackToolCall(data) {
  if (!_store) return;
  try {
    _store.recordToolCall(data);
  } catch { /* 统计失败不影响主流程 */ }
}

/**
 * 获取统计数据
 * @returns {object}
 */
export function getStats() {
  if (!_store) return { error: '统计未初始化' };
  try {
    return _store.getSummary();
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * 获取最近 LLM 调用
 */
export function getRecentLLM(limit) {
  if (!_store) return [];
  return _store.getRecentLLMCalls(limit);
}

/**
 * 获取最近工具调用
 */
export function getRecentTools(limit) {
  if (!_store) return [];
  return _store.getRecentToolCalls(limit);
}

/**
 * 获取日统计
 */
export function getDailyStats(days) {
  if (!_store) return [];
  return _store.getDailyStats(days);
}
