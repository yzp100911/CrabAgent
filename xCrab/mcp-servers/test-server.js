#!/usr/bin/env node
/**
 * xCrab MCP 测试服务器
 * 提供两个工具：hello（打招呼）、add（加法计算）
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'xcatch-test-mcp',
  version: '1.0.0',
});

server.tool(
  'hello',
  { name: z.string().describe('你的名字') },
  async ({ name }) => ({
    content: [{ type: 'text', text: `你好，${name}！来自 MCP 服务器的问候 🎉` }],
  }),
);

server.tool(
  'add',
  {
    a: z.number().describe('第一个数'),
    b: z.number().describe('第二个数'),
  },
  async ({ a, b }) => ({
    content: [{ type: 'text', text: `${a} + ${b} = ${a + b}` }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
