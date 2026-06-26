/**
 * MCP (Model Context Protocol) 客户端
 * 支持连接多个 MCP 服务器，以 JSON-RPC 2.0 over stdio 通信
 */

import { spawn } from 'node:child_process';

export class MCPClient {
  constructor(serverId) {
    this.serverId = serverId;
    this._process = null;
    this._requestId = 0;
    this._pending = new Map();
    this._buffer = '';
    this._initialized = false;
    this._config = null;
    this._disconnecting = false;
    this._reconnectTimer = null;
  }

  async connect(config) {
    const { command, args = [] } = config;
    this._config = config;
    this._disconnecting = false;

    this._process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this._process.stdout.on('data', (data) => {
      this._buffer += data.toString();
      this._processLines();
    });

    this._process.stderr.on('data', () => {
      // MCP 服务器可能将日志输出到 stderr，忽略
    });

    this._process.on('exit', (code) => {
      this._rejectAll(`进程已退出 (code: ${code})`);
      this._initialized = false;
      this._scheduleReconnect();
    });

    this._process.on('error', (err) => {
      this._rejectAll(err.message);
      this._initialized = false;
      this._scheduleReconnect();
    });

    const initResult = await this._request('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: { name: 'xCrab', version: '2.0.0' },
    });

    this._initialized = true;
    return initResult;
  }

  _scheduleReconnect() {
    // 如果是主动断开（disconnect 调用），不重连
    if (this._disconnecting) return;
    // 清除之前的重连定时器
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
    }
    console.log(`[MCP] 服务器 "${this.serverId}" 已断开，5 秒后尝试重连...`);
    this._reconnectTimer = setTimeout(() => {
      if (this._disconnecting) return;
      console.log(`[MCP] 正在重连 "${this.serverId}"...`);
      this.connect(this._config).then(() => {
        console.log(`[MCP] 服务器 "${this.serverId}" 重连成功`);
      }).catch(err => {
        console.error(`[MCP] 服务器 "${this.serverId}" 重连失败: ${err.message}`);
        // 继续重连
        this._scheduleReconnect();
      });
    }, 5000);
  }

  _processLines() {
    const lines = this._buffer.split('\n');
    this._buffer = lines.pop() || '';

    // 暂存未完成的多行 JSON 片段
    let pending = '';

    for (const line of lines) {
      if (!line.trim()) continue;

      const trimmed = line.trim();
      // 标准情况：单行 JSON，快速路径
      if (trimmed.startsWith('{')) {
        try {
          const msg = JSON.parse(trimmed);
          this._handleMessage(msg);
          pending = '';
          continue;
        } catch {
          // 单行解析失败 → 可能是多行 JSON 的开始，从缓冲区累积
          pending = line;
          // 尝试立即用整个 pending 解析（兼容部分场景）
          if (pending.trim().startsWith('{')) {
            try {
              this._handleMessage(JSON.parse(pending.trim()));
              pending = '';
            } catch { /* 继续累积 */ }
          }
          continue;
        }
      }

      // 非 JSON 起始行 → 附到 pending 后重试
      pending += '\n' + line;
      if (pending.trim().startsWith('{')) {
        try {
          const msg = JSON.parse(pending.trim());
          this._handleMessage(msg);
          pending = '';
        } catch {
          // 仍然不完整，继续累积
        }
      }
    }

    // 剩余的未完成片段送回 buffer 等待更多数据
    if (pending) {
      this._buffer = pending + '\n' + this._buffer;
    }
  }

  _handleMessage(msg) {
    if (msg.id !== undefined && this._pending.has(msg.id)) {
      const { resolve, reject, timer } = this._pending.get(msg.id);
      clearTimeout(timer);
      this._pending.delete(msg.id);
      if (msg.error) {
        reject(new Error(msg.error.message || 'JSON-RPC error'));
      } else {
        resolve(msg.result);
      }
    }
  }

  _request(method, params, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const id = ++this._requestId;
      const request = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params: params || {},
      }) + '\n';

      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`MCP 请求 "${method}" 超时 (${timeout}ms)`));
      }, timeout);

      this._pending.set(id, { resolve, reject, timer });
      this._process.stdin.write(request);
    });
  }

  async listTools() {
    if (!this._initialized) throw new Error('MCP 客户端未初始化');
    const result = await this._request('tools/list');
    return result.tools || [];
  }

  async callTool(name, args) {
    if (!this._initialized) throw new Error('MCP 客户端未初始化');
    const result = await this._request('tools/call', { name, arguments: args });
    if (result.content && Array.isArray(result.content)) {
      return result.content.map(c => c.text || JSON.stringify(c)).join('\n');
    }
    return String(result);
  }

  disconnect() {
    this._disconnecting = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._initialized = false;
    this._rejectAll('客户端已断开');
    if (this._process) {
      this._process.kill();
      this._process = null;
    }
  }

  _rejectAll(message) {
    for (const [, { reject }] of this._pending) {
      reject(new Error(message));
    }
    this._pending.clear();
  }
}

export class MCPManager {
  constructor() {
    this._clients = new Map();
  }

  async loadServers(serverConfigs) {
    const results = [];
    for (const cfg of serverConfigs) {
      try {
        const client = new MCPClient(cfg.id);
        await client.connect(cfg);
        this._clients.set(cfg.id, client);
        results.push({ id: cfg.id, success: true });
      } catch (err) {
        results.push({ id: cfg.id, success: false, error: err.message });
      }
    }
    return results;
  }

  /** 将字符串中的非法字符替换为下划线，保持 DeepSeek/OpenAI 兼容 */
  static _sanitizeName(s) {
    return s.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  async getAllTools() {
    const allTools = [];
    for (const [serverId, client] of this._clients) {
      try {
        const tools = await client.listTools();
        for (const tool of tools) {
          const safeServerId = MCPManager._sanitizeName(serverId);
          const safeToolName = MCPManager._sanitizeName(tool.name);
          allTools.push({
            type: 'function',
            function: {
              name: `mcp__${safeServerId}__${safeToolName}`,
              description: tool.description || `MCP 工具 (${serverId})`,
              parameters: tool.inputSchema || { type: 'object', properties: {} },
            },
            _mcp: { serverId, toolName: tool.name },
          });
        }
      } catch (err) {
        console.error(`  ⚠️ 无法获取 MCP 服务器 "${serverId}" 的工具列表: ${err.message}`);
      }
    }
    return allTools;
  }

  async executeTool(serverId, toolName, args) {
    const client = this._clients.get(serverId);
    if (!client) throw new Error(`MCP 服务器 "${serverId}" 未连接`);
    return client.callTool(toolName, args);
  }

  /** 解析完整工具名，返回 { serverId, toolName } 或 null */
  static parseToolName(fullName) {
    // 新格式: mcp__serverId__toolName
    const parts = fullName.split('__');
    if (parts.length >= 3 && parts[0] === 'mcp') {
      return { serverId: parts[1], toolName: parts.slice(2).join('__') };
    }
    return null;
  }

  getServerIds() {
    return [...this._clients.keys()];
  }

  get count() {
    return this._clients.size;
  }

  disconnectAll() {
    for (const [, client] of this._clients) {
      client.disconnect();
    }
    this._clients.clear();
  }
}
