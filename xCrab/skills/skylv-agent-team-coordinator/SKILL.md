---
name: "multi-agent-orchestrator"
slug: skylv-multi-agent-orchestrator
version: 1.0.2
description: Multi-agent orchestration designer. Designs agent collaboration, task routing, and state management. Triggers: multi-agent, agent orchestration, agent collaboration.
author: SKY-lv
license: MIT-0
tags: [multi, openclaw, agent]
keywords: openclaw, skill, automation, ai-agent
triggers: multi agent orchestrator
---

# Multi-Agent Orchestrator

## 功能说明

设计和管理多Agent协作系统。

## 架构模式

```
┌─────────────┐
│ Orchestrator │ ← 任务分解、协调
└──────┬──────┘
       │
   ┌───┼───┐
   ▼   ▼   ▼
 ┌───┐┌───┐┌───┐
 │ A ││ B ││ C │ ← 专业Agent
 └───┘└───┘└───┘
```

## 核心实现

### 1. Agent基类

```typescript
interface AgentConfig {
  name: string;
  role: string;
  capabilities: string[];
  llm: LLMConfig;
  tools: Tool[];
  instructions: string;
}

class BaseAgent {
  protected config: AgentConfig;
  protected memory: AgentMemory;
  
  constructor(config: AgentConfig) {
    this.config = config;
    this.memory = new AgentMemory(config.name);
  }
  
  async think(task: Task): Promise<Response> {
    const context = await this.memory.buildContext(task.description);
    const prompt = this.buildPrompt(task, context);
    const response = await this.callLLM(prompt);
    await this.memory.add({ type: 'semantic', content: task.description + ' -> ' + response.content, importance: 8 });
    return response;
  }
  
  protected buildPrompt(task: Task, context: string): Message[] {
    return [
      { role: 'system', content: this.config.instructions },
      { role: 'system', content: context },
      { role: 'user', content: task.description }
    ];
  }
  
  protected async callLLM(messages: Message[]): Promise<Response> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: this.config.llm.model, messages, tools: this.config.tools.map(t => t.definition) })
    });
    return res.json();
  }
}
```

### 2. 编排器

```typescript
interface TaskResult {
  agentId: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  output?: string;
  dependencies: string[];
  startTime?: number;
  endTime?: number;
}

class Orchestrator {
  private agents: Map<string, BaseAgent> = new Map();
  private taskGraph: DAG<Task>;
  
  constructor(private llmRouter: LLMRouter) {}
  
  registerAgent(agent: BaseAgent) {
    this.agents.set(agent.config.name, agent);
  }
  
  async execute(goal: string): Promise<string> {
    // 1. 任务分解
    const plan = await this.decompose(goal);
    
    // 2. 构建DAG
    this.taskGraph = this.buildDAG(plan);
    
    // 3. 执行调度
    const results = await this.schedule();
    
    // 4. 汇总结果
    return this.summarize(goal, results);
  }
  
  private async decompose(goal: string): Promise<Task[]> {
    const response = await this.llmRouter.route({
      prompt: `将以下任务分解为可执行的子任务，返回JSON数组：
      
目标: ${goal}

要求：
- 每个子任务只由一个Agent负责
- 明确任务依赖关系
- 返回格式: [{"id":"t1","description":"...","agent":"researcher","depends":[]},...]`,
      system: '你是任务分解专家。'
    });
    
    return JSON.parse(response.content);
  }
  
  private async schedule(): Promise<Map<string, TaskResult>> {
    const results = new Map<string, TaskResult>();
    const pending = new Set(this.taskGraph.nodes);
    const running: Promise<void>[] = [];
    const maxConcurrent = 3;
    
    while (pending.size > 0 || running.length > 0) {
      // 启动可并行的任务
      while (running.length < maxConcurrent) {
        const next = this.findNextRunnable(pending, results);
        if (!next) break;
        
        pending.delete(next.id);
        const p = this.runTask(next, results).catch(console.error);
        running.push(p);
      }
      
      // 等待一个完成
      await Promise.race(running);
      running.splice(running.findIndex(p => false), 1);
    }
    
    return results;
  }
  
  private async runTask(task: Task, results: Map<string, TaskResult>) {
    results.set(task.id, { agentId: task.agent, status: 'running', dependencies: task.depends || [], startTime: Date.now() });
    
    try {
      // 等待依赖完成
      for (const depId of task.depends || []) {
        const dep = results.get(depId);
        if (dep?.status !== 'done') {
          await this.waitFor(depId, results);
        }
      }
      
      const agent = this.agents.get(task.agent);
      const context = this.buildContext(task, results);
      const response = await agent.think({ id: task.id, description: task.description, context });
      
      results.set(task.id, { ...results.get(task.id)!, status: 'done', output: response.content, endTime: Date.now() });
    } catch (error) {
      results.set(task.id, { ...results.get(task.id)!, status: 'failed', output: String(error), endTime: Date.now() });
    }
  }
  
  private buildContext(task: Task, results: Map<string, TaskResult>): string {
    return (task.depends || []).map(depId => {
      const dep = results.get(depId);
      return dep?.output || '';
    }).join('\n\n');
  }
}
```

### 3. 消息总线

```typescript
class MessageBus {
  private subscriptions = new Map<string, Subscriber[]>();
  
  publish(channel: string, message: Message) {
    const subs = this.subscriptions.get(channel) || [];
    for (const sub of subs) {
      sub.handler(message);
    }
  }
  
  subscribe(channel: string, handler: (msg: Message) => void): () => void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, []);
    }
    const sub = { id: crypto.randomUUID(), handler };
    this.subscriptions.get(channel)!.push(sub);
    return () => this.unsubscribe(channel, sub.id);
  }
  
  unsubscribe(channel: string, subId: string) {
    const subs = this.subscriptions.get(channel) || [];
    const idx = subs.findIndex(s => s.id === subId);
    if (idx >= 0) subs.splice(idx, 1);
  }
}

// 消息类型
interface Message {
  id: string;
  type: 'request' | 'response' | 'broadcast' | 'event';
  from: string;
  to?: string;
  content: any;
  timestamp: number;
}
```

### 4. 状态机

```typescript
type AgentState = 'idle' | 'thinking' | 'waiting' | 'acting' | 'error';

interface AgentSession {
  id: string;
  agentId: string;
  state: AgentState;
  currentTask?: string;
  history: Turn[];
  sharedContext: Record<string, any>;
}

class StateManager {
  private sessions = new Map<string, AgentSession>();
  
  transition(sessionId: string, newState: AgentState) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const oldState = session.state;
    session.state = newState;
    
    // 状态转换钩子
    this.onTransition(sessionId, oldState, newState);
  }
  
  // 状态转换规则
  private canTransition(from: AgentState, to: AgentState): boolean {
    const rules: Record<AgentState, AgentState[]> = {
      idle: ['thinking'],
      thinking: ['waiting', 'acting', 'error', 'idle'],
      waiting: ['thinking', 'error', 'idle'],
      acting: ['thinking', 'error', 'idle'],
      error: ['idle', 'thinking']
    };
    return rules[from]?.includes(to) || false;
  }
}
```

## 通信模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| 广播 | 所有Agent接收 | 全局通知 |
| 点对点 | 指定Agent接收 | 任务分配 |
| 发布/订阅 | 按主题分发 | 事件驱动 |
| 黑板 | 共享知识空间 | 协作推理 |

## 常见模式

### 角色扮演（Role Play）
```typescript
class RolePlayOrchestrator extends Orchestrator {
  async execute(goal: string) {
    // 分配角色
    const planner = this.getAgent('planner');
    const executor = this.getAgent('executor');
    const critic = this.getAgent('critic');
    
    const plan = await planner.think({ description: goal });
    const result = await executor.think({ description: plan.output, context: '' });
    const review = await critic.think({ description: result.output, context: '' });
    
    return review.output;
  }
}
```

### 辩论（Debate）
```typescript
async debate(topic: string, rounds = 3) {
  const pro = this.getAgent('pro');
  const con = this.getAgent('con');
  const judge = this.getAgent('judge');
  
  let context = '';
  for (let i = 0; i < rounds; i++) {
    const proArg = await pro.think({ description: `正方论点 (第${i+1}轮): ${topic}`, context });
    context += `\n正方: ${proArg.output}`;
    
    const conArg = await con.think({ description: `反方论点 (第${i+1}轮): ${topic}`, context });
    context += `\n反方: ${conArg.output}`;
  }
  
  return judge.think({ description: `裁决: ${topic}`, context });
}
```

## 最佳实践

1. **单一职责**：每个Agent有明确的专业领域
2. **松耦合**：通过消息总线通信，避免直接依赖
3. **超时控制**：防止某个Agent卡死
4. **熔断机制**：失败次数过多自动降级
5. **可观测性**：完整日志和追踪

## Usage

1. Install the skill
2. Configure as needed
3. Run with OpenClaw
