# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice

---

## [LRN-20250523-001] xCrab "waiting for response" issue with file attachments

**Logged**: 2025-05-23T11:30:00+08:00
**Priority**: high
**Status**: resolved
**Area**: backend

### Summary
When user sends messages with file attachments via wclaw, xCrab AI keeps showing "waiting for response from receiving end" and never responds.

### Details
Root cause identified through logs:

1. **File upload flow**: wclaw uploads file to `/api/upload_with_command` → server saves to `/www/wwwroot/eclaw/uploads/` → server constructs a URL like `http://45.192.100.44:10001/uploads/1234567890.doc` and sends `[Received File: xxx] http://...` command to xCrab via `/api/chat/stream`

2. **The actual problem**: When xCrab receives the file URL command, the AI (MiniMax-M2.7 or deepseek-v4-flash) **automatically tries to use Playwright MCP browser tools** to access/download the file. Since the URL is an internal server path and the browser on the xCrab side can't resolve it, the browser tools fail/timeout, and the AI gets stuck.

3. **Why it shows "waiting for response"**: This is the AI model itself generating this text, NOT a system message. The AI generates it as a self-referential loop while retrying failed browser operations.

4. **Not a server bug**: The eclaw server correctly forwards the message to xCrab Gateway and xCrab correctly receives it. The issue is that the AI model, when prompted with file URLs, autonomously tries to use browser automation tools that fail.

### Suggested Action
Two possible fixes:

**Option A (eclaw server side)**: When uploading files, embed the file content directly in the prompt instead of just a URL. Instead of:
```
[Received File: report.doc] http://45.192.100.44:10001/uploads/123.doc
```
Send the actual file content/text directly so the AI doesn't need to fetch it.

**Option B (xCrab system prompt)**: Modify xCrab's system prompt to explicitly instruct the AI NOT to auto-fetch file URLs with browser tools, and instead analyze file content only when explicitly requested by the user.

### Metadata
- Source: conversation
- Related Files: /www/wwwroot/eclaw/server.js (upload_with_command), /www/wwwroot/eclaw/wclaw/app-main.js (sendFileWithCommand)
- Pattern-Key: ai.file_url_browser_fetch_loop
- See Also: This is an AI behavior issue, not a code bug

---