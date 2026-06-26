// E:\CloudServer\Cservice\eclaw\test-session-activity.js
// 测试 sessionActivityTimestamps 迁移到 Redis 后的行为：
//   - 普通 set/get/has/delete 工作正常
//   - 引用变更（修改 lastActivity）能被同步到 Redis（通过显式 re-set）
//   - 启动时从 Redis 恢复数据

const Module = require('module');
const origLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'ioredis') return require('ioredis-mock');
    return origLoad.apply(this, arguments);
};

const { createSyncStore, isReady, client } = require('./redis-client');

(async () => {
    for (let i = 0; i < 50; i++) {
        if (isReady()) break;
        await new Promise(r => setTimeout(r, 100));
    }
    console.log('isReady() =', isReady());

    // 清理
    const oldKeys = await client.keys('eclaw:test_activity:*');
    if (oldKeys.length > 0) await client.del(...oldKeys);

    // 断言计数（提前声明以便在中间插入断言）
    let pass = 0, fail = 0;
    function assert(name, cond) {
        if (cond) { pass++; console.log('  ✓', name); }
        else { fail++; console.log('  ✗', name); }
    }

    // ===== 测试 1: 模拟 updateSessionActivity 行为 =====
    console.log('\n========== 测试 1: updateSessionActivity 引用变更后 re-set ==========');
    const store = createSyncStore('test_session_activity', 'eclaw:test_activity:');

    await new Promise(r => setTimeout(r, 200));

    // 首次 set
    function update(key, startedAt) {
        const now = Date.now();
        const record = store.get(key);
        if (!record) {
            store.set(key, { lastActivity: now, startedAt: startedAt || now });
        } else {
            record.lastActivity = now;
            if (startedAt) record.startedAt = startedAt;
            store.set(key, record);  // 显式 set 触发同步
        }
    }

    update('alice_session1');
    console.log('  alice_session1 首次 set:', store.get('alice_session1'));

    await new Promise(r => setTimeout(r, 200));
    let raw = await client.get('eclaw:test_activity:alice_session1');
    console.log('  Redis 实际值:', raw);

    // 引用变更 + re-set
    const t1 = Date.now();
    await new Promise(r => setTimeout(r, 50));
    update('alice_session1');
    const t2 = Date.now();
    const rec = store.get('alice_session1');
    console.log('  引用变更后 re-set:', rec);
    console.log('  lastActivity 变化:', t2 - t1, 'ms 后 lastActivity 更新了');

    await new Promise(r => setTimeout(r, 200));
    raw = await client.get('eclaw:test_activity:alice_session1');
    const parsed = JSON.parse(raw);
    console.log('  Redis 新值:', raw);
    console.log('  Redis 中 lastActivity 也更新了:', parsed.lastActivity > t1);

    // ===== 测试 2: 启动恢复 =====
    console.log('\n========== 测试 2: 启动时从 Redis 恢复 ==========');
    // 预先往 Redis 写数据
    await client.set('eclaw:test_activity2:bob_session1',
        JSON.stringify({ lastActivity: 1700000000000, startedAt: 1699999900000 }));
    await client.set('eclaw:test_activity2:bob_session2',
        JSON.stringify({ lastActivity: 1700000001000, startedAt: 1699999800000 }));

    // 创建新 store — 会触发启动恢复
    const store2 = createSyncStore('test_session_activity2', 'eclaw:test_activity2:');
    await new Promise(r => setTimeout(r, 500));

    console.log('  恢复后 size:', store2.size);
    console.log('  bob_session1:', store2.get('bob_session1'));
    console.log('  bob_session2:', store2.get('bob_session2'));

    // 启动恢复断言（必须在 delete 之前）
    assert('启动恢复 size === 2', store2.size === 2);
    assert('启动恢复 bob_session1', store2.get('bob_session1') && store2.get('bob_session1').lastActivity === 1700000000000);
    assert('启动恢复 bob_session2', store2.get('bob_session2') && store2.get('bob_session2').startedAt === 1699999800000);

    // ===== 测试 3: delete =====
    console.log('\n========== 测试 3: delete 同步到 Redis ==========');
    store2.delete('bob_session1');
    await new Promise(r => setTimeout(r, 200));
    const afterDel = await client.get('eclaw:test_activity2:bob_session1');
    console.log('  Redis 中 bob_session1:', afterDel, '（应 null）');
    console.log('  store2.has(bob_session1):', store2.has('bob_session1'));

    // ===== 断言 =====
    console.log('\n========== 断言 ==========');
    assert('首次 set 后内存可读', store.get('alice_session1') !== undefined);
    assert('首次 set 后 Redis 持久化', JSON.parse(raw).lastActivity > t1);
    assert('引用变更 re-set 后 Redis lastActivity 更新', parsed.lastActivity > t1);
    // 启动恢复断言已在测试 2 内部完成（必须在 delete 之前）
    assert('delete 后内存 has === false', !store2.has('bob_session1'));
    assert('delete 后 Redis null', afterDel === null);

    console.log(`\n通过: ${pass}, 失败: ${fail}`);

    // 清理
    const cleanup = await client.keys('eclaw:test_activity*');
    if (cleanup.length > 0) await client.del(...cleanup);
    await client.quit();

    process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
    console.error('测试失败:', e);
    process.exit(1);
});
