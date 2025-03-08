// 后台服务脚本
// 负责与服务器通信、用户认证和积分管理

// 导入API通信模块
import {
  API_BASE_URL,
  initApiModule,
  getUserInfo,
  saveUserInfo,
  login,
  loginWithGitHub,
  logout,
  getUserPoints,
  submitLink,
  getLinkPassword,
  useLink,
  getLinkHistory
} from './utils/api.js';

/**
 * 初始化扩展
 */
async function initExtension() {
  console.log('网盘助手扩展已启动');
  
  // 初始化API模块，检查是否使用离线模式
  const isOfflineMode = await initApiModule();
  console.log('API模式:', isOfflineMode ? '离线模式' : '在线模式');
  
  // 检查用户是否已登录
  const userInfo = await getUserInfo();
  if (!userInfo) {
    console.log('用户未登录');
  } else {
    console.log('用户已登录:', userInfo.username, isOfflineMode ? '(离线模式)' : '');
    // 更新积分信息
    updateUserPoints();
  }
}

/**
 * 更新用户积分信息
 */
async function updateUserPoints() {
  try {
    const userInfo = await getUserInfo();
    if (!userInfo || !userInfo.token) {
      return;
    }
    
    const pointsData = await getUserPoints();
    if (pointsData && pointsData.points !== undefined) {
      // 更新存储中的积分信息
      userInfo.points = pointsData.points;
      await saveUserInfo(userInfo);
      
      // 向所有活动标签页广播积分更新
      const tabs = await chrome.tabs.query({});
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { 
          action: 'updatePoints', 
          points: pointsData.points 
        }).catch(() => {
          // 忽略无法发送消息的标签页
        });
      });
    }
  } catch (error) {
    console.error('更新积分失败:', error);
  }
}

/**
 * 执行脚本
 */
async function executeScript(tabId, code) {
  return new Promise((resolve, reject) => {
    chrome.tabs.executeScript(tabId, { code }, result => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 当页面加载完成时
  if (changeInfo.status === 'complete' && tab.url) {
    // 检查内容脚本状态
    checkContentScriptStatus(tabId, tab.url).then(status => {
      if (status.loaded) {
        // 向内容脚本发送页面加载完成的消息
        chrome.tabs.sendMessage(tabId, { action: 'pageLoaded', url: tab.url })
          .catch(() => {
            // 忽略无法发送消息的标签页（如未注入内容脚本的页面）
          });
      } else {
        console.log(`标签页 ${tabId} 的内容脚本状态:`, status);
      }
    }).catch(error => {
      console.warn(`检查标签页 ${tabId} 的内容脚本状态失败:`, error);
    });
  }
});

// 监听标签页激活事件
chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, tab => {
    if (tab.status === 'complete') {
      // 检查内容脚本状态
      checkContentScriptStatus(activeInfo.tabId, tab.url).then(status => {
        if (status.loaded) {
          // 通知内容脚本标签页被激活
          chrome.tabs.sendMessage(activeInfo.tabId, { action: 'tabActivated' })
            .catch(() => {
              // 忽略通信错误
            });
        }
      }).catch(() => {
        // 忽略检查错误
      });
    }
  });
});

// 检查内容脚本状态
async function checkContentScriptStatus(tabId, url) {
  // 如果不是http/https页面，跳过检查
  if (!url || !(url.startsWith('http://') || url.startsWith('https://'))) {
    return { loaded: false, reason: 'non-http-page' };
  }
  
  try {
    // 向内容脚本发送检查消息
    const response = await chrome.tabs.sendMessage(tabId, { action: 'checkScriptLoaded' });
    return response || { loaded: false, reason: 'no-response' };
  } catch (error) {
    return { loaded: false, error: error.message, reason: 'communication-error' };
  }
}

// 监听来自内容脚本的 contentScriptLoaded 消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'contentScriptLoaded' && sender.tab) {
    console.log(`内容脚本已在标签页 ${sender.tab.id} 加载`);
    // 可以在这里记录哪些标签页已加载了内容脚本
  }
});

// 监听来自内容脚本或弹出窗口的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 使用异步响应
  (async () => {
    try {
      switch (message.action) {
        case 'getUserInfo':
          sendResponse(await getUserInfo());
          break;
        
        case 'getSettings':
          const settings = await chrome.storage.local.get(['settings']);
          sendResponse({ success: true, settings: settings.settings || {} });
          break;
          
        case 'saveSettings':
          await chrome.storage.local.set({ settings: message.settings });
          sendResponse({ success: true });
          break;
        
        case 'login':
          const loginResult = await login(message.username, message.password);
          sendResponse(loginResult);
          break;
        
        case 'loginWithGitHub':
          const githubResult = await loginWithGitHub(message.code);
          sendResponse(githubResult);
          break;
        
        case 'logout':
          await logout();
          sendResponse({ success: true });
          break;
        
        case 'submitLink':
          const submitResult = await submitLink(message.linkData);
          sendResponse(submitResult);
          break;
        
        case 'useLink':
          const useResult = await useLink(message.linkId);
          sendResponse(useResult);
          break;
          
        case 'getPassword':
          const passwordResult = await getLinkPassword(message.url);
          sendResponse(passwordResult);
          break;
          
        case 'updatePoints':
          await updateUserPoints();
          sendResponse({ success: true });
          break;
          
        case 'executeScript':
          if (message.tabId) {
            const scriptResult = await executeScript(message.tabId, message.code);
            sendResponse({ success: true, result: scriptResult });
          } else if (message.url) {
            // 打开新标签页并执行脚本
            chrome.tabs.create({ url: message.url }, async tab => {
              // 等待页面加载完成再执行脚本
              chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
                if (updatedTabId === tab.id && changeInfo.status === 'complete') {
                  // 移除监听器
                  chrome.tabs.onUpdated.removeListener(listener);
                  
                  // 执行脚本
                  setTimeout(async () => {
                    try {
                      await executeScript(tab.id, message.code);
                    } catch (error) {
                      console.error('执行脚本出错:', error);
                    }
                  }, 500);
                }
              });
              
              sendResponse({ success: true });
            });
          }
          break;
          
        default:
          sendResponse({ success: false, message: '未知操作' });
      }
    } catch (error) {
      console.error('处理消息出错:', error);
      sendResponse({ success: false, message: '处理请求出错', error: error.message });
    }
  })();
  
  // 保持消息通道开启，以便异步发送响应
  return true;
});

// 初始化扩展
initExtension(); 