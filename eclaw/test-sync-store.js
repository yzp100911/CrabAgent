// E:\CloudServer\Cservice\eclaw\test-sync-store.js
// 测试 createSyncStore：同步 API + 异步 Redis 持久化

const Module = require('module');
const origLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'ioredis') return require('ioredis-mock');
    return origLoad.apply(this, arguments);
};

const { createStore, createSyncStore, isReady, client } = require('./redis-client');

(async () => {
    for (let i = 0; i < 50; i++) {
        if (isReady()) break;
        await new Promise(r => setTimeout(r, 100));
    }
    console.log('isReady() =', isReady());

    // 模拟 cclawExecStatus：username -> { executing, ... }
    console.log('\n========== 模拟 cclawExecStatus ==========');
    const cclawStatus = createSyncStore('cclaw_status_test', 'eclaw:test_cclaw:');

    // 同步 set
    cclawStatus.set('alice', { executing: true, sessionCount: 2 });
    console.log('set alice, has:', cclawStatus.has('alice'), ', get:', cclawStatus.get('alice'));

    cclawStatus.set('bob', { executing: false, sessionCount: 0 });
    console.log('set bob, has:', cclawStatus.has('bob'), ', get:', cclawStatus.get('bob'));

    // 同步 get / has
    console.log('get alice:', cclawStatus.get('alice'));

    // 同步 delete
    cclawStatus.delete('bob');
    console.log('delete bob, has:', cclawStatus.has('bob'), ', get:', cclawStatus.get('bob'));

    // 等待异步 Redis 写入完成
    await new Promise(r => setTimeout(r, 200));

    // 验证 Redis 中实际有数据
    const aliceRaw = await client.get('eclaw:test_crawl:alice');
    console.log('Redis alice 残留:', aliceRaw, '（应 null，前缀错了）');

    // 用正确前缀查
    const keys = await client.keys('eclaw:test_cclaw:*');
    console.log('Redis keys:', keys);
    for (const k of keys) {
        const v = await client.get(k);
        console.log(`  ${k} =`, v);
    }

    // 模拟 messageBuffer：key -> Array<message>
    console.log('\n========== 模拟 messageBuffer ==========');
    const msgBuf = createSyncStore('message_buffer_test', 'eclaw:test_msgbuf:');

    msgBuf.set('user1_session1', []);
    msgBuf.get('user1_session1').push({ type: 'stream', data: 'hello' });
    msgBuf.get('user1_session1').push({ type: 'stream', data: 'world' });
    console.log('set array, get length:', msgBuf.get('user1_session1').length);
    console.log('content:', JSON.stringify(msgBuf.get('user1_session1')));

    await new Promise(r => setTimeout(r, 200));
    const bufRaw = await client.get('eclaw:test_msgbuf:user1_session1');
    console.log('Redis 中实际存的:', bufRaw);

    // === 断言 ===
    let pass = 0, fail = 0;
    function assert(name, cond) {
        if (cond) { pass++; console.log('  ✓', name); }
        else { fail++; console.log('  ✗', name); }
    }
    assert('set 后 has 返回 true', cclawStatus.has('alice') === true);
    assert('get 返回正确值', cclawStatus.get('alice').executing === true);
    assert('delete 后 has 返回 false', cclawStatus.has('bob') === false);
    assert('get 同步返回（不需要 await）', typeof cclawStatus.get('alice') === 'object');
    assert('push 后 length 正确', msgBuf.get('user1_session1').length === 2);
    assert('Redis 持久化了 alice', keys.length === 1);

    console.log(`\n通过: ${pass}, 失败: ${fail}`);

    // 清理
    if (keys.length > 0) await client.del(...keys);
    const msgKeys = await client.keys('eclaw:test_msgbuf:*');
    if (msgKeys.length > 0) await client.del(...msgKeys);
    await client.quit();

    process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
    console.error('测试失败:', e);
    process.exit(1);
});
