/**
 * LinkedIn Auto Connector - Content Script
 * Runs on LinkedIn pages to scan and connect with suggestions
 */

// Guard against double initialization
if (window.linkedInConnectorInitialized) {
  console.log('LinkedIn Auto Connector: Already initialized, skipping');
} else {
  window.linkedInConnectorInitialized = true;

// State
let isConnecting = false;
let shouldStop = false;

/**
 * Selectors for LinkedIn elements
 */
const SELECTORS = {
  connectButton: 'button[aria-label^="Invite"][aria-label$="to connect"]',
  connectButtonFallback1: 'button[aria-label*="connect" i]',
  connectModal: '[role="dialog"], .artdeco-modal, .send-invite',
  addNoteButton: 'button[aria-label*="Add a note" i]',
  noteTextarea: 'textarea[name="message"], textarea#custom-message, textarea',
  sendButton: 'button[aria-label*="Send" i]:not([aria-label*="without"])',
  sendWithoutNoteButton: 'button[aria-label*="Send without" i], button[aria-label*="Send now" i]',
  successToast: '.artdeco-toast-item--visible, .artdeco-toasts',
  profileLink: 'a[href*="/in/"]'
};

/**
 * Initialize
 */
function init() {
  console.log('LinkedIn Auto Connector: Content script loaded on', window.location.href);
  chrome.runtime.onMessage.addListener(handleMessage);
  
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.stopSignal && changes.stopSignal.newValue === true) {
      shouldStop = true;
      console.log('Stop signal received from storage');
    }
  });
}

/**
 * Handle messages
 */
function handleMessage(message, sender, sendResponse) {
  console.log('Content script received:', message);
  
  switch (message.action) {
    case 'ping':
      sendResponse({ status: 'ok' });
      break;
      
    case 'scan':
      const connections = scanPage();
      sendResponse({ connections });
      break;
      
    case 'startConnecting':
      chrome.storage.local.set({ stopSignal: false });
      shouldStop = false;
      startConnecting(message.data);
      sendResponse({ status: 'started' });
      break;
      
    case 'stopConnecting':
      stopConnecting();
      sendResponse({ status: 'stopped' });
      break;
      
    case 'connectOnProfile':
      handleConnectOnProfile(message.data)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    default:
      sendResponse({ error: 'Unknown action' });
  }
  
  return true;
}

/**
 * Clean extracted text - remove garbage
 */
function cleanText(text) {
  if (!text) return '';
  
  // Remove "Verified" badges and duplicates
  let cleaned = text
    .replace(/Verified/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Remove duplicate names (e.g., "John SmithJohn Smith" -> "John Smith")
  const words = cleaned.split(' ');
  if (words.length >= 2) {
    const half = Math.floor(words.length / 2);
    const firstHalf = words.slice(0, half).join(' ');
    const secondHalf = words.slice(half).join(' ');
    if (firstHalf === secondHalf) {
      cleaned = firstHalf;
    }
  }
  
  return cleaned;
}

/**
 * Scan page for connections
 */
function scanPage() {
  console.log('Scanning page...');
  const connections = [];
  const buttons = findConnectButtons();
  
  console.log(`Found ${buttons.length} Connect buttons`);
  
  buttons.forEach((button, index) => {
    const name = extractNameFromButton(button);
    if (!name) return;
    
    let profileUrl = null;
    let title = '';
    let imageUrl = null;
    
    const card = button.closest('[data-view-name="cohort-card"]') ||
                 button.closest('[role="listitem"]') ||
                 button.closest('li') ||
                 button.closest('article');
    
    if (card) {
      // Get profile URL
      const links = card.querySelectorAll('a[href*="/in/"]');
      for (const link of links) {
        const href = link.getAttribute('href');
        if (href && href.includes('/in/')) {
          profileUrl = href.split('?')[0];
          break;
        }
      }
      
      // Get headshot image - must be displayphoto, not background
      const imgs = card.querySelectorAll('img[src*="media.licdn.com"]');
      for (const img of imgs) {
        if (img.src && img.src.includes('profile-displayphoto')) {
          imageUrl = img.src;
          break;
        }
      }
      
      // Get title - LinkedIn structure has name in first div, title in second div
      // Look for paragraphs that are NOT the name
      const paragraphs = card.querySelectorAll('p');
      for (const p of paragraphs) {
        const text = p.textContent.trim();
        
        // Skip if empty, too short, or contains the name
        if (!text || text.length < 3 || text.length > 150) continue;
        if (text.includes(name) || name.includes(text.split(' ')[0])) continue;
        
        // Skip common non-title text
        if (text.includes('Connect') ||
            text.includes('Pending') ||
            text.includes('Based on') ||
            text.includes('mutual') ||
            text.includes('Verified') ||
            text.includes('Follow') ||
            text.includes('Message') ||
            /^\d+/.test(text) ||
            text.includes('connection') ||
            text.includes('follower')) {
          continue;
        }
        
        // This looks like a title - clean and use it
        title = cleanText(text);
        break;
      }
    }
    
    const cleanedName = cleanText(name);
    console.log(`Extracted: ${cleanedName} | ${title} | ${imageUrl ? '📷' : '❌'} | ${profileUrl}`);
    connections.push({ index, name: cleanedName, title, profileUrl, imageUrl });
  });
  
  console.log(`Extracted ${connections.length} connections`);
  return connections;
}

/**
 * Find Connect buttons
 */
function findConnectButtons() {
  let buttons = Array.from(document.querySelectorAll(SELECTORS.connectButton));
  
  if (buttons.length === 0) {
    buttons = Array.from(document.querySelectorAll(SELECTORS.connectButtonFallback1))
      .filter(btn => {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        return label.includes('connect') && !label.includes('disconnect');
      });
  }
  
  return buttons;
}

/**
 * Extract name from button
 */
function extractNameFromButton(button) {
  const ariaLabel = button.getAttribute('aria-label') || '';
  const match = ariaLabel.match(/Invite\s+(.+?)\s+to connect/i);
  return match ? match[1].trim() : null;
}

/**
 * Check if should stop
 */
async function checkShouldStop() {
  const result = await chrome.storage.local.get(['stopSignal']);
  return result.stopSignal === true || shouldStop;
}

/**
 * Start connecting
 */
async function startConnecting(data) {
  if (isConnecting) return;
  
  isConnecting = true;
  shouldStop = false;
  await chrome.storage.local.set({ stopSignal: false });
  
  const { mode, connections, userProfile, settings, apiUrl } = data;
  const total = connections.length;
  
  sendLog(`Starting ${mode === 'quick' ? '⚡ Quick' : '💬 Message'} mode...`, 'info');
  
  for (let i = 0; i < connections.length; i++) {
    if (await checkShouldStop()) {
      sendLog('🛑 Stopped by user', 'info');
      break;
    }
    
    const target = connections[i];
    sendLog(`[${i + 1}/${total}] ${target.name}`, 'info');
    
    try {
      let success = false;
      
      if (mode === 'quick') {
        success = await quickConnect(target);
      } else {
        success = await connectWithMessage(target, userProfile, settings, apiUrl);
      }
      
      if (success) {
        sendLog(`✅ ${target.name} - Sent!`, 'success');
      } else {
        sendLog(`❌ ${target.name} - Failed`, 'error');
      }
      
    } catch (error) {
      console.error(`Error with ${target.name}:`, error);
      sendLog(`❌ ${target.name}: ${error.message}`, 'error');
    }
    
    chrome.runtime.sendMessage({ type: 'progress', current: i + 1, total });
    
    // Delay before next connection
    if (i < connections.length - 1) {
      let delayMs;
      
      if (mode === 'quick') {
        // Mode A: Random human-like delay between 100ms and 500ms
        delayMs = Math.floor(Math.random() * 400) + 100;
      } else {
        // Mode B: Use settings delay (for rate limiting)
        delayMs = settings.delay * 1000;
      }
      
      const checkInterval = Math.min(delayMs, 500);
      for (let waited = 0; waited < delayMs; waited += checkInterval) {
        if (await checkShouldStop()) break;
        await sleep(checkInterval);
      }
    }
  }
  
  isConnecting = false;
  chrome.runtime.sendMessage({ type: 'complete' });
  sendLog('🏁 Complete!', 'success');
}

/**
 * Mode A: Quick Connect
 */
async function quickConnect(target) {
  const button = findConnectButtonByName(target.name);
  if (!button) {
    sendLog(`⚠️ Button not found`, 'error');
    return false;
  }
  
  button.click();
  await sleep(800);
  
  const modal = document.querySelector(SELECTORS.connectModal);
  if (modal) {
    const sendBtn = modal.querySelector(SELECTORS.sendWithoutNoteButton) ||
                    modal.querySelector(SELECTORS.sendButton) ||
                    Array.from(modal.querySelectorAll('button')).find(b => 
                      b.textContent.toLowerCase().includes('send')
                    );
    if (sendBtn) {
      sendBtn.click();
      await sleep(500);
    }
  }
  
  return true;
}

/**
 * Mode B: Connect with Message
 */
async function connectWithMessage(target, userProfile, settings, apiUrl) {
  if (!target.profileUrl) {
    sendLog(`⚠️ No profile URL, using quick connect`, 'info');
    return await quickConnect(target);
  }
  
  const message = await generateMessage(target, userProfile, settings, apiUrl);
  
  // Show the drafted message (clean version)
  const displayMsg = message.substring(0, 80) + (message.length > 80 ? '...' : '');
  sendLog(`📝 Message: "${displayMsg}"`, 'info');
  
  sendLog(`🔗 Opening profile...`, 'info');
  
  const result = await chrome.runtime.sendMessage({
    action: 'openProfileAndConnect',
    data: {
      profileUrl: target.profileUrl,
      message: message,
      targetName: target.name
    }
  });
  
  if (result.success) {
    if (result.verified) {
      sendLog(`✅ Invitation sent successfully!`, 'success');
    } else {
      sendLog(`✅ Sent (unverified)`, 'success');
    }
    return true;
  } else {
    sendLog(`❌ Failed: ${result.error || 'Unknown error'}`, 'error');
    return false;
  }
}

/**
 * Handle connect action on profile page (called by background)
 */
async function handleConnectOnProfile(data) {
  const { message, targetName } = data;
  
  console.log(`=== Connecting on profile page for ${targetName} ===`);
  console.log(`Message to send: ${message}`);
  console.log(`Current URL: ${window.location.href}`);
  
  // Wait for page to fully load
  console.log('Waiting for page to load...');
  await sleep(2500);
  
  // Step 1: Find Connect button
  sendLog(`🔍 Looking for Connect button...`, 'info');
  let connectBtn = findProfileConnectButton();
  
  if (connectBtn) {
    sendLog(`✓ Found visible Connect button`, 'info');
    console.log('✓ Found visible Connect button, will click it');
  } else {
    sendLog(`📋 Checking More menu...`, 'info');
    console.log('No visible Connect button, trying More menu...');
    connectBtn = await findConnectInMoreMenu();
    
    if (connectBtn) {
      sendLog(`✓ Found Connect in More menu`, 'info');
    }
  }
  
  if (!connectBtn) {
    sendLog(`❌ Connect button not found`, 'error');
    console.log('=== FAILED: Could not find Connect button ===');
    logAllButtons();
    return { success: false, error: 'Connect button not found' };
  }
  
  // Step 2: Click Connect
  sendLog(`👆 Clicking Connect...`, 'info');
  console.log('Clicking Connect button/option...');
  connectBtn.click();
  await sleep(2000);
  
  // Step 3: Wait for modal
  sendLog(`⏳ Waiting for modal...`, 'info');
  console.log('Waiting for modal...');
  const modal = await waitForElement(SELECTORS.connectModal, 5000);
  if (!modal) {
    sendLog(`❌ Modal did not appear`, 'error');
    console.log('Modal did not appear - checking if already connected or pending');
    return { success: false, error: 'Modal did not appear' };
  }
  
  sendLog(`✓ Modal opened`, 'info');
  console.log('✓ Modal opened');
  
  // Step 4: Click "Add a note"
  const addNoteBtn = findAddNoteButton(modal);
  if (addNoteBtn) {
    sendLog(`📝 Adding note...`, 'info');
    console.log('Clicking Add a note...');
    addNoteBtn.click();
    await sleep(1000);
  } else {
    console.log('No Add a note button (might already show textarea)');
  }
  
  // Step 5: Find and fill textarea
  await sleep(500);
  const textarea = modal.querySelector('textarea');
  if (textarea) {
    console.log('Entering message...');
    setTextareaValue(textarea, message);
    
    // Pause to let user see the message (more human-like)
    sendLog(`📝 Message ready, reviewing...`, 'info');
    await sleep(2500); // 2.5 second pause to review message
  } else {
    sendLog(`❌ No textarea found`, 'error');
    console.log('No textarea found in modal');
    return { success: false, error: 'No textarea for message' };
  }
  
  // Step 6: Click Send
  const sendBtn = findSendButton(modal);
  if (sendBtn && !sendBtn.disabled) {
    sendLog(`📤 Sending...`, 'info');
    console.log('Clicking Send button...');
    await sleep(500); // Small additional pause before clicking
    sendBtn.click();
    await sleep(2000);
    
    const verified = await checkForSuccessNotification();
    return { success: true, verified: verified };
  }
  
  // Fallback: send without note
  const sendWithoutBtn = findSendWithoutButton(modal);
  if (sendWithoutBtn) {
    sendLog(`📤 Sending without note...`, 'info');
    console.log('Using Send without note button...');
    sendWithoutBtn.click();
    await sleep(2000);
    return { success: true, verified: true, note: 'Sent without message' };
  }
  
  sendLog(`❌ Could not find Send button`, 'error');
  return { success: false, error: 'Could not find Send button' };
}

/**
 * Find visible Connect button on profile page
 */
function findProfileConnectButton() {
  console.log('Looking for visible Connect button...');
  
  // Only look in the main profile actions area, NOT in dropdowns
  const profileActionsSelectors = [
    '.pvs-profile-actions',
    '.pv-top-card-v2-ctas',
    '.pv-top-card--list',
    'main section'
  ];
  
  for (const containerSelector of profileActionsSelectors) {
    const container = document.querySelector(containerSelector);
    if (!container) continue;
    
    const buttons = container.querySelectorAll('button');
    
    for (const btn of buttons) {
      // Skip if button is inside a dropdown
      if (btn.closest('.artdeco-dropdown__content')) {
        continue;
      }
      
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      const text = btn.textContent.trim().toLowerCase();
      
      // Must have "connect" text or "invite...connect" in aria-label
      const isConnect = (
        text === 'connect' ||
        (label.includes('invite') && label.includes('connect'))
      );
      
      // Exclude things that aren't the Connect button
      const isNotConnect = (
        label.includes('disconnect') ||
        label.includes('more') ||
        label.includes('1st') ||
        label.includes('2nd') ||
        label.includes('3rd') ||
        label.includes('pending') ||
        text.includes('pending') ||
        text.includes('message') ||
        text.includes('follow') ||
        text.includes('more')
      );
      
      if (isConnect && !isNotConnect) {
        // Verify button is visible
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          console.log(`✓ Found visible Connect button: text="${text}", label="${label}"`);
          return btn;
        }
      }
    }
  }
  
  console.log('No visible Connect button found in profile actions');
  return null;
}

/**
 * Find Connect option in the More dropdown menu
 */
async function findConnectInMoreMenu() {
  console.log('Looking for More button...');
  
  // Find More button
  const moreBtn = findMoreButton();
  if (!moreBtn) {
    sendLog(`⚠️ More button not found`, 'info');
    console.log('More button not found');
    return null;
  }
  
  sendLog(`👆 Clicking More...`, 'info');
  console.log('Found More button, clicking...');
  moreBtn.click();
  
  // Wait for dropdown to appear
  await sleep(1500);
  
  // Find ALL dropdowns and look for the one that's visible and has Connect
  const allDropdowns = document.querySelectorAll('.artdeco-dropdown__content');
  console.log(`Found ${allDropdowns.length} dropdowns on page`);
  
  let connectOption = null;
  
  for (const dropdown of allDropdowns) {
    // Check if dropdown is visible
    const rect = dropdown.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0;
    console.log(`Dropdown visible: ${isVisible}, size: ${rect.width}x${rect.height}`);
    
    if (!isVisible) continue;
    
    // Log all items in this dropdown
    const allItems = dropdown.querySelectorAll('[role="button"], .artdeco-dropdown__item');
    console.log(`This dropdown has ${allItems.length} items:`);
    
    for (const item of allItems) {
      const label = item.getAttribute('aria-label') || '';
      const text = item.textContent.trim();
      console.log(`  - aria-label="${label.substring(0, 50)}" text="${text.substring(0, 30)}"`);
      
      // Check if this is Connect
      if (label.toLowerCase().includes('invite') && label.toLowerCase().includes('connect')) {
        console.log('  ✓ This is the Connect option!');
        connectOption = item;
        break;
      }
      
      // Also check span text
      const span = item.querySelector('span');
      if (span && span.textContent.trim().toLowerCase() === 'connect') {
        console.log('  ✓ Found Connect by span text!');
        connectOption = item;
        break;
      }
    }
    
    if (connectOption) break;
  }
  
  if (connectOption) {
    sendLog(`✓ Found Connect in dropdown`, 'success');
    return connectOption;
  }
  
  sendLog(`⚠️ Connect not in dropdown`, 'info');
  console.log('Connect not found in any dropdown');
  
  // Close dropdown
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(300);
  
  return null;
}

/**
 * Find the More button on profile page
 */
function findMoreButton() {
  // Try specific selectors first
  const specificSelectors = [
    'button[aria-label="More actions"]',
    'button[aria-label*="More actions"]',
    '.pvs-profile-actions button[aria-label*="More"]',
    '.pv-top-card-v2-ctas button[aria-label*="More"]'
  ];
  
  for (const selector of specificSelectors) {
    const btn = document.querySelector(selector);
    if (btn) {
      return btn;
    }
  }
  
  // Try finding by text content in main profile area
  const profileActions = document.querySelector('.pvs-profile-actions, .pv-top-card-v2-ctas, main section');
  if (profileActions) {
    const buttons = profileActions.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent.trim().toLowerCase();
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      
      if (text === 'more' || label === 'more' || label.includes('more actions')) {
        return btn;
      }
    }
  }
  
  return null;
}

/**
 * Find Add a note button in modal
 */
function findAddNoteButton(modal) {
  // Try aria-label first
  let btn = modal.querySelector('button[aria-label*="Add a note" i]');
  if (btn) return btn;
  
  // Try text content
  const buttons = modal.querySelectorAll('button');
  for (const b of buttons) {
    const text = b.textContent.toLowerCase();
    if (text.includes('add a note') || text.includes('add note')) {
      return b;
    }
  }
  
  return null;
}

/**
 * Find Send button in modal
 */
function findSendButton(modal) {
  const buttons = modal.querySelectorAll('button');
  for (const b of buttons) {
    const text = b.textContent.trim().toLowerCase();
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    
    if ((text === 'send' || text === 'send invitation' || label.includes('send')) &&
        !text.includes('without') && !label.includes('without')) {
      return b;
    }
  }
  return null;
}

/**
 * Find Send without note button
 */
function findSendWithoutButton(modal) {
  const buttons = modal.querySelectorAll('button');
  for (const b of buttons) {
    const text = b.textContent.trim().toLowerCase();
    if (text.includes('send without') || text.includes('send now')) {
      return b;
    }
  }
  return null;
}

/**
 * Log all buttons for debugging
 */
function logAllButtons() {
  const profileArea = document.querySelector('main section') || document;
  const buttons = profileArea.querySelectorAll('button');
  console.log('=== Buttons in profile area ===');
  buttons.forEach((btn, i) => {
    const text = btn.textContent.trim().substring(0, 30);
    const label = btn.getAttribute('aria-label') || '';
    console.log(`${i}: "${text}" | aria-label="${label}"`);
  });
}

/**
 * Check for success notification
 */
async function checkForSuccessNotification() {
  await sleep(500);
  
  const toast = document.querySelector('.artdeco-toast-item--visible, .artdeco-toasts .artdeco-toast-item');
  if (toast) {
    const text = toast.textContent.toLowerCase();
    if (text.includes('sent') || text.includes('invitation') || text.includes('pending')) {
      return true;
    }
  }
  
  // Check if modal closed
  const modal = document.querySelector(SELECTORS.connectModal);
  return !modal;
}

/**
 * Set textarea value (React-compatible)
 */
function setTextareaValue(textarea, value) {
  textarea.focus();
  textarea.select();
  
  // Clear first
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, value);
  
  // Also try native setter as backup
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;
  
  if (setter) {
    setter.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/**
 * Find button by name
 */
function findConnectButtonByName(name) {
  const buttons = findConnectButtons();
  const nameLower = name.toLowerCase();
  const firstName = nameLower.split(' ')[0];
  
  for (const btn of buttons) {
    const btnName = extractNameFromButton(btn);
    if (btnName && btnName.toLowerCase() === nameLower) return btn;
  }
  
  for (const btn of buttons) {
    const btnName = extractNameFromButton(btn);
    if (btnName && btnName.toLowerCase().includes(firstName)) return btn;
  }
  
  return null;
}

/**
 * Generate message
 */
async function generateMessage(target, userProfile, settings, apiUrl) {
  sendLog(`🤖 Generating AI message...`, 'info');
  
  try {
    const response = await fetch(`${apiUrl}/generate-message/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_name: userProfile.preferred_name || userProfile.first_name || userProfile.name,
        user_title: userProfile.current_title,
        user_company: userProfile.current_company,
        user_school: userProfile.school,
        user_major: userProfile.major,
        user_email: userProfile.email,
        user_experience_level: userProfile.experience_level,
        user_skills: userProfile.skills,
        connection_purpose: userProfile.connection_purpose,
        target_name: target.name.split(' ')[0], // First name only
        target_title: target.title,  // Full title for AI analysis
        target_company: target.company,
        tone: settings.tone,
        // Include settings
        include_title: settings.includeTitle !== false,
        include_company: settings.includeCompany === true,
        include_school: settings.includeSchool !== false,
        include_major: settings.includeMajor === true,
        include_email: settings.includeEmail === true
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.message;
    }
    throw new Error('API error');
  } catch (error) {
    sendLog(`⚠️ Using fallback message`, 'info');
    return generateFallbackMessage(target, userProfile, settings);
  }
}

/**
 * Fallback message - clean and simple
 */
function generateFallbackMessage(target, userProfile, settings) {
  const firstName = target.name.split(' ')[0];
  const userName = userProfile.preferred_name || userProfile.first_name || '';
  
  let intro = `Hi ${firstName}, `;
  
  // Build message based on include settings
  if (settings?.includeSchool && userProfile.school) {
    const school = userProfile.school;
    // Use short name if casual
    const shortSchool = settings.tone === 'casual' ? getShortSchoolName(school) : school;
    if (settings?.includeMajor && userProfile.major) {
      const major = settings.tone === 'casual' ? getShortMajor(userProfile.major) : userProfile.major;
      intro += `${major} grad from ${shortSchool} here - `;
    } else {
      intro += `${shortSchool} alum here - `;
    }
  } else if (settings?.includeTitle && userProfile.current_title) {
    intro += `fellow ${userProfile.current_title} here - `;
  }
  
  if (target.title && target.title.length > 5) {
    return `${intro}your work as ${target.title} caught my eye. Hope to connect! - ${userName}`.trim();
  }
  
  return `${intro}always great to connect with fellow professionals! - ${userName}`.trim();
}

/**
 * Get short school name for casual tone
 */
function getShortSchoolName(school) {
  const abbreviations = {
    'university of pennsylvania': 'UPenn',
    'upenn': 'UPenn',
    'massachusetts institute of technology': 'MIT',
    'california institute of technology': 'Caltech',
    'university of california, berkeley': 'UC Berkeley',
    'university of california, los angeles': 'UCLA',
    'university of southern california': 'USC',
    'new york university': 'NYU',
    'carnegie mellon university': 'CMU',
    'georgia institute of technology': 'Georgia Tech',
    'university of michigan': 'UMich',
    'university of texas at austin': 'UT Austin',
    'university of illinois urbana-champaign': 'UIUC',
    'university of illinois at urbana-champaign': 'UIUC',
    'university of north carolina': 'UNC',
    'university of virginia': 'UVA',
    'university of wisconsin-madison': 'UW-Madison',
    'university of washington': 'UW',
    'duke university': 'Duke',
    'stanford university': 'Stanford',
    'harvard university': 'Harvard',
    'yale university': 'Yale',
    'princeton university': 'Princeton',
    'columbia university': 'Columbia',
    'cornell university': 'Cornell',
    'brown university': 'Brown',
    'dartmouth college': 'Dartmouth'
  };
  
  const lower = school.toLowerCase();
  return abbreviations[lower] || school;
}

/**
 * Get short major name for casual tone
 */
function getShortMajor(major) {
  const abbreviations = {
    'computer science': 'CS',
    'electrical engineering': 'EE',
    'mechanical engineering': 'MechE',
    'economics': 'Econ',
    'mathematics': 'Math',
    'political science': 'Poli Sci',
    'business administration': 'Business',
    'information technology': 'IT'
  };
  
  const lower = major.toLowerCase();
  return abbreviations[lower] || major;
}

/**
 * Stop connecting
 */
function stopConnecting() {
  shouldStop = true;
  chrome.storage.local.set({ stopSignal: true });
  sendLog('🛑 Stopping...', 'info');
  chrome.runtime.sendMessage({ action: 'stopAllOperations' });
}

/**
 * Send log to popup
 */
function sendLog(text, level = 'info') {
  console.log(`[${level}] ${text}`);
  chrome.runtime.sendMessage({ type: 'log', text, level }).catch(() => {});
}

/**
 * Wait for element
 */
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
  });
}

/**
 * Sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize
init();

} // End of initialization guard
