import { config, getModel, getApiConfig } from './config.js';

/**
 * 调用 LLM API（根据当前模型自动选择对应 API）
 * @param {Array} messages - 消息历史
 * @param {Array} tools - 工具定义
 * @returns {Promise<object>} - API 响应
 */
export async function callLLM(messages, tools) {
  const apiConfig = getApiConfig();
  const url = `${apiConfig.baseURL}/chat/completions`;
  const model = getModel();
  const maxTokens = model.startsWith('deepseek-v4-flash') ? 384000 : model.startsWith('mimo-v2.5-pro') ? 131072 : 196608;

  const body = {
    model: model.replace('[1M]', ''),
    messages,
    temperature: 0.1,
    max_tokens: maxTokens,
    top_p: 0.95,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";  // [FIX-3] 从 required 改为 auto，避免模型在不该调工具时硬要调
  }

  const startTime = Date.now();

  // [FIX-3 兜底] 发请求前对 history 做全局 JSON 合法性扫描，把损坏的 tool_call 直接丢弃
  let droppedCount = 0;
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
      msg.tool_calls = msg.tool_calls.filter(tc => {
        try {
          JSON.parse(tc.function?.arguments || '{}');
          return true;
        } catch (e) {
          droppedCount++;
          console.log('  ⚠️ [FIX-3 history-scan] 丢弃非法 arguments 的 tool_call (' + (tc.function?.name || 'unknown') + '): ' + (tc.function?.arguments || '').slice(0, 60) + '...');
          return false;
        }
      });
      if (msg.tool_calls.length === 0) {
        delete msg.tool_calls;
        delete msg.function_call;
      }
    }
  }
  if (droppedCount > 0) {
    console.log('  🧹 [FIX-3 history-scan] 共清理 ' + droppedCount + ' 个非法 tool_call');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('LLM 请求超时（120 秒无响应）');
    }
    throw new Error(`LLM 网络错误: ${err.message}`);
  }
  clearTimeout(timeoutId);

  const durationMs = Date.now() - startTime;

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`LLM API 错误 (${resp.status}): ${errText}`);
  }

  const text = await resp.text();
  if (!text) throw new Error('LLM API 返回了空响应');
  const data = JSON.parse(text);

  // 异步追踪统计，不影响主流程
  import('./stats/tracker.js').then(({ trackLLMCall }) => {
    try {
      trackLLMCall({
        model: getModel(),
        promptTokens: data.usage?.prompt_tokens || data.usage?.promptTokens,
        completionTokens: data.usage?.completion_tokens || data.usage?.completionTokens,
        durationMs,
      });
    } catch {}
  }).catch(() => {});

  return data;
}
