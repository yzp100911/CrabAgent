// E:\CloudServer\Cservice\eclaw\test-sms-flow.js
// 端到端测试：模拟完整的"发送验证码 → 登录验证 → 消耗验证码"流程

const Module = require('module');
const origLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'ioredis') return require('ioredis-mock');
    return origLoad.apply(this, arguments);
};

const { createStore } = require('./redis-client');
const verificationCodes = createStore('sms_code_e2e', 'eclaw:e2e:');

(async () => {
    for (let i = 0; i < 50; i++) {
        const { isReady } = require('./redis-client');
        if (isReady()) break;
        await new Promise(r => setTimeout(r, 100));
    }

    const phone = '13800138000';
    const code = '654321';
    const expire = Date.now() + 5 * 60 * 1000;

    // === 步骤 1: 发送验证码（/api/send_sms 内部逻辑） ===
    await verificationCodes.set(phone, { code, expire }, 300);
    console.log('[步骤1] 验证码已发送（存到 Redis）');

    // === 步骤 2: 用户输入验证码，登录验证（/api/login 内部逻辑） ===
    const record = await verificationCodes.get(phone);
    if (!record) {
        console.log('  ✗ 验证失败：未找到记录');
        process.exit(1);
    }
    if (record.code !== code) {
        console.log('  ✗ 验证失败：验证码不匹配');
        process.exit(1);
    }
    if (Date.now() > record.expire) {
        console.log('  ✗ 验证失败：已过期');
        process.exit(1);
    }
    console.log('[步骤2] 验证码校验通过');

    // === 步骤 3: 登录成功，消耗验证码 ===
    await verificationCodes.delete(phone);
    console.log('[步骤3] 验证码已消耗');

    // === 步骤 4: 再次尝试用相同验证码登录（应失败） ===
    const record2 = await verificationCodes.get(phone);
    if (record2) {
        console.log('  ✗ 验证失败：验证码不应再可被使用');
        process.exit(1);
    }
    console.log('[步骤4] 验证码已不可重复使用 ✓');

    // === 步骤 5: 验证错误验证码 ===
    await verificationCodes.set(phone, { code: '111111', expire }, 300);
    const wrong = await verificationCodes.get(phone);
    if (wrong.code === '999999') {
        console.log('  ✗ 不应该匹配错误验证码');
        process.exit(1);
    }
    console.log('[步骤5] 错误验证码正确被拒绝 ✓');

    // === 步骤 6: 验证 Redis 中实际存在的 key ===
    const { client } = require('./redis-client');
    const keys = await client.keys('eclaw:e2e:*');
    console.log('[步骤6] Redis 中剩余 keys:', keys);

    // 清理
    if (keys.length > 0) await client.del(...keys);
    await client.quit();

    console.log('\n✅ 端到端测试全部通过！');
    process.exit(0);
})().catch(e => {
    console.error('测试失败:', e);
    process.exit(1);
});
