/**
 * LinkedIn Auto Connector - Popup Script
 */

// Default settings
const DEFAULT_SETTINGS = {
  tone: 'professional',
  delay: 3,
  maxConnections: 8,
  apiUrl: 'http://localhost:8000/api/v1'
};

// State
let userProfile = null;
let settings = { ...DEFAULT_SETTINGS };
let isConnecting = false;

// DOM Elements
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize tabs
  initTabs();
  
  // Load saved data
  await loadProfile();
  await loadSettings();
  
  // Setup event listeners
  setupEventListeners();
  
  // Check if on LinkedIn page
  checkLinkedInPage();
});

/**
 * Initialize tab navigation
 */
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.dataset.tab;
      
      // Update active states
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      button.classList.add('active');
      document.getElementById(`${targetTab}-tab`).classList.add('active');
    });
  });
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Profile form submission
  document.getElementById('profile-form').addEventListener('submit', handleProfileSubmit);
  
  // Settings save
  document.getElementById('save-settings').addEventListener('click', handleSettingsSave);
  
  // Connect tab buttons
  document.getElementById('scan-btn').addEventListener('click', handleScan);
  document.getElementById('start-btn').addEventListener('click', handleStartConnecting);
  document.getElementById('stop-btn').addEventListener('click', handleStopConnecting);
  
  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', () => {
    window.location.reload();
  });
}

/**
 * Load saved profile from storage
 */
async function loadProfile() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['userProfile'], (result) => {
      if (result.userProfile) {
        userProfile = result.userProfile;
        populateProfileForm(userProfile);
      }
      resolve();
    });
  });
}

/**
 * Load saved settings from storage
 */
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['settings'], (result) => {
      if (result.settings) {
        settings = { ...DEFAULT_SETTINGS, ...result.settings };
      }
      populateSettingsForm(settings);
      resolve();
    });
  });
}

/**
 * Populate profile form with saved data
 */
function populateProfileForm(profile) {
  const fields = [
    'first_name', 'preferred_name', 'last_name', 'email', 
    'current_title', 'current_company', 'target_role', 'target_industry', 
    'school', 'major', 'graduation_year', 'skills', 'connection_purpose'
  ];
  
  fields.forEach(field => {
    const input = document.getElementById(field);
    if (input && profile[field]) {
      input.value = profile[field];
    }
  });
}

/**
 * Populate settings form with saved data
 */
function populateSettingsForm(settings) {
  document.getElementById('tone').value = settings.tone;
  document.getElementById('delay').value = settings.delay;
  // Max connections - show placeholder if not set
  const maxInput = document.getElementById('max-connections');
  if (maxInput && settings.maxConnections) {
    maxInput.value = settings.maxConnections;
  }
}

/**
 * Handle profile form submission
 */
async function handleProfileSubmit(event) {
  event.preventDefault();
  
  const formData = new FormData(event.target);
  const profileData = {};
  
  formData.forEach((value, key) => {
    profileData[key] = value;
  });
  
  // Build display name from parts
  profileData.name = profileData.preferred_name || profileData.first_name;
  profileData.full_name = `${profileData.first_name} ${profileData.last_name}`;
  
  const statusEl = document.getElementById('profile-status');
  statusEl.textContent = 'Saving...';
  statusEl.className = 'status-message info';
  
  try {
    // Save to backend
    const response = await fetch(`${settings.apiUrl}/profiles/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(profileData)
    });
    
    if (response.ok) {
      const savedProfile = await response.json();
      userProfile = savedProfile;
      
      // Save to local storage
      chrome.storage.local.set({ userProfile: savedProfile });
      
      statusEl.textContent = '✓ Profile saved successfully!';
      statusEl.className = 'status-message success';
    } else {
      throw new Error('Failed to save profile');
    }
  } catch (error) {
    console.error('Error saving profile:', error);
    
    // Save locally even if backend fails
    userProfile = profileData;
    chrome.storage.local.set({ userProfile: profileData });
    
    statusEl.textContent = '✓ Profile saved locally (backend unavailable)';
    statusEl.className = 'status-message info';
  }
  
  setTimeout(() => {
    statusEl.textContent = '';
  }, 3000);
}

/**
 * Handle settings save
 */
function handleSettingsSave() {
  const maxInput = document.getElementById('max-connections');
  const maxValue = parseInt(maxInput.value, 10) || 8; // Default 8
  
  settings = {
    ...settings,
    tone: document.getElementById('tone').value,
    delay: parseInt(document.getElementById('delay').value, 10) || 3,
    maxConnections: maxValue
  };
  
  chrome.storage.local.set({ settings });
  
  const statusEl = document.getElementById('settings-status');
  statusEl.textContent = '✓ Settings saved!';
  statusEl.className = 'status-message success';
  
  setTimeout(() => {
    statusEl.textContent = '';
  }, 3000);
}

/**
 * Check if current tab is LinkedIn
 */
async function checkLinkedInPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.url && tab.url.includes('linkedin.com/mynetwork')) {
      document.getElementById('connection-status').innerHTML = `
        <p style="color: #28a745;">✓ Connected to LinkedIn</p>
        <p>Click "Scan Page" to find people to connect with.</p>
      `;
    }
  } catch (error) {
    console.error('Error checking tab:', error);
  }
}

/**
 * Handle page scan
 */
async function handleScan() {
  const scanBtn = document.getElementById('scan-btn');
  scanBtn.disabled = true;
  scanBtn.textContent = '🔍 Scanning...';
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url || !tab.url.includes('linkedin.com/mynetwork')) {
      throw new Error('Please navigate to LinkedIn\'s My Network page first.');
    }
    
    // Send message to content script to scan
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'scan' });
    
    if (response && response.connections) {
      displayFoundConnections(response.connections);
    } else {
      throw new Error('No connections found. Try scrolling down the page first.');
    }
  } catch (error) {
    console.error('Scan error:', error);
    document.getElementById('connection-status').innerHTML = `
      <p style="color: #dc3545;">⚠️ ${error.message}</p>
    `;
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = '🔍 Scan Page';
  }
}

/**
 * Display found connections
 */
function displayFoundConnections(connections) {
  const container = document.getElementById('found-connections');
  const list = document.getElementById('connection-list');
  const count = document.getElementById('connection-count');
  
  count.textContent = `${connections.length} found`;
  
  list.innerHTML = connections.slice(0, 8).map(conn => {
    // Show headshot if available, otherwise show initial
    const avatarContent = conn.imageUrl 
      ? `<img src="${escapeHtml(conn.imageUrl)}" alt="" class="avatar-img">`
      : `<span class="avatar-initial">${escapeHtml(conn.name.charAt(0).toUpperCase())}</span>`;
    
    return `
      <div class="connection-item">
        <div class="avatar">${avatarContent}</div>
        <div class="info">
          <div class="name">${escapeHtml(conn.name)}</div>
          <div class="title">${escapeHtml(conn.title || '')}</div>
        </div>
      </div>
    `;
  }).join('');
  
  if (connections.length > 8) {
    list.innerHTML += `<div class="connection-item" style="justify-content: center; color: #666; font-size: 0.75rem;">
      +${connections.length - 8} more
    </div>`;
  }
  
  container.style.display = 'block';
  document.getElementById('start-btn').disabled = false;
  
  // Store connections for later use
  chrome.storage.local.set({ foundConnections: connections });
}

/**
 * Get selected connection mode
 */
function getConnectionMode() {
  const modeRadios = document.querySelectorAll('input[name="connect-mode"]');
  for (const radio of modeRadios) {
    if (radio.checked) {
      return radio.value;
    }
  }
  return 'quick'; // default
}

/**
 * Handle start connecting
 */
async function handleStartConnecting() {
  const mode = getConnectionMode();
  
  // For message mode, require profile
  if (mode === 'message') {
    if (!userProfile || !userProfile.first_name) {
      alert('Please fill in your profile first for personalized messages!');
      document.querySelector('[data-tab="profile"]').click();
      return;
    }
    
    // Check API health before starting
    addLog('🔍 Checking API connection...', 'info');
    const apiHealthy = await checkApiHealth();
    if (!apiHealthy) {
      addLog('⚠️ AI API not available, will use fallback messages', 'info');
    } else {
      addLog('✓ API connected', 'success');
    }
  }
  
  isConnecting = true;
  updateConnectButtons();
  
  const progressSection = document.getElementById('progress-section');
  progressSection.style.display = 'block';
  
  // Clear previous logs
  document.getElementById('log-container').innerHTML = '';
  
  addLog(`Starting in ${mode === 'quick' ? '⚡ Quick Connect' : '💬 Connect with Message'} mode...`, 'info');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Get stored connections
    const result = await chrome.storage.local.get(['foundConnections']);
    const connections = result.foundConnections || [];
    
    // Get max connections from settings (default 8)
    const maxToConnect = settings.maxConnections || 8;
    
    const toConnect = connections.slice(0, maxToConnect);
    addLog(`Processing ${toConnect.length} connections...`, 'info');
    
    // Start connecting process
    await chrome.tabs.sendMessage(tab.id, {
      action: 'startConnecting',
      data: {
        mode: mode,
        connections: toConnect,
        userProfile,
        settings,
        apiUrl: settings.apiUrl
      }
    });
    
  } catch (error) {
    console.error('Connect error:', error);
    addLog(`Error: ${error.message}`, 'error');
    handleStopConnecting();
  }
}

/**
 * Check if API is healthy
 */
async function checkApiHealth() {
  try {
    const response = await fetch(`${settings.apiUrl}/health/`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch (error) {
    console.error('API health check failed:', error);
    return false;
  }
}

/**
 * Handle stop connecting
 */
async function handleStopConnecting() {
  addLog('🛑 Stop requested...', 'info');
  
  // Set stop signal in storage first (most reliable method)
  chrome.storage.local.set({ stopSignal: true });
  
  isConnecting = false;
  updateConnectButtons();
  
  try {
    // Try to notify content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await chrome.tabs.sendMessage(tab.id, { action: 'stopConnecting' }).catch(() => {});
    }
    
    // Notify background script
    chrome.runtime.sendMessage({ action: 'stopAllOperations' }).catch(() => {});
    
  } catch (error) {
    console.error('Stop error:', error);
  }
}

/**
 * Update connect buttons state
 */
function updateConnectButtons() {
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const scanBtn = document.getElementById('scan-btn');
  
  startBtn.disabled = isConnecting;
  scanBtn.disabled = isConnecting;
  
  // Stop button: enabled when connecting, disabled otherwise
  stopBtn.disabled = !isConnecting;
  
  // Also update visual style
  if (isConnecting) {
    stopBtn.style.opacity = '1';
    stopBtn.style.cursor = 'pointer';
  } else {
    stopBtn.style.opacity = '0.5';
    stopBtn.style.cursor = 'not-allowed';
  }
}

/**
 * Add log entry
 */
function addLog(message, type = 'info') {
  const logContainer = document.getElementById('log-container');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

/**
 * Update progress
 */
function updateProgress(current, total) {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  document.getElementById('progress-fill').style.width = `${percentage}%`;
  document.getElementById('progress-text').textContent = `${current} / ${total} completed`;
}

/**
 * Escape HTML for safe display
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'log') {
    addLog(message.text, message.level);
  } else if (message.type === 'progress') {
    updateProgress(message.current, message.total);
    // Ensure stop button stays enabled during progress
    if (isConnecting) {
      const stopBtn = document.getElementById('stop-btn');
      stopBtn.disabled = false;
      stopBtn.style.opacity = '1';
      stopBtn.style.cursor = 'pointer';
    }
  } else if (message.type === 'complete') {
    isConnecting = false;
    updateConnectButtons();
    addLog('Connection process completed!', 'success');
  }
});
