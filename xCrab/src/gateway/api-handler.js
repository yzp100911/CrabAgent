/**
 * xCrab Gateway REST API 路由
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callLLMStream } from './llm-stream.js';
import { config, getModel, setModel } from '../config.js';
import { setCurrentUserId, TOOL_META, runWithContext, setContext, extendToolTimeout, cancelToolTimeout } from '../tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '..', '..', '.env');

/** 从 req.user 或 X-User-Id 头提取用户标识 */
function extractUserId(req) {
  // 优先从 X-User-Id 头获取（eclaw 代理传递的真实用户）
  const headerId = req.headers['x-user-id'];
  if (headerId) return headerId;
  if (!req.user) return null;
  return req.user.username || req.user.sub || req.user.id || null;
}

/**
 * 尝试解析工具参数 JSON，支持自动修复截断的 JSON
 * 增强版：同时处理字符串值截断和缺失闭合括号
 * @param {string} raw - 原始参数字符串
 * @returns {object|null} 解析成功返回对象，失败返回 null
 */
function tryParseToolArgs(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // 策略1：自动补全缺失的闭合括号（应对流式截断）
    const openBraces = (raw.match(/\{/g) || []).length;
    const closeBraces = (raw.match(/\}/g) || []).length;
    const openBrackets = (raw.match(/\[/g) || []).length;
    const closeBrackets = (raw.match(/\]/g) || []).length;
    let repaired = raw;
    if (openBraces > closeBraces) repaired += '}'.repeat(openBraces - closeBraces);
    if (openBrackets > closeBrackets) repaired += ']'.repeat(openBrackets - closeBrackets);
    try {
      const parsed = JSON.parse(repaired);
      console.warn(`[tool-args] JSON 参数截断已自动修复: ${raw.slice(0, 60)}...`);
      return parsed;
    } catch {
      // 策略2：尝试修复字符串值截断（例如 {"path": "/home/user/my fi 被截断）
      const strTruncMatch = repaired.match(/"[^"]*$/);
      if (strTruncMatch) {
        repaired = repaired.slice(0, strTruncMatch.index) + '"' + '}'.repeat(Math.max(0, openBraces - closeBraces));
        try {
          const parsed = JSON.parse(repaired);
          console.warn(`[tool-args] JSON 字符串截断已自动修复: ${raw.slice(0, 60)}...`);
          return parsed;
        } catch {
          // 策略3：所有尝试均失败，返回 null
        }
      }
      return null;
    }
  }
}

/** 校验用户标识合法性，防止路径穿越 */
function isValidUserId(userId) {
  if (!userId || typeof userId !== 'string') return false;
  // 只允许字母、数字、下划线、连字符、@符号（邮箱）
  return /^[\w@.\-]+$/.test(userId);
}

export function createApiHandler(deps) {
  const { skillManager, memoryStore, mcpManager, callLLM, toolDefinitions, executeTool, workspaceManager } = deps;
  const router = Router();

  // ========== SSE 连接管理 ==========
  // Map<sessionId, Response[]>
  const sseClients = new Map();
  const sseHeartbeats = new Map();
  // Map<sessionId, AbortController>
  const sessionControllers = new Map();
  // Map<sessionId, messageCount> — 摘要触发节流
  const sessionMsgCounts = new Map();
  // Map<sessionId, Set<timer>> — 追踪活跃的工具进度定时器，断连时清理
  const progressTimers = new Map();
  /** 向 SSE 客户端推送消息 */
  function pushSSE(sessionId, data) {
    if (sseClients.has(sessionId)) {
      const msg = `data: ${JSON.stringify(data)}\n\n`;
      sseClients.get(sessionId).forEach(res => {
        try { res.write(msg); } catch { /* 忽略断开连接 */ }
      });
    }
  }

  /** 清理会话资源 */
  function cleanupSession(sessionId) {
    // 中止正在进行的 LLM 调用，避免资源浪费
    if (sessionControllers.has(sessionId)) {
      const controller = sessionControllers.get(sessionId);
      if (!controller.signal.aborted) {
        controller.abort();
        console.log(`[cleanup] 已中止会话 ${sessionId} 的 LLM 调用`);
      }
      sessionControllers.delete(sessionId);
    }
    if (sseHeartbeats.has(sessionId)) {
      clearInterval(sseHeartbeats.get(sessionId));
      sseHeartbeats.delete(sessionId);
    }
    // 清理该会话的所有工具进度定时器
    if (progressTimers.has(sessionId)) {
      for (const t of progressTimers.get(sessionId)) clearInterval(t);
      progressTimers.delete(sessionId);
    }
    sseClients.delete(sessionId);
  }

  // ========== API 路由 ==========

  /** 健康检查 */
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      version: '2.0.0',
      skills: skillManager?.count || 0,
      memory: memoryStore ? true : false,
      mcp: mcpManager?.count || 0,
      model: getModel(),
    });
  });

  /** 发送消息（同步，非流式）— 用于简单集成 */
  router.post('/chat', async (req, res) => {
    const userId = extractUserId(req);
    await runWithContext(userId, async () => {
      try {
        const { message, sessionId, messages } = req.body;
        if (!message) return res.status(400).json({ code: 400, message: '消息不能为空' });

        const sid = sessionId || uuidv4();
        setCurrentUserId(userId);

        const { History } = await import('../history.js');
        const history = new History(skillManager, memoryStore, 1000000, workspaceManager, userId);
        // 加载历史消息作为上下文（来自网页端）
        if (messages && Array.isArray(messages)) {
          for (const msg of messages) {
            if (msg.role && msg.content) {
              history.add(msg.role, msg.content);
            }
          }
        }
        history.add('user', message);

        // 持久化用户消息到服务端
        if (memoryStore) {
          memoryStore.saveChatMessage(sid, 'user', message, userId);
        }

        // 多轮工具调用循环（与流式版本一致），最多 10 轮
        const MAX_ROUNDS = 10;
        let rounds = 0;
        let finalContent = '';
        let finalUsage = {};

        while (rounds < MAX_ROUNDS) {
          rounds++;
          const data = await callLLM(history.getMessages(), toolDefinitions);
          const choice = data.choices?.[0];
          if (!choice) return res.json({ code: 500, message: 'LLM 未返回有效回复', sessionId: sid });

          const reply = choice.message;
          finalUsage = data.usage || {};

          // 无工具调用 -> 结束循环
          if (!reply.tool_calls || reply.tool_calls.length === 0) {
            finalContent = reply.content || '';
            history.addAssistantMessage(reply);
            break;
          }

          // 有工具调用 -> [FIX-2-移植] 入库前校验 arguments 是否为合法 JSON
          const cleanToolCalls = reply.tool_calls.filter(tc => {
            try {
              JSON.parse(tc.function?.arguments || '{}');
              return true;
            } catch (e) {
                console.log("  ⚠️ [/chat FIX-2] 丢弃非法 arguments 的 tool_call (" + (tc.function?.name || 'unknown') + "): " + (tc.function?.arguments || '').slice(0, 60) + "...");
              return false;
            }
          });
          if (cleanToolCalls.length === 0) {
            console.log('  ❌ [/chat FIX-2] 所有 tool_call 的 arguments 都非法，跳过本轮');
            finalContent = reply.content || '';
            break;
          }
          const cleanReply = { ...reply, tool_calls: cleanToolCalls };
          history.addAssistantMessage(cleanReply);
          const toolResults = await Promise.all(cleanToolCalls.map(async (tc) => {
            let args;
            try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
            const result = await executeTool(tc.function.name, args, userId);
            return { tc, result };
          }));
          for (const { tc, result } of toolResults) {
            history.addToolResult(tc.id, result);
          }
        }
        if (rounds >= MAX_ROUNDS) {
          finalContent = finalContent || '工具调用次数过多，已自动终止';
        }

        // 注入 MiniMax 配额信息
        const lastToolCalls = history.getMessages().filter(m => m.role === 'assistant' && m.tool_calls).pop()?.tool_calls || [];
        for (const tc of lastToolCalls) {
          // 检查 MCP 工具（兼容新旧分隔符）
          const isMcpTool = tc.function.name.startsWith('mcp__') || tc.function.name.startsWith('mcp||');
          if (isMcpTool) {
            try {
              const { QuotaTracker } = await import('../stats/quota-tracker.js');
              const qt = new QuotaTracker();
              const toolName = tc.function.name.split('__').pop();
              const remaining = qt.getRemaining(toolName);
              qt.close();
              finalContent += '\n\n---\n📊 MiniMax 配额: 剩余 ' + remaining + '/60 次 (5小时滚动)';
            } catch (e) { console.warn('[quota]', e.message); }
            break;
          }
        }

        // 持久化助手回复
        if (memoryStore && finalContent) {
          memoryStore.saveChatMessage(sid, 'assistant', finalContent, userId);
        }
        res.json({ code: 200, data: { content: finalContent || '', sessionId: sid, usage: finalUsage } });
      } catch (err) {
        res.status(500).json({ code: 500, message: err.message });
      }
    });
  });

  /** 流式聊天 - 建立 SSE 连接 */
  router.post('/chat/stream', async (req, res) => {
    const userId = extractUserId(req);
    await runWithContext(userId, async () => {
      const sessionAbort = new AbortController();
      let sid = '';
      try {
        const { message, sessionId, messages } = req.body;
        if (!message) return res.status(400).json({ code: 400, message: '消息不能为空' });

        sid = sessionId || uuidv4();
        setCurrentUserId(userId);

      // 提取自定义模型 Header（由 eclaw 代理层传入）
      let customModel = null;
      const customApiKey = req.headers['x-custom-api-key'];
      const customBaseUrl = req.headers['x-custom-base-url'];
      const customModelName = req.headers['x-custom-model'];
      if (customApiKey && customBaseUrl && customModelName) {
        customModel = { apiKey: customApiKey, baseURL: customBaseUrl, model: customModelName };
        console.log(`[chat] 用户 ${userId} 使用自定义模型: ${customModelName}`);
      }

      // 设置 SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      if (!sseClients.has(sid)) sseClients.set(sid, []);
      sseClients.get(sid).push(res);

      // 创建会话级 AbortController，用于停止时中止 LLM 流
      sessionControllers.set(sid, sessionAbort);

      // 心跳保活
      const hb = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch { clearInterval(hb); } }, 15000);
      sseHeartbeats.set(sid, hb);

      // 监听 res.close 检测客户端断开（不使用 req.on('close')，因为它在请求体接收完毕后就会触发）
      res.on('close', () => {
        const arr = sseClients.get(sid);
        if (arr) {
          const idx = arr.indexOf(res);
          if (idx > -1) arr.splice(idx, 1);
          if (arr.length === 0) cleanupSession(sid);
        }
      });

      // 初始化对话历史
      const { History } = await import('../history.js');
      const history = new History(skillManager, memoryStore, 1000000, workspaceManager, userId);
      // 加载历史消息作为上下文（来自网页端）
      if (messages && Array.isArray(messages)) {
        for (const msg of messages) {
          if (msg.role && msg.content) {
            history.add(msg.role, msg.content);
          }
        }
      }
      history.add('user', message);

      // 持久化用户消息到服务端
      if (memoryStore) {
        memoryStore.saveChatMessage(sid, 'user', message, userId);
      }

      // 发送 sessionId
      res.write(`data: ${JSON.stringify({ type: 'session', sessionId: sid })}\n\n`);

      // 循环处理 LLM + 工具调用（流式版）
      let rounds = 0;
      const MAX_ROUNDS = 999;
      const START_TIME = Date.now();
      let timeExtensionMs = 0;
      let _timeoutNotified = false; // 超时弹窗仅触发一次
      const MAX_TOTAL_MS = 900_000; // 总执行时间上限 15 分钟

      /** 从流式内容中提取推理文本，返回 { content, reasoning } */
      function extractReasoning(raw) {
        const match = raw.match(/^<think>([\s\S]*?)<\/think>\s*/);
        if (match) {
          return { content: raw.slice(match[0].length), reasoning: match[1] };
        }
        return { content: raw, reasoning: '' };
      }

      console.log(`[api-handler] 开始第 1 轮 LLM 调用, model=${getModel()}`);
      while (rounds < MAX_ROUNDS) {
        rounds++;

        // 总执行时间检查（超过 15 分钟时弹窗提醒，不暂停任务）
        if (Date.now() - START_TIME > MAX_TOTAL_MS + timeExtensionMs) {
          // 仅首次超时时推送提醒（避免每轮重复弹窗）
          if (!_timeoutNotified) {
            _timeoutNotified = true;
          pushSSE(sid, {
              type: 'confirm_timeout',
              data: {
                message: '工具已执行超过 15 分钟，是否终止当前任务？',
              },
            });
          }
          timeExtensionMs += 60_000; // 防止下一轮又触发
        }

        // 发送 thinking 事件，表示 AI 开始思考
        pushSSE(sid, { type: 'thinking', data: { round: rounds } });

        // === 流式 LLM 调用 ===
        let streamContent = '';
        const toolAccum = {};
        const toolOrder = [];
        let streamUsage = {};
        const streamStartTime = Date.now();

        // 检查会话是否已被停止
        if (sessionAbort.signal.aborted) break;

        let llmError = null;
        await new Promise((resolve, reject) => {
          callLLMStream(history.getMessages(), toolDefinitions, {
            onChunk(text) {
              streamContent += text;
              pushSSE(sid, { type: 'stream', data: { text } });
            },
            onToolCall(tc) {
              const idx = tc.index;
              if (!toolAccum[idx]) {
                toolAccum[idx] = {
                  id: tc.id || `call_${idx}`,
                  type: tc.type || 'function',
                  function: { name: '', arguments: '' },
                };
                toolOrder.push(idx);
                console.log('[Gateway] 新工具调用, idx:', idx, 'id:', tc.id, 'fallback id:', `call_${idx}`);
              } else {
                // 后续 chunk 可能带来真正的 id，覆盖 fallback
                if (tc.id && toolAccum[idx].id.startsWith('call_')) {
                  toolAccum[idx].id = tc.id;
                }
              }
              if (tc.function?.name) toolAccum[idx].function.name += tc.function.name;
              if (tc.function?.arguments) {
                // [FIX-1] 流式 arguments 拼接防护（移植自 cli.js）：
                // 1) 防止上游重复发送（TCP 重传/网关重试）导致 JSON 重复
                // 2) JSON 已完整闭合后停止拼接，防止后续多余 chunk 污染
                const chunk = tc.function.arguments;
                const cur = toolAccum[idx].function.arguments;
                // 跳过完整重复
                if (cur && cur.endsWith(chunk)) {
                  // 完全重复，忽略
                } else if (cur && chunk && cur.length > chunk.length && cur.endsWith(chunk.slice(-Math.min(chunk.length, 32)))) {
                  // 高度疑似重叠（末尾32字符匹配），丢弃整个 chunk
                } else {
                  toolAccum[idx].function.arguments += chunk;
                  // 完整性检测：若已形成合法 JSON，标记完成（后续追加的 chunk 一律丢弃）
                  const s = toolAccum[idx].function.arguments;
                  try {
                    JSON.parse(s);
                    toolAccum[idx]._argsComplete = true;
                  } catch {}
                }
                // 已完成则清空后续 chunk
                if (toolAccum[idx]._argsComplete && tc.function.arguments) {
                  toolAccum[idx].function.arguments = toolAccum[idx].function.arguments;
                }
              }
            },
            onDone(usage) {
              streamUsage = usage || {};
              resolve();
            },
            onError(err) {
              llmError = err;
              console.log(`[chat] LLM 错误: ${err.message}, sid=${sid}`);
              try {
                pushSSE(sid, { type: 'error', data: { message: err.message } });
                console.log(`[chat] 已发送 error 事件到 sid=${sid}`);
              } catch (e) {
                console.log(`[chat] pushSSE 失败: ${e.message}`);
              }
              resolve();
            },
          }, { signal: sessionAbort.signal, customModel });
        });

        // LLM 调用出错，错误事件已通过 pushSSE 发送，跳过后续处理
        if (llmError) {
          pushSSE(sid, { type: 'done', data: {} });
          break;
        }

        // MiniMax 流式 API 不返回 usage，本地估算
        if (!streamUsage.prompt_tokens && !streamUsage.completion_tokens) {
          const inputText = history.getMessages().map(m => {
            if (typeof m.content === 'string') return m.content;
            if (Array.isArray(m.content)) return m.content.map(c => c.text || '').join(' ');
            return '';
          }).join(' ');
          streamUsage.prompt_tokens = Math.ceil(inputText.length / 2);
          streamUsage.completion_tokens = Math.ceil(streamContent.length / 2);
        }

        // 记录 LLM 调用统计到数据库
        try {
          const { trackLLMCall } = await import('../stats/tracker.js');
          trackLLMCall({
            model: getModel(),
            promptTokens: streamUsage.prompt_tokens,
            completionTokens: streamUsage.completion_tokens,
            durationMs: Date.now() - streamStartTime,
          });
        } catch {}

        // 构建工具调用列表
        const roundToolCalls = toolOrder
          .map(i => toolAccum[i])
          .filter(tc => tc.function.name);

        // [FIX-2] 入库前校验 tool_calls[*].function.arguments 是否为合法 JSON（移植自 cli.js）
        // 损坏的 arguments 字符串会污染 history，下一轮触发上游 400
        const cleanToolCalls = roundToolCalls.filter(tc => {
          try {
            JSON.parse(tc.function?.arguments || '{}');
            return true;
          } catch (e) {
            console.log(`  ⚠️ [FIX-2] 丢弃非法 arguments 的 tool_call (${tc.function?.name || 'unknown'}): ${(tc.function?.arguments || '').slice(0, 60)}...`);
            return false;
          }
        });

        // 思考阶段结束，发送切换信号
        if (streamContent && cleanToolCalls.length > 0) {
          pushSSE(sid, { type: 'thinking_end', data: { content: streamContent } });
        }

        // 处理工具调用
        if (cleanToolCalls.length > 0) {
          // 构建助理消息（自动分离推理 + 内容，DeepSeek 需要 reasoning_content）
          const { content, reasoning } = extractReasoning(streamContent);
          const assistantMsg = {
            role: 'assistant',
            content: content || null,
            tool_calls: cleanToolCalls,
          };
          if (getModel().startsWith('deepseek-v4-flash') && reasoning) {
            assistantMsg.reasoning_content = reasoning.replace(/<\/?think>/g, '');
          }
          history.addAssistantMessage(assistantMsg);

          // 并行执行同一轮所有工具调用
          const toolStartTimes = [];
          for (let i = 0; i < cleanToolCalls.length; i++) {
            const tc = cleanToolCalls[i];
            const toolStartTime = Date.now();
            toolStartTimes.push(toolStartTime);

            // 先发送所有 tool_call 事件
            pushSSE(sid, {
              type: 'tool_call',
              data: {
                name: tc.function.name,
                args: tc.function.arguments,
                index: i + 1,
                total: cleanToolCalls.length,
                timestamp: toolStartTime,
              },
            });
          }

          // 并行执行所有工具
          if (!progressTimers.has(sid)) progressTimers.set(sid, new Set());
          const toolResults = await Promise.all(cleanToolCalls.map((tc, i) => {
            const toolStartTime = toolStartTimes[i];
            let args = tryParseToolArgs(tc.function.arguments);
            if (args === null) {
              const timerFix = setInterval(() => {}, 1000);
              progressTimers.get(sid)?.add(timerFix);
              clearInterval(timerFix);
              progressTimers.get(sid)?.delete(timerFix);
              pushSSE(sid, {
                type: 'tool_result',
                data: {
                  name: tc.function.name,
                  index: i + 1,
                  result: `错误：工具参数格式异常，无法执行。原始参数: ${(tc.function.arguments || '').slice(0, 200)}`,
                  durationMs: 0,
                  success: false,
                },
              });
              return { tc, result: `错误：工具参数格式异常，无法执行` };
            }

            // 实时进度计时器（注册到 map 以便断连清理）
            const toolIndex = i + 1;
            const progressTimer = setInterval(() => {
              const elapsed = Math.floor((Date.now() - toolStartTime) / 1000);
              if (elapsed > 0) {
                pushSSE(sid, {
                  type: 'tool_progress',
                  data: { name: tc.function.name, index: toolIndex, elapsed },
                });
              }
            }, 1000);
            progressTimers.get(sid).add(progressTimer);

            // 设置 SSE 推送回调到请求上下文，供超时机制发送 timeout_warning
            try { setContext('pushSSE', (event) => pushSSE(sid, { type: event.type, data: event })); } catch {}

            return executeTool(tc.function.name, args, userId).then(result => {
              clearInterval(progressTimer);
              progressTimers.get(sid)?.delete(progressTimer);
              const durationMs = Date.now() - toolStartTime;

              // 增强截断：保留开头和结尾的关键信息
              let displayResult = result;
              if (result.length > 50000) {
                displayResult = result.slice(0, 30000) +
                  '\n\n... [中间省略 ' + (result.length - 60000) + ' 字符] ...\n\n' +
                  result.slice(-30000);
                displayResult += '\n\n[结果过长，仅显示首尾各 30000 字符，共 ' + result.length + ' 字符]';
              }

              pushSSE(sid, {
                type: 'tool_result',
                data: {
                  name: tc.function.name,
                  index: toolIndex,
                  result: displayResult,
                  durationMs,
                  success: true,
                },
              });

              return { tc, result };
            }).catch(err => {
              clearInterval(progressTimer);
              progressTimers.get(sid)?.delete(progressTimer);
              const durationMs = Date.now() - toolStartTime;
              const errMsg = `错误: ${err.message}`;

              pushSSE(sid, {
                type: 'tool_result',
                data: {
                  name: tc.function.name,
                  index: toolIndex,
                  result: errMsg.length > 50000 ? errMsg.slice(0, 50000) + '\n\n... [错误信息过长，仅显示前 50000 字符]' : errMsg,
                  durationMs,
                  success: false,
                },
              });

              return { tc, result: errMsg };
            });
          }));

          // 按顺序将结果加入历史（保持 LLM 上下文一致性）
          for (const { tc, result } of toolResults) {
            history.addToolResult(tc.id, result);
          }
          continue;
        }

        // 无工具调用，结束
        {
          const { content, reasoning } = extractReasoning(streamContent);
          const finalMsg = { role: 'assistant', content: content || null };
          if (getModel().startsWith('deepseek-v4-flash') && reasoning) {
            finalMsg.reasoning_content = reasoning.replace(/<\/?think>/g, '');
          }
          history.addAssistantMessage(finalMsg);
        }
        pushSSE(sid, { type: 'done', data: { usage: streamUsage } });

        // 持久化助手回复
        const finalAssistantContent = history.getLastAssistantMessage();
        if (memoryStore && finalAssistantContent) {
          memoryStore.saveChatMessage(sid, 'assistant', finalAssistantContent, userId);
        }

        // 用 LLM 生成对话摘要（每 5 条消息触发一次，避免频繁调用）
        if (memoryStore && memoryStore.saveConversationSummary) {
          const count = (sessionMsgCounts.get(sid) || 0) + 1;
          sessionMsgCounts.set(sid, count);
          if (count % 5 === 0) {
            _generateSummary(history, userId, memoryStore, callLLM).catch(err => {
              console.warn('[summary] 摘要生成失败:', err.message);
            });
          }
        }
        break;
      }
    } catch (err) {
      if (sessionAbort.signal.aborted) {
        try {
          res.write(`data: ${JSON.stringify({ type: 'stopped', data: {} })}\n\n`);
        } catch {}
      } else {
        try {
          res.write(`data: ${JSON.stringify({ type: 'error', data: { message: err.message } })}\n\n`);
        } catch {}
      }
    } finally {
      try { setContext('pushSSE', undefined); } catch {}
      if (sseHeartbeats.has(sid)) {
        clearInterval(sseHeartbeats.get(sid));
        sseHeartbeats.delete(sid);
      }
      setTimeout(() => {
        try {
          if (!res.writableEnded) {
            res.end();
          }
          console.log(`[chat] 响应已关闭, sid=${sid}`);
        } catch (e) {
          console.log(`[chat] 关闭响应失败: ${e.message}`);
        }
        cleanupSession(sid);
      }, 200);
    }
    });
  });

  /** 获取 SSE 流（用于现有连接重连） */
  router.get('/chat/stream', (req, res) => {
    const sessionId = req.query.sessionId;
    if (!sessionId) return res.status(400).json({ code: 400, message: '缺少 sessionId' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!sseClients.has(sessionId)) sseClients.set(sessionId, []);
    sseClients.get(sessionId).push(res);

    const hb = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch { clearInterval(hb); } }, 15000);
    sseHeartbeats.set(sessionId, hb);

    res.on('close', () => {
      const arr = sseClients.get(sessionId);
      if (arr) {
        const idx = arr.indexOf(res);
        if (idx > -1) arr.splice(idx, 1);
        if (arr.length === 0) cleanupSession(sessionId);
      }
    });
  });

  /** 停止执行 */
  router.post('/stop', (req, res) => {
    const { sessionId } = req.body;
    if (sessionId) {
      const controller = sessionControllers.get(sessionId);
      if (controller) {
        controller.abort();
      }
      pushSSE(sessionId, { type: 'stopped', data: {} });
      cleanupSession(sessionId);
    }
    res.json({ code: 200, message: '已停止' });
  });

  /** 超时确认响应 — 用户点击"终止任务"时中止会话 */
  router.post('/chat/timeout-response', (req, res) => {
    const { sessionId, action } = req.body;
    if (!sessionId || !action) {
      return res.status(400).json({ code: 400, message: '缺少 sessionId 或 action' });
    }

    if (action === 'stop') {
      const controller = sessionControllers.get(sessionId);
      if (controller && !controller.signal.aborted) {
        controller.abort();
        pushSSE(sessionId, { type: 'stopped', data: { message: '用户已终止长时间执行的任务' } });
        console.log(`[timeout] 用户已终止会话 ${sessionId}`);
      }
      res.json({ code: 200, message: '已终止任务' });
    } else {
      res.json({ code: 200, message: '已忽略' });
    }
  });

  /** 获取 Gateway 统计 */
  router.get('/stats', (req, res) => {
    import('../stats/tracker.js').then(({ getStats, getRecentLLM, getRecentTools, getDailyStats }) => {
      res.json({
        activeSSE: sseClients.size,
        skills: skillManager?.count || 0,
        memory: memoryStore?.getAll()?.length || 0,
        mcp: mcpManager?.count || 0,
        stats: getStats(),
        recentLLM: getRecentLLM(10),
        recentTools: getRecentTools(10),
        dailyStats: getDailyStats(14),
      });
    }).catch(() => {
      res.json({
        activeSSE: sseClients.size,
        skills: skillManager?.count || 0,
        memory: memoryStore?.getAll()?.length || 0,
        mcp: mcpManager?.count || 0,
      });
    });
  });

  /** 获取 Canvas 图表数据 */
  router.get('/canvas/:id', (req, res) => {
    import('../canvas/renderer.js').then(({ getCanvas }) => {
      const canvas = getCanvas(req.params.id);
      if (!canvas) return res.status(404).json({ code: 404, message: 'Canvas 未找到' });
      res.json({ code: 200, data: canvas });
    }).catch(() => {
      res.status(500).json({ code: 500, message: 'Canvas 模块加载失败' });
    });
  });

  // ========== 工具超时处理 API ==========

  /** 用户响应工具超时确认 */
  router.post('/tools/timeout-response', (req, res) => {
    const { confirmId, action } = req.body;
    if (!confirmId || !action) {
      return res.status(400).json({ code: 400, message: '缺少 confirmId 或 action' });
    }

    let ok;
    if (action === 'extend') {
      ok = extendToolTimeout(confirmId);
    } else if (action === 'cancel') {
      ok = cancelToolTimeout(confirmId);
    } else {
      return res.status(400).json({ code: 400, message: 'action 必须是 extend 或 cancel' });
    }

    if (ok) {
      res.json({ code: 200, message: action === 'extend' ? '已延长工具执行时间' : '已终止工具执行' });
    } else {
      res.status(404).json({ code: 404, message: '未找到超时确认请求，可能已过期' });
    }
  });

  // ========== 工具列表 API ==========

  /** 获取所有可用工具定义（包含元数据） */
  router.get('/tools', (req, res) => {
    try {
      const tools = toolDefinitions.map(t => {
        const name = t.function.name;
        const meta = TOOL_META[name] || {};
        return {
          name,
          description: t.function.description,
          category: meta.category || '其他工具',
          icon: meta.icon || '🔧',
          color: meta.color || '#757575',
          alias: meta.alias || name,
        };
      });
      res.json({ code: 200, data: tools });
    } catch (e) {
      res.status(500).json({ code: 500, message: '获取工具列表失败' });
    }
  });

  // ========== 模型切换 API ==========

  /** 获取当前模型 */
  router.get('/current_model', (req, res) => {
    const modelName = getModel();
    const modelKey = modelName === 'MiniMax-M3' ? 'minimax' : modelName.startsWith('mimo-v2.5-pro') ? 'mimo' : 'deepseek';
    res.json({ code: 200, data: { model: modelKey, name: modelName } });
  });

  /** 切换模型 */
  router.post('/switch_model', (req, res) => {
    try {
      const { model } = req.body;
      if (!model || !['deepseek', 'minimax', 'mimo'].includes(model)) {
        return res.status(400).json({ code: 400, message: '无效的模型参数，可选: deepseek, minimax, mimo' });
      }

      const modelName = model === 'deepseek' ? 'deepseek-v4-flash[1M]' : model === 'mimo' ? 'mimo-v2.5-pro[1M]' : 'MiniMax-M3';
      const currentModel = getModel();
      if (currentModel === modelName) {
        return res.json({ code: 200, message: `当前已经是 ${modelName}`, model: modelName });
      }

      // 更新 .env 文件
      let envContent = fs.readFileSync(ENV_PATH, 'utf-8');
      if (envContent.includes('MODEL=')) {
        envContent = envContent.replace(/^MODEL=.*$/m, `MODEL=${modelName}`);
      } else {
        envContent += `\nMODEL=${modelName}\n`;
      }
      fs.writeFileSync(ENV_PATH, envContent, 'utf-8');

      // 更新内存中的模型配置
      setModel(modelName);

      console.log(`[switch_model] 模型已切换至: ${modelName}`);
      res.json({ code: 200, message: `已切换至 ${modelName}`, model: modelName });
    } catch (err) {
      console.error(`[switch_model] 切换失败: ${err.message}`);
      res.status(500).json({ code: 500, message: `切换失败: ${err.message}` });
    }
  });

  // ========== 记忆管理 API ==========

  /** 获取记忆列表 */
  router.get('/memories', (req, res) => {
    if (!memoryStore) return res.json({ code: 200, data: [] });
    const userId = extractUserId(req);
    const all = memoryStore.getAll(userId);
    res.json({ code: 200, data: all });
  });

  /** 搜索记忆（支持 level/category 过滤） */
  router.get('/memories/search', async (req, res) => {
    if (!memoryStore) return res.json({ code: 200, data: [] });
    const { q, limit, level, category } = req.query;
    if (!q) return res.status(400).json({ code: 400, message: '缺少搜索关键词' });
    const userId = extractUserId(req);
    const results = await memoryStore.search(q, {
      limit: parseInt(limit) || 20,
      userId,
      level: level || null,
      category: category || null,
    });
    res.json({ code: 200, data: results });
  });

  /** 创建/更新记忆 */
  router.post('/memories', async (req, res) => {
    if (!memoryStore) return res.status(500).json({ code: 500, message: '记忆系统未启用' });
    const { key, value, category, level } = req.body;
    if (!key || !value) return res.status(400).json({ code: 400, message: 'key 和 value 不能为空' });
    const userId = extractUserId(req);
    const result = await memoryStore.save(key, value, category || 'general', level || 'mid', userId);
    res.json({ code: 200, ...result });
  });

  /** 批量删除记忆 */
  router.post('/memories/batch-delete', (req, res) => {
    if (!memoryStore) return res.status(500).json({ code: 500, message: '记忆系统未启用' });
    const userId = extractUserId(req);
    const keys = req.body.keys;
    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({ code: 400, message: '请提供要删除的记忆 keys 数组' });
    }
    const deletedCount = memoryStore.removeBatch(keys, userId);
    res.json({ code: 200, message: `已删除 ${deletedCount} 条记忆`, deleted: deletedCount });
  });

  /** 清空所有记忆（可按 level 过滤） */
  router.delete('/memories', (req, res) => {
    if (!memoryStore) return res.status(500).json({ code: 500, message: '记忆系统未启用' });
    const userId = extractUserId(req);
    const level = req.query.level || null;
    const deletedCount = memoryStore.clearAll(userId, level);
    res.json({ code: 200, message: `已清空 ${deletedCount} 条记忆`, deleted: deletedCount });
  });

  /** 获取衰减回收站 */
  router.get('/memories/recycle', (req, res) => {
    if (!memoryStore) return res.json({ code: 200, data: [] });
    const data = memoryStore.getDecayRecycleBin(50);
    res.json({ code: 200, data });
  });

  /** 从回收站恢复记忆 */
  router.post('/memories/recycle/:id/restore', (req, res) => {
    if (!memoryStore) return res.status(500).json({ code: 500, message: '记忆系统未启用' });
    const result = memoryStore.restoreFromRecycleBin(parseInt(req.params.id));
    res.json({ code: result.ok ? 200 : 404, ...result });
  });

  /** 从回收站永久删除单条记录 */
  router.delete('/memories/recycle/:id', (req, res) => {
    if (!memoryStore) return res.status(500).json({ code: 500, message: '记忆系统未启用' });
    const result = memoryStore.deleteFromRecycleBin(parseInt(req.params.id));
    res.json({ code: result.ok ? 200 : 404, ...result });
  });

  /** 清空回收站所有记录 */
  router.delete('/memories/recycle', (req, res) => {
    if (!memoryStore) return res.status(500).json({ code: 500, message: '记忆系统未启用' });
    const result = memoryStore.clearRecycleBin();
    res.json({ code: result.ok ? 200 : 500, ...result });
  });

  /** 删除记忆（校验 user_id 归属） - 放在最后，避免匹配到 /recycle/:id */
  router.delete('/memories/:key', (req, res) => {
    if (!memoryStore) return res.status(500).json({ code: 500, message: '记忆系统未启用' });
    const userId = extractUserId(req);
    const key = req.params.key;
    if (userId) {
      const deleted = memoryStore._db.removeByUser(key, userId);
      if (!deleted) return res.status(404).json({ code: 404, message: '未找到该记忆或无权删除' });
    } else {
      memoryStore.remove(key);
    }
    res.json({ code: 200, message: '已删除' });
  });

  // ========== 会话同步 API ==========

  /** 获取服务端会话列表 */
  router.get('/sessions', (req, res) => {
    if (!memoryStore) return res.json({ code: 200, data: [] });
    const userId = extractUserId(req);
    const sessions = memoryStore.getChatSessions(userId);
    res.json({ code: 200, data: sessions });
  });

  /** 获取会话历史消息 */
  router.get('/sessions/:sessionId/messages', (req, res) => {
    if (!memoryStore) return res.json({ code: 200, data: [] });
    const limit = parseInt(req.query.limit) || 50;
    const messages = memoryStore.getChatHistory(req.params.sessionId, limit);
    res.json({ code: 200, data: messages });
  });

  /** 删除会话 */
  router.delete('/sessions/:sessionId', (req, res) => {
    if (!memoryStore) return res.status(500).json({ code: 500, message: '记忆系统未启用' });
    memoryStore.deleteChatSession(req.params.sessionId);
    res.json({ code: 200, message: '已删除' });
  });

  // ========== 工作区提示词 API ==========

  /** 获取用户的工作区提示词文件 */
  router.get('/workspace/prompts', (req, res) => {
    if (!workspaceManager) return res.status(500).json({ code: 500, message: '工作区系统未启用' });
    const userId = extractUserId(req);
    if (!userId) return res.status(400).json({ code: 400, message: '无法识别用户' });

    // 校验 userId 合法性，防止路径穿越
    if (!isValidUserId(userId)) {
      return res.status(400).json({ code: 400, message: '无效的用户标识' });
    }

    const data = {};
    const files = ['IDENTITY.md', 'SOUL.md', 'USER.md', 'HEARTBEAT.md'];
    const keys = ['identity', 'soul', 'user', 'heartbeat'];
    const userDir = path.join(workspaceManager.baseDir, 'users', userId);

    for (let i = 0; i < files.length; i++) {
      const fp = path.join(userDir, files[i]);
      try {
        data[keys[i]] = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf-8') : '';
      } catch {
        data[keys[i]] = '';
      }
    }

    res.json({ code: 200, data });
  });

  /** 保存用户的工作区提示词文件 */
  router.post('/workspace/prompts', (req, res) => {
    if (!workspaceManager) return res.status(500).json({ code: 500, message: '工作区系统未启用' });
    const userId = extractUserId(req);
    if (!userId) return res.status(400).json({ code: 400, message: '无法识别用户' });

    // 校验 userId 合法性，防止路径穿越
    if (!isValidUserId(userId)) {
      return res.status(400).json({ code: 400, message: '无效的用户标识' });
    }

    const { identity, soul, user, heartbeat } = req.body;
    const userDir = path.join(workspaceManager.baseDir, 'users', userId);

    try {
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }
      const files = { 'IDENTITY.md': identity, 'SOUL.md': soul, 'USER.md': user, 'HEARTBEAT.md': heartbeat };
      for (const [filename, content] of Object.entries(files)) {
        if (typeof content === 'string') {
          fs.writeFileSync(path.join(userDir, filename), content, 'utf-8');
        }
      }
      res.json({ code: 200, message: '已保存' });
    } catch (err) {
      res.status(500).json({ code: 500, message: `保存失败: ${err.message}` });
    }
  });

  return router;
}

/**
 * 用 LLM 生成对话摘要（替代粗暴截断）
 */
async function _generateSummary(history, userId, memoryStore, callLLM) {
  const lastUser = history.getLastUserMessage();
  const lastAssistant = history.getLastAssistantMessage();
  if (!lastUser || !lastAssistant) return;

  // 取最近 6 条消息作为摘要上下文
  const recentMsgs = history.getMessages()
    .filter(m => m.role !== 'system')
    .slice(-6)
    .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 200) : '(工具调用)'}`)
    .join('\n');

  try {
    const summaryPrompt = [
      { role: 'system', content: '你是一个摘要生成器。请用一句简洁的中文总结以下对话的核心内容（不超过80字）。只输出摘要，不要其他内容。' },
      { role: 'user', content: recentMsgs },
    ];
    const result = await callLLM(summaryPrompt, null);
    const summary = result.choices?.[0]?.message?.content?.trim();
    if (summary && summary.length > 5) {
      memoryStore.saveConversationSummary(summary, { userId });
    } else {
      memoryStore.saveConversationSummary(
        `用户: ${lastUser.slice(0, 80)} → 助手: ${lastAssistant.slice(0, 80)}`,
        { userId }
      );
    }
  } catch {
    memoryStore.saveConversationSummary(
      `用户: ${lastUser.slice(0, 80)} → 助手: ${lastAssistant.slice(0, 80)}`,
      { userId }
    );
  }
}
