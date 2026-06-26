/**
 * xCrab Gateway Web 前端 - 主逻辑
 */

const API_BASE = '/api';
let currentSessionId = localStorage.getItem('xcrab_session') || '';
let sessions = JSON.parse(localStorage.getItem('xcrab_sessions') || '[]');
let currentEventSource = null;
let isExecuting = false;

/** 超时弹窗「是，终止任务」按钮 */
async function stopTimeoutTask() {
  document.getElementById('timeout-modal').style.display = 'none';
  await fetch(`${API_BASE}/chat/timeout-response`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ sessionId: currentSessionId, action: 'stop' }),
  });
}

// 自动补全 sessionId
if (!currentSessionId) {
  currentSessionId = genId();
  localStorage.setItem('xcrab_session', currentSessionId);
}

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  loadSessions();
  restoreCurrentSession();
  renderSessions();

  // 输入框自动调整高度 + Enter 发送
  const input = document.getElementById('command');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    setTimeout(autoResize, 0);
  });
  input.addEventListener('input', autoResize);
  input.focus();
});

function autoResize() {
  const el = document.getElementById('command');
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ========== 侧边栏 ==========
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function newSession() {
  currentSessionId = genId();
  localStorage.setItem('xcrab_session', currentSessionId);
  document.getElementById('chat-box').innerHTML = `
    <div class="welcome">
      <div class="welcome-icon">🦀</div>
      <div class="welcome-title">xCrab AI 助手</div>
      <div class="welcome-desc">迷你 · 敏捷 · 强大</div>
    </div>`;
  updateStatus('idle');
  document.getElementById('command').focus();
  // 移动端关闭侧边栏
  if (window.innerWidth <= 768) toggleSidebar();
}

function clearChat() {
  document.getElementById('chat-box').innerHTML = `
    <div class="welcome">
      <div class="welcome-icon">🦀</div>
      <div class="welcome-title">xCrab AI 助手</div>
      <div class="welcome-desc">迷你 · 敏捷 · 强大</div>
    </div>`;
}

// ========== 发送消息 ==========
async function sendMessage() {
  const input = document.getElementById('command');
  const text = input.value.trim();
  if (!text || isExecuting) return;

  input.value = '';
  autoResize();

  // 添加用户消息
  addMessage('user', text);
  isExecuting = true;
  updateStatus('thinking');

  // 添加 AI 等待气泡
  const chatBox = document.getElementById('chat-box');
  const aiMsg = document.createElement('div');
  aiMsg.className = 'msg msg-ai';
  aiMsg.id = 'msg-waiting';
  aiMsg.innerHTML = `
    <div class="msg-avatar">🦀</div>
    <div class="msg-bubble msg-bubble-ai">
      <div class="thinking-dots"><span>.</span><span>.</span><span>.</span></div>
    </div>`;
  chatBox.appendChild(aiMsg);
  chatBox.scrollTop = chatBox.scrollHeight;

  // 建立 SSE 连接
  const token = getToken();
  if (!token) {
    showToast('error', '请设置访问令牌');
    isExecuting = false;
    updateStatus('idle');
    aiMsg.remove();
    return;
  }

  try {
    // 先 POST 发送消息
    const resp = await fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ message: text, sessionId: currentSessionId }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ message: '请求失败' }));
      throw new Error(err.message || `HTTP ${resp.status}`);
    }
  } catch (err) {
    showToast('error', `发送失败: ${err.message}`);
    aiMsg.remove();
    isExecuting = false;
    updateStatus('idle');
    return;
  }

  // 连接 SSE 接收流式回复
  connectSSE(currentSessionId);
}

function connectSSE(sessionId) {
  if (currentEventSource) {
    currentEventSource.close();
  }

  const token = getToken();
  const url = `${API_BASE}/chat/stream?sessionId=${sessionId}&token=${encodeURIComponent(token)}`;
  const es = new EventSource(url);
  currentEventSource = es;

  let aiContent = '';
  let currentAiMsg = null;

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'session':
          currentSessionId = data.sessionId;
          localStorage.setItem('xcrab_session', currentSessionId);
          break;

        case 'stream':
          if (data.data && data.data.text) {
            aiContent += data.data.text;
            // 更新 AI 消息气泡
            if (!currentAiMsg) {
              const waiting = document.getElementById('msg-waiting');
              if (waiting) waiting.remove();
              currentAiMsg = addMessage('ai', '');
            }
            updateAiMessage(currentAiMsg, aiContent);
          }
          break;

        case 'tool_call':
          // 等待气泡切换为工具调用提示
          {
            const waiting = document.getElementById('msg-waiting');
            if (waiting) {
              waiting.querySelector('.msg-bubble').innerHTML =
                `<div class="tool-call">🔧 调用工具: ${data.data?.name || ''}</div>`;
              waiting.id = '';
            }
          }
          break;

        case 'tool_result':
          break;

        case 'done':
          es.close();
          currentEventSource = null;
          isExecuting = false;
          updateStatus('idle');

          // 清理等待气泡
          const waiting = document.getElementById('msg-waiting');
          if (waiting) waiting.remove();

          // 保存会话
          saveSession();
          break;

        case 'error':
          showToast('error', `错误: ${data.data?.message || '未知错误'}`);
          es.close();
          currentEventSource = null;
          isExecuting = false;
          updateStatus('idle');
          const errWaiting = document.getElementById('msg-waiting');
          if (errWaiting) errWaiting.remove();
          break;

        case 'stopped':
          es.close();
          currentEventSource = null;
          isExecuting = false;
          updateStatus('idle');
          break;

        case 'confirm_timeout':
          {
            const message = data.data?.message || '工具已执行超过 15 分钟，是否终止当前任务？';
            document.getElementById('timeout-message').textContent = message;
            document.getElementById('timeout-modal').style.display = 'flex';
          }
          break;
      }
    } catch (e) {
      // 忽略解析错误
    }
  };

  es.onerror = () => {
    // EventSource 自动重连
    if (es.readyState === EventSource.CLOSED) {
      currentEventSource = null;
      isExecuting = false;
      updateStatus('idle');
    }
  };
}

// ========== 消息渲染 ==========
function addMessage(role, content) {
  const chatBox = document.getElementById('chat-box');
  const template = document.getElementById(role === 'user' ? 'msg-user' : 'msg-ai');
  const clone = template.content.cloneNode(true);
  const msgEl = clone.querySelector('.msg');

  if (role === 'user') {
    msgEl.querySelector('.msg-bubble').textContent = content;
  } else {
    msgEl.id = 'msg-' + genId();
    const bubble = msgEl.querySelector('.msg-bubble');
    bubble.dataset.raw = content;
    bubble.innerHTML = renderMarkdown(content);
  }

  chatBox.appendChild(clone);
  // 处理 Canvas 引用
  if (role === 'ai') {
    processCanvasRefs(msgEl);
  }
  chatBox.scrollTop = chatBox.scrollHeight;
  return chatBox.lastElementChild;
}

function updateAiMessage(msgEl, content) {
  if (!msgEl) return;
  const bubble = msgEl.querySelector('.msg-bubble');
  if (bubble) {
    bubble.dataset.raw = content;
    bubble.innerHTML = renderMarkdown(content);
    processCanvasRefs(bubble);
  }
  document.getElementById('chat-box').scrollTop = document.getElementById('chat-box').scrollHeight;
}

function renderMarkdown(text) {
  if (!text) return '';
  const cleaned = stripAnsi(text);
  let html = escapeHtml(cleaned);

  // 1. 保护代码块，避免被后续替换影响
  const blocks = [];
  html = html.replace(/(`{3})(\w*)\n([\s\S]*?)\n\1/g, (_, bt, lang, code) => {
    const idx = blocks.length;
    blocks.push(`<pre class="code-block"><code>${escapeHtml(code)}</code></pre>`);
    return `\x00BLOCK_${idx}\x00`;
  });

  // 2. 换行转 <br>（在 think 折叠之前，这样 think 内容也正确换行）
  html = html.replace(/\n/g, '<br>');

  // 3. 折叠已闭合的 <think> 块，同时处理嵌套情况
  html = html.replace(/&lt;think&gt;([\s\S]*?)&lt;\/think&gt;/g, (_, content) => {
    // 移除内容中残留的嵌套 think 标签实体（标记泄漏，非实际思考内容）
    const clean = content
      .replace(/&lt;think&gt;[\s\S]*?&lt;\/think&gt;/g, '')
      .replace(/&lt;\/?think&gt;/gi, '');
    const summary = clean.replace(/<br\s*\/?>/gi, ' ').trim().slice(0, 40) + '...';
    return `<details class="think-fold"><summary>💭 ${summary}</summary>${clean}</details>`;
  });

  // 4. 处理未闭合的 <think> 标签（流式响应中可能出现）
  html = html.replace(/&lt;think&gt;([\s\S]*)$/, (_, content) => {
    const clean = content
      .replace(/&lt;think&gt;[\s\S]*?&lt;\/think&gt;/g, '')
      .replace(/&lt;\/?think&gt;/gi, '');
    const summary = clean.replace(/<br\s*\/?>/gi, ' ').trim().slice(0, 40) + '...';
    return `<details class="think-fold" open><summary>💭 ${summary}</summary>${clean}</details>`;
  });

  // 5. 恢复代码块
  html = html.replace(/\x00BLOCK_(\d+)\x00/g, (_, idx) => blocks[parseInt(idx)]);

  // 6. 行内格式
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\[canvas:([a-z0-9]+)\]/g, '<div class="canvas-ref" data-canvas-id="$1"><div class="canvas-loading">📊 加载图表...</div></div>');
  return html;
}

// ========== 状态指示 ==========
function updateStatus(state) {
  const indicator = document.getElementById('status-indicator');
  if (!indicator) return;
  indicator.className = 'status-' + state;
}

// ========== 会话管理 ==========
function saveSession() {
  const chatBox = document.getElementById('chat-box');
  const messages = [];
  chatBox.querySelectorAll('.msg').forEach(el => {
    const role = el.classList.contains('msg-user') ? 'user' : 'ai';
    const bubble = el.querySelector('.msg-bubble');
    const content = bubble ? (bubble.dataset.raw || bubble.textContent) : '';
    if (content) messages.push({ role, content });
  });
  const title = messages.find(m => m.role === 'user')?.content?.slice(0, 30) || '新对话';

  const existing = sessions.findIndex(s => s.id === currentSessionId);
  const entry = { id: currentSessionId, title, messages, updated: Date.now() };
  if (existing >= 0) sessions[existing] = entry;
  else sessions.push(entry);

  // 最多保存 20 个完整会话
  if (sessions.length > 20) sessions = sessions.slice(-20);
  localStorage.setItem('xcrab_sessions', JSON.stringify(sessions));
  renderSessions();
}

function loadSessions() {
  sessions = JSON.parse(localStorage.getItem('xcrab_sessions') || '[]');
  renderSessions();
}

/** 恢复当前会话的聊天记录到页面 */
function restoreCurrentSession() {
  const chatBox = document.getElementById('chat-box');
  const session = sessions.find(s => s.id === currentSessionId);
  if (!session || !session.messages || session.messages.length === 0) {
    chatBox.innerHTML = `
      <div class="welcome">
        <div class="welcome-icon">🦀</div>
        <div class="welcome-title">xCrab AI 助手</div>
        <div class="welcome-desc">迷你 · 敏捷 · 强大</div>
      </div>`;
    return;
  }

  chatBox.innerHTML = '';
  for (const msg of session.messages) {
    addMessage(msg.role, msg.content);
  }
}

function renderSessions() {
  const list = document.getElementById('session-list');
  if (!list) return;
  list.innerHTML = sessions.slice().reverse().slice(0, 30).map(s => {
    const active = s.id === currentSessionId ? ' active' : '';
    const title = s.title || '新对话';
    return `<div class="session-item${active}" onclick="switchSession('${s.id}')">
      <i class="fa-regular fa-comment"></i>
      <span class="session-title">${escapeHtml(title)}</span>
    </div>`;
  }).join('');
}

function switchSession(id) {
  currentSessionId = id;
  localStorage.setItem('xcrab_session', id);
  restoreCurrentSession();
  renderSessions();
  // 移动端关闭侧边栏
  if (window.innerWidth <= 768) toggleSidebar();
}

// ========== Canvas 渲染 ==========

// ========== 模型切换 ==========

/** 获取当前模型信息 */
async function fetchCurrentModel() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/current_model`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.code === 200) {
      const badge = document.getElementById('current-model-badge');
      if (badge) {
        const displayMap = { 'deepseek-v4-flash[1M]': 'DS', 'MiniMax-M2.7': 'MM', 'mimo-v2.5-pro[1M]': 'MIMO' };
        badge.textContent = displayMap[data.data.name] || data.data.name;
      }
      // 高亮当前模型按钮
      document.querySelectorAll('.model-switch-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.model === data.data.model);
      });
    }
  } catch (e) {
    console.error('获取模型信息失败:', e);
  }
}

/** 关闭切换模型弹窗 */
function closeSwitchModel() {
  document.getElementById('switch-model-modal').style.display = 'none';
}

/** 执行模型切换 */
async function executeSwitchModel(model) {
  closeSwitchModel();

  const modelName = model === 'deepseek' ? 'deepseek-v4-flash[1M]' : model === 'mimo' ? 'mimo-v2.5-pro[1M]' : 'MiniMax-M2.7';
  const token = getToken();
  if (!token) {
    showToast('error', '请先设置访问令牌');
    return;
  }

  showToast('info', `正在切换至 ${modelName}...`);

  try {
    const res = await fetch(`${API_BASE}/switch_model`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ model }),
    });
    const data = await res.json();

    if (data.code === 200) {
      showToast('success', `已切换至 ${modelName}`);
      fetchCurrentModel();
    } else {
      showToast('error', data.message || '切换失败');
    }
  } catch (e) {
    showToast('error', `切换失败: ${e.message}`);
  }
}

// 页面加载后获取当前模型
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(fetchCurrentModel, 500);
});

/** 查找并渲染消息中的 Canvas 引用 */
async function processCanvasRefs(container) {
  const refs = container.querySelectorAll('.canvas-ref');
  for (const el of refs) {
    const canvasId = el.dataset.canvasId;
    if (!canvasId) continue;
    try {
      const resp = await fetch(`${API_BASE}/canvas/${canvasId}`);
      const result = await resp.json();
      if (result.code === 200 && result.data) {
        renderChart(el, result.data);
      } else {
        el.innerHTML = '<div class="canvas-error">⚠️ 图表数据未找到</div>';
      }
    } catch (err) {
      el.innerHTML = '<div class="canvas-error">⚠️ 图表加载失败</div>';
    }
  }
}

/** 渲染图表到 DOM */
function renderChart(container, canvas) {
  const { id, type, title, data } = canvas;

  // 清除加载提示
  container.innerHTML = '';

  // 创建包装器
  const wrapper = document.createElement('div');
  wrapper.className = 'canvas-wrapper';

  if (title) {
    const titleEl = document.createElement('div');
    titleEl.className = 'canvas-title';
    titleEl.textContent = title;
    wrapper.appendChild(titleEl);
  }

  if (type === 'table') {
    renderTableChart(wrapper, data);
  } else {
    renderCanvasChart(wrapper, id, type, title, data);
  }

  container.appendChild(wrapper);
}

/** 渲染表格 */
function renderTableChart(wrapper, data) {
  const table = document.createElement('table');
  table.className = 'canvas-table';

  // 表头
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  (data.headers || []).forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // 表体
  const tbody = document.createElement('tbody');
  (data.rows || []).forEach(row => {
    const tr = document.createElement('tr');
    row.forEach(cell => {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrapper.appendChild(table);
}

/** 使用 Chart.js 渲染图表 */
function renderCanvasChart(wrapper, id, type, title, data) {
  const canvasId = 'chart-' + id;
  const canvasEl = document.createElement('canvas');
  canvasEl.id = canvasId;
  wrapper.appendChild(canvasEl);

  // Chart.js 配置
  let config;
  switch (type) {
    case 'bar':
      config = {
        type: 'bar',
        data: {
          labels: data.labels,
          datasets: (data.datasets || []).map(ds => ({
            label: ds.label || '',
            data: ds.values,
            backgroundColor: ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'],
          })),
        },
        options: {
          responsive: true,
          plugins: { legend: { display: (data.datasets || []).length > 1 } },
        },
      };
      break;

    case 'line':
      config = {
        type: 'line',
        data: {
          labels: data.labels,
          datasets: (data.datasets || []).map(ds => ({
            label: ds.label || '',
            data: ds.values,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99,102,241,0.1)',
            fill: true,
            tension: 0.3,
          })),
        },
        options: {
          responsive: true,
          plugins: { legend: { display: (data.datasets || []).length > 1 } },
        },
      };
      break;

    case 'pie':
      config = {
        type: 'pie',
        data: {
          labels: data.labels,
          datasets: [{
            data: data.values,
            backgroundColor: ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'],
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom' } },
        },
      };
      break;

    default:
      wrapper.innerHTML += '<div class="canvas-error">⚠️ 不支持的图表类型</div>';
      return;
  }

  Promise.resolve().then(() => {
    try {
      new Chart(document.getElementById(canvasId), config);
    } catch (e) {
      // 异步渲染时 Chart.js 可能尚未加载
    }
  });
}
