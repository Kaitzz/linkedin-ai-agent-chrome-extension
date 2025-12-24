// Background service worker for LinkedIn AI Agent
// Handles: AI API calls, state management, scheduling

console.log('🤖 LinkedIn AI Agent background service started at', new Date().toISOString());

// Keep service worker alive
self.addEventListener('activate', (event) => {
  console.log('🤖 Service worker activated');
});

// Extension state
let isActive = false;
let scanInterval = null;

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details.reason);
  
  // Set default settings
  chrome.storage.local.set({
    targetRole: '',
    location: '',
    apiKey: '',
    activityLog: [],
    connectedUsers: [],
    settings: {
      autoScan: false,
      scanIntervalMinutes: 30,
      maxConnectionsPerDay: 20
    }
  });
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Background received message:', request.action);
  
  // Handle ping to check if service worker is alive
  if (request.action === 'ping') {
    console.log('🏓 Ping received, responding pong');
    sendResponse({ status: 'pong', timestamp: Date.now() });
    return true;
  }
  
  switch (request.action) {
    case 'analyzePost':
      analyzePostWithAI(request.post, request.userProfile)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ error: err.message }));
      return true; // Keep channel open for async
      
    case 'generateMessage':
      generateConnectionMessage(request.post, request.userProfile)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ error: err.message }));
      return true;
      
    case 'startAutoScan':
      startAutoScan(request.intervalMinutes || 30);
      sendResponse({ success: true });
      break;
      
    case 'stopAutoScan':
      stopAutoScan();
      sendResponse({ success: true });
      break;
      
    case 'getStats':
      getStats().then(stats => sendResponse(stats));
      return true;
  }
});

// Analyze a post using AI (OpenAI)
async function analyzePostWithAI(post, userProfile = {}) {
  console.log('🤖 analyzePostWithAI called with:', { post, userProfile });
  
  const { apiKey } = await chrome.storage.local.get('apiKey');
  console.log('🔑 API Key exists:', !!apiKey, 'Length:', apiKey?.length);
  
  if (!apiKey) {
    console.log('⚠️ No API key, using fallback');
    return analyzePostKeywords(post);
  }
  
  try {
    console.log('📤 Sending request to OpenAI...');
    
    const requestBody = {
      model: 'gpt-4o-mini',
      max_tokens: 300,
      temperature: 0.3,
      messages: [{
        role: 'system',
        content: `You are a smart job matching assistant. Be GENEROUS with scores - help job seekers see opportunities!

ROLE MATCHING - BE VERY FLEXIBLE:
These are ALL equivalent (score 80+):
• "Software Engineer" = "SDE" = "Software Developer" = "Developer" = "SWE" = "Programmer"
• "Backend" = "Server" = "API" = "Platform" = "Infrastructure" 
• "Frontend" = "UI" = "Web Developer" = "React/Vue/Angular Developer"
• "Full Stack" = Backend + Frontend combined
• "Data Engineer" = "Data Platform" = "ETL" = "Big Data"
• "ML Engineer" = "AI Engineer" = "Machine Learning" = "Deep Learning"
• "DevOps" = "SRE" = "Platform" = "Infrastructure"

EXPERIENCE LEVEL - FLEXIBLE:
• "Intern" seeker → Intern, Co-op, Student (85+), New Grad/Entry (70+)
• "New Grad" seeker → New Grad, Entry Level, Junior, 0-2 yrs (85+), Intern (65+)
• If job doesn't specify level → assume could be entry-friendly (70+)
• "Junior" = "Associate" = "Entry Level" = "I" or "1"

LOCATION - VERY FLEXIBLE:
• Bay Area = SF, San Jose, Sunnyvale, Mountain View, Palo Alto, Cupertino, Santa Clara, Fremont, Oakland, Berkeley, South Bay, Peninsula, Silicon Valley (ALL score 85+)
• Remote/Hybrid = matches ANY preference (90+)
• Same state = good (75+)
• Not specified = assume flexible (80+)

SCORING PHILOSOPHY:
• Be GENEROUS - more opportunities is better for job seekers
• 70+ = definitely worth applying
• 50-69 = consider applying  
• <50 = only if completely different field (Marketing when seeking SWE)

Respond in valid JSON only.`
      }, {
        role: 'user',
        content: `Analyze this job:

Title: ${post.title || 'Not specified'}
Company: ${post.author || 'Unknown'}  
Location: ${post.location || 'Not specified'}
Description: ${(post.content || '').substring(0, 600)}

Seeker wants: ${userProfile.targetRole || 'Software Engineer Intern/New Grad'} in ${userProfile.location || 'Bay Area/Remote'}

JSON response:
{"isHiring": true, "role": "job title", "matchScore": 0-100, "reason": "brief why"}`
      }]
    };
    
    console.log('📦 Request body:', JSON.stringify(requestBody).substring(0, 200) + '...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log('📥 Response status:', response.status);
    
    const data = await response.json();
    console.log('📥 Response data:', data);
    
    if (data.error) {
      console.error('❌ OpenAI API error:', data.error);
      return { error: data.error.message, ...analyzePostKeywords(post) };
    }
    
    const text = data.choices[0].message.content;
    console.log('📝 AI response text:', text);
    
    // Clean and parse JSON response
    const cleanJson = text.replace(/```json\n?|\n?```/g, '').trim();
    const result = JSON.parse(cleanJson);
    console.log('✅ Parsed result:', result);
    
    return result;
  } catch (error) {
    console.error('❌ AI analysis error:', error);
    return { error: error.message, ...analyzePostKeywords(post) };
  }
}

// Fallback keyword-based analysis (when no API key)
function analyzePostKeywords(post) {
  const content = (post.content || '').toLowerCase();
  const title = (post.title || '').toLowerCase();
  const location = (post.location || '').toLowerCase();
  
  const hiringKeywords = [
    'hiring', 'we\'re hiring', 'looking for', 'open position',
    'join our team', 'apply now', 'dm me', 'send your resume',
    'open role', 'job opening', 'career opportunity'
  ];
  
  const roleKeywords = [
    'engineer', 'developer', 'swe', 'software', 'intern',
    'new grad', 'entry level', 'junior', 'backend', 'frontend',
    'full stack', 'fullstack', 'python', 'java', 'javascript'
  ];
  
  // Bay Area cities for location matching
  const bayAreaCities = [
    'san francisco', 'san jose', 'sunnyvale', 'mountain view',
    'palo alto', 'cupertino', 'santa clara', 'fremont', 'oakland',
    'berkeley', 'menlo park', 'redwood city', 'bay area', 'sf'
  ];
  
  const isHiring = hiringKeywords.some(k => content.includes(k) || title.includes(k));
  const hasRelevantRole = roleKeywords.some(k => content.includes(k) || title.includes(k));
  const isBayArea = bayAreaCities.some(city => location.includes(city));
  const isRemote = location.includes('remote') || content.includes('remote');
  
  let matchScore = 0;
  if (isHiring && hasRelevantRole) {
    matchScore = 70;
    if (isBayArea || isRemote) matchScore += 15;
  } else if (isHiring) {
    matchScore = 40;
  } else if (hasRelevantRole) {
    matchScore = 30;
  }
  
  return {
    isHiring,
    role: hasRelevantRole ? 'Software/Engineering' : 'Unknown',
    isRecent: (post.time || '').includes('h') || (post.time || '').includes('m'),
    matchScore: Math.min(matchScore, 100),
    locationMatch: isBayArea ? 'nearby' : (isRemote ? 'remote' : 'unknown'),
    reason: 'Keyword-based analysis (no API key configured)'
  };
}

// Generate personalized connection message (OpenAI)
async function generateConnectionMessage(post, userProfile) {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  
  if (!apiKey) {
    return {
      message: `Hi ${post.author.split(' ')[0]}, I noticed your post about hiring. I'm a software engineer interested in this opportunity. Would love to connect!`
    };
  }
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 100,
        temperature: 0.7,
        messages: [{
          role: 'system',
          content: 'Write short LinkedIn connection requests. Be professional, concise, personalized. No emoji. Under 280 characters. Output ONLY the message text.'
        }, {
          role: 'user',
          content: `Write a connection request to:
Name: ${post.author}
Their post/job: ${post.content.substring(0, 200)}

From job seeker:
- Target role: ${userProfile.targetRole || 'Software Engineer'}
- Location: ${userProfile.location || 'Open to relocation'}

Just the message, nothing else.`
        }]
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error('OpenAI API error:', data.error);
      throw new Error(data.error.message);
    }
    
    return { message: data.choices[0].message.content.trim() };
  } catch (error) {
    console.error('Message generation error:', error);
    return {
      message: `Hi ${post.author.split(' ')[0]}, I saw your post about hiring and I'm very interested. Would love to connect and learn more about the opportunity!`
    };
  }
}

// Auto-scan functionality
function startAutoScan(intervalMinutes) {
  if (scanInterval) clearInterval(scanInterval);
  
  isActive = true;
  scanInterval = setInterval(async () => {
    // Get active LinkedIn tab
    const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
    
    if (tabs.length > 0) {
      // Trigger scan in content script
      chrome.tabs.sendMessage(tabs[0].id, { action: 'autoScan' });
    }
  }, intervalMinutes * 60 * 1000);
  
  console.log(`Auto-scan started: every ${intervalMinutes} minutes`);
}

function stopAutoScan() {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  isActive = false;
  console.log('Auto-scan stopped');
}

// Get statistics
async function getStats() {
  const data = await chrome.storage.local.get(['connectedUsers', 'activityLog']);
  
  return {
    totalConnections: data.connectedUsers?.length || 0,
    todayConnections: countTodayConnections(data.connectedUsers || []),
    recentActivity: data.activityLog?.slice(0, 5) || []
  };
}

function countTodayConnections(connections) {
  const today = new Date().toDateString();
  return connections.filter(c => new Date(c.date).toDateString() === today).length;
}

// Keep service worker alive (Manifest V3 quirk)
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    console.log('Service worker ping');
  }
});
