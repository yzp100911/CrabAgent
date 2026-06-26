/**
 * Gateway 流式 LLM 调用
 * 支持 OpenAI 和 Anthropic 两种 API 格式
 */

import { getModel, getApiConfig } from '../config.js';

/**
 * 检测是否为 Anthropic 格式 API
 */
function isAnthropicFormat(baseURL) {
  return baseURL.includes('/anthropic') || baseURL.includes('anthropic');
}

/**
 * 转换消息为 Anthropic 格式（提取 system 为顶层字段，处理工具调用结果）
 * @param {boolean} [groupToolResults=false] - 是否将连续 tool 结果合并到同一条 user 消息。
 *   DeepSeek 的 /anthropic 接口要求所有 tool_use 的 tool_result 都在紧接着的下一条消息中（需合并），
 *   MiniMax 的 /anthropic 接口要求每个 tool_result 独立一条消息（不合并）。
 */
function toAnthropicMessages(messages, groupToolResults = false) {
  let system = '';
  const converted = [];
  // 缓存连续 tool 消息，仅在 groupToolResults 时合并
  let pendingTools = [];
  function flushTools() {
    if (pendingTools.length > 0) {
      converted.push({
        role: 'user',
        content: pendingTools.map(t => ({
          type: 'tool_result',
          tool_use_id: t.tool_call_id,
          content: t.content || '',
        })),
      });
      pendingTools = [];
    }
  }
  for (const msg of messages) {
    if (msg.role === 'system') {
      system = typeof msg.content === 'string' ? msg.content : msg.content?.map(c => c.text || '').join('') || '';
    } else if (msg.role === 'tool') {
      if (groupToolResults) {
        pendingTools.push(msg);
        continue;
      }
      // 不合并：每个 tool 结果单独一条 user 消息
      converted.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: msg.content || '',
        }],
      });
    } else {
      // 遇到非 tool 消息，先 flush 缓存的 tool 结果（仅在合并模式下有缓存）
      if (groupToolResults) flushTools();
      if (msg.role === 'assistant' && msg.tool_calls) {
        // OpenAI 格式的助手消息包含工具调用 -> Anthropic 格式
        const content = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: (() => { try { return JSON.parse(tc.function.arguments || '{}'); } catch { return {}; } })(),
          });
        }
        converted.push({ role: 'assistant', content });
      } else {
        converted.push({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : msg.content,
        });
      }
    }
  }
  // 末尾可能还有缓存的 tool 结果（仅合并模式下）
  if (groupToolResults) flushTools();
  return { system, messages: converted };
}

/**
 * 流式调用 LLM（OpenAI 格式）
 */
async function callOpenAIStream(apiConfig, model, messages, tools, callbacks, options) {
  const url = `${apiConfig.baseURL}/chat/completions`;
  const maxTokens = model.startsWith('deepseek-v4-flash') ? 384000 : model.startsWith('mimo-v2.5-pro') ? 131072 : model.toLowerCase().includes('minimax') || model.toLowerCase().includes('m3') ? 128000 : 196608;

  const body = {
    model: model.replace('[1M]', ''),
    messages,
    temperature: 0.1,
    max_tokens: maxTokens,
    top_p: 0.95,
    stream: true,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";  // [FIX-3] 从 required 改为 auto，避免模型在不该调工具时硬要调
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300_000);
  if (options?.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  let response;
  try {
    response = await fetch(url, {
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
      if (options?.signal?.aborted) {
        callbacks.onError?.(new Error('用户停止'));
      } else {
        callbacks.onError?.(new Error('请求超时，LLM 300 秒未响应'));
      }
    } else {
      callbacks.onError?.(new Error(`网络错误: ${err.message}`));
    }
    return;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    callbacks.onError?.(new Error(`API 错误 (${response.status}): ${errText}`));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage = {};
  let finishReason = null;
  let chunkIndex = 0;
  let reasoningBuffer = '';
  let reasoningOpened = false;
  let reasoningClosed = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        chunkIndex++;
        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];

          if (parsed.usage) {
            usage = parsed.usage;
          }

          if (choice?.delta?.reasoning_content) {
            reasoningBuffer += choice.delta.reasoning_content;
            // 如果之前已经关闭了 think 块，现在又收到新的 reasoning_content，说明是新的思考阶段
            if (reasoningClosed) {
              reasoningOpened = false;
              reasoningClosed = false;
              reasoningBuffer = choice.delta.reasoning_content;
            }
            if (!reasoningOpened) {
              callbacks.onChunk?.('<think>' + choice.delta.reasoning_content);
              reasoningOpened = true;
            } else {
              callbacks.onChunk?.(choice.delta.reasoning_content);
            }
          }

          if (reasoningOpened && !reasoningClosed && (choice?.delta?.content || choice?.delta?.tool_calls)) {
            // 有些 API 会将推理的尾部通过 content 字段而非 reasoning_content 发送
            // 特征：以空格或延续性标点开头 → 视为推理延续，不关闭 think 块
            if (choice?.delta?.tool_calls) {
              callbacks.onChunk?.('</think>');
              reasoningClosed = true;
            } else if (choice?.delta?.content && /^[\s，、]/.test(choice.delta.content)) {
              // 推理尾巴，追加到 reasoningBuffer，不关闭</think>
              reasoningBuffer += choice.delta.content;
            } else {
              callbacks.onChunk?.('</think>');
              reasoningClosed = true;
            }
          }

          if (choice?.delta?.content) {
            // 如果 content 已被识别为推理尾巴，跳过正文发射
            if (reasoningOpened && !reasoningClosed && reasoningBuffer.length > 0 && reasoningBuffer.endsWith(choice.delta.content)) {
              // 已在推理尾巴处理中追加到 thinking，无需额外发射
            } else if (choice?.delta?.reasoning_content && choice.delta.content.startsWith(choice.delta.reasoning_content)) {
              // skip duplicate
            } else {
              callbacks.onChunk?.(choice.delta.content);
            }
          }

          if (choice?.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              callbacks.onToolCall?.(tc);
            }
          }

          if (choice?.finish_reason) {
            finishReason = choice.finish_reason;
            if (reasoningOpened && !reasoningClosed) {
              callbacks.onChunk?.('</think>');
              reasoningClosed = true;
            }
          }
        } catch {
          // skip
        }
      }
    }
  } catch (err) {
    callbacks.onError?.(new Error(`流读取错误: ${err.message}`));
    return;
  }

  // 流结束前检查 reasoning 是否仍打开（某些 API 可能不发送 finish_reason chunk）
  if (reasoningOpened && !reasoningClosed) {
    callbacks.onChunk?.('</think>');
    reasoningClosed = true;
  }

  callbacks.onDone?.(usage, finishReason);
}

/**
 * 流式调用 LLM（Anthropic 格式）
 */
async function callAnthropicStream(apiConfig, model, messages, tools, callbacks, options) {
  // Anthropic 的 baseURL 可能已包含 /anthropic，需要拼接 /v1/messages
  let url = apiConfig.baseURL;
  if (!url.endsWith('/v1/messages')) {
    url = url.replace(/\/+$/, '') + '/v1/messages';
  }

  const { system, messages: anthropicMessages } = toAnthropicMessages(messages, true);

  // 兼容 [1M] 后缀（我们的内部标记），Anthropic 格式需要去除
  const cleanModel = model.replace('[1M]', '');
  // 各模型 max_tokens（官方值）：deepseek=384K, mimo≈128K, minimax-m3=128K
  const maxTokens = cleanModel.startsWith('deepseek-v4-flash') ? 384000 : cleanModel.startsWith('mimo-v2.5-pro') ? 131072 : cleanModel.toLowerCase().includes('minimax') || cleanModel.toLowerCase().includes('m3') ? 128000 : 196608;

  const body = {
    model: cleanModel,
    max_tokens: maxTokens,
    stream: true,
    messages: anthropicMessages,
  };
  if (system) {
    body.system = system;
  }

  if (tools && tools.length > 0) {
    // 转换工具定义为 Anthropic 格式
    body.tools = tools.map(t => ({
      name: t.function?.name || t.name,
      description: t.function?.description || t.description || '',
      input_schema: t.function?.parameters || t.parameters || { type: 'object', properties: {} },
    }));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300_000);
  if (options?.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiConfig.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      if (options?.signal?.aborted) {
        callbacks.onError?.(new Error('用户停止'));
      } else {
        callbacks.onError?.(new Error('请求超时，LLM 300 秒未响应'));
      }
    } else {
      callbacks.onError?.(new Error(`网络错误: ${err.message}`));
    }
    return;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    callbacks.onError?.(new Error(`API 错误 (${response.status}): ${errText}`));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage = {};
  let finishReason = null;
  let chunkIndex = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('event: ') && !trimmed.startsWith('data: ')) continue;

        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          chunkIndex++;
          try {
            const parsed = JSON.parse(data);

            // message_start: 包含 usage 信息
            if (parsed.type === 'message_start' && parsed.message?.usage) {
              usage = {
                prompt_tokens: parsed.message.usage.input_tokens || 0,
                completion_tokens: parsed.message.usage.output_tokens || 0,
              };
            }

            // content_block_delta: 文本增量
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              callbacks.onChunk?.(parsed.delta.text);
            }

            // content_block_start: 工具调用开始
            if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
              const toolId = parsed.content_block.id;
              console.log('[Anthropic] 工具调用开始, id:', toolId, 'name:', parsed.content_block.name, 'index:', parsed.index);
              callbacks.onToolCall?.({
                id: toolId,
                type: 'function',
                function: {
                  name: parsed.content_block.name,
                  arguments: '',
                },
                index: parsed.index,
              });
            }

            // content_block_delta with tool input
            if (parsed.type === 'content_block_delta' && parsed.delta?.partial_json) {
              callbacks.onToolCall?.({
                function: { arguments: parsed.delta.partial_json },
                index: parsed.index,
              });
            }

            // message_delta: 结束信息
            if (parsed.type === 'message_delta' && parsed.usage) {
              usage.completion_tokens = parsed.usage.output_tokens || usage.completion_tokens || 0;
            }
            if (parsed.type === 'message_delta' && parsed.delta?.stop_reason) {
              finishReason = parsed.delta.stop_reason === 'end_turn' ? 'stop' : parsed.delta.stop_reason;
            }
          } catch {
            // skip
          }
        }
      }
    }
  } catch (err) {
    callbacks.onError?.(new Error(`流读取错误: ${err.message}`));
    return;
  }

  callbacks.onDone?.(usage, finishReason);
}

/**
 * 流式调用 LLM（自动选择格式）
 * @param {Array} messages - 消息历史
 * @param {Array} tools - 工具定义
 * @param {object} callbacks
 * @param {Function} callbacks.onChunk - (text) => void 文本片段
 * @param {Function} callbacks.onToolCall - (toolCall) => void 工具调用
 * @param {Function} callbacks.onDone - (usage, finishReason) => void 完成回调
 * @param {Function} callbacks.onError - (err) => void 错误回调
 * @param {object} [options] - 额外选项
 * @param {AbortSignal} [options.signal] - 外部中止信号
 * @param {object} [options.customModel] - 自定义模型配置 { apiKey, baseURL, model }
 */
export async function callLLMStream(messages, tools, callbacks, options) {
  const customModel = options?.customModel;
  const apiConfig = customModel ? { apiKey: customModel.apiKey, baseURL: customModel.baseURL } : getApiConfig();
  const model = customModel ? customModel.model : getModel();

  if (isAnthropicFormat(apiConfig.baseURL)) {
    await callAnthropicStream(apiConfig, model, messages, tools, callbacks, options);
  } else {
    await callOpenAIStream(apiConfig, model, messages, tools, callbacks, options);
  }
}
