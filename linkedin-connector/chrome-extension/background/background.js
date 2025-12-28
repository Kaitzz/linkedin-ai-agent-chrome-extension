/**
 * LinkedIn Auto Connector - Background Service Worker
 * Handles extension lifecycle, tab management, and cross-tab communication
 */

// Track if we should stop operations
let shouldStopOperations = false;
let activeProfileTabId = null;

// Extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('LinkedIn Auto Connector installed:', details.reason);
  
  if (details.reason === 'install') {
    chrome.storage.local.set({
      settings: {
        tone: 'professional',
        delay: 3,
        maxConnections: 20,
        apiUrl: 'http://localhost:8000/api/v1'
      },
      stopSignal: false
    });
  }
  
  // Enable side panel to open on action click
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (chrome.sidePanel) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  switch (message.action) {
    case 'openProfileAndConnect':
      // Check if we should stop before starting
      chrome.storage.local.get(['stopSignal'], (result) => {
        if (result.stopSignal) {
          sendResponse({ success: false, error: 'Stopped by user' });
          return;
        }
        
        handleOpenProfileAndConnect(message.data, sender)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
      });
      return true;
      
    case 'stopAllOperations':
      shouldStopOperations = true;
      // Don't close tabs - keep them open for debugging
      activeProfileTabId = null;
      sendResponse({ status: 'stopped' });
      break;
      
    case 'checkHealth':
      checkBackendHealth(message.apiUrl)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ error: error.message }));
      return true;
      
    default:
      break;
  }
});

// Listen for stop signal changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.stopSignal) {
    shouldStopOperations = changes.stopSignal.newValue === true;
    console.log('Stop signal changed:', shouldStopOperations);
    // Don't close tabs - keep them open for debugging
    activeProfileTabId = null;
  }
});

/**
 * Open profile in new tab and connect with message
 */
async function handleOpenProfileAndConnect(data, sender) {
  const { profileUrl, message, targetName } = data;
  
  // Check stop signal
  const stopCheck = await chrome.storage.local.get(['stopSignal']);
  if (stopCheck.stopSignal || shouldStopOperations) {
    return { success: false, error: 'Stopped by user' };
  }
  
  console.log(`Opening profile for ${targetName}: ${profileUrl}`);
  
  // Create new tab
  const newTab = await chrome.tabs.create({ 
    url: profileUrl,
    active: true  // Make it active so we can see what's happening
  });
  
  activeProfileTabId = newTab.id;
  
  try {
    // Wait for tab to load
    await waitForTabLoad(newTab.id);
    
    // Check stop signal again
    const stopCheck2 = await chrome.storage.local.get(['stopSignal']);
    if (stopCheck2.stopSignal || shouldStopOperations) {
      // Don't close tab on stop - let user see what happened
      activeProfileTabId = null;
      return { success: false, error: 'Stopped by user' };
    }
    
    // Give page extra time to render
    await sleep(3000);
    
    // Send message to content script on profile page
    const result = await chrome.tabs.sendMessage(newTab.id, {
      action: 'connectOnProfile',
      data: { message, targetName }
    });
    
    // DEBUG MODE: Don't close the tab - keep it open for inspection
    console.log('Keeping tab open for debugging');
    activeProfileTabId = null;
    
    return result;
    
  } catch (error) {
    console.error('Error in profile tab:', error);
    // Don't close tab on error - keep it open for debugging
    activeProfileTabId = null;
    return { success: false, error: error.message };
  }
}

/**
 * Wait for tab to finish loading
 */
function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timeout'));
    }, 30000);
    
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * Check backend health
 */
async function checkBackendHealth(apiUrl) {
  try {
    const response = await fetch(`${apiUrl}/health/`);
    if (response.ok) {
      const data = await response.json();
      return { healthy: true, data };
    }
    return { healthy: false, error: 'Backend returned non-OK status' };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
