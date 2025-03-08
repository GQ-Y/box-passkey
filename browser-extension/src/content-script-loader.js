/**
 * 内容脚本加载器
 * 由于内容脚本不能直接使用 ES 模块，此加载器负责动态加载带有模块支持的内容脚本
 */

(function() {
  // 标记脚本已开始加载
  window.__NETDISK_SCRIPT_LOADING = true;
  
  // 创建脚本元素
  const script = document.createElement('script');
  script.type = 'module';
  script.src = chrome.runtime.getURL('src/content.js');
  
  // 添加到页面中
  (document.head || document.documentElement).appendChild(script);
  
  // 在脚本加载完成后移除它（可选）
  script.onload = function() {
    script.remove();
    
    // 标记脚本已加载完成
    window.__NETDISK_SCRIPT_LOADED = true;
    
    // 发送脚本加载完成的消息
    window.postMessage({
      type: 'NETDISK_SCRIPT_LOADED'
    }, '*');
  };
  
  script.onerror = function(error) {
    console.error('加载内容脚本失败:', error);
    // 标记脚本加载失败
    window.__NETDISK_SCRIPT_ERROR = true;
    window.__NETDISK_SCRIPT_ERROR_MESSAGE = error.message || '未知错误';
  };
  
  // 下面是处理与背景脚本通信的消息传递桥接代码
  
  // 监听来自页面脚本的消息
  window.addEventListener('message', function(event) {
    // 只处理来自我们脚本的消息
    if (event.source !== window || !event.data || !event.data.type || !event.data.type.startsWith('NETDISK_')) {
      return;
    }
    
    // 转发消息到背景脚本
    if (event.data.type === 'NETDISK_BACKGROUND_REQUEST') {
      try {
        chrome.runtime.sendMessage(event.data.payload, function(response) {
          // 将背景脚本的响应转发回页面脚本
          window.postMessage({
            type: 'NETDISK_BACKGROUND_RESPONSE',
            requestId: event.data.requestId,
            response: response
          }, '*');
        });
      } catch (error) {
        console.error('向背景脚本发送消息失败:', error);
        // 发送错误响应
        window.postMessage({
          type: 'NETDISK_BACKGROUND_RESPONSE',
          requestId: event.data.requestId,
          error: error.message || '通信错误'
        }, '*');
      }
    }
  });
  
  // 监听来自背景脚本的消息
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    // 检查脚本是否已加载
    if (message.action === 'checkScriptLoaded') {
      sendResponse({
        loaded: !!window.__NETDISK_SCRIPT_LOADED,
        loading: !!window.__NETDISK_SCRIPT_LOADING,
        error: window.__NETDISK_SCRIPT_ERROR,
        errorMessage: window.__NETDISK_SCRIPT_ERROR_MESSAGE
      });
      return true;
    }
    
    // 转发消息到页面脚本
    window.postMessage({
      type: 'NETDISK_CONTENT_MESSAGE',
      payload: message
    }, '*');
    
    // 异步处理响应
    const responded = {
      value: false
    };
    
    // 监听页面脚本的响应
    const messageListener = function(event) {
      if (event.source !== window || 
          !event.data || 
          event.data.type !== 'NETDISK_CONTENT_RESPONSE' || 
          !event.data.forAction || 
          event.data.forAction !== message.action) {
        return;
      }
      
      // 移除监听器
      window.removeEventListener('message', messageListener);
      
      // 如果尚未响应，发送响应
      if (!responded.value) {
        responded.value = true;
        sendResponse(event.data.response);
      }
    };
    
    window.addEventListener('message', messageListener);
    
    // 设置超时，确保即使没收到响应也能结束
    setTimeout(() => {
      if (!responded.value) {
        responded.value = true;
        window.removeEventListener('message', messageListener);
        sendResponse({ success: false, error: '内容脚本响应超时' });
      }
    }, 1000);
    
    // 返回true表示将异步发送响应
    return true;
  });
  
  // 通知后台脚本内容脚本已加载
  try {
    chrome.runtime.sendMessage({ action: 'contentScriptLoaded' });
  } catch (error) {
    console.warn('通知后台脚本失败:', error);
  }
})(); 