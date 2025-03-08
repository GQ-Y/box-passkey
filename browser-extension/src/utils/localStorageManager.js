/**
 * 本地存储管理器
 * 当服务器不可用时使用本地存储代替API
 */

// 存储键名
const STORAGE_KEYS = {
  LINKS: 'netdisk_links',
  HISTORY: 'netdisk_history',
  USER: 'netdisk_user',
  SETTINGS: 'netdisk_settings'
};

/**
 * 初始化本地存储
 */
async function initLocalStorage() {
  try {
    // 检查链接存储是否已初始化
    const data = await chrome.storage.local.get([STORAGE_KEYS.LINKS]);
    if (!data[STORAGE_KEYS.LINKS]) {
      await chrome.storage.local.set({ [STORAGE_KEYS.LINKS]: [] });
    }
    
    // 检查历史记录是否已初始化
    const historyData = await chrome.storage.local.get([STORAGE_KEYS.HISTORY]);
    if (!historyData[STORAGE_KEYS.HISTORY]) {
      await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: [] });
    }
    
    // 初始化默认用户（如果不存在）
    const userData = await chrome.storage.local.get([STORAGE_KEYS.USER]);
    if (!userData[STORAGE_KEYS.USER]) {
      const defaultUser = {
        username: '本地用户',
        points: 100,
        isLocal: true
      };
      await chrome.storage.local.set({ [STORAGE_KEYS.USER]: defaultUser });
    }
    
    return true;
  } catch (error) {
    console.error('初始化本地存储失败:', error);
    return false;
  }
}

/**
 * 获取所有网盘链接
 */
async function getLinks() {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEYS.LINKS]);
    return data[STORAGE_KEYS.LINKS] || [];
  } catch (error) {
    console.error('获取链接失败:', error);
    return [];
  }
}

/**
 * 根据URL查找链接
 */
async function findLinkByUrl(url) {
  const links = await getLinks();
  return links.find(link => link.url === url) || null;
}

/**
 * 添加或更新链接
 */
async function saveLink(linkData) {
  try {
    const links = await getLinks();
    const existingIndex = links.findIndex(link => link.url === linkData.url);
    
    if (existingIndex >= 0) {
      // 更新现有链接
      links[existingIndex] = {
        ...links[existingIndex],
        ...linkData,
        updatedAt: new Date().toISOString()
      };
    } else {
      // 添加新链接
      links.push({
        ...linkData,
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      // 添加新链接时增加积分
      await addPoints(2);
    }
    
    await chrome.storage.local.set({ [STORAGE_KEYS.LINKS]: links });
    return true;
  } catch (error) {
    console.error('保存链接失败:', error);
    return false;
  }
}

/**
 * 使用链接，添加到历史记录
 */
async function useLink(url) {
  try {
    const link = await findLinkByUrl(url);
    if (!link) return false;
    
    // 获取历史记录
    const data = await chrome.storage.local.get([STORAGE_KEYS.HISTORY]);
    const history = data[STORAGE_KEYS.HISTORY] || [];
    
    // 添加到历史记录
    history.unshift({
      url: link.url,
      platform: link.platform || link.type,
      password: link.password,
      used_at: new Date().toISOString()
    });
    
    // 限制历史记录长度为50
    if (history.length > 50) {
      history.pop();
    }
    
    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history });
    
    // 使用链接消耗积分
    await addPoints(-1);
    
    return true;
  } catch (error) {
    console.error('使用链接失败:', error);
    return false;
  }
}

/**
 * 获取历史记录
 */
async function getHistory(limit = 20) {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEYS.HISTORY]);
    const history = data[STORAGE_KEYS.HISTORY] || [];
    return history.slice(0, limit);
  } catch (error) {
    console.error('获取历史记录失败:', error);
    return [];
  }
}

/**
 * 获取用户信息
 */
async function getUserInfo() {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEYS.USER]);
    return data[STORAGE_KEYS.USER] || null;
  } catch (error) {
    console.error('获取用户信息失败:', error);
    return null;
  }
}

/**
 * 更新用户信息
 */
async function updateUserInfo(userInfo) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.USER]: userInfo });
    return true;
  } catch (error) {
    console.error('更新用户信息失败:', error);
    return false;
  }
}

/**
 * 增加或减少积分
 */
async function addPoints(points) {
  try {
    const user = await getUserInfo();
    if (!user) return false;
    
    user.points = Math.max(0, (user.points || 0) + points);
    await updateUserInfo(user);
    return user.points;
  } catch (error) {
    console.error('更新积分失败:', error);
    return false;
  }
}

/**
 * 获取用户积分
 */
async function getPoints() {
  const user = await getUserInfo();
  return user ? user.points : 0;
}

// 导出函数
export {
  initLocalStorage,
  getLinks,
  findLinkByUrl,
  saveLink,
  useLink,
  getHistory,
  getUserInfo,
  updateUserInfo,
  addPoints,
  getPoints
}; 