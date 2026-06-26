import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig } from './config-schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const result = validateConfig(process.env);

if (!result.valid) {
  console.error('\n⚠️  配置校验失败:');
  for (const err of result.errors) {
    console.error(`  ${err}`);
  }
  console.error('\n  请检查 .env 文件配置。参考 .env.example\n');
}

const cfg = result.config;

/** 加载 MCP 服务器配置 */
function loadMcpServers() {
  // 优先从 .env 读取
  if (process.env.MCP_SERVERS) {
    try {
      return JSON.parse(process.env.MCP_SERVERS);
    } catch {
      console.error('  ⚠️ MCP_SERVERS JSON 解析失败，尝试读取配置文件');
    }
  }
  // 回退到 mcp-servers/config.json
  const configPath = path.resolve(__dirname, '..', 'mcp-servers', 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const data = JSON.parse(raw);
      return data.servers || [];
    }
  } catch {
    // 文件不存在或格式错误，忽略
  }
  return [];
}

// 运行时配置（可动态修改）
const runtime = {
  model: cfg.MODEL,
};

export function setModel(name) {
  runtime.model = name;
}

export function getModel() {
  return runtime.model;
}

/** 根据当前模型获取对应的 API 配置（Key + 地址） */
export function getApiConfig() {
  const model = getModel();
  if (model === 'deepseek-v4-flash[1M]') {
    return {
      apiKey: cfg.DEEPSEEK_API_KEY,
      baseURL: cfg.DEEPSEEK_BASE_URL,
    };
  }
  if (model === 'mimo-v2.5-pro[1M]') {
    return {
      apiKey: cfg.MIMO_API_KEY,
      baseURL: cfg.MIMO_BASE_URL,
    };
  }
  return {
    apiKey: cfg.MINIMAX_API_KEY,
    baseURL: cfg.MINIMAX_BASE_URL,
  };
}

export const config = {
  minimax: {
    apiKey: cfg.MINIMAX_API_KEY,
    baseURL: cfg.MINIMAX_BASE_URL,
  },
  deepseek: {
    apiKey: cfg.DEEPSEEK_API_KEY,
    baseURL: cfg.DEEPSEEK_BASE_URL,
  },
  mimo: {
    apiKey: cfg.MIMO_API_KEY,
    baseURL: cfg.MIMO_BASE_URL,
  },
  get model() { return runtime.model; },
  memory: {
    enabled: cfg.ENABLE_MEMORY,
    dbPath: cfg.MEMORY_DB_PATH || undefined,
    autoSummary: cfg.MEMORY_AUTO_SUMMARY === 'true' || cfg.MEMORY_AUTO_SUMMARY === '1',
    embedding: cfg.ENABLE_EMBEDDING !== 'false' && cfg.ENABLE_EMBEDDING !== '0',
    embeddingModel: cfg.EMBEDDING_MODEL || 'Xenova/bge-base-zh-v1.5',
    embeddingThreshold: parseFloat(cfg.EMBEDDING_THRESHOLD) || 0.5,
  },
  mcp: {
    servers: loadMcpServers(),
  },
  hooksDir: cfg.HOOKS_DIR || null,
  workspace: {
    dir: cfg.WORKSPACE_DIR || null,
    active: cfg.ACTIVE_WORKSPACE || 'main',
  },
  gateway: {
    enabled: cfg.GATEWAY_ENABLED === 'true' || cfg.GATEWAY_ENABLED === '1',
    port: parseInt(cfg.GATEWAY_PORT) || 3000,
    jwtSecret: cfg.GATEWAY_JWT_SECRET || 'xcrab-gateway-secret',
    token: cfg.GATEWAY_TOKEN || '',
  },
};
