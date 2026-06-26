// E:\CloudServer\Cservice\eclaw\redis-client.js
// 封装 ioredis，提供 Map-like 异步 API 用于存储短时数据（短信验证码等）
// Redis 不可用时自动降级到内存 Map，保证 eclaw 不会因 Redis 故障而不可用

const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let client = null;
let ready = false;
const fallbackMaps = new Map();

client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    connectTimeout: 3000,
    retryStrategy: (times) => Math.min(times * 1000, 30000),
    reconnectOnError: () => true
});

client.on('ready', () => {
    ready = true;
    console.log('[Redis] 连接就绪:', REDIS_URL);
});
client.on('error', (err) => {
    if (ready) console.warn('[Redis] 错误:', err.message, '— 已自动降级到内存存储');
    ready = false;
});
client.on('end', () => { ready = false; });
client.on('close', () => { ready = false; });

client.connect().catch(() => {
    console.warn('[Redis] 启动连接失败:', REDIS_URL, '— 将以内存模式运行');
});

function isReady() {
    return ready;
}

function getFallbackMap(name) {
    if (!fallbackMaps.has(name)) fallbackMaps.set(name, new Map());
    return fallbackMaps.get(name);
}

function createStore(name, keyPrefix) {
    const prefix = keyPrefix || (name + ':');

    return {
        async set(key, value, ttlSec) {
            const valueStr = JSON.stringify(value);
            if (ready) {
                try {
                    if (ttlSec && ttlSec > 0) {
                        await client.set(prefix + key, valueStr, 'EX', ttlSec);
                    } else {
                        await client.set(prefix + key, valueStr);
                    }
                    return;
                } catch (e) {
                    console.warn('[Redis] set 失败，降级:', e.message);
                }
            }
            const m = getFallbackMap(name);
            m.set(key, { value, expireAt: ttlSec ? Date.now() + ttlSec * 1000 : null });
        },

        async get(key) {
            if (ready) {
                try {
                    const raw = await client.get(prefix + key);
                    if (raw === null) return undefined;
                    return JSON.parse(raw);
                } catch (e) {
                    console.warn('[Redis] get 失败，降级:', e.message);
                }
            }
            const m = getFallbackMap(name);
            const entry = m.get(key);
            if (!entry) return undefined;
            if (entry.expireAt && Date.now() > entry.expireAt) {
                m.delete(key);
                return undefined;
            }
            return entry.value;
        },

        async delete(key) {
            if (ready) {
                try {
                    await client.del(prefix + key);
                    return;
                } catch (e) {
                    console.warn('[Redis] del 失败，降级:', e.message);
                }
            }
            getFallbackMap(name).delete(key);
        },

        async has(key) {
            const v = await this.get(key);
            return v !== undefined;
        }
    };
}

/**
 * 同步 API 包装 createStore — 内部维护内存 Map 用于同步访问，异步 fire-and-forget 写 Redis
 * 适合改造已有大量同步代码的 Map 使用点（如 jwt.verify 回调、ws.on 回调等）
 *
 * options.listMode = true 时启用 List 模式：
 *   - set(key, value) 整体覆盖一个数组（DEL + RPUSH）
 *   - push(key, value) 追加元素（RPUSH）
 *   - length(key) 返回数组长度
 *   - 启动时用 SCAN + LRANGE 恢复
 *
 * - Redis 不可用时只走内存 Map（与原 Map 行为一致）
 * - Redis 可用时保证内存 + Redis 双写
 * - 启动时从 Redis 恢复已有数据，避免重启丢状态
 */
function createSyncStore(name, keyPrefix, options = {}) {
    const store = createStore(name, keyPrefix);
    const cache = new Map();
    const prefix = keyPrefix || (name + ':');
    const listMode = options.listMode === true;

    // 启动时从 Redis 恢复（异步，不阻塞）
    (async () => {
        for (let i = 0; i < 50; i++) {
            if (ready) break;
            await new Promise(r => setTimeout(r, 100));
        }
        if (!ready) return;
        try {
            let cursor = '0';
            do {
                const [next, keys] = await client.scan(cursor, 'MATCH', prefix + '*', 'COUNT', 100);
                cursor = next;
                for (const k of keys) {
                    if (listMode) {
                        const items = await client.lrange(k, 0, -1);
                        if (items.length > 0) {
                            const key = k.slice(prefix.length);
                            const arr = items.map(s => {
                                try { return JSON.parse(s); } catch { return s; }
                            });
                            cache.set(key, arr);
                        }
                    } else {
                        const val = await client.get(k);
                        if (val) {
                            try {
                                const key = k.slice(prefix.length);
                                cache.set(key, JSON.parse(val));
                            } catch (e) { /* 忽略单条解析错误 */ }
                        }
                    }
                }
            } while (cursor !== '0');
            if (cache.size > 0) {
                const mode = listMode ? '（List 模式）' : '';
                console.log(`[${name}] 从 Redis 恢复了 ${cache.size} 条数据${mode}`);
            }
        } catch (e) {
            console.warn(`[${name}] 启动恢复失败:`, e.message);
        }
    })();

    if (listMode) {
        return {
            set(key, value, ttlSec) {
                if (!Array.isArray(value)) {
                    console.warn(`[${name}] List 模式下 set 必须是数组，忽略`);
                    return;
                }
                cache.set(key, value);
                const fullKey = prefix + key;
                const serialized = value.map(v => JSON.stringify(v));
                client.del(fullKey).then(() => {
                    if (serialized.length === 0) return;
                    return client.rpush(fullKey, ...serialized);
                }).then(() => {
                    if (ttlSec && ttlSec > 0) return client.expire(fullKey, ttlSec);
                }).catch(e => console.warn(`[${name}] Redis set 失败（已存内存）:`, e.message));
            },
            push(key, value) {
                if (!cache.has(key)) cache.set(key, []);
                cache.get(key).push(value);
                const fullKey = prefix + key;
                client.rpush(fullKey, JSON.stringify(value)).catch(e =>
                    console.warn(`[${name}] Redis rpush 失败（已存内存）:`, e.message)
                );
            },
            get(key) {
                return cache.get(key);
            },
            length(key) {
                const arr = cache.get(key);
                return arr ? arr.length : 0;
            },
            delete(key) {
                cache.delete(key);
                client.del(prefix + key).catch(e =>
                    console.warn(`[${name}] Redis del 失败（已删内存）:`, e.message)
                );
            },
            has(key) {
                return cache.has(key);
            },
            get size() {
                return cache.size;
            }
        };
    }

    return {
        set(key, value, ttlSec) {
            cache.set(key, value);
            store.set(key, value, ttlSec).catch(e =>
                console.warn(`[${name}] Redis set 失败（已存内存）:`, e.message)
            );
        },
        get(key) {
            return cache.get(key);
        },
        delete(key) {
            cache.delete(key);
            store.delete(key).catch(e =>
                console.warn(`[${name}] Redis del 失败（已删内存）:`, e.message)
            );
        },
        has(key) {
            return cache.has(key);
        },
        get size() {
            return cache.size;
        }
    };
}

module.exports = { client, isReady, createStore, createSyncStore };
