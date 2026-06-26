/**
 * xCrab Gateway Web 前端 - 基础函数
 */

function escapeHtml(unsafe) {
  return (unsafe||'').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripAnsi(str) {
  if (!str) return '';
  return str.replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\x1B\].*?\x07/g, '')
    .replace(/\x1B\\[a-zA-Z]/g, '');
}

function showToast(type, message) {
  const toast = document.getElementById('toast');
  if (!toast) {
    const el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:8px;color:#fff;font-size:14px;z-index:9999;transition:opacity 0.3s;';
    document.body.appendChild(el);
  }
  const t = document.getElementById('toast');
  t.textContent = message;
  t.style.background = type === 'error' ? '#e74c3c' : type === 'warning' ? '#f39c12' : '#2ecc71';
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 3000);
}

// UUID 生成
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 获取 token
function getToken() {
  return localStorage.getItem('xcrab_token') || '';
}

// 保存 token
function saveToken() {
  const input = document.getElementById('token-input');
  if (input) {
    localStorage.setItem('xcrab_token', input.value.trim());
    showToast('success', '令牌已保存');
  }
}

// 页面加载时恢复 token 到输入框
if (typeof document !== 'undefined') {
  const initToken = () => {
    const input = document.getElementById('token-input');
    if (input) input.value = getToken();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToken);
  } else {
    initToken();
  }
}
