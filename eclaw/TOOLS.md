## browser-act 工具（v2.0.2 / CLI v0.1.27）

**安装位置**: `~/.claude/skills/browser-act/SKILL.md`
**CLI 路径**: `~/.local/bin/browser-act`（需确保 PATH 包含 `~/.local/bin`，可写入 `~/.bashrc`）

### 首次部署必做
1. **握手升级**: `browser-act get-skills core --skill-version 2.0.2`
   - 不做这个会导致所有命令返回 `skill_version_incompatible`
2. **创建实例**: `browser-act browser create --type chrome --name <name>`
   - 会触发"确认门（Confirmation Gate）"，需用户在终端输入 `confirm`

### 常用命令（新格式，2026-06-11 确认）
```bash
# 打开会话并导航
browser-act browser open \
  --browser-id chrome_local_xxx \
  --session my-session \
  --url https://example.com

# 关闭会话
browser-act browser close --session my-session

# 查看快照/状态
browser-act state --session my-session

# 与页面交互（点击/输入/勾选/执行 JS）
browser-act act --session my-session \
  --target 'button:has-text("登录")' \
  --kind click

browser-act act --session my-session \
  --target 'input[type=password]' \
  --kind type \
  --text 'mypassword'

browser-act act --session my-session \
  --kind eval \
  --function '() => Array.from(document.querySelectorAll(".item")).map(e => e.textContent)'
```

### 登录后台的隐藏坑
- **必勾协议 checkbox**: 房东/银行类后台的"我已阅读并同意"checkbox 默认未勾选，不勾选则登录按钮看似可点但实际无响应。
- **快捷标签数字 ≠ 可见行数**: 列表分页/折叠时，标签上"租约欠款·13"可能只显示 8 行。完整提取用 `eval` + `querySelectorAll`。
- **隐私弹窗**: 登录页通常第一个弹窗是"隐私政策/同意并授权"，必须先关掉才能点登录。

### 当前活跃实例
- `chrome_local_100871977576693999` (main-chrome, chrome, active) — 用于石碣店/南城店等房东系统自动化

### 调试提示
- 命令失败时**先 `read_skill` 检查命令格式**（CLI 升级后旧命令会全部失效）
- `act --kind eval` 是万能工具，任何 DOM 提取/数据解析都用它