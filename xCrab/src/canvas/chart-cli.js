/**
 * xCrab 终端字符图表渲染
 * 将图表数据渲染为 ASCII 字符串，供 CLI 模式展示
 */

/**
 * 渲染柱状图
 * @param {object} canvas - { type, title, data: { labels, datasets } }
 * @returns {string}
 */
function renderBar(canvas) {
  const { title, data } = canvas;
  const { labels, datasets } = data;
  const lines = [];
  if (title) lines.push(`  ${title}`);
  lines.push('');

  // 每个 dataset 独立渲染
  for (const ds of datasets) {
    const label = ds.label || '';
    const values = ds.values.map(v => Number(v));
    const max = Math.max(...values, 1);
    const barWidth = 20;

    if (label) lines.push(`  ${label}:`);

    for (let i = 0; i < values.length; i++) {
      const barLen = Math.round((values[i] / max) * barWidth);
      const bar = '█'.repeat(barLen).padEnd(barWidth, '░');
      lines.push(`  ${String(labels[i] || '').padEnd(12)} ${bar} ${values[i]}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 渲染折线图
 * @param {object} canvas
 * @returns {string}
 */
function renderLine(canvas) {
  const { title, data } = canvas;
  const { labels, datasets } = data;
  const lines = [];
  if (title) lines.push(`  ${title}`);
  lines.push('');

  for (const ds of datasets) {
    const label = ds.label || '';
    const values = ds.values.map(v => Number(v));
    const max = Math.max(...values, 1);
    const height = 8;

    if (label) lines.push(`  ${label}:`);

    // 从上往下绘制
    for (let row = height - 1; row >= 0; row--) {
      const threshold = ((row + 1) / height) * max;
      const rowChars = values.map((v, i) => {
        if (v >= threshold && v > 0) return i > 0 && values[i - 1] >= threshold ? '─' : '●';
        // 检查是否在连线上
        if (i > 0 && values[i - 1] >= threshold && v < threshold) return '╯';
        if (i < values.length - 1 && values[i + 1] >= threshold && v < threshold) return '╰';
        return ' ';
      });
      const yLabel = Math.round(threshold).toString().padStart(4);
      lines.push(`  ${yLabel} │${rowChars.join('')}`);
    }

    // X 轴
    lines.push(`       └${'─'.repeat(labels.length)}`);
    lines.push(`       ${labels.map(l => (String(l)[0] || ' ')).join('')}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 渲染饼图
 * @param {object} canvas
 * @returns {string}
 */
function renderPie(canvas) {
  const { title, data } = canvas;
  const { labels, values } = data;
  const lines = [];
  if (title) lines.push(`  ${title}`);
  lines.push('');

  const total = values.reduce((a, b) => a + Number(b), 0) || 1;
  // 简单 ASCII 饼图表示
  const shades = ['▓', '▒', '░', '█', '▄', '▀', '■', '●'];
  const maxLabelLen = Math.max(...labels.map(l => l.length));

  for (let i = 0; i < labels.length; i++) {
    const pct = ((Number(values[i]) / total) * 100).toFixed(1);
    const barLen = Math.round((Number(values[i]) / total) * 20);
    const bar = shades[i % shades.length].repeat(barLen);
    lines.push(`  ${bar} ${String(labels[i]).padEnd(maxLabelLen + 2)} ${values[i]} (${pct}%)`);
  }
  lines.push(`  ${'─'.repeat(24)}`);
  lines.push(`  ${'Total'.padEnd(maxLabelLen + 2)} ${total}`);

  return lines.join('\n');
}

/**
 * 渲染表格
 * @param {object} canvas
 * @returns {string}
 */
function renderTable(canvas) {
  const { title, data } = canvas;
  const { headers, rows } = data;
  const lines = [];
  if (title) lines.push(`  ${title}`);
  lines.push('');

  // 计算每列宽度
  const colWidths = headers.map((h, i) => {
    const dataMax = rows.reduce((max, row) => Math.max(max, String(row[i] || '').length), 0);
    return Math.max(String(h).length, dataMax) + 2;
  });

  // 上边框 + 表头
  const topBorder = '  ┌' + colWidths.map(w => '─'.repeat(w)).join('┬') + '┐';
  const separator = '  ├' + colWidths.map(w => '─'.repeat(w)).join('┼') + '┤';
  const bottomBorder = '  └' + colWidths.map(w => '─'.repeat(w)).join('┴') + '┘';

  lines.push(topBorder);
  lines.push('  │' + headers.map((h, i) => String(h).padEnd(colWidths[i])).join('│') + '│');
  lines.push(separator);

  for (const row of rows) {
    lines.push('  │' + row.map((cell, i) => String(cell).padEnd(colWidths[i])).join('│') + '│');
  }

  lines.push(bottomBorder);
  return lines.join('\n');
}

/**
 * 渲染 Canvas 到终端文本
 * @param {object} canvas - { type, title, data }
 * @returns {string}
 */
export function renderChart(canvas) {
  if (!canvas || !canvas.type) return '（无效图表数据）';

  switch (canvas.type) {
    case 'bar':
      return renderBar(canvas);
    case 'line':
      return renderLine(canvas);
    case 'pie':
      return renderPie(canvas);
    case 'table':
      return renderTable(canvas);
    default:
      return `（不支持的图表类型: ${canvas.type}）`;
  }
}
