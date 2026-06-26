/**
 * xCrab Gateway JWT 认证中间件
 */

import jwt from 'jsonwebtoken';

let _secret = '';
let _token = '';

export function initAuth(secret, token) {
  _secret = secret;
  _token = token;
}

/**
 * JWT 认证中间件
 * 支持两种方式：
 * 1. Authorization: Bearer <jwt>
 * 2. Authorization: Bearer <static_token>（配置的 GATEWAY_TOKEN）
 */
export function authMiddleware(req, res, next) {
  // 健康检查不需要认证
  if (req.path === '/api/health' || req.path === '/health') return next();

  // 支持 header 和 query 参数两种方式（query 参数用于 EventSource 等无法自定义 header 的场景）
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader) {
    token = authHeader.split(' ')[1];
  }

  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ code: 401, message: '未提供认证信息' });
  }

  // 先尝试静态 token
  if (_token && token === _token) {
    req.user = { username: 'user' };
    return next();
  }

  // 再尝试 JWT
  try {
    const decoded = jwt.verify(token, _secret);
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ code: 401, message: 'Token 无效或已过期' });
  }
}

/**
 * 签发 JWT token
 */
export function signToken(payload) {
  return jwt.sign(payload, _secret, { expiresIn: '7d' });
}
