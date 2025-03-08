/**
 * 网盘链接检测工具
 * 提供检测和解析网盘链接的功能
 */

// 支持的网盘类型和对应的正则表达式
const NETDISK_PATTERNS = {
  // 百度网盘链接格式 - 支持两种格式：/s/ 和 /share/init
  baidu: {
    // 标准分享链接格式：https://pan.baidu.com/s/1abcdef
    standardPattern: /https?:\/\/pan\.baidu\.com\/s\/([a-zA-Z0-9_-]+)/,
    // 初始化分享链接格式：https://pan.baidu.com/share/init?surl=abcdef&pwd=xxxx
    initPattern: /https?:\/\/pan\.baidu\.com\/share\/init\?surl=([a-zA-Z0-9_-]+)(?:&pwd=([a-zA-Z0-9]{4}))?/,
    name: '百度网盘',
    type: 'baidu'
  },
  // 阿里云盘链接格式
  aliyun: {
    // 标准链接格式：https://www.alipan.com/s/ABCdef1234 (提取码通常在URL旁边的文本中)
    pattern: /https?:\/\/(?:www\.aliyundrive\.com|www\.alipan\.com)\/s\/([a-zA-Z0-9_-]+)(?:[?&]pwd=([a-zA-Z0-9]{4}))?/,
    // 检测提取码的正则表达式 - 通常为"提取码"/"密码"/"访问码"后跟4个字符
    passwordPattern: /(?:(?:提取|访问|密)?码[：:]\s*|[?&]pwd=\s*)([a-zA-Z0-9]{4})/i,
    name: '阿里云盘',
    type: 'aliyun'
  },
  // 腾讯微云链接格式
  weiyun: {
    pattern: /https?:\/\/share\.weiyun\.com\/([a-zA-Z0-9_-]+)/,
    name: '腾讯微云',
    type: 'weiyun'
  },
  // 115网盘链接格式
  wangpan115: {
    pattern: /https?:\/\/115\.com\/s\/([a-zA-Z0-9_-]+)/,
    name: '115网盘',
    type: 'wangpan115'
  },
  // 蓝奏云链接格式
  lanzou: {
    pattern: /https?:\/\/[ww]*\.lanzou[a-z]*\.com\/([a-zA-Z0-9_-]+)/,
    name: '蓝奏云',
    type: 'lanzou'
  },
  // 夸克网盘链接格式
  quark: {
    pattern: /https?:\/\/pan\.quark\.cn\/s\/([a-zA-Z0-9_-]+)/,
    name: '夸克网盘',
    type: 'quark'
  },
  // 123盘链接格式
  pan123: {
    pattern: /https?:\/\/(?:www\.123pan\.com|www\.123684\.com)\/s\/([a-zA-Z0-9_-]+)(?:[?&](?:pwd|extraction-code)=([a-zA-Z0-9]{4}))?/,
    // 检测提取码的正则表达式
    passwordPattern: /(?:(?:提取|访问|密)?码[：:]\s*|[?&](?:pwd|extraction-code)=\s*)([a-zA-Z0-9]{4})/i,
    name: '123盘',
    type: 'pan123'
  }
  // 可以添加更多网盘类型
};

/**
 * 检测URL是否为支持的网盘链接
 * @param {string} url - 要检测的URL
 * @returns {object|null} - 如果是支持的网盘链接，返回网盘信息对象，否则返回null
 */
function detectNetDiskLink(url) {
  if (!url) return null;
  
  // 特殊处理百度网盘链接（支持两种不同格式）
  if (url.includes('pan.baidu.com')) {
    // 尝试匹配标准格式
    if (NETDISK_PATTERNS.baidu.standardPattern.test(url)) {
      const match = url.match(NETDISK_PATTERNS.baidu.standardPattern);
      return {
        type: NETDISK_PATTERNS.baidu.type,
        name: NETDISK_PATTERNS.baidu.name,
        url: url,
        matched: match[0],
        code: match[1]
      };
    }
    
    // 尝试匹配初始化格式
    if (NETDISK_PATTERNS.baidu.initPattern.test(url)) {
      const match = url.match(NETDISK_PATTERNS.baidu.initPattern);
      const result = {
        type: NETDISK_PATTERNS.baidu.type,
        name: NETDISK_PATTERNS.baidu.name,
        url: url,
        matched: match[0],
        code: match[1]
      };
      
      // 如果URL中包含提取码，直接提取
      if (match[2]) {
        result.password = match[2];
      }
      
      return result;
    }
  }
  
  // 特殊处理阿里云盘链接
  if (url.includes('alipan.com') || url.includes('aliyundrive.com')) {
    const pattern = NETDISK_PATTERNS.aliyun.pattern;
    if (pattern.test(url)) {
      const match = url.match(pattern);
      const result = {
        type: NETDISK_PATTERNS.aliyun.type,
        name: NETDISK_PATTERNS.aliyun.name,
        url: url,
        matched: match[0],
        code: match[1]
      };
      
      // 如果URL中包含提取码，直接提取
      if (match[2]) {
        result.password = match[2];
      }
      
      return result;
    }
  }
  
  // 特殊处理123盘链接
  if (url.includes('123pan.com') || url.includes('123684.com')) {
    const pattern = NETDISK_PATTERNS.pan123.pattern;
    if (pattern.test(url)) {
      const match = url.match(pattern);
      const result = {
        type: NETDISK_PATTERNS.pan123.type,
        name: NETDISK_PATTERNS.pan123.name,
        url: url,
        matched: match[0],
        code: match[1]
      };
      
      // 如果URL中包含提取码，直接提取
      if (match[2]) {
        result.password = match[2];
      }
      
      return result;
    }
  }
  
  // 检查其他网盘类型
  for (const [key, diskInfo] of Object.entries(NETDISK_PATTERNS)) {
    if (key === 'baidu' || key === 'aliyun' || key === 'pan123') continue; // 已单独处理
    
    const pattern = diskInfo.pattern;
    if (pattern.test(url)) {
      return {
        type: diskInfo.type,
        name: diskInfo.name,
        url: url,
        matched: url.match(pattern)[0],
        code: url.match(pattern)[1] // 用于标识资源的唯一码
      };
    }
  }
  
  return null;
}

/**
 * 提取一段文本中的所有网盘链接
 * @param {string} text - 包含可能的网盘链接的文本
 * @returns {Array} - 提取的网盘链接对象数组
 */
function extractNetDiskLinks(text) {
  if (!text) return [];
  
  const links = [];
  
  // 提取百度网盘标准格式链接
  const baiduStandardPattern = new RegExp(NETDISK_PATTERNS.baidu.standardPattern.source, 'g');
  let match;
  while ((match = baiduStandardPattern.exec(text)) !== null) {
    links.push({
      type: NETDISK_PATTERNS.baidu.type,
      name: NETDISK_PATTERNS.baidu.name,
      url: match[0],
      code: match[1]
    });
  }
  
  // 提取百度网盘初始化格式链接
  const baiduInitPattern = new RegExp(NETDISK_PATTERNS.baidu.initPattern.source, 'g');
  while ((match = baiduInitPattern.exec(text)) !== null) {
    const link = {
      type: NETDISK_PATTERNS.baidu.type,
      name: NETDISK_PATTERNS.baidu.name,
      url: match[0],
      code: match[1]
    };
    
    // 如果URL中包含提取码，记录下来
    if (match[2]) {
      link.password = match[2];
    }
    
    links.push(link);
  }
  
  // 提取阿里云盘链接
  const aliyunPattern = new RegExp(NETDISK_PATTERNS.aliyun.pattern.source, 'g');
  while ((match = aliyunPattern.exec(text)) !== null) {
    const link = {
      type: NETDISK_PATTERNS.aliyun.type,
      name: NETDISK_PATTERNS.aliyun.name,
      url: match[0],
      code: match[1]
    };
    
    // 如果URL中包含提取码参数
    if (match[2]) {
      link.password = match[2];
    } else {
      // 尝试在文本中查找提取码
      // 在链接所在位置的前后100个字符中查找
      const startPos = Math.max(0, match.index - 100);
      const endPos = Math.min(text.length, match.index + match[0].length + 100);
      const surroundingText = text.substring(startPos, endPos);
      
      const pwdMatch = surroundingText.match(NETDISK_PATTERNS.aliyun.passwordPattern);
      if (pwdMatch) {
        link.password = pwdMatch[1];
      }
    }
    
    links.push(link);
  }
  
  // 提取123盘链接
  const pan123Pattern = new RegExp(NETDISK_PATTERNS.pan123.pattern.source, 'g');
  while ((match = pan123Pattern.exec(text)) !== null) {
    const link = {
      type: NETDISK_PATTERNS.pan123.type,
      name: NETDISK_PATTERNS.pan123.name,
      url: match[0],
      code: match[1]
    };
    
    // 如果URL中包含提取码参数
    if (match[2]) {
      link.password = match[2];
    } else {
      // 尝试在文本中查找提取码
      // 在链接所在位置的前后100个字符中查找
      const startPos = Math.max(0, match.index - 100);
      const endPos = Math.min(text.length, match.index + match[0].length + 100);
      const surroundingText = text.substring(startPos, endPos);
      
      const pwdMatch = surroundingText.match(NETDISK_PATTERNS.pan123.passwordPattern);
      if (pwdMatch) {
        link.password = pwdMatch[1];
      }
    }
    
    links.push(link);
  }
  
  // 提取其他网盘链接
  for (const [key, diskInfo] of Object.entries(NETDISK_PATTERNS)) {
    if (key === 'baidu' || key === 'aliyun' || key === 'pan123') continue; // 已单独处理
    
    const pattern = new RegExp(diskInfo.pattern.source, 'g');
    while ((match = pattern.exec(text)) !== null) {
      links.push({
        type: diskInfo.type,
        name: diskInfo.name,
        url: match[0],
        code: match[1]
      });
    }
  }
  
  return links;
}

/**
 * 检查网盘类型是否在设置中启用
 */
function isNetDiskTypeEnabled(type, settings) {
  if (!settings) {
    return true; // 默认启用
  }
  
  // 兼容旧设置结构
  if (settings.enabledPlatforms && settings.enabledPlatforms[type] !== undefined) {
    return settings.enabledPlatforms[type] !== false;
  }
  
  // 新设置结构
  if (settings.enabledTypes && settings.enabledTypes[type] !== undefined) {
    return settings.enabledTypes[type] !== false;
  }
  
  return true; // 默认启用
}

// 导出函数
export {
  NETDISK_PATTERNS,
  detectNetDiskLink,
  extractNetDiskLinks,
  isNetDiskTypeEnabled
}; 