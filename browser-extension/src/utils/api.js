/**
 * API通信模块
 * 提供与共享管理系统后端通信的功能
 */

// 导入本地存储管理器
import * as LocalStorage from './localStorageManager.js';

// API基础URL
const API_BASE_URL = 'http://localhost:8080/api'; // 开发环境，生产环境需修改

// 默认使用离线模式
let useOfflineMode = true;

/**
 * 检查API是否可用
 * @returns {Promise<boolean>} API是否可用
 */
async function checkApiAvailability() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      // 设置较短的超时时间
      signal: AbortSignal.timeout(2000)
    });
    
    return response.ok;
  } catch (error) {
    console.warn('API服务不可用，将使用离线模式:', error.message);
    return false;
  }
}

/**
 * 初始化API模块
 */
async function initApiModule() {
  // 检查API是否可用
  useOfflineMode = !(await checkApiAvailability());
  
  if (useOfflineMode) {
    console.log('启用离线模式');
    // 初始化本地存储
    await LocalStorage.initLocalStorage();
  } else {
    console.log('使用在线模式');
  }
  
  return useOfflineMode;
}

/**
 * 发送API请求
 * @param {string} endpoint - API端点
 * @param {string} method - 请求方法（GET, POST等）
 * @param {object} data - 请求数据（用于POST, PUT等）
 * @param {boolean} requireAuth - 是否需要认证
 * @returns {Promise} - 返回请求结果的Promise
 */
async function sendRequest(endpoint, method = 'GET', data = null, requireAuth = true) {
  // 如果启用了离线模式，则不发送请求
  if (useOfflineMode) {
    throw new Error('当前处于离线模式，无法发送网络请求');
  }
  
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    // 如果需要认证，添加token
    if (requireAuth) {
      const userInfo = await getUserInfo();
      if (!userInfo || !userInfo.token) {
        throw new Error('用户未登录');
      }
      options.headers['Authorization'] = `Bearer ${userInfo.token}`;
    }
    
    // 添加请求体
    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }
    
    const response = await fetch(url, options);
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || '请求失败');
    }
    
    return result;
  } catch (error) {
    console.error('API请求出错:', error);
    throw error;
  }
}

/**
 * 获取用户信息
 * @returns {Promise<object|null>} - 用户信息或null
 */
async function getUserInfo() {
  try {
    if (useOfflineMode) {
      return await LocalStorage.getUserInfo();
    }
    
    const data = await chrome.storage.local.get(['userInfo']);
    return data.userInfo || null;
  } catch (error) {
    console.error('获取用户信息失败:', error);
    return null;
  }
}

/**
 * 保存用户信息
 * @param {object} userInfo - 用户信息对象
 * @returns {Promise} - 操作结果的Promise
 */
async function saveUserInfo(userInfo) {
  try {
    if (useOfflineMode) {
      return await LocalStorage.updateUserInfo(userInfo);
    }
    
    await chrome.storage.local.set({ userInfo });
    return true;
  } catch (error) {
    console.error('保存用户信息失败:', error);
    throw error;
  }
}

/**
 * 用户登录
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Promise} - 登录结果的Promise
 */
async function login(username, password) {
  try {
    if (useOfflineMode) {
      // 离线模式下，验证用户名密码为admin/admin时登录成功
      if (username === 'admin' && password === 'admin') {
        const userInfo = {
          username: '离线用户',
          points: 100,
          isLocal: true
        };
        
        await LocalStorage.updateUserInfo(userInfo);
        return {
          success: true,
          username: userInfo.username,
          points: userInfo.points
        };
      } else {
        throw new Error('用户名或密码错误');
      }
    }
    
    const result = await sendRequest('/auth/login', 'POST', { username, password }, false);
    
    if (result && result.token) {
      const userInfo = {
        username: result.username,
        points: result.points,
        token: result.token
      };
      
      await saveUserInfo(userInfo);
    }
    
    return result;
  } catch (error) {
    console.error('登录失败:', error);
    throw error;
  }
}

/**
 * 通过GitHub登录
 * @param {string} code - GitHub授权码
 * @returns {Promise} - 登录结果的Promise
 */
async function loginWithGitHub(code) {
  try {
    if (useOfflineMode) {
      throw new Error('离线模式下不支持GitHub登录');
    }
    
    const result = await sendRequest('/auth/github', 'POST', { code }, false);
    
    if (result && result.token) {
      const userInfo = {
        username: result.username,
        points: result.points,
        token: result.token
      };
      
      await saveUserInfo(userInfo);
    }
    
    return result;
  } catch (error) {
    console.error('GitHub登录失败:', error);
    throw error;
  }
}

/**
 * 用户登出
 */
async function logout() {
  try {
    if (useOfflineMode) {
      // 离线模式下直接移除用户信息
      await LocalStorage.updateUserInfo(null);
      return true;
    }
    
    await chrome.storage.local.remove(['userInfo']);
    return true;
  } catch (error) {
    console.error('登出失败:', error);
    throw error;
  }
}

/**
 * 获取用户积分
 * @returns {Promise} - 积分信息的Promise
 */
async function getUserPoints() {
  if (useOfflineMode) {
    const points = await LocalStorage.getPoints();
    return { points };
  }
  
  return sendRequest('/users/points');
}

/**
 * 提交网盘链接
 * @param {object} linkData - 链接数据
 * @returns {Promise} - 提交结果的Promise
 */
async function submitLink(linkData) {
  try {
    if (useOfflineMode) {
      const success = await LocalStorage.saveLink(linkData);
      return { 
        success, 
        message: success ? '链接已保存到本地' : '保存链接失败' 
      };
    }
    
    return sendRequest('/links', 'POST', linkData);
  } catch (error) {
    if (useOfflineMode) {
      // 在离线模式下尝试使用本地存储
      try {
        const success = await LocalStorage.saveLink(linkData);
        return { 
          success, 
          message: success ? '链接已保存到本地' : '保存链接失败' 
        };
      } catch (localError) {
        console.error('本地存储链接失败:', localError);
        throw localError;
      }
    } else {
      throw error;
    }
  }
}

/**
 * 获取特定URL的密码
 * @param {string} url - 网盘链接URL
 * @returns {Promise} - 包含密码的Promise
 */
async function getLinkPassword(url) {
  try {
    if (useOfflineMode) {
      const link = await LocalStorage.findLinkByUrl(url);
      if (link && link.password) {
        return { 
          success: true, 
          password: link.password 
        };
      } else {
        return { 
          success: false, 
          message: '未找到密码' 
        };
      }
    }
    
    const userInfo = await getUserInfo();
    const requireAuth = !!userInfo && !!userInfo.token;
    
    return sendRequest('/links/password', 'POST', { url }, requireAuth);
  } catch (error) {
    if (useOfflineMode) {
      // 已经在离线模式处理过了，可以直接抛出错误
      throw error;
    } else {
      // 在线模式失败时，尝试从本地存储获取
      try {
        const link = await LocalStorage.findLinkByUrl(url);
        if (link && link.password) {
          return { 
            success: true, 
            password: link.password 
          };
        } else {
          return { 
            success: false, 
            message: '未找到密码' 
          };
        }
      } catch (localError) {
        console.error('本地获取密码失败:', localError);
        throw localError;
      }
    }
  }
}

/**
 * 使用链接（消耗积分）
 * @param {string} linkId - 链接ID
 * @returns {Promise} - 操作结果的Promise
 */
async function useLink(linkId) {
  try {
    if (useOfflineMode) {
      const success = await LocalStorage.useLink(linkId);
      return { 
        success, 
        message: success ? '成功使用链接' : '使用链接失败' 
      };
    }
    
    return sendRequest(`/links/${linkId}/use`, 'POST');
  } catch (error) {
    if (useOfflineMode) {
      // 已经在离线模式处理过了
      throw error;
    } else {
      // 在线模式失败时，尝试本地记录
      try {
        const success = await LocalStorage.useLink(linkId);
        return { 
          success, 
          message: success ? '成功使用链接' : '使用链接失败' 
        };
      } catch (localError) {
        console.error('本地记录使用链接失败:', localError);
        throw localError;
      }
    }
  }
}

/**
 * 获取用户使用历史
 * @param {number} limit - 返回记录数量限制
 * @returns {Promise} - 历史记录的Promise
 */
async function getLinkHistory(limit = 20) {
  try {
    if (useOfflineMode) {
      const history = await LocalStorage.getHistory(limit);
      return { links: history };
    }
    
    return sendRequest(`/users/links/history?limit=${limit}`);
  } catch (error) {
    if (useOfflineMode) {
      // 已经在离线模式处理过了
      throw error;
    } else {
      // 在线模式失败时，尝试从本地获取
      try {
        const history = await LocalStorage.getHistory(limit);
        return { links: history };
      } catch (localError) {
        console.error('本地获取历史记录失败:', localError);
        throw localError;
      }
    }
  }
}

// 导出函数
export {
  API_BASE_URL,
  initApiModule,
  sendRequest,
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
}; 