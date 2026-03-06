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
  connectButton: 'button[aria-label^="Invite"][aria-label$="to connect"], a[aria-label^="Invite"][aria-label$="to connect"]',
  connectButtonFallback1: 'button[aria-label*="connect" i], a[aria-label*="connect" i]',
  connectModal: '.send-invite, .artdeco-modal[aria-labelledby="send-invite-modal"], [data-test-modal][role="dialog"]',
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
      
    case 'connectOnInvitePage':
      handleInvitePageForm(message.data.message, message.data.targetName)
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
function extractNameFromButton(element) {
  const ariaLabel = element.getAttribute('aria-label') || '';
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
  
  const { mode, connections, userProfile, settings } = data;
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
        success = await connectWithMessage(target, userProfile, settings);
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
async function connectWithMessage(target, userProfile, settings) {
  if (!target.profileUrl) {
    sendLog(`⚠️ No profile URL, using quick connect`, 'info');
    return await quickConnect(target);
  }
  
  const message = await generateMessage(target, userProfile, settings);
  
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
  
  if (await checkShouldStop()) return { success: false, error: 'Stopped by user' };
  
  console.log(`=== Connecting on profile page for ${targetName} ===`);
  console.log(`Message to send: ${message}`);
  console.log(`Current URL: ${window.location.href}`);
  
  // Wait for page to fully load
  console.log('Waiting for page to load...');
  await sleep(2500);
  
  if (await checkShouldStop()) return { success: false, error: 'Stopped by user' };
  
  // === Strategy: Stay on profile page, click Connect, intercept any <a> navigation ===
  // LinkedIn wraps Connect in <a> that navigates to /preload/custom-invite/ which is broken.
  // We need to click the element but prevent navigation so LinkedIn opens the modal instead.
  
  // PRIORITY 1: Open More menu to find Connect option (usually a non-link DIV → opens modal)
  sendLog(`📋 Checking More menu for Connect...`, 'info');
  let connectEl = await findConnectInMoreMenu();
  let fromMoreMenu = !!connectEl;
  
  // PRIORITY 2: Find Connect element on profile surface (may be an <a> link)
  if (!connectEl) {
    sendLog(`🔍 Looking for Connect on profile surface...`, 'info');
    connectEl = findAnyConnectElement();
  }
  
  if (!connectEl) {
    sendLog(`❌ Connect button not found`, 'error');
    console.log('=== FAILED: Could not find Connect element ===');
    logAllButtons();
    return { success: false, error: 'Connect button not found' };
  }
  
  // Click Connect while intercepting any <a> navigation
  sendLog(`👆 Clicking Connect (from ${fromMoreMenu ? 'More menu' : 'profile surface'})...`, 'info');
  console.log(`Connect element: tag=${connectEl.tagName}, label="${connectEl.getAttribute('aria-label')}", isLink=${connectEl.tagName === 'A' || !!connectEl.closest('a')}`);
  await clickAndPreventNavigation(connectEl);
  
  // Modal appears instantly after clicking Connect — trust it and proceed directly.
  // handleModalFlow has its own robust polling to find the invite modal in the DOM.
  sendLog(`⏳ Processing modal...`, 'info');
  await sleep(800);
  
  if (await checkShouldStop()) return { success: false, error: 'Stopped by user' };
  
  return await handleModalFlow(null, message);
}

/**
 * Find any Connect element on page surface (any tag type).
 * Returns the element to click - does NOT navigate anywhere.
 */
function findAnyConnectElement() {
  // Strategy 1: aria-label "Invite ... to connect" on ANY element
  const inviteElements = document.querySelectorAll('[aria-label*="Invite"][aria-label$="to connect"]');
  for (const el of inviteElements) {
    if (el.closest('.artdeco-dropdown__content')) continue; // skip dropdown items
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      console.log(`✓ Found Connect by aria-label: tag=${el.tagName}, label="${el.getAttribute('aria-label')}"`);
      return el;
    }
  }
  
  // Strategy 2: SVG connect icon → walk up to clickable parent
  const connectSvgs = document.querySelectorAll('svg[id="connect-small"]');
  for (const svg of connectSvgs) {
    const parent = svg.closest('[aria-label], button, a, [role="button"]') || svg.parentElement;
    if (!parent || parent.closest('.artdeco-dropdown__content')) continue;
    const rect = parent.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const text = parent.textContent.trim().toLowerCase();
      if (text.includes('connect') && !text.includes('disconnect')) {
        console.log(`✓ Found Connect by SVG icon: tag=${parent.tagName}`);
        return parent;
      }
    }
  }
  
  // Strategy 3: Profile actions area - any element with "Connect" text
  const containers = document.querySelectorAll('.pvs-profile-actions, .pv-top-card-v2-ctas, .pv-top-card--list, main section');
  for (const container of containers) {
    const clickables = container.querySelectorAll('button, a, span[class], div[class], [role="button"]');
    for (const el of clickables) {
      if (el.closest('.artdeco-dropdown__content')) continue;
      const text = el.textContent.trim().toLowerCase();
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      
      const isConnect = text === 'connect' || (label.includes('invite') && label.includes('connect'));
      const isNot = label.includes('disconnect') || text.includes('pending') || text.includes('message') || text.includes('follow') || text.includes('more');
      
      if (isConnect && !isNot) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          console.log(`✓ Found Connect in profile actions: tag=${el.tagName}, text="${text}"`);
          return el;
        }
      }
    }
  }
  
  console.log('No Connect element found on page surface');
  return null;
}

/**
 * Click Connect element while preventing page navigation away.
 * 
 * LinkedIn wraps Connect in <a href="/preload/custom-invite/..."> which causes
 * full page navigation. We must:
 * 1. Keep the href intact (Ember reads it to determine the action)
 * 2. Use native .click() (produces trusted event, Ember ignores untrusted)
 * 3. Block actual navigation via history API override + beforeunload + click handler
 */
async function clickAndPreventNavigation(element) {
  const link = element.tagName === 'A' ? element : element.closest('a');
  
  // === Override history.pushState/replaceState to block SPA navigation ===
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;
  let blockedUrl = null;
  
  history.pushState = function(state, title, url) {
    if (url && String(url).includes('/preload/')) {
      blockedUrl = url;
      console.log(`Blocked pushState to: ${url}`);
      return;
    }
    return origPushState.apply(this, arguments);
  };
  
  history.replaceState = function(state, title, url) {
    if (url && String(url).includes('/preload/')) {
      blockedUrl = url;
      console.log(`Blocked replaceState to: ${url}`);
      return;
    }
    return origReplaceState.apply(this, arguments);
  };
  
  // === Add click handler on <a> to prevent default navigation ===
  // Added in bubble phase (NOT capture) so Ember's delegated handlers on parent
  // elements fire FIRST, then we prevent the <a>'s default navigation.
  const preventNav = (e) => {
    e.preventDefault();
    console.log(`Prevented <a> default navigation to: ${link?.getAttribute('href')}`);
  };
  if (link) {
    link.addEventListener('click', preventNav);
    console.log(`Set navigation blocker on <a> href="${link.getAttribute('href')}"`);
  }
  
  // === Block full page unload as safety net ===
  const unloadBlocker = (e) => {
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', unloadBlocker);
  
  // Scroll into view and click with TRUSTED event
  element.scrollIntoView({ block: 'center', behavior: 'instant' });
  await sleep(200);
  
  // Use native .click() — this produces isTrusted:true which Ember requires
  console.log(`Clicking <${element.tagName}> with native .click() (href preserved: ${!!link?.getAttribute('href')})`);
  element.click();
  
  // Wait for Ember to process the click and open modal
  await sleep(3000);
  
  // Restore everything
  history.pushState = origPushState;
  history.replaceState = origReplaceState;
  window.removeEventListener('beforeunload', unloadBlocker);
  if (link) {
    link.removeEventListener('click', preventNav);
  }
  
  if (blockedUrl) {
    console.log(`SPA navigation to ${blockedUrl} was blocked`);
  }
  console.log(`After click, still on: ${window.location.href}`);
}

/**
 * Handle the invite page form directly (no modal needed).
 * The /preload/custom-invite/ page has the form as page content, not a popup.
 */
async function handleInvitePageForm(message, targetName) {
  if (await checkShouldStop()) return { success: false, error: 'Stopped by user' };
  
  sendLog(`📨 On invite page, looking for form...`, 'info');
  console.log('Handling invite page form...');
  console.log('Current URL:', window.location.href);
  
  // Wait for page to render
  await sleep(2000);
  
  // Dump page state for debugging
  console.log('Invite page elements:');
  console.log('  buttons:', Array.from(document.querySelectorAll('button')).map(b => `"${b.textContent.trim().substring(0, 40)}"`).join(', '));
  console.log('  textareas:', document.querySelectorAll('textarea').length);
  console.log('  inputs:', document.querySelectorAll('input[type="text"], input:not([type])').length);
  console.log('  dialogs:', document.querySelectorAll('[role="dialog"], .artdeco-modal, .send-invite').length);
  
  // Look for "Add a note" button anywhere on the page
  let addNoteBtn = null;
  const allButtons = document.querySelectorAll('button');
  for (const btn of allButtons) {
    const text = btn.textContent.toLowerCase().trim();
    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
    if (text.includes('add a note') || label.includes('add a note')) {
      const rect = btn.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        addNoteBtn = btn;
        break;
      }
    }
  }
  
  if (addNoteBtn) {
    console.log('Found "Add a note" button, clicking...');
    sendLog(`📝 Clicking "Add a note"...`, 'info');
    addNoteBtn.click();
    await sleep(1500);
    if (await checkShouldStop()) return { success: false, error: 'Stopped by user' };
  } else {
    console.log('No "Add a note" button found (textarea might already be visible)');
  }
  
  // Find textarea - search broadly (page content, modal, any container)
  let textarea = document.querySelector('textarea[name="message"], textarea#custom-message');
  if (!textarea) textarea = document.querySelector('textarea');
  
  if (!textarea) {
    // Wait more and retry
    console.log('No textarea yet, waiting...');
    await sleep(3000);
    textarea = document.querySelector('textarea');
  }
  
  if (!textarea) {
    // Try looking inside any modal/dialog that might have appeared
    const containers = document.querySelectorAll('[role="dialog"], .artdeco-modal, .send-invite, main, [role="main"]');
    for (const container of containers) {
      textarea = container.querySelector('textarea');
      if (textarea) break;
    }
  }
  
  if (textarea) {
    console.log('Found textarea, entering message...');
    setTextareaValue(textarea, message);
    sendLog(`📝 Message entered, reviewing...`, 'info');
    await sleep(2500);
    
    // Find Send button
    const sendBtn = findSendButtonOnPage();
    
    if (sendBtn && !sendBtn.disabled) {
      sendLog(`📤 Sending invitation...`, 'info');
      const urlBefore = window.location.href;
      await clickSendButton(sendBtn);
      
      // Check for success: either toast notification or page navigation (LinkedIn redirects after send)
      await sleep(2000);
      const urlAfter = window.location.href;
      const navigated = urlBefore !== urlAfter;
      const toastVerified = await checkForSuccessNotification();
      
      if (navigated) {
        console.log(`Page navigated after Send: ${urlBefore} → ${urlAfter}`);
        sendLog(`✓ Invitation sent (page redirected)`, 'success');
        return { success: true, verified: true };
      }
      return { success: true, verified: toastVerified };
    } else {
      sendLog(`❌ Send button not found or disabled`, 'error');
      console.log('Send button state:', sendBtn ? `disabled=${sendBtn.disabled}` : 'not found');
      // Log all buttons for debugging
      const allBtns = document.querySelectorAll('button');
      console.log('All buttons on page:');
      allBtns.forEach((b, i) => {
        console.log(`  ${i}: "${b.textContent.trim().substring(0, 40)}" aria-label="${b.getAttribute('aria-label')}" disabled=${b.disabled}`);
      });
      return { success: false, error: 'Send button not found on invite page' };
    }
  } else {
    sendLog(`❌ No textarea found on invite page`, 'error');
    console.log('No textarea found. Page body preview:', document.body.textContent.substring(0, 500));
    return { success: false, error: 'No textarea on invite page' };
  }
}

/**
 * Handle the modal flow (Add note → fill textarea → Send)
 */
async function handleModalFlow(modal, message) {
  if (await checkShouldStop()) return { success: false, error: 'Stopped by user' };
  
  // Re-query for the specific invite modal in main document
  // Pick the VISIBLE one that actually contains invite-related buttons
  let specificModal = null;
  const modalSelectors = ['.send-invite', '[data-test-modal][role="dialog"]', '.artdeco-modal', '[role="dialog"]'];
  
  // Poll for up to 5 seconds - modal content may still be rendering
  for (let attempt = 0; attempt < 10; attempt++) {
    for (const sel of modalSelectors) {
      const candidates = document.querySelectorAll(sel);
      for (const c of candidates) {
        const rect = c.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          // Must contain invite-related buttons (Add a note, Send without, Send invitation)
          const btns = c.querySelectorAll('button');
          for (const btn of btns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            const text = btn.textContent.trim().toLowerCase();
            if (label.includes('add a note') || text.includes('add a note') ||
                label.includes('send without') || text.includes('send without') ||
                label.includes('send invitation') || text.includes('send invitation')) {
              specificModal = c;
              break;
            }
          }
          if (specificModal) break;
        }
      }
      if (specificModal) break;
    }
    if (specificModal) break;
    
    // Not found yet, wait and retry
    if (attempt === 0) console.log('Waiting for invite modal content to render...');
    await sleep(500);
    if (await checkShouldStop()) return { success: false, error: 'Stopped by user' };
  }
  
  if (!specificModal) {
    // Could not find modal even after polling
    sendLog(`❌ Invite modal not found`, 'error');
    console.log('Could not find invite-specific modal after polling');
    // Debug: list all dialog-like elements
    const dialogs = document.querySelectorAll('[role="dialog"], .artdeco-modal, .send-invite, [data-test-modal]');
    console.log(`Dialog elements on page (${dialogs.length}):`);
    dialogs.forEach((d, i) => {
      const rect = d.getBoundingClientRect();
      const btns = Array.from(d.querySelectorAll('button')).map(b => b.textContent.trim().substring(0, 30));
      console.log(`  ${i}: <${d.tagName}> class="${d.className.substring(0, 60)}" visible=${rect.width > 0} buttons=[${btns.join(', ')}]`);
    });
    return { success: false, error: 'Invite modal not found' };
  }
  
  console.log(`✓ Modal opened: tag=${specificModal.tagName}, class="${specificModal.className.substring(0, 80)}", buttons=${specificModal.querySelectorAll('button').length}`);
  
  if (await checkShouldStop()) return { success: false, error: 'Stopped by user' };
  
  // Click "Add a note" — this is REQUIRED before textarea appears
  const addNoteBtn = findAddNoteButton(specificModal);
  if (addNoteBtn) {
    sendLog(`📝 Clicking "Add a note"...`, 'info');
    console.log(`Clicking Add a note: aria-label="${addNoteBtn.getAttribute('aria-label')}", id=${addNoteBtn.id}`);
    addNoteBtn.click();
    await sleep(2000);
  } else {
    sendLog(`⚠️ "Add a note" button not found, retrying...`, 'info');
    console.log('No Add a note button found in modal');
    // List all buttons in modal for debugging
    const btns = specificModal.querySelectorAll('button');
    console.log(`Buttons in modal (${btns.length}):`);
    btns.forEach((b, i) => console.log(`  ${i}: "${b.textContent.trim().substring(0, 40)}" aria-label="${b.getAttribute('aria-label')}" id=${b.id}`));
    
    // Wait and retry — modal might still be rendering
    await sleep(2000);
    const retryBtn = findAddNoteButton(specificModal);
    if (retryBtn) {
      sendLog(`📝 Clicking "Add a note"...`, 'info');
      retryBtn.click();
      await sleep(2000);
    } else {
      sendLog(`❌ "Add a note" button not found`, 'error');
      console.log('Add a note button not found even after retry');
      // Log ALL visible buttons on page
      const allBtns = document.querySelectorAll('button');
      console.log(`All buttons on page (${allBtns.length}):`);
      allBtns.forEach((b, i) => {
        const r = b.getBoundingClientRect();
        if (r.width > 0) console.log(`  ${i}: "${b.textContent.trim().substring(0, 40)}" aria-label="${b.getAttribute('aria-label')}"`);
      });
    }
  }
  
  if (await checkShouldStop()) return { success: false, error: 'Stopped by user' };
  
  // Find textarea - check modal first, then page-wide
  await sleep(500);
  let textarea = specificModal.querySelector('textarea');
  if (!textarea) {
    // Modal content may have been injected outside the original modal element
    textarea = document.querySelector('.send-invite textarea') || 
               document.querySelector('.artdeco-modal textarea') ||
               document.querySelector('[role="dialog"] textarea') ||
               document.querySelector('textarea');
    if (textarea) console.log('Found textarea outside modal container');
  }
  if (textarea) {
    console.log('Entering message...');
    setTextareaValue(textarea, message);
    sendLog(`📝 Message ready, reviewing...`, 'info');
    await sleep(2500);
  } else {
    sendLog(`❌ No textarea found`, 'error');
    console.log('No textarea found in modal');
    return { success: false, error: 'No textarea for message' };
  }
  
  if (await checkShouldStop()) return { success: false, error: 'Stopped by user' };
  
  // Click Send - search in specific modal first, then page-wide
  let sendBtn = findSendButton(specificModal);
  if (!sendBtn) sendBtn = findSendButtonOnPage();
  
  if (sendBtn && !sendBtn.disabled) {
    sendLog(`📤 Sending...`, 'info');
    const urlBefore = window.location.href;
    await clickSendButton(sendBtn);
    
    await sleep(2000);
    const urlAfter = window.location.href;
    const navigated = urlBefore !== urlAfter;
    const toastVerified = await checkForSuccessNotification();
    
    if (navigated) {
      console.log(`Page navigated after Send: ${urlBefore} → ${urlAfter}`);
      sendLog(`✓ Invitation sent (page redirected)`, 'success');
      return { success: true, verified: true };
    }
    return { success: true, verified: toastVerified };
  }
  
  // Fallback: send without note
  const sendWithoutBtn = findSendWithoutButton(specificModal);
  if (sendWithoutBtn) {
    sendLog(`📤 Sending without note...`, 'info');
    sendWithoutBtn.click();
    await sleep(2000);
    return { success: true, verified: true, note: 'Sent without message' };
  }
  
  sendLog(`❌ Could not find Send button`, 'error');
  return { success: false, error: 'Could not find Send button' };
}

/**
 * Find visible Connect button on profile page (tag-agnostic).
 * @param {boolean} excludeInsideLinks - If true, skip elements inside <a> tags
 */
function findProfileConnectButton(excludeInsideLinks = true) {
  console.log(`Looking for visible Connect element... (excludeInsideLinks=${excludeInsideLinks})`);
  
  function shouldSkip(el) {
    if (excludeInsideLinks && (el.tagName === 'A' || el.closest('a'))) return true;
    if (el.closest('.artdeco-dropdown__content')) return true;
    return false;
  }
  
  // Strategy 1: Find any element with aria-label "Invite ... to connect"
  const inviteElements = document.querySelectorAll('[aria-label*="Invite"][aria-label$="to connect"]');
  for (const el of inviteElements) {
    if (shouldSkip(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      console.log(`✓ Found Connect by aria-label: tag=${el.tagName}, label="${el.getAttribute('aria-label')}"`);
      return el;
    }
  }
  
  // Strategy 2: Find the connect SVG icon and walk up to its clickable parent
  const connectSvgs = document.querySelectorAll('svg[id="connect-small"]');
  for (const svg of connectSvgs) {
    let el = svg.parentElement;
    if (el && el.children.length === 1) el = el.parentElement || el;
    if (!el) continue;
    if (shouldSkip(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const text = el.textContent.trim().toLowerCase();
      if (text.includes('connect') && !text.includes('disconnect')) {
        console.log(`✓ Found Connect by SVG icon: tag=${el.tagName}, text="${text.substring(0, 30)}"`);
        return el;
      }
    }
  }
  
  // Strategy 3: Search profile actions area for ANY element with "Connect" text
  const profileActionsSelectors = [
    '.pvs-profile-actions',
    '.pv-top-card-v2-ctas',
    '.pv-top-card--list',
    'main section'
  ];
  
  for (const containerSelector of profileActionsSelectors) {
    const container = document.querySelector(containerSelector);
    if (!container) continue;
    
    const clickables = container.querySelectorAll('button, span[class], div[class]');
    for (const btn of clickables) {
      if (shouldSkip(btn)) continue;
      
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      const text = btn.textContent.trim().toLowerCase();
      
      const isConnect = (
        text === 'connect' ||
        (label.includes('invite') && label.includes('connect'))
      );
      
      const isNotConnect = (
        label.includes('disconnect') ||
        label.includes('more') ||
        text.includes('pending') ||
        text.includes('message') ||
        text.includes('follow') ||
        text.includes('more')
      );
      
      if (isConnect && !isNotConnect) {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          console.log(`✓ Found Connect in profile actions: tag=${btn.tagName}, text="${text}"`);
          return btn;
        }
      }
    }
  }
  
  console.log('No visible Connect element found');
  return null;
}

/**
 * Find the Connect <a> link on profile page and return its href.
 * Used as last resort when no non-link Connect button is available.
 */
function findProfileConnectLink() {
  // Find <a> with invite aria-label
  const links = document.querySelectorAll('a[aria-label*="Invite"][aria-label$="to connect"]');
  for (const link of links) {
    if (link.closest('.artdeco-dropdown__content')) continue;
    const rect = link.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const href = link.getAttribute('href');
      if (href) {
        console.log(`Found Connect <a> link: href="${href}"`);
        return href.startsWith('http') ? href : `https://www.linkedin.com${href}`;
      }
    }
  }
  
  // Also check for <a> containing connect SVG icon
  const connectSvgs = document.querySelectorAll('svg[id="connect-small"]');
  for (const svg of connectSvgs) {
    const parentLink = svg.closest('a');
    if (parentLink && !parentLink.closest('.artdeco-dropdown__content')) {
      const rect = parentLink.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const href = parentLink.getAttribute('href');
        if (href) {
          console.log(`Found Connect <a> link via SVG: href="${href}"`);
          return href.startsWith('http') ? href : `https://www.linkedin.com${href}`;
        }
      }
    }
  }
  
  return null;
}

/**
 * Find Connect option in the More dropdown menu (tag-agnostic)
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
  simulateClick(moreBtn);
  
  // Wait for dropdown to appear
  await sleep(1500);
  
  let connectOption = null;
  
  // Strategy 1: Search entire page for newly-visible elements with invite aria-label
  const inviteElements = document.querySelectorAll('[aria-label*="Invite"][aria-label$="to connect"]');
  console.log(`Found ${inviteElements.length} invite-to-connect elements on page`);
  for (const el of inviteElements) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      console.log(`✓ Found Connect by aria-label: tag=${el.tagName}, label="${el.getAttribute('aria-label')}"`);
      connectOption = el;
      break;
    }
  }
  
  // Strategy 2: Search in dropdown containers
  if (!connectOption) {
    const allDropdowns = document.querySelectorAll('.artdeco-dropdown__content');
    console.log(`Found ${allDropdowns.length} dropdowns on page`);
    
    for (const dropdown of allDropdowns) {
      const rect = dropdown.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0;
      if (!isVisible) continue;
      
      // Search ALL descendants broadly
      const allItems = dropdown.querySelectorAll('*');
      console.log(`Visible dropdown has ${allItems.length} descendants`);
      
      for (const item of allItems) {
        const label = (item.getAttribute('aria-label') || '').toLowerCase();
        
        // Match by aria-label
        if (label.includes('invite') && label.includes('connect')) {
          console.log(`✓ Found Connect in dropdown by aria-label: tag=${item.tagName}`);
          connectOption = item;
          break;
        }
      }
      if (connectOption) break;
      
      // Also search for SVG connect icon in dropdown
      const connectSvgs = dropdown.querySelectorAll('svg[id="connect-small"]');
      for (const svg of connectSvgs) {
        let parent = svg.parentElement;
        if (parent && parent.children.length === 1) parent = parent.parentElement || parent;
        if (parent) {
          const text = parent.textContent.trim().toLowerCase();
          if (text.includes('connect') && !text.includes('disconnect')) {
            console.log(`✓ Found Connect in dropdown by SVG icon: tag=${parent.tagName}`);
            connectOption = parent;
            break;
          }
        }
      }
      if (connectOption) break;
      
      // Last resort: text match for "Connect"
      for (const item of allItems) {
        if (item.children.length > 0) continue; // only leaf nodes
        const text = item.textContent.trim();
        if (text === 'Connect') {
          // Walk up to find a clickable parent (with aria-label or componentkey)
          let clickable = item.closest('[aria-label*="connect" i], [aria-label*="invite" i], [componentkey], [role="menuitem"], [role="button"], .artdeco-dropdown__item');
          if (clickable) {
            console.log(`✓ Found Connect in dropdown by text+parent: tag=${clickable.tagName}`);
            connectOption = clickable;
          } else {
            // Use the text element's parent
            console.log(`✓ Found Connect in dropdown by text: tag=${item.parentElement.tagName}`);
            connectOption = item.parentElement;
          }
          break;
        }
      }
      if (connectOption) break;
    }
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
 * Find the More button on profile page (tag-agnostic)
 */
function findMoreButton() {
  // Strategy 1: Find by aria-label on any element
  const ariaSelectors = [
    '[aria-label="More actions"]',
    '[aria-label*="More actions"]',
    '.pvs-profile-actions [aria-label*="More"]',
    '.pv-top-card-v2-ctas [aria-label*="More"]'
  ];
  
  for (const selector of ariaSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        console.log(`Found More button by aria-label: tag=${el.tagName}`);
        return el;
      }
    }
  }
  
  // Strategy 2: Find by the overflow SVG icon (three dots)
  const overflowSvgs = document.querySelectorAll('svg[id="overflow-web-ios-small"]');
  for (const svg of overflowSvgs) {
    // Walk up to find the clickable parent in profile actions area
    let el = svg.closest('.pvs-profile-actions *') ? svg.parentElement : null;
    if (!el) el = svg.closest('.pv-top-card-v2-ctas *') ? svg.parentElement : null;
    if (!el) {
      // Try walking up from SVG
      el = svg.parentElement;
      if (el && el.tagName === 'SPAN') el = el.parentElement || el;
    }
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        console.log(`Found More button by overflow SVG: tag=${el.tagName}`);
        return el;
      }
    }
  }
  
  // Strategy 3: Find by text content in profile actions area
  const profileActions = document.querySelector('.pvs-profile-actions, .pv-top-card-v2-ctas, main section');
  if (profileActions) {
    const elements = profileActions.querySelectorAll('button, span[class], div[class]');
    for (const el of elements) {
      const text = el.textContent.trim().toLowerCase();
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      
      if (text === 'more' || label === 'more' || label.includes('more actions')) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          console.log(`Found More button by text: tag=${el.tagName}, text="${text}"`);
          return el;
        }
      }
    }
  }
  
  console.log('More button not found');
  return null;
}

/**
 * Find Add a note button in modal
 */
function findAddNoteButton(modal) {
  // Try aria-label in modal (exact match)
  let btn = modal.querySelector('button[aria-label="Add a note"]');
  if (btn) return btn;
  
  // Try partial aria-label match
  btn = modal.querySelector('button[aria-label*="Add a note"]');
  if (btn) return btn;
  
  // Try case-insensitive by iterating
  const buttons = modal.querySelectorAll('button');
  for (const b of buttons) {
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    const text = b.textContent.trim().toLowerCase();
    if (label.includes('add a note') || text.includes('add a note') || text === 'add note') {
      return b;
    }
  }
  
  // Fallback: search entire page
  btn = document.querySelector('button[aria-label="Add a note"]');
  if (btn) {
    const rect = btn.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      console.log('Found "Add a note" button via page-wide search');
      return btn;
    }
  }
  
  const allButtons = document.querySelectorAll('button');
  for (const b of allButtons) {
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    const text = b.textContent.trim().toLowerCase();
    if (label.includes('add a note') || text.includes('add a note') || text === 'add note') {
      const rect = b.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        console.log('Found "Add a note" button via page-wide text search');
        return b;
      }
    }
  }
  
  return null;
}

/**
 * Find Send button in modal
 */
function findSendButton(modal) {
  // Precise aria-label match first
  let btn = modal.querySelector('button[aria-label="Send invitation"]');
  if (btn) return btn;
  
  btn = modal.querySelector('button[aria-label*="Send" i]:not([aria-label*="without" i])');
  if (btn) return btn;
  
  const buttons = modal.querySelectorAll('button');
  for (const b of buttons) {
    const text = b.textContent.trim().toLowerCase();
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    
    if ((text === 'send' || text === 'send invitation' || text.includes('send invite')) &&
        !text.includes('without') && !label.includes('without')) {
      return b;
    }
  }
  return null;
}

/**
 * Find Send button anywhere on the page (not scoped to a modal).
 * Uses precise selectors first, then broad search.
 */
function findSendButtonOnPage() {
  // Precise: aria-label="Send invitation"
  let btn = document.querySelector('button[aria-label="Send invitation"]');
  if (btn) {
    const rect = btn.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      console.log(`✓ Found Send button by exact aria-label: id=${btn.id}, class="${btn.className.substring(0, 60)}"`);
      return btn;
    }
  }
  
  // Broad aria-label match
  btn = document.querySelector('button[aria-label*="Send" i]:not([aria-label*="without" i])');
  if (btn) {
    const rect = btn.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      console.log(`✓ Found Send button by broad aria-label: "${btn.getAttribute('aria-label')}"`);
      return btn;
    }
  }
  
  // Text content search
  const buttons = document.querySelectorAll('button');
  for (const b of buttons) {
    const text = b.textContent.trim().toLowerCase();
    if ((text === 'send' || text === 'send invitation') && !text.includes('without')) {
      const rect = b.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        console.log(`✓ Found Send button by text: "${text}", id=${b.id}`);
        return b;
      }
    }
  }
  
  // Primary artdeco button (LinkedIn's "Send" is always primary styled)
  const primaryBtns = document.querySelectorAll('button.artdeco-button--primary');
  for (const b of primaryBtns) {
    const text = b.textContent.trim().toLowerCase();
    if (text.includes('send') && !text.includes('without')) {
      const rect = b.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        console.log(`✓ Found Send button by primary class: "${text}", id=${b.id}`);
        return b;
      }
    }
  }
  
  console.log('Send button not found on page');
  return null;
}

/**
 * Click the Send button reliably.
 * Tries multiple strategies: native .click(), form prevention, simulateClick.
 */
async function clickSendButton(btn) {
  console.log(`Clicking Send button: tag=${btn.tagName}, id=${btn.id}, aria-label="${btn.getAttribute('aria-label')}"`);
  
  // Scroll into view first
  btn.scrollIntoView({ block: 'center', behavior: 'instant' });
  await sleep(300);
  
  // If button is inside a <form>, prevent default form submission that causes redirect
  const form = btn.closest('form');
  if (form) {
    console.log('Send button is inside a <form>, adding submit prevention');
    const preventSubmit = (e) => {
      e.preventDefault();
      console.log('Prevented form submission redirect');
    };
    form.addEventListener('submit', preventSubmit, { once: true });
  }
  
  // If button is inside an <a>, prevent navigation
  const parentLink = btn.closest('a');
  if (parentLink) {
    console.log('Send button is inside an <a>, preventing navigation');
    const preventNav = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    parentLink.addEventListener('click', preventNav, { once: true });
  }
  
  // Strategy 1: Native .click() — most reliable for Ember views
  console.log('Trying native .click()...');
  btn.focus();
  btn.click();
  
  await sleep(1000);
  
  // Check if it worked (modal closed or page changed)
  const modalStillOpen = document.querySelector('.send-invite, .artdeco-modal[aria-labelledby="send-invite-modal"]');
  if (!modalStillOpen || !document.contains(btn)) {
    console.log('✓ Send click appears to have worked (modal closed or button removed)');
    return;
  }
  
  // Strategy 2: simulateClick with coordinates
  console.log('Modal still open, trying simulateClick with coordinates...');
  simulateClick(btn);
  
  await sleep(1000);
  
  // Strategy 3: Dispatch click directly on the inner span
  const innerSpan = btn.querySelector('.artdeco-button__text, span');
  if (innerSpan && document.contains(btn)) {
    console.log('Still open, trying click on inner span...');
    innerSpan.click();
  }
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
  // Log ALL elements with aria-label, role, or connect-related content
  const elements = profileArea.querySelectorAll('button, a, [aria-label], [role="button"], [role="menuitem"], svg[id]');
  console.log('=== Interactive elements in profile area ===');
  elements.forEach((el, i) => {
    const text = el.textContent.trim().substring(0, 30);
    const label = el.getAttribute('aria-label') || '';
    const tag = el.tagName;
    const svgId = el.getAttribute('id') || '';
    console.log(`${i}: <${tag}> id="${svgId}" "${text}" | aria-label="${label}"`);
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
  // Focus the textarea first
  textarea.focus();
  
  // Use native value setter (works with Ember/React)
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;
  
  if (setter) {
    setter.call(textarea, value);
  } else {
    textarea.value = value;
  }
  
  // Dispatch events so Ember picks up the change
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
  
  // Also try execCommand as backup (only within textarea, NOT selectAll on document)
  if (!textarea.value || textarea.value !== value) {
    textarea.focus();
    textarea.select(); // select within textarea only
    document.execCommand('insertText', false, value);
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
async function generateMessage(target, userProfile, settings) {
  sendLog(`🤖 Generating AI message...`, 'info');
  
  try {
    const result = await chrome.runtime.sendMessage({
      action: 'generateMessage',
      data: {
        userInfo: {
          name: userProfile.preferred_name || userProfile.first_name || userProfile.name,
          first_name: userProfile.first_name,
          preferred_name: userProfile.preferred_name,
          current_title: userProfile.current_title,
          current_company: userProfile.current_company,
          school: userProfile.school,
          major: userProfile.major,
          email: userProfile.email,
          experience_level: userProfile.experience_level,
          skills: userProfile.skills,
          connection_purpose: userProfile.connection_purpose
        },
        targetInfo: {
          name: target.name,
          title: target.title,
          company: target.company
        },
        tone: settings.tone,
        includeSettings: {
          title: settings.includeTitle !== false,
          company: settings.includeCompany === true,
          school: settings.includeSchool !== false,
          major: settings.includeMajor === true,
          email: settings.includeEmail === true
        },
        groqApiKey: settings.groqApiKey
      }
    });
    
    if (result && result.success && result.message) {
      return result.message;
    }
    throw new Error(result?.error || 'AI generation failed');
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
 * Wait for the send-invite modal to become visible.
 * Uses polling because the modal element may already exist in DOM but hidden.
 */
function waitForVisibleModal(timeout = 8000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let loggedOnce = false;
    
    const interval = setInterval(() => {
      // === Check 1: Standard selectors ===
      const candidates = document.querySelectorAll(
        '.send-invite, .artdeco-modal, [data-test-modal][role="dialog"], [role="dialog"], .artdeco-modal-overlay'
      );
      
      for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const text = el.textContent.toLowerCase();
          // Accept modal if it has ANY invite-related text
          if (text.includes('add a note') || text.includes('send without') || 
              text.includes('invitation') || text.includes('send') ||
              text.includes('connect') || text.includes('note') ||
              text.includes('custom message') || text.includes('textarea')) {
            console.log(`✓ Found visible invite modal: tag=${el.tagName}, class="${el.className.substring(0, 80)}", size=${rect.width}x${rect.height}`);
            clearInterval(interval);
            resolve(el);
            return;
          }
          // Also accept if it contains a textarea (that's definitely the invite form)
          if (el.querySelector('textarea')) {
            console.log(`✓ Found modal with textarea: tag=${el.tagName}, class="${el.className.substring(0, 80)}"`);
            clearInterval(interval);
            resolve(el);
            return;
          }
          // Accept if it has a button with "Send" text
          const btns = el.querySelectorAll('button');
          for (const btn of btns) {
            if (btn.textContent.trim().toLowerCase().includes('send')) {
              console.log(`✓ Found modal with Send button: tag=${el.tagName}, class="${el.className.substring(0, 80)}"`);
              clearInterval(interval);
              resolve(el);
              return;
            }
          }
        }
      }
      
      // === Check 2: Any overlay/modal-like container that appeared ===
      const overlays = document.querySelectorAll(
        '[class*="modal"], [class*="overlay"], [class*="dialog"], [class*="invite"], [id*="modal"], [id*="dialog"]'
      );
      for (const el of overlays) {
        const rect = el.getBoundingClientRect();
        // Large visible element that looks like a modal
        if (rect.width > 200 && rect.height > 200) {
          if (el.querySelector('textarea') || el.querySelector('button')) {
            console.log(`✓ Found modal-like overlay: tag=${el.tagName}, class="${el.className.substring(0, 80)}", size=${rect.width}x${rect.height}`);
            clearInterval(interval);
            resolve(el);
            return;
          }
        }
      }
      
      // === Check 3: Check iframes (only if they contain invite-related content) ===
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        const rect = iframe.getBoundingClientRect();
        if (rect.width > 200 && rect.height > 200) {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (iframeDoc) {
              const iframeText = iframeDoc.body?.textContent?.toLowerCase() || '';
              // Only match iframes with invite-related content, NOT ad iframes
              if ((iframeText.includes('add a note') || iframeText.includes('send invitation') || 
                   iframeText.includes('send without') || iframeText.includes('custom message')) &&
                  iframeDoc.querySelector('textarea, button[aria-label*="Send"]')) {
                console.log(`✓ Found invite modal in iframe: src="${iframe.src?.substring(0, 60)}"`);
                clearInterval(interval);
                resolve(iframeDoc.body);
                return;
              }
            }
          } catch (e) {
            // Cross-origin iframe, skip
          }
        }
      }
      
      // Log scan results periodically for debugging
      const elapsed = Date.now() - startTime;
      if (!loggedOnce && elapsed > 3000) {
        loggedOnce = true;
        console.log(`Modal scan at ${elapsed}ms:`);
        console.log(`  candidates: ${candidates.length} (visible: ${Array.from(candidates).filter(c => { const r = c.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length})`);
        console.log(`  overlays: ${overlays.length}`);
        console.log(`  iframes: ${iframes.length} (visible: ${Array.from(iframes).filter(f => { const r = f.getBoundingClientRect(); return r.width > 200; }).length})`);
        // Log visible candidates text preview
        for (const el of candidates) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            console.log(`  visible candidate: <${el.tagName}> class="${el.className.substring(0, 60)}" text="${el.textContent.substring(0, 100).trim()}"`)
          }
        }
      }
      
      if (Date.now() - startTime > timeout) {
        // Final comprehensive dump
        console.log('=== MODAL NOT FOUND - Full page scan ===');
        console.log(`Candidates (${candidates.length}):`);
        candidates.forEach((c, i) => {
          const r = c.getBoundingClientRect();
          console.log(`  ${i}: <${c.tagName}> class="${c.className.substring(0, 80)}" visible=${r.width > 0} size=${r.width}x${r.height}`);
          if (r.width > 0) console.log(`     text: "${c.textContent.substring(0, 150).trim()}"`);
        });
        console.log(`All textareas on page: ${document.querySelectorAll('textarea').length}`);
        console.log(`All buttons with "send": ${Array.from(document.querySelectorAll('button')).filter(b => b.textContent.toLowerCase().includes('send')).length}`);
        console.log(`All buttons with "note": ${Array.from(document.querySelectorAll('button')).filter(b => b.textContent.toLowerCase().includes('note')).length}`);
        // Check shadow DOMs
        const allElements = document.querySelectorAll('*');
        let shadowCount = 0;
        allElements.forEach(el => { if (el.shadowRoot) shadowCount++; });
        console.log(`Elements with shadow DOM: ${shadowCount}`);
        // Check large visible elements that might be a modal
        console.log('Large visible non-standard elements:');
        document.querySelectorAll('div, section, aside').forEach(el => {
          const r = el.getBoundingClientRect();
          const z = window.getComputedStyle(el).zIndex;
          if (r.width > 300 && r.height > 200 && z !== 'auto' && parseInt(z) > 100) {
            console.log(`  <${el.tagName}> class="${el.className.substring(0, 80)}" z=${z} size=${r.width}x${r.height}`);
          }
        });
        
        clearInterval(interval);
        resolve(null);
      }
    }, 300);
  });
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
 * Simulate a real click on an element with full mouse event sequence.
 * LinkedIn's Ember framework may not respond to plain .click().
 */
function simulateClick(element) {
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  
  const eventOpts = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y
  };
  
  element.dispatchEvent(new MouseEvent('mousedown', eventOpts));
  element.dispatchEvent(new MouseEvent('mouseup', eventOpts));
  element.dispatchEvent(new MouseEvent('click', eventOpts));
  
  console.log(`simulateClick: dispatched on <${element.tagName}> at (${Math.round(x)}, ${Math.round(y)})`);
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
