// E:\CloudServer\Cservice\eclaw\test-redis-mock.js
// 临时测试脚本：模拟 Redis 在线场景（用 ioredis-mock 替代 ioredis）
// 验证 redis-client 在 Redis 可用时正确走 Redis 路径

// 拦截 ioredis 模块返回 mock 实现
const Module = require('module');
const origResolve = Module._resolveFilename;
const origLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'ioredis') {
        return require('ioredis-mock');
    }
    return origLoad.apply(this, arguments);
};

const { createStore, isReady } = require('./redis-client');

(async () => {
    // 等待 ready
    for (let i = 0; i < 50; i++) {
        if (isReady()) break;
        await new Promise(r => setTimeout(r, 100));
    }
    console.log('isReady() =', isReady(), '(期望 true)');

    const store = createStore('test_mock', 'eclaw:testmock:');

    // 1) set + get
    await store.set('phone_a', { code: '111111', expire: Date.now() + 300000 }, 300);
    const v1 = await store.get('phone_a');
    console.log('set/get:', v1);

    // 2) has
    const h1 = await store.has('phone_a');
    console.log('has:', h1);

    // 3) delete
    await store.delete('phone_a');
    const v2 = await store.get('phone_a');
    console.log('after delete:', v2);

    // 4) TTL 测试（用 mock 的 keys 验证）
    await store.set('phone_b', { code: '222222', expire: Date.now() + 5000 }, 5);
    const keys = await new Promise((resolve, reject) => {
        const { client } = require('./redis-client');
        client.keys('eclaw:testmock:*').then(resolve).catch(reject);
    });
    console.log('Redis 中的 keys:', keys);

    // 5) 断言
    let pass = 0, fail = 0;
    function assert(name, cond) {
        if (cond) { pass++; console.log('  ✓', name); }
        else { fail++; console.log('  ✗', name); }
    }
    assert('Redis 就绪', isReady() === true);
    assert('set/get 往返一致', v1 && v1.code === '111111');
    assert('has 返回 true', h1 === true);
    assert('delete 后 get 返回 undefined', v2 === undefined);
    assert('Redis 中实际有 key', keys.length === 1);

    console.log(`\n通过: ${pass}, 失败: ${fail}`);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
    console.error('测试失败:', e);
    process.exit(1);
});
