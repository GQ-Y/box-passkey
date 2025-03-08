// 弹出窗口脚本

// API配置
const API_BASE_URL = 'http://localhost:8080/api'; // 开发环境API地址，生产环境应修改

// DOM元素
const elements = {
  // 标签页
  tabButtons: document.querySelectorAll('.tab-btn'),
  tabPanes: document.querySelectorAll('.tab-pane'),
  
  // 用户信息
  loginStatus: document.getElementById('login-status'),
  guestView: document.querySelector('.guest-view'),
  userView: document.querySelector('.user-view'),
  username: document.getElementById('username'),
  pointsValue: document.getElementById('points-value'),
  
  // 链接列表
  foundLinks: document.getElementById('found-links'),
  historyLinks: document.getElementById('history-links'),
  refreshLinks: document.getElementById('refresh-links'),
  refreshHistory: document.getElementById('refresh-history'),
  
  // 设置
  autoReplace: document.getElementById('auto-replace'),
  autoSubmit: document.getElementById('auto-submit'),
  offlineMode: document.getElementById('offline-mode'),
  baiduDrive: document.getElementById('baidu-drive'),
  aliyunDrive: document.getElementById('aliyun-drive'),
  quarkDrive: document.getElementById('quark-drive'),
  saveSettings: document.getElementById('save-settings'),
  
  // 登录模态框
  loginBtn: document.getElementById('login-btn'),
  loginModal: document.getElementById('login-modal'),
  closeBtn: document.querySelector('.close-btn'),
  githubLogin: document.getElementById('github-login'),
  loginForm: document.getElementById('login-form'),
  usernameInput: document.getElementById('username-input'),
  passwordInput: document.getElementById('password-input'),
  registerLink: document.getElementById('register-link')
};

// 当前活动标签页
let activeTab = 'links';
// 存储链接数据
let linksData = [];
let historyData = [];
// 用户数据
let userData = null;
// 页面设置
let settings = {
  autoReplace: true,
  autoSubmit: true,
  enabledPlatforms: {
    baidu: true,
    aliyun: true
  }
};

/**
 * 初始化弹出窗口
 */
async function init() {
  console.log('网盘助手弹出窗口已加载');
  
  // 检查API模式
  const apiStatus = await checkApiMode();
  if (apiStatus.offline) {
    // 添加离线模式提示
    showOfflineNotice();
  }
  
  // 加载用户信息
  await loadUserInfo();
  
  // 加载设置
  await loadSettings();
  
  // 加载当前页面的链接
  await loadPageLinks();
  
  // 加载历史记录
  if (userData) {
    await loadLinkHistory();
  }
  
  // 设置事件监听器
  setupEventListeners();
}

/**
 * 检查API模式
 */
async function checkApiMode() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(2000)
    });
    
    return { 
      offline: !response.ok,
      status: response.ok ? 'online' : 'offline'
    };
  } catch (error) {
    console.warn('API检查失败:', error.message);
    return { 
      offline: true,
      status: 'offline',
      error: error.message
    };
  }
}

/**
 * 显示离线模式提示
 */
function showOfflineNotice() {
  const container = document.querySelector('.container');
  
  const notice = document.createElement('div');
  notice.className = 'offline-notice';
  notice.innerHTML = `
    <span class="offline-icon">⚠️</span>
    <span class="offline-text">离线模式 - 数据仅保存在本地</span>
  `;
  
  container.insertBefore(notice, container.firstChild);
  
  // 添加样式
  const style = document.createElement('style');
  style.textContent = `
    .offline-notice {
      background-color: #FFF3CD;
      color: #856404;
      padding: 8px 15px;
      text-align: center;
      font-size: 13px;
      border-bottom: 1px solid #FFEEBA;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .offline-icon {
      margin-right: 8px;
    }
  `;
  document.head.appendChild(style);
}

/**
 * 加载用户信息
 */
async function loadUserInfo() {
  try {
    userData = await sendMessageToBackground({ action: 'getUserInfo' });
    
    if (userData) {
      elements.guestView.classList.add('hidden');
      elements.userView.classList.remove('hidden');
      elements.username.textContent = userData.username;
      elements.pointsValue.textContent = userData.points;
    } else {
      elements.guestView.classList.remove('hidden');
      elements.userView.classList.add('hidden');
    }
  } catch (error) {
    console.error('加载用户信息失败:', error);
  }
}

/**
 * 加载设置
 */
async function loadSettings() {
  try {
    // 检查chrome.storage是否可用
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      console.error('存储API不可用');
      return;
    }
    
    const storedSettings = await chrome.storage.local.get('settings');
    
    if (storedSettings && storedSettings.settings) {
      settings = storedSettings.settings;
      
      // 更新UI
      elements.autoReplace.checked = settings.autoReplace !== false;
      elements.autoSubmit.checked = settings.autoSubmit !== false;
      elements.offlineMode.checked = settings.offlineMode === true;
      elements.baiduDrive.checked = settings.enabledPlatforms && settings.enabledPlatforms.baidu !== false;
      elements.aliyunDrive.checked = settings.enabledPlatforms && settings.enabledPlatforms.aliyun !== false;
      elements.quarkDrive.checked = settings.enabledPlatforms && settings.enabledPlatforms.quark !== false;
    }
  } catch (error) {
    console.error('加载设置失败:', error);
    // 使用默认设置
    settings = {
      autoReplace: true,
      autoSubmit: true,
      offlineMode: false,
      enabledPlatforms: {
        baidu: true,
        aliyun: true,
        quark: true
      }
    };
    
    // 更新UI为默认值
    elements.autoReplace.checked = true;
    elements.autoSubmit.checked = true;
    elements.offlineMode.checked = false;
    elements.baiduDrive.checked = true;
    elements.aliyunDrive.checked = true;
    elements.quarkDrive.checked = true;
  }
}

/**
 * 加载当前页面的链接
 */
async function loadPageLinks() {
  try {
    // 获取当前活动标签页
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) return;
    
    const activeTab = tabs[0];
    
    // 检查当前URL是否支持扩展功能
    if (!activeTab.url || 
        activeTab.url.startsWith('chrome://') || 
        activeTab.url.startsWith('chrome-extension://') ||
        activeTab.url.startsWith('about:') ||
        activeTab.url.startsWith('edge://') ||
        activeTab.url.startsWith('brave://') ||
        activeTab.url.startsWith('file://')) {
      renderEmptyState(elements.foundLinks, '当前页面不支持', '请访问普通网页使用此功能');
      return;
    }
    
    // 首先，检查当前页面URL是否本身就是网盘链接
    const currentUrl = activeTab.url;
    let isCurrentPageNetDisk = false;
    
    // 检查标签页状态，确保页面已完全加载
    if (activeTab.status !== 'complete') {
      console.log('页面尚未完全加载，稍后重试');
      setTimeout(() => loadPageLinks(), 500);
      return;
    }
    
    try {
      // 向内容脚本请求链接数据
      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(
          activeTab.id,
          { action: 'getPageLinks' },
          (response) => {
            if (chrome.runtime.lastError) {
              // 处理可能的连接错误
              console.warn('发送消息时出错:', chrome.runtime.lastError.message);
              resolve({ links: [] });
            } else {
              resolve(response || { links: [] });
            }
          }
        );
        
        // 设置超时，防止长时间等待
        setTimeout(() => {
          resolve({ links: [] });
        }, 1000);
      });
      
      if (response && response.links) {
        linksData = response.links;
        
        // 检查响应中是否包含当前页面URL
        isCurrentPageNetDisk = linksData.some(link => link.url === currentUrl);
        
        renderLinksList(elements.foundLinks, linksData);
      } else {
        renderEmptyState(elements.foundLinks, '暂未发现网盘链接', '浏览包含网盘链接的网页后将自动收集');
      }
    } catch (innerError) {
      console.error('与内容脚本通信出错:', innerError);
      renderEmptyState(elements.foundLinks, '通信错误', '无法与页面脚本通信');
    }
    
    // 如果当前页面是网盘链接但不在链接数据中，刷新链接数据
    if (!isCurrentPageNetDisk && (
        currentUrl.includes('pan.baidu.com') || 
        currentUrl.includes('aliyundrive.com') || 
        currentUrl.includes('pan.quark.cn'))) {
      
      try {
        // 通知内容脚本重新检查当前页面
        chrome.tabs.sendMessage(
          activeTab.id,
          { action: 'checkCurrentPage' }
        );
        
        // 短暂延迟后重新加载链接
        setTimeout(() => loadPageLinks(), 800);
      } catch (checkError) {
        console.warn('通知内容脚本检查页面失败:', checkError);
      }
    }
  } catch (error) {
    console.error('加载页面链接失败:', error);
    // 显示错误信息
    renderEmptyState(elements.foundLinks, '无法获取链接', '请刷新页面后再试');
  }
}

/**
 * 加载链接历史
 */
async function loadLinkHistory() {
  try {
    if (!userData || !userData.token) {
      renderEmptyState(elements.historyLinks, '请先登录', '登录后查看您的使用历史');
      return;
    }
    
    const response = await fetch(`${API_BASE_URL}/users/links/history`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${userData.token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      historyData = data.links || [];
      renderHistoryList(elements.historyLinks, historyData);
    } else {
      throw new Error('获取历史记录失败');
    }
  } catch (error) {
    console.error('加载历史记录失败:', error);
    renderEmptyState(elements.historyLinks, '获取历史失败', '请稍后再试');
  }
}

/**
 * 渲染链接列表
 */
function renderLinksList(container, links) {
  if (!links || links.length === 0) {
    renderEmptyState(container, '暂未发现网盘链接', '浏览包含网盘链接的网页后将自动收集');
    return;
  }
  
  // 清空容器
  container.innerHTML = '';
  
  links.forEach(link => {
    const linkItem = document.createElement('div');
    linkItem.className = 'link-item';
    
    const platformType = getPlatformType(link.type);
    
    linkItem.innerHTML = `
      <div>
        <span class="link-type ${link.type}">${platformType}</span>
      </div>
      <div class="link-url">${link.url}</div>
      ${link.password ? `<div>密码: <span class="link-password">${link.password}</span></div>` : ''}
      <div class="link-actions">
        <button class="btn-copy" data-url="${link.url}" ${link.password ? `data-password="${link.password}"` : ''}>复制链接${link.password ? '和密码' : ''}</button>
        <button class="btn-use" data-url="${link.url}" ${link.password ? `data-password="${link.password}"` : ''}>使用</button>
      </div>
    `;
    
    // 添加按钮事件
    const copyBtn = linkItem.querySelector('.btn-copy');
    const useBtn = linkItem.querySelector('.btn-use');
    
    copyBtn.addEventListener('click', handleCopyLink);
    useBtn.addEventListener('click', handleUseLink);
    
    container.appendChild(linkItem);
  });
}

/**
 * 渲染历史列表
 */
function renderHistoryList(container, history) {
  if (!history || history.length === 0) {
    renderEmptyState(container, '暂无使用历史', '使用网盘链接后将显示在这里');
    return;
  }
  
  // 清空容器
  container.innerHTML = '';
  
  history.forEach(item => {
    const historyItem = document.createElement('div');
    historyItem.className = 'link-item';
    
    const platformType = getPlatformType(item.platform);
    const date = new Date(item.used_at).toLocaleString();
    
    historyItem.innerHTML = `
      <div>
        <span class="link-type ${item.platform}">${platformType}</span>
        <small>${date}</small>
      </div>
      <div class="link-url">${item.url}</div>
      ${item.password ? `<div>密码: <span class="link-password">${item.password}</span></div>` : ''}
      <div class="link-actions">
        <button class="btn-copy" data-url="${item.url}" ${item.password ? `data-password="${item.password}"` : ''}>复制链接${item.password ? '和密码' : ''}</button>
        <button class="btn-use" data-url="${item.url}" ${item.password ? `data-password="${item.password}"` : ''}>再次使用</button>
      </div>
    `;
    
    // 添加按钮事件
    const copyBtn = historyItem.querySelector('.btn-copy');
    const useBtn = historyItem.querySelector('.btn-use');
    
    copyBtn.addEventListener('click', handleCopyLink);
    useBtn.addEventListener('click', handleUseLink);
    
    container.appendChild(historyItem);
  });
}

/**
 * 渲染空状态
 */
function renderEmptyState(container, message, subMessage) {
  container.innerHTML = `
    <div class="empty-state">
      <p>${message}</p>
      <small>${subMessage}</small>
    </div>
  `;
}

/**
 * 获取平台类型名称
 */
function getPlatformType(type) {
  switch (type) {
    case 'baidu':
      return '百度网盘';
    case 'aliyun':
      return '阿里云盘';
    default:
      return '网盘链接';
  }
}

/**
 * 复制链接和密码
 */
function handleCopyLink(event) {
  const button = event.currentTarget;
  const url = button.dataset.url;
  const password = button.dataset.password;
  
  let textToCopy = url;
  if (password) {
    textToCopy += `\n提取码: ${password}`;
  }
  
  navigator.clipboard.writeText(textToCopy)
    .then(() => {
      const originalText = button.textContent;
      button.textContent = '已复制!';
      setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    })
    .catch(err => {
      console.error('复制失败:', err);
      alert('复制失败，请手动复制');
    });
}

/**
 * 使用链接
 */
async function handleUseLink(event) {
  const button = event.currentTarget;
  const url = button.dataset.url;
  const password = button.dataset.password;
  
  // 检查用户是否登录
  if (!userData) {
    alert('请先登录后再使用此功能');
    showLoginModal();
    return;
  }
  
  // 检查积分是否足够
  if (userData.points < 1) {
    alert('您的积分不足，无法使用此功能。请通过分享网盘链接来获取积分。');
    return;
  }
  
  try {
    // 使用链接
    const response = await sendMessageToBackground({
      action: 'useLink',
      linkId: url // 这里使用URL作为临时ID，实际应用中应使用服务器分配的ID
    });
    
    if (response && response.success) {
      // 打开链接并填充密码
      useNetDiskLink(url, password);
      
      // 更新用户积分
      userData.points = Math.max(0, userData.points - 1);
      elements.pointsValue.textContent = userData.points;
      
      // 刷新历史
      await loadLinkHistory();
    } else {
      alert(response.message || '使用链接失败，请稍后再试');
    }
  } catch (error) {
    console.error('使用链接出错:', error);
    alert('操作失败，请稍后再试');
  }
}

/**
 * 使用网盘链接并填充密码
 */
function useNetDiskLink(url, password) {
  // 打开网盘链接
  chrome.tabs.create({ url }, tab => {
    if (password) {
      // 注入密码填充脚本
      setTimeout(() => {
        chrome.tabs.executeScript(tab.id, {
          code: `
            setTimeout(() => {
              const input = document.querySelector('.input-box input');
              if (input) {
                input.value = '${password}';
                const submitBtn = document.querySelector('.input-box + .button');
                if (submitBtn) submitBtn.click();
              }
            }, 1500);
          `
        });
      }, 500);
    }
  });
}

/**
 * 保存设置
 */
async function saveSettings() {
  settings = {
    autoReplace: elements.autoReplace.checked,
    autoSubmit: elements.autoSubmit.checked,
    offlineMode: elements.offlineMode.checked,
    enabledPlatforms: {
      baidu: elements.baiduDrive.checked,
      aliyun: elements.aliyunDrive.checked,
      quark: elements.quarkDrive.checked
    }
  };
  
  try {
    await chrome.storage.local.set({ settings });
    
    // 通知内容脚本设置已更新
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { 
        action: 'settingsUpdated', 
        settings 
      }).catch(() => {
        // 忽略无法发送消息的标签页
      });
    });
    
    // 离线模式提示
    if (settings.offlineMode) {
      alert('设置已保存。离线模式已开启，链接将直接打开而不消耗积分。');
    } else {
      alert('设置已保存');
    }
  } catch (error) {
    console.error('保存设置失败:', error);
    alert('保存设置失败，请稍后再试');
  }
}

/**
 * 显示登录模态框
 */
function showLoginModal() {
  elements.loginModal.classList.remove('hidden');
}

/**
 * 隐藏登录模态框
 */
function hideLoginModal() {
  elements.loginModal.classList.add('hidden');
}

/**
 * 处理登录表单提交
 */
async function handleLogin(event) {
  event.preventDefault();
  
  const username = elements.usernameInput.value.trim();
  const password = elements.passwordInput.value;
  
  if (!username || !password) {
    alert('请输入用户名和密码');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok && data.token) {
      // 保存用户信息
      userData = {
        username: data.username,
        points: data.points,
        token: data.token
      };
      
      await chrome.storage.local.set({ userInfo: userData });
      
      // 更新UI
      elements.guestView.classList.add('hidden');
      elements.userView.classList.remove('hidden');
      elements.username.textContent = userData.username;
      elements.pointsValue.textContent = userData.points;
      
      // 关闭模态框
      hideLoginModal();
      
      // 加载历史记录
      await loadLinkHistory();
    } else {
      alert(data.message || '登录失败，请检查用户名和密码');
    }
  } catch (error) {
    console.error('登录出错:', error);
    alert('登录失败，请稍后再试');
  }
}

/**
 * 处理GitHub登录
 */
function handleGitHubLogin() {
  // 在实际应用中，这里应该打开GitHub OAuth授权页面
  alert('GitHub登录功能尚未实现，请使用用户名和密码登录');
}

/**
 * 设置事件监听器
 */
function setupEventListeners() {
  // 标签页切换
  elements.tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      
      // 更新活动标签
      elements.tabButtons.forEach(btn => {
        btn.classList.remove('active');
      });
      button.classList.add('active');
      
      // 显示对应面板
      elements.tabPanes.forEach(pane => {
        pane.classList.remove('active');
      });
      document.getElementById(`${tab}-tab`).classList.add('active');
      
      activeTab = tab;
    });
  });
  
  // 刷新链接
  elements.refreshLinks.addEventListener('click', loadPageLinks);
  
  // 刷新历史
  elements.refreshHistory.addEventListener('click', loadLinkHistory);
  
  // 保存设置
  elements.saveSettings.addEventListener('click', saveSettings);
  
  // 登录按钮
  elements.loginBtn.addEventListener('click', showLoginModal);
  
  // 关闭登录模态框
  elements.closeBtn.addEventListener('click', hideLoginModal);
  
  // 点击模态框外部关闭
  elements.loginModal.addEventListener('click', event => {
    if (event.target === elements.loginModal) {
      hideLoginModal();
    }
  });
  
  // GitHub登录
  elements.githubLogin.addEventListener('click', handleGitHubLogin);
  
  // 登录表单提交
  elements.loginForm.addEventListener('submit', handleLogin);
  
  // 注册链接
  elements.registerLink.addEventListener('click', () => {
    alert('注册功能尚未实现，请直接登录');
  });
}

/**
 * 向后台脚本发送消息
 */
function sendMessageToBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

// 初始化弹出窗口
document.addEventListener('DOMContentLoaded', init); 