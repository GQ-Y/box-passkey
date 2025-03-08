/**
 * 网盘密码提取工具
 * 提供从文本中提取网盘密码的功能
 */

// 提取密码的正则表达式集合
const PASSWORD_PATTERNS = [
  // 提取形如 "提取码: abcd" 的密码
  /(?:提取码|密码|访问码|提取密码|验证码)[：:]\s*([a-zA-Z0-9]{4})/i,
  
  // 提取形如 "pw: abcd" 的密码
  /(?:pw|pwd|pass|password)[：:]\s*([a-zA-Z0-9]{4})/i,
  
  // 提取形如 "code: abcd" 的密码
  /(?:code|验证|校验码)[：:]\s*([a-zA-Z0-9]{4})/i,
  
  // 提取形如 "abcd" 的纯4位密码（作为最后尝试，优先级最低）
  /\b([a-zA-Z0-9]{4})\b/
];

/**
 * 从文本中提取可能的密码
 * @param {string} text - 要提取密码的文本
 * @returns {Array} - 可能的密码数组
 */
function extractPossiblePasswords(text) {
  if (!text) return [];
  
  const passwords = [];
  
  for (const pattern of PASSWORD_PATTERNS) {
    const matches = text.match(new RegExp(pattern, 'g'));
    if (matches) {
      matches.forEach(match => {
        const password = match.match(pattern)[1];
        if (password && !passwords.includes(password)) {
          passwords.push(password);
        }
      });
    }
  }
  
  return passwords;
}

/**
 * 尝试为特定网盘链接找到最匹配的密码
 * @param {string} url - 网盘链接
 * @param {string} text - 包含链接的上下文文本
 * @param {Array} possiblePasswords - 可能的密码列表（如已经提取）
 * @returns {string|null} - 找到的最可能密码，未找到则返回null
 */
function findPasswordForLink(url, text, possiblePasswords = null) {
  if (!url || !text) return null;
  
  // 如果未提供可能的密码列表，则从文本中提取
  const passwords = possiblePasswords || extractPossiblePasswords(text);
  if (passwords.length === 0) return null;
  
  // 如果只有一个密码，直接返回
  if (passwords.length === 1) return passwords[0];
  
  // 查找链接周围的文本（前后100个字符）
  const linkIndex = text.indexOf(url);
  if (linkIndex === -1) return passwords[0]; // 未找到链接，返回第一个密码
  
  const startIndex = Math.max(0, linkIndex - 100);
  const endIndex = Math.min(text.length, linkIndex + url.length + 100);
  const surroundingText = text.substring(startIndex, endIndex);
  
  // 在链接周围的文本中查找密码模式
  for (const pattern of PASSWORD_PATTERNS) {
    const match = surroundingText.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  // 如果在周围文本中没找到明确的密码，返回第一个可能的密码
  return passwords[0];
}

/**
 * 评估密码的可能性（基于上下文）
 * @param {string} password - 要评估的密码
 * @param {string} context - 密码出现的上下文
 * @returns {number} - 密码的可能性得分（0-10）
 */
function evaluatePasswordLikelihood(password, context) {
  if (!password || !context) return 0;
  
  let score = 0;
  
  // 检查密码是否在强密码模式中出现
  for (let i = 0; i < 2; i++) { // 只检查前两个高优先级模式
    if (new RegExp(PASSWORD_PATTERNS[i]).test(context)) {
      score += 5;
      break;
    }
  }
  
  // 检查密码与上下文的距离
  const passwordIndex = context.indexOf(password);
  if (passwordIndex !== -1) {
    const contextLength = context.length;
    // 如果密码在上下文的中间部分，得分更高
    const positionScore = 3 - Math.abs((passwordIndex / contextLength) - 0.5) * 6;
    score += Math.max(0, positionScore);
  }
  
  // 密码格式检查 (大多数网盘密码为4位字母数字)
  if (/^[a-zA-Z0-9]{4}$/.test(password)) {
    score += 2;
  }
  
  return Math.min(10, score);
}

// 导出函数
export {
  PASSWORD_PATTERNS,
  extractPossiblePasswords,
  findPasswordForLink,
  evaluatePasswordLikelihood
}; 