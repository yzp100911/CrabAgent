/**
 * xCrab 工具定义与执行
 * 每个工具包含定义 (schema) 和执行函数 (handler)
 */

// --- 工具元数据（用于前端展示）---
export const TOOL_META = {
  get_time:       { category: '基础工具', icon: '🕐', color: '#4CAF50', alias: '获取时间' },
  calculate:      { category: '基础工具', icon: '🔢', color: '#4CAF50', alias: '数学计算' },
  weather:        { category: '基础工具', icon: '🌤️', color: '#4CAF50', alias: '天气查询' },
  web_search:     { category: '基础工具', icon: '🔍', color: '#2196F3', alias: '网络搜索' },
  web_fetch:      { category: '基础工具', icon: '🌐', color: '#2196F3', alias: '网页获取' },
  read_file:      { category: '文件操作', icon: '📄', color: '#FF9800', alias: '读取文件' },
  write_file:     { category: '文件操作', icon: '✏️', color: '#FF9800', alias: '写入文件' },
  append_file:    { category: '文件操作', icon: '📝', color: '#FF9800', alias: '追加文件' },
  list_files:     { category: '文件操作', icon: '📁', color: '#FF9800', alias: '列出文件' },
  run_command:    { category: '文件操作', icon: '💻', color: '#FF9800', alias: '运行命令' },
  remember:       { category: '记忆系统', icon: '🧠', color: '#9C27B0', alias: '记住信息' },
  recall:         { category: '记忆系统', icon: '🔮', color: '#9C27B0', alias: '回忆记忆' },
  forget:         { category: '记忆系统', icon: '🗑️', color: '#9C27B0', alias: '删除记忆' },
  read_skill:     { category: '技能管理', icon: '📖', color: '#E91E63', alias: '加载技能' },
  search_skills:  { category: '技能管理', icon: '🔎', color: '#E91E63', alias: '搜索技能' },
  install_skill:  { category: '技能管理', icon: '📦', color: '#E91E63', alias: '安装技能' },
  uninstall_skill: { category: '技能管理', icon: '📤', color: '#E91E63', alias: '卸载技能' },
  configure_skill: { category: '技能管理', icon: '⚙️', color: '#E91E63', alias: '配置技能' },
  create_plan:    { category: '高级功能', icon: '📋', color: '#607D8B', alias: '创建计划' },
  render_canvas:  { category: '高级功能', icon: '📊', color: '#607D8B', alias: '生成图表' },
  switch_workspace: { category: '高级功能', icon: '🔄', color: '#607D8B', alias: '切换角色' },
  list_workspaces: { category: '高级功能', icon: '📋', color: '#607D8B', alias: '列出角色' },

  // --- 浏览器自动化工具（推荐，比 Playwright 更简洁）---
  browse_open:       { category: '浏览器', icon: '🌐', color: '#4CAF50', alias: '打开网页' },
  browse_click:      { category: '浏览器', icon: '🖱️', color: '#4CAF50', alias: '点击' },
  browse_fill:       { category: '浏览器', icon: '✏️', color: '#4CAF50', alias: '填写' },
  browse_type:       { category: '浏览器', icon: '⌨️', color: '#4CAF50', alias: '键入' },
  browse_snapshot:   { category: '浏览器', icon: '📷', color: '#4CAF50', alias: '页面快照' },
  browse_text:       { category: '浏览器', icon: '📄', color: '#4CAF50', alias: '获取文本' },
  browse_shot:       { category: '浏览器', icon: '🖼️', color: '#4CAF50', alias: '截图' },
  browse_press:      { category: '浏览器', icon: '🔑', color: '#4CAF50', alias: '按键' },
  browse_close:      { category: '浏览器', icon: '❌', color: '#FF5722', alias: '关闭' },
  browse_eval:       { category: '浏览器', icon: '💻', color: '#4CAF50', alias: '执行JS' },
  browse_hover:      { category: '浏览器', icon: '🖐️', color: '#4CAF50', alias: '悬停' },
  browse_scroll:     { category: '浏览器', icon: '📜', color: '#4CAF50', alias: '滚动' },
  browse_select:     { category: '浏览器', icon: '📋', color: '#4CAF50', alias: '选择下拉' },
  browse_dblclick:   { category: '浏览器', icon: '🖱️', color: '#4CAF50', alias: '双击' },
  browse_focus:      { category: '浏览器', icon: '🎯', color: '#4CAF50', alias: '聚焦' },
  browse_drag:       { category: '浏览器', icon: '✋', color: '#4CAF50', alias: '拖拽' },
  browse_check:      { category: '浏览器', icon: '✅', color: '#4CAF50', alias: '勾选' },
  browse_uncheck:    { category: '浏览器', icon: '⬜', color: '#4CAF50', alias: '取消勾选' },
  browse_upload:     { category: '浏览器', icon: '📎', color: '#4CAF50', alias: '上传文件' },
  browse_scroll_into:{ category: '浏览器', icon: '👁️', color: '#4CAF50', alias: '滚动到元素' },
  browse_get:        { category: '浏览器', icon: 'ℹ️', color: '#4CAF50', alias: '获取页面信息' },
  browse_is:         { category: '浏览器', icon: '❓', color: '#4CAF50', alias: '检查元素状态' },
  browse_find:       { category: '浏览器', icon: '🔎', color: '#4CAF50', alias: '语义查找元素' },
  browse_extra:     { category: '浏览器', icon: '⚡', color: '#FF9800', alias: '高级操作' },
  browse_keyboard:   { category: '浏览器', icon: '⌨️', color: '#4CAF50', alias: '键盘输入' },
  browse_wait:       { category: '浏览器', icon: '⏳', color: '#4CAF50', alias: '等待' },
  browse_hold:       { category: '浏览器', icon: '🔒', color: '#4CAF50', alias: '按住/释放按键' },
  browse_tab:        { category: '浏览器', icon: '📑', color: '#4CAF50', alias: '标签页管理' },
  browse_dialog:     { category: '浏览器', icon: '💬', color: '#4CAF50', alias: '弹窗处理' },
  browse_nav:        { category: '浏览器', icon: '🔀', color: '#4CAF50', alias: '页面导航' },
  browse_highlight:  { category: '浏览器', icon: '🖍️', color: '#4CAF50', alias: '高亮元素' },
  browse_frame:      { category: '浏览器', icon: '🖼️', color: '#4CAF50', alias: '切换iframe' },
  browse_clipboard:  { category: '浏览器', icon: '📋', color: '#4CAF50', alias: '剪贴板' },
  // --- 自定义工具管理 ---
  create_tool:       { category: '工具管理', icon: '🛠️', color: '#E91E63', alias: '创建工具' },
  edit_tool:         { category: '工具管理', icon: '✏️', color: '#E91E63', alias: '编辑工具' },
  delete_tool:       { category: '工具管理', icon: '🗑️', color: '#E91E63', alias: '删除工具' },
  list_custom_tools: { category: '工具管理', icon: '📦', color: '#E91E63', alias: '列出自定义工具' },
};

// --- 工具定义（OpenAI 兼容格式）---
export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'get_time',
      description: '获取当前日期和时间',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: '时区，例如 Asia/Shanghai、America/New_York',
            default: 'Asia/Shanghai',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: '执行数学计算',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: '数学表达式，如 "1 + 2 * 3" 或 "sqrt(16)"',
          },
        },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'weather',
      description: '获取指定城市的当前天气（模拟数据）',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名称',
          },
        },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '搜索互联网获取最新信息',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_skill',
      description: '加载一个已安装技能的完整指令内容。当用户请求与某个技能描述匹配时调用此工具。',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '技能名称',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_skills',
      description: '从 ClawHub 技能市场搜索可安装的技能',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'install_skill',
      description: '从 ClawHub 安装一个技能',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '技能名称（slug）',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'uninstall_skill',
      description: '卸载一个已安装的技能',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '技能名称',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: '在服务器环境中执行任意 shell 命令（Linux bash / Windows cmd）。可用于：文件操作、系统管理、安装软件包（apt/yum/brew/npm）、运行脚本、调用 CLI 工具、处理进程等。注意：命令会阻塞直到完成，长时间运行的命令请设置合适的 timeout。',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '要执行的 shell 命令',
          },
          timeout: {
            type: 'number',
            description: '超时时间（毫秒），默认 1200000（20 分钟）',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description: '记住关于用户的信息（键值对），下次对话时会 recall。例如用户说"我叫张三"，就存储 key="user_name", value="张三"。系统会自动检测重复记忆并合并。',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: '信息的键名，如 user_name、user_city、preferred_language',
          },
          value: {
            type: 'string',
            description: '信息的 value',
          },
          category: {
            type: 'string',
            description: '分类：user_info（用户信息）、preference（偏好）、fact（事实）',
            enum: ['user_info', 'preference', 'fact', 'general'],
          },
          level: {
            type: 'string',
            description: '记忆层级：mid（中期，跨会话）、long（长期，重要且不可自动清理，上限50条）',
            enum: ['mid', 'long'],
          },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall',
      description: '搜索与关键词相关的历史记忆。当用户问"你还记得我...吗"或需要从记忆中查找信息时使用。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词，如用户的姓名、喜好、之前提到的话题等',
          },
          limit: {
            type: 'number',
            description: '返回结果数量上限，默认 10，最大 50',
            default: 10,
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'forget',
      description: '删除一条或多条记忆。当用户要求忘记某些信息、或你发现记忆过时/错误时使用。按 query 搜索删除时需先预览确认。',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: '要删除的记忆 key（精确匹配），与 query 二选一',
          },
          query: {
            type: 'string',
            description: '搜索关键词，将删除匹配到的所有记忆，与 key 二选一',
          },
          confirm: {
            type: 'boolean',
            description: '设为 true 确认执行删除。按 query 删除时必须先不带 confirm 调用以预览，再带 confirm=true 执行。',
            default: false,
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_plan',
      description: '将复杂任务自动拆解为多个子步骤并按序执行。当用户请求涉及多步操作（如查天气+算数、搜索+分析）时使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: '要完成的任务描述',
          },
        },
        required: ['task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'configure_skill',
      description: '查看或修改已安装技能的配置',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: '操作类型：get（查看配置）、set（修改配置）',
            enum: ['get', 'set'],
          },
          skill: {
            type: 'string',
            description: '技能名称',
          },
          key: {
            type: 'string',
            description: '配置键名（仅 set 时需要）',
          },
          value: {
            type: 'string',
            description: '配置值（仅 set 时需要）',
          },
        },
        required: ['action', 'skill'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'switch_workspace',
      description: '切换到指定的工作区（角色/人格），切换后你的身份和行为将随之改变。当用户要求你扮演不同角色时使用此工具',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '工作区名称，如 "main"（默认）或其他已创建的角色名称',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_workspaces',
      description: '列出所有可用的工作区（角色/人格）及其描述',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'render_canvas',
      description: '创建可视化图表。当用户要求生成图表、可视化数据、趋势图、统计图时使用。支持柱状图(bar)、折线图(line)、饼图(pie)、表格(table)',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: '图表类型：bar（柱状图）、line（折线图）、pie（饼图）、table（表格）',
            enum: ['bar', 'line', 'pie', 'table'],
          },
          title: {
            type: 'string',
            description: '图表标题',
          },
          data: {
            type: 'object',
            description: '图表数据。bar/line 格式: { labels: string[], datasets: [{ label: string, values: number[] }] }。pie 格式: { labels: string[], values: number[] }。table 格式: { headers: string[], rows: string[][] }',
          },
        },
        required: ['type', 'data'],
      },
    },
  },
  // --- 浏览器自动化工具（推荐）---
  {
    type: 'function',
    function: {
      name: 'browse_open',
      description: '【推荐】打开浏览器并导航到指定 URL。首次调用会启动浏览器，后续打开新页面。比 Playwright 的 browser_navigate 更简单直接。不传 URL 则打开空白页。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要打开的网址（可选，不传则打开空白页）' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_click',
      description: '【推荐】点击页面中的元素。支持 CSS 选择器（如 "#submit"）或无障碍引用（如 "@e3"）。比 Playwright 的 browser_click 更简洁。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器或无障碍引用（如 "#submit"、".btn"、"@e3"）' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_fill',
      description: '【推荐】清空输入框并填入指定文本。支持 CSS 选择器或无障碍引用。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器或无障碍引用' },
          text: { type: 'string', description: '要填入的文本' },
        },
        required: ['selector', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_type',
      description: '【推荐】在输入框中键入文本（不清空已有内容，模拟真实打字）。支持 CSS 选择器或无障碍引用。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器或无障碍引用' },
          text: { type: 'string', description: '要键入的文本' },
        },
        required: ['selector', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_snapshot',
      description: '【推荐】获取当前页面的无障碍访问树快照（Accessibility Tree）。返回带引用编号（@e1, @e2...）的结构化页面内容，比 Playwright 的 browser_snapshot 更适合 AI 理解页面。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_text',
      description: '【推荐】获取页面中指定元素的文本内容。支持 CSS 选择器或无障碍引用。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器或无障碍引用' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_shot',
      description: '【推荐】截取当前页面的屏幕截图。保存为 JPEG 图片，返回文件路径。full=true 可截取全页面（含滚动区域）。',
      parameters: {
        type: 'object',
        properties: {
          full: { type: 'boolean', description: '是否截取全页面（含滚动区域），默认 false' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_press',
      description: '【推荐】在页面上按下指定键盘按键。支持 Enter、Tab、Escape、ArrowDown、ArrowUp、Control+a 等。',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '按键名称，如 "Enter"、"Tab"、"Escape"、"ArrowDown"、"Control+a"' },
        },
        required: ['key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_close',
      description: '【推荐】关闭当前活动的浏览器会话，释放资源。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_eval',
      description: '【推荐】在当前页面中执行 JavaScript 代码，返回执行结果。适合获取动态内容或操作 DOM。',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '要执行的 JavaScript 代码' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_hover',
      description: '【推荐】将鼠标悬停在指定元素上。适合触发下拉菜单、tooltip、弹出框等。支持 CSS 选择器或无障碍引用。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器或无障碍引用（如 "#menu"、"@e5"）' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_scroll',
      description: '【推荐】滚动页面。可指定方向和像素数，也可滚动到指定元素（用 --selector）。',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', description: '滚动方向：up、down、left、right', enum: ['up', 'down', 'left', 'right'] },
          pixels: { type: 'number', description: '滚动像素数（可选，默认 300）' },
          selector: { type: 'string', description: '滚动到此元素可见（可选，CSS 选择器）' },
        },
        required: ['direction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_select',
      description: '【推荐】选择下拉框（<select>）中的选项。支持 CSS 选择器或无障碍引用。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器或无障碍引用' },
          value: { type: 'string', description: '要选择的选项文本或值' },
        },
        required: ['selector', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_dblclick',
      description: '【推荐】双击页面中的元素。支持 CSS 选择器或无障碍引用。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器或无障碍引用' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_focus',
      description: '【推荐】让指定元素获得焦点。支持 CSS 选择器或无障碍引用。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器或无障碍引用' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_drag',
      description: '【推荐】将源元素拖拽到目标元素位置。支持 CSS 选择器或无障碍引用。',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string', description: '源元素选择器' },
          target: { type: 'string', description: '目标元素选择器' },
        },
        required: ['source', 'target'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_check',
      description: '【推荐】勾选复选框（checkbox）。如果已勾选则无变化。支持 CSS 选择器或无障碍引用。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器或无障碍引用' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_uncheck',
      description: '【推荐】取消勾选复选框（checkbox）。如果未勾选则无变化。支持 CSS 选择器或无障碍引用。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器或无障碍引用' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_upload',
      description: '【推荐】上传文件到文件选择输入框。支持 CSS 选择器或无障碍引用。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: '文件输入框的 CSS 选择器，如 "#file-upload"' },
          files: { type: 'string', description: '文件路径，多个文件用逗号分隔' },
        },
        required: ['selector', 'files'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_scroll_into',
      description: '【推荐】将指定元素滚动到可视区域。与 scroll 不同，此工具只确保元素可见，不关心滚动距离。支持 CSS 选择器或无障碍引用。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器或无障碍引用' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_get',
      description: '【推荐】获取页面或元素的各类信息。可获取：url（当前网址）、title（页面标题）、html（元素HTML）、value（输入框值）、attr（属性值）、count（匹配数）、box（位置大小）、styles（样式）。',
      parameters: {
        type: 'object',
        properties: {
          what: { type: 'string', description: '要获取的信息类型', enum: ['url', 'title', 'html', 'value', 'attr', 'count', 'box', 'styles', 'cdp-url'] },
          selector: { type: 'string', description: 'CSS 选择器或无障碍引用（url/title 不需要）' },
          attr: { type: 'string', description: '属性名（仅 what=attr 时需要）' },
        },
        required: ['what'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_is',
      description: '【推荐】检查元素的当前状态。可检查：visible（是否可见）、enabled（是否可用）、checked（是否已勾选）。',
      parameters: {
        type: 'object',
        properties: {
          state: { type: 'string', description: '要检查的状态', enum: ['visible', 'enabled', 'checked'] },
          selector: { type: 'string', description: 'CSS 选择器或无障碍引用' },
        },
        required: ['state', 'selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_find',
      description: '【推荐】通过文本内容、ARIA 角色、标签等语义方式查找元素并执行操作。比 CSS 选择器更适合 AI 使用。method 可选：text（文本内容）、role（ARIA 角色）、label（标签）、placeholder（占位符）、alt（替代文本）、first（第一个）、last（最后一个）。action 可选：click、fill、hover、focus、check、uncheck、text。',
      parameters: {
        type: 'object',
        properties: {
          method: { type: 'string', description: '查找方式', enum: ['text', 'role', 'label', 'placeholder', 'alt', 'title', 'testid', 'first', 'last', 'nth'] },
          value: { type: 'string', description: '查找的值（如按钮文字"提交"、角色名"button"等）' },
          action: { type: 'string', description: '找到后执行的操作', enum: ['click', 'fill', 'hover', 'focus', 'check', 'uncheck', 'text'] },
          action_value: { type: 'string', description: '操作参数（仅 fill 时需要填入的文本）' },
          name: { type: 'string', description: '按 role 查找时，通过 accessible name 过滤（可选）' },
        },
        required: ['method', 'value', 'action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_extra',
      description: '[补充] 其他 browse_* 工具未覆盖的高级浏览器操作。包括：cookies管理、viewport/设备模拟、鼠标控制、新窗口、storage、控制台等。具体参数含义见 action 描述。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'cookies_get=获取所有cookie / cookies_set=设置cookie(需value1=name,value2=val) / cookies_clear=清除 / viewport=设置视口(需value1=宽,value2=高) / device=模拟设备(value1=名称如iPhone 14) / geo=设置地理位置(value1=纬度,value2=经度) / headers=设置自定义头(value1=JSON) / offline=离线模式(value1=on/off) / credentials=HTTP基本认证(value1=用户名,value2=密码) / media=模拟配色(value1=dark/light) / mouse_move=鼠标移动到(value1=x,value2=y) / mouse_click=鼠标点击(value1=左/右/中) / mouse_down=按下鼠标(value1=左/右) / mouse_up=抬起鼠标(value1=左/右) / mouse_wheel=滚动鼠标(value1=dy) / window_new=新窗口 / pushstate=单页面导航(value1=url) / inspect=打开开发者工具 / state_save=保存状态(value1=路径) / state_load=加载状态(value1=路径) / state_list=列出保存的状态 / console=查看控制台(value1=view/清除clear) / errors=查看错误(value1=view/clear) / storage_local=读取本地存储(value1=键名,空=全部) / storage_local_set=设置本地存储(value1=键,value2=值) / storage_local_clear=清除本地存储 / storage_session=读取会话存储(value1=键名,空=全部) / pdf=保存为PDF(value1=路径)',
            enum: [
              'cookies_get', 'cookies_set', 'cookies_clear',
              'viewport', 'device', 'geo', 'headers', 'offline',
              'mouse_move', 'mouse_click', 'mouse_down', 'mouse_up', 'mouse_wheel',
              'window_new', 'pushstate', 'inspect',
              'state_save', 'state_load', 'state_list',
              'console', 'errors', 'storage_local', 'storage_local_set', 'storage_local_clear', 'storage_session', 'pdf', 'credentials', 'media',
            ],
          },
          value1: { type: 'string', description: '参数1' },
          value2: { type: 'string', description: '参数2' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_keyboard',
      description: '【推荐】无需选择器，直接在当前聚焦位置进行键盘输入。mode=type 用真实按键模拟键入，mode=insert 直接插入文本（无按键事件）。适合登录框、弹窗等场景。',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', description: '输入模式', enum: ['type', 'insert'] },
          text: { type: 'string', description: '要输入的文本' },
        },
        required: ['mode', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_wait',
      description: '【推荐】等待页面加载或元素出现。常用于页面跳转后等待加载完成。timeout 指定最长等待秒数（默认 10）。支持按选择器等待、按文本等待（--text）或等待加载状态（--load=networkidle）。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: '等待此选择器的元素出现（可选）' },
          text: { type: 'string', description: '等待此文本出现在页面中（可选，如 "欢迎"）' },
          load: { type: 'string', description: '等待加载状态（可选），networkidle=等待网络空闲', enum: ['networkidle'] },
          timeout: { type: 'number', description: '超时秒数，默认 10' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_hold',
      description: '【推荐】按住或释放键盘按键。action=down 按住不松（适合组合键如 Ctrl），action=up 释放。与 browse_press 不同，press 是按下即松。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'down=按住, up=释放', enum: ['down', 'up'] },
          key: { type: 'string', description: '按键名称，如 "Control"、"Shift"、"Alt"' },
        },
        required: ['action', 'key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_tab',
      description: '【推荐】标签页管理。action=list 列出所有标签页；action=switch 切换到指定标签页（id 如 "t1"）；action=close 关闭标签页；action=new 打开新标签页并可选跳转到 URL。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: '操作类型', enum: ['list', 'switch', 'close', 'new'] },
          id: { type: 'string', description: '标签页 ID，如 "t1"、"t2"（switch/close 时需要）' },
          url: { type: 'string', description: '新标签页的网址（action=new 时可选）' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_dialog',
      description: '【推荐】处理浏览器弹窗（alert/confirm/prompt）。action=status 检查是否有弹窗；action=accept 接受弹窗（可选输入文本用于 prompt）；action=dismiss 取消弹窗。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'status=检查弹窗, accept=接受, dismiss=取消', enum: ['status', 'accept', 'dismiss'] },
          text: { type: 'string', description: 'prompt 弹窗的输入文本（仅 action=accept 时可选）' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_nav',
      description: '【推荐】浏览器页面导航。back=后退到上一页，forward=前进到下一页，reload=刷新当前页面。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: '导航操作', enum: ['back', 'forward', 'reload'] },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_highlight',
      description: '【推荐】在页面上高亮显示指定元素。用红色边框标记，方便确认要操作的目标。支持 CSS 选择器或无障碍引用。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器或无障碍引用' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_frame',
      description: '【推荐】切换到页面中的 iframe（嵌入式页面）。selector 指定 iframe 元素，"main" 则回到主页面。适用于处理嵌入表单、支付页面等。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'iframe 的 CSS 选择器，或 "main" 回到主页面' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_clipboard',
      description: '【推荐】操作剪贴板。read=读取文本，write=写入文本，copy=复制当前选中，paste=粘贴到当前焦点。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: '操作类型', enum: ['read', 'write', 'copy', 'paste'] },
          text: { type: 'string', description: '要写入的文本（仅 write 时需要）' },
        },
        required: ['action'],
      },
    },
  },
    // --- 自定义工具管理 ---
  {
    type: 'function',
    function: {
      name: 'create_tool',
      description: '创建自定义工具。\n- 能力：文件读写 import("node:fs")、网络请求 fetch()、执行外部命令 import("child_process")、动态加载 npm 模块 import("模块名")、浏览器自动化、process 全局变量等。\n- handler 代码运行在 async IIFE 中，内部可直接使用 await、import()、fetch()、process、console 等全局 API。\n- 参数通过 args 对象传入（如 args.city），返回值用 return 返回。\n- 工具保存在 custom-tools.json 重启后仍可用。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '工具名称，需英文（如 send_report），不能与已有工具重名' },
          description: { type: 'string', description: '工具描述，告诉 AI 何时使用此工具' },
          parameters: { type: 'string', description: '参数 JSON Schema 字符串，如 {"type":"object","properties":{"city":{"type":"string"}}}' },
          handler: { type: 'string', description: '执行代码（JavaScript）。args 为传入参数，可用 await fetch()、import()，用 return 返回结果。' },
        },
        required: ['name', 'description', 'parameters', 'handler'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_tool',
      description: '编辑已存在的自定义工具。可修改工具的名称、描述、参数 Schema 或执行代码。只修改提供的字段。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '要编辑的工具名称' },
          new_name: { type: 'string', description: '新名称（可选）' },
          description: { type: 'string', description: '新描述（可选）' },
          parameters: { type: 'string', description: '新参数 JSON Schema 字符串（可选）' },
          handler: { type: 'string', description: '新执行代码（可选）' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_tool',
      description: '删除一个自定义工具，从系统中移除并删除文件记录。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '要删除的工具名称' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_custom_tools',
      description: '列出所有自定义工具。支持按关键词搜索过滤，传入 query 参数可模糊匹配工具名称和描述。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词（可选），模糊匹配工具名称和描述' },
        },
      },
    },
  },
// --- 文件操作工具 ---
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取指定文件的内容。支持文本文件和指定编码的文件。自动限制最大读取大小防止内存溢出。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，可以是绝对路径或相对于工作区的相对路径' },
          encoding: { type: 'string', description: '文件编码，默认 utf-8', default: 'utf-8' },
          maxBytes: { type: 'number', description: '最大读取字节数，默认 65536 (64KB)，超过部分截断', default: 65536 },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '将内容写入指定文件。如果文件不存在则自动创建（包括中间目录），已存在则覆盖。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，可以是绝对路径或相对于工作区的相对路径' },
          content: { type: 'string', description: '要写入的文件内容' },
          encoding: { type: 'string', description: '文件编码，默认 utf-8', default: 'utf-8' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'append_file',
      description: '将内容追加到指定文件末尾。如果文件不存在则创建。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '要追加的内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: '列出指定目录下的文件和子目录信息（名称、大小、修改时间、类型）。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径，默认当前工作目录', default: '.' },
          recursive: { type: 'boolean', description: '是否递归列出所有子目录内容', default: false },
        },
        required: [],
      },
    },
  },
  // --- 网络工具 ---
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: '获取任意 URL 的内容（HTML/JSON/纯文本/图片二进制等），用于访问网页 API、下载文件、抓取页面数据。支持自定义请求头、POST 请求和超时设置。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要获取的完整 URL（必须以 http:// 或 https:// 开头）' },
          method: { type: 'string', description: 'HTTP 方法', enum: ['GET', 'POST', 'PUT', 'DELETE'], default: 'GET' },
          headers: { type: 'object', description: '自定义请求头（可选），如 { "Authorization": "Bearer xxx" }' },
          body: { type: 'string', description: '请求体内容（POST/PUT 时需要），如 JSON 字符串或表单数据' },
          timeout: { type: 'number', description: '超时时间（毫秒），默认 60000（60 秒）', default: 60000 },
          responseType: { type: 'string', description: '响应类型：text（文本）、json（自动解析 JSON）、base64（二进制），默认 text', enum: ['text', 'json', 'base64'], default: 'text' },
        },
        required: ['url'],
      },
    },
  },
];

// --- 工具执行 ---

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 请求级上下文存储
 * 每个 HTTP 请求有独立的 userId，避免多用户并发污染
 */
const _requestContext = new AsyncLocalStorage();

/**
 * 在请求级上下文中执行函数
 * @param {object|string|null} ctx - 上下文对象，或 userId 字符串（向后兼容）
 * @param {Function} fn
 * @returns {Promise<any>}
 */
export async function runWithContext(ctx, fn) {
  if (typeof ctx === 'string' || ctx === null) {
    ctx = { userId: ctx };
  }
  return _requestContext.run(ctx, fn);
}

/**
 * 获取当前请求上下文的某个字段
 * @param {string} key
 * @returns {any}
 */
function getContext(key) {
  const store = _requestContext.getStore();
  return store ? store[key] : undefined;
}

/**
 * 设置当前请求上下文的一个字段
 * @param {string} key
 * @param {any} value
 */
export function setContext(key, value) {
  const store = _requestContext.getStore();
  if (store) {
    store[key] = value;
  }
}

/**
 * 获取当前请求的 userId
 * @returns {string|null}
 */
function getContextUserId() {
  return getContext('userId');
}

/** @type {import('./skill-manager.js').SkillManager} */
let _skillManager = null;

/** @type {import('./memory/store.js').MemoryStore} */
let _memoryStore = null;

/** @type {import('./mcp/client.js').MCPManager} */
let _mcpManager = null;

/** @type {import('./workspace/manager.js').WorkspaceManager} */
let _workspaceManager = null;

/** @type {Function|null} */
let _onToolProgress = null;

/** @type {import('./stats/quota-tracker.js').QuotaTracker|null} */
let _quotaTracker = null;

/**
 * 待用户确认的超时请求
 * Map<confirmId, { toolName, extend, cancel, timer }>
 */
const _pendingConfirmations = new Map();

/**
 * 延长工具的等待时间（用户确认继续）
 * @param {string} confirmId
 * @returns {boolean} 是否成功延长
 */
export function extendToolTimeout(confirmId) {
  const pc = _pendingConfirmations.get(confirmId);
  if (!pc) return false;
  clearTimeout(pc.timer);
  pc.extend();
  _pendingConfirmations.delete(confirmId);
  return true;
}

/**
 * 终止超时的工具（用户选择取消）
 * @param {string} confirmId
 * @returns {boolean} 是否成功取消
 */
export function cancelToolTimeout(confirmId) {
  const pc = _pendingConfirmations.get(confirmId);
  if (!pc) return false;
  clearTimeout(pc.timer);
  pc.cancel();
  _pendingConfirmations.delete(confirmId);
  return true;
}

/**
 * 设置 QuotaTracker 实例，用于 MiniMax 工具配额监控
 * @param {import('./stats/quota-tracker.js').QuotaTracker|null} qt
 */
export function setQuotaTracker(qt) {
  _quotaTracker = qt;
}


/**
 * 设置工具进度回调，工具执行 start/end/error 时会触发
 * @param {Function|null} cb - (toolName, { type, args, result, duration, error }) => void
 */
export function setToolProgressCallback(cb) {
  _onToolProgress = cb;
}

/**
 * 设置 SkillManager 实例，供工具使用
 */
export function setSkillManager(sm) {
  _skillManager = sm;
}

/**
 * 设置 MemoryStore 实例，供工具使用
 */
export function setMemoryStore(ms) {
  _memoryStore = ms;
}

/**
 * 设置 MCPManager 实例，供工具路由使用
 */
export function setMCPManager(mm) {
  _mcpManager = mm;
}

/**
 * 设置 WorkspaceManager 实例，供工具使用
 */
export function setWorkspaceManager(wm) {
  _workspaceManager = wm;
}

/**
 * 设置当前请求的用户标识（Gateway 层每次请求前调用）
 * 记忆工具（remember/recall/forget）会自动使用此 userId
 * @param {string|null} userId
 * @deprecated 请使用 runWithContext(userId, fn) 包裹请求处理
 */
export function setCurrentUserId(userId) {
  const store = _requestContext.getStore();
  if (store) {
    store.userId = userId;
  }
}

/**
 * 获取当前请求的用户标识
 * @returns {string|null}
 */
export function getCurrentUserId() {
  return getContextUserId();
}

/**
 * 将 MCP 工具合并到 toolDefinitions 中
 * @param {Array} mcpTools - MCP 服务器返回的工具列表（已格式化）
 */
export function addMcpTools(mcpTools) {
  if (!mcpTools || mcpTools.length === 0) return;
  // 移除已有的旧 MCP 工具定义（兼容新旧分隔符）
  const existing = toolDefinitions.filter(t => !t.function.name.startsWith('mcp__') && !t.function.name.startsWith('mcp||'));
  toolDefinitions.length = 0;
  toolDefinitions.push(...existing, ...mcpTools);
}

async function getTime(args) {
  const tz = args.timezone || 'Asia/Shanghai';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `当前时间 (${tz}): ${formatter.format(now)}`;
}

function calculate(args) {
  const expr = args.expression;
  try {
    const sanitized = expr.replace(/[^0-9+\-*/.()%\s,]/g, '');
    const fn = new Function(`return (${sanitized})`);
    const result = fn();
    return `${expr} = ${result}`;
  } catch {
    return `无法计算: ${expr}`;
  }
}

async function weather(args) {
  const city = args.city;
  const conditions = ['晴朗', '多云', '阴天', '小雨', '微风'];
  const cond = conditions[Math.floor(Math.random() * conditions.length)];
  const temp = Math.round(10 + Math.random() * 25);
  return `${city} 天气：${cond}，${temp}°C，湿度 ${Math.round(40 + Math.random() * 40)}%`;
}

async function webSearch(args) {
  const query = args.query;
  try {
    const resp = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
    );
    const data = await resp.json();
    const results = data.AbstractText || data.RelatedTopics?.slice(0, 3).map(t =>
      t.Text || t.Result
    ).filter(Boolean).join('\n') || '未找到相关结果。';
    return results;
  } catch {
    return `搜索 "${query}" 时出现网络错误。`;
  }
}

function readSkill(args) {
  if (!_skillManager) return '错误：SkillManager 未初始化';
  const content = _skillManager.getSkillContent(args.name);
  if (!content) {
    return `技能 "${args.name}" 未找到。已安装技能: ${_skillManager.getSummaryList().map(s => s.name).join(', ')}`;
  }
  return `技能 "${args.name}" 指令:\n\n${content}`;
}

async function searchSkillsClawHub(args) {
  const { searchSkills } = await import('./clawhub.js');
  try {
    const results = await searchSkills(args.query);
    if (!results || results.length === 0) return '未找到相关技能。';
    return results.slice(0, 10).map((s, i) =>
      `${i + 1}. ${s.name || s.slug} — ${s.description || '无描述'} (⬇️ ${s.downloads || 0})`
    ).join('\n');
  } catch (err) {
    return `搜索技能失败: ${err.message}`;
  }
}

async function installSkill(args) {
  const { installSkill: doInstall } = await import('./clawhub.js');
  try {
    const result = await doInstall(args.name);
    if (_skillManager) {
      _skillManager.loadAll();
    }
    return `技能 "${result.name}" 已安装到: ${result.dir}`;
  } catch (err) {
    return `安装技能失败: ${err.message}`;
  }
}

function uninstallSkill(args) {
  if (!_skillManager) return '错误：SkillManager 未初始化';
  try {
    const result = _skillManager.uninstall(args.name);
    if (result.includes('未找到')) {
      return `卸载失败：技能 "${args.name}" 未找到`;
    }
    _skillManager.loadAll();
    return `✅ 技能 "${args.name}" 已卸载`;
  } catch (err) {
    return `卸载技能失败: ${err.message}`;
  }
}

async function remember(args) {
  if (!_memoryStore) return '记忆系统未启用（ENABLE_MEMORY=false）';
  if (!getCurrentUserId()) return '未登录，无法保存记忆。';

  // 缺陷10：输入校验
  const key = (args.key || '').trim();
  const value = (args.value || '').trim();
  if (!key) return '错误: key 不能为空';
  if (!value) return '错误: value 不能为空';
  if (key.length > 200) return '错误: key 长度不能超过 200 字符';
  if (value.length > 10000) return '错误: value 长度不能超过 10000 字符';

  // 缺陷8：自动判断层级 — 未指定 level 时根据内容特征推断
  let level = args.level;
  if (!level) {
    level = _inferMemoryLevel(key, value, args.category);
  }

  const result = await _memoryStore.save(key, value, args.category || 'general', level, getCurrentUserId());
  if (!result.ok) return `保存失败: ${result.reason}`;
  if (result.merged) return `已记住（自动合并到已有记忆 "${result.mergedInto}"）: ${value}`;
  const levelLabel = level === 'long' ? '（长期记忆）' : level === 'short' ? '（短期记忆）' : '';
  return `已记住${levelLabel}: ${key} = ${value}`;
}

/**
 * 缺陷8：根据内容特征自动推断记忆层级
 * - short: 临时性、单次任务、当前上下文相关
 * - long: 用户身份、持久偏好、重要事实
 * - mid: 默认，跨会话但可衰减
 */
function _inferMemoryLevel(key, value, category) {
  const text = `${key} ${value}`.toLowerCase();

  // 长期记忆特征：用户身份信息、持久偏好
  const longPatterns = [
    /user_?name/i, /user_?real/i, /real_?name/i, /nickname/i,
    /birthday/i, /birth_?date/i, /age/i, /gender/i,
    /city/i, /address/i, /phone/i, /email/i,
    /preference/i, /favorite/i, /prefer/i,
    /language/i, /timezone/i,
  ];
  if (longPatterns.some(p => p.test(key))) return 'long';
  if (category === 'user_info' || category === 'preference') return 'long';

  // 短期记忆特征：临时性、任务相关
  const shortPatterns = [
    /临时/i, /暂时/i, /本次/i, /当前/i, /这次/i,
    /temp/i, /tmp/i, /current/i, /this_?session/i,
    /debug/i, /测试/i, /test/i,
  ];
  if (shortPatterns.some(p => p.test(text))) return 'short';

  return 'mid';
}

async function recall(args) {
  if (!_memoryStore) return '记忆系统未启用（ENABLE_MEMORY=false）';
  if (!getCurrentUserId()) return '未登录，无法搜索记忆。';
  const limit = Math.min(Math.max(args.limit || 10, 1), 50);
  const results = await _memoryStore.search(args.query, { limit, userId: getCurrentUserId() });
  if (results.length === 0) return '未找到相关记忆。';
  return results.map((r, i) =>
    `${i + 1}. ${r.key}: ${r.value} (${r.category || 'general'})`
  ).join('\n');
}

async function forget(args) {
  if (!_memoryStore) return '记忆系统未启用（ENABLE_MEMORY=false）';
  if (!getCurrentUserId()) return '未登录，无法删除记忆。';

  if (args.key) {
    if (!_memoryStore.exists(args.key, getCurrentUserId())) return `未找到 key 为 "${args.key}" 的记忆。`;
    _memoryStore.remove(args.key);
    return `已删除记忆: ${args.key}`;
  }

  if (args.query) {
    const results = await _memoryStore.search(args.query, { limit: 20, userId: getCurrentUserId() });
    if (results.length === 0) return `未找到与 "${args.query}" 相关的记忆。`;

    // 缺陷4：搜索删除需先预览确认
    if (!args.confirm) {
      const preview = results.slice(0, 10).map((r, i) =>
        `  ${i + 1}. [${r.key}] ${r.value.slice(0, 50)}${r.value.length > 50 ? '...' : ''}`
      ).join('\n');
      const suffix = results.length > 10 ? `\n  ... 还有 ${results.length - 10} 条` : '';
      return `找到 ${results.length} 条匹配记忆，请确认是否删除：\n${preview}${suffix}\n\n如需删除，请再次调用 forget(query="${args.query}", confirm=true)`;
    }

    const toDelete = results.slice(0, 10);
    const deleted = [];
    for (const r of toDelete) {
      _memoryStore.remove(r.key);
      deleted.push(r.key);
    }
    const suffix = results.length > 10 ? `（仅删除前 10 条，共匹配 ${results.length} 条）` : '';
    return `已删除 ${deleted.length} 条记忆: ${deleted.join(', ')}${suffix}`;
  }

  return '请提供 key 或 query 参数来指定要删除的记忆。';
}

/** 危险命令黑名单（阻止潜在的破坏性操作） */
const COMMAND_BLOCKLIST = [
  /^\s*rm\s+-rf?\s+\/\s*/i,           // rm -rf /
  /^\s*mv\s+\/\s+/i,                    // mv / ...
  /^\s*>(\s+\/dev\/(sda|sdb|sdc|nvme))/i, // dd to raw disk
  /^\s*dd\s+if=\/dev\/zero/i,           // dd if=/dev/zero
  /^\s*:\(\)\s*\{[^}]*\};\s*:/i,        // fork bomb
  /^\s*chmod\s+-R?\s*0{4}\s+\//i,      // chmod 000 /
  /^\s*sudo\s+rm\s+-rf?\s+\//i,        // sudo rm -rf /
  /^\s*wget\s+.+--output-document\s+\/dev\//i, // writing to /dev via wget
];

async function runCommand(args) {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  const cmd = (args.command || '').trim();
  const timeout = args.timeout || 1200000;

  // 安全检查：阻止危险命令
  for (const pattern of COMMAND_BLOCKLIST) {
    if (pattern.test(cmd)) {
      return `安全限制：该命令已被阻止执行（匹配危险模式）`;
    }
  }

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      timeout,
      maxBuffer: 1024 * 1024, // 1MB
      windowsHide: true,
    });
    const maxOutput = 5000;
    let result = stdout ? `输出:\n${stdout.slice(0, maxOutput)}` : '';
    if (stdout.length > maxOutput) {
      result += `\n\n... [输出过长，仅显示前 ${maxOutput} 字符，共 ${stdout.length} 字符]`;
    }
    if (stderr) result += `\n错误输出:\n${stderr.slice(0, maxOutput)}`;
    return result || '命令执行完成（无输出）';
  } catch (err) {
    // 保留完整错误信息（含 Python traceback），优先取 stderr
    const detail = err.stderr || err.message || String(err);
    throw new Error(`命令执行失败 (${err.code || err.signal}): ${detail.slice(0, 2000)}`);
  }
}

async function createPlan(args) {
  const { Planner } = await import('./planner.js');
  const { callLLM } = await import('./llm.js');

  // 排除 create_plan 自身，防止递归
  const toolNames = toolDefinitions
    .map(t => t.function.name)
    .filter(n => n !== 'create_plan');
  const planner = new Planner(callLLM);

  return planner.run(args.task, toolNames, executeTool);
}

function configureSkill(args) {
  if (!_skillManager) return '错误：SkillManager 未初始化';
  if (args.action === 'get') {
    const config = _skillManager.getConfig(args.skill);
    if (config === null) return `技能 "${args.skill}" 未找到`;
    return `技能 "${args.skill}" 配置:\n${
      Object.entries(config).map(([k, v]) => `  ${k}: ${v}`).join('\n')
    }`;
  } else if (args.action === 'set') {
    if (!args.key || args.value === undefined) return '请提供 key 和 value';
    return _skillManager.setConfig(args.skill, args.key, args.value);
  }
  return '未知操作，请使用 get 或 set';
}

async function renderCanvas(args) {
  const { type, title, data } = args;
  const { saveCanvas, getCanvasRef } = await import('./canvas/renderer.js');
  const { renderChart } = await import('./canvas/chart-cli.js');

  const result = saveCanvas(type, data, title);
  if (result.error) return `创建图表失败: ${result.error}`;

  const canvas = { id: result.id, type, title: title || '', data };
  const chartText = renderChart(canvas);
  const ref = getCanvasRef(result.id);

  return `📊 图表已创建\n${chartText}\n${ref}`;
}

function switchWorkspace(args) {
  if (!_workspaceManager) return '错误：Workspace 系统未初始化';
  const result = _workspaceManager.switchWorkspace(args.name);
  if (result.success) {
    return `✅ 已切换到工作区 "${args.name}"。请重新发送消息以应用新的人格设定。`;
  }
  return `❌ ${result.error}`;
}

function listWorkspaces() {
  if (!_workspaceManager) return '错误：Workspace 系统未初始化';
  const list = _workspaceManager.listWorkspaces();
  if (list.length === 0) return '暂无可用工作区';
  const active = _workspaceManager.activeName;
  return list.map(ws =>
    `${ws.name === active ? '▶ ' : '  '}${ws.name} — ${ws.desc} (${ws.fileCount} 文件)${ws.name === active ? ' [当前]' : ''}`
  ).join('\n');
}

// --- 文件操作工具实现 ---

async function readFile(args) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const targetPath = path.default.resolve(args.path);
  const maxBytes = args.maxBytes || 65536;

  try {
    const stat = fs.default.statSync(targetPath);
    if (!stat.isFile()) return `错误: "${args.path}" 不是一个文件`;
    if (stat.size > maxBytes * 2) {
      const fd = fs.default.openSync(targetPath, 'r');
      const buffer = Buffer.alloc(maxBytes);
      fs.default.readSync(fd, buffer, 0, maxBytes, 0);
      fs.default.closeSync(fd);
      const content = buffer.toString(args.encoding || 'utf-8');
      return `${content}\n\n... [文件总大小 ${formatSize(stat.size)}，仅显示前 ${formatSize(maxBytes)}]`;
    }
    const content = fs.default.readFileSync(targetPath, args.encoding || 'utf-8');
    return content || '(空文件)';
  } catch (err) {
    if (err.code === 'ENOENT') return `错误: 文件 "${args.path}" 不存在`;
    if (err.code === 'EACCES') return `错误: 没有权限读取 "${args.path}"`;
    return `读取文件失败: ${err.message}`;
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function writeFile(args) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const targetPath = path.default.resolve(args.path);

  try {
    // 确保父目录存在
    const dir = path.default.dirname(targetPath);
    if (!fs.default.existsSync(dir)) {
      fs.default.mkdirSync(dir, { recursive: true });
    }
    fs.default.writeFileSync(targetPath, args.content, args.encoding || 'utf-8');
    return `✅ 文件已写入: ${args.path} (${formatSize(Buffer.byteLength(args.content, args.encoding || 'utf-8'))})`;
  } catch (err) {
    if (err.code === 'EACCES') return `错误: 没有权限写入 "${args.path}"`;
    if (err.code === 'ENOSPC') return '错误: 磁盘空间不足';
    return `写入文件失败: ${err.message}`;
  }
}

async function appendFile(args) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const targetPath = path.default.resolve(args.path);

  try {
    const dir = path.default.dirname(targetPath);
    if (!fs.default.existsSync(dir)) {
      fs.default.mkdirSync(dir, { recursive: true });
    }
    fs.default.appendFileSync(targetPath, args.content, 'utf-8');
    return `✅ 内容已追加到: ${args.path}`;
  } catch (err) {
    return `追加文件失败: ${err.message}`;
  }
}

async function listFiles(args) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const targetPath = path.default.resolve(args.path || '.');

  try {
    if (!fs.default.existsSync(targetPath)) return `错误: 目录 "${args.path || '.'}" 不存在`;
    const stat = fs.default.statSync(targetPath);
    if (!stat.isDirectory()) {
      return `"${args.path || '.'}" 是一个文件\n  大小: ${formatSize(stat.size)}\n  修改时间: ${stat.mtime.toLocaleString('zh-CN')}`;
    }

    const entries = fs.default.readdirSync(targetPath, { withFileTypes: true });
    if (entries.length === 0) return '(空目录)';

    let result = `📁 ${args.path || '.'} (${entries.length} 项):\n`;
    for (const entry of entries) {
      const fullPath = path.default.join(targetPath, entry.name);
      try {
        const st = fs.default.statSync(fullPath);
        const sizeStr = entry.isDirectory() ? '' : ` ${formatSize(st.size)}`;
        const timeStr = st.mtime.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        result += `  ${entry.isDirectory() ? '📁' : '📄'} ${entry.name}${sizeStr} (${timeStr})\n`;
      } catch {
        result += `  ${entry.isDirectory() ? '📁' : '📄'} ${entry.name}\n`;
      }
    }

    if (args.recursive) {
      result += '\n--- 递归子目录 ---\n';
      function walkDir(dirPath, indent) {
        let subEntries = [];
        try {
          subEntries = fs.default.readdirSync(dirPath, { withFileTypes: true });
        } catch { return ''; }
        let out = '';
        for (const e of subEntries) {
          if (e.name.startsWith('.') || e.name === 'node_modules') continue;
          const fp = path.default.join(dirPath, e.name);
          try {
            const st = fs.default.statSync(fp);
            out += `${indent}${e.isDirectory() ? '📁' : '📄'} ${e.name}${e.isDirectory() ? '/' : ` ${formatSize(st.size)}`}\n`;
            if (e.isDirectory()) out += walkDir(fp, indent + '  ');
          } catch {}
        }
        return out;
      }
      result += walkDir(targetPath, '');
    }

    return result;
  } catch (err) {
    if (err.code === 'EACCES') return `错误: 没有权限访问 "${args.path || '.'}"`;
    return `列出目录失败: ${err.message}`;
  }
}

// --- 网络工具实现 ---

async function webFetch(args) {
  const url = args.url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return '错误: URL 必须以 http:// 或 https:// 开头';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), args.timeout || 30000);

  try {
    const fetchOpts = {
      method: args.method || 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'xCrab-AI-Agent/1.0', ...(args.headers || {}) },
    };
    if (args.body && (args.method === 'POST' || args.method === 'PUT')) {
      fetchOpts.body = args.body;
      if (!fetchOpts.headers['Content-Type'] && !fetchOpts.headers['content-type']) {
        fetchOpts.headers['Content-Type'] = 'application/json';
      }
    }

    const resp = await fetch(url, fetchOpts);
    clearTimeout(timeoutId);

    const responseType = args.responseType || 'text';
    let content;
    let sizeInfo = '';

    if (responseType === 'json') {
      content = JSON.stringify(await resp.json(), null, 2);
      sizeInfo = ` (${formatSize(Buffer.byteLength(content))})`;
    } else if (responseType === 'base64') {
      const buffer = await resp.arrayBuffer();
      content = Buffer.from(buffer).toString('base64');
      sizeInfo = ` (${formatSize(buffer.byteLength)}, base64 编码)`;
    } else {
      content = await resp.text();
      sizeInfo = ` (${formatSize(Buffer.byteLength(content))})`;
      if (content.length > 10000) {
        content = content.slice(0, 10000) + `\n\n... [响应过长，仅显示前 10000 字符，共 ${content.length} 字符]`;
      }
    }

    const headers = `HTTP ${resp.status} ${resp.statusText} | Content-Type: ${resp.headers.get('content-type') || 'N/A'}${sizeInfo}`;
    return `📡 ${url}\n${headers}\n\n${content}`;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') return `请求超时: ${url}`;
    if (err.cause?.code === 'ENOTFOUND' || err.cause?.code === 'ECONNREFUSED') {
      return `无法连接到服务器: ${url} (${err.cause.code})`;
    }
    return `网络请求失败: ${err.message}`;
  }
}

// --- 浏览器自动化工具实现 ---

/**
 * 执行 agent-browser CLI 命令并返回结果
 * @param {string} cmd 子命令及参数
 * @returns {Promise<string>}
 */
async function runAgentBrowser(cmd) {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  // 尝试多个路径
  const paths = [
    '/usr/local/bin/agent-browser',
    '/www/server/nodejs/v22.22.2/bin/agent-browser',
    'agent-browser',
  ];

  let lastError;
  for (const bin of paths) {
    try {
      const fullCmd = `${bin} ${cmd}`;
      const { stdout: out, stderr: err } = await execAsync(fullCmd, {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        windowsHide: true,
        env: { ...process.env, HOME: '/root' },
      });
      const result = out || '';
      if (err) console.warn(`[agent-browser stderr] ${err.slice(0, 500)}`);
      return result.trim();
    } catch (e) {
      lastError = e;
      // 如果命令本身跑成功了只是路径问题，忽略
      if (bin === paths[paths.length - 1]) {
        // 最后一个路径也失败
      }
    }
  }

  // 检查是否是 agent-browser 不在 PATH 中
  if (lastError && (lastError.message?.includes('command not found') || lastError.code === 'ENOENT')) {
    throw new Error('agent-browser 未安装。请运行: npm install -g agent-browser && agent-browser install');
  }
  throw new Error(`浏览器操作失败: ${lastError?.message || '未知错误'}`);
}

/**
 * 兼容 LLM 传错参数名：selector / element / target / sel 都认
 */
function _sel(a) {
  return a.selector || a.element || a.target || a.sel || '';
}

// --- 自定义工具系统 ---
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const _CT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CUSTOM_TOOLS_PATH = path.resolve(_CT_DIR, 'custom-tools.json');

/** 从 JSON 加载自定义工具并注册 */
async function loadCustomTools() {
  try {
    const { existsSync, writeFileSync, readFileSync } = await import('node:fs');
    if (!existsSync(CUSTOM_TOOLS_PATH)) {
      writeFileSync(CUSTOM_TOOLS_PATH, '[]', 'utf-8');
      return;
    }
    const raw = readFileSync(CUSTOM_TOOLS_PATH, 'utf-8');
    const tools = JSON.parse(raw);
    if (!Array.isArray(tools)) return;
    for (const tool of tools) {
      handlers[tool.name] = async (a) => {
        try {
          const fn = new Function('args', `return (async () => { ${tool.handler} })()`);
          return String(await fn(a) ?? '');
        } catch (err) {
          return '错误执行自定义工具"' + tool.name + '": ' + err.message;
        }
      };
      const exists = toolDefinitions.some(t => t.function.name === tool.name);
      if (!exists) {
        toolDefinitions.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description || '',
            parameters: typeof tool.parameters === 'string' ? JSON.parse(tool.parameters) : (tool.parameters || {}),
          },
        });
      }
    }
  } catch (err) {
    console.error('[自定义工具] 加载失败:', err.message);
  }
}

/** 保存自定义工具列表 */
async function saveCustomTools(tools) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(CUSTOM_TOOLS_PATH, JSON.stringify(tools, null, 2), 'utf-8');
}

/** 从运行环境移除工具 */
function unregisterCustomTool(name) {
  delete handlers[name];
  const idx = toolDefinitions.findIndex(t => t.function.name === name);
  if (idx >= 0) toolDefinitions.splice(idx, 1);
}

/** 热重载自定义工具 */
async function reloadCustomTools() {
  const names = [];
  try {
    const { existsSync, readFileSync } = await import('node:fs');
    if (existsSync(CUSTOM_TOOLS_PATH)) {
      for (const t of JSON.parse(readFileSync(CUSTOM_TOOLS_PATH, 'utf-8'))) names.push(t.name);
    }
  } catch {}
  for (const n of names) unregisterCustomTool(n);
  await loadCustomTools();
}

async function createTool(args) {
  const { name, description, parameters, handler } = args;
  if (!name || !description || !parameters || !handler) {
    return '错误：name、description、parameters、handler 均为必填';
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    return '错误：name 只能包含字母数字下划线';
  }
  if (handlers[name]) return '错误：工具"' + name + '"已存在';
  let paramsObj;
  try { paramsObj = JSON.parse(parameters); }
  catch { return '错误：parameters 不是有效的 JSON'; }
  const { existsSync, readFileSync } = await import('node:fs');
  const raw = existsSync(CUSTOM_TOOLS_PATH) ? readFileSync(CUSTOM_TOOLS_PATH, 'utf-8') : '[]';
  const tools = JSON.parse(raw);
  tools.push({ name, description, parameters: JSON.stringify(paramsObj), handler });
  await saveCustomTools(tools);
  handlers[name] = async (a) => {
    try { const fn = new Function('args', `return (async () => { ${handler} })()`); return String(await fn(a) ?? ''); }
    catch (err) { return '错误执行自定义工具"' + name + '": ' + err.message; }
  };
  toolDefinitions.push({ type: 'function', function: { name, description, parameters: paramsObj } });
  return '✅ 自定义工具"' + name + '"已创建成功，立即可用';
}

async function editTool(args) {
  const { name, new_name, description, parameters, handler } = args;
  const { existsSync, readFileSync } = await import('node:fs');
  if (!existsSync(CUSTOM_TOOLS_PATH)) return '错误：工具"' + name + '"不存在';
  const tools = JSON.parse(readFileSync(CUSTOM_TOOLS_PATH, 'utf-8'));
  const idx = tools.findIndex(t => t.name === name);
  if (idx < 0) return '错误：工具"' + name + '"不存在';
  if (new_name) tools[idx].name = new_name;
  if (description) tools[idx].description = description;
  if (parameters) { try { JSON.parse(parameters); tools[idx].parameters = parameters; } catch { return '错误：parameters 不是有效的 JSON'; } }
  if (handler) tools[idx].handler = handler;
  await saveCustomTools(tools);
  await reloadCustomTools();
  return '✅ 自定义工具"' + name + '"已更新' + (new_name ? '（新名称: ' + new_name + '）' : '');
}

async function deleteTool(args) {
  const name = args.name;
  const { existsSync, readFileSync } = await import('node:fs');
  if (!existsSync(CUSTOM_TOOLS_PATH)) return '错误：工具"' + name + '"不存在';
  const tools = JSON.parse(readFileSync(CUSTOM_TOOLS_PATH, 'utf-8'));
  const idx = tools.findIndex(t => t.name === name);
  if (idx < 0) return '错误：工具"' + name + '"不存在';
  tools.splice(idx, 1);
  await saveCustomTools(tools);
  unregisterCustomTool(name);
  return '✅ 自定义工具"' + name + '"已删除';
}

async function listCustomTools(args) {
  const query = (args && args.query) ? args.query.toLowerCase() : '';
  const { existsSync, readFileSync } = await import('node:fs');
  if (!existsSync(CUSTOM_TOOLS_PATH)) return query ? '' : '(暂无自定义工具)';
  const tools = JSON.parse(readFileSync(CUSTOM_TOOLS_PATH, 'utf-8'));
  if (!tools.length) return '(暂无自定义工具)';
  let filtered = tools;
  if (query) {
    filtered = tools.filter(t => t.name.toLowerCase().includes(query) || (t.description || '').toLowerCase().includes(query));
    if (!filtered.length) return '未找到匹配 "' + query + '" 的自定义工具';
  }
  return filtered.map((t, i) => (i + 1) + '. ' + t.name + ': ' + (t.description || '')).join('\n');
}
async function browseOpen(args) {
  const url = args.url ? args.url.trim() : 'about:blank';
  const result = await runAgentBrowser(`open "${url.replace(/"/g, '\\"')}"`);
  return `✅ 浏览器已打开: ${url}\n${result}`;
}

async function browseClick(args) {
  const sel = _sel(args);
  const result = await runAgentBrowser(`click "${sel.replace(/"/g, '\\"')}"`);
  return `✅ 已点击 ${sel}\n${result}`;
}

async function browseFill(args) {
  const sel = _sel(args);
  const text = args.text;
  const result = await runAgentBrowser(`fill "${sel.replace(/"/g, '\\"')}" "${text.replace(/"/g, '\\"')}"`);
  return `✅ 已填写 ${sel}\n${result}`;
}

async function browseType(args) {
  const sel = _sel(args);
  const text = args.text;
  const result = await runAgentBrowser(`type "${sel.replace(/"/g, '\\"')}" "${text.replace(/"/g, '\\"')}"`);
  return `✅ 已键入 ${sel}\n${result}`;
}

async function browseSnapshot() {
  const result = await runAgentBrowser('snapshot');
  return result || '(空页面)';
}

async function browseGetText(args) {
  const sel = _sel(args);
  const result = await runAgentBrowser(`get text "${sel.replace(/"/g, '\\"')}"`);
  return result || '(空)';
}

async function browseShot(args) {
  const full = args?.full ? ' --full' : '';
  const result = await runAgentBrowser(`screenshot --screenshot-format jpeg --screenshot-quality 70${full}`);
  return `截图已保存: ${result}\n如需查看，请使用浏览器打开该路径。`;
}

async function browsePress(args) {
  const key = args.key;
  const result = await runAgentBrowser(`press "${key.replace(/"/g, '\\"')}"`);
  return `✅ 已按键: ${key}\n${result}`;
}

async function browseClose() {
  const result = await runAgentBrowser('close');
  return `✅ 浏览器已关闭\n${result}`;
}

async function browseEval(args) {
  let code = args.code.trim();
  // 匿名函数 function(){} → 立即执行 (function(){})()
  if (/^function\s*\(/.test(code)) {
    code = `(${code})()`;
  }
  // 箭头函数 () => {} → 立即执行 (() => {})()
  else if (/^\(\s*\)\s*=>/.test(code)) {
    code = `(${code})()`;
  }
  // return 只能在函数体内，包裹箭头函数并立即执行
  else if (/^return\b/.test(code)) {
    code = `(() => { ${code} })()`;
  }
  const b64 = Buffer.from(code).toString('base64');
  const result = await runAgentBrowser(`eval -b "${b64}"`);
  return result || '(无返回值)';
}

async function browseHover(args) {
  const sel = _sel(args);
  const result = await runAgentBrowser(`hover "${sel.replace(/"/g, '\\"')}"`);
  return `✅ 已悬停 ${sel}\n${result}`;
}

async function browseScroll(args) {
  const dir = args.direction;
  const px = args.pixels || 300;
  let cmd = `scroll ${dir} ${px}`;
  if (args.selector) cmd += ` --selector "${args.selector.replace(/"/g, '\\"')}"`;
  const result = await runAgentBrowser(cmd);
  return `✅ 已滚动 ${dir} ${px}px\n${result}`;
}

async function browseSelect(args) {
  const sel = _sel(args);
  const val = args.value;
  const result = await runAgentBrowser(`select "${sel.replace(/"/g, '\\"')}" "${val.replace(/"/g, '\\"')}"`);
  return `✅ 已选择 ${sel} = "${val}"\n${result}`;
}

async function browseDblclick(args) {
  const sel = _sel(args);
  const result = await runAgentBrowser(`dblclick "${sel.replace(/"/g, '\\"')}"`);
  return `✅ 已双击 ${sel}\n${result}`;
}

async function browseFocus(args) {
  const sel = _sel(args);
  const result = await runAgentBrowser(`focus "${sel.replace(/"/g, '\\"')}"`);
  return `✅ 已聚焦 ${sel}\n${result}`;
}

async function browseDrag(args) {
  const src = args.source;
  const tgt = args.target;
  const result = await runAgentBrowser(`drag "${src.replace(/"/g, '\\"')}" "${tgt.replace(/"/g, '\\"')}"`);
  return `✅ 已拖拽 ${src} → ${tgt}\n${result}`;
}

async function browseCheck(args) {
  const sel = _sel(args);
  const result = await runAgentBrowser(`check "${sel.replace(/"/g, '\\"')}"`);
  return `✅ 已勾选 ${sel}\n${result}`;
}

async function browseUncheck(args) {
  const sel = _sel(args);
  const result = await runAgentBrowser(`uncheck "${sel.replace(/"/g, '\\"')}"`);
  return `✅ 已取消勾选 ${sel}\n${result}`;
}

async function browseUpload(args) {
  const sel = _sel(args);
  const files = args.files;
  const result = await runAgentBrowser(`upload "${sel.replace(/"/g, '\\"')}" "${files.replace(/"/g, '\\"')}"`);
  return `✅ 已上传文件到 ${sel}\n${result}`;
}

async function browseScrollInto(args) {
  const sel = _sel(args);
  const result = await runAgentBrowser(`scrollintoview "${sel.replace(/"/g, '\\"')}"`);
  return `✅ 已滚动到 ${sel}\n${result}`;
}

async function browseGet(args) {
  const what = args.what;
  const sel = _sel(args);
  let cmd = `get ${what}`;
  if (sel) cmd += ` "${sel.replace(/"/g, '\\"')}"`;
  if (args.attr) cmd += ` ${args.attr}`;
  const result = await runAgentBrowser(cmd);
  return result || '(空)';
}

async function browseIs(args) {
  const state = args.state;
  const sel = _sel(args);
  const result = await runAgentBrowser(`is ${state} "${sel.replace(/"/g, '\\"')}"`);
  return result || '(未知)';
}

async function browseFind(args) {
  const method = args.method;
  const value = args.value;
  const action = args.action;
  let cmd = `find ${method} "${value.replace(/"/g, '\\"')}" ${action}`;
  if (args.action_value) cmd += ` "${args.action_value.replace(/"/g, '\\"')}"`;
  if (args.name) cmd += ` --name "${args.name.replace(/"/g, '\\"')}"`;
  const result = await runAgentBrowser(cmd);
  return result || '(完成)';
}

async function browseExtra(args) {
  const action = args.action;
  const v1 = args.value1 || '';
  const v2 = args.value2 || '';

  // 路由表: action -> agent-browser CLI 语法
  const cmdMap = {
    'cookies_get':    'cookies',
    'cookies_set':    `cookies set "${v1}" "${v2}"`,
    'cookies_clear':  'cookies clear',
    'viewport':       `set viewport ${v1 || '1280'} ${v2 || '720'}`,
    'device':         `set device "${v1}"`,
    'geo':            `set geo ${v1} ${v2}`,
    'headers':        `set headers '${v1}'`,
    'offline':        `set offline ${v1 || 'on'}`,
    'mouse_move':     `mouse move ${v1} ${v2}`,
    'mouse_click':    `mouse click ${v1 || 'left'}`,
    'mouse_down':     `mouse down ${v1 || 'left'}`,
    'mouse_up':       `mouse up ${v1 || 'left'}`,
    'mouse_wheel':    `mouse wheel ${v1 || '100'}`,
    'window_new':     'window new',
    'pushstate':      `pushstate "${v1}"`,
    'inspect':        'inspect',
    'state_save':     `state save "${v1}"`,
    'state_load':     `state load "${v1}"`,
    'state_list':     'state list',
    'console':        v1 === 'clear' ? 'console --clear' : 'console',
    'errors':         v1 === 'clear' ? 'errors --clear' : 'errors',
    'storage_local':      `storage local${v1 ? ' "' + v1 + '"' : ''}`,
    'storage_local_set':  `storage local set "${v1}" "${v2}"`,
    'storage_local_clear':'storage local clear',
    'storage_session':    `storage session${v1 ? ' "' + v1 + '"' : ''}`,
    'pdf':            `pdf "${v1 || 'page.pdf'}"`,
    'credentials':    `set credentials "${v1}" "${v2}"`,
    'media':          `set media ${v1 || 'dark'}`,
  };

  const cmd = cmdMap[action];
  if (!cmd) return `未知 action: ${action}`;
  const result = await runAgentBrowser(cmd);
  return result || '(完成)';
}

async function browseKeyboard(args) {
  const mode = args.mode;
  const text = args.text;
  const sub = mode === 'insert' ? 'keyboard inserttext' : 'keyboard type';
  const result = await runAgentBrowser(`${sub} "${text.replace(/"/g, '\\"')}"`);
  return result || '(完成)';
}

async function browseWait(args) {
  const timeout = (args.timeout || 10) * 1000;
  let cmd;
  if (args.text) cmd = `wait --text "${args.text.replace(/"/g, '\\"')}"`;
  else if (args.load === 'networkidle') cmd = 'wait --load networkidle';
  else if (args.selector) cmd = `wait "${args.selector.replace(/"/g, '\\"')}"`;
  else cmd = `wait ${timeout}`;
  const result = await runAgentBrowser(cmd);
  return result || '(等待完成)';
}

async function browseHold(args) {
  const action = args.action;
  const key = args.key;
  const sub = action === 'down' ? 'keydown' : 'keyup';
  const result = await runAgentBrowser(`${sub} "${key.replace(/"/g, '\\"')}"`);
  return `✅ 已${action === 'down' ? '按住' : '释放'} ${key}\n${result}`;
}

async function browseTab(args) {
  const action = args.action;
  if (action === 'list') {
    const result = await runAgentBrowser('tab');
    return result || '(无标签页)';
  } else if (action === 'switch') {
    const result = await runAgentBrowser(`tab "${args.id.replace(/"/g, '\\"')}"`);
    return `✅ 已切换到标签页 ${args.id}\n${result}`;
  } else if (action === 'close') {
    const id = args.id ? `"${args.id.replace(/"/g, '\\"')}"` : '';
    const result = await runAgentBrowser(`tab close ${id}`);
    return `✅ 已关闭标签页 ${args.id || '(当前)'}\n${result}`;
  } else if (action === 'new') {
    const url = args.url ? ` "${args.url.replace(/"/g, '\\"')}"` : '';
    const result = await runAgentBrowser(`tab new${url}`);
    return `✅ 已打开新标签页${url}\n${result}`;
  }
  return '未知操作';
}

async function browseDialog(args) {
  const action = args.action;
  if (action === 'status') {
    const result = await runAgentBrowser('dialog status');
    return result || '(无弹窗)';
  } else if (action === 'accept') {
    const text = args.text ? ` "${args.text.replace(/"/g, '\\"')}"` : '';
    const result = await runAgentBrowser(`dialog accept${text}`);
    return result || '✅ 已接受弹窗';
  } else {
    const result = await runAgentBrowser('dialog dismiss');
    return result || '✅ 已取消弹窗';
  }
}

async function browseNav(args) {
  const action = args.action;
  const cmd = action === 'back' ? 'back' : action === 'forward' ? 'forward' : 'reload';
  const result = await runAgentBrowser(cmd);
  return `✅ 已${action === 'back' ? '后退' : action === 'forward' ? '前进' : '刷新'}\n${result}`;
}

async function browseHighlight(args) {
  const sel = _sel(args);
  const result = await runAgentBrowser(`highlight "${sel.replace(/"/g, '\\"')}"`);
  return `✅ 已高亮 ${sel}\n${result}`;
}

async function browseFrame(args) {
  const sel = _sel(args);
  if (sel === 'main') {
    const result = await runAgentBrowser('frame main');
    return '✅ 已回到主页面\n' + result;
  }
  const result = await runAgentBrowser(`frame "${sel.replace(/"/g, '\\"')}"`);
  return `✅ 已切换到 iframe ${sel}\n${result}`;
}

async function browseClipboard(args) {
  const action = args.action;
  if (action === 'write') {
    const text = args.text || '';
    const b64 = Buffer.from(text).toString('base64');
    const result = await runAgentBrowser(`clipboard write "${text.replace(/"/g, '\\"')}"`);
    return '✅ 已写入剪贴板\n' + result;
  } else {
    const result = await runAgentBrowser(`clipboard ${action}`);
    return result || '(空)';
  }
}

/** 工具名称 → 执行函数 映射 */
const handlers = {
  get_time: getTime,
  calculate,
  weather,
  web_search: webSearch,
  read_skill: readSkill,
  search_skills: searchSkillsClawHub,
  install_skill: installSkill,
  uninstall_skill: uninstallSkill,
  run_command: runCommand,
  remember,
  recall,
  forget,
  create_plan: createPlan,
  configure_skill: configureSkill,
  render_canvas: renderCanvas,
  switch_workspace: switchWorkspace,
  list_workspaces: listWorkspaces,
  read_file: readFile,
  write_file: writeFile,
  append_file: appendFile,
  list_files: listFiles,
  web_fetch: webFetch,
  // --- 浏览器自动化（推荐）---
  browse_open: browseOpen,
  browse_click: browseClick,
  browse_fill: browseFill,
  browse_type: browseType,
  browse_snapshot: browseSnapshot,
  browse_text: browseGetText,
  browse_shot: browseShot,
  browse_press: browsePress,
  browse_close: browseClose,
  browse_eval: browseEval,
  browse_hover: browseHover,
  browse_scroll: browseScroll,
  browse_select: browseSelect,
  browse_dblclick: browseDblclick,
  browse_focus: browseFocus,
  browse_drag: browseDrag,
  browse_check: browseCheck,
  browse_uncheck: browseUncheck,
  browse_upload: browseUpload,
  browse_scroll_into: browseScrollInto,
  browse_get: browseGet,
  browse_is: browseIs,
  browse_find: browseFind,
  browse_extra: browseExtra,
  browse_keyboard: browseKeyboard,
  browse_wait: browseWait,
  browse_hold: browseHold,
  browse_tab: browseTab,
  browse_dialog: browseDialog,
  browse_nav: browseNav,
  browse_highlight: browseHighlight,
  browse_frame: browseFrame,
  browse_clipboard: browseClipboard,
  // --- 自定义工具管理 ---
  create_tool: createTool,
  edit_tool: editTool,
  delete_tool: deleteTool,
  list_custom_tools: listCustomTools,
};

/** 解析 MCP 工具名格式 mcp__serverId__toolName（兼容旧格式 mcp||serverId||toolName） */
function parseMcpToolName(fullName) {
  // 当前格式 __
  let parts = fullName.split('__');
  if (parts.length >= 3 && parts[0] === 'mcp') {
    return { serverId: parts[1], toolName: parts.slice(2).join('__') };
  }
  // 兼容旧格式 ||
  parts = fullName.split('||');
  if (parts.length >= 3 && parts[0] === 'mcp') {
    return { serverId: parts[1], toolName: parts.slice(2).join('||') };
  }
  return null;
}

/** 各工具超时时间（毫秒），仅对已知可能阻塞的工具设置超时 */
const TOOL_TIMEOUT_MS = {
  run_command: 1_200_000,  // runCommand 内部默认为 20 分钟
  web_fetch: 120_000,      // webFetch 内部默认为 60 秒
};

/**
 * 带超时 + 用户确认的 Promise 包装
 * 超时到达时会通过 _onToolProgress 发送 timeout_warning 事件，
 * 并等待用户 30 秒内确认是否继续。
 * 用户可通过 extendToolTimeout / cancelToolTimeout 响应。
 * @param {Promise} promise - 原始 Promise
 * @param {number} ms - 超时毫秒
 * @param {string} toolName - 工具名，用于错误提示
 * @returns {Promise}
 */
function withTimeout(promise, ms, toolName) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timeoutTimer = setTimeout(() => {
      if (settled) return;

      const confirmId = `timeout_${toolName}_${Date.now()}`;

      // 通知前端：工具即将超时，询问用户是否继续
      // 优先通过请求级上下文的 pushSSE 推送（SSE 会话）
      // 其次通过全局 _onToolProgress 回调（Gateway 层）
      const store = _requestContext.getStore();
      const pushEvent = store?.pushSSE;
      if (pushEvent) {
        try {
          pushEvent({
            type: 'timeout_warning',
            confirmId,
            toolName,
            elapsedSec: Math.round(ms / 1000),
            message: `工具 "${toolName}" 已执行 ${Math.round(ms / 1000)} 秒，是否继续等待？`,
          });
        } catch {}
      } else if (_onToolProgress) {
        try {
          _onToolProgress(toolName, {
            type: 'timeout_warning',
            confirmId,
            toolName,
            elapsedSec: Math.round(ms / 1000),
          });
        } catch {}
      }

      // 30 秒宽限期等待用户确认
      const graceTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        _pendingConfirmations.delete(confirmId);
        reject(new Error(`工具 "${toolName}" 执行超时 (${ms / 1000}s)，用户未响应`));
      }, 30_000);

      _pendingConfirmations.set(confirmId, {
        toolName,
        timer: graceTimer,
        /** 用户选择继续等待 → 重新挂接原始 Promise */
        extend: () => {
          if (settled) return;
          // 原始 Promise 仍在运行，挂接新的 .then/.catch
          promise.then(r => {
            if (settled) return;
            settled = true;
            resolve(r);
          }).catch(e => {
            if (settled) return;
            settled = true;
            reject(e);
          });
        },
        /** 用户选择终止 */
        cancel: () => {
          if (settled) return;
          settled = true;
          _pendingConfirmations.delete(confirmId);
          reject(new Error(`工具 "${toolName}" 执行超时，用户已选择终止`));
        },
      });
    }, ms);

    // 原始 Promise 提前完成 → 正常返回
    promise.then(result => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      // 清理可能存在的待确认记录
      for (const [id, pc] of _pendingConfirmations) {
        if (pc.toolName === toolName) {
          clearTimeout(pc.timer);
          _pendingConfirmations.delete(id);
        }
      }
      resolve(result);
    }).catch(err => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      reject(err);
    });
  });
}

/**
 * 执行工具调用
 * @param {string} toolName
 * @param {object} args
 * @returns {Promise<string>}
 */
export async function executeTool(toolName, args, userId) {
  const startTime = Date.now();
  // 超时优先级：工具调用参数 > 工具内置配置 > 无超时
  const timeoutMs = args?._timeout || TOOL_TIMEOUT_MS[toolName];

  // 设置当前请求的用户标识（通过 AsyncLocalStorage 实现请求级隔离）
  if (userId !== undefined) {
    const store = _requestContext.getStore();
    if (store) {
      store.userId = userId;
    }
  }

  // 通知工具执行开始
  if (_onToolProgress) {
    try { _onToolProgress(toolName, { type: 'start', args }); } catch {}
  }

  // 检查是否是 MCP 工具调用
  const mcpInfo = _mcpManager ? parseMcpToolName(toolName) : null;

  try {
    let result;
    if (mcpInfo) {
      // Playwright 工具默认超时改为 3 分钟
      if (mcpInfo.serverId === 'playwright' && (args.timeout === undefined || args.timeout < 180000)) {
        args = { ...args, timeout: 180000 };
      }
      // MCP 工具执行（带自动重试，应对 Playwright 等工具的偶发超时）
      const maxRetries = 3;
      let lastError = null;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (mcpInfo.serverId === 'MiniMax' && _quotaTracker) {
            const quota = _quotaTracker.checkAndRecord(mcpInfo.toolName);
            if (!quota.allowed) {
              result = quota.message;
              console.warn('[配额]', quota.message);
            } else {
              result = await (timeoutMs ? withTimeout(_mcpManager.executeTool(mcpInfo.serverId, mcpInfo.toolName, args), timeoutMs, toolName) : _mcpManager.executeTool(mcpInfo.serverId, mcpInfo.toolName, args));
              const remaining = _quotaTracker.getRemaining(mcpInfo.toolName);
            }
          } else {
            result = await (timeoutMs ? withTimeout(_mcpManager.executeTool(mcpInfo.serverId, mcpInfo.toolName, args), timeoutMs, toolName) : _mcpManager.executeTool(mcpInfo.serverId, mcpInfo.toolName, args));
          }
          lastError = null;
          break; // 成功则跳出重试循环
        } catch (err) {
          lastError = err;
          const shouldRetry = attempt < maxRetries && (
            err.message.includes('Timeout') ||
            err.message.includes('detached from the DOM') ||
            err.message.includes('Ref ') && err.message.includes(' not found in the current page snapshot')
          );
          if (shouldRetry) {
            console.warn(`[工具重试] ${toolName} 第 ${attempt + 1} 次执行失败: ${err.message.slice(0, 100)}，正在重试...`);
            // Playwright 快照过期，先刷新快照再重试
            if (mcpInfo.serverId === 'playwright' && err.message.includes('not found in the current page snapshot')) {
              try {
                await _mcpManager.executeTool(mcpInfo.serverId, 'browser_snapshot', {});
                console.warn('[工具重试] 已刷新 Playwright 页面快照');
              } catch {}
            }
            await new Promise(r => setTimeout(r, 1000));
          } else {
            throw err;
          }
        }
      }
      if (lastError) throw lastError; // 重试耗尽仍失败
    } else {
      const handler = handlers[toolName];
      if (!handler) {
        result = `错误：未知工具 "${toolName}"`;
      } else {
        result = await (timeoutMs ? withTimeout(handler(args), timeoutMs, toolName) : handler(args));
      }
    }

    // 通知工具执行完成
    if (_onToolProgress) {
      try { _onToolProgress(toolName, { type: 'end', result, duration: Date.now() - startTime }); } catch {}
    }

    // 追踪统计
    const resultStr = String(result);
    // 检测 MCP 工具返回的错误结果（非异常形式的失败）
    const isErrorResult = /^### Error\b/i.test(resultStr.trim()) || /^Error:\s/i.test(resultStr.trim());
    trackToolCallStat(toolName, !isErrorResult, Date.now() - startTime);
    if (isErrorResult) {
      throw new Error(resultStr.slice(0, 500));
    }
    return resultStr;
  } catch (err) {
    // 通知工具执行失败
    if (_onToolProgress) {
      try { _onToolProgress(toolName, { type: 'error', error: err.message, duration: Date.now() - startTime }); } catch {}
    }

    trackToolCallStat(toolName, false, Date.now() - startTime, err.message);
    throw new Error(`工具 "${toolName}" 执行出错: ${err.message}`);
  }
}

/** 工具调用统计（异步，不影响主流程）*/
function trackToolCallStat(toolName, success, durationMs, error) {
  import('./stats/tracker.js').then(({ trackToolCall }) => {
    try { trackToolCall({ toolName, success, durationMs, error }); } catch {}
  }).catch(() => {});
}

// 启动时加载自定义工具
await loadCustomTools();
