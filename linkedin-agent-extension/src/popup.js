// DOM Elements
const scanBtn = document.getElementById('scanBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const saveToServerBtn = document.getElementById('saveToServerBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const resultsSection = document.getElementById('resultsSection');
const resultsList = document.getElementById('resultsList');
const postCount = document.getElementById('postCount');
const logContent = document.getElementById('logContent');

// Server status elements
const serverDot = document.getElementById('serverDot');
const serverText = document.getElementById('serverText');
const statsSection = document.getElementById('statsSection');
const statTotalJobs = document.getElementById('statTotalJobs');
const statAvgScore = document.getElementById('statAvgScore');
const statToday = document.getElementById('statToday');

// Settings elements
const serverUrlInput = document.getElementById('serverUrl');
const userEmailInput = document.getElementById('userEmail');
const targetRoleInput = document.getElementById('targetRole');
const locationInput = document.getElementById('location');
const apiKeyInput = document.getElementById('apiKey');
const saveSettingsBtn = document.getElementById('saveSettings');
const registerBtn = document.getElementById('registerBtn');

// Profile elements
const firstNameInput = document.getElementById('firstName');
const lastNameInput = document.getElementById('lastName');
const phoneInput = document.getElementById('phone');
const cityInput = document.getElementById('city');
const linkedinUrlInput = document.getElementById('linkedinUrl');
const githubUrlInput = document.getElementById('githubUrl');
const portfolioUrlInput = document.getElementById('portfolioUrl');
const saveProfileBtn = document.getElementById('saveProfile');
const showAutoFillBtnCheckbox = document.getElementById('showAutoFillBtn');

// Job application elements
const getJobDetailsBtn = document.getElementById('getJobDetailsBtn');
const applyBtn = document.getElementById('applyBtn');
const autoFillBtn = document.getElementById('autoFillBtn');
const currentJobInfo = document.getElementById('currentJobInfo');
const jobInfoTitle = document.getElementById('jobInfoTitle');
const jobInfoCompany = document.getElementById('jobInfoCompany');
const jobInfoLocation = document.getElementById('jobInfoLocation');
const hiringTeamSection = document.getElementById('hiringTeamSection');
const hiringTeamList = document.getElementById('hiringTeamList');
const applyUrlSection = document.getElementById('applyUrlSection');
const externalApplyLink = document.getElementById('externalApplyLink');

// Universal auto-fill elements
const universalAutoFillBtn = document.getElementById('universalAutoFillBtn');
const universalFillStatus = document.getElementById('universalFillStatus');

// Messaging elements
const messageTemplate = document.getElementById('messageTemplate');
const sendToAllHirersBtn = document.getElementById('sendToAllHirersBtn');
const generateAiMessageBtn = document.getElementById('generateAiMessageBtn');
const messageStatus = document.getElementById('messageStatus');

// State
let scannedPosts = [];
let analyzedPosts = [];
let userToken = null;
let serverConnected = false;
let currentJobDetails = null;
let currentHiringTeam = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadProfile();
  await loadLog();
  await checkServerConnection();
  updateStatus('ready', 'Ready to scan');
});

// Universal Auto-Fill Button - works on ANY website!
universalAutoFillBtn.addEventListener('click', async () => {
  universalFillStatus.textContent = '⏳ Scanning all frames...';
  universalFillStatus.style.color = '#666';
  universalAutoFillBtn.disabled = true;
  
  // Get user profile from storage
  const profile = await chrome.storage.local.get([
    'firstName', 'lastName', 'phone', 'city', 
    'linkedinUrl', 'githubUrl', 'portfolioUrl', 'userEmail'
  ]);
  
  const userProfile = {
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
    email: profile.userEmail || '',
    phone: profile.phone || '',
    city: profile.city || '',
    linkedinUrl: profile.linkedinUrl || '',
    githubUrl: profile.githubUrl || '',
    portfolioUrl: profile.portfolioUrl || ''
  };
  
  console.log('Universal Auto-fill profile:', userProfile);
  
  // Check if profile has data
  if (!userProfile.firstName && !userProfile.email) {
    universalFillStatus.textContent = '❌ Set up your Profile first (expand 👤 Profile section)';
    universalFillStatus.style.color = '#dc2626';
    universalAutoFillBtn.disabled = false;
    return;
  }
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // This function will be injected into ALL frames (including cross-origin!)
    const fillFunction = (profile) => {
      console.log('🤖 [Injected] AutoFill running in frame:', window.location.href);
      
      const filled = [];
      const doc = document;
      
      // Log what we find
      const allInputs = doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])');
      console.log(`   Found ${allInputs.length} text inputs in this frame`);
      
      if (allInputs.length > 0) {
        allInputs.forEach((inp, i) => {
          console.log(`   [${i}] id="${inp.id}" name="${inp.name}" type="${inp.type}" aria-label="${inp.getAttribute('aria-label')}"`);
        });
      }
      
      // Field targets with multiple possible identifiers
      const targets = [
        { ids: ['first_name', 'firstname', 'fname', 'first-name'], ariaLabels: ['First Name', 'First name'], autocomplete: 'given-name', value: profile.firstName, label: 'First Name' },
        { ids: ['last_name', 'lastname', 'lname', 'last-name', 'surname'], ariaLabels: ['Last Name', 'Last name'], autocomplete: 'family-name', value: profile.lastName, label: 'Last Name' },
        { ids: ['email', 'emailaddress', 'email_address'], ariaLabels: ['Email', 'Email Address'], autocomplete: 'email', value: profile.email, label: 'Email' },
        { ids: ['phone', 'telephone', 'tel', 'mobile', 'phonenumber'], ariaLabels: ['Phone', 'Phone Number', 'Telephone'], autocomplete: 'tel', value: profile.phone, label: 'Phone' },
        { ids: ['linkedin', 'linkedinurl', 'linkedin_url', 'linkedinprofile'], ariaLabels: ['LinkedIn', 'LinkedIn Profile', 'LinkedIn URL'], value: profile.linkedinUrl, label: 'LinkedIn' },
        { ids: ['city', 'location'], ariaLabels: ['City', 'Location'], value: profile.city, label: 'City' },
        { ids: ['github', 'githuburl'], ariaLabels: ['GitHub', 'GitHub URL'], value: profile.githubUrl, label: 'GitHub' },
        { ids: ['website', 'portfolio', 'portfoliourl'], ariaLabels: ['Website', 'Portfolio'], value: profile.portfolioUrl, label: 'Portfolio' },
      ];
      
      const fillInput = (input, value) => {
        if (!input || input.disabled || input.readOnly) return false;
        
        try {
          input.focus();
          
          // Use native setter for React compatibility
          const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
                            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
          
          if (descriptor && descriptor.set) {
            descriptor.set.call(input, value);
          } else {
            input.value = value;
          }
          
          // Trigger all necessary events
          input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
          input.dispatchEvent(new Event('blur', { bubbles: true }));
          
          return true;
        } catch (e) {
          console.error('Error filling input:', e);
          return false;
        }
      };
      
      for (const target of targets) {
        if (!target.value) continue;
        
        let input = null;
        
        // Method 1: Try exact ID match
        for (const id of target.ids) {
          input = doc.getElementById(id);
          if (input) break;
        }
        
        // Method 2: Try name attribute
        if (!input) {
          for (const id of target.ids) {
            input = doc.querySelector(`input[name="${id}"], textarea[name="${id}"]`);
            if (input) break;
          }
        }
        
        // Method 3: Try partial ID/name match (case insensitive)
        if (!input) {
          for (const id of target.ids) {
            input = doc.querySelector(`input[id*="${id}" i]:not([type="hidden"]), input[name*="${id}" i]:not([type="hidden"])`);
            if (input) break;
          }
        }
        
        // Method 4: Try aria-label
        if (!input && target.ariaLabels) {
          for (const label of target.ariaLabels) {
            input = doc.querySelector(`input[aria-label="${label}"], textarea[aria-label="${label}"]`);
            if (input) break;
          }
        }
        
        // Method 5: Try autocomplete attribute
        if (!input && target.autocomplete) {
          input = doc.querySelector(`input[autocomplete="${target.autocomplete}"]`);
        }
        
        // Method 6: Try label text
        if (!input) {
          const labels = doc.querySelectorAll('label');
          for (const lbl of labels) {
            const labelText = lbl.textContent.toLowerCase().trim();
            if (target.ids.some(id => labelText.includes(id.replace('_', ' ')))) {
              const forId = lbl.getAttribute('for');
              if (forId) {
                input = doc.getElementById(forId);
              } else {
                input = lbl.querySelector('input, textarea');
              }
              if (input) break;
            }
          }
        }
        
        if (input && fillInput(input, target.value)) {
          filled.push(target.label);
          console.log(`   ✅ Filled ${target.label}: ${input.id || input.name}`);
        }
      }
      
      return { 
        success: filled.length > 0, 
        filledFields: filled, 
        url: window.location.href,
        inputCount: allInputs.length
      };
    };
    
    // Execute in ALL frames (this is the key - allFrames: true works on cross-origin!)
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: fillFunction,
      args: [userProfile]
    });
    
    console.log('All frame results:', results);
    
    // Collect results from all frames
    const allFilled = [];
    let totalInputs = 0;
    let framesWithInputs = 0;
    
    for (const result of results) {
      if (result.result) {
        totalInputs += result.result.inputCount || 0;
        if (result.result.inputCount > 0) framesWithInputs++;
        if (result.result.filledFields && result.result.filledFields.length > 0) {
          allFilled.push(...result.result.filledFields);
          console.log(`✅ Frame filled:`, result.result);
        }
      }
    }
    
    const uniqueFilled = [...new Set(allFilled)];
    
    if (uniqueFilled.length > 0) {
      universalFillStatus.innerHTML = `✅ Filled <strong>${uniqueFilled.length}</strong> fields: ${uniqueFilled.join(', ')}`;
      universalFillStatus.style.color = '#16a34a';
      addLog(`Auto-filled: ${uniqueFilled.join(', ')}`);
    } else if (totalInputs === 0) {
      universalFillStatus.textContent = `❌ No form inputs found (checked ${results.length} frames)`;
      universalFillStatus.style.color = '#dc2626';
    } else {
      universalFillStatus.textContent = `⚠️ Found ${totalInputs} inputs in ${framesWithInputs} frame(s) but couldn't match fields`;
      universalFillStatus.style.color = '#d97706';
    }
    
  } catch (error) {
    console.error('Universal auto-fill error:', error);
    universalFillStatus.textContent = '❌ Error: ' + error.message;
    universalFillStatus.style.color = '#dc2626';
  }
  
  universalAutoFillBtn.disabled = false;
});

// Check server connection
async function checkServerConnection() {
  const settings = await chrome.storage.local.get(['serverUrl', 'userToken']);
  const serverUrl = settings.serverUrl || 'http://localhost:8000';
  userToken = settings.userToken;
  
  serverDot.className = 'server-dot checking';
  serverText.textContent = 'Connecting to server...';
  
  try {
    const response = await fetch(`${serverUrl}/api/health/`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      serverConnected = true;
      serverDot.className = 'server-dot connected';
      serverText.textContent = `✓ Connected to ${serverUrl}`;
      
      // If we have a token, fetch user stats
      if (userToken) {
        await fetchUserStats();
      }
    } else {
      throw new Error('Server returned error');
    }
  } catch (error) {
    serverConnected = false;
    serverDot.className = 'server-dot disconnected';
    serverText.textContent = '✗ Server offline (using local mode)';
    console.log('Server connection failed:', error);
  }
}

// Fetch user stats from backend
async function fetchUserStats() {
  const settings = await chrome.storage.local.get(['serverUrl']);
  const serverUrl = settings.serverUrl || 'http://localhost:8000';
  
  try {
    const response = await fetch(`${serverUrl}/api/stats/`, {
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const stats = await response.json();
      
      // Show stats section
      statsSection.style.display = 'flex';
      statTotalJobs.textContent = stats.totalJobsScanned || 0;
      statAvgScore.textContent = `${stats.averageMatchScore || 0}%`;
      statToday.textContent = stats.jobsScannedToday || 0;
    }
  } catch (error) {
    console.error('Failed to fetch stats:', error);
  }
}

// Register/Login button
registerBtn.addEventListener('click', async () => {
  const email = userEmailInput.value.trim();
  const settings = await chrome.storage.local.get(['serverUrl']);
  const serverUrl = settings.serverUrl || 'http://localhost:8000';
  
  if (!email) {
    alert('Please enter your email');
    return;
  }
  
  if (!serverConnected) {
    alert('Server is not connected. Please check server URL.');
    return;
  }
  
  try {
    // Try login first
    let response = await fetch(`${serverUrl}/api/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    // If user not found, register
    if (response.status === 404) {
      response = await fetch(`${serverUrl}/api/auth/register/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
    }
    
    if (response.ok) {
      const data = await response.json();
      userToken = data.token;
      
      // Save token
      await chrome.storage.local.set({ userToken: data.token });
      
      addLog(`Logged in as ${email}`);
      registerBtn.textContent = '✓ Logged In';
      registerBtn.style.background = '#16a34a';
      
      // Update settings on server if we have API key
      const apiKey = apiKeyInput.value.trim();
      if (apiKey) {
        await updateServerSettings();
      }
      
      // Fetch stats
      await fetchUserStats();
    } else {
      const error = await response.json();
      alert('Login failed: ' + (error.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Login error:', error);
    alert('Failed to connect to server');
  }
});

// Load saved settings
async function loadSettings() {
  const settings = await chrome.storage.local.get([
    'serverUrl', 'userEmail', 'targetRole', 'location', 'apiKey', 'userToken'
  ]);
  
  if (settings.serverUrl) serverUrlInput.value = settings.serverUrl;
  else serverUrlInput.value = 'http://localhost:8000';
  
  if (settings.userEmail) userEmailInput.value = settings.userEmail;
  if (settings.targetRole) targetRoleInput.value = settings.targetRole;
  if (settings.location) locationInput.value = settings.location;
  if (settings.apiKey) apiKeyInput.value = settings.apiKey;
  
  if (settings.userToken) {
    userToken = settings.userToken;
    registerBtn.textContent = '✓ Logged In';
    registerBtn.style.background = '#16a34a';
  }
}

// Save settings
saveSettingsBtn.addEventListener('click', async () => {
  // Save locally
  await chrome.storage.local.set({
    serverUrl: serverUrlInput.value.trim() || 'http://localhost:8000',
    userEmail: userEmailInput.value.trim(),
    targetRole: targetRoleInput.value,
    location: locationInput.value,
    apiKey: apiKeyInput.value
  });
  
  addLog('Settings saved locally');
  
  // Also save to server if connected and logged in
  if (serverConnected && userToken) {
    await updateServerSettings();
  }
  
  saveSettingsBtn.textContent = '✓ Saved';
  setTimeout(() => {
    saveSettingsBtn.textContent = 'Save Settings';
  }, 1500);
  
  // Re-check server connection with new URL
  await checkServerConnection();
});

// Update settings on server
async function updateServerSettings() {
  const settings = await chrome.storage.local.get(['serverUrl']);
  const serverUrl = settings.serverUrl || 'http://localhost:8000';
  
  try {
    const response = await fetch(`${serverUrl}/api/user/settings/`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target_role: targetRoleInput.value,
        location: locationInput.value,
        api_key: apiKeyInput.value
      })
    });
    
    if (response.ok) {
      addLog('Settings synced to server');
    }
  } catch (error) {
    console.error('Failed to sync settings:', error);
  }
}

// Scan button click
scanBtn.addEventListener('click', async () => {
  updateStatus('scanning', 'Scanning LinkedIn page...');
  scanBtn.disabled = true;

  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if we're on LinkedIn
    if (!tab.url.includes('linkedin.com')) {
      updateStatus('error', 'Please open LinkedIn first');
      addLog('Error: Not on LinkedIn');
      scanBtn.disabled = false;
      return;
    }

    // Inject and execute content script to scan the page
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scanLinkedInPosts
    });

    const posts = results[0]?.result || [];
    scannedPosts = posts;

    // Display results
    displayResults(posts);
    
    if (posts.length > 0) {
      updateStatus('ready', `Found ${posts.length} items`);
      analyzeBtn.disabled = false;
      saveToServerBtn.disabled = !serverConnected || !userToken;
      addLog(`Scanned: found ${posts.length} items`);
    } else {
      updateStatus('ready', 'No items found on this page');
      addLog('Scanned: no items found');
    }

  } catch (error) {
    console.error('Scan error:', error);
    updateStatus('error', 'Error scanning page');
    addLog(`Error: ${error.message}`);
  }

  scanBtn.disabled = false;
});

// Analyze with AI button click
analyzeBtn.addEventListener('click', async () => {
  if (scannedPosts.length === 0) {
    updateStatus('error', 'Scan first before analyzing');
    return;
  }
  
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) {
    updateStatus('error', 'Add OpenAI API key in Settings');
    addLog('Error: No API key configured');
    return;
  }
  
  // First, check if service worker is alive
  updateStatus('scanning', 'Connecting to AI...');
  
  try {
    const pingResponse = await chrome.runtime.sendMessage({ action: 'ping' });
    console.log('Service worker ping response:', pingResponse);
  } catch (err) {
    console.error('Service worker not responding:', err);
    updateStatus('error', 'Extension error - try reloading');
    addLog('Error: Service worker not responding');
    return;
  }
  
  updateStatus('scanning', 'Analyzing with AI...');
  analyzeBtn.disabled = true;
  addLog('Starting AI analysis...');
  
  // Get user profile for matching
  const settings = await chrome.storage.local.get(['targetRole', 'location']);
  const userProfile = {
    targetRole: settings.targetRole || 'Software Engineer',
    location: settings.location || ''
  };
  
  // Analyze each post (limit to first 5 to save API calls)
  const postsToAnalyze = scannedPosts.slice(0, 5);
  analyzedPosts = [];
  
  for (let i = 0; i < postsToAnalyze.length; i++) {
    const post = postsToAnalyze[i];
    updateStatus('scanning', `Analyzing ${i + 1}/${postsToAnalyze.length}...`);
    
    try {
      // Add timeout to the message
      const analysisPromise = chrome.runtime.sendMessage({
        action: 'analyzePost',
        post: post,
        userProfile: userProfile
      });
      
      // 30 second timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 30000)
      );
      
      const analysis = await Promise.race([analysisPromise, timeoutPromise]);
      console.log('Analysis result for post', i, ':', analysis);
      
      analyzedPosts.push({
        ...post,
        analysis: analysis
      });
    } catch (error) {
      console.error('Analysis error for post:', error);
      addLog(`Error analyzing post ${i + 1}: ${error.message}`);
      analyzedPosts.push({
        ...post,
        analysis: { error: error.message, matchScore: 0, reason: 'Analysis failed' }
      });
    }
    
    // Small delay between API calls
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Display analyzed results
  displayAnalyzedResults(analyzedPosts);
  updateStatus('ready', `Analyzed ${analyzedPosts.length} items`);
  addLog(`AI analysis complete: ${analyzedPosts.length} items`);
  analyzeBtn.disabled = false;
});

// Display AI-analyzed results
function displayAnalyzedResults(posts) {
  resultsSection.style.display = 'block';
  postCount.textContent = `(${posts.length} analyzed)`;
  
  // Sort by match score
  posts.sort((a, b) => {
    const scoreA = a.analysis?.matchScore || 0;
    const scoreB = b.analysis?.matchScore || 0;
    return scoreB - scoreA;
  });
  
  resultsList.innerHTML = posts.map(post => {
    const analysis = post.analysis || {};
    const score = analysis.matchScore || 0;
    const scoreColor = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
    const typeLabel = post.type === 'job' || post.type === 'job-detail' ? '💼' : '📝';
    
    return `
    <div class="post-item" data-id="${post.id}" style="border-left: 3px solid ${scoreColor};">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span class="post-author">${escapeHtml(post.author)} ${typeLabel}</span>
        <span style="background:${scoreColor};color:white;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${score}%</span>
      </div>
      <div style="font-size:12px;color:#333;margin-bottom:4px;font-weight:500;">${escapeHtml(analysis.role || post.title || '')}</div>
      <div class="post-preview">${escapeHtml(analysis.reason || post.content.substring(0, 80))}...</div>
      <div class="post-meta" style="margin-top:6px;">
        <button class="generate-msg-btn" data-id="${post.id}" style="padding:4px 8px;font-size:10px;background:#667eea;color:white;border:none;border-radius:4px;cursor:pointer;">
          ✉️ Generate Message
        </button>
      </div>
    </div>
  `}).join('');
  
  // Add click handlers for generate message buttons
  document.querySelectorAll('.generate-msg-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const postId = e.target.dataset.id;
      const post = posts.find(p => String(p.id) === postId);
      if (post) {
        await generateMessage(post);
      }
    });
  });
}

// Generate connection message for a post
async function generateMessage(post) {
  updateStatus('scanning', 'Generating message...');
  
  const settings = await chrome.storage.local.get(['targetRole', 'location']);
  const userProfile = {
    targetRole: settings.targetRole || 'Software Engineer',
    location: settings.location || ''
  };
  
  try {
    const result = await chrome.runtime.sendMessage({
      action: 'generateMessage',
      post: post,
      userProfile: userProfile
    });
    
    if (result.message) {
      // Show message in a simple alert/prompt for now
      const message = result.message;
      
      // Copy to clipboard
      await navigator.clipboard.writeText(message);
      
      updateStatus('ready', 'Message copied to clipboard!');
      addLog(`Generated message for ${post.author}`);
      
      // Show the message
      alert(`Message copied to clipboard:\n\n${message}`);
    }
  } catch (error) {
    console.error('Generate message error:', error);
    updateStatus('error', 'Failed to generate message');
    addLog(`Error generating message: ${error.message}`);
  }
}

// Save scanned jobs to server
saveToServerBtn.addEventListener('click', async () => {
  if (!serverConnected || !userToken) {
    alert('Please connect to server and login first');
    return;
  }
  
  // Check for jobs from different sources
  let jobsToSave = [];
  
  // Source 1: Analyzed posts (from batch scan)
  if (analyzedPosts.length > 0) {
    jobsToSave = analyzedPosts;
  } 
  // Source 2: Scanned posts (from batch scan)
  else if (scannedPosts.length > 0) {
    jobsToSave = scannedPosts;
  }
  // Source 3: Current job details (from Get Job Details)
  else if (currentJobDetails && currentJobDetails.jobTitle) {
    jobsToSave = [currentJobDetails];
  }
  
  if (jobsToSave.length === 0) {
    alert('No jobs to save. Use "Get Job Details" or scan jobs first.');
    return;
  }
  
  updateStatus('scanning', 'Saving to server...');
  saveToServerBtn.disabled = true;
  
  const settings = await chrome.storage.local.get(['serverUrl']);
  const serverUrl = settings.serverUrl || 'http://localhost:8000';
  
  // Get current tab URL as fallback
  let currentTabUrl = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabUrl = tab.url || '';
  } catch (e) {}
  
  try {
    const jobsData = jobsToSave.map(job => {
      // Handle both scannedPosts format and currentJobDetails format
      const isCurrentJobDetails = job.jobTitle !== undefined;
      
      return {
        linkedinUrl: job.url || job.postUrl || currentTabUrl,
        jobId: job.id || job.jobId || '',
        title: isCurrentJobDetails ? job.jobTitle : job.title,
        company: job.company || job.author || '',
        location: job.location || '',
        description: job.content || job.description || '',
        externalApplyUrl: job.applyUrl || job.externalApplyUrl || '',
        hasEasyApply: job.applyType === 'easy-apply' || job.hasEasyApply || false,
        status: 'apply_later',
        matchScore: job.analysis?.matchScore || job.matchScore || null,
        analysis: job.analysis || null,
        hiringTeam: job.hiringTeam || []
      };
    });
    
    console.log('Saving jobs:', jobsData);
    
    const response = await fetch(`${serverUrl}/api/jobs/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ jobs: jobsData })
    });
    
    const responseText = await response.text();
    console.log('Server response status:', response.status);
    console.log('Server response body:', responseText);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}`);
    }
    
    if (response.ok) {
      const created = data.created || [];
      const updated = data.updated || [];
      const skipped = data.skipped || [];
      const totalSaved = created.length + updated.length;
      updateStatus('ready', `✓ Saved ${totalSaved} job(s) to server`);
      addLog(`Created: ${created.length}, Updated: ${updated.length}, Skipped: ${skipped.length}`);
      
      // Refresh stats
      await fetchUserStats();
    } else {
      console.error('Server error response:', data);
      throw new Error(data.error || JSON.stringify(data.errors) || data.detail || 'Save failed');
    }
  } catch (error) {
    console.error('Save to server error:', error);
    updateStatus('error', 'Failed to save to server');
    addLog(`Error: ${error.message}`);
  }
  
  saveToServerBtn.disabled = false;
});

// Function to be injected into LinkedIn page
function scanLinkedInPosts() {
  const url = window.location.href;
  let results = [];
  
  console.log('🤖 Scanning:', url);
  
  // === JOBS PAGE (all job-related URLs) ===
  if (url.includes('/jobs/')) {
    
    // Strategy 1: Find by data-view-name="job-card" (works on collections/recommended pages)
    let jobCards = document.querySelectorAll('[data-view-name="job-card"]');
    console.log(`🔍 Found ${jobCards.length} cards with data-view-name="job-card"`);
    
    // Strategy 2: Find by class wrapper (works on search-results pages)
    if (jobCards.length === 0) {
      jobCards = document.querySelectorAll('.job-card-job-posting-card-wrapper, [data-job-id]');
      console.log(`🔍 Found ${jobCards.length} cards with class wrapper`);
    }
    
    // Strategy 3: Find all links to job postings and get their containers
    if (jobCards.length === 0) {
      const jobLinks = document.querySelectorAll('a[href*="/jobs/view/"], a[href*="currentJobId"]');
      console.log(`🔍 Found ${jobLinks.length} job links`);
      
      // Get unique parent containers
      const containers = new Set();
      jobLinks.forEach(link => {
        // Go up to find a reasonable container
        let parent = link.closest('[data-view-name="job-card"]') || 
                     link.closest('.job-card-job-posting-card-wrapper') ||
                     link.closest('[data-job-id]') ||
                     link.parentElement?.parentElement;
        if (parent) containers.add(parent);
      });
      jobCards = Array.from(containers);
      console.log(`🔍 Found ${jobCards.length} unique job containers from links`);
    }
    
    jobCards.forEach((card, index) => {
      try {
        // Try multiple ways to get job title
        let title = '';
        let company = '';
        let location = '';
        let jobId = index;
        
        // Method 1: artdeco-entity-lockup (search results)
        const titleEl = card.querySelector('.artdeco-entity-lockup__title strong');
        if (titleEl) {
          title = titleEl.textContent?.trim() || '';
        }
        
        // Method 2: Find from link text or aria-label
        if (!title) {
          const link = card.querySelector('a[href*="currentJobId"], a[href*="/jobs/view/"]');
          if (link) {
            // Try aria-label first
            title = link.getAttribute('aria-label') || '';
            
            // Try text content if no aria-label
            if (!title) {
              // Get text but exclude nested elements that might have other info
              const strongEl = link.querySelector('strong');
              title = strongEl?.textContent?.trim() || '';
            }
            
            // Extract job ID from URL
            const match = link.href.match(/currentJobId=(\d+)|\/jobs\/view\/(\d+)/);
            if (match) {
              jobId = match[1] || match[2];
            }
          }
        }
        
        // Method 3: Look for visually hidden text that often has the title
        if (!title) {
          const hiddenText = card.querySelector('.visually-hidden, [class*="visually-hidden"]');
          if (hiddenText) {
            title = hiddenText.textContent?.trim()?.substring(0, 200) || '';
          }
        }
        
        // Method 4: Get text content and parse first meaningful line
        if (!title) {
          const text = card.textContent?.trim() || '';
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5 && l.length < 200);
          if (lines.length > 0) {
            title = lines[0];
          }
        }
        
        // Get company from logo alt or subtitle
        const logoImg = card.querySelector('img[alt]');
        if (logoImg && logoImg.alt && !logoImg.alt.includes('photo')) {
          company = logoImg.alt.replace(/ logo$/i, '').trim();
        }
        
        if (!company) {
          const subtitleEl = card.querySelector('.artdeco-entity-lockup__subtitle, [class*="subtitle"]');
          company = subtitleEl?.textContent?.trim() || '';
        }
        
        // Get location
        const captionEl = card.querySelector('.artdeco-entity-lockup__caption, [class*="caption"]');
        location = captionEl?.textContent?.trim() || '';
        
        console.log(`  📋 Job ${index}: "${title?.substring(0, 50)}..." at "${company}"`);
        
        // Only add if we got some meaningful info
        if (title && title.length > 3) {
          results.push({
            id: `job-${jobId}`,
            type: 'job',
            author: company || 'Unknown Company',
            title: title.substring(0, 200),
            content: `${title} at ${company}. ${location}`.trim().substring(0, 500),
            time: '',
            isHiring: true,
            isRecent: true
          });
        }
      } catch (e) {
        console.error('Error parsing job card:', e);
      }
    });
    
    // Main job detail panel (right side) - currently viewing
    const detailSelectors = [
      '.job-details-jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title',
      'h1.t-24',
      '.jobs-details__main-content h1'
    ];
    
    let jobTitle = null;
    for (const selector of detailSelectors) {
      jobTitle = document.querySelector(selector);
      if (jobTitle && jobTitle.textContent?.trim()) break;
    }
    
    const companySelectors = [
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name'
    ];
    
    let jobCompany = null;
    for (const selector of companySelectors) {
      jobCompany = document.querySelector(selector);
      if (jobCompany && jobCompany.textContent?.trim()) break;
    }
    
    const descSelectors = [
      '.jobs-description__content',
      '.jobs-box__html-content',
      '.jobs-description-content__text'
    ];
    
    let jobDesc = null;
    for (const selector of descSelectors) {
      jobDesc = document.querySelector(selector);
      if (jobDesc) break;
    }
    
    if (jobTitle && jobTitle.textContent?.trim()) {
      const title = jobTitle.textContent.trim();
      const company = jobCompany?.textContent?.trim() || '';
      const desc = jobDesc?.textContent?.trim().substring(0, 500) || '';
      
      // Add current job as first item (check for duplicates)
      const titleStart = title.substring(0, 30).toLowerCase();
      const isDuplicate = results.some(r => r.title.toLowerCase().includes(titleStart));
      
      if (!isDuplicate) {
        results.unshift({
          id: 'current',
          type: 'job-detail',
          author: company || 'Unknown Company',
          title: `📌 ${title}`,
          content: desc || `${title} at ${company}`,
          time: 'Currently viewing',
          isHiring: true,
          isRecent: true,
          url: window.location.href
        });
      }
    }
    
    console.log(`🤖 Total jobs found: ${results.length}`);
  }
  
  // === FEED PAGE ===
  if (url.includes('/feed') || results.length === 0) {
    const postElements = document.querySelectorAll('.feed-shared-update-v2');
    
    postElements.forEach((postEl, index) => {
      try {
        const authorEl = postEl.querySelector('.update-components-actor__name span');
        const authorName = authorEl?.textContent?.trim() || 'Unknown';
        
        const titleEl = postEl.querySelector('.update-components-actor__description');
        const authorTitle = titleEl?.textContent?.trim() || '';
        
        const contentEl = postEl.querySelector('.feed-shared-update-v2__description, .update-components-text');
        const content = contentEl?.textContent?.trim() || '';
        
        const timeEl = postEl.querySelector('.update-components-actor__sub-description');
        const postTime = timeEl?.textContent?.trim() || '';
        
        const hiringKeywords = [
          'hiring', 'we\'re hiring', 'we are hiring', 'looking for', 
          'open position', 'open role', 'job opening', 'join our team',
          'apply now', 'dm me', 'reach out', 'send your resume'
        ];
        
        const contentLower = content.toLowerCase();
        const isHiring = hiringKeywords.some(keyword => contentLower.includes(keyword));
        
        const isRecent = postTime.includes('h') || 
                         postTime.includes('m') || 
                         postTime.includes('now') ||
                         postTime.includes('1d');
        
        results.push({
          id: `post-${index}`,
          type: 'post',
          author: authorName,
          title: authorTitle,
          content: content.substring(0, 300) + (content.length > 300 ? '...' : ''),
          time: postTime,
          isHiring: isHiring,
          isRecent: isRecent
        });
      } catch (e) {
        console.error('Error parsing post:', e);
      }
    });
  }
  
  // Sort: current job first
  results.sort((a, b) => {
    if (a.id === 'current') return -1;
    if (b.id === 'current') return 1;
    return 0;
  });
  
  console.log(`🤖 Found ${results.length} items total`);
  return results;
}

// Display scanned results
function displayResults(posts) {
  resultsSection.style.display = 'block';
  postCount.textContent = `(${posts.length})`;
  
  if (posts.length === 0) {
    resultsList.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">No items found. Try scrolling to load more content, or navigate to LinkedIn Feed or Jobs page.</p>';
    return;
  }
  
  resultsList.innerHTML = posts.map(post => {
    const typeLabel = post.type === 'job' || post.type === 'job-detail' ? '💼 Job' : '📝 Post';
    const tagClass = post.isHiring ? 'hiring' : 'maybe';
    const tagText = post.isHiring ? '✓ Hiring' : '? Maybe';
    
    return `
    <div class="post-item" data-id="${post.id}">
      <div class="post-author">${escapeHtml(post.author)} <span style="font-weight:normal;color:#888;font-size:11px;">${typeLabel}</span></div>
      <div style="font-size:12px;color:#333;margin-bottom:4px;font-weight:500;">${escapeHtml(post.title || '')}</div>
      <div class="post-preview">${escapeHtml(post.content.substring(0, 120))}...</div>
      <div class="post-meta">
        <span class="post-tag ${tagClass}">${tagText}</span>
        <span style="color:#888;font-size:10px;">${escapeHtml(post.time)}</span>
      </div>
    </div>
  `}).join('');
}

// Update status display
function updateStatus(status, text) {
  statusDot.className = 'status-dot ' + status;
  statusText.textContent = text;
}

// Activity log functions
async function addLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = { time: timestamp, message };
  
  // Get existing logs
  const { activityLog = [] } = await chrome.storage.local.get('activityLog');
  activityLog.unshift(logEntry);
  
  // Keep only last 20 logs
  const trimmedLog = activityLog.slice(0, 20);
  await chrome.storage.local.set({ activityLog: trimmedLog });
  
  renderLog(trimmedLog);
}

async function loadLog() {
  const { activityLog = [] } = await chrome.storage.local.get('activityLog');
  renderLog(activityLog);
}

function renderLog(logs) {
  if (logs.length === 0) {
    logContent.innerHTML = '<p class="log-empty">No activity yet</p>';
    return;
  }
  
  logContent.innerHTML = logs.map(log => 
    `<div class="log-item"><strong>${log.time}</strong> - ${escapeHtml(log.message)}</div>`
  ).join('');
}

// Utility: escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// PROFILE FUNCTIONS
// ============================================

async function loadProfile() {
  const profile = await chrome.storage.local.get([
    'firstName', 'lastName', 'phone', 'city', 
    'linkedinUrl', 'githubUrl', 'portfolioUrl', 'showAutoFillBtn'
  ]);
  
  if (profile.firstName) firstNameInput.value = profile.firstName;
  if (profile.lastName) lastNameInput.value = profile.lastName;
  if (profile.phone) phoneInput.value = profile.phone;
  if (profile.city) cityInput.value = profile.city;
  if (profile.linkedinUrl) linkedinUrlInput.value = profile.linkedinUrl;
  if (profile.githubUrl) githubUrlInput.value = profile.githubUrl;
  if (profile.portfolioUrl) portfolioUrlInput.value = profile.portfolioUrl;
  
  // Default to true if not set
  showAutoFillBtnCheckbox.checked = profile.showAutoFillBtn !== false;
}

saveProfileBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({
    firstName: firstNameInput.value.trim(),
    lastName: lastNameInput.value.trim(),
    phone: phoneInput.value.trim(),
    city: cityInput.value.trim(),
    linkedinUrl: linkedinUrlInput.value.trim(),
    githubUrl: githubUrlInput.value.trim(),
    portfolioUrl: portfolioUrlInput.value.trim(),
    showAutoFillBtn: showAutoFillBtnCheckbox.checked
  });
  
  addLog('Profile saved');
  saveProfileBtn.textContent = '✓ Saved';
  setTimeout(() => {
    saveProfileBtn.textContent = '💾 Save Profile';
  }, 1500);
});

// Also save when checkbox changes
showAutoFillBtnCheckbox.addEventListener('change', async () => {
  await chrome.storage.local.set({
    showAutoFillBtn: showAutoFillBtnCheckbox.checked
  });
  addLog(showAutoFillBtnCheckbox.checked ? 'Auto-fill button enabled' : 'Auto-fill button disabled');
});

// ============================================
// JOB APPLICATION FUNCTIONS
// ============================================

// Get job details from current page
getJobDetailsBtn.addEventListener('click', async () => {
  updateStatus('scanning', 'Getting job details...');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('linkedin.com')) {
      updateStatus('error', 'Please navigate to LinkedIn');
      addLog('Error: Not on LinkedIn');
      return;
    }
    
    // Try to inject content script first (in case it wasn't loaded)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/content.js']
      });
    } catch (injectError) {
      // Script might already be injected, that's ok
      console.log('Script injection:', injectError.message);
    }
    
    // Small delay to let script initialize
    await new Promise(resolve => setTimeout(resolve, 100));
    
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { action: 'getJobDetails' });
    } catch (msgError) {
      console.error('Message error:', msgError);
      // Try injecting script again and retry
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/content.js']
      });
      await new Promise(resolve => setTimeout(resolve, 300));
      response = await chrome.tabs.sendMessage(tab.id, { action: 'getJobDetails' });
    }
    
    if (response && response.jobTitle) {
      currentJobDetails = response;
      
      // Display job info
      currentJobInfo.style.display = 'block';
      jobInfoTitle.textContent = response.jobTitle || 'Unknown Position';
      jobInfoCompany.textContent = response.company || 'Unknown Company';
      jobInfoLocation.textContent = response.location || 'Location not specified';
      
      // Enable buttons
      applyBtn.disabled = false;
      autoFillBtn.disabled = false;
      
      // Show apply type - be more careful about what counts as "external"
      const isEasyApply = response.applyType === 'easy-apply';
      
      // Only treat as external URL if it's from a known ATS platform
      const knownAtsPatterns = [
        'greenhouse.io', 'lever.co', 'workday.com', 'myworkdayjobs.com',
        'icims.com', 'jobvite.com', 'smartrecruiters.com', 'ashbyhq.com',
        'breezy.hr', 'workable.com', 'bamboohr.com'
      ];
      
      const hasValidExternalUrl = response.applyUrl && 
        !response.applyUrl.includes('linkedin.com') &&
        knownAtsPatterns.some(pattern => response.applyUrl.toLowerCase().includes(pattern));
      
      console.log('Apply type:', response.applyType, 'URL:', response.applyUrl, 'isEasyApply:', isEasyApply, 'hasValidExternalUrl:', hasValidExternalUrl);
      
      if (isEasyApply) {
        applyBtn.textContent = '⚡ Easy Apply';
        applyBtn.style.background = '#22c55e';
        applyUrlSection.style.display = 'none';
      } else if (hasValidExternalUrl) {
        applyBtn.textContent = '🔗 Open Application';
        applyBtn.style.background = '#0077b5';
        externalApplyLink.href = response.applyUrl;
        externalApplyLink.textContent = '🔗 ' + (new URL(response.applyUrl).hostname);
        applyUrlSection.style.display = 'block';
      } else if (response.applyType === 'external') {
        // External but no valid ATS URL - just click the button on page
        applyBtn.textContent = '📤 Click Apply';
        applyBtn.style.background = '#22c55e';
        applyUrlSection.style.display = 'none';
        // Clear the potentially wrong URL
        currentJobDetails.applyUrl = null;
      } else if (response.applyType) {
        // Has some apply type
        applyBtn.textContent = '📤 Click Apply';
        applyBtn.style.background = '#22c55e';
        applyUrlSection.style.display = 'none';
      } else {
        applyBtn.textContent = '📤 Apply';
        applyBtn.style.background = '#888';
        applyUrlSection.style.display = 'none';
      }
      
      // Show hiring team
      if (response.hiringTeam && response.hiringTeam.length > 0) {
        currentHiringTeam = response.hiringTeam;
        hiringTeamSection.style.display = 'block';
        
        // Set default message template
        if (!messageTemplate.value) {
          const profile = await chrome.storage.local.get(['firstName', 'lastName', 'targetRole']);
          const userName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Your Name';
          messageTemplate.value = `Hi {name},

I saw you're hiring for ${response.jobTitle || '{role}'} at ${response.company || '{company}'}. I'm very interested in this opportunity and would love to learn more about the team and role.

Best regards,
${userName}`;
        }
        
        hiringTeamList.innerHTML = response.hiringTeam.map((person, index) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #fde68a;">
            <div style="flex:1;overflow:hidden;">
              <div style="font-size:12px;font-weight:500;">${escapeHtml(person.name)} ${person.connectionDegree ? `<span style="color:#888;font-size:10px;">(${escapeHtml(person.connectionDegree)})</span>` : ''}</div>
              <div style="font-size:10px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(person.title || '')}</div>
            </div>
            ${person.hasMessageButton ? 
              `<button class="btn btn-small message-hiring-btn" data-index="${index}" data-name="${escapeHtml(person.name)}" style="padding:4px 8px;font-size:10px;background:#0077b5;margin-left:4px;">💬</button>` 
              : `<span style="font-size:9px;color:#888;margin-left:4px;">Connect first</span>`}
          </div>
        `).join('');
        
        // Add click handlers for message buttons
        document.querySelectorAll('.message-hiring-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            const name = btn.dataset.name;
            messageHiringMember(name, index);
          });
        });
      } else {
        currentHiringTeam = [];
        hiringTeamSection.style.display = 'none';
      }
      
      updateStatus('ready', 'Job details loaded');
      addLog(`Loaded: ${response.jobTitle} at ${response.company}`);
      
    } else {
      updateStatus('error', 'Could not get job details');
      addLog('Error getting job details');
    }
    
  } catch (error) {
    console.error('Get job details error:', error);
    updateStatus('error', 'Please refresh the LinkedIn page and try again');
    addLog(`Error: ${error.message} - try refreshing page`);
  }
});

// Apply button click
applyBtn.addEventListener('click', async () => {
  if (!currentJobDetails) {
    alert('Please get job details first');
    return;
  }
  
  console.log('Apply clicked, job details:', currentJobDetails);
  
  // Only open URL directly if it's from a known ATS platform
  const knownAtsPatterns = [
    'greenhouse.io', 'lever.co', 'workday.com', 'myworkdayjobs.com',
    'icims.com', 'jobvite.com', 'smartrecruiters.com', 'ashbyhq.com',
    'breezy.hr', 'workable.com', 'bamboohr.com'
  ];
  
  const hasValidAtsUrl = currentJobDetails.applyUrl && 
    !currentJobDetails.applyUrl.includes('linkedin.com') &&
    knownAtsPatterns.some(pattern => currentJobDetails.applyUrl.toLowerCase().includes(pattern));
  
  if (hasValidAtsUrl) {
    console.log('Opening valid ATS URL:', currentJobDetails.applyUrl);
    chrome.tabs.create({ url: currentJobDetails.applyUrl });
    updateStatus('ready', 'External application opened');
    addLog(`Opened: ${currentJobDetails.applyUrl.substring(0, 50)}...`);
    return;
  }
  
  // Otherwise try to click the Apply button on the page
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'clickApply' });
    
    console.log('clickApply response:', response);
    
    if (response.success) {
      if (response.type === 'external' && response.url) {
        // Validate this URL too
        const isValidAts = knownAtsPatterns.some(pattern => response.url.toLowerCase().includes(pattern));
        if (isValidAts || response.url.includes('/apply') || response.url.includes('/job/')) {
          chrome.tabs.create({ url: response.url });
          updateStatus('ready', 'External application opened');
          addLog(`Opened: ${response.url.substring(0, 50)}...`);
        } else {
          updateStatus('ready', 'Apply button clicked - check for new tab');
          addLog('Apply clicked - may open in new tab');
        }
      } else if (response.type === 'easy-apply') {
        updateStatus('ready', 'Easy Apply dialog opened');
        addLog('Opened Easy Apply - fill in your details');
      } else {
        updateStatus('ready', response.message || 'Apply button clicked');
        addLog(response.message || 'Apply clicked');
      }
    } else {
      updateStatus('error', response.message);
      addLog(`Apply: ${response.message}`);
    }
  } catch (error) {
    console.error('Apply error:', error);
    updateStatus('error', 'Could not apply - try clicking manually on the page');
    addLog('Error: try applying manually');
  }
});

// Auto-fill button click
autoFillBtn.addEventListener('click', async () => {
  updateStatus('scanning', 'Auto-filling form...');
  
  // Get user profile from storage
  const profile = await chrome.storage.local.get([
    'firstName', 'lastName', 'phone', 'city', 
    'linkedinUrl', 'githubUrl', 'portfolioUrl', 'userEmail', 'location'
  ]);
  
  const userProfile = {
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
    email: profile.userEmail || '',
    phone: profile.phone || '',
    city: profile.city || '',
    location: profile.location || profile.city || '',
    linkedinUrl: profile.linkedinUrl || '',
    githubUrl: profile.githubUrl || '',
    portfolioUrl: profile.portfolioUrl || ''
  };
  
  console.log('Auto-fill profile:', userProfile);
  
  // Check if profile has data
  if (!userProfile.firstName && !userProfile.email) {
    updateStatus('error', 'Please fill in your Profile first');
    addLog('Auto-fill failed: No profile data');
    return;
  }
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Use chrome.scripting to inject into ALL frames (including cross-origin!)
    const fillFunction = (profile) => {
      console.log('🤖 Injected autofill function running...');
      console.log('   URL:', window.location.href);
      
      const filled = [];
      const doc = document;
      
      // Log all inputs
      const allInputs = doc.querySelectorAll('input:not([type="hidden"])');
      console.log(`   Found ${allInputs.length} inputs`);
      
      // Direct ID targeting
      const targets = [
        { ids: ['first_name', 'firstname', 'fname'], value: profile.firstName, label: 'First Name' },
        { ids: ['last_name', 'lastname', 'lname'], value: profile.lastName, label: 'Last Name' },
        { ids: ['email'], value: profile.email, label: 'Email' },
        { ids: ['phone', 'tel'], value: profile.phone, label: 'Phone' },
        { ids: ['linkedin'], value: profile.linkedinUrl, label: 'LinkedIn' },
      ];
      
      for (const target of targets) {
        if (!target.value) continue;
        
        for (const id of target.ids) {
          // Try exact ID
          let input = doc.getElementById(id);
          // Try name
          if (!input) input = doc.querySelector(`input[name="${id}"]`);
          // Try partial match
          if (!input) input = doc.querySelector(`input[id*="${id}" i], input[name*="${id}" i]`);
          // Try aria-label
          if (!input) input = doc.querySelector(`input[aria-label="${target.label}"]`);
          // Try autocomplete
          const autoMap = { 'First Name': 'given-name', 'Last Name': 'family-name', 'Email': 'email', 'Phone': 'tel' };
          if (!input && autoMap[target.label]) {
            input = doc.querySelector(`input[autocomplete="${autoMap[target.label]}"]`);
          }
          
          if (input && !input.disabled) {
            console.log(`   Found: ${target.label} -> ${input.id || input.name}`);
            
            // Focus and fill
            input.focus();
            
            // Use native setter for React
            const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
            if (descriptor && descriptor.set) {
              descriptor.set.call(input, target.value);
            } else {
              input.value = target.value;
            }
            
            // Trigger events
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
            
            filled.push(target.label);
            break;
          }
        }
      }
      
      console.log(`   ✅ Filled ${filled.length} fields:`, filled);
      return { success: filled.length > 0, filledFields: filled, url: window.location.href };
    };
    
    // Inject into ALL frames
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: fillFunction,
      args: [userProfile]
    });
    
    console.log('All frame results:', results);
    
    // Collect results from all frames
    const allFilled = [];
    let successFrames = 0;
    
    for (const result of results) {
      if (result.result && result.result.filledFields && result.result.filledFields.length > 0) {
        allFilled.push(...result.result.filledFields);
        successFrames++;
        console.log(`Frame ${result.result.url} filled:`, result.result.filledFields);
      }
    }
    
    const uniqueFilled = [...new Set(allFilled)];
    
    if (uniqueFilled.length > 0) {
      updateStatus('ready', `Filled ${uniqueFilled.length} fields in ${successFrames} frame(s)`);
      addLog(`Auto-filled: ${uniqueFilled.join(', ')}`);
    } else {
      updateStatus('error', 'No fillable fields found');
      addLog('Auto-fill: No fields found in any frame');
    }
    
  } catch (error) {
    console.error('Auto-fill error:', error);
    updateStatus('error', 'Could not auto-fill - ' + error.message);
    addLog('Error: ' + error.message);
  }
});

// Message hiring team member
async function messageHiringMember(name, hirerIndex = 0) {
  updateStatus('scanning', `Opening message to ${name}...`);
  messageStatus.textContent = `📨 Messaging ${name}...`;
  messageStatus.style.color = '#666';
  
  // Get message from template and personalize it
  let messageText = messageTemplate.value || '';
  
  // Replace placeholders
  messageText = messageText
    .replace(/\{name\}/gi, name.split(' ')[0])
    .replace(/\{fullname\}/gi, name)
    .replace(/\{role\}/gi, currentJobDetails?.jobTitle || 'this role')
    .replace(/\{company\}/gi, currentJobDetails?.company || 'your company')
    .replace(/\{title\}/gi, currentJobDetails?.jobTitle || 'this position');
  
  // If template is empty, generate a default message
  if (!messageText.trim()) {
    const settings = await chrome.storage.local.get(['targetRole', 'firstName', 'lastName']);
    const userName = `${settings.firstName || ''} ${settings.lastName || ''}`.trim() || 'there';
    messageText = `Hi ${name.split(' ')[0]},\n\nI noticed you're part of the hiring team for ${currentJobDetails?.jobTitle || 'this role'}. I'm very interested in this opportunity and would love to learn more.\n\nBest regards,\n${userName}`;
  }
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { 
      action: 'messageHiringTeam',
      message: messageText,
      hirerIndex: hirerIndex
    });
    
    if (response.success) {
      // Copy message to clipboard as backup
      await navigator.clipboard.writeText(messageText);
      updateStatus('ready', response.message || 'Message window opened');
      messageStatus.innerHTML = `✅ <strong>${response.hirerName || name}</strong>: ${response.action || 'opened'}`;
      messageStatus.style.color = '#16a34a';
      addLog(`Messaging ${name} - ${response.action || 'opened'}`);
    } else {
      messageStatus.textContent = `❌ ${response.message}`;
      messageStatus.style.color = '#dc2626';
      updateStatus('error', response.message);
    }
  } catch (error) {
    console.error('Message error:', error);
    // At least copy message
    await navigator.clipboard.writeText(messageText);
    messageStatus.textContent = '📋 Message copied - paste manually';
    messageStatus.style.color = '#d97706';
    updateStatus('ready', 'Message copied to clipboard');
    addLog('Message copied - paste manually');
  }
}

// Send to all hiring team members
sendToAllHirersBtn.addEventListener('click', async () => {
  if (currentHiringTeam.length === 0) {
    messageStatus.textContent = '❌ No hiring team found. Get job details first.';
    messageStatus.style.color = '#dc2626';
    return;
  }
  
  const hirersWithMessage = currentHiringTeam.filter(h => h.hasMessageButton);
  if (hirersWithMessage.length === 0) {
    messageStatus.textContent = '❌ No hirers have message button (connect first?)';
    messageStatus.style.color = '#dc2626';
    return;
  }
  
  messageStatus.textContent = `📨 Messaging ${hirersWithMessage.length} hiring team member(s)...`;
  messageStatus.style.color = '#666';
  
  let successCount = 0;
  const results = [];
  
  for (let i = 0; i < currentHiringTeam.length; i++) {
    const hirer = currentHiringTeam[i];
    if (!hirer.hasMessageButton) continue;
    
    messageStatus.textContent = `📨 Messaging ${hirer.name}... (${successCount + 1}/${hirersWithMessage.length})`;
    
    try {
      await messageHiringMember(hirer.name, i);
      successCount++;
      results.push({ name: hirer.name, success: true });
      
      // Wait between messages to avoid rate limiting
      if (i < currentHiringTeam.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (e) {
      results.push({ name: hirer.name, success: false, error: e.message });
    }
  }
  
  messageStatus.innerHTML = `✅ Sent to <strong>${successCount}/${hirersWithMessage.length}</strong> hiring team members`;
  messageStatus.style.color = successCount > 0 ? '#16a34a' : '#dc2626';
  addLog(`Messaged ${successCount} hirers`);
});

// Generate AI message
generateAiMessageBtn.addEventListener('click', async () => {
  messageStatus.textContent = '🤖 Generating AI message...';
  messageStatus.style.color = '#8b5cf6';
  
  const settings = await chrome.storage.local.get(['apiKey', 'firstName', 'lastName', 'targetRole']);
  
  if (!settings.apiKey) {
    messageStatus.textContent = '❌ Add OpenAI API key in Settings first';
    messageStatus.style.color = '#dc2626';
    return;
  }
  
  if (!currentJobDetails) {
    messageStatus.textContent = '❌ Get job details first';
    messageStatus.style.color = '#dc2626';
    return;
  }
  
  const userName = `${settings.firstName || ''} ${settings.lastName || ''}`.trim() || 'Applicant';
  const hirerName = currentHiringTeam[0]?.name || 'Hiring Manager';
  
  try {
    const result = await chrome.runtime.sendMessage({
      action: 'generateMessage',
      post: {
        author: hirerName,
        title: currentJobDetails.jobTitle,
        content: currentJobDetails.jobDescription?.substring(0, 500) || `${currentJobDetails.company} - ${currentJobDetails.jobTitle}`
      },
      userProfile: {
        targetRole: settings.targetRole || currentJobDetails.jobTitle || 'Software Engineer',
        name: userName
      }
    });
    
    if (result.message) {
      messageTemplate.value = result.message;
      messageStatus.textContent = '✅ AI message generated!';
      messageStatus.style.color = '#16a34a';
    } else {
      throw new Error('No message generated');
    }
  } catch (e) {
    console.error('AI message error:', e);
    messageStatus.textContent = '❌ AI generation failed: ' + e.message;
    messageStatus.style.color = '#dc2626';
    
    // Fallback to template
    const template = `Hi {name},

I'm excited about the ${currentJobDetails?.jobTitle || '{role}'} opportunity at ${currentJobDetails?.company || '{company}'}. Your work on ${currentHiringTeam[0]?.title?.split('@')[0] || 'the team'} looks impressive.

I'd love to connect and learn more about this role.

Best,
${userName}`;
    messageTemplate.value = template;
    messageStatus.textContent = '⚠️ Using template (AI unavailable)';
    messageStatus.style.color = '#d97706';
  }
});
