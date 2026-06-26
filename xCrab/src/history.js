import { getModel } from './config.js';

function getBasePrompt() {
  const modelName = getModel();
   return `
# 角色设定

- 名称：xCrab
- Emoji：🦀
- 模型：${modelName}
- 核心能力：通过工具调用帮助用户解决问题

---

# 工作目录规则

| 类型 | 存储路径 |
|----|----|
| 临时文件（文件 / 文件夹 / 图片） | /opt/cclaw-client/UbuntuClaw/xCrab/data/workspace-temporary |
| 永久文件（或未来可能复用） | /opt/cclaw-client/UbuntuClaw/xCrab/data/workspace-permanent |
| 禁止存放路径（非必要严禁使用） | /opt/cclaw-client/UbuntuClaw/xCrab |

---

# 行为准则（必须严格遵守）

1. 通过工具获取足够信息后，应立即总结并回答用户，**禁止产生 AI 幻觉**。
2. 回复前必须先判断是否需要调用工具：
   - 需要 → 调用工具 → 返回结果
   - 不需要 → 直接回答
3. 禁止在没有实际工具调用的情况下，仅凭推测回答用户问题。
4. **所有涉及文件系统状态、目录/文件是否存在、权限、配置内容等事实性问题，必须先调用 list_files、read_file、run_command 等工具进行实际验证，拿到工具返回的确定结果后才能回答。严禁在未调用任何工具核实的情况下仅凭经验记忆或推测下定论。**

5. **工具调用铁律（违者视为 AI 幻觉，必须遵守）：**
   - **如果用户的问题可以通过工具解决，你必须先调用工具验证后才能回答。**
   - 即使你"觉得"你知道答案，也必须先调用工具获取真实数据后再回答。
   - 如果工具执行失败或返回空结果，你必须如实告知用户"工具返回了空结果"或"执行失败了"，**绝不能自己编造一个结果来凑数**。
   - **严禁在未调用任何工具的情况下凭空编造数据、文件内容、系统状态、计算结果或任何事实性信息。**
   - 如果连续两次回复中都没有调用工具就给出具体数据/结论，系统将判定为 AI 幻觉并记录警告。

---

# 特殊系统（按需启用）

> 以下系统 **无需主动读取**，仅在用户消息明确涉及相关内容时使用:

1:技能系统

2:记忆系统

`;
}

export class History {
  /**
   * @param {object} skillManager
   * @param {object} memoryStore
   * @param {number} maxTokens
   * @param {object} workspaceManager
   * @param {string} [userId] - 用户标识，用于记忆隔离
   */
  constructor(skillManager = null, memoryStore = null, maxTokens = 1000000, workspaceManager = null, userId = null) {
    this.maxTokens = maxTokens;
    this.skillManager = skillManager;
    this.memoryStore = memoryStore;
    this.workspaceManager = workspaceManager;
    this.userId = userId;
    this._workspaceVersion = -1;
    this.messages = [{ role: 'system', content: this._buildSystemPrompt() }];
    if (this.workspaceManager) this._workspaceVersion = this.workspaceManager.version;
  }

  setWorkspaceManager(wm) {
    this.workspaceManager = wm;
    this.refreshSystemPrompt();
  }

  /** 构建 system prompt（仅含基础提示词 + 工作区文件，技能和记忆按需注入） */
  _buildSystemPrompt() {
    let prompt = getBasePrompt();

    // 注入工作区上下文（传入 userId 实现用户级文件隔离）
    if (this.workspaceManager) {
      const wsText = this.workspaceManager.formatForPrompt(this.userId);
      if (wsText) {
        prompt += wsText;
      }
    }

    return prompt;
  }

  /** 刷新 system prompt（技能列表变化后调用） */
  refreshSystemPrompt() {
    if (this.messages.length > 0 && this.messages[0].role === 'system') {
      this.messages[0].content = this._buildSystemPrompt();
    }
  }

  add(role, content) {
    this.messages.push({ role, content });
    this._trim();
  }

  addToolResult(toolCallId, content) {
    this.messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      content: String(content),
    });
    this._trim();
  }

  addAssistantMessage(message) {
    this.messages.push(message);
    this._trim();
  }

  getMessages() {
    // 每次调用时刷新 system prompt，确保工作区文件修改和记忆变更立即生效
    this.refreshSystemPrompt();
    return this.messages;
  }

  _trim() {
    let total = 0;
    const recent = [];

    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (msg.role === 'system') continue;
      const len = msg.content ? msg.content.length : 0;
      if (total + len > this.maxTokens * 2) break;
      total += len;
      recent.push(msg);
    }

    recent.reverse();
    // 保留现有 system 消息，不再每次重建（避免过度调用 _buildSystemPrompt）
    const systemMsg = this.messages.find(m => m.role === 'system');
    this.messages = [systemMsg || { role: 'system', content: this._buildSystemPrompt() }, ...recent];
  }

  clear() {
    this.messages = [{ role: 'system', content: this._buildSystemPrompt() }];
  }

  printStats() {
    const totalChars = this.messages.reduce((s, m) => s + (m.content?.length || 0), 0);
    console.log(`  [历史: ${this.messages.length} 条消息, ~${Math.ceil(totalChars / 2)} tokens]`);

    // 如果启用了记忆，显示记忆统计
    if (this.memoryStore) {
      const memories = this.memoryStore.getAll(this.userId);
      const summaries = this.memoryStore.getRecentSummaries(5, { userId: this.userId });
      console.log(`  [记忆: ${memories.length} 条, 对话摘要: ${summaries.length} 条]`);
    }
  }

  /**
   * 获取当前对话的最后一条用户消息
   * 用于 LLM 调用后自动生成对话摘要
   */
  getLastUserMessage() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === 'user') {
        return this.messages[i].content;
      }
    }
    return null;
  }

  /**
   * 获取当前对话的最后一条助手回复
   */
  getLastAssistantMessage() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m.role === 'assistant' && m.content && !m.tool_calls) {
        return m.content;
      }
    }
    return null;
  }
}
