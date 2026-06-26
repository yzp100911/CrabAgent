// E:\CloudServer\Cservice\eclaw\test-recovery-list.js
// 测试启动时从 Redis 恢复 + messageBuffer List 模式

const Module = require('module');
const origLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'ioredis') return require('ioredis-mock');
    return origLoad.apply(this, arguments);
};

const { client: redisClient, createSyncStore, isReady } = require('./redis-client');

(async () => {
    // 等待 ready
    for (let i = 0; i < 50; i++) {
        if (isReady()) break;
        await new Promise(r => setTimeout(r, 100));
    }
    console.log('isReady() =', isReady());

    // 清理
    const oldKeys = await redisClient.keys('eclaw:test_recover:*');
    if (oldKeys.length > 0) await redisClient.del(...oldKeys);
    const oldMsgKeys = await redisClient.keys('eclaw:test_msgbuf:*');
    if (oldMsgKeys.length > 0) await redisClient.del(...oldMsgKeys);

    // ===== 测试 1: 准备"已有数据"模拟"重启后恢复" =====
    console.log('\n========== 测试 1: cclawExecStatus 启动恢复 ==========');
    // 直接往 Redis 写一些数据（模拟 eclaw 之前运行时的状态）
    await redisClient.set('eclaw:test_recover:alice', JSON.stringify({ executing: true, sessionCount: 3 }));
    await redisClient.set('eclaw:test_recover:bob', JSON.stringify({ executing: false, sessionCount: 0 }));
    await redisClient.set('eclaw:test_recover:charlie', JSON.stringify({ executing: true, sessionCount: 1 }));
    console.log('  已写入 3 个测试 key 到 Redis');

    // 创建 store — 这会触发启动恢复
    const statusStore = createSyncStore('test_recover', 'eclaw:test_recover:');

    // 等待恢复完成
    await new Promise(r => setTimeout(r, 500));

    // 验证：内存中应该有这 3 个 key
    console.log('  alice:', statusStore.get('alice'));
    console.log('  bob:', statusStore.get('bob'));
    console.log('  charlie:', statusStore.get('charlie'));
    console.log('  size:', statusStore.size);

    // ===== 测试 2: messageBuffer List 模式 =====
    console.log('\n========== 测试 2: messageBuffer List 模式 push 持久化 ==========');
    const msgBuf = createSyncStore('test_msgbuf', 'eclaw:test_msgbuf:', { listMode: true });

    // 等待 ready
    await new Promise(r => setTimeout(r, 200));

    // 初始化
    msgBuf.set('user1_session1', []);
    console.log('  set([]) 后 length:', msgBuf.length('user1_session1'));

    // push 几个元素
    msgBuf.push('user1_session1', { type: 'msg', data: 'hello' });
    msgBuf.push('user1_session1', { type: 'msg', data: 'world' });
    msgBuf.push('user1_session1', { type: 'msg', data: '!' });
    console.log('  push 3 个后 length:', msgBuf.length('user1_session1'));
    console.log('  内存内容:', JSON.stringify(msgBuf.get('user1_session1')));

    // 等待 Redis 同步
    await new Promise(r => setTimeout(r, 300));

    // 验证 Redis 中实际有 List
    const redisListLen = await redisClient.llen('eclaw:test_msgbuf:user1_session1');
    const redisListItems = await redisClient.lrange('eclaw:test_msgbuf:user1_session1', 0, -1);
    console.log('  Redis LLEN:', redisListLen);
    console.log('  Redis LRANGE:', redisListItems);

    // ===== 测试 3: List 模式启动恢复 =====
    console.log('\n========== 测试 3: messageBuffer 启动恢复（LRANGE） ==========');
    // 关键：先写 Redis，再创建 store
    await redisClient.del('eclaw:test_msgbuf_recover:user3_session1');
    await redisClient.rpush('eclaw:test_msgbuf_recover:user3_session1',
        JSON.stringify({ type: 'restored', data: 'a' }),
        JSON.stringify({ type: 'restored', data: 'b' }),
        JSON.stringify({ type: 'restored', data: 'c' })
    );
    console.log('  预写入 user3_session1 的 3 个元素到 Redis');

    // 现在创建 store — SCAN 会扫到上面的数据
    const msgBuf2 = createSyncStore('test_msgbuf_recover', 'eclaw:test_msgbuf_recover:', { listMode: true });
    await new Promise(r => setTimeout(r, 500));
    console.log('  新 store 中 user3_session1:', JSON.stringify(msgBuf2.get('user3_session1')));
    console.log('  新 store size:', msgBuf2.size);

    // ===== 断言 =====
    console.log('\n========== 断言 ==========');
    let pass = 0, fail = 0;
    function assert(name, cond) {
        if (cond) { pass++; console.log('  ✓', name); }
        else { fail++; console.log('  ✗', name); }
    }
    assert('启动恢复了 alice', statusStore.get('alice') && statusStore.get('alice').executing === true);
    assert('启动恢复了 bob', statusStore.get('bob') && statusStore.get('bob').executing === false);
    assert('启动恢复了 charlie', statusStore.get('charlie') && statusStore.get('charlie').sessionCount === 1);
    assert('size === 3', statusStore.size === 3);

    assert('List push 后 length 正确', msgBuf.length('user1_session1') === 3);
    assert('List push 后 Redis LLEN === 3', redisListLen === 3);
    assert('List push 后 Redis LRANGE 元素正确',
        redisListItems[0] === JSON.stringify({ type: 'msg', data: 'hello' }));
    assert('List 模式启动恢复了 user3', msgBuf2.get('user3_session1') && msgBuf2.get('user3_session1').length === 3);

    console.log(`\n通过: ${pass}, 失败: ${fail}`);

    // 清理
    const cleanup = await redisClient.keys('eclaw:test_*');
    if (cleanup.length > 0) await redisClient.del(...cleanup);
    await redisClient.quit();

    process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
    console.error('测试失败:', e);
    process.exit(1);
});
