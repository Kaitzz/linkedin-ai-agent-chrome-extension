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
        groqApiKey: ''
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
      activeProfileTabId = null;
      sendResponse({ status: 'stopped' });
      break;
      
    case 'generateMessage':
      generateAIMessage(message.data)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
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
  
  // Extract vanityName from profile URL (e.g., /in/john-doe-123/ → john-doe-123)
  const vanityMatch = profileUrl.match(/\/in\/([^/?]+)/);
  if (!vanityMatch) {
    return { success: false, error: 'Could not extract vanity name from profile URL' };
  }
  const vanityName = vanityMatch[1];
  const inviteUrl = `https://www.linkedin.com/preload/custom-invite/?vanityName=${vanityName}`;
  
  console.log(`Navigating to invite page for ${targetName}: ${inviteUrl}`);
  
  // Create new tab directly to the invite page
  const newTab = await chrome.tabs.create({ 
    url: inviteUrl,
    active: true
  });
  
  activeProfileTabId = newTab.id;
  
  try {
    // Wait for tab to load
    await waitForTabLoad(newTab.id);
    
    // Check stop signal again
    const stopCheck2 = await chrome.storage.local.get(['stopSignal']);
    if (stopCheck2.stopSignal || shouldStopOperations) {
      activeProfileTabId = null;
      return { success: false, error: 'Stopped by user' };
    }
    
    // Give page extra time to render
    await sleep(3000);
    
    // Send message to content script on the invite page
    const result = await chrome.tabs.sendMessage(newTab.id, {
      action: 'connectOnInvitePage',
      data: { message, targetName }
    });
    
    console.log('Invite page result:', result);
    
    // Close the invite tab after successful send
    if (result && result.success) {
      try {
        await chrome.tabs.remove(newTab.id);
        console.log('Closed invite tab after successful send');
      } catch (e) {
        console.log('Could not close invite tab:', e.message);
      }
    }
    
    activeProfileTabId = null;
    return result || { success: false, error: 'No response from content script' };
    
  } catch (error) {
    console.error('Error in invite page tab:', error);
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
    
    // Check if already loaded
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }).catch(() => {});
    
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
 * Generate AI message using Groq API
 */
async function generateAIMessage(data) {
  const { userInfo, targetInfo, tone, includeSettings, groqApiKey } = data;
  
  if (!groqApiKey) {
    return { success: false, error: 'No API key' };
  }
  
  const targetFirst = (targetInfo.name || 'there').split(' ')[0];
  const targetTitle = targetInfo.title || '';
  const userName = userInfo.preferred_name || userInfo.first_name || userInfo.name || 'User';
  const userExp = userInfo.experience_level || 'mid';
  const isCasual = tone === 'casual';
  
  // Seniority detection
  const userLevel = { student: 1, entry: 2, mid: 3, senior: 4, lead: 5, director: 6, executive: 7, professor: 6 }[userExp] || 3;
  const targetLevel = detectSeniority(targetTitle);
  const diff = targetLevel - userLevel;
  const relationship = diff >= 3 ? 'much_senior' : diff >= 1 ? 'senior' : diff === 0 ? 'peer' : 'junior';
  
  // Build include parts
  const school = userInfo.school ? (isCasual ? getShortName(userInfo.school) : userInfo.school) : '';
  const major = userInfo.major ? (isCasual ? getShortMajor(userInfo.major) : userInfo.major) : '';
  const includeParts = [];
  if (includeSettings.title && userInfo.current_title) includeParts.push(`mention your role as ${userInfo.current_title}`);
  if (includeSettings.company && userInfo.current_company) includeParts.push(`mention you work at ${userInfo.current_company}`);
  if (includeSettings.school && school) {
    if (includeSettings.major && major) includeParts.push(`mention you studied ${major} at ${school}`);
    else includeParts.push(`mention you're from ${school}`);
  } else if (includeSettings.major && major) {
    includeParts.push(`mention you studied ${major}`);
  }
  if (includeSettings.email && userInfo.email) includeParts.push(`include your email ${userInfo.email}`);
  const includeText = includeParts.length > 0 ? 'Include: ' + includeParts.join(', ') + '.' : '';
  
  // Seniority context
  const expDesc = { student: 'a student', entry: 'early in their career', mid: 'a mid-level professional', senior: 'a senior professional', lead: 'a team lead/manager', director: 'a director-level professional', executive: 'an executive', professor: 'an academic/professor' }[userExp] || 'a professional';
  const relGuidance = {
    much_senior: `The recipient (${targetTitle}) is SIGNIFICANTLY more senior than you (${expDesc}). Be respectful and humble. Do NOT call them 'fellow' anything.`,
    senior: `The recipient (${targetTitle}) is more senior than you (${expDesc}). Be respectful.`,
    peer: `The recipient (${targetTitle}) is at a similar level to you (${expDesc}). You can be collegial.`,
    junior: `The recipient is less senior than you. Be warm and supportive.`
  }[relationship] || '';
  
  // Tone-specific rules
  let extraRules = '';
  if (relationship === 'much_senior') extraRules = '\n- Show genuine respect for their experience\n- NEVER use "fellow" or imply you\'re at the same level\n- Be humble but not overly self-deprecating';
  else if (relationship === 'senior') extraRules = '\n- Show respect for their experience\n- NEVER use "fellow" unless you truly share something specific';
  else if (relationship === 'peer') extraRules = '\n- Can use "fellow [role]" if appropriate\n- Be warm and genuine';
  
  const systemPrompt = `You write short LinkedIn connection messages. Be ${isCasual ? 'friendly and ' : ''}${relationship === 'much_senior' ? 'respectful, humble, and professional' : relationship === 'senior' ? 'respectful and professional' : 'friendly and collegial'}.

RULES:
- Under 280 characters total
- Start with "Hi [Name],"
- End with a statement (NOT a question)
- NO questions at all in the message
- NO sign-offs like "Best regards" or "Thanks"
- Be genuine and specific
- Use school/major abbreviations when provided${extraRules}

BANNED PHRASES: "came across your profile", "expand our network", "touch base", "I noticed"

Write ONLY the message text, nothing else.`;
  
  const variation = Math.floor(Math.random() * 9000) + 1000;
  const purpose = userInfo.connection_purpose || 'networking and professional growth';
  let userPrompt = `[Message #${variation}]\n\nSENIORITY CONTEXT: ${relGuidance}\n\nWrite a connection request from ${userName} (${expDesc}) to ${targetFirst}`;
  if (targetTitle) userPrompt += ` (${targetTitle})`;
  userPrompt += `.\n\nTone: ${isCasual ? 'Casual but respectful' : 'Professional'}\nPurpose: ${purpose}\n${includeText}\n\nRemember the seniority difference! Write a short, appropriate message (under 280 chars):`;
  
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 150,
        temperature: 0.95
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      let msg = data.choices[0].message.content.trim().replace(/^["']+|["']+$/g, '');
      msg = msg.split('\n')[0]; // First line only
      if (msg.length > 300) msg = msg.substring(0, 297) + '...';
      return { success: true, message: msg };
    } else {
      const errText = await response.text();
      console.error('Groq API error:', response.status, errText);
      return { success: false, error: `Groq API error: ${response.status}` };
    }
  } catch (error) {
    console.error('Groq API call failed:', error);
    return { success: false, error: error.message };
  }
}

function detectSeniority(title) {
  if (!title) return 3;
  const t = title.toLowerCase();
  if (/\b(ceo|cto|cfo|coo|cmo|founder|president)\b/.test(t)) return 7;
  if (/\b(vice president|vp|director|head of|dean)\b/.test(t)) return 6;
  if (/\b(manager|lead|principal|staff|professor)\b/.test(t)) return 5;
  if (/\b(senior|sr\.?)\b/.test(t)) return 4;
  if (/\b(junior|jr\.?|associate|entry)\b/.test(t)) return 2;
  if (/\b(intern|student|trainee|graduate)\b/.test(t)) return 1;
  return 3;
}

const SCHOOL_ABBR = { 'university of pennsylvania': 'UPenn', 'massachusetts institute of technology': 'MIT', 'california institute of technology': 'Caltech', 'university of california, berkeley': 'UC Berkeley', 'university of california, los angeles': 'UCLA', 'university of southern california': 'USC', 'new york university': 'NYU', 'carnegie mellon university': 'CMU', 'georgia institute of technology': 'Georgia Tech', 'stanford university': 'Stanford', 'harvard university': 'Harvard', 'yale university': 'Yale', 'princeton university': 'Princeton', 'columbia university': 'Columbia', 'cornell university': 'Cornell', 'duke university': 'Duke', 'northwestern university': 'Northwestern', 'johns hopkins university': 'Johns Hopkins', 'university of michigan': 'UMich', 'university of texas at austin': 'UT Austin', 'university of illinois urbana-champaign': 'UIUC', 'purdue university': 'Purdue', 'boston university': 'BU' };
function getShortName(s) { return SCHOOL_ABBR[s.toLowerCase().trim()] || s; }

const MAJOR_ABBR = { 'computer science': 'CS', 'electrical engineering': 'EE', 'electrical and computer engineering': 'ECE', 'mechanical engineering': 'MechE', 'economics': 'Econ', 'mathematics': 'Math', 'political science': 'Poli Sci', 'information technology': 'IT' };
function getShortMajor(m) { return MAJOR_ABBR[m.toLowerCase().trim()] || m; }

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
