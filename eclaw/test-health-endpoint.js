// E:\CloudServer\Cservice\eclaw\test-health-endpoint.js
// 端到端测试：mock MySQL + fetch 后启动 server.js，测 /api/health 端点

const Module = require('module');
const origLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'ioredis') return require('ioredis-mock');
    if (request === 'mysql2/promise') {
        return {
            createPool: () => ({
                query: async () => [[{ ok: 1 }]],
                execute: async () => [[{ ok: 1 }]],
                end: async () => {}
            })
        };
    }
    if (request === './cloud-sync') {
        return {
            startTunnel: () => Promise.resolve(),
            stopTunnel: () => {},
            getCloudDbConfig: () => ({}),
            syncFavorite: () => Promise.resolve(),
            unsyncFavorite: () => Promise.resolve()
        };
    }
    return origLoad.apply(this, arguments);
};

// mock fetch
global.fetch = async () => ({ ok: true, status: 200 });

// 用一个空闲端口启动
process.env.SMSBAO_USER = 'YOUR_SMSBAO_USER';

// 现在 require server.js
console.log('启动 server.js（mock 模式，端口 10001）...');
const app = require('./server.js');

setTimeout(async () => {
    try {
        const http = require('http');
        const fetchHealth = () => new Promise((resolve, reject) => {
            http.get('http://127.0.0.1:10001/api/health', (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
            }).on('error', reject);
        });

        // 等几秒让 server 完全启动
        await new Promise(r => setTimeout(r, 2000));

        const result = await fetchHealth();
        console.log('HTTP 状态码:', result.status);
        console.log('健康检查响应:');
        console.log(JSON.stringify(result.body, null, 2));

        // === 断言 ===
        let pass = 0, fail = 0;
        function assert(name, cond) {
            if (cond) { pass++; console.log('  ✓', name); }
            else { fail++; console.log('  ✗', name); }
        }
        assert('HTTP 状态码 200（全部服务 ok）', result.status === 200);
        assert('status === ok', result.body.status === 'ok');
        assert('uptime 是数字', typeof result.body.uptime === 'number');
        assert('memory 存在', result.body.memory && result.body.memory.rss > 0);
        assert('services.redis.status === ok', result.body.services.redis && result.body.services.redis.status === 'ok');
        assert('services.mysql.status === ok', result.body.services.mysql && result.body.services.mysql.status === 'ok');
        assert('services.xcrab.status === ok', result.body.services.xcrab && result.body.services.xcrab.status === 'ok');
        assert('stats.cclawConnections 是数字', typeof result.body.stats.cclawConnections === 'number');
        assert('stats.messageBufferSize 是数字', typeof result.body.stats.messageBufferSize === 'number');
        assert('stats.cclawExecStatusSize 是数字', typeof result.body.stats.cclawExecStatusSize === 'number');

        console.log(`\n通过: ${pass}, 失败: ${fail}`);
        process.exit(fail === 0 ? 0 : 1);
    } catch (e) {
        console.error('测试失败:', e);
        process.exit(1);
    }
}, 100);
