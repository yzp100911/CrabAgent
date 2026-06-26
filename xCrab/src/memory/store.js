/**
 * xCrab 持久化记忆系统
 * 基于 SQLite 的三层记忆存储
 * - short: 短期记忆，仅当前对话有效
 * - mid: 中期记忆，跨会话持久化，自动摘要压缩
 * - long: 长期记忆，重要事实，不会自动清理
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SQLiteStore } from './sqlite-store.js';
import { EmbeddingService } from './embedding.js';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class MemoryStore {
  /**
   * @param {object} [options]
   * @param {string} [options.dbPath] - SQLite 文件路径
   * @param {number} [options.maxMidMemories] - 中期记忆上限，超过后触发衰减
   * @param {number} [options.maxLongMemories] - 长期记忆上限，超过后拒绝保存（缺陷1）
   * @param {object} [options.decayWeights] - 衰减算法自定义权重（缺陷7）
   * @param {number} [options.decayAgeWindowDays] - 衰减老化窗口天数（默认30）
   * @param {number} [options.duplicateThreshold] - 去重相似度阈值（0-1，默认0.8）
   */
  constructor(options = {}) {
    this.dbPath = options.dbPath || path.resolve(__dirname, '..', '..', 'memory', 'memories.db');
    this.maxMidMemories = options.maxMidMemories || 100;
    this.maxLongMemories = options.maxLongMemories || 50;
    this._changeCount = 0;
    this._db = new SQLiteStore(this.dbPath);

    // 衰减参数可配置（缺陷7）
    this._decayWeights = {
      category: { user_info: 10, preference: 6, fact: 4, general: 2, ...(options.decayWeights?.category || {}) },
      accessMultiplier: options.decayWeights?.accessMultiplier ?? 4,
      agePenaltyMax: options.decayWeights?.agePenaltyMax ?? 3,
      lengthBonusMax: options.decayWeights?.lengthBonusMax ?? 3,
    };
    this._decayAgeWindowDays = options.decayAgeWindowDays || 30;
    this._duplicateThreshold = options.duplicateThreshold || 0.8;
    this._shortTtlMs = options.shortTtlMs || 168 * 60 * 60 * 1000; // 缺陷1：短期记忆 TTL，默认168小时(7天)
    this._saveMutex = Promise.resolve(); // 缺陷11：异步互斥锁，替代 CPU 自旋

    this._migrateFromJson();

    // 向量嵌入服务（异步初始化，不阻塞启动）
    this._embedding = new EmbeddingService();
    this._embedReady = false;
    this._embedding.init().then(ready => {
      this._embedReady = ready;
      if (ready) {
        console.log('  🧬 向量嵌入模型已加载 (bge-base-zh-v1.5)');
        this._backfillEmbeddings();
      } else {
        console.log('  ⚠️ 向量嵌入模型加载失败，语义搜索不可用');
      }
    });

    // 缺陷1：启动时清理过期短期记忆 + 定期清理
    this._cleanExpiredShort();
    this._ttlTimer = setInterval(() => this._cleanExpiredShort(), 24 * 60 * 60 * 1000); // 每24小时清理
  }

  /**
   * 从旧版 JSON 文件迁移数据
   */
  _migrateFromJson() {
    const oldFile = path.resolve(__dirname, '..', '..', 'memory', 'memories.json');
    if (!fs.existsSync(oldFile)) return;

    try {
      const raw = fs.readFileSync(oldFile, 'utf-8');
      const data = JSON.parse(raw);

      if (data.memories && Array.isArray(data.memories)) {
        for (const m of data.memories) {
          this._db.upsert(m.key, m.value, {
            category: m.category || 'general',
            level: 'mid',
          });
        }
        console.log(`  📦 已从 memories.json 迁移 ${data.memories.length} 条记忆`);
      }

      if (data.conversations && Array.isArray(data.conversations)) {
        for (const c of data.conversations) {
          this._db.saveConversationSummary(c.summary || '(迁移摘要)');
        }
      }

      // 重命名旧文件，避免重复迁移
      fs.renameSync(oldFile, oldFile + '.bak');
      console.log('  📦 旧版 memories.json 已备份为 memories.json.bak');
    } catch (err) {
      console.error(`  ⚠️ 记忆迁移失败: ${err.message}`);
    }
  }

  /**
   * 存储一条记忆（异步互斥，防止并发竞态）
   * @param {string} key - 键名
   * @param {string} value - 内容
   * @param {string} [category] - 分类
   * @param {string} [level] - 层级: short|mid|long
   * @param {string} [userId] - 用户标识
   * @returns {Promise<{ ok: boolean, reason?: string }>} 保存结果
   */
  save(key, value, category = 'general', level = 'mid', userId = null) {
    this._saveMutex = this._saveMutex
      .then(() => this._doSave(key, value, category, level, userId))
      .catch(err => ({ ok: false, reason: `保存异常: ${err.message}` }));
    return this._saveMutex;
  }

  /** @private */
  _doSave(key, value, category, level, userId) {
    // 长期记忆数量上限检查
    if (level === 'long') {
      const longCount = this._db.getByLevel('long', this.maxLongMemories + 1, userId).length;
      if (longCount >= this.maxLongMemories) {
        return { ok: false, reason: `长期记忆已满（上限 ${this.maxLongMemories} 条），请先删除不需要的长期记忆或降低为 mid 级别` };
      }
    }

    // 去重检测 — 检查是否有相似内容的记忆
    const existing = this._db.exists(key, userId);
    if (!existing) {
      const duplicates = this._findSimilarMemories(value, category, userId);
      if (duplicates.length > 0) {
        const best = duplicates[0];
        this._db.upsert(best.key, value, { category, level, userId });
        this._changeCount++;
        if (this._changeCount % 10 === 0) this._autoDecay();
        return { ok: true, merged: true, mergedInto: best.key };
      }
    }

    // 缺陷6：冲突检测 — 同 category 下是否有同主题但不同值的记忆
    const conflicts = this._detectConflicts(key, value, category, userId);
    if (conflicts.length > 0) {
      // 自动覆盖旧的冲突记忆（最新的为准）
      for (const c of conflicts) {
        this._db.remove(c.key);
      }
    }

    this._db.upsert(key, value, { category, level, userId });
    this._changeCount++;
    if (this._changeCount % 10 === 0) {
      this._autoDecay();
    }

    // 异步生成向量嵌入（fire-and-forget，不阻塞返回）
    if (this._embedReady) {
      const memId = this._db._getLastInsertId(key, userId);
      if (memId) {
        const text = `${key}: ${value}`;
        this._embedding.embed(text).then(vec => {
          if (vec) this._db.saveEmbedding(memId, vec, 'bge-base-zh-v1.5');
        }).catch(() => {});
      }
    }

    return { ok: true, conflictsResolved: conflicts.length };
  }

  /**
   * 为已有记忆回填向量嵌入
   * @private
   */
  async _backfillEmbeddings() {
    try {
      const all = this._db.getAll();
      let backfilled = 0;
      for (const m of all) {
        const existing = this._db._embedGet.get(m.id);
        if (!existing) {
          const text = `${m.key}: ${m.value}`;
          const vec = await this._embedding.embed(text);
          if (vec) {
            this._db.saveEmbedding(m.id, vec, 'bge-base-zh-v1.5');
            backfilled++;
          }
        }
      }
      if (backfilled > 0) {
        console.log(`  🧬 已回填 ${backfilled} 条记忆的向量嵌入`);
      }
    } catch (err) {
      console.warn(`  ⚠️ 向量回填失败: ${err.message}`);
    }
  }

  /**
   * 缺陷6：检测同主题冲突记忆
   * 例如已有 user_name=张三，新存 user_name=李四 → 冲突
   * @private
   */
  _detectConflicts(key, value, category, userId = null) {
    if (!['user_info', 'preference'].includes(category)) return [];
    const keyCore = key.replace(/^(user_?|my_?|preferred_?)/i, '').toLowerCase();
    if (keyCore.length < 2) return [];
    const similar = this._db.search(keyCore, { limit: 10, userId });
    return similar.filter(m =>
      m.key !== key &&
      m.category === category &&
      m.value !== value &&
      (m.key.toLowerCase().includes(keyCore) || key.toLowerCase().includes(m.key.toLowerCase().replace(/^(user_?|my_?|preferred_?)/i, '')))
    );
  }

  /**
   * 查找与给定内容相似的记忆（缺陷3：词级 Jaccard 相似度）
   * @private
   */
  _findSimilarMemories(value, category, userId = null) {
    // 先用 FTS 搜索相关内容
    const keywords = value.replace(/[^\w一-鿿]+/g, ' ').trim().split(/\s+/).filter(w => w.length >= 2);
    if (keywords.length === 0) return [];

    // 用最长的几个关键词搜索
    const topKeywords = keywords.sort((a, b) => b.length - a.length).slice(0, 3);
    const candidates = new Map();
    for (const kw of topKeywords) {
      const results = this._db.search(kw, { limit: 10, userId });
      for (const r of results) {
        if (r.category === category) {
          candidates.set(r.key, r);
        }
      }
    }

    // 缺陷3：词级 Jaccard 相似度（而非字符级）
    const valueTokens = this._tokenize(value);
    return [...candidates.values()]
      .map(m => {
        const existingTokens = this._tokenize(m.value);
        const intersection = [...valueTokens].filter(t => existingTokens.has(t)).length;
        const union = new Set([...valueTokens, ...existingTokens]).size;
        const similarity = union > 0 ? intersection / union : 0;
        return { ...m, _similarity: similarity };
      })
      .filter(m => m._similarity >= this._duplicateThreshold)
      .sort((a, b) => b._similarity - a._similarity);
  }

  /**
   * 分词器：中文按字/词切分，英文按空格切分，转小写去重
   * @private
   */
  _tokenize(text) {
    if (!text) return new Set();
    const tokens = new Set();
    // 英文单词
    const englishWords = text.toLowerCase().match(/[a-z][a-z0-9]*/g) || [];
    for (const w of englishWords) tokens.add(w);
    // 中文：连续中文字符 + 2-gram 滑动窗口
    const chinese = text.match(/[一-鿿]+/g) || [];
    for (const seg of chinese) {
      for (let i = 0; i < seg.length; i++) {
        tokens.add(seg[i]);
        if (i + 1 < seg.length) tokens.add(seg.slice(i, i + 2));
      }
    }
    return tokens;
  }

  /**
   * 读取一条记忆
   * @param {string} key
   * @param {string} [userId]
   * @returns {string|null}
   */
  load(key, userId = null) {
    return this._db.load(key, userId);
  }

  /**
   * 删除一条记忆
   * @param {string} key
   */
  remove(key) {
    this._db.remove(key);
  }

  /**
   * 批量删除记忆
   * @param {string[]} keys
   * @param {string} [userId]
   * @returns {number} 删除数量
   */
  removeBatch(keys, userId = null) {
    return this._db.removeBatch(keys, userId);
  }

  /**
   * 清空所有记忆
   * @param {string} [userId]
   * @param {string} [level]
   * @returns {number} 删除数量
   */
  clearAll(userId = null, level = null) {
    return this._db.clearAll(userId, level);
  }

  /**
   * 获取所有记忆
   * @param {string} [userId]
   * @returns {Array}
   */
  getAll(userId = null) {
    return this._db.getAll(userId);
  }

  /**
   * 搜索相关记忆（含向量语义搜索）
   * @param {string} query
   * @param {object} [opts] - { limit, userId }
   * @returns {Promise<Array>}
   */
  async search(query, opts = {}) {
    if (this._embedReady) {
      try {
        const queryVec = await this._embedding.embed(query);
        if (queryVec) {
          opts.queryEmbedding = queryVec;
          opts.embeddingThreshold = config.memory.embeddingThreshold;
          console.log(`  🧬 查询向量已生成, 维度=${queryVec.length}, 阈值=${opts.embeddingThreshold}`);
        } else {
          console.log(`  ⚠️ 查询向量生成失败 (embed 返回 null)`);
        }
      } catch (err) {
        console.warn(`  ⚠️ embed 异常: ${err.message}`);
      }
    } else {
      console.log(`  ⚠️ 嵌入模型未就绪 (_embedReady=${this._embedReady})`);
    }
    return this._db.search(query, opts);
  }

  /**
   * 带评分的搜索，返回结果附带 relevance 字段 (0-1)
   * @param {string} query
   * @param {object} [opts] - { limit, userId }
   * @returns {Promise<Array>}
   */
  async searchWithScore(query, opts = {}) {
    if (this._embedReady) {
      try {
        const queryVec = await this._embedding.embed(query);
        if (queryVec) {
          opts.queryEmbedding = queryVec;
          opts.embeddingThreshold = config.memory.embeddingThreshold;
        }
      } catch {}
    }
    return this._db.searchWithScore(query, opts);
  }

  /**
   * 按层级获取记忆
   * @param {string} level
   * @param {number} limit
   * @param {string} [userId]
   * @returns {Array}
   */
  getByLevel(level, limit = 100, userId = null) {
    return this._db.getByLevel(level, limit, userId);
  }

  /**
   * 检查 key 是否存在（不触发 access_count 自增）
   * @param {string} key
   * @param {string} [userId]
   * @returns {boolean}
   */
  exists(key, userId = null) {
    return this._db.exists(key, userId);
  }

  /**
   * 保存对话摘要（缺陷6：支持元数据）
   * @param {string} summary
   * @param {object} [meta]
   * @param {string} [meta.workspace]
   * @param {string} [meta.userId]
   * @param {string[]} [meta.tags]
   */
  saveConversationSummary(summary, meta = {}) {
    this._db.saveConversationSummary(summary, meta);
  }

  /**
   * 获取最近的对话摘要
   * @param {number} limit
   * @param {object} [opts]
   * @returns {string[]}
   */
  getRecentSummaries(limit = 5, opts = {}) {
    return this._db.getRecentSummaries(limit, opts);
  }

  /**
   * 自动衰减：当中期记忆超过上限时，按重要性评分选择衰减对象
   * 缺陷12：衰减透明化 — 记录衰减日志，支持回收站查询
   */
  _autoDecay() {
    try {
      const mids = this._db.getByLevel('mid', this.maxMidMemories + 10);
      if (mids.length <= this.maxMidMemories) return;

      const scored = mids.map(m => ({
        ...m,
        _decayScore: this._calculateDecayScore(m),
      }));
      scored.sort((a, b) => a._decayScore - b._decayScore);

      const excess = mids.length - this.maxMidMemories;
      const decayCount = Math.max(5, Math.min(15, excess, Math.ceil(mids.length * 0.1)));
      const toArchive = scored.slice(0, decayCount);

      const lowValue = toArchive.filter(m => m._decayScore < 5);
      const midValue = toArchive.filter(m => m._decayScore >= 5);

      // 低价值记忆移入回收站（而非直接丢弃）
      const recycled = [];
      for (const m of lowValue) {
        recycled.push({ key: m.key, value: m.value, category: m.category, score: m._decayScore });
        this._db.remove(m.key);
      }

      // 中等价值记忆压缩为归档摘要
      if (midValue.length > 0) {
        const summaryParts = midValue.map(m => `${m.key}(${m.category})`);
        const summaryText = summaryParts.join(', ') + ' 等 ' + midValue.length + ' 条记忆';

        for (const m of midValue) {
          recycled.push({ key: m.key, value: m.value, category: m.category, score: m._decayScore });
          this._db.remove(m.key);
        }

        this._db.upsert(`_archive_${Date.now()}`, `[归档] ${summaryText}`, {
          category: 'archive',
          level: 'long',
        });
      }

      // 缺陷12：保存衰减日志到回收站（最近 100 条）
      if (recycled.length > 0) {
        this._db.saveDecayLog(recycled);
      }
    } catch {
      // 衰减失败不阻塞业务
    }
  }

  /**
   * 缺陷12：获取衰减回收站内容（可恢复的记忆）
   * @param {number} limit
   * @returns {Array}
   */
  getDecayRecycleBin(limit = 50) {
    return this._db.getDecayLog(limit);
  }

  /**
   * 缺陷12：从回收站恢复记忆
   * @param {number} logId - 衰减日志 ID
   * @returns {{ ok: boolean, restored?: string }}
   */
  restoreFromRecycleBin(logId) {
    const entry = this._db.getDecayLogById(logId);
    if (!entry) return { ok: false, reason: '记录不存在' };

    const data = JSON.parse(entry.memories_json);
    const restored = [];
    for (const m of data) {
      this._db.upsert(m.key, m.value, { category: m.category || 'general', level: m.level || 'mid', userId: m.user_id || null });
      restored.push(m.key);
    }
    this._db.removeDecayLog(logId);
    return { ok: true, restored: restored.join(', ') };
  }

  /** 从回收站永久删除单条记录 */
  deleteFromRecycleBin(logId) {
    const entry = this._db.getDecayLogById(logId);
    if (!entry) return { ok: false, reason: '记录不存在' };
    this._db.removeDecayLog(logId);
    return { ok: true };
  }

  /** 清空回收站所有记录 */
  clearRecycleBin() {
    this._db.clearAllDecayLogs();
    return { ok: true };
  }

  /**
   * 计算记忆的衰减优先级分数（分数越低越应该被衰减）
   * 使用可配置权重（缺陷7）
   */
  _calculateDecayScore(memory) {
    const w = this._decayWeights;
    const accessWeight = Math.log10((memory.access_count || 0) + 1) * w.accessMultiplier;
    const categoryWeight = w.category[memory.category] || 2;
    const daysSinceUpdate = (Date.now() - (memory.updated_at || 0)) / (1000 * 60 * 60 * 24);
    const agePenalty = Math.max(0, 1 - daysSinceUpdate / this._decayAgeWindowDays) * w.agePenaltyMax;
    const lengthBonus = Math.min((memory.value?.length || 0) / 100, w.lengthBonusMax);
    return accessWeight + categoryWeight + agePenalty + lengthBonus;
  }

  /**
   * 计算单条记忆的重要性分数（用于 prompt 注入排序）
   */
  _calculateImportance(memory) {
    const levelWeights = { long: 10, mid: 5, short: 1 };
    const categoryWeights = { user_info: 8, preference: 6, fact: 5, general: 2, archive: 1 };
    const levelScore = levelWeights[memory.level] || 2;
    const categoryScore = categoryWeights[memory.category] || 2;
    const accessScore = Math.log10((memory.access_count || 0) + 1) * 3;
    const daysSinceUpdate = (Date.now() - (memory.updated_at || 0)) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 1 - daysSinceUpdate / 90) * 2;
    return levelScore + categoryScore + accessScore + recencyScore;
  }

  /**
   * 从记忆列表中选出应注入 prompt 的记忆
   * - long 级记忆全部保留
   * - 其余按重要性分数排序，取 top N
   */
  _rankedSelection(memories, maxCount = 30) {
    const longs = memories.filter(m => m.level === 'long');
    const others = memories.filter(m => m.level !== 'long' && m.level !== 'short');

    const scored = others.map(m => ({
      ...m,
      _importance: this._calculateImportance(m),
    }));
    scored.sort((a, b) => b._importance - a._importance);

    const remainingSlots = Math.max(0, maxCount - longs.length);
    const selected = [...longs, ...scored.slice(0, remainingSlots)];

    // 按 level 优先级排序（long 在前），同 level 按 importance 降序
    selected.sort((a, b) => {
      const levelOrder = { long: 0, mid: 1, short: 2 };
      const la = levelOrder[a.level] ?? 1;
      const lb = levelOrder[b.level] ?? 1;
      if (la !== lb) return la - lb;
      return (b._importance || 0) - (a._importance || 0);
    });

    return selected;
  }

  /**
   * 将记忆格式化为 system prompt 可用的文本
   * @param {string} [userId] - 按用户过滤记忆，null 则返回所有
   * @param {number} [tokenBudget] - 最大 token 预算（近似值，1中文字≈1.5token），默认 2000
   * @returns {string}
   */
  formatForPrompt(userId = null, tokenBudget = 10000) {
    // 安全防护：未识别用户不注入任何记忆，防止跨用户泄露
    if (!userId) return '';

    const parts = [];
    let usedTokens = 0;
    const allMemories = this._db.getAll(userId);

    const selected = this._rankedSelection(allMemories, 30);
    if (selected.length > 0) {
      parts.push('## 关于用户的记忆');
      usedTokens += 10;

      for (const m of selected) {
        const tag = m.level === 'long' ? ' [长期]' : '';
        const line = `  ${m.key}: ${m.value}${tag}`;
        const lineTokens = Math.ceil(line.length * 0.75); // 近似 token 计算
        if (usedTokens + lineTokens > tokenBudget) {
          const over = Math.ceil(usedTokens + lineTokens - tokenBudget);
          console.warn(`⚠️ 记忆内容超出 token 预算，已截断（超出 ~${over} tokens）`);
          parts.push(`  ... 还有 ${selected.length - parts.length + 1} 条记忆因 token 预算限制未显示`);
          break;
        }
        parts.push(line);
        usedTokens += lineTokens;
      }
    }

    const summaries = this.getRecentSummaries(5, { userId });
    if (summaries.length > 0) {
      parts.push('\n## 历史对话摘要');
      usedTokens += 10;
      for (const s of summaries) {
        const text = typeof s === 'object' && s.summary ? s.summary : String(s);
        const tags = (typeof s === 'object' && s.tags) ? ` [${s.tags}]` : '';
        const line = `  - ${text}${tags}`;
        const lineTokens = Math.ceil(line.length * 0.75);
        if (usedTokens + lineTokens > tokenBudget) {
          const over = Math.ceil(usedTokens + lineTokens - tokenBudget);
          console.warn(`⚠️ 记忆摘要超出 token 预算，已截断（超出 ~${over} tokens）`);
          break;
        }
        parts.push(line);
        usedTokens += lineTokens;
      }
    }

    return parts.length > 0 ? parts.join('\n') : '';
  }

  /**
   * 导出所有数据（缺陷10：备份/迁移）
   * @returns {object}
   */
  exportAll() {
    return this._db.exportAll();
  }

  /**
   * 导入数据（缺陷10：合并模式）
   * @param {object} data
   * @returns {{ imported: number, skipped: number, errors: number }}
   */
  importAll(data) {
    return this._db.importAll(data);
  }

  /**
   * 缺陷1：清理过期的短期记忆
   * @private
   */
  _cleanExpiredShort() {
    try {
      const count = this._db.cleanExpiredShortMemories(this._shortTtlMs);
      if (count > 0) {
        console.log(`  🧹 已清理 ${count} 条过期短期记忆`);
      }
    } catch {}
  }

  // ========== 缺陷2：聊天历史持久化（业务层封装） ==========

  saveChatMessage(sessionId, role, content, userId = null) {
    this._db.saveChatMessage(sessionId, role, content, userId);
  }

  getChatHistory(sessionId, limit = 50) {
    return this._db.getChatHistory(sessionId, limit);
  }

  getChatSessions(userId = null) {
    return this._db.getChatSessions(userId);
  }

  deleteChatSession(sessionId) {
    this._db.deleteChatSession(sessionId);
  }

  /**
   * 关闭数据库连接
   */
  close() {
    if (this._ttlTimer) {
      clearInterval(this._ttlTimer);
      this._ttlTimer = null;
    }
    if (this._db) {
      this._db.close();
    }
  }
}
