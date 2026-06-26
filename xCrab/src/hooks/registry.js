/**
 * xCrab Hook 系统
 * 在 LLM 调用/工具执行等生命周期节点插入自定义逻辑
 *
 * 支持事件:
 *   onStart    - xCrab 启动时
 *   onExit     - xCrab 退出时
 *   beforeLLM  - LLM 调用前，可修改 messages
 *   afterLLM   - LLM 调用后，可修改 response
 *   beforeTool - 工具执行前，可修改 args
 *   afterTool  - 工具执行后，可修改 result
 *   onMessage  - 用户输入消息时
 */

export class HookRegistry {
  constructor() {
    /** @type {Map<string, Function[]>} */
    this._hooks = new Map();
  }

  /**
   * 注册一个 hook
   * @param {string} event - 事件名
   * @param {Function} handler - async (context) => context
   * @returns {Function} 取消注册的函数
   */
  on(event, handler) {
    if (!this._hooks.has(event)) {
      this._hooks.set(event, []);
    }
    this._hooks.get(event).push(handler);
    return () => this.off(event, handler);
  }

  /**
   * 移除一个 hook
   */
  off(event, handler) {
    const handlers = this._hooks.get(event);
    if (!handlers) return;
    const idx = handlers.indexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  }

  /**
   * 触发事件，串行执行所有 handler
   * @param {string} event
   * @param {object} context - 可被 handler 修改的上下文
   * @returns {Promise<object>} 修改后的 context
   */
  async emit(event, context = {}) {
    const handlers = this._hooks.get(event);
    if (!handlers || handlers.length === 0) return context;
    let ctx = context;
    for (const handler of handlers) {
      try {
        ctx = (await handler(ctx)) || ctx;
      } catch (err) {
        console.error(`  ⚠️ Hook "${event}" 执行出错: ${err.message}`);
      }
    }
    return ctx;
  }

  /**
   * 列出所有已注册的 hook
   */
  list() {
    const result = {};
    for (const [event, handlers] of this._hooks) {
      result[event] = handlers.length;
    }
    return result;
  }
}

/** 全局单例 */
export const hooks = new HookRegistry();
