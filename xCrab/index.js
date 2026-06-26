#!/usr/bin/env node

// Windows SSL 证书兼容（仅本地工具使用）
process.env.NODE_TLS_REJECT_UNAUTHORIZED ||= '0';

import { config, getApiConfig } from './src/config.js';
import { SkillManager } from './src/skill-manager.js';
import { setSkillManager, setMemoryStore, setMCPManager, addMcpTools, setQuotaTracker } from './src/tools.js';
import { hooks } from './src/hooks/registry.js';
import { MemoryStore } from './src/memory/store.js';
import { MCPManager } from './src/mcp/client.js';
import { startCLI, setMemoryStore as setCLIMemoryStore, setWorkspaceManager as setCLIWorkspaceManager } from './src/cli.js';
import { WorkspaceManager } from './src/workspace/manager.js';
import { setWorkspaceManager as setToolsWorkspaceManager } from './src/tools.js';
import { GatewayServer } from './src/gateway/server.js';
import { callLLM } from './src/llm.js';
import { toolDefinitions, executeTool } from './src/tools.js';
import { initTracker } from './src/stats/tracker.js';
import { QuotaTracker } from './src/stats/quota-tracker.js';

// 检查 API Key 是否已配置
if (!config.minimax.apiKey || config.minimax.apiKey === 'your_api_key_here') {
  console.error('❌ 请在 .env 文件中配置 MINIMAX_API_KEY');
  console.error('   参考 .env.example 文件');
  process.exit(1);
}

console.log(`  🦀 xCrab v2.0.0`);
console.log(`  模型: ${config.model}`);
console.log(`  API: ${getApiConfig().baseURL}`);
if (config.memory.enabled) console.log('  记忆: 已启用');
if (config.mcp.servers.length > 0) console.log(`  MCP: ${config.mcp.servers.length} 个服务器`);
console.log();

// 初始化技能系统
const skillManager = new SkillManager();
skillManager.loadAll();
setSkillManager(skillManager);

// 初始化记忆系统
let memoryStore = null;
if (config.memory.enabled) {
  memoryStore = new MemoryStore({
    dbPath: config.memory.dbPath,
  });
  setMemoryStore(memoryStore);
  setCLIMemoryStore(memoryStore);
  console.log('  🧠 记忆系统已加载 (SQLite)');
}

// 初始化统计追踪器
initTracker();
console.log('  📊 统计追踪已启动');

// 初始化配额追踪器
const quotaTracker = new QuotaTracker();
setQuotaTracker(quotaTracker);
console.log('  📊 配额追踪已启动 (MiniMax: 60次/5小时)');

// 初始化工作区系统
const workspaceManager = new WorkspaceManager(config.workspace.dir || undefined);
await workspaceManager.init(config.workspace.active);
setToolsWorkspaceManager(workspaceManager);
setCLIWorkspaceManager(workspaceManager);
console.log(`  📋 工作区: ${workspaceManager.activeName}`);

// 初始化 MCP 连接（await 确保工具注册后再启动 CLI）
let mcpManager = null;
if (config.mcp.servers.length > 0) {
  mcpManager = new MCPManager();
  setMCPManager(mcpManager);
  console.log(`  🔌 正在连接 ${config.mcp.servers.length} 个 MCP 服务器...`);
  try {
    const results = await mcpManager.loadServers(config.mcp.servers);
    const ok = results.filter(r => r.success).length;
    const fail = results.filter(r => !r.success);
    console.log(`  🔌 MCP: ${ok}/${results.length} 个服务器已连接`);
    for (const f of fail) {
      console.log(`    ⚠️  ${f.id}: ${f.error}`);
    }
    if (ok > 0) {
      const mcpTools = await mcpManager.getAllTools();
      addMcpTools(mcpTools);
      console.log(`  🛠️  MCP: ${mcpTools.length} 个工具已注册`);
    }
  } catch (err) {
    console.error(`  ❌ MCP 初始化失败: ${err.message}`);
  }
}

hooks.emit('onStart', { config, skillManager, memoryStore, mcpManager });

// 启动 Gateway（HTTP API + Web 前端）
let gatewayServer = null;
if (config.gateway.enabled) {
  gatewayServer = new GatewayServer(config.gateway, {
    skillManager,
    memoryStore,
    mcpManager,
    callLLM,
    toolDefinitions,
    executeTool,
    workspaceManager,
  });
  await gatewayServer.start();
}

try {
  await startCLI(skillManager);
} catch (err) {
  // 管道退出时 readline 已关闭是预期行为，不报错
  if (!err.message?.includes('readline was closed')) {
    console.error('❌ xCrab 异常退出:', err.message);
    process.exit(1);
  }
}
