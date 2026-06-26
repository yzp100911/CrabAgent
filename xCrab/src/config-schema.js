/**
 * xCrab 配置校验 schema
 * 定义所有配置项的类型、默认值、校验规则
 */

const CONFIG_SCHEMA = [
  {
    key: 'MINIMAX_API_KEY',
    description: 'MiniMax API 密钥',
    required: false,
    default: '',
    validate: v => !v || v.startsWith('sk-') || v.length > 10,
    errorMessage: 'MINIMAX_API_KEY 格式不正确，应以 sk- 开头或是有效的 API key',
  },
  {
    key: 'MINIMAX_BASE_URL',
    description: 'MiniMax API 地址',
    required: false,
    default: 'https://api.minimaxi.com/v1',
    validate: v => !v || v.startsWith('http'),
    errorMessage: 'MINIMAX_BASE_URL 必须是有效的 URL（以 http 开头）',
  },
  {
    key: 'DEEPSEEK_API_KEY',
    description: 'DeepSeek API 密钥',
    required: false,
    default: '',
    validate: v => !v || v.startsWith('sk-') || v.length > 10,
    errorMessage: 'DEEPSEEK_API_KEY 格式不正确',
  },
  {
    key: 'DEEPSEEK_BASE_URL',
    description: 'DeepSeek API 地址',
    required: false,
    default: 'https://api.deepseek.com/v1',
    validate: v => !v || v.startsWith('http'),
    errorMessage: 'DEEPSEEK_BASE_URL 必须是有效的 URL',
  },
  {
    key: 'MIMO_API_KEY',
    description: 'Mimo API 密钥',
    required: false,
    default: '',
    validate: v => !v || v.startsWith('sk-') || v.length > 10,
    errorMessage: 'MIMO_API_KEY 格式不正确',
  },
  {
    key: 'MIMO_BASE_URL',
    description: 'Mimo API 地址',
    required: false,
    default: 'https://api.xiaomimimo.com/v1',
    validate: v => !v || v.startsWith('http'),
    errorMessage: 'MIMO_BASE_URL 必须是有效的 URL',
  },
  {
    key: 'MODEL',
    description: '使用的模型名称',
    required: false,
    default: 'MiniMax-M2.7',
    validate: v => !v || v.length > 0,
    errorMessage: 'MODEL 不能为空',
  },
  {
    key: 'ENABLE_MEMORY',
    description: '是否启用持久化记忆',
    required: false,
    default: 'false',
    validate: v => ['true', 'false', '1', '0'].includes(v),
    errorMessage: 'ENABLE_MEMORY 必须是 true/false 或 1/0',
  },
  {
    key: 'MCP_SERVERS',
    description: 'MCP 服务器配置（JSON 字符串）',
    required: false,
    default: '[]',
    validate: v => {
      if (!v) return true;
      try { JSON.parse(v); return true; }
      catch { return false; }
    },
    errorMessage: 'MCP_SERVERS 必须是有效的 JSON 数组字符串',
  },
  {
    key: 'HOOKS_DIR',
    description: '自定义 hook 脚本目录',
    required: false,
    default: '',
    validate: () => true,
    errorMessage: '',
  },
  {
    key: 'MEMORY_DB_PATH',
    description: '记忆数据库路径',
    required: false,
    default: '',
    validate: () => true,
    errorMessage: '',
  },
  {
    key: 'MEMORY_AUTO_SUMMARY',
    description: '是否自动保存对话摘要',
    required: false,
    default: 'true',
    validate: v => ['true', 'false', '1', '0'].includes(v),
    errorMessage: 'MEMORY_AUTO_SUMMARY 必须是 true/false',
  },
  {
    key: 'ENABLE_EMBEDDING',
    description: '是否启用向量嵌入语义搜索',
    required: false,
    default: 'true',
    validate: v => ['true', 'false', '1', '0'].includes(v),
    errorMessage: 'ENABLE_EMBEDDING 必须是 true/false 或 1/0',
  },
  {
    key: 'EMBEDDING_MODEL',
    description: '嵌入模型名称',
    required: false,
    default: 'Xenova/bge-small-zh-v1.5',
    validate: () => true,
    errorMessage: '',
  },
  {
    key: 'EMBEDDING_THRESHOLD',
    description: '向量相似度阈值（0-1）',
    required: false,
    default: '0.5',
    validate: v => !v || (parseFloat(v) >= 0 && parseFloat(v) <= 1),
    errorMessage: 'EMBEDDING_THRESHOLD 必须是 0-1 之间的数字',
  },
  {
    key: 'WORKSPACE_DIR',
    description: '工作区根目录',
    required: false,
    default: '',
    validate: () => true,
    errorMessage: '',
  },
  {
    key: 'ACTIVE_WORKSPACE',
    description: '默认激活的工作区名称',
    required: false,
    default: 'main',
    validate: () => true,
    errorMessage: '',
  },
  {
    key: 'GATEWAY_ENABLED',
    description: '是否启用 Gateway 模式（HTTP + WebSocket）',
    required: false,
    default: 'false',
    validate: v => ['true', 'false', '1', '0'].includes(v),
    errorMessage: 'GATEWAY_ENABLED 必须是 true/false 或 1/0',
  },
  {
    key: 'GATEWAY_PORT',
    description: 'Gateway 服务端口',
    required: false,
    default: '3000',
    validate: v => !v || /^\d+$/.test(v),
    errorMessage: 'GATEWAY_PORT 必须是数字端口号',
  },
  {
    key: 'GATEWAY_JWT_SECRET',
    description: 'Gateway JWT 密钥',
    required: false,
    default: 'xcatch-gateway-secret',
    validate: () => true,
    errorMessage: '',
  },
  {
    key: 'GATEWAY_TOKEN',
    description: 'Gateway 访问令牌（前端连接用）',
    required: false,
    default: '',
    validate: () => true,
    errorMessage: '',
  },
];

/**
 * 校验配置
 * @param {object} env - process.env 或配置对象
 * @returns {{ valid: boolean, errors: string[], config: object }}
 */
export function validateConfig(env) {
  const errors = [];
  const config = {};

  for (const field of CONFIG_SCHEMA) {
    const value = env[field.key] !== undefined ? env[field.key] : field.default;
    config[field.key] = value;

    if (field.required && (!value || value === field.default)) {
      errors.push(`❌ ${field.description}（${field.key}）未配置`);
      continue;
    }

    if (value && !field.validate(value)) {
      errors.push(`❌ ${field.key}: ${field.errorMessage}`);
    }
  }

  config.ENABLE_MEMORY = config.ENABLE_MEMORY === 'true' || config.ENABLE_MEMORY === '1';

  return { valid: errors.length === 0, errors, config };
}

export function getSchemaHelp() {
  return CONFIG_SCHEMA.map(f =>
    `  ${f.key}${f.required ? ' (必填)' : ''} — ${f.description}\n` +
    `    默认值: ${f.default || '(空)'}`
  ).join('\n');
}
