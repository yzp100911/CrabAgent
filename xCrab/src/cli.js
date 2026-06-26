import readline from 'node:readline';
import { History } from './history.js';
import { config } from './config.js';
import { callLLM } from './llm.js';
import { callLLMStream } from './gateway/llm-stream.js';
import { toolDefinitions, executeTool } from './tools.js';
import { hooks } from './hooks/registry.js';

/**
 * 本地估算 Token 数（MiniMax 流式 API 不返回 usage，用字符数估一个大概值）
 * 中英文混合场景：约 1 token ≈ 2 字符
 */
function estimateTokenCount(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 2);
}

const BANNER = `
  ╔══════════════════════════════════════╗
  ║       xCrab — AI 助手       ║
  ║    🦀 迷你 · 敏捷 · 强大           ║
  ╚══════════════════════════════════════╝
  输入 /help 查看命令 · /clear 清空对话 · /quit 退出
`;

function printThinking() {
  process.stdout.write('  🤔 思考中');
  let dots = 0;
  const timer = setInterval(() => {
    dots = (dots + 1) % 4;
    process.stdout.write(`\r  🤔 思考中${'.'.repeat(dots)}${' '.repeat(3 - dots)}`);
  }, 400);
  return () => {
    clearInterval(timer);
    process.stdout.write('\r' + ' '.repeat(30) + '\r');
  };
}

function formatUsage(usage) {
  if (!usage) return '';
  const inTokens = usage.prompt_tokens || 0;
  const outTokens = usage.completion_tokens || 0;
  return `  [Tokens: ↑${inTokens} ↓${outTokens} 合计${inTokens + outTokens}]`;
}

function formatToolCall(tc) {
  const name = tc.function?.name || 'unknown';
  const args = tc.function?.arguments || '{}';
  return `  🔧 调用工具: ${name}(${args})`;
}

/**
 * 工具执行计时器：显示实时耗时并返回停止函数
 */
function startElapsedTimer() {
  const start = Date.now();
  let stopped = false;
  const timerId = setInterval(() => {
    if (stopped) return;
    const s = ((Date.now() - start) / 1000).toFixed(1);
    process.stdout.write(`\r  ⏱ ${s}s`);
  }, 100);
  return () => {
    stopped = true;
    clearInterval(timerId);
    const s = ((Date.now() - start) / 1000).toFixed(1);
    process.stdout.write(`\r  ✅ ${s}s\n`);
  };
}

let _memoryStore = null;
let _workspaceManager = null;

/**
 * 设置 MemoryStore（从 index.js 调用）
 */
export function setMemoryStore(ms) {
  _memoryStore = ms;
}

/**
 * 设置 WorkspaceManager（从 index.js 调用）
 */
export function setWorkspaceManager(wm) {
  _workspaceManager = wm;
}

export async function startCLI(skillManager) {
  const history = new History(skillManager, _memoryStore, 1000000, _workspaceManager);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '',
  });

  console.log(BANNER);

  if (skillManager && skillManager.count > 0) {
    console.log(`  📦 已加载 ${skillManager.count} 个技能\n`);
  }

  const ask = () => new Promise(resolve => {
    try {
      rl.question('  🦀 ', input => resolve(input));
    } catch {
      resolve('/quit');
    }
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await ask();

    if (!input.trim()) continue;

    const trimmed = input.trim();

    // --- 命令处理 ---
    if (trimmed === '/quit' || trimmed === '/exit') {
      await hooks.emit('onExit', { history });
      console.log('  👋 再见！');
      break;
    }

    if (trimmed === '/clear') {
      history.clear();
      console.log('  ✅ 对话历史已清空\n');
      continue;
    }

    if (trimmed === '/quota') {
      try {
        const { QuotaTracker } = await import('./stats/quota-tracker.js');
        const qt = new QuotaTracker();
        const summary = qt.getSummary();
        const windowHours = 5;
        console.log(`  ── MiniMax 配额 (${windowHours}小时滚动窗口) ──`);
        for (const [tool, info] of Object.entries(summary)) {
          const used = info.used;
          const remaining = info.remaining;
          const max = info.maxPerWindow;
          let bar = '';
          const totalBars = 20;
          const filled = Math.round((used / max) * totalBars);
          for (let i = 0; i < totalBars; i++) {
            bar += i < filled ? '█' : '░';
          }
          const pct = ((used / max) * 100).toFixed(1);
          let status = '✅ 充足';
          if (remaining <= 0) status = '🚫 已耗尽';
          else if (remaining <= 5) status = '🔴 紧张';
          else if (remaining <= 10) status = '⚠️ 较少';

          console.log(`  ${tool === 'understand_image' ? '🖼️  图片理解' : '🔍 网络搜索'}`);
          console.log(`     ${bar} ${used}/${max} (${pct}%) — 剩余 ${remaining} 次 | ${status}`);
        }
        console.log();
        qt.close();
      } catch (err) {
        console.log('  ❌ 无法获取配额信息: ' + err.message + '\n');
      }
      continue;
    }

    if (trimmed === '/stats') {
      history.printStats();
      // 显示全局统计
      try {
        const { getStats } = await import('./stats/tracker.js');
        const stats = getStats();
        if (stats && !stats.error) {
          const { today } = stats;
          console.log(`  ── 全局统计 ──`);
          console.log(`  LLM 调用: ${stats.llmCalls} 次`);
          console.log(`  总 Token: ${stats.totalTokens} (↑${stats.promptTokens} ↓${stats.completionTokens})`);
          console.log(`  平均响应: ${stats.avgDurationMs}ms`);
          console.log(`  工具调用: ${stats.toolCalls} 次 (✅ ${stats.toolSuccess} ❌ ${stats.toolFail})`);
          console.log(`  今日: ${today?.llm_calls || 0} 次 LLM, ${today?.tool_calls || 0} 次工具, ${today?.total_tokens || 0} tokens`);
          console.log();
        }
      } catch {}
      continue;
    }

    if (trimmed === '/help') {
      console.log(`
  命令列表:
    /help             - 显示此帮助
    /clear            - 清空对话历史
    /stats            - 显示当前对话统计
    /quota            - 查看 MiniMax 工具配额剩余次数
	    /workspace        - 显示当前工作区信息
	    /workspace list   - 列出所有可用工作区
	    /workspace switch <n> - 切换到指定工作区
	    /workspace init <n>   - 创建新的工作区
    /skills           - 列出已安装的技能
    /skills search <q> - 从 ClawHub 搜索技能
    /skills install <n> - 从 ClawHub 安装技能
    /skills uninstall <n> - 卸载技能
    /skills update <n>   - 更新技能
    /skills enable <n>   - 启用技能
    /skills disable <n>  - 禁用技能
    /skills info <n>     - 查看技能详细信息
    /skills config <n> [k] [v] - 修改技能配置
    /skills rollback <n> - 回滚技能到上一版本
    /skills deps <n>     - 查看技能依赖树
    /quit             - 退出 xCrab

  可用工具:
    ${toolDefinitions.map(t => t.function.name).join(', ')}

  直接输入内容与 xCrab 对话即可。
`);
      continue;
    }



	    // --- 工作区命令处理 ---
	    if (trimmed.startsWith('/workspace')) {
	      const parts = trimmed.split(/\s+/);
	      const subCmd = parts[1];

	      if (!subCmd || subCmd === 'show') {
	        if (!_workspaceManager) {
	          console.log('  ⚠️ Workspace 系统未初始化\n');
	        } else {
	          console.log('  ' + _workspaceManager.getSummary() + '\n');
	        }
	        continue;
	      }

	      if (subCmd === 'list') {
	        if (!_workspaceManager) {
	          console.log('  ⚠️ Workspace 系统未初始化\n');
	        } else {
	          const list = _workspaceManager.listWorkspaces();
	          if (list.length === 0) {
	            console.log('  📭 未找到工作区\n');
	          } else {
	            const active = _workspaceManager.activeName;
	            console.log('  可用工作区 (' + list.length + '):');
	            for (const ws of list) {
	              const marker = ws.name === active ? ' ◀ 当前' : '';
	              console.log('    ' + (ws.name === active ? '📂' : '📁') + ' ' + ws.name + ' — ' + ws.desc + ' (' + ws.fileCount + ' 文件)' + marker);
	            }
	            console.log();
	          }
	        }
	        continue;
	      }

	      if (subCmd === 'switch') {
	        const name = parts[2];
	        if (!name) {
	          console.log('  用法: /workspace switch <工作区名称>\n');
	          continue;
	        }
	        if (!_workspaceManager) {
	          console.log('  ⚠️ Workspace 系统未初始化\n');
	        } else {
	          const result = _workspaceManager.switchWorkspace(name);
	          if (result.success) {
	            history.refreshSystemPrompt();
	            console.log('  ✅ 已切换到工作区 "' + name + '"\n');
	            console.log('  ' + _workspaceManager.getSummary() + '\n');
	          } else {
	            console.log('  ❌ ' + result.error + '\n');
	          }
	        }
	        continue;
	      }

	      if (subCmd === 'init') {
	        const name = parts[2];
	        if (!name) {
	          console.log('  用法: /workspace init <工作区名称>\n');
	          continue;
	        }
	        if (!_workspaceManager) {
	          console.log('  ⚠️ Workspace 系统未初始化\n');
	        } else {
	          const result = _workspaceManager.initWorkspace(name);
	          if (result.success) {
	            history.refreshSystemPrompt();
	            console.log('  ✅ 已创建并切换到工作区 "' + name + '"\n');
	          } else {
	            console.log('  ❌ ' + result.error + '\n');
	          }
	        }
	        continue;
	      }

	      console.log('  未知子命令 "' + subCmd + '"。可用: show, list, switch, init\n');
	      continue;
	    }

// --- 技能命令处理 ---
    if (trimmed.startsWith('/skills')) {
      const parts = trimmed.split(/\s+/);
      const subCmd = parts[1];

      if (!subCmd || subCmd === 'list') {
        // 列出已安装技能，支持 --tag 过滤
        let tagFilter = null;
        if (parts[2] === '--tag' && parts[3]) {
          tagFilter = parts[3];
        }

        if (!skillManager || skillManager.count === 0) {
          console.log('  📭 未安装任何技能\n');
        } else {
          const skills = skillManager.getSummaryList(tagFilter);
          if (skills.length === 0) {
            console.log(`  📭 未找到${tagFilter ? `标签为 "${tagFilter}" 的` : ''}技能\n`);
          } else {
            console.log(`  已安装技能 (${skills.length}):`);
            for (const s of skills) {
              const info = skillManager.getInfo(s.name);
              const tags = info && info.tags && info.tags.length > 0 ? ` [${info.tags.join(', ')}]` : '';
              console.log(`    📄 ${s.name} — ${s.description || '无描述'}${tags}`);
            }
          }
          console.log();
        }
        continue;
      }

      if (subCmd === 'search') {
        const query = parts.slice(2).join(' ');
        if (!query) {
          console.log('  用法: /skills search <关键词>\n');
          continue;
        }

        console.log(`  🔍 正在搜索 "${query}"...`);
        try {
          const { searchSkills } = await import('./clawhub.js');
          const results = await searchSkills(query);
          if (!results || results.length === 0) {
            console.log('  未找到相关技能\n');
          } else {
            console.log(`  搜索结果 (${results.length}):`);
            for (const s of results.slice(0, 15)) {
              console.log(`    📦 ${s.name || s.slug} — ${(s.description || '无描述').slice(0, 60)}`);
            }
            console.log('  使用 /skills install <名称> 安装\n');
          }
        } catch (err) {
          console.log(`  ❌ 搜索失败: ${err.message}\n`);
        }
        continue;
      }

      if (subCmd === 'install') {
        const name = parts[2];
        if (!name) {
          console.log('  用法: /skills install <技能名称>\n');
          continue;
        }

        console.log(`  📥 正在安装 "${name}"...`);
        try {
          const { installSkill } = await import('./clawhub.js');
          const result = await installSkill(name);
          // 重新加载技能
          if (skillManager) {
            skillManager.loadAll();
            history.refreshSystemPrompt();
          }
          console.log(`  ✅ 技能 "${result.name}" 已安装\n`);
        } catch (err) {
          console.log(`  ❌ 安装失败: ${err.message}\n`);
        }
        continue;
      }

      if (subCmd === 'uninstall') {
        const name = parts[2];
        if (!name) {
          console.log('  用法: /skills uninstall <技能名称>\n');
          continue;
        }
        if (!skillManager) {
          console.log('  ❌ SkillManager 未初始化\n');
          continue;
        }
        const result = skillManager.uninstall(name);
        console.log(`  ${result.includes('未找到') ? '❌' : '✅'} ${result}\n`);
        continue;
      }

      if (subCmd === 'update') {
        const name = parts[2];
        if (!name) {
          console.log('  用法: /skills update <技能名称>\n');
          continue;
        }
        if (!skillManager) {
          console.log('  ❌ SkillManager 未初始化\n');
          continue;
        }
        console.log(`  📥 正在更新 "${name}"...`);
        try {
          const result = await skillManager.update(name);
          history.refreshSystemPrompt();
          console.log(`  ✅ ${result}\n`);
        } catch (err) {
          console.log(`  ❌ 更新失败: ${err.message}\n`);
        }
        continue;
      }

      if (subCmd === 'disable') {
        const name = parts[2];
        if (!name) {
          console.log('  用法: /skills disable <技能名称>\n');
          continue;
        }
        if (!skillManager) {
          console.log('  ❌ SkillManager 未初始化\n');
          continue;
        }
        const result = skillManager.disable(name);
        history.refreshSystemPrompt();
        console.log(`  ${result.includes('未找到') ? '❌' : '✅'} ${result}\n`);
        continue;
      }

      if (subCmd === 'enable') {
        const name = parts[2];
        if (!name) {
          console.log('  用法: /skills enable <技能名称>\n');
          continue;
        }
        if (!skillManager) {
          console.log('  ❌ SkillManager 未初始化\n');
          continue;
        }
        const result = skillManager.enable(name);
        history.refreshSystemPrompt();
        console.log(`  ${result.includes('未找到') ? '❌' : '✅'} ${result}\n`);
        continue;
      }

      if (subCmd === 'info') {
        const name = parts[2];
        if (!name) {
          console.log('  用法: /skills info <技能名称>\n');
          continue;
        }
        if (!skillManager) {
          console.log('  ❌ SkillManager 未初始化\n');
          continue;
        }
        const info = skillManager.getInfo(name);
        if (!info) {
          console.log(`  ❌ 技能 "${name}" 未找到\n`);
        } else {
          console.log(`  技能信息: ${info.name}`);
          console.log(`    描述: ${info.description || '无'}`);
          console.log(`    目录: ${info.dir}`);
          console.log(`    状态: ${info.disabled ? '禁用' : '启用'}`);
          console.log(`    来源: ${info.source || '未知'}`);
          if (info.tags && info.tags.length > 0) console.log(`    标签: ${info.tags.join(', ')}`);
          if (info.version) console.log(`    版本: ${info.version}`);
          if (info.installedAt) console.log(`    安装时间: ${new Date(info.installedAt).toLocaleString('zh-CN')}`);
          if (info.dependencies) {
            const deps = info.dependencies.skills || [];
            const mcps = info.dependencies.mcp || [];
            if (deps.length > 0 || mcps.length > 0) {
              console.log(`    依赖:`);
              if (deps.length > 0) console.log(`      技能: ${deps.join(', ')}`);
              if (mcps.length > 0) console.log(`      MCP: ${mcps.join(', ')}`);
            }
          }
          console.log();
        }
        continue;
      }

      if (subCmd === 'config') {
        const name = parts[2];
        const key = parts[3];
        const value = parts.slice(4).join(' ');
        if (!name) {
          console.log('  用法: /skills config <技能名称> [键] [值]\n');
          continue;
        }
        if (!skillManager) {
          console.log('  ❌ SkillManager 未初始化\n');
          continue;
        }
        if (key && value) {
          console.log(`  ${skillManager.setConfig(name, key, value)}\n`);
        } else {
          const config = skillManager.getConfig(name);
          if (config === null) {
            console.log(`  ❌ 技能 "${name}" 未找到\n`);
          } else if (Object.keys(config).length === 0) {
            console.log(`  技能 "${name}" 无配置项\n`);
          } else {
            console.log(`  技能 "${name}" 配置:`);
            for (const [k, v] of Object.entries(config)) {
              console.log(`    ${k}: ${v}`);
            }
            console.log();
          }
        }
        continue;
      }

      if (subCmd === 'rollback') {
        const name = parts[2];
        if (!name) {
          console.log('  用法: /skills rollback <技能名称>\n');
          continue;
        }
        if (!skillManager) {
          console.log('  ❌ SkillManager 未初始化\n');
          continue;
        }
        const result = skillManager.rollback(name);
        history.refreshSystemPrompt();
        console.log(`  ${result.includes('失败') ? '❌' : '✅'} ${result}\n`);
        continue;
      }

      if (subCmd === 'deps') {
        const name = parts[2];
        if (!name) {
          console.log('  用法: /skills deps <技能名称>\n');
          continue;
        }
        if (!skillManager) {
          console.log('  ❌ SkillManager 未初始化\n');
          continue;
        }
        const tree = skillManager.getDependencyTree(name);
        if (!tree) {
          console.log(`  ❌ 技能 "${name}" 未找到\n`);
        } else {
          const printTree = (node, indent) => {
            console.log(`${indent}${node.missing ? '❌' : '📦'} ${node.name}${node.missing ? ' (缺失)' : ''}`);
            for (const dep of node.skills || []) {
              printTree(dep, indent + '  ');
            }
            if (node.mcp && node.mcp.length > 0) {
              for (const m of node.mcp) {
                console.log(`${indent}  🔌 MCP: ${m}`);
              }
            }
          };
          console.log(`  依赖树: "${name}"`);
          printTree(tree, '    ');
          console.log();
        }
        continue;
      }

      console.log(`  未知子命令 "${subCmd}"。可用: list, search, install, uninstall, update, enable, disable, info\n`);
      continue;
    }

  // --- 对话处理 ---
    history.add('user', trimmed);
    await hooks.emit('onMessage', { input: trimmed, history });

    // 循环处理 LLM 调用 + 工具调用
    let rounds = 0;
        // [FIX-3] 降低最大轮次：多层 agent 通常 3-5 轮足够
    const MAX_ROUNDS = 199;

    while (rounds < MAX_ROUNDS) {
      rounds++;

      try {
        const msgContext = await hooks.emit('beforeLLM', {
          messages: history.getMessages(),
          tools: toolDefinitions,
        });

        // === 流式 LLM 调用：逐字显示 AI 思考过程 ===
        console.log(`  ── 第 ${rounds} 轮 ──`);

        let streamContent = '';
        const toolAccum = {};
        const toolOrder = [];
        let streamUsage = {};
        let streamFinishReason = null;
        let continuationCount = 0;
        const streamStartTime = Date.now();

        await new Promise((resolve, reject) => {
          callLLMStream(msgContext.messages, msgContext.tools, {
            onChunk(text) {
              process.stdout.write(text);
              streamContent += text;
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
              }
              if (tc.function?.name) toolAccum[idx].function.name += tc.function.name;
              if (tc.function?.arguments) {
                // [FIX-1] 流式 arguments 拼接防护：
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
            onDone(usage, finish_reason) {
              streamUsage = usage || {};
              streamFinishReason = finish_reason;
              resolve();
            },
            onError(err) {
              reject(err);
            },
          });
        });

        process.stdout.write('\n');

        // MiniMax 流式 API 不返回 usage，本地估算 Token 用量
        if (!streamUsage.prompt_tokens && !streamUsage.completion_tokens) {
          const inputText = msgContext.messages.map(m => {
            if (typeof m.content === 'string') return m.content;
            if (Array.isArray(m.content)) return m.content.map(c => c.text || '').join(' ');
            return '';
          }).join(' ');
          streamUsage.prompt_tokens = estimateTokenCount(inputText);
          streamUsage.completion_tokens = estimateTokenCount(streamContent);
        }

        // 记录 LLM 调用统计到数据库
        try {
          const { trackLLMCall } = await import('./stats/tracker.js');
          trackLLMCall({
            model: config.model,
            promptTokens: streamUsage.prompt_tokens,
            completionTokens: streamUsage.completion_tokens,
            durationMs: Date.now() - streamStartTime,
          });
        } catch {}

        // 构建兼容的响应对象，保证下游 hooks 正常工作
        const streamToolCalls = toolOrder
          .map(i => toolAccum[i])
          .filter(tc => tc.function.name);

        const streamResponse = {
          choices: [{
            message: {
              content: streamContent || null,
              tool_calls: streamToolCalls.length > 0 ? streamToolCalls : undefined,
            },
          }],
          usage: streamUsage,
        };

        const hookResult = await hooks.emit('afterLLM', { data: streamResponse });
        const finalData = hookResult.data || streamResponse;

        const choice = finalData.choices?.[0];
        if (!choice) {
          console.log('  ⚠️ 未收到有效回复\n');
          break;
        }

        const message = choice.message;

        // 显示用量统计
        const usageStr = formatUsage(finalData.usage);
        if (usageStr) console.log(usageStr);

        // 注意：内容已在流式阶段逐字显示，此处不再重复

        // 处理工具调用
        const toolCalls = message.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
          // 思考阶段结束，准备执行工具
          console.log();

          // [FIX-2] 入库前校验 tool_calls[*].function.arguments 是否为合法 JSON
          // 损坏的 arguments 字符串会污染 history，下一轮触发上游 400
          const cleanToolCalls = toolCalls.filter(tc => {
            try {
              JSON.parse(tc.function?.arguments || '{}');
              return true;
            } catch (e) {
              console.log(`  ⚠️ [FIX-2] 丢弃非法 arguments 的 tool_call (${tc.function?.name || 'unknown'}): ${(tc.function?.arguments || '').slice(0, 60)}...`);
              return false;
            }
          });

          // 全部无效则跳过本轮工具执行
          if (cleanToolCalls.length === 0) {
            console.log('  ❌ [FIX-2] 所有 tool_call 的 arguments 都非法，跳过本轮');
            break;
          }

          history.addAssistantMessage({
            role: 'assistant',
            content: message.content || null,
            tool_calls: cleanToolCalls,
          });

          const totalTools = toolCalls.length;

          // 解析参数并触发 beforeTool 钩子
          const parsedToolCalls = [];
          for (let i = 0; i < totalTools; i++) {
            const tc = toolCalls[i];
            let args;
            try {
              args = JSON.parse(tc.function.arguments);
            } catch {
              args = {};
            }
            const toolCtx = await hooks.emit('beforeTool', { name: tc.function.name, args });
            parsedToolCalls.push({ tc, toolCtx });
          }

          // 显示所有即将并行执行的工具
          for (let i = 0; i < parsedToolCalls.length; i++) {
            console.log(`  ⚙️ [${i + 1}/${totalTools}] ${parsedToolCalls[i].toolCtx.name}`);
          }

          // 并行执行所有工具
          const stopTimer = startElapsedTimer();
          const toolResults = await Promise.all(parsedToolCalls.map(({ tc, toolCtx }) =>
            executeTool(toolCtx.name, toolCtx.args)
              .then(result => ({ tc, toolCtx, result }))
              .catch(err => ({ tc, toolCtx, result: `错误: ${err.message}` }))
          ));
          stopTimer();

          // 按顺序处理结果（保持 LLM 上下文一致性）
          for (const { tc, toolCtx, result } of toolResults) {
            const afterCtx = await hooks.emit('afterTool', {
              name: tc.function.name,
              args: toolCtx.args,
              result,
            });
            const finalResult = afterCtx.result || result;
            console.log(`     📦 ${finalResult.slice(0, 250)}${finalResult.length > 250 ? '...' : ''}`);
            history.addToolResult(tc.id, finalResult);
          }

          continue;
        }

        // 没有工具调用：将助手回复加入历史
        // [FIX-3 反幻觉验证] 检查模型是否在未调工具的情况下编造了事实性数据
        if (message.content) {
          const suspiciousPatterns = [
            /\/opt\/|\/root\/|\/etc\/|\/var\//g,
            /\d+[\.\,]?\d*\s*(秒|分钟|小时|ms|MB|GB|KB|个|条|次)/g,
            /[大小|数量|总计|合计|共有]\s*[：:]?\s*\d+/g,
            /耗时|用时|花费|经过/g,
            /(目录|文件夹|文件|进程|端口|服务|用户|权限)[：:]?\s*\S+/g,
          ];
          let hasSuspiciousContent = false;
          for (const pattern of suspiciousPatterns) {
            if (pattern.test(message.content)) {
              hasSuspiciousContent = true;
              break;
            }
          }
          if (hasSuspiciousContent) {
            console.log('  ⚠️ [FIX-3] 模型未调用任何工具就给出了事实性数据，可能存在 AI 幻觉！');
            console.log('  ⚠️ [FIX-3] 建议让模型通过工具验证后再相信以上内容');
          }
        }
        history.addAssistantMessage({
          role: 'assistant',
          content: message.content,
        });

        // [续接] 因 max_tokens 截断时自动续接（最多 5 次）
        if (streamFinishReason === 'length' && continuationCount < 5) {
          continuationCount++;
          console.log(`  🔄 回答被截断（第 ${continuationCount}/5 次续接），正在继续...`);
          history.addUserMessage('请从上次中断处继续你的回答，不要重复已说过的内容。');
          continue;
        }
        break;
      } catch (err) {
        console.log(`  ❌ 发生错误: ${err.message}\n`);
        break;
      }
    }

    if (rounds >= MAX_ROUNDS) {
      console.log(`  ⚠️ 达到最大工具调用轮次 (${MAX_ROUNDS})，已停止\n`);
    }
  }

  rl.close();
}
