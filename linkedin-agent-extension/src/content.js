// Content script for LinkedIn pages
// This script runs in the context of LinkedIn pages

// Prevent duplicate initialization
if (window._linkedinAgentContentLoaded) {
  console.log('🤖 LinkedIn AI Agent content script already loaded, skipping...');
} else {
  window._linkedinAgentContentLoaded = true;
  window._isMessaging = false; // Global flag for messaging state
  console.log('🤖 LinkedIn AI Agent content script loaded');

  // Listen for messages from popup or background (only once!)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request);
    
    if (request.action === 'scanPosts') {
      const posts = scanCurrentPage();
      sendResponse({ posts });
    }
    
    if (request.action === 'connectToUser') {
      const result = attemptConnect(request.postId);
      sendResponse(result);
    }
    
    if (request.action === 'getJobDetails') {
      const details = getJobApplicationDetails();
      sendResponse(details);
    }
    
    if (request.action === 'clickApply') {
      const result = clickApplyButton();
      sendResponse(result);
    }
    
    if (request.action === 'messageHiringTeam') {
      // Prevent duplicate calls
      if (window._isMessaging) {
        console.log('⚠️ Already processing message request, ignoring duplicate');
        sendResponse({ success: false, message: 'Already in progress' });
        return true;
      }
      window._isMessaging = true;
      
      // This is async, handle properly
      messageHiringTeam(request.message, request.hirerIndex || 0)
        .then(result => {
          window._isMessaging = false;
          sendResponse(result);
        })
        .catch(err => {
          window._isMessaging = false;
          sendResponse({ success: false, message: err.message });
        });
      return true; // Keep channel open for async response
    }
    
    if (request.action === 'getHiringTeam') {
      const team = getHiringTeamDetails();
      sendResponse({ success: true, team: team });
    }
    
    if (request.action === 'fillApplicationForm') {
      const result = fillApplicationForm(request.userProfile);
      sendResponse(result);
    }
    
    return true; // Keep message channel open for async response
  });
} // End of initialization guard

// ============================================
// JOB APPLICATION DETAILS EXTRACTION
// ============================================

function getJobApplicationDetails() {
  console.log('📋 Extracting job application details...');
  
  const details = {
    jobTitle: '',
    company: '',
    location: '',
    applyUrl: '',
    applyType: '', // 'easy-apply' or 'external' or 'none'
    hiringTeam: [],
    jobDescription: '',
    jobId: '',
    postUrl: window.location.href  // Current page URL for deduplication
  };
  
  try {
    // Get job title - try multiple selectors
    const titleSelectors = [
      'h1.t-24',
      'h1.job-title',
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title',
      '.job-details-jobs-unified-top-card__job-title h1',
      'h1[class*="job-title"]',
      '.jobs-details__main-content h1',
      'h1'
    ];
    
    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        details.jobTitle = el.textContent.trim();
        console.log('✅ Found job title with:', selector);
        break;
      }
    }
    
    // Get company name
    const companySelectors = [
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name',
      '.job-details-jobs-unified-top-card__primary-description a',
      '.jobs-unified-top-card__company-name a',
      'a[data-tracking-control-name="public_jobs_topcard-org-name"]',
      '.jobs-details-top-card__company-url',
      'a.ember-view[href*="/company/"]'
    ];
    
    for (const selector of companySelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        details.company = el.textContent.trim();
        console.log('✅ Found company with:', selector);
        break;
      }
    }
    
    // Get location
    const locationSelectors = [
      '.job-details-jobs-unified-top-card__bullet',
      '.jobs-unified-top-card__bullet',
      '.job-details-jobs-unified-top-card__primary-description-container span.t-black--light',
      '.jobs-unified-top-card__workplace-type',
      'span.job-details-jobs-unified-top-card__bullet'
    ];
    
    for (const selector of locationSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        details.location = el.textContent.trim();
        console.log('✅ Found location with:', selector);
        break;
      }
    }
    
    // Get job description
    const descSelectors = [
      '.jobs-description__content',
      '.jobs-box__html-content',
      '.jobs-description-content__text',
      '#job-details',
      '.jobs-description'
    ];
    
    for (const selector of descSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        details.jobDescription = el.textContent.trim().substring(0, 2000);
        console.log('✅ Found description with:', selector);
        break;
      }
    }
    
    // Get job ID from URL
    const urlMatch = window.location.href.match(/currentJobId=(\d+)|\/jobs\/view\/(\d+)/);
    details.jobId = urlMatch ? (urlMatch[1] || urlMatch[2]) : '';
    
    // ============================================
    // APPLY BUTTON / URL DETECTION
    // ============================================
    
    console.log('🔍 Looking for apply button/link...');
    
    // Method 1: Check Apply button first (most reliable)
    const applyButtonSelectors = [
      'button.jobs-apply-button',
      'button[aria-label*="Easy Apply"]',
      'button[aria-label*="Apply"]',
      '.jobs-apply-button--top-card',
      '.jobs-unified-top-card__content--two-pane button.jobs-apply-button',
      'button.jobs-apply-button--top-card',
      '.jobs-s-apply button'
    ];
    
    for (const selector of applyButtonSelectors) {
      const btn = document.querySelector(selector);
      if (btn) {
        const btnText = btn.textContent?.toLowerCase().trim() || '';
        const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
        
        console.log('🔘 Found apply button:', selector, 'Text:', btnText, 'Aria:', ariaLabel);
        
        if (btnText.includes('easy apply') || ariaLabel.includes('easy apply')) {
          details.applyType = 'easy-apply';
          details.applyUrl = window.location.href;
          break;
        } else if (btnText.includes('apply') || ariaLabel.includes('apply')) {
          details.applyType = 'external';
          // The actual URL will be obtained when clicking the button
          break;
        }
      }
    }
    
    // Method 2: Look for specific ATS platform links (actual job application URLs, NOT company pages)
    // Be very specific - only match URLs that look like actual job postings
    const atsLinkSelectors = [
      'a[href*="boards.greenhouse.io/"][href*="/jobs/"]',   // Greenhouse with job ID
      'a[href*="jobs.greenhouse.io/"]',                     // Greenhouse jobs
      'a[href*="jobs.lever.co/"][href*="/"]',               // Lever with job path  
      'a[href*="myworkdayjobs.com/"][href*="/job/"]',       // Workday with job
      'a[href*=".icims.com/jobs/"][href*="/job"]',          // iCIMS with job
      'a[href*="jobvite.com/"][href*="/job/"]',             // Jobvite
      'a[href*="smartrecruiters.com/"][href*="/"]',         // SmartRecruiters
      'a[href*="ashbyhq.com/"][href*="/"]',                 // Ashby
      'a[href*="apply.workable.com/"]',                     // Workable
      'a[href*="/apply"]'                                   // Generic apply path
    ];
    
    if (!details.applyUrl || details.applyUrl === window.location.href) {
      for (const selector of atsLinkSelectors) {
        const link = document.querySelector(selector);
        if (link && link.href && !link.href.includes('linkedin.com')) {
          // Extra validation: make sure it's not just a company careers homepage
          const href = link.href.toLowerCase();
          // Skip if it looks like a root careers page
          if (href.match(/^https?:\/\/[^\/]+\/(careers|jobs)?\/?$/)) {
            console.log('  ⏭️ Skipping root careers page:', href);
            continue;
          }
          details.applyUrl = link.href;
          details.applyType = 'external';
          console.log('✅ Found ATS application URL:', link.href);
          break;
        }
      }
    }
    
    // DO NOT include generic "careers" links - they usually point to company homepage
    // If we don't have a URL yet, we'll get it by clicking the Apply button
    
    console.log('📋 Apply detection result:', { type: details.applyType, url: details.applyUrl || '(will get on click)' });
    
    // ============================================
    // HIRING TEAM EXTRACTION  
    // ============================================
    
    console.log('👥 Looking for hiring team...');
    
    // First, find the CORRECT hiring team section (not connections card)
    let hiringSectionContainer = null;
    
    // Method 1: Find by heading text "Meet the hiring team"
    const headings = document.querySelectorAll('h2');
    for (const h2 of headings) {
      if (h2.textContent.toLowerCase().includes('meet the hiring team') || 
          h2.textContent.toLowerCase().includes('hiring team')) {
        hiringSectionContainer = h2.closest('.artdeco-card, .job-details-people-who-can-help__section--two-pane');
        if (hiringSectionContainer) {
          console.log('  ✅ Found hiring section by heading');
          break;
        }
      }
    }
    
    // Method 2: Find section containing .entry-point with Message button
    if (!hiringSectionContainer) {
      const entryPoints = document.querySelectorAll('.entry-point');
      for (const ep of entryPoints) {
        const btn = ep.querySelector('button');
        if (btn && btn.textContent.trim().toLowerCase().includes('message')) {
          hiringSectionContainer = ep.closest('.artdeco-card, .job-details-people-who-can-help__section--two-pane');
          if (hiringSectionContainer) {
            console.log('  ✅ Found hiring section by entry-point with Message button');
            break;
          }
        }
      }
    }
    
    // Method 3: Find section containing .hirer-card__hirer-information
    if (!hiringSectionContainer) {
      const hirerInfo = document.querySelector('.hirer-card__hirer-information');
      if (hirerInfo) {
        hiringSectionContainer = hirerInfo.closest('.artdeco-card, .job-details-people-who-can-help__section--two-pane');
        if (hiringSectionContainer) {
          console.log('  ✅ Found hiring section by hirer-card__hirer-information');
        }
      }
    }
    
    // Method 4: Find section containing .jobs-poster__name
    if (!hiringSectionContainer) {
      const posterName = document.querySelector('.jobs-poster__name');
      if (posterName) {
        hiringSectionContainer = posterName.closest('.artdeco-card, .job-details-people-who-can-help__section--two-pane');
        if (hiringSectionContainer) {
          console.log('  ✅ Found hiring section by jobs-poster__name');
        }
      }
    }
    
    if (hiringSectionContainer) {
      console.log('  Section classes:', hiringSectionContainer.className);
      
      // Find all member cards within the container
      const memberCards = hiringSectionContainer.querySelectorAll(
        '.display-flex.align-items-center.mt4, ' +
        '.display-flex.align-items-center:has(.entry-point), ' +
        '.display-flex.align-items-center:has(.hirer-card__hirer-information), ' +
        '.hirer-card, ' +
        '.jobs-poster'
      );
      
      console.log(`  Found ${memberCards.length} potential member cards`);
      
      memberCards.forEach(card => {
        const person = extractHiringTeamMember(card);
        if (person.name && !details.hiringTeam.find(h => h.name === person.name)) {
          details.hiringTeam.push(person);
          console.log('  ✅ Added:', person.name, person.hasMessageButton ? '(has msg btn)' : '');
        }
      });
    } else {
      console.log('  ⚠️ Hiring section container not found, trying fallback methods...');
    }
    
    // Fallback: Look for individual hiring team cards across the page
    if (details.hiringTeam.length === 0) {
      const hiringTeamSelectors = [
        '.hirer-card',
        '.jobs-poster',
        '.job-details-jobs-unified-top-card__hiring-team-container',
        '[data-view-name="job-poster-card"]'
      ];
      
      for (const selector of hiringTeamSelectors) {
        const containers = document.querySelectorAll(selector);
        
        containers.forEach(container => {
          const person = extractHiringTeamMember(container);
          if (person.name && !details.hiringTeam.find(h => h.name === person.name)) {
            details.hiringTeam.push(person);
            console.log('  ✅ Added (fallback):', person.name);
          }
        });
      }
    }
    
    // Final fallback: Look for message buttons and their parent containers
    if (details.hiringTeam.length === 0) {
      const messageButtons = document.querySelectorAll('.entry-point button');
      console.log(`  Found ${messageButtons.length} entry-point buttons`);
      
      messageButtons.forEach(btn => {
        if (!btn.textContent.trim().toLowerCase().includes('message')) return;
        
        const container = btn.closest('.display-flex.align-items-center') || 
                         btn.closest('.hirer-card') || 
                         btn.closest('.jobs-poster');
                         
        if (container) {
          const person = extractHiringTeamMember(container);
          if (person.name && !details.hiringTeam.find(h => h.name === person.name)) {
            person.hasMessageButton = true;
            details.hiringTeam.push(person);
            console.log('  ✅ Added from message btn:', person.name);
          }
        }
      });
    }
    
    console.log('📋 Final extracted details:', {
      title: details.jobTitle,
      company: details.company,
      location: details.location,
      applyType: details.applyType,
      hiringTeam: details.hiringTeam.length + ' people'
    });
    
  } catch (error) {
    console.error('❌ Error extracting job details:', error);
  }
  
  return details;
}

function extractHiringTeamMember(container) {
  const member = {
    name: '',
    title: '',
    profileUrl: '',
    connectionDegree: '',
    hasMessageButton: false
  };
  
  try {
    // Name - try multiple selectors for different LinkedIn layouts
    const nameSelectors = [
      '.jobs-poster__name strong',
      '.hirer-card__hirer-information strong',
      '.t-black strong',
      '.jobs-poster__name',
      '.hirer-card__hirer-name',
      '.artdeco-entity-lockup__title',
      'a[data-test-app-aware-link] span[dir="ltr"]',
      '.t-bold span[aria-hidden="true"]'
    ];
    
    for (const selector of nameSelectors) {
      const el = container.querySelector(selector);
      if (el && el.textContent.trim()) {
        member.name = el.textContent.trim().replace(/\s+/g, ' ');
        break;
      }
    }
    
    // Title/Headline
    const titleSelectors = [
      '.text-body-small.t-black',
      '.hirer-card__hirer-information .linked-area div',
      '.jobs-poster__headline',
      '.hirer-card__hirer-headline',
      '.artdeco-entity-lockup__subtitle'
    ];
    
    for (const selector of titleSelectors) {
      const el = container.querySelector(selector);
      if (el && el.textContent.trim()) {
        member.title = el.textContent.trim();
        break;
      }
    }
    
    // Profile URL
    const linkEl = container.querySelector('a[href*="/in/"]');
    member.profileUrl = linkEl?.href || '';
    
    // Connection degree
    const degreeEl = container.querySelector(
      '.hirer-card__connection-degree, ' +
      '.distance-badge, ' +
      '[class*="connection-degree"]'
    );
    if (degreeEl) {
      member.connectionDegree = degreeEl.textContent.trim();
    }
    
    // Message button - check multiple patterns
    member.hasMessageButton = false;
    
    // Method 1: Direct button selectors
    const msgBtn = container.querySelector(
      'button[aria-label*="Message"], ' +
      'button.message-anywhere-button, ' +
      '.entry-point button'
    );
    
    if (msgBtn) {
      member.hasMessageButton = true;
    }
    
    // Method 2: Check artdeco-button__text span for "Message"
    if (!member.hasMessageButton) {
      const textSpans = container.querySelectorAll('.artdeco-button__text');
      for (const span of textSpans) {
        if (span.textContent.trim().toLowerCase().includes('message')) {
          member.hasMessageButton = true;
          break;
        }
      }
    }
    
    // Method 3: Check any button text for "message"
    if (!member.hasMessageButton) {
      const allButtons = container.querySelectorAll('button');
      for (const btn of allButtons) {
        if (btn.textContent.trim().toLowerCase().includes('message')) {
          member.hasMessageButton = true;
          break;
        }
      }
    }
    
  } catch (error) {
    console.error('Error extracting hiring team member:', error);
  }
  
  return member;
}

// ============================================
// APPLY BUTTON CLICK
// ============================================

function clickApplyButton() {
  console.log('🖱️ Attempting to click Apply button...');
  
  // Find Easy Apply button first - try multiple selectors
  const applySelectors = [
    'button.jobs-apply-button[aria-label*="Easy Apply"]',
    'button.jobs-apply-button',
    'button[aria-label*="Easy Apply"]',
    '.jobs-apply-button--top-card',
    '.jobs-s-apply button',
    'button.artdeco-button--primary[aria-label*="Apply"]'
  ];
  
  for (const selector of applySelectors) {
    const btn = document.querySelector(selector);
    if (btn) {
      console.log('✅ Found apply button:', selector);
      
      // Check if it's Easy Apply or external
      const btnText = btn.textContent?.toLowerCase().trim() || '';
      const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
      
      if (btnText.includes('easy apply') || ariaLabel.includes('easy apply')) {
        btn.click();
        console.log('✅ Clicked Easy Apply button');
        return { success: true, type: 'easy-apply', message: 'Clicked Easy Apply button' };
      } else if (btnText.includes('apply') || ariaLabel.includes('apply')) {
        // For external apply, we need to capture where it goes
        // Set up a listener for the new tab/window
        console.log('🔗 Clicking external Apply button...');
        
        // Check if there's a link wrapper
        const parentLink = btn.closest('a');
        if (parentLink && parentLink.href && !parentLink.href.includes('linkedin.com')) {
          console.log('✅ Found link wrapper:', parentLink.href);
          return { 
            success: true, 
            type: 'external', 
            url: parentLink.href,
            message: 'Found external apply link' 
          };
        }
        
        // Click the button - it will open new tab
        btn.click();
        console.log('✅ Clicked Apply button');
        return { success: true, type: 'apply-clicked', message: 'Clicked Apply button - check new tab' };
      }
    }
  }
  
  // Find external apply link - be very specific
  const linkSelectors = [
    'a.jobs-apply-button[href]:not([href*="linkedin.com"])',
    'a[href*="boards.greenhouse.io"]',
    'a[href*="jobs.lever.co"]',
    'a[href*="myworkdayjobs.com"]',
    'a[href*=".icims.com/jobs"]',
    'a[href*="apply.workable.com"]'
  ];
  
  for (const selector of linkSelectors) {
    const link = document.querySelector(selector);
    if (link && link.href && !link.href.includes('linkedin.com')) {
      console.log('🔗 Found external apply link:', link.href);
      return { 
        success: true, 
        type: 'external', 
        url: link.href,
        message: 'Found external apply link' 
      };
    }
  }
  
  console.log('❌ No apply button found');
  return { success: false, message: 'Apply button not found - try clicking manually' };
}

// ============================================
// MESSAGE HIRING TEAM
// ============================================

function messageHiringTeam(messageText, hirerIndex = 0) {
  console.log('💬 Attempting to message hiring team member #' + hirerIndex + '...');
  
  // Find the CORRECT hiring team section (not connections card)
  // Look for section that contains "Meet the hiring team" or has hirer-card elements
  let hiringSection = null;
  
  // Method 1: Find by heading text
  const headings = document.querySelectorAll('h2');
  for (const h2 of headings) {
    if (h2.textContent.toLowerCase().includes('meet the hiring team') || 
        h2.textContent.toLowerCase().includes('hiring team')) {
      hiringSection = h2.closest('.artdeco-card, .job-details-people-who-can-help__section--two-pane');
      if (hiringSection) {
        console.log('✅ Found hiring section by heading');
        break;
      }
    }
  }
  
  // Method 2: Find section containing .entry-point with Message button
  if (!hiringSection) {
    const entryPoints = document.querySelectorAll('.entry-point');
    for (const ep of entryPoints) {
      const btn = ep.querySelector('button');
      if (btn && btn.textContent.trim().toLowerCase().includes('message')) {
        hiringSection = ep.closest('.artdeco-card, .job-details-people-who-can-help__section--two-pane');
        if (hiringSection) {
          console.log('✅ Found hiring section by entry-point with Message button');
          break;
        }
      }
    }
  }
  
  // Method 3: Find section containing .hirer-card__hirer-information
  if (!hiringSection) {
    const hirerInfo = document.querySelector('.hirer-card__hirer-information');
    if (hirerInfo) {
      hiringSection = hirerInfo.closest('.artdeco-card, .job-details-people-who-can-help__section--two-pane');
      if (hiringSection) {
        console.log('✅ Found hiring section by hirer-card__hirer-information');
      }
    }
  }
  
  // Method 4: Find section containing .jobs-poster__name
  if (!hiringSection) {
    const posterName = document.querySelector('.jobs-poster__name');
    if (posterName) {
      hiringSection = posterName.closest('.artdeco-card, .job-details-people-who-can-help__section--two-pane');
      if (hiringSection) {
        console.log('✅ Found hiring section by jobs-poster__name');
      }
    }
  }
  
  if (!hiringSection) {
    console.log('❌ Hiring team section not found');
    return Promise.resolve({ success: false, message: 'Hiring team section not found on this page' });
  }
  
  console.log('  Section classes:', hiringSection.className);
  
  const messageButtons = [];
  
  // Method 1: Find all entry-point containers and get their buttons
  const entryPoints = hiringSection.querySelectorAll('.entry-point');
  console.log(`  Found ${entryPoints.length} entry-point elements`);
  
  entryPoints.forEach((ep, i) => {
    const btn = ep.querySelector('button');
    if (btn) {
      const btnText = btn.textContent.trim().toLowerCase();
      console.log(`    Entry point ${i}: button text = "${btnText}"`);
      if (btnText.includes('message')) {
        messageButtons.push(btn);
        console.log(`    ✅ Added message button from entry-point ${i}`);
      }
    }
  });
  
  // Method 2: Find buttons with artdeco-button__text containing "Message"
  if (messageButtons.length === 0) {
    const textSpans = hiringSection.querySelectorAll('.artdeco-button__text');
    console.log(`  Found ${textSpans.length} artdeco-button__text elements`);
    
    textSpans.forEach((span, i) => {
      const spanText = span.textContent.trim().toLowerCase();
      console.log(`    Span ${i}: "${spanText}"`);
      if (spanText.includes('message')) {
        const btn = span.closest('button');
        if (btn && !messageButtons.includes(btn)) {
          messageButtons.push(btn);
          console.log(`    ✅ Added button from artdeco-button__text`);
        }
      }
    });
  }
  
  // Method 3: Find all artdeco-button elements and check their content
  if (messageButtons.length === 0) {
    const allButtons = hiringSection.querySelectorAll('button.artdeco-button');
    console.log(`  Found ${allButtons.length} artdeco-button elements`);
    
    allButtons.forEach((btn, i) => {
      const btnText = btn.textContent.trim().toLowerCase();
      console.log(`    Button ${i}: "${btnText.substring(0, 30)}..."`);
      if (btnText.includes('message') && !messageButtons.includes(btn)) {
        messageButtons.push(btn);
        console.log(`    ✅ Added artdeco-button with message text`);
      }
    });
  }
  
  // Method 4: Last resort - find ANY button with "message" in it
  if (messageButtons.length === 0) {
    const allBtns = hiringSection.querySelectorAll('button');
    console.log(`  Last resort: checking ${allBtns.length} buttons`);
    
    allBtns.forEach((btn, i) => {
      const btnText = btn.textContent.trim().toLowerCase();
      if (btnText.includes('message') && !messageButtons.includes(btn)) {
        messageButtons.push(btn);
        console.log(`    ✅ Found message button at index ${i}`);
      }
    });
  }
  
  console.log(`📊 Total message buttons found: ${messageButtons.length}`);
  
  if (messageButtons.length === 0) {
    // Debug: log all buttons in section
    const debugBtns = hiringSection.querySelectorAll('button');
    console.log('🔍 Debug - All buttons in hiring section:');
    debugBtns.forEach((btn, i) => {
      console.log(`  [${i}] class="${btn.className}" text="${btn.textContent.trim().substring(0, 50)}"`);
    });
    return Promise.resolve({ success: false, message: 'No Message buttons found in hiring team section' });
  }
  
  // Get the specific button
  const messageBtn = messageButtons[hirerIndex] || messageButtons[0];
  
  // Get hirer info for context
  let hirerName = 'Hiring Manager';
  const hirerCard = messageBtn.closest('.display-flex.align-items-center, .hirer-card, .mt4');
  if (hirerCard) {
    const nameEl = hirerCard.querySelector('.jobs-poster__name strong, .t-black strong, a[href*="/in/"] strong');
    if (nameEl) {
      hirerName = nameEl.textContent.trim();
    }
  }
  
  console.log(`📨 Clicking message button for: ${hirerName}`);
  console.log(`   Button: id="${messageBtn.id}" class="${messageBtn.className}"`);
  
  // Click the message button to open chat (only once!)
  messageBtn.click();
  
  // Wait for message modal to open and fill in message
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 20; // 10 seconds max
    
    const checkAndFill = () => {
      attempts++;
      console.log(`💬 Waiting for message modal... attempt ${attempts}`);
      
      // Look for the message input
      const messageInput = document.querySelector(
        '.msg-form__contenteditable[contenteditable="true"], ' +
        'div[data-placeholder*="Write a message"], ' +
        '.msg-form__msg-content-container div[contenteditable="true"], ' +
        '.msg-form__message-texteditor div[role="textbox"], ' +
        '.msg-s-message-list-content + div [contenteditable="true"]'
      );
      
      // Also check for the message overlay/modal
      const messageOverlay = document.querySelector(
        '.msg-overlay-conversation-bubble, ' +
        '.msg-convo-wrapper, ' +
        '.msg-form'
      );
      
      if (messageInput && messageOverlay) {
        console.log('✅ Message modal opened!');
        console.log('   Input element:', messageInput.className);
        
        if (messageText) {
          // Fill in the message after a short delay for modal to fully load
          setTimeout(async () => {
            try {
              console.log('📝 Attempting to fill message...');
              
              // Focus the input
              messageInput.focus();
              
              // Clear any existing content
              messageInput.innerHTML = '';
              
              // Method 1: Simulate typing by setting textContent and dispatching events
              let filled = false;
              
              // Try setting innerHTML with paragraph
              messageInput.innerHTML = `<p>${messageText}</p>`;
              messageInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              
              if (messageInput.textContent.trim()) {
                filled = true;
                console.log('   ✅ Method 1 (innerHTML) worked');
              }
              
              // Method 2: If innerHTML didn't work, try execCommand
              if (!filled) {
                messageInput.innerHTML = '';
                messageInput.focus();
                const execResult = document.execCommand('insertText', false, messageText);
                if (execResult && messageInput.textContent.trim()) {
                  filled = true;
                  console.log('   ✅ Method 2 (execCommand) worked');
                }
              }
              
              // Method 3: Use clipboard API to paste
              if (!filled) {
                try {
                  messageInput.focus();
                  messageInput.innerHTML = '';
                  await navigator.clipboard.writeText(messageText);
                  document.execCommand('paste');
                  if (messageInput.textContent.trim()) {
                    filled = true;
                    console.log('   ✅ Method 3 (clipboard paste) worked');
                  }
                } catch (clipErr) {
                  console.log('   Clipboard method failed:', clipErr.message);
                }
              }
              
              // Method 4: Direct text manipulation with keyboard simulation
              if (!filled) {
                messageInput.focus();
                messageInput.textContent = messageText;
                
                // Simulate keyboard events
                for (const char of messageText.substring(0, 5)) {
                  messageInput.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                  messageInput.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
                  messageInput.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
                }
                
                messageInput.dispatchEvent(new Event('input', { bubbles: true }));
                messageInput.dispatchEvent(new Event('change', { bubbles: true }));
                
                if (messageInput.textContent.trim()) {
                  filled = true;
                  console.log('   ✅ Method 4 (textContent + events) worked');
                }
              }
              
              // Always copy to clipboard as backup
              try {
                await navigator.clipboard.writeText(messageText);
                console.log('   📋 Message copied to clipboard as backup');
              } catch (e) {}
              
              // Dispatch final events to trigger React state update
              messageInput.dispatchEvent(new Event('input', { bubbles: true }));
              messageInput.dispatchEvent(new Event('change', { bubbles: true }));
              messageInput.dispatchEvent(new Event('blur', { bubbles: true }));
              messageInput.focus();
              
              const finalText = messageInput.textContent.trim();
              console.log(`   Final message content: "${finalText.substring(0, 50)}..."`);
              
              if (filled && finalText) {
                resolve({ 
                  success: true, 
                  message: `Message drafted for ${hirerName}`,
                  hirerName: hirerName,
                  action: 'message-drafted'
                });
              } else {
                resolve({ 
                  success: true, 
                  message: `Message window opened for ${hirerName}. Use Ctrl+V to paste message.`,
                  hirerName: hirerName,
                  action: 'message-modal-opened-paste-needed'
                });
              }
            } catch (e) {
              console.error('Error filling message:', e);
              // Still copy to clipboard
              try {
                await navigator.clipboard.writeText(messageText);
              } catch (clipErr) {}
              resolve({ 
                success: true, 
                message: `Message window opened for ${hirerName}. Use Ctrl+V to paste.`,
                hirerName: hirerName,
                action: 'message-modal-opened'
              });
            }
          }, 500);
        } else {
          resolve({ 
            success: true, 
            message: `Message window opened for ${hirerName}`,
            hirerName: hirerName,
            action: 'message-modal-opened'
          });
        }
        return;
      }
      
      // Check for InMail or premium-only messages
      const inMailModal = document.querySelector('.premium-upsell-modal, [class*="inmail"]');
      if (inMailModal) {
        resolve({
          success: false,
          message: `${hirerName} requires InMail (premium). Try connecting first.`,
          hirerName: hirerName,
          action: 'requires-inmail'
        });
        return;
      }
      
      // Keep trying
      if (attempts < maxAttempts) {
        setTimeout(checkAndFill, 500);
      } else {
        resolve({ 
          success: false, 
          message: 'Message modal did not open. Try clicking manually.',
          action: 'timeout'
        });
      }
    };
    
    // Start checking after initial delay
    setTimeout(checkAndFill, 500);
  });
}

// Get all hiring team members with their info
function getHiringTeamDetails() {
  console.log('👥 Getting hiring team details...');
  
  const team = [];
  
  const hiringSection = document.querySelector(
    '.job-details-people-who-can-help__section--two-pane, ' +
    '[class*="hiring-team"], ' +
    '.jobs-poster'
  );
  
  if (!hiringSection) {
    return team;
  }
  
  // Find all hiring team member cards
  const memberCards = hiringSection.querySelectorAll(
    '.display-flex.align-items-center, ' +
    '.hirer-card, ' +
    '.jobs-poster__content'
  );
  
  memberCards.forEach((card, index) => {
    try {
      const member = {
        index: index,
        name: '',
        title: '',
        profileUrl: '',
        connectionDegree: '',
        hasMessageButton: false
      };
      
      // Get name
      const nameEl = card.querySelector(
        '.jobs-poster__name strong, ' +
        '.t-black strong, ' +
        'a[href*="/in/"] strong, ' +
        '.hirer-card__hirer-information strong'
      );
      if (nameEl) {
        member.name = nameEl.textContent.trim();
      }
      
      // Get profile URL
      const profileLink = card.querySelector('a[href*="/in/"]');
      if (profileLink) {
        member.profileUrl = profileLink.href;
        if (!member.name) {
          member.name = profileLink.textContent.trim();
        }
      }
      
      // Get title
      const titleEl = card.querySelector(
        '.text-body-small.t-black, ' +
        '.hirer-card__hirer-information .linked-area div, ' +
        '.jobs-poster__headline'
      );
      if (titleEl) {
        member.title = titleEl.textContent.trim();
      }
      
      // Get connection degree
      const degreeEl = card.querySelector(
        '.hirer-card__connection-degree, ' +
        '.distance-badge, ' +
        '[class*="connection-degree"]'
      );
      if (degreeEl) {
        member.connectionDegree = degreeEl.textContent.trim();
      }
      
      // Check for message button
      const entryPoint = card.querySelector('.entry-point, .hirer-card__cta-container');
      if (entryPoint) {
        const btn = entryPoint.querySelector('button');
        if (btn && btn.textContent.toLowerCase().includes('message')) {
          member.hasMessageButton = true;
        }
      }
      
      if (member.name) {
        team.push(member);
      }
    } catch (e) {
      console.error('Error parsing team member:', e);
    }
  });
  
  console.log(`Found ${team.length} hiring team members:`, team);
  return team;
}

// ============================================
// AUTO-FILL APPLICATION FORM
// ============================================

function fillApplicationForm(userProfile) {
  console.log('📝 Attempting to auto-fill application form...', userProfile);
  
  if (!userProfile) {
    return { success: false, message: 'No user profile data provided' };
  }
  
  const filled = [];
  
  try {
    // Helper function to fill an input
    const fillInput = (input, value, fieldName) => {
      if (!value || !input) return false;
      
      // Check if already filled
      if (input.value && input.value.trim()) {
        console.log(`  ⏭️ ${fieldName} already filled`);
        return false;
      }
      
      input.focus();
      input.value = value;
      
      // Trigger events that LinkedIn/React forms need
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      
      console.log(`  ✅ Filled ${fieldName}: ${value}`);
      filled.push(fieldName);
      return true;
    };
    
    // Helper function to find and fill field
    const findAndFill = (selectors, value, fieldName) => {
      for (const selector of selectors) {
        const inputs = document.querySelectorAll(selector);
        inputs.forEach(input => fillInput(input, value, fieldName));
      }
    };
    
    // LinkedIn Easy Apply modal specific selectors
    const easyApplyModal = document.querySelector('.jobs-easy-apply-modal, .artdeco-modal');
    const formContainer = easyApplyModal || document;
    
    console.log('📋 Looking for form fields in:', easyApplyModal ? 'Easy Apply modal' : 'page');
    
    // First name
    findAndFill([
      'input[name*="firstName"]',
      'input[id*="firstName"]', 
      'input[id*="first-name"]',
      'input[aria-label*="First name"]',
      'input[placeholder*="First name"]'
    ], userProfile.firstName, 'firstName');
    
    // Last name
    findAndFill([
      'input[name*="lastName"]',
      'input[id*="lastName"]',
      'input[id*="last-name"]',
      'input[aria-label*="Last name"]',
      'input[placeholder*="Last name"]'
    ], userProfile.lastName, 'lastName');
    
    // Email
    findAndFill([
      'input[name*="email"]',
      'input[id*="email"]',
      'input[type="email"]',
      'input[aria-label*="Email"]',
      'input[placeholder*="Email"]'
    ], userProfile.email, 'email');
    
    // Phone
    findAndFill([
      'input[name*="phone"]',
      'input[id*="phone"]',
      'input[type="tel"]',
      'input[aria-label*="Phone"]',
      'input[aria-label*="Mobile"]',
      'input[placeholder*="Phone"]'
    ], userProfile.phone, 'phone');
    
    // City/Location
    findAndFill([
      'input[name*="city"]',
      'input[id*="city"]',
      'input[name*="location"]',
      'input[aria-label*="City"]',
      'input[aria-label*="Location"]'
    ], userProfile.city || userProfile.location, 'city');
    
    // LinkedIn URL
    findAndFill([
      'input[name*="linkedin"]',
      'input[id*="linkedin"]',
      'input[aria-label*="LinkedIn"]',
      'input[placeholder*="LinkedIn"]'
    ], userProfile.linkedinUrl, 'linkedin');
    
    // GitHub
    findAndFill([
      'input[name*="github"]',
      'input[id*="github"]',
      'input[aria-label*="GitHub"]'
    ], userProfile.githubUrl, 'github');
    
    // Portfolio/Website
    findAndFill([
      'input[name*="portfolio"]',
      'input[name*="website"]',
      'input[id*="portfolio"]',
      'input[aria-label*="Portfolio"]',
      'input[aria-label*="Website"]'
    ], userProfile.portfolioUrl, 'portfolio');
    
    // Look for any label-based inputs in Easy Apply
    const allLabels = formContainer.querySelectorAll('label');
    allLabels.forEach(label => {
      const labelText = label.textContent?.toLowerCase() || '';
      const input = label.querySelector('input') || 
                   formContainer.querySelector(`input[id="${label.getAttribute('for')}"]`);
      
      if (!input || input.value) return;
      
      if (labelText.includes('phone') || labelText.includes('mobile')) {
        fillInput(input, userProfile.phone, 'phone-label');
      } else if (labelText.includes('email')) {
        fillInput(input, userProfile.email, 'email-label');
      } else if (labelText.includes('first') && labelText.includes('name')) {
        fillInput(input, userProfile.firstName, 'firstName-label');
      } else if (labelText.includes('last') && labelText.includes('name')) {
        fillInput(input, userProfile.lastName, 'lastName-label');
      } else if (labelText.includes('city') || labelText.includes('location')) {
        fillInput(input, userProfile.city || userProfile.location, 'city-label');
      } else if (labelText.includes('linkedin')) {
        fillInput(input, userProfile.linkedinUrl, 'linkedin-label');
      }
    });
    
    console.log('✅ Auto-fill complete. Filled fields:', filled);
    
    if (filled.length === 0) {
      return { 
        success: false, 
        filledFields: [], 
        message: 'No empty fields found. Open Easy Apply first, then try Auto-Fill.' 
      };
    }
    
    return { 
      success: true, 
      filledFields: filled, 
      message: `Auto-filled ${filled.length} fields: ${filled.join(', ')}` 
    };
    
  } catch (error) {
    console.error('❌ Error filling form:', error);
    return { success: false, message: error.message };
  }
}

// Detect page type and scan accordingly
function scanCurrentPage() {
  const url = window.location.href;
  
  console.log('Scanning page:', url);
  
  if (url.includes('/jobs/')) {
    return scanJobsPage();
  } else if (url.includes('/feed')) {
    return scanFeedPage();
  } else if (url.includes('/search/')) {
    return scanSearchPage();
  } else {
    // Try both
    const jobs = scanJobsPage();
    const posts = scanFeedPage();
    return [...jobs, ...posts];
  }
}

// Scan LinkedIn Jobs page
function scanJobsPage() {
  const jobs = [];
  
  // Job cards in the left sidebar list
  const jobCards = document.querySelectorAll('.jobs-search-results__list-item, .job-card-container, .jobs-job-board-list__item');
  
  jobCards.forEach((card, index) => {
    try {
      const titleEl = card.querySelector('.job-card-list__title, .job-card-container__link, a[data-control-name="job_card_title"]');
      const companyEl = card.querySelector('.job-card-container__primary-description, .job-card-container__company-name, .artdeco-entity-lockup__subtitle');
      const locationEl = card.querySelector('.job-card-container__metadata-item, .artdeco-entity-lockup__caption');
      const timeEl = card.querySelector('time, .job-card-container__footer-item');
      
      const title = titleEl?.textContent?.trim() || 'Unknown Position';
      const company = companyEl?.textContent?.trim() || 'Unknown Company';
      const location = locationEl?.textContent?.trim() || '';
      const time = timeEl?.textContent?.trim() || '';
      
      jobs.push({
        id: `job-${index}`,
        type: 'job',
        author: company,
        title: title,
        content: `${title} at ${company}. ${location}`,
        time: time,
        isHiring: true, // It's a job listing, so yes
        isRecent: checkIsRecent(time),
        url: titleEl?.href || ''
      });
    } catch (e) {
      console.error('Error parsing job card:', e);
    }
  });
  
  // Also try to get the main job detail panel (right side)
  const mainJobPanel = document.querySelector('.jobs-search__job-details, .job-view-layout');
  if (mainJobPanel) {
    try {
      const titleEl = mainJobPanel.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1');
      const companyEl = mainJobPanel.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name');
      const descEl = mainJobPanel.querySelector('.jobs-description__content, .jobs-box__html-content');
      
      const title = titleEl?.textContent?.trim() || '';
      const company = companyEl?.textContent?.trim() || '';
      const description = descEl?.textContent?.trim().substring(0, 500) || '';
      
      if (title) {
        jobs.unshift({
          id: 'current-job',
          type: 'job-detail',
          author: company,
          title: title,
          content: description || `${title} at ${company}`,
          time: 'Current viewing',
          isHiring: true,
          isRecent: true,
          url: window.location.href
        });
      }
    } catch (e) {
      console.error('Error parsing main job panel:', e);
    }
  }
  
  console.log(`Found ${jobs.length} jobs`);
  return jobs;
}

// Scan LinkedIn Feed page
function scanFeedPage() {
  const posts = [];
  const postElements = document.querySelectorAll('.feed-shared-update-v2');
  
  postElements.forEach((postEl, index) => {
    const post = parsePostElement(postEl, index);
    if (post) posts.push(post);
  });
  
  console.log(`Found ${posts.length} feed posts`);
  return posts;
}

// Scan LinkedIn Search results
function scanSearchPage() {
  const results = [];
  
  // People search results
  const peopleCards = document.querySelectorAll('.reusable-search__result-container');
  
  peopleCards.forEach((card, index) => {
    try {
      const nameEl = card.querySelector('.entity-result__title-text a span');
      const titleEl = card.querySelector('.entity-result__primary-subtitle');
      const summaryEl = card.querySelector('.entity-result__summary');
      
      const name = nameEl?.textContent?.trim() || 'Unknown';
      const title = titleEl?.textContent?.trim() || '';
      const summary = summaryEl?.textContent?.trim() || '';
      
      // Check if this person might be hiring
      const combinedText = `${title} ${summary}`.toLowerCase();
      const isHiring = combinedText.includes('hiring') || 
                       combinedText.includes('recruiter') ||
                       combinedText.includes('talent');
      
      results.push({
        id: `search-${index}`,
        type: 'person',
        author: name,
        title: title,
        content: summary || title,
        time: '',
        isHiring: isHiring,
        isRecent: true
      });
    } catch (e) {
      console.error('Error parsing search result:', e);
    }
  });
  
  console.log(`Found ${results.length} search results`);
  return results;
}

// Parse a single post element
function parsePostElement(postEl, index) {
  try {
    const authorEl = postEl.querySelector('.update-components-actor__name span');
    const authorName = authorEl?.textContent?.trim() || 'Unknown';
    
    const titleEl = postEl.querySelector('.update-components-actor__description');
    const authorTitle = titleEl?.textContent?.trim() || '';
    
    const contentEl = postEl.querySelector('.feed-shared-update-v2__description, .update-components-text');
    const content = contentEl?.textContent?.trim() || '';
    
    const timeEl = postEl.querySelector('.update-components-actor__sub-description');
    const postTime = timeEl?.textContent?.trim() || '';
    
    // Hiring detection
    const isHiring = detectHiringIntent(content);
    
    // Check recency
    const isRecent = checkIsRecent(postTime);
    
    return {
      id: index,
      author: authorName,
      title: authorTitle,
      content: content.substring(0, 500),
      time: postTime,
      isHiring,
      isRecent
    };
  } catch (e) {
    console.error('Error parsing post:', e);
    return null;
  }
}

// Detect if post is about hiring
function detectHiringIntent(content) {
  const contentLower = content.toLowerCase();
  
  const strongSignals = [
    'we\'re hiring', 'we are hiring', 'i\'m hiring', 'i am hiring',
    'looking to hire', 'open position', 'open role', 'job opening',
    'join our team', 'join my team', 'apply now', 'apply here',
    'send your resume', 'send me your resume', 'dm for details',
    'hiring for', 'actively hiring', 'urgently hiring'
  ];
  
  const weakSignals = [
    'looking for', 'seeking', 'need a', 'searching for',
    'reach out', 'dm me', 'connect with me'
  ];
  
  const roleKeywords = [
    'engineer', 'developer', 'designer', 'manager', 'analyst',
    'scientist', 'intern', 'associate', 'specialist', 'lead',
    'director', 'coordinator', 'consultant'
  ];
  
  // Strong signal = definitely hiring
  if (strongSignals.some(s => contentLower.includes(s))) {
    return true;
  }
  
  // Weak signal + role keyword = probably hiring
  const hasWeakSignal = weakSignals.some(s => contentLower.includes(s));
  const hasRoleKeyword = roleKeywords.some(r => contentLower.includes(r));
  
  return hasWeakSignal && hasRoleKeyword;
}

// Check if post is recent (within ~24 hours)
function checkIsRecent(timeString) {
  const timeLower = timeString.toLowerCase();
  
  // "Xm" = minutes ago
  // "Xh" = hours ago
  // "1d" = 1 day ago (within 24h)
  // "now" = just now
  
  return timeLower.includes('m') || 
         timeLower.includes('h') || 
         timeLower.includes('now') ||
         timeLower.includes('1d');
}

// Attempt to connect with a user
function attemptConnect(postId) {
  // Find the post element
  const postElements = document.querySelectorAll('.feed-shared-update-v2');
  const postEl = postElements[postId];
  
  if (!postEl) {
    return { success: false, error: 'Post not found' };
  }
  
  // Look for connect button - this varies based on LinkedIn's current UI
  // Common patterns:
  const connectBtn = postEl.querySelector('button[aria-label*="Connect"]') ||
                     postEl.querySelector('button[aria-label*="connect"]') ||
                     postEl.querySelector('.artdeco-button--secondary');
  
  if (!connectBtn) {
    return { success: false, error: 'Connect button not found' };
  }
  
  // TODO: Click the button and handle the modal
  // For now, just highlight the post
  postEl.style.outline = '3px solid #667eea';
  postEl.style.outlineOffset = '2px';
  
  return { success: true, message: 'Post highlighted for connection' };
}

// Add visual indicator that extension is active
function addActiveIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'linkedin-agent-indicator';
  indicator.innerHTML = '🤖';
  indicator.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 9999;
    cursor: pointer;
    transition: transform 0.2s;
  `;
  
  indicator.addEventListener('mouseenter', () => {
    indicator.style.transform = 'scale(1.1)';
  });
  
  indicator.addEventListener('mouseleave', () => {
    indicator.style.transform = 'scale(1)';
  });
  
  indicator.addEventListener('click', () => {
    // Could trigger a scan or show stats
    console.log('Agent indicator clicked');
  });
  
  document.body.appendChild(indicator);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addActiveIndicator);
} else {
  addActiveIndicator();
}
