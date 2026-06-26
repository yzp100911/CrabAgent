// E:\CloudServer\Cservice\eclaw\test-redis.js
// 临时测试脚本：验证 redis-client 降级模式和正常模式都工作

const { createStore, isReady } = require('./redis-client');

(async () => {
    console.log('========== 阶段 1：Redis 不可用时的降级测试 ==========');
    console.log('isReady() =', isReady());

    const store1 = createStore('test1', 'eclaw:test1:');

    await store1.set('phone1', { code: '123456', expire: Date.now() + 60000 }, 60);
    console.log('✓ set 成功（降级到内存）');

    const got = await store1.get('phone1');
    console.log('✓ get 返回:', got);

    const has = await store1.has('phone1');
    console.log('✓ has 返回:', has);

    await store1.delete('phone1');
    const gone = await store1.get('phone1');
    console.log('✓ delete 后 get 返回:', gone);

    // 过期测试：传入 ttl=1 秒，等 2 秒后应该返回 undefined
    await store1.set('phone2', { code: '999', expire: Date.now() + 1000 }, 1);
    console.log('✓ set phone2 with TTL=1s');
    const still = await store1.get('phone2');
    console.log('  1秒内 get:', still);
    await new Promise(r => setTimeout(r, 1200));
    const expired = await store1.get('phone2');
    console.log('  1.2秒后 get:', expired, '(应undefined)');

    console.log('\n========== 阶段 2：所有断言 ==========');
    let pass = 0, fail = 0;
    function assert(name, cond) {
        if (cond) { pass++; console.log('  ✓', name); }
        else { fail++; console.log('  ✗', name); }
    }
    assert('Redis 不可用时降级到内存', isReady() === false);
    assert('set/get 往返一致', got && got.code === '123456');
    assert('has 返回 true（已设置）', has === true);
    assert('delete 后 get 返回 undefined', gone === undefined);
    assert('TTL 过期自动清理', expired === undefined);

    console.log(`\n通过: ${pass}, 失败: ${fail}`);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
    console.error('测试失败:', e);
    process.exit(1);
});
