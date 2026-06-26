/**
 * xCrab Gateway HTTP + WebSocket 服务器
 * 提供 REST API + SSE 流式响应，供 Web 前端连接
 */

import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initAuth, authMiddleware } from './auth.js';
import { createApiHandler } from './api-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, 'frontend');

export class GatewayServer {
  /**
   * @param {object} config - gateway 配置
   * @param {object} deps - 依赖注入
   */
  constructor(config, deps) {
    this.config = config;
    this.deps = deps;
    this.app = null;
    this.server = null;
  }

  async start() {
    const { enabled, port, jwtSecret, token } = this.config;
    if (!enabled) return;

    // 初始化认证
    initAuth(jwtSecret, token);

    // 创建 Express 应用
    const app = express();
    this.app = app;

    app.use(cors());
    app.use(express.json());

    // 静态文件服务（前端 + 图标）
    app.use(express.static(FRONTEND_DIR));
    app.use('/ico', express.static(path.resolve(__dirname, '..', 'ico')));

    // API 路由（需要认证）
    app.use('/api', authMiddleware, createApiHandler(this.deps));

    // 创建 HTTP 服务器
    const server = http.createServer(app);
    this.server = server;

    return new Promise((resolve) => {
      server.listen(port, '0.0.0.0', () => {
        console.log(`  🌐 Gateway: http://localhost:${port}`);
        resolve();
      });
    });
  }

  async stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
