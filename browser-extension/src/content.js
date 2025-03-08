// 内容脚本
// 识别网页中的网盘链接和密码，替换为一键免密访问按钮

// 导入工具函数
import {
  NETDISK_PATTERNS,
  detectNetDiskLink,
  extractNetDiskLinks,
  isNetDiskTypeEnabled
} from './utils/link-detector.js';

import {
  PASSWORD_PATTERNS,
  extractPossiblePasswords,
  findPasswordForLink,
  evaluatePasswordLikelihood
} from './utils/password-extractor.js';

// 存储页面中发现的链接和密码
const foundLinks = new Map();
// 用户积分
let userPoints = 0;
// 默认设置
const defaultSettings = {
  autoReplace: true,
  autoSubmit: true,
  offlineMode: false,
  enabledTypes: {
    baidu: true,
    aliyun: true,
    quark: true,
    lanzou: true,
    pan123: true,
    generic: true
  }
};

// 全局设置对象
let settings = {...defaultSettings};

/**
 * 初始化内容脚本
 */
async function init() {
  console.log('网盘助手内容脚本已加载');
  
  // 加载设置
  await loadSettings();
  
  // 获取用户信息和积分
  const userInfo = await getUserInfo();
  if (userInfo && userInfo.points !== undefined) {
    userPoints = userInfo.points;
  }
  
  // 扫描页面寻找网盘链接和密码
  scanPage();
  
  // 监听DOM变化，检测新增的网盘链接
  observeDOMChanges();
  
  // 监听来自后台脚本的消息
  listenForMessages();
  
  // 检查当前页面URL是否为网盘链接
  checkCurrentPageUrl();
}

/**
 * 检查当前页面URL是否为网盘链接
 */
function checkCurrentPageUrl() {
  const currentUrl = window.location.href;
  const diskInfo = detectNetDiskLink(currentUrl);
  
  if (diskInfo) {
    console.log('当前页面是网盘链接:', diskInfo);
    
    // 将当前页面的网盘链接添加到foundLinks集合中
    foundLinks.set(currentUrl, diskInfo);
    
    // 如果设置为自动提交，则将链接信息上传到服务器
    if (settings.autoSubmit && !diskInfo.submitted) {
      submitFoundLink(diskInfo);
    }
    
    // 如果链接中已经包含密码，则无需处理
    if (diskInfo.password) {
      console.log('链接中已包含密码:', diskInfo.password);
      return;
    }
    
    // 如果是百度网盘的初始化页面，尝试从页面元素中提取密码并自动填充
    if (diskInfo.type === 'baidu' && currentUrl.includes('/share/init')) {
      setTimeout(() => {
        const passwordInput = document.querySelector('.input-box input[type="text"]');
        if (passwordInput) {
          // 尝试从URL中提取密码参数
          const urlParams = new URLSearchParams(window.location.search);
          const pwd = urlParams.get('pwd');
          
          if (pwd) {
            passwordInput.value = pwd;
            const submitBtn = document.querySelector('.input-box + .button');
            if (submitBtn) {
              submitBtn.click();
            }
          }
        }
      }, 1000);
    }
    
    // 尝试从页面内容中提取密码
    setTimeout(extractPasswordFromPage, 1500);
  }
}

/**
 * 从页面内容中提取密码
 */
function extractPasswordFromPage() {
  // 获取页面中所有可能包含密码的文本
  const pageText = document.body.innerText;
  
  // 提取可能的密码
  const possiblePasswords = extractPossiblePasswords(pageText);
  
  if (possiblePasswords.length > 0) {
    // 获取当前URL
    const currentUrl = window.location.href;
    const diskInfo = foundLinks.get(currentUrl);
    
    if (diskInfo && !diskInfo.password) {
      // 更新链接信息中的密码
      diskInfo.password = possiblePasswords[0];
      foundLinks.set(currentUrl, diskInfo);
      
      console.log('从页面中提取到密码:', diskInfo.password);
      
      // 如果设置为自动提交，重新提交更新了密码的链接
      if (settings.autoSubmit) {
        submitFoundLink(diskInfo);
      }
    }
  }
}

/**
 * 加载设置
 */
async function loadSettings() {
  try {
    const data = await window.sendToBackground({
      action: 'getSettings'
    });
    
    if (data && data.settings) {
      // 合并默认设置和用户设置，确保所有必要的字段都存在
      const userSettings = data.settings;
      
      // 兼容性处理，将旧的enabledPlatforms转换为新的enabledTypes
      if (userSettings.enabledPlatforms && !userSettings.enabledTypes) {
        userSettings.enabledTypes = {
          baidu: userSettings.enabledPlatforms.baidu !== false,
          aliyun: userSettings.enabledPlatforms.aliyun !== false,
          quark: userSettings.enabledPlatforms.quark !== false,
          lanzou: true,
          pan123: userSettings.enabledPlatforms.pan123 !== false,
          generic: true
        };
      }
      
      settings = {...defaultSettings, ...userSettings};
    }
  } catch (error) {
    console.error('加载设置失败:', error);
    // 使用默认设置
    settings = {...defaultSettings};
  }
}

/**
 * 获取用户信息
 */
async function getUserInfo() {
  try {
    return await window.sendToBackground({ action: 'getUserInfo' });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    return null;
  }
}

/**
 * 扫描页面寻找网盘链接和密码
 */
function scanPage() {
  // 如果设置为不自动替换，则退出
  if (!settings.autoReplace) return;
  
  // 获取页面的所有文本节点
  const textNodes = getTextNodes(document.body);
  
  // 提取页面文本
  const pageText = textNodes.map(node => node.nodeValue).join(' ');
  
  // 从文本中提取所有可能的密码
  const possiblePasswords = extractPossiblePasswords(pageText);
  
  // 查找网盘链接并处理
  findAndProcessLinks(document.body, possiblePasswords, pageText);
  
  // 查找纯文本URL并处理
  findAndProcessTextUrls(textNodes, possiblePasswords, pageText);
}

/**
 * 获取元素内的所有文本节点
 */
function getTextNodes(element) {
  const textNodes = [];
  const walk = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let node;
  while (node = walk.nextNode()) {
    // 忽略空文本和只有空白的文本
    if (node.nodeValue.trim()) {
      textNodes.push(node);
    }
  }
  
  return textNodes;
}

/**
 * 查找和处理网盘链接
 */
function findAndProcessLinks(rootElement, possiblePasswords, pageText) {
  // 查找页面上所有的链接
  const links = rootElement.querySelectorAll('a:not(.netdisk-processed)');
  
  links.forEach(link => {
    const href = link.href;
    
    // 检测是否为网盘链接
    const diskInfo = detectNetDiskLink(href);
    
    if (diskInfo && isNetDiskTypeEnabled(diskInfo.type, settings)) {
      // 标准化URL
      const normalizedUrl = normalizeNetDiskUrl(href);
      
      // 检查是否已经处理过
      if (foundLinks.has(normalizedUrl) && foundLinks.get(normalizedUrl).processed) {
        // 已处理过，仅标记当前元素
        link.classList.add('netdisk-processed');
        link.style.display = 'none';
        return; // 已处理过，跳过
      }
      
      // 如果链接中已经包含密码，则使用URL中的密码
      if (!diskInfo.password) {
        // 为每个匹配的链接找到最可能的密码
        diskInfo.password = findPasswordForLink(normalizedUrl, pageText, possiblePasswords);
      }
      
      // 添加标准化URL
      diskInfo.normalizedUrl = normalizedUrl;
      
      // 记录找到的链接和密码
      foundLinks.set(normalizedUrl, diskInfo);
      
      // 替换链接为一键免密访问按钮
      replaceWithAccessButton(link, diskInfo);
    }
  });
  
  // 查找包含网盘URL文本但不是链接的元素（例如代码块、段落等）
  const potentialContainers = [
    'pre', 'code', 'p', 'div', 'span', 'td', 'li', 'blockquote'
  ];
  
  potentialContainers.forEach(tag => {
    // 排除已经处理过的容器
    const elements = rootElement.querySelectorAll(`${tag}:not([data-netdisk-checked="true"])`);
    
    elements.forEach(element => {
      // 跳过已包含我们按钮的元素
      if (element.querySelector('.netdisk-inline-btn, .netdisk-link-button, .netdisk-container') ||
          element.classList.contains('netdisk-container') ||
          element.classList.contains('netdisk-link-button') ||
          element.classList.contains('netdisk-inline-btn')) {
        element.dataset.netdiskChecked = 'true';
        return;
      }
      
      // 检查是否包含网盘URL的纯文本
      const text = element.innerText;
      if (!text) {
        element.dataset.netdiskChecked = 'true';
        return;
      }
      
      // 标记为已检查
      element.dataset.netdiskChecked = 'true';
      
      // 查找可能的纯文本URL
      for (const [key, diskInfo] of Object.entries(NETDISK_PATTERNS)) {
        // 百度网盘特殊处理
        if (key === 'baidu') {
          checkAndProcessPattern(element, NETDISK_PATTERNS.baidu.standardPattern, diskInfo, possiblePasswords, pageText);
          checkAndProcessPattern(element, NETDISK_PATTERNS.baidu.initPattern, diskInfo, possiblePasswords, pageText);
          continue;
        }
        
        // 其他网盘
        checkAndProcessPattern(element, diskInfo.pattern, diskInfo, possiblePasswords, pageText);
      }
    });
  });
}

/**
 * 检查并处理元素中的网盘URL模式
 */
function checkAndProcessPattern(element, pattern, diskInfo, possiblePasswords, pageText) {
  // 如果元素本身或其内部已经包含我们的按钮，则跳过处理
  if (element.querySelector('.netdisk-inline-btn, .netdisk-link-button, .netdisk-container')) {
    return;
  }
  
  const html = element.innerHTML;
  if (!html) return;
  
  // 检查HTML是否包含按钮或处理过的标记
  if (html.includes('netdisk-link-button') || 
      html.includes('netdisk-inline-btn') || 
      html.includes('netdisk-container')) {
    return;
  }
  
  // 使用正则表达式查找所有匹配项
  const globalPattern = new RegExp(pattern.source, 'g');
  let match;
  
  // 收集所有匹配项
  const matches = [];
  while ((match = globalPattern.exec(html)) !== null) {
    // 避免匹配HTML标签内的内容
    const prevChar = html.charAt(Math.max(0, match.index - 1));
    const nextChar = html.charAt(match.index + match[0].length);
    if (prevChar === '"' || prevChar === "'" || nextChar === '"' || nextChar === "'") {
      continue; // 可能是HTML属性值，跳过
    }
    
    // 检查这个匹配是否已经在链接标签内或是HTML标签的一部分
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html.substring(Math.max(0, match.index - 50), 
                                       Math.min(html.length, match.index + match[0].length + 50));
    
    // 如果匹配在任何HTML标签内或是我们的按钮，则跳过
    if (tempDiv.querySelector('a, button, .netdisk-inline-btn, [data-netdisk-checked="true"]')) {
      continue;
    }
    
    // 检查是否匹配到了HTML标签
    if (match[0].includes('<') || match[0].includes('>')) {
      continue; // 可能是HTML标签，跳过
    }
    
    matches.push({
      url: match[0],
      index: match.index,
      length: match[0].length,
      // 对于百度网盘初始化模式，可能包含密码
      password: match[2] || null
    });
  }
  
  // 没有找到匹配，直接返回
  if (matches.length === 0) return;
  
  // 从后往前处理，这样索引不会受影响
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    
    // 标准化URL
    const normalizedUrl = normalizeNetDiskUrl(match.url);
    
    // 检查是否已经处理过
    if (foundLinks.has(normalizedUrl)) {
      const existingInfo = foundLinks.get(normalizedUrl);
      if (existingInfo.processed) continue;
    }
    
    // 创建链接信息
    const linkInfo = {
      url: match.url,
      normalizedUrl: normalizedUrl,
      type: diskInfo.type,
      name: diskInfo.name,
      password: match.password || findPasswordForLink(normalizedUrl, pageText, possiblePasswords),
      processed: false
    };
    
    // 保存链接信息
    foundLinks.set(normalizedUrl, linkInfo);
    
    // 替换HTML中的URL文本为按钮
    const beforeHtml = html.substring(0, match.index);
    const afterHtml = html.substring(match.index + match.length);
    
    const buttonHtml = `<span class="netdisk-inline-btn" data-netdisk-processed="true">
      <button class="netdisk-link-button ${linkInfo.type}" 
        data-url="${encodeURIComponent(match.url)}" 
        data-type="${linkInfo.type}" 
        ${linkInfo.password ? `data-password="${linkInfo.password}"` : ''}>
        一键访问${linkInfo.name}
      </button>
      <span class="netdisk-points-info" style="font-size:12px;" data-netdisk-checked="true">消耗1积分 (剩余: ${userPoints})</span>
    </span>`;
    
    element.innerHTML = beforeHtml + buttonHtml + afterHtml;
    
    // 标记元素为已处理
    element.dataset.netdiskChecked = "true";
    
    // 查找并添加事件处理
    const buttons = element.querySelectorAll('button.netdisk-link-button');
    buttons.forEach(button => {
      if (!button.hasEventListener) {
        button.addEventListener('click', handleButtonClick);
        button.hasEventListener = true;
      }
    });
    
    // 标记为已处理
    linkInfo.processed = true;
    foundLinks.set(normalizedUrl, linkInfo);
    
    // 向服务器提交链接
    if (settings.autoSubmit) {
      submitFoundLink(linkInfo);
    }
  }
}

/**
 * 替换链接为一键免密访问按钮
 */
function replaceWithAccessButton(linkElement, diskInfo) {
  // 检查链接是否已经被替换
  if (linkElement.classList.contains('netdisk-processed')) {
    return;
  }
  
  // 确保有标准化URL
  const normalizedUrl = diskInfo.normalizedUrl || normalizeNetDiskUrl(diskInfo.url);
  
  // 再次检查是否已经处理过（可能在其他位置已经替换过）
  if (foundLinks.has(normalizedUrl)) {
    const existingInfo = foundLinks.get(normalizedUrl);
    if (existingInfo.processed) {
      // 已经在别处处理过，只需隐藏当前元素
      linkElement.classList.add('netdisk-processed');
      linkElement.style.display = 'none';
      return;
    }
  }
  
  // 创建容器
  const container = document.createElement('div');
  container.className = 'netdisk-container';
  
  // 创建按钮
  const button = document.createElement('button');
  button.className = `netdisk-link-button with-icon ${diskInfo.type}`;
  button.textContent = `一键访问${diskInfo.name}`;
  button.dataset.url = diskInfo.url;
  button.dataset.type = diskInfo.type;
  if (diskInfo.password) {
    button.dataset.password = diskInfo.password;
  }
  
  // 添加图标
  const icon = document.createElement('span');
  icon.className = `netdisk-button-icon ${diskInfo.type}-icon`;
  button.appendChild(icon);
  
  // 添加点击事件
  button.addEventListener('click', handleButtonClick);
  
  // 添加积分提示
  const pointsInfo = document.createElement('span');
  pointsInfo.className = 'netdisk-points-info';
  pointsInfo.textContent = `消耗1积分 (剩余: ${userPoints})`;
  
  // 替换原始链接
  container.appendChild(button);
  container.appendChild(pointsInfo);
  
  linkElement.parentNode.insertBefore(container, linkElement);
  linkElement.classList.add('netdisk-processed');
  linkElement.style.display = 'none';
  
  // 更新foundLinks记录（使用标准化URL）
  diskInfo.processed = true;
  diskInfo.normalizedUrl = normalizedUrl;
  foundLinks.set(normalizedUrl, diskInfo);
  
  // 如果设置了自动提交，则提交发现的链接
  if (settings.autoSubmit) {
    submitFoundLink(diskInfo);
  }
}

/**
 * 处理一键访问按钮点击事件
 */
async function handleButtonClick(event) {
  event.preventDefault();
  
  const button = event.currentTarget;
  let url = button.dataset.url;
  const password = button.dataset.password || null;

  // 解码URL（如果被编码过）
  try {
    if (url.includes('%')) {
      url = decodeURIComponent(url);
    }
  } catch (e) {
    console.error('URL解码失败:', e);
    // 继续使用原始URL
  }

  if (!url) {
    alert('链接错误，请刷新页面重试。');
    return;
  }
  
  // 标准化URL用于查找
  const normalizedUrl = normalizeNetDiskUrl(url);
  
  try {
    // 如果已有密码，直接使用（不消耗积分）
    if (password) {
      button.classList.add('loading');
      button.innerHTML = `<span class="loading-spinner"></span> 处理中...`;
      
      // 直接跳转到网盘页面，不消耗积分
      openNetDiskWithPassword(url, password);
      
      // 设置一个超时，确保按钮状态能够恢复
      setTimeout(() => {
        resetAllRelatedButtons(url, normalizedUrl);
      }, 2000);
      
      return;
    }
    
    // 检查是否在离线模式
    if (settings.offlineMode) {
      window.open(url, '_blank');
      return;
    }
    
    // 需要从服务器获取密码，创建中间跳转页面
    button.classList.add('loading');
    button.innerHTML = `<span class="loading-spinner"></span> 获取密码中...`;
    button.disabled = true;
    
    // 设置一个超时计时器，如果请求时间过长，自动恢复按钮状态
    const buttonRecoveryTimeout = setTimeout(() => {
      resetAllRelatedButtons(url, normalizedUrl);
    }, 30000); // 30秒后自动恢复，避免按钮永久停留在加载状态
    
    // 创建并显示中间跳转页面
    showTransitionPage(url, normalizedUrl);
    
    // 成功显示跳转页面后清除超时
    clearTimeout(buttonRecoveryTimeout);
  } catch (error) {
    console.error('处理点击出错:', error);
    alert('操作失败，请稍后再试。');
    
    // 恢复按钮状态
    resetAllRelatedButtons(url, normalizedUrl);
  }
}

/**
 * 显示中间跳转页面，用于密码获取和跳转
 */
function showTransitionPage(url, normalizedUrl) {
  // 创建半透明遮罩
  const overlay = document.createElement('div');
  overlay.className = 'netdisk-transition-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  overlay.style.zIndex = '9999999';
  overlay.style.display = 'flex';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  
  // 创建跳转页面容器
  const container = document.createElement('div');
  container.className = 'netdisk-transition-container';
  container.style.backgroundColor = 'white';
  container.style.borderRadius = '8px';
  container.style.padding = '20px';
  container.style.width = '400px';
  container.style.maxWidth = '90%';
  container.style.textAlign = 'center';
  container.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
  
  // 标题
  const title = document.createElement('h2');
  title.textContent = '正在获取网盘密码';
  title.style.margin = '0 0 20px 0';
  title.style.color = '#2196F3';
  
  // 加载动画
  const loader = document.createElement('div');
  loader.className = 'netdisk-loader';
  loader.style.margin = '20px auto';
  loader.style.border = '5px solid #f3f3f3';
  loader.style.borderTop = '5px solid #2196F3';
  loader.style.borderRadius = '50%';
  loader.style.width = '50px';
  loader.style.height = '50px';
  loader.style.animation = 'netdisk-spin 2s linear infinite';
  
  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes netdisk-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  
  // 状态信息
  const status = document.createElement('p');
  status.textContent = '正在从服务器获取密码...';
  status.style.margin = '20px 0';
  
  // 点数信息
  const pointsInfo = document.createElement('p');
  pointsInfo.textContent = `本次操作将消耗1积分 (当前剩余: ${userPoints})`;
  pointsInfo.style.fontSize = '14px';
  pointsInfo.style.color = '#666';
  
  // 取消按钮
  const cancelButton = document.createElement('button');
  cancelButton.textContent = '取消';
  cancelButton.style.padding = '8px 16px';
  cancelButton.style.marginTop = '20px';
  cancelButton.style.border = 'none';
  cancelButton.style.borderRadius = '4px';
  cancelButton.style.backgroundColor = '#f44336';
  cancelButton.style.color = 'white';
  cancelButton.style.cursor = 'pointer';
  
  // 组装页面
  container.appendChild(title);
  container.appendChild(loader);
  container.appendChild(status);
  container.appendChild(pointsInfo);
  container.appendChild(cancelButton);
  overlay.appendChild(container);
  document.head.appendChild(style);
  document.body.appendChild(overlay);
  
  // 取消按钮事件
  cancelButton.addEventListener('click', () => {
    // 恢复所有按钮状态
    resetAllRelatedButtons(url, normalizedUrl);
    
    try {
      document.body.removeChild(overlay);
    } catch (e) {
      console.log('遮罩已被移除');
    }
  });
  
  // 调用API获取密码
  getPasswordAndRedirect(url, normalizedUrl, overlay, status);
}

/**
 * 获取密码并重定向到网盘
 */
async function getPasswordAndRedirect(url, normalizedUrl, overlay, statusElement) {
  try {
    // 向服务器请求密码
    const response = await window.sendToBackground({
      action: 'getPassword',
      url: url
    });
    
    if (response && response.success && response.password) {
      // 更新状态
      statusElement.textContent = '密码获取成功，即将跳转...';
      
      // 消耗积分
      await consumePoints();
      
      // 先恢复页面上所有相关按钮状态
      resetAllRelatedButtons(url, normalizedUrl);
      
      // 延迟一会再跳转，让用户看到成功信息
      setTimeout(() => {
        try {
          document.body.removeChild(overlay);
        } catch (e) {
          console.log('遮罩已被移除');
        }
        openNetDiskWithPassword(url, response.password);
      }, 1000);
    } else {
      // 更新状态
      statusElement.textContent = '未找到此链接的密码，即将跳转到网盘页面...';
      
      // 先恢复页面上所有相关按钮状态
      resetAllRelatedButtons(url, normalizedUrl);
      
      // 延迟跳转
      setTimeout(() => {
        try {
          document.body.removeChild(overlay);
        } catch (e) {
          console.log('遮罩已被移除');
        }
        window.open(url, '_blank');
      }, 1500);
    }
  } catch (error) {
    console.error('获取密码失败:', error);
    statusElement.textContent = '获取密码失败，请稍后重试。';
    
    // 添加重试按钮
    const retryButton = document.createElement('button');
    retryButton.textContent = '重试';
    retryButton.style.padding = '8px 16px';
    retryButton.style.margin = '10px 5px';
    retryButton.style.border = 'none';
    retryButton.style.borderRadius = '4px';
    retryButton.style.backgroundColor = '#2196F3';
    retryButton.style.color = 'white';
    retryButton.style.cursor = 'pointer';
    
    // 直接访问按钮
    const directButton = document.createElement('button');
    directButton.textContent = '直接访问';
    directButton.style.padding = '8px 16px';
    directButton.style.margin = '10px 5px';
    directButton.style.border = 'none';
    directButton.style.borderRadius = '4px';
    directButton.style.backgroundColor = '#4CAF50';
    directButton.style.color = 'white';
    directButton.style.cursor = 'pointer';
    
    // 添加按钮
    const buttonContainer = document.createElement('div');
    buttonContainer.appendChild(retryButton);
    buttonContainer.appendChild(directButton);
    
    // 找到取消按钮并在它前面插入按钮容器
    const cancelButton = overlay.querySelector('button');
    cancelButton.parentNode.insertBefore(buttonContainer, cancelButton);
    
    // 重试按钮事件
    retryButton.addEventListener('click', () => {
      // 移除错误信息和按钮
      statusElement.textContent = '重新尝试获取密码...';
      buttonContainer.remove();
      
      // 重新获取密码
      getPasswordAndRedirect(url, normalizedUrl, overlay, statusElement);
    });
    
    // 直接访问按钮事件
    directButton.addEventListener('click', () => {
      // 恢复所有按钮状态
      resetAllRelatedButtons(url, normalizedUrl);
      
      try {
        document.body.removeChild(overlay);
      } catch (e) {
        console.log('遮罩已被移除');
      }
      window.open(url, '_blank');
    });
  }
}

/**
 * 重置页面上所有与指定URL相关的按钮状态
 */
function resetAllRelatedButtons(url, normalizedUrl) {
  try {
    // 查找所有相关按钮并重置状态
    const encodedUrl = encodeURIComponent(url);
    const buttons = document.querySelectorAll(`button[data-url="${url}"], button[data-url="${encodedUrl}"]`);
    
    buttons.forEach(button => {
      const diskInfo = foundLinks.get(normalizedUrl) || foundLinks.get(url);
      const icon = diskInfo ? `<span class="netdisk-button-icon ${diskInfo.type}-icon"></span>` : '';
      button.classList.remove('loading');
      button.innerHTML = `${icon}一键访问${diskInfo ? diskInfo.name : '网盘'}`;
      button.disabled = false;
    });
    
    // 特殊情况：处理浏览器关闭页面事件
    window.addEventListener('beforeunload', function() {
      resetAllRelatedButtons(url, normalizedUrl);
    }, { once: true });
  } catch (e) {
    console.error('重置按钮状态出错:', e);
  }
}

/**
 * 消耗积分
 */
async function consumePoints() {
  userPoints = Math.max(0, userPoints - 1);
  
  // 更新所有积分显示
  document.querySelectorAll('.netdisk-points-info').forEach(el => {
    el.textContent = `消耗1积分 (剩余: ${userPoints})`;
  });
  
  // 通知后台更新积分
  try {
    await window.sendToBackground({ action: 'updatePoints' });
  } catch (error) {
    console.warn('通知后台更新积分失败:', error);
  }
}

/**
 * 使用密码打开网盘链接
 */
function openNetDiskWithPassword(url, password) {
  // 对于百度网盘的 init 链接，直接添加密码参数
  if (url.includes('pan.baidu.com/share/init') && !url.includes('pwd=')) {
    const separator = url.includes('?') ? '&' : '?';
    const urlWithPassword = `${url}${separator}pwd=${password}`;
    window.open(urlWithPassword, '_blank');
    return;
  }
  
  // 对于阿里云盘链接，直接添加密码参数
  if ((url.includes('alipan.com/s/') || url.includes('aliyundrive.com/s/')) && !url.includes('pwd=')) {
    const separator = url.includes('?') ? '&' : '?';
    const urlWithPassword = `${url}${separator}pwd=${password}`;
    window.open(urlWithPassword, '_blank');
    return;
  }
  
  // 对于123盘链接，直接添加密码参数
  if ((url.includes('123pan.com/s/') || url.includes('123684.com/s/')) && !url.includes('pwd=')) {
    const separator = url.includes('?') ? '&' : '?';
    const urlWithPassword = `${url}${separator}pwd=${password}`;
    window.open(urlWithPassword, '_blank');
    return;
  }
  
  // 打开网盘链接并自动填充密码
  try {
    window.sendToBackground({
      action: 'executeScript',
      url: url,
      code: `
        setTimeout(() => {
          // 尝试适配不同网盘的密码输入框
          const inputSelectors = [
            '.input-box input',          // 百度网盘
            'input[id*="password"]',     // 阿里云盘
            'input[placeholder*="提取码"]', // 阿里云盘
            'input.share-password',      // 阿里云盘新版
            '.aliyun-password-input',    // 阿里云盘
            'input.pwd-input',           // 123盘
            'input#pwd',                 // 123盘
            'input[placeholder*="密码"]', // 123盘
            'input[name="extraction-code"]', // 123盘
            '.weiyun-password-input',    // 腾讯微云
            '.quark-password-input',     // 夸克网盘
            'input.password-input',      // 夸克网盘
            'input[placeholder*="密码"]',// 多种网盘通用
            '#pwd-input',                // 通用选择器
            'input[type="password"]'     // 通用选择器
          ];
          
          let input = null;
          for (const selector of inputSelectors) {
            input = document.querySelector(selector);
            if (input) break;
          }
          
          if (input) {
            input.value = '${password}';
            // 触发输入事件以确保输入被识别
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            
            // 尝试适配不同网盘的提交按钮
            const buttonSelectors = [
              '.input-box + .button',     // 百度网盘
              'button[class*="submit"]',  // 阿里云盘
              'button[class*="primary"]', // 阿里云盘新版
              'button.share-confirm',     // 阿里云盘
              '.pan123-submit-btn',       // 123盘
              'button.ant-btn-primary',   // 123盘
              'button[type="submit"]',    // 123盘
              'button:not([disabled])',   // 通用选择器(非禁用按钮)
              '.aliyun-submit-button',    // 阿里云盘
              '.weiyun-submit-button',    // 腾讯微云
              '.quark-confirm-button',    // 夸克网盘
              'button[type="submit"]',    // 通用选择器
              '.confirm-button',          // 通用选择器
              'button.primary'            // 夸克网盘
            ];
            
            let submitBtn = null;
            for (const selector of buttonSelectors) {
              submitBtn = document.querySelector(selector);
              if (submitBtn) break;
            }
            
            if (submitBtn) submitBtn.click();
          } else {
            // 如果找不到输入框，复制密码到剪贴板
            const textarea = document.createElement('textarea');
            textarea.value = '${password}';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            alert('已复制提取码: ${password}');
          }
        }, 1500);
      `
    }).catch(error => {
      console.warn('执行脚本失败:', error);
      // 失败时回退到简单打开方式
      copyToClipboard(password);
      alert(`密码 ${password} 已复制到剪贴板，即将打开网盘页面。`);
      window.open(url, '_blank');
    });
  } catch (error) {
    console.error('打开网盘出错:', error);
    // 出错时使用简单方式打开
    window.open(url, '_blank');
  }
}

/**
 * 复制文本到剪贴板
 */
function copyToClipboard(text) {
  const input = document.createElement('textarea');
  input.style.position = 'fixed';
  input.style.opacity = 0;
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
}

/**
 * 向服务器提交发现的链接
 */
async function submitFoundLink(diskInfo) {
  // 防止重复提交
  if (diskInfo.submitted) return;
  
  try {
    const linkData = {
      url: diskInfo.url,
      platform: diskInfo.type,
      password: diskInfo.password || ''
    };
    
    const response = await window.sendToBackground({
      action: 'submitLink',
      linkData: linkData
    });
    
    if (response && response.success) {
      // 标记为已提交
      diskInfo.submitted = true;
      foundLinks.set(diskInfo.url, diskInfo);
      console.log('链接提交成功:', diskInfo.url);
    }
  } catch (error) {
    console.error('提交链接出错:', error);
  }
}

/**
 * 监听DOM变化，检测新增的网盘链接
 */
function observeDOMChanges() {
  const observer = new MutationObserver(mutations => {
    let shouldScan = false;
    const addedNodes = [];
    
    for (const mutation of mutations) {
      // 如果是属性变化，检查是否为我们添加的属性
      if (mutation.type === 'attributes' && 
          (mutation.attributeName === 'data-netdisk-checked' || 
           mutation.attributeName === 'data-netdisk-processed' ||
           mutation.attributeName === 'class' && 
           mutation.target.classList.contains('netdisk-processed'))) {
        continue; // 忽略我们自己添加的属性变化
      }
      
      // 处理节点添加
      if (mutation.type === 'childList' && mutation.addedNodes.length) {
        for (const node of mutation.addedNodes) {
          // 忽略我们自己添加的网盘按钮和容器
          if (node.nodeType === Node.ELEMENT_NODE && 
              (node.classList.contains('netdisk-container') || 
               node.classList.contains('netdisk-link-button') || 
               node.classList.contains('netdisk-inline-btn') ||
               node.hasAttribute('data-netdisk-checked') ||
               node.hasAttribute('data-netdisk-processed'))) {
            continue;
          }
          
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 检查是否是我们自己生成的内容
            if (node.innerHTML && (
                node.innerHTML.includes('netdisk-container') || 
                node.innerHTML.includes('netdisk-link-button') || 
                node.innerHTML.includes('data-netdisk-processed'))) {
              continue;
            }
            
            // 收集添加的元素节点
            addedNodes.push(node);
            
            // 检查是否有新增的链接或文本内容
            if (node.tagName === 'A' || 
                node.querySelector('a:not(.netdisk-processed)') || 
                node.querySelector('pre:not([data-netdisk-checked]), code:not([data-netdisk-checked]), p:not([data-netdisk-checked]), div:not([data-netdisk-checked])') ||
                node.textContent.trim()) {
              shouldScan = true;
            }
          } else if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()) {
            // 只有当文本可能包含URL时才考虑扫描
            const text = node.nodeValue.trim();
            if (text.length > 10 && 
                (text.includes('http') || 
                 text.includes('pan.baidu.com') || 
                 text.toLowerCase().includes('网盘'))) {
              shouldScan = true;
              addedNodes.push(node);
            }
          }
        }
      }
      
      // 处理内容修改的文本节点
      if (mutation.type === 'characterData' && 
          mutation.target.nodeType === Node.TEXT_NODE && 
          mutation.target.nodeValue.trim()) {
        // 检查父节点是否已处理
        const parentNode = mutation.target.parentNode;
        if (parentNode && 
            (parentNode.hasAttribute('data-netdisk-checked') || 
             parentNode.classList.contains('netdisk-processed'))) {
          continue;
        }
        
        // 只有当文本可能包含URL时才考虑扫描
        const text = mutation.target.nodeValue.trim();
        if (text.length > 10 && 
            (text.includes('http') || 
             text.includes('pan.baidu.com') || 
             text.toLowerCase().includes('网盘'))) {
          shouldScan = true;
        }
      }
      
      if (shouldScan) break;
    }
    
    if (shouldScan) {
      // 如果有新添加的节点，只扫描这些节点
      if (addedNodes.length > 0) {
        // 过滤掉已经处理过的节点
        const filteredNodes = addedNodes.filter(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            return !(node.hasAttribute('data-netdisk-checked') || 
                    node.classList.contains('netdisk-processed'));
          }
          return true; // 保留文本节点
        });
        
        if (filteredNodes.length === 0) return; // 没有需要处理的节点
        
        // 为新节点单独扫描文本节点
        const textNodes = [];
        filteredNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            textNodes.push(node);
          } else {
            const nodeTextNodes = getTextNodes(node);
            textNodes.push(...nodeTextNodes);
          }
        });
        
        if (textNodes.length > 0) {
          const pageText = textNodes.map(node => node.nodeValue).join(' ');
          const possiblePasswords = extractPossiblePasswords(pageText);
          
          // 处理新添加节点中的链接和纯文本URL
          filteredNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              findAndProcessLinks(node, possiblePasswords, pageText);
            }
          });
          
          // 只处理新的文本节点
          findAndProcessTextUrls(textNodes, possiblePasswords, pageText);
        }
      } else {
        // 延迟执行完整扫描，避免多次触发
        clearTimeout(window.scanTimeout);
        window.scanTimeout = setTimeout(scanPage, 500);
      }
    }
  });
  
  // 配置观察选项
  const config = { 
    childList: true, 
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['href', 'data-netdisk-checked'] // 只关注相关属性变化
  };
  
  // 开始观察
  observer.observe(document.body, config);
}

/**
 * 监听来自后台脚本的消息
 */
function listenForMessages() {
  // 使用window.addEventListener监听来自content-script-loader的消息
  window.addEventListener('message', event => {
    // 确保消息来自当前窗口且格式正确
    if (event.source !== window || 
        !event.data || 
        !event.data.type || 
        !event.data.type.startsWith('NETDISK_')) {
      return;
    }
    
    // 处理来自content-script-loader的消息
    if (event.data.type === 'NETDISK_CONTENT_MESSAGE') {
      const message = event.data.payload;
      let response = { received: true };
      
      try {
        // 根据消息类型执行不同操作
        switch (message.action) {
          case 'updatePoints':
            if (message.points !== undefined) {
              userPoints = message.points;
              
              // 更新所有积分显示
              document.querySelectorAll('.netdisk-points-info').forEach(el => {
                el.textContent = `消耗1积分 (剩余: ${userPoints})`;
              });
              response = { success: true };
            }
            break;
            
          case 'getPageLinks':
            // 返回页面中发现的所有网盘链接
            response = {
              links: Array.from(foundLinks.values())
            };
            break;
            
          case 'settingsUpdated':
            // 更新设置
            if (message.settings) {
              settings = message.settings;
              // 如果启用了自动替换，重新扫描页面
              if (settings.autoReplace) {
                scanPage();
              }
              response = { success: true };
            }
            break;
            
          case 'pageLoaded':
            // 页面加载完成，扫描链接
            scanPage();
            response = { success: true };
            break;
            
          case 'tabActivated':
            // 标签页激活，可以执行一些操作
            checkCurrentPageUrl();
            response = { success: true };
            break;
            
          case 'checkCurrentPage':
            // 重新检查当前页面URL
            checkCurrentPageUrl();
            response = { success: true };
            break;
            
          case 'checkScriptLoaded':
            // 检查脚本是否已加载
            response = { loaded: true };
            break;
            
          default:
            response = { success: false, message: '未知操作' };
        }
      } catch (error) {
        console.error('处理消息出错:', error);
        response = { 
          success: false, 
          error: true, 
          message: error.message || '处理消息时出错' 
        };
      }
      
      // 发送响应
      window.postMessage({
        type: 'NETDISK_CONTENT_RESPONSE',
        forAction: message.action,
        response: response
      }, '*');
    }
  });
  
  // 提供通过背景脚本发送消息的辅助函数
  window.sendToBackground = function(message) {
    return new Promise((resolve, reject) => {
      const requestId = Date.now() + Math.random().toString(36).substr(2, 9);
      
      // 创建消息监听器
      const messageListener = function(event) {
        if (event.source !== window || 
            !event.data || 
            event.data.type !== 'NETDISK_BACKGROUND_RESPONSE' || 
            event.data.requestId !== requestId) {
          return;
        }
        
        // 收到响应，移除监听器
        window.removeEventListener('message', messageListener);
        
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data.response);
        }
      };
      
      // 添加监听器
      window.addEventListener('message', messageListener);
      
      // 设置超时
      setTimeout(() => {
        window.removeEventListener('message', messageListener);
        reject(new Error('发送消息超时'));
      }, 5000);
      
      // 发送消息到content-script-loader
      window.postMessage({
        type: 'NETDISK_BACKGROUND_REQUEST',
        requestId: requestId,
        payload: message
      }, '*');
    });
  };
}

/**
 * 查找和处理文本节点中的网盘链接URL
 * @param {Array} textNodes - 文本节点列表
 * @param {Array} possiblePasswords - 可能的密码列表
 * @param {string} pageText - 整个页面的文本
 */
function findAndProcessTextUrls(textNodes, possiblePasswords, pageText) {
  // 遍历所有文本节点
  for (const node of textNodes) {
    const text = node.nodeValue;
    if (!text || text.trim().length < 10) continue; // 忽略太短的文本
    
    // 对每种网盘类型检查
    for (const [key, diskInfo] of Object.entries(NETDISK_PATTERNS)) {
      // 百度网盘需要特殊处理，因为有两种模式
      if (key === 'baidu') {
        // 检查标准模式
        const standardMatches = extractUrlsFromText(text, NETDISK_PATTERNS.baidu.standardPattern);
        processTextMatches(standardMatches, diskInfo, node, possiblePasswords, pageText);
        
        // 检查初始化模式
        const initMatches = extractUrlsFromText(text, NETDISK_PATTERNS.baidu.initPattern);
        processTextMatches(initMatches, diskInfo, node, possiblePasswords, pageText);
        
        continue;
      }
      
      // 其他网盘类型
      const pattern = diskInfo.pattern;
      const matches = extractUrlsFromText(text, pattern);
      processTextMatches(matches, diskInfo, node, possiblePasswords, pageText);
    }
  }
}

/**
 * 从文本中提取所有匹配的URL
 * @param {string} text - 要搜索的文本
 * @param {RegExp} pattern - 匹配模式
 * @returns {Array} 匹配的URL数组
 */
function extractUrlsFromText(text, pattern) {
  const matches = [];
  const globalPattern = new RegExp(pattern.source, 'g');
  let match;
  
  while ((match = globalPattern.exec(text)) !== null) {
    matches.push({
      url: match[0],
      code: match[1],
      password: match[2] || null, // 支持初始化模式可能包含的密码
      index: match.index,
      length: match[0].length
    });
  }
  
  return matches;
}

/**
 * 处理文本匹配的结果
 */
function processTextMatches(matches, diskInfo, node, possiblePasswords, pageText) {
  if (!matches.length) return;
  
  // 确保当前节点有效
  if (!node.parentNode) return;
  
  // 如果网盘类型在设置中被禁用，则忽略
  if (!isNetDiskTypeEnabled(diskInfo.type, settings)) return;
  
  // 处理每个匹配
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    
    // 标准化URL以防止重复
    const normalizedUrl = normalizeNetDiskUrl(match.url);
    
    // 检查是否已经处理过这个URL（使用标准化后的URL）
    if (foundLinks.has(normalizedUrl)) {
      const existingLink = foundLinks.get(normalizedUrl);
      if (existingLink.processed) continue;
    }
    
    // 为这个链接找到最可能的密码
    let password = match.password; // 如果URL中包含密码，优先使用
    if (!password) {
      password = findPasswordForLink(normalizedUrl, pageText, possiblePasswords);
    }
    
    // 创建网盘信息对象
    const linkInfo = {
      url: match.url,          // 保留原始URL用于替换
      normalizedUrl: normalizedUrl, // 添加标准化URL用于查找
      type: diskInfo.type,
      name: diskInfo.name,
      password: password,
      processed: false         // 标记是否已处理
    };
    
    // 保存到发现的链接集合中（使用标准化的URL作为键）
    foundLinks.set(normalizedUrl, linkInfo);
    
    // 替换文本节点中的URL为按钮
    replaceTextNodeUrl(node, match.index, match.length, linkInfo);
  }
}

/**
 * 替换文本节点中的URL为按钮
 */
function replaceTextNodeUrl(textNode, startIndex, length, linkInfo) {
  const parentNode = textNode.parentNode;
  
  // 确保有标准化URL
  const normalizedUrl = linkInfo.normalizedUrl || normalizeNetDiskUrl(linkInfo.url);
  
  // 再次检查是否已经在其他地方处理过这个URL
  if (foundLinks.has(normalizedUrl)) {
    const existingInfo = foundLinks.get(normalizedUrl);
    if (existingInfo.processed) {
      // 已在其他地方处理过，只替换文本，不添加按钮
      const text = textNode.nodeValue;
      parentNode.removeChild(textNode);
      parentNode.appendChild(document.createTextNode(text));
      return;
    }
  }
  
  // 创建三段:前文本、链接按钮、后文本
  const text = textNode.nodeValue;
  const beforeText = text.substring(0, startIndex);
  const urlText = text.substring(startIndex, startIndex + length);
  const afterText = text.substring(startIndex + length);
  
  // 移除原始文本节点
  parentNode.removeChild(textNode);
  
  // 添加前文本
  if (beforeText) {
    parentNode.appendChild(document.createTextNode(beforeText));
  }
  
  // 创建容器
  const container = document.createElement('div');
  container.className = 'netdisk-container inline';
  
  // 创建按钮
  const button = document.createElement('button');
  button.className = `netdisk-link-button with-icon ${linkInfo.type}`;
  button.textContent = `一键访问${linkInfo.name}`;
  button.dataset.url = linkInfo.url;
  button.dataset.type = linkInfo.type;
  if (linkInfo.password) {
    button.dataset.password = linkInfo.password;
  }
  
  // 添加图标
  const icon = document.createElement('span');
  icon.className = `netdisk-button-icon ${linkInfo.type}-icon`;
  button.appendChild(icon);
  
  // 添加点击事件
  button.addEventListener('click', handleButtonClick);
  
  // 添加积分提示
  const pointsInfo = document.createElement('span');
  pointsInfo.className = 'netdisk-points-info';
  pointsInfo.textContent = `消耗1积分 (剩余: ${userPoints})`;
  
  // 添加到容器
  container.appendChild(button);
  container.appendChild(pointsInfo);
  parentNode.appendChild(container);
  
  // 添加后文本
  if (afterText) {
    parentNode.appendChild(document.createTextNode(afterText));
  }
  
  // 标记链接为已处理
  linkInfo.processed = true;
  foundLinks.set(normalizedUrl, linkInfo);
  
  // 向服务器提交发现的链接
  if (settings.autoSubmit) {
    submitFoundLink(linkInfo);
  }
}

/**
 * 标准化网盘URL，确保相同的链接具有相同的标识
 */
function normalizeNetDiskUrl(url) {
  if (!url) return url;
  
  try {
    // 移除URL末尾的斜杠
    url = url.replace(/\/+$/, '');
    
    // 百度网盘链接特殊处理
    if (url.includes('pan.baidu.com')) {
      // 提取关键部分：分享ID和密码
      let shareId = '';
      let pwd = '';
      
      // 提取标准格式链接中的分享ID
      const standardMatch = url.match(/pan\.baidu\.com\/s\/([a-zA-Z0-9_-]+)/);
      if (standardMatch && standardMatch[1]) {
        shareId = standardMatch[1];
      }
      
      // 提取初始化格式链接中的分享ID
      const initMatch = url.match(/pan\.baidu\.com\/share\/init\?surl=([a-zA-Z0-9_-]+)/);
      if (initMatch && initMatch[1]) {
        shareId = initMatch[1];
      }
      
      // 提取密码参数
      const pwdMatch = url.match(/[?&]pwd=([^&]+)/);
      if (pwdMatch && pwdMatch[1]) {
        pwd = pwdMatch[1];
      }
      
      // 如果提取到了分享ID，创建标准格式
      if (shareId) {
        url = `https://pan.baidu.com/s/${shareId}`;
        if (pwd) {
          url += `?pwd=${pwd}`;
        }
      }
    }
    
    return url;
  } catch (e) {
    console.error('标准化URL失败:', e);
    return url;
  }
}

// 启动内容脚本
init(); 