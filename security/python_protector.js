/**
 * TBAO TEAM - PYTHON CODE PROTECTOR / INJECTOR
 * Tự động chèn khối kiểm tra bản quyền vào đầu file Python của người dùng
 */

const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'license_guard_template.py');

/**
 * Đọc template Python Guard
 */
function getGuardTemplate(serverUrl) {
  try {
    let tpl = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
    const targetUrl = (serverUrl && typeof serverUrl === 'string') 
      ? serverUrl.trim().replace(/\/+$/, '') 
      : 'http://localhost:3000';
    return tpl.replace('{{SERVER_URL}}', targetUrl);
  } catch (err) {
    console.error('[GET_TEMPLATE_ERROR]', err);
    throw new Error('CANNOT_READ_GUARD_TEMPLATE');
  }
}

/**
 * Ghép khối bảo vệ vào file Python gốc một cách an toàn:
 * - Bảo tồn Shebang (#!/usr/bin/env python3)
 * - Bảo tồn Encoding declaration (# -*- coding: utf-8 -*-)
 * - Bảo tồn __future__ imports (bắt buộc đứng đầu module trong Python)
 * - Giữ nguyên 100% logic mã nguồn gốc
 */
function protectPythonCode(originalCode, serverUrl) {
  if (typeof originalCode !== 'string') {
    throw new Error('INVALID_CODE_TYPE');
  }

  const guardSnippet = getGuardTemplate(serverUrl);
  const lines = originalCode.split(/\r?\n/);

  const prefixLines = [];
  let index = 0;

  // 1. Quét shebang, encoding và comments đầu file
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (index === 0 && trimmed.startsWith('#!')) {
      prefixLines.push(line);
      index++;
      continue;
    }

    if (trimmed.startsWith('#') && (trimmed.includes('coding:') || trimmed.includes('coding='))) {
      prefixLines.push(line);
      index++;
      continue;
    }

    // Kiểm tra dòng from __future__ import ...
    if (trimmed.startsWith('from __future__ import')) {
      prefixLines.push(line);
      index++;
      continue;
    }

    // Nếu gặp dòng trống ở đầu, cho vào prefix
    if (!trimmed && prefixLines.length > 0) {
      prefixLines.push(line);
      index++;
      continue;
    }

    break;
  }

  const remainingCode = lines.slice(index).join('\n');

  let output = '';
  if (prefixLines.length > 0) {
    output += prefixLines.join('\n') + '\n\n';
  }

  output += guardSnippet + '\n\n' + remainingCode;
  return output;
}

module.exports = {
  getGuardTemplate,
  protectPythonCode
};

