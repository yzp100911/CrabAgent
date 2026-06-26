# 🦀 SenseNova API 本地部署文档

> 通过 OpenAI 兼容协议使用商汤 SenseNova 大模型 API
> 文档来源: https://platform.sensenova.cn/docs (已抓取于 2026-06-09)

---

## 📋 基本信息

| 配置项 | 值 |
|--------|-----|
| **Base URL** | `https://token.sensenova.cn/v1` |
| **API Key** | `sk-J3aaNZBvFSvpHJhmiASXCrkx1abynDhA` |
| **注册地址** | https://platform.sensenova.cn/login |
| **控制台** | https://platform.sensenova.cn/console/keys |

## 🤖 可用模型

| 模型 | Model ID | 限制 | 上下文 | 输出 | 描述 |
|------|----------|------|--------|------|------|
| SenseNova 6.7 Flash-Lite | `sensenova-6.7-flash-lite` | 每5小时1500次 | 256K | 64K | 轻量多模态智能体，支持文本+图像 |
| SenseNova U1 Fast | `sensenova-u1-fast` | 每5小时1500次 | — | — | 信息图生成专用，图像输出 |
| DeepSeek V4 Flash | `deepseek-v4-flash` | 每5小时500次 | 256K | 64K | 高性能对话，支持思考模式、工具调用 |

## ⚠️ 重要：模型输出格式差异

- `sensenova-6.7-flash-lite`: 输出内容在 `message.reasoning` 字段，`content` 字段通常为 `null`
- `deepseek-v4-flash`: 输出在 `message.content`，思考过程在 `message.reasoning_content`

## 🚀 快速开始

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-J3aaNZBvFSvpHJhmiASXCrkx1abynDhA",
    base_url="https://token.sensenova.cn/v1"
)

response = client.chat.completions.create(
    model="sensenova-6.7-flash-lite",
    messages=[
        {"role": "user", "content": "你好"}
    ],
    stream=False,
    max_tokens=200
)

# sensenova-6.7-flash-lite 内容在 reasoning
msg = response.choices[0].message
content = msg.content or msg.reasoning
print(content)
```

### cURL

```bash
curl https://token.sensenova.cn/v1/chat/completions \
  -H "Authorization: Bearer sk-J3aaNZBvFSvpHJhmiASXCrkx1abynDhA" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sensenova-6.7-flash-lite",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 🎯 接口列表

### 1. Chat Completions (OpenAI 兼容)
```
POST https://token.sensenova.cn/v1/chat/completions
```

### 2. Models 列表
```
GET https://token.sensenova.cn/v1/models
```

### 3. Images Generations (U1 Fast专用)
```
POST https://token.sensenova.cn/v1/images/generations
```

### 4. Messages (Anthropic 兼容)
```
POST https://token.sensenova.cn/v1/messages
```

## 📊 请求参数 (sensenova-6.7-flash-lite)

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `model` | string | ✅ | — | 固定为 `sensenova-6.7-flash-lite` |
| `messages` | array | ✅ | — | 对话消息列表 |
| `stream` | boolean | — | false | 是否 SSE 流式 |
| `stream_options` | object | — | `{"include_usage":true}` | 含 include_usage |
| `temperature` | float | — | 0.6 | 采样温度 [0, 2] |
| `top_p` | float | — | 0.95 | 核采样 [0, 1] |
| `max_tokens` | integer | — | 65535 | 最大生成 token [1, 65536] |
| `n` | integer | — | 1 | 生成数量 [1, 7] |
| `stop` | string\|array | — | — | 停止序列 |
| `frequency_penalty` | float | — | 0 | 频率惩罚 [0, 2] |
| `presence_penalty` | float | — | 0 | 存在惩罚 [0, 2] |
| `reasoning_effort` | string | — | `"medium"` | 推理力度: low/medium/high/none |
| `tools` | array | — | — | 可用工具列表 |
| `tool_choice` | string\|object | — | `"auto"` | 工具选择 |
| `parallel_tool_calls` | boolean | — | true | 并行工具调用 |
| `seed` | integer | — | — | 随机种子 [0, 9999999] |

## 🖼️ 图像输入（多模态）

```json
{
  "model": "sensenova-6.7-flash-lite",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "描述图片"},
      {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
    ]
  }]
}
```

支持的图片格式：`image/png`、`image/jpeg`、`image/gif`、`image/webp`
- ✅ Base64 方式
- ✅ URL 方式（公网可访问）
- ⚠️ URL 方式需服务器能访问外网，海外域名更稳定

## 🛠️ Function Calling

```python
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "获取天气",
        "parameters": {
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"]
        }
    }
}]

response = client.chat.completions.create(
    model="sensenova-6.7-flash-lite",
    messages=[{"role": "user", "content": "上海天气?"}],
    tools=tools,
    tool_choice="auto"
)
```

## 🌊 流式响应 (SSE)

```python
stream = client.chat.completions.create(
    model="sensenova-6.7-flash-lite",
    messages=[{"role": "user", "content": "你好"}],
    stream=True
)

for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

## ❌ 错误码

| HTTP | 类型 | 含义 |
|------|------|------|
| 400 | `invalid_request_error` | 请求参数不合法 |
| 400 | `failed_precondition_error` | 前置条件不满足 |
| 403 | `permission_denied_error` | 不支持当前语言的请求 |
| 404 | `not_found_error` | 模型 ID 不存在 |
| 408 | `canceled_error` | 客户端取消 |
| 429 | `quota_exceeded_error` | 速率/额度超限 |
| 500 | `internal_server_error` | 服务器内部错误 |

## 🦝 AI 工具接入

SenseNova 同时支持 OpenAI 和 Anthropic 协议，可接入：
- **OpenAI 兼容**: Cursor, Cline, Continue, OpenCode, TRAE, OpenClaw, Hermes Agent
- **Anthropic 兼容**: Claude Code

### Claude Code 配置示例

编辑 `~/.claude/settings.json`:
```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "sk-J3aaNZBvFSvpHJhmiASXCrkx1abynDhA",
    "ANTHROPIC_BASE_URL": "https://token.sensenova.cn",
    "ANTHROPIC_MODEL": "sensenova-6.7-flash-lite"
  }
}
```

⚠️ **Base URL 不能带 `/v1` 后缀**（SDK 自动追加 `/v1/messages`）

### OpenClaw 配置

```bash
# 安装
curl -fsSL https://openclaw.ai/install.sh | bash

# 配置: 选 Custom Provider, 填入 Base URL 和 API Key
openclaw onboard --install-daemon
```

## 🧪 本地测试

```bash
# 安装依赖
pip install openai Pillow --break-system-packages --ignore-installed typing_extensions

# 运行测试套件
python3 test_sensenova_v2.py
```

## 📂 文件结构

```
/www/wwwroot/eclaw/sensenova-test/
├── README.md                 # 本文档
├── test_sensenova.py         # 测试脚本 v1
├── test_sensenova_v2.py      # 测试脚本 v2 (推荐)
├── make_test_image.py        # 生成测试图片
├── test_image.jpg            # 测试图片 (100x100 skyblue + orange)
└── sensenova-docs.txt        # 完整官方文档 (本地保存)
```

## 📌 注意事项

1. **免费使用**：当前所有模型定价为 0，但有频率限制
2. **API Key 安全**：请妥善保管，不要泄露
3. **海外访问**：境外服务器可稳定访问 token.sensenova.cn
4. **输出格式**：sensenova-6.7-flash-lite 把内容放在 reasoning 字段
5. **图像 URL**：外网图片URL 国内服务器可能访问受限，建议用 base64

## 🔗 相关链接

- [SenseNova 官网](https://www.sensenova.cn/)
- [API 文档](https://platform.sensenova.cn/docs)
- [控制台](https://platform.sensenova.cn/console/keys)
- [Token Plan](https://www.sensenova.cn/token-plan)
- [小浣熊办公平台](https://office.xiaohuanxiong.com/home)
- [OpenSenseNova Skills GitHub](https://github.com/OpenSenseNova/SenseNova-Skills)