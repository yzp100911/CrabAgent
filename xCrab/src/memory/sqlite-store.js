/**
 * xCrab SQLite 底层存储封装
 * 提供同步数据库操作接口
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(__dirname, '..', '..', 'memory', 'memories.db');

export class SQLiteStore {
  /**
   * @param {string} [dbPath] - SQLite 文件路径
   */
  constructor(dbPath) {
    this.dbPath = dbPath || DEFAULT_DB_PATH;
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this._initTables();
  }

  _initTables() {
    // 步骤1：创建表（IF NOT EXISTS 保证幂等）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        level TEXT DEFAULT 'mid' CHECK(level IN ('short','mid','long')),
        user_id TEXT DEFAULT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        access_count INTEGER DEFAULT 0,
        UNIQUE(key, user_id)
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        summary TEXT NOT NULL,
        workspace TEXT DEFAULT 'main',
        user_id TEXT DEFAULT NULL,
        tags TEXT DEFAULT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
      CREATE INDEX IF NOT EXISTS idx_memories_level ON memories(level);
      CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);

      CREATE TABLE IF NOT EXISTS decay_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memories_json TEXT NOT NULL,
        decayed_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        user_id TEXT DEFAULT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id);
    `);

    // 步骤1.5：迁移旧表 UNIQUE 约束 — 从 UNIQUE(key) 改为 UNIQUE(key, user_id)
    try {
      const tableSql = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='memories'").get();
      if (tableSql && tableSql.sql.includes('key TEXT NOT NULL UNIQUE')) {
        console.log('  🔄 迁移 memories 表：UNIQUE(key) → UNIQUE(key, user_id)');
        this.db.exec(`
          CREATE TABLE memories_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            category TEXT DEFAULT 'general',
            level TEXT DEFAULT 'mid' CHECK(level IN ('short','mid','long')),
            user_id TEXT DEFAULT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            access_count INTEGER DEFAULT 0,
            UNIQUE(key, user_id)
          );
        `);
        this.db.exec(`
          INSERT INTO memories_new (id, key, value, category, level, user_id, created_at, updated_at, access_count)
          SELECT id, key, value, category, level, NULL AS user_id, created_at, updated_at, access_count
          FROM memories WHERE id IN (
            SELECT MAX(id) FROM memories GROUP BY key
          );
        `);
        this.db.exec('DROP TABLE memories');
        this.db.exec('ALTER TABLE memories_new RENAME TO memories');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key)');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_memories_level ON memories(level)');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category)');
        console.log('  ✅ memories 表迁移完成');
      }
    } catch (e) {
      console.error(`  ⚠️ memories 表迁移失败: ${e.message}`);
    }

    // 步骤2：迁移旧表 — 添加缺失的列
    try {
      const cols = this.db.prepare("PRAGMA table_info(memories)").all();
      if (!cols.some(c => c.name === 'user_id')) {
        this.db.exec("ALTER TABLE memories ADD COLUMN user_id TEXT DEFAULT NULL");
      }
    } catch {}
    try {
      const cols = this.db.prepare("PRAGMA table_info(conversations)").all();
      if (!cols.some(c => c.name === 'workspace')) {
        this.db.exec("ALTER TABLE conversations ADD COLUMN workspace TEXT DEFAULT 'main'");
      }
      if (!cols.some(c => c.name === 'user_id')) {
        this.db.exec("ALTER TABLE conversations ADD COLUMN user_id TEXT DEFAULT NULL");
      }
      if (!cols.some(c => c.name === 'tags')) {
        this.db.exec("ALTER TABLE conversations ADD COLUMN tags TEXT DEFAULT NULL");
      }
    } catch {}

    // 步骤3：在 migration 之后创建依赖 user_id 列的索引
    try {
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id)');
    } catch {}
    try {
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_conv_user_time ON conversations(user_id, id DESC)');
    } catch {}

    // 清理废弃的 embeddings 表（缺陷9：从未被使用）
    try {
      this.db.exec('DROP TABLE IF EXISTS embeddings');
    } catch {}

    // 向量嵌入表（语义搜索）
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS memory_embeddings (
          memory_id INTEGER PRIMARY KEY,
          vector BLOB NOT NULL,
          dimension INTEGER NOT NULL DEFAULT 768,
          model TEXT DEFAULT 'bge-base-zh-v1.5',
          created_at INTEGER NOT NULL,
          FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
        );
      `);
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_embed_model ON memory_embeddings(model)');
      this._embedEnabled = true;
    } catch {
      this._embedEnabled = false;
    }

    // FTS5 全文搜索 — 独立表（非 content-sync），手动同步数据
    this._ftsEnabled = false;
    try {
      // 检查旧的 content-sync FTS 表是否需要迁移
      const ftsInfo = this.db.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='memories_fts'"
      ).get();
      if (ftsInfo && ftsInfo.sql.includes("content=")) {
        // 旧的 content-sync 表不兼容，重建为独立表
        this.db.exec('DROP TABLE IF EXISTS memories_fts');
      }

      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
          key, value, category,
          tokenize='trigram'
        );
      `);
      this._ftsEnabled = true;
    } catch {
      this._ftsEnabled = false;
    }

    // 回填已有数据到 FTS 索引
    if (this._ftsEnabled) {
      try {
        const ftsCount = this.db.prepare('SELECT COUNT(*) as c FROM memories_fts').get().c;
        const memCount = this.db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
        if (ftsCount === 0 && memCount > 0) {
          this.db.exec(`
            INSERT INTO memories_fts(rowid, key, value, category)
            SELECT id, key, value, category FROM memories;
          `);
        }
      } catch {}
    }

    // 预编译 FTS 同步语句
    if (this._ftsEnabled) {
      this._ftsInsert = this.db.prepare('INSERT INTO memories_fts(rowid, key, value, category) VALUES (?, ?, ?, ?)');
      this._ftsDelete = this.db.prepare('DELETE FROM memories_fts WHERE rowid = ?');
      this._ftsSearch = this.db.prepare(`
        SELECT m.*, bm25(memories_fts) as rank
        FROM memories_fts fts
        JOIN memories m ON m.id = fts.rowid
        WHERE memories_fts MATCH ?
        ORDER BY rank LIMIT 50
      `);
    }

    // 预编译向量嵌入语句
    if (this._embedEnabled) {
      this._embedUpsert = this.db.prepare(`
        INSERT INTO memory_embeddings (memory_id, vector, dimension, model, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(memory_id) DO UPDATE SET
          vector = excluded.vector,
          dimension = excluded.dimension,
          model = excluded.model,
          created_at = excluded.created_at
      `);
      this._embedGet = this.db.prepare('SELECT vector, dimension FROM memory_embeddings WHERE memory_id = ?');
      this._embedGetByUser = this.db.prepare(`
        SELECT me.memory_id, me.vector, me.dimension
        FROM memory_embeddings me
        JOIN memories m ON m.id = me.memory_id
        WHERE m.user_id = ?
      `);
      this._embedGetAll = this.db.prepare(`
        SELECT me.memory_id, me.vector, me.dimension
        FROM memory_embeddings me
        JOIN memories m ON m.id = me.memory_id
      `);
    }
  }

  /** 保存/更新一条记忆（事务保证 FTS 一致性） */
  upsert(key, value, { category = 'general', level = 'mid', userId = null } = {}) {
    const now = Date.now();
    const self = this;
    const txn = this.db.transaction(() => {
      const stmt = self.db.prepare(`
        INSERT INTO memories (key, value, category, level, user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key, user_id) DO UPDATE SET
          value = excluded.value,
          category = excluded.category,
          level = excluded.level,
          updated_at = excluded.updated_at
      `);
      stmt.run(key, value, category, level, userId, now, now);

      if (self._ftsEnabled) {
        try {
          const where = userId ? 'WHERE key = ? AND user_id = ?' : 'WHERE key = ? AND user_id IS NULL';
          const params = userId ? [key, userId] : [key];
          const row = self.db.prepare(`SELECT id FROM memories ${where}`).get(...params);
          if (row) {
            self._ftsDelete.run(row.id);
            self._ftsInsert.run(row.id, key, value, category);
          }
        } catch {}
      }
    });
    txn();
  }

  /** 按 key 加载一条记忆 */
  load(key, userId = null) {
    const where = userId ? 'key = ? AND user_id = ?' : 'key = ?';
    const params = userId ? [key, userId] : [key];
    const row = this.db.prepare(`SELECT value FROM memories WHERE ${where}`).get(...params);
    if (row) {
      this.db.prepare(`UPDATE memories SET access_count = access_count + 1 WHERE ${where}`).run(...params);
      return row.value;
    }
    return null;
  }

  /** 删除一条记忆（事务保证 FTS 一致性，删除前存入回收站） */
  remove(key) {
    const self = this;
    const txn = this.db.transaction(() => {
      const row = self.db.prepare('SELECT * FROM memories WHERE key = ?').get(key);
      if (row) {
        self._saveToRecycleBin([row]);
        if (self._ftsEnabled) {
          try { self._ftsDelete.run(row.id); } catch (e) {
            if (e.message?.includes('malformed')) self._rebuildFts();
          }
        }
        self.db.prepare('DELETE FROM memories WHERE key = ?').run(key);
      }
    });
    txn();
  }

  /** 按 key + user_id 删除记忆（归属校验，返回是否成功，删除前存入回收站） */
  removeByUser(key, userId) {
    const self = this;
    let deleted = false;
    const txn = this.db.transaction(() => {
      const row = self.db.prepare('SELECT * FROM memories WHERE key = ? AND user_id = ?').get(key, userId);
      if (row) {
        self._saveToRecycleBin([row]);
        if (self._ftsEnabled) {
          try { self._ftsDelete.run(row.id); } catch {}
        }
        const result = self.db.prepare('DELETE FROM memories WHERE key = ? AND user_id = ?').run(key, userId);
        deleted = result.changes > 0;
      }
    });
    txn();
    return deleted;
  }

  /** 批量删除记忆（按 key 列表，存入回收站） */
  removeBatch(keys, userId = null) {
    const self = this;
    let deletedCount = 0;
    const txn = this.db.transaction(() => {
      for (const key of keys) {
        const where = userId ? 'key = ? AND user_id = ?' : 'key = ?';
        const params = userId ? [key, userId] : [key];
        const row = self.db.prepare(`SELECT * FROM memories WHERE ${where}`).get(...params);
        if (row) {
          self._saveToRecycleBin([row]);
          if (self._ftsEnabled) {
            try { self._ftsDelete.run(row.id); } catch {}
          }
          self.db.prepare(`DELETE FROM memories WHERE ${where}`).run(...params);
          deletedCount++;
        }
      }
    });
    txn();
    return deletedCount;
  }

  /** 清空所有记忆（可按 user_id 和 level 过滤，存入回收站） */
  clearAll(userId = null, level = null) {
    const self = this;
    let deletedCount = 0;
    const txn = this.db.transaction(() => {
      const conds = [];
      const params = [];
      if (userId) { conds.push('user_id = ?'); params.push(userId); }
      if (level) { conds.push('level = ?'); params.push(level); }
      const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
      const rows = self.db.prepare(`SELECT * FROM memories ${where}`).all(...params);
      if (rows.length > 0) {
        self._saveToRecycleBin(rows);
        for (const row of rows) {
          if (self._ftsEnabled) {
            try { self._ftsDelete.run(row.id); } catch {}
          }
        }
        self.db.prepare(`DELETE FROM memories ${where}`).run(...params);
        deletedCount = rows.length;
      }
    });
    txn();
    return deletedCount;
  }

  /** 获取所有记忆 */
  getAll(userId = null) {
    const where = userId ? 'WHERE user_id = ?' : '';
    const params = userId ? [userId] : [];
    return this.db.prepare(`SELECT * FROM memories ${where} ORDER BY updated_at DESC`).all(...params);
  }

  /** 关键词搜索（向量 + FTS5 + LIKE 混合排序，语义优先） */
  search(query, { limit = 50, userId = null, level = null, category = null, queryEmbedding = null, embeddingThreshold = 0.5 } = {}) {
    // 构建附加过滤条件
    const extraConds = [];
    const extraParams = [];
    if (userId) { extraConds.push('m.user_id = ?'); extraParams.push(userId); }
    if (level) { extraConds.push('m.level = ?'); extraParams.push(level); }
    if (category) { extraConds.push('m.category = ?'); extraParams.push(category); }
    const extraWhere = extraConds.length > 0 ? `AND ${extraConds.join(' AND ')}` : '';

    // 0. 向量相似度搜索
    const vectorScoreMap = new Map();
    if (queryEmbedding) {
      try {
        const vectorHits = this.searchByVector(queryEmbedding, { limit, userId, threshold: embeddingThreshold });
        for (const h of vectorHits) {
          vectorScoreMap.set(h.id, h.score);
        }
        if (vectorHits.length > 0) {
          console.log(`  🔍 向量搜索: 找到 ${vectorHits.length} 条 (阈值=${embeddingThreshold}), 最高分=${vectorHits[0]?.score?.toFixed(3)}`);
        } else {
          console.log(`  🔍 向量搜索: 无结果 (阈值=${embeddingThreshold}, userId=${userId || 'null'})`);
        }
      } catch (err) {
        console.warn(`  ⚠️ 向量搜索异常: ${err.message}`);
      }
    }

    // 收集所有文本匹配结果（不立即返回）
    const textRows = [];

    // 1. FTS 搜索（完整查询）
    if (this._ftsEnabled && [...query].length >= 3) {
      try {
        const rows = this.db.prepare(`
          SELECT m.*, bm25(memories_fts) as rank
          FROM memories_fts fts
          JOIN memories m ON m.id = fts.rowid
          WHERE memories_fts MATCH ? ${extraWhere}
          ORDER BY rank LIMIT ?
        `).all(query, ...extraParams, limit);
        textRows.push(...rows);
      } catch {}
    }

    // 2. FTS 搜索（拆分关键词，OR 逻辑）
    if (textRows.length === 0 && this._ftsEnabled) {
      const keywords = query.replace(/[^\w一-鿿]+/g, ' ').trim().split(/\s+/).filter(w => [...w].length >= 2);
      if (keywords.length >= 2) {
        const ftsQuery = keywords.map(k => `"${k}"`).join(' OR ');
        try {
          const rows = this.db.prepare(`
            SELECT m.*, bm25(memories_fts) as rank
            FROM memories_fts fts
            JOIN memories m ON m.id = fts.rowid
            WHERE memories_fts MATCH ? ${extraWhere}
            ORDER BY rank LIMIT ?
          `).all(ftsQuery, ...extraParams, limit);
          textRows.push(...rows);
        } catch {}
      }
    }

    // 3. LIKE 回退（完整查询）
    if (textRows.length === 0) {
      const q = `%${query}%`;
      const likeConds = '(m.key LIKE ? OR m.value LIKE ?)';
      const params = [q, q, ...extraParams, limit];
      const fullResults = this.db.prepare(
        `SELECT m.* FROM memories m WHERE ${likeConds} ${extraWhere} ORDER BY m.updated_at DESC LIMIT ?`
      ).all(...params);
      textRows.push(...fullResults);
    }

    // 4. LIKE 搜索（拆分关键词，任一匹配即可）
    if (textRows.length === 0) {
      const likeKeywords = query.replace(/[^\w一-鿿]+/g, ' ').trim().split(/\s+/).filter(w => w.length >= 2);
      if (likeKeywords.length >= 2) {
        const orClauses = likeKeywords.map(() => '(m.key LIKE ? OR m.value LIKE ?)').join(' OR ');
        const likeParams = likeKeywords.flatMap(k => [`%${k}%`, `%${k}%`]);
        const results = this.db.prepare(
          `SELECT m.* FROM memories m WHERE (${orClauses}) ${extraWhere} ORDER BY m.updated_at DESC LIMIT ?`
        ).all(...likeParams, ...extraParams, limit);
        textRows.push(...results);
      }
    }

    // 5. 混合排序：合并向量分数与文本匹配结果
    if (vectorScoreMap.size > 0 && textRows.length > 0) {
      // 向量和文本都有结果 → 合并去重，按向量分数排序
      const merged = new Map();
      // 文本结果先加入（向量分数作为排序权重）
      for (const row of textRows) {
        row._vectorScore = vectorScoreMap.get(row.id) || 0;
        row._textMatch = true;
        merged.set(row.id, row);
      }
      // 向量结果补充（高分向量结果即使文本没匹配到也加入）
      for (const [id, score] of vectorScoreMap) {
        if (!merged.has(id)) {
          try {
            const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
            if (row) {
              row._vectorScore = score;
              row._textMatch = false;
              merged.set(id, row);
            }
          } catch {}
        }
      }
      // 排序：向量分数高的优先（语义相关性）
      const result = [...merged.values()];
      result.sort((a, b) => (b._vectorScore || 0) - (a._vectorScore || 0));
      return result.slice(0, limit);
    }

    if (vectorScoreMap.size > 0) {
      // 只有向量结果，无文本匹配 → 智能截断（分数断层检测）
      const ids = [...vectorScoreMap.keys()];
      const placeholders = ids.map(() => '?').join(',');
      const rows = this.db.prepare(
        `SELECT * FROM memories WHERE id IN (${placeholders})`
      ).all(...ids);
      rows.forEach(r => { r._vectorScore = vectorScoreMap.get(r.id) || 0; });
      rows.sort((a, b) => (b._vectorScore || 0) - (a._vectorScore || 0));
      return this._truncateByScoreGap(rows, limit);
    }

    if (textRows.length > 0) {
      // 只有文本结果，无向量
      return textRows.slice(0, limit);
    }

    return [];
  }

  /** 带评分的搜索，返回结果附带 relevance 字段 (0-1) */
  searchWithScore(query, opts = {}) {
    if (this._ftsEnabled && [...query].length >= 3) {
      try {
        const rows = this.search(query, opts);
        if (rows.length > 0 && rows[0].rank !== undefined) {
          const minRank = Math.min(...rows.map(r => r.rank));
          const maxRank = Math.max(...rows.map(r => r.rank));
          const range = maxRank - minRank || 1;
          return rows.map(r => ({
            ...r,
            relevance: 1 - (r.rank - minRank) / range,
          }));
        }
      } catch {}
    }
    return this.search(query, opts).map(r => ({ ...r, relevance: 0.5 }));
  }

  /** 检查 key 是否存在（不触发 access_count 自增） */
  exists(key, userId = null) {
    const where = userId ? 'key = ? AND user_id = ?' : 'key = ?';
    const params = userId ? [key, userId] : [key];
    return !!this.db.prepare(`SELECT 1 FROM memories WHERE ${where}`).get(...params);
  }

  /** 按层级获取记忆 */
  getByLevel(level, limit = 100, userId = null) {
    const where = userId ? 'level = ? AND user_id = ?' : 'level = ?';
    const params = userId ? [level, userId, limit] : [level, limit];
    return this.db.prepare(
      `SELECT * FROM memories WHERE ${where} ORDER BY updated_at DESC LIMIT ?`
    ).all(...params);
  }

  /** 获取记忆总数 */
  getCount(userId = null) {
    const where = userId ? 'WHERE user_id = ?' : '';
    const params = userId ? [userId] : [];
    const row = this.db.prepare(`SELECT COUNT(*) as cnt FROM memories ${where}`).get(...params);
    return row.cnt;
  }

  /** 按层级统计记忆数量 */
  getCountByLevel(userId = null) {
    const where = userId ? 'WHERE user_id = ?' : '';
    const params = userId ? [userId] : [];
    return this.db.prepare(
      `SELECT level, COUNT(*) as cnt FROM memories ${where} GROUP BY level`
    ).all(...params);
  }

  /** 保存对话摘要（支持 workspace、userId、tags 元数据，自动去重） */
  saveConversationSummary(summary, { workspace = 'main', userId = null, tags = null } = {}) {
    // 去重：检查最近 20 条摘要是否有高度相似的（前 50 字相同）
    const recent = this.db.prepare(
      'SELECT summary FROM conversations ORDER BY id DESC LIMIT 20'
    ).all();
    const summaryPrefix = summary.slice(0, 50);
    if (recent.some(r => r.summary.slice(0, 50) === summaryPrefix)) return;

    const tagsStr = Array.isArray(tags) ? tags.join(',') : tags;
    this.db.prepare(
      'INSERT INTO conversations (summary, workspace, user_id, tags, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(summary, workspace, userId, tagsStr, Date.now());
    this.db.exec('DELETE FROM conversations WHERE id NOT IN (SELECT id FROM conversations ORDER BY id DESC LIMIT 100)');
  }

  /** 获取最近对话摘要 */
  getRecentSummaries(limit = 5, { workspace = null, userId = null } = {}) {
    const conditions = [];
    const params = [];
    if (workspace) { conditions.push('workspace = ?'); params.push(workspace); }
    if (userId) { conditions.push('user_id = ?'); params.push(userId); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);
    return this.db.prepare(
      `SELECT summary, workspace, tags, created_at FROM conversations ${where} ORDER BY id DESC LIMIT ?`
    ).all(...params);
  }

  /** 导出所有数据（用于备份/迁移） */
  exportAll() {
    const memories = this.db.prepare('SELECT * FROM memories ORDER BY id').all();
    const conversations = this.db.prepare('SELECT * FROM conversations ORDER BY id').all();
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      memories,
      conversations,
    };
  }

  /** 导入数据（合并模式：冲突 key 跳过，返回导入统计） */
  importAll(data) {
    if (!data || !data.memories) return { imported: 0, skipped: 0, errors: 0 };
    const self = this;
    let imported = 0, skipped = 0, errors = 0;
    const txn = self.db.transaction(() => {
      for (const m of data.memories) {
        try {
          const exists = self.db.prepare('SELECT 1 FROM memories WHERE key = ?').get(m.key);
          if (exists) { skipped++; continue; }
          self.db.prepare(
            'INSERT INTO memories (key, value, category, level, user_id, created_at, updated_at, access_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(m.key, m.value, m.category || 'general', m.level || 'mid', m.user_id || null, m.created_at || Date.now(), m.updated_at || Date.now(), m.access_count || 0);
          imported++;
        } catch { errors++; }
      }
      if (data.conversations) {
        for (const c of data.conversations) {
          try {
            self.db.prepare(
              'INSERT INTO conversations (summary, workspace, user_id, tags, created_at) VALUES (?, ?, ?, ?, ?)'
            ).run(c.summary, c.workspace || 'main', c.user_id || null, c.tags || null, c.created_at || Date.now());
          } catch {}
        }
      }
    });
    txn();
    return { imported, skipped, errors };
  }

  /** 重建 FTS 索引（损坏修复用） */
  _rebuildFts() {
    try {
      this.db.exec('DROP TABLE IF EXISTS memories_fts');
      this.db.exec(`CREATE VIRTUAL TABLE memories_fts USING fts5(
        key, value, category, tokenize='trigram'
      )`);
      this.db.exec(`INSERT INTO memories_fts(rowid, key, value, category)
        SELECT id, key, value, category FROM memories`);
      // 重新预编译语句
      this._ftsInsert = this.db.prepare('INSERT INTO memories_fts(rowid, key, value, category) VALUES (?, ?, ?, ?)');
      this._ftsDelete = this.db.prepare('DELETE FROM memories_fts WHERE rowid = ?');
      this._ftsSearch = this.db.prepare(`
        SELECT m.*, bm25(memories_fts) as rank
        FROM memories_fts fts
        JOIN memories m ON m.id = fts.rowid
        WHERE memories_fts MATCH ?
        ORDER BY rank LIMIT 50
      `);
    } catch {
      this._ftsEnabled = false;
    }
  }

  // ========== 缺陷12：衰减回收站 ==========

  /** 将记忆存入回收站（衰减日志） */
  _saveToRecycleBin(memories) {
    const items = memories.map(m => ({
      key: m.key, value: m.value, category: m.category, level: m.level, user_id: m.user_id || null
    }));
    this.db.prepare(
      'INSERT INTO decay_log (memories_json, decayed_at) VALUES (?, ?)'
    ).run(JSON.stringify(items), Date.now());
  }

  /** 保存衰减日志 */
  saveDecayLog(memories) {
    this.db.prepare(
      'INSERT INTO decay_log (memories_json, decayed_at) VALUES (?, ?)'
    ).run(JSON.stringify(memories), Date.now());
    // 保留最近 100 条
    this.db.exec('DELETE FROM decay_log WHERE id NOT IN (SELECT id FROM decay_log ORDER BY id DESC LIMIT 100)');
  }

  /** 获取衰减日志 */
  getDecayLog(limit = 50) {
    return this.db.prepare(
      'SELECT id, memories_json, decayed_at FROM decay_log ORDER BY id DESC LIMIT ?'
    ).all(limit);
  }

  /** 按 ID 获取单条衰减日志 */
  getDecayLogById(id) {
    return this.db.prepare('SELECT * FROM decay_log WHERE id = ?').get(id);
  }

  /** 删除衰减日志（恢复后调用） */
  removeDecayLog(id) {
    this.db.prepare('DELETE FROM decay_log WHERE id = ?').run(id);
  }

  /** 清空所有衰减日志 */
  clearAllDecayLogs() {
    this.db.exec('DELETE FROM decay_log');
  }

  // ========== 缺陷1：短期记忆 TTL 清理 ==========

  /**
   * 清理过期的短期记忆（超过 ttlMs 毫秒未更新的 short 级记忆）
   * @param {number} ttlMs - TTL 毫秒数，默认 2 小时
   * @returns {number} 清理数量
   */
  cleanExpiredShortMemories(ttlMs = 2 * 60 * 60 * 1000) {
    const cutoff = Date.now() - ttlMs;
    const self = this;
    let deleted = 0;
    const txn = this.db.transaction(() => {
      // 先清理 FTS 索引中对应的行
      if (self._ftsEnabled) {
        try {
          const rows = self.db.prepare(
            "SELECT id FROM memories WHERE level = 'short' AND updated_at < ?"
          ).all(cutoff);
          for (const row of rows) {
            self._ftsDelete.run(row.id);
          }
        } catch {}
      }
      const result = self.db.prepare(
        "DELETE FROM memories WHERE level = 'short' AND updated_at < ?"
      ).run(cutoff);
      deleted = result.changes;
    });
    txn();
    return deleted;
  }

  // ========== 缺陷2：聊天历史持久化 ==========

  /**
   * 保存聊天消息到服务端
   * @param {string} sessionId
   * @param {string} role - user|assistant
   * @param {string} content
   * @param {string} [userId]
   */
  saveChatMessage(sessionId, role, content, userId = null) {
    this.db.prepare(
      'INSERT INTO chat_messages (session_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(sessionId, userId, role, content, Date.now());
  }

  /**
   * 获取会话的聊天历史
   * @param {string} sessionId
   * @param {number} limit
   * @returns {Array}
   */
  getChatHistory(sessionId, limit = 50) {
    return this.db.prepare(
      'SELECT role, content, created_at FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT ?'
    ).all(sessionId, limit).reverse();
  }

  /**
   * 获取用户的所有会话列表
   * @param {string} userId
   * @returns {Array}
   */
  getChatSessions(userId = null) {
    const where = userId ? 'WHERE user_id = ?' : '';
    const params = userId ? [userId] : [];
    return this.db.prepare(`
      SELECT session_id, MAX(created_at) as last_active, COUNT(*) as message_count
      FROM chat_messages ${where}
      GROUP BY session_id
      ORDER BY last_active DESC
    `).all(...params);
  }

  /**
   * 删除会话历史
   * @param {string} sessionId
   */
  deleteChatSession(sessionId) {
    this.db.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(sessionId);
  }

  /**
   * 清理过期的聊天历史（超过指定天数）
   * @param {number} days
   * @returns {number}
   */
  cleanOldChatHistory(days = 30) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const result = this.db.prepare('DELETE FROM chat_messages WHERE created_at < ?').run(cutoff);
    return result.changes;
  }

  // ========== 向量嵌入操作 ==========

  /**
   * 为搜索结果附加向量相似度分数
   * @private
   */
  _attachVectorScores(rows, vectorScoreMap) {
    if (vectorScoreMap.size === 0) return;
    for (const row of rows) {
      row._vectorScore = vectorScoreMap.get(row.id) || 0;
    }
    // 按向量分数排序（有向量分数的优先）
    rows.sort((a, b) => (b._vectorScore || 0) - (a._vectorScore || 0));
  }

  /**
   * 智能截断：检测分数断层，在明显断层处截断
   * 当两个相邻结果的分数差 > 0.04 时视为断层
   * @private
   */
  _truncateByScoreGap(rows, limit = 20) {
    if (rows.length <= 2) return rows.slice(0, limit);
    // 先尝试分数断层检测（差距 > 0.03 视为断层）
    const GAP_THRESHOLD = 0.03;
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]._vectorScore || 0;
      const curr = rows[i]._vectorScore || 0;
      if (prev - curr > GAP_THRESHOLD) {
        return rows.slice(0, Math.min(i, limit));
      }
    }
    // 无明显断层时，限制最多 5 条（纯向量结果噪声较多）
    return rows.slice(0, Math.min(5, limit));
  }

  /**
   * 获取记忆的数据库 ID
   * @param {string} key
   * @param {string|null} userId
   * @returns {number|null}
   */
  _getLastInsertId(key, userId) {
    const where = userId ? 'WHERE key = ? AND user_id = ?' : 'WHERE key = ? AND user_id IS NULL';
    const params = userId ? [key, userId] : [key];
    const row = this.db.prepare(`SELECT id FROM memories ${where}`).get(...params);
    return row?.id || null;
  }

  /**
   * 保存向量嵌入
   * @param {number} memoryId
   * @param {Float32Array} vector
   * @param {string} model
   */
  saveEmbedding(memoryId, vector, model = 'bge-base-zh-v1.5') {
    if (!this._embedEnabled) return;
    try {
      const buffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
      this._embedUpsert.run(memoryId, buffer, vector.length, model, Date.now());
    } catch {}
  }

  /**
   * 向量相似度搜索
   * @param {Float32Array} queryVector - 查询向量
   * @param {object} opts
   * @param {number} [opts.limit=10]
   * @param {string} [opts.userId]
   * @param {number} [opts.threshold=0.5]
   * @returns {Array<{id: number, score: number}>}
   */
  searchByVector(queryVector, { limit = 10, userId = null, threshold = 0.5 } = {}) {
    if (!this._embedEnabled) return [];

    try {
      const rows = userId
        ? this._embedGetByUser.all(userId)
        : this._embedGetAll.all();

      if (rows.length === 0) return [];

      // 计算余弦相似度（向量已归一化，直接点积）
      const scored = [];
      for (const row of rows) {
        const vec = new Float32Array(row.vector.buffer, row.vector.byteOffset, row.dimension);
        let dot = 0;
        for (let i = 0; i < queryVector.length && i < vec.length; i++) {
          dot += queryVector[i] * vec[i];
        }
        if (dot >= threshold) {
          scored.push({ id: row.memory_id, score: dot });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit);
    } catch {
      return [];
    }
  }

  /** 关闭数据库连接 */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
