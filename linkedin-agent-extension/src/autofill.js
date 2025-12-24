// Auto-fill script for external job application sites
// Runs on Greenhouse, Lever, Workday, etc.

console.log('🤖 LinkedIn AI Agent - AutoFill loaded on:', window.location.hostname);

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('AutoFill received message:', request);
  
  if (request.action === 'fillApplicationForm') {
    const result = fillForm(request.userProfile);
    sendResponse(result);
  }
  
  if (request.action === 'getFormFields') {
    const fields = detectFormFields();
    sendResponse(fields);
  }
  
  return true;
});

// Listen for postMessage from parent window (for cross-frame communication)
window.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'LINKEDIN_AGENT_AUTOFILL') {
    console.log('📨 Received postMessage to autofill:', event.data);
    const profile = event.data.profile;
    if (profile) {
      const result = fillFormInCurrentDoc(profile);
      // Send result back to parent
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'LINKEDIN_AGENT_AUTOFILL_RESULT',
          result: result
        }, '*');
      }
    }
  }
  
  // Handle results from iframes (only in top window)
  if (event.data && event.data.type === 'LINKEDIN_AGENT_AUTOFILL_RESULT' && window === window.top) {
    console.log('📩 Received fill result from iframe:', event.data.result);
    if (event.data.result && event.data.result.filledFields && event.data.result.filledFields.length > 0) {
      // Update button to show success
      const btn = document.getElementById('linkedin-agent-autofill-btn');
      if (btn) {
        btn.innerHTML = '✅';
        btn.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
        btn.title = `Filled in iframe: ${event.data.result.filledFields.join(', ')}`;
      }
    }
  }
});

// Fill form only in current document (for iframe use)
function fillFormInCurrentDoc(profile) {
  console.log('📝 Filling form in current document only...');
  console.log('   Document URL:', window.location.href);
  console.log('   Profile:', profile);
  
  const filled = [];
  const doc = document;
  
  // Log all inputs found
  const allInputs = doc.querySelectorAll('input:not([type="hidden"])');
  console.log(`   Found ${allInputs.length} visible inputs in this document:`);
  allInputs.forEach(inp => {
    console.log(`     - id=${inp.id || '?'}, name=${inp.name || '?'}, type=${inp.type}, aria-label=${inp.getAttribute('aria-label') || '?'}`);
  });
  
  // Direct ID targeting
  const directTargets = [
    { id: 'first_name', value: profile.firstName, label: 'First Name' },
    { id: 'last_name', value: profile.lastName, label: 'Last Name' },
    { id: 'email', value: profile.email, label: 'Email' },
    { id: 'phone', value: profile.phone, label: 'Phone' },
    { id: 'linkedin', value: profile.linkedinUrl, label: 'LinkedIn' },
  ];
  
  for (const target of directTargets) {
    if (!target.value) continue;
    
    // Try multiple ways to find the input
    let input = doc.getElementById(target.id);
    if (!input) input = doc.querySelector(`input[name="${target.id}"]`);
    if (!input) input = doc.querySelector(`input[aria-label="${target.label}"]`);
    if (!input) input = doc.querySelector(`input[id*="${target.id}" i]`);
    if (!input) input = doc.querySelector(`input[name*="${target.id}" i]`);
    
    if (input) {
      console.log(`   Found input for ${target.label}:`, input);
      if (fillInput(input, target.value)) {
        filled.push(target.label);
      }
    }
  }
  
  // Also try autocomplete attributes
  const autocompleteMap = [
    { autocomplete: 'given-name', value: profile.firstName, label: 'First Name' },
    { autocomplete: 'family-name', value: profile.lastName, label: 'Last Name' },
    { autocomplete: 'email', value: profile.email, label: 'Email' },
    { autocomplete: 'tel', value: profile.phone, label: 'Phone' },
  ];
  
  for (const target of autocompleteMap) {
    if (!target.value || filled.includes(target.label)) continue;
    const input = doc.querySelector(`input[autocomplete="${target.autocomplete}"]`);
    if (input && fillInput(input, target.value)) {
      filled.push(target.label);
    }
  }
  
  // Try partial matching
  const partialMatches = [
    { patterns: ['first', 'fname', 'given'], value: profile.firstName, label: 'First Name' },
    { patterns: ['last', 'lname', 'surname', 'family'], value: profile.lastName, label: 'Last Name' },
    { patterns: ['email', 'mail'], value: profile.email, label: 'Email' },
    { patterns: ['phone', 'tel', 'mobile'], value: profile.phone, label: 'Phone' },
    { patterns: ['linkedin'], value: profile.linkedinUrl, label: 'LinkedIn' },
  ];
  
  for (const match of partialMatches) {
    if (!match.value || filled.includes(match.label)) continue;
    
    for (const pattern of match.patterns) {
      const input = doc.querySelector(
        `input[id*="${pattern}" i]:not([type="hidden"]), ` +
        `input[name*="${pattern}" i]:not([type="hidden"])`
      );
      
      if (input && fillInput(input, match.value)) {
        filled.push(match.label);
        break;
      }
    }
  }
  
  console.log(`   ✅ Filled ${filled.length} fields in current doc:`, filled);
  return { success: filled.length > 0, filledFields: filled };
}

// ============================================
// FORM FIELD DETECTION
// ============================================

function detectFormFields() {
  const fields = {
    firstName: findField(['first_name', 'firstname', 'first-name', 'fname', 'given_name']),
    lastName: findField(['last_name', 'lastname', 'last-name', 'lname', 'family_name', 'surname']),
    email: findField(['email', 'e-mail', 'email_address']),
    phone: findField(['phone', 'telephone', 'tel', 'mobile', 'phone_number', 'cell']),
    linkedin: findField(['linkedin', 'linkedin_url', 'linkedin_profile', 'linkedinurl']),
    location: findField(['location', 'city', 'address']),
    website: findField(['website', 'portfolio', 'url', 'personal_website']),
    github: findField(['github', 'github_url'])
  };
  
  console.log('Detected fields:', fields);
  return fields;
}

function findField(keywords) {
  // Try to find input/textarea by various attributes
  for (const keyword of keywords) {
    // By name attribute
    let el = document.querySelector(`input[name*="${keyword}" i], textarea[name*="${keyword}" i]`);
    if (el) return { found: true, selector: `[name*="${keyword}"]`, type: el.type || 'text' };
    
    // By id attribute
    el = document.querySelector(`input[id*="${keyword}" i], textarea[id*="${keyword}" i]`);
    if (el) return { found: true, selector: `[id*="${keyword}"]`, type: el.type || 'text' };
    
    // By placeholder
    el = document.querySelector(`input[placeholder*="${keyword}" i], textarea[placeholder*="${keyword}" i]`);
    if (el) return { found: true, selector: `[placeholder*="${keyword}"]`, type: el.type || 'text' };
    
    // By aria-label
    el = document.querySelector(`input[aria-label*="${keyword}" i], textarea[aria-label*="${keyword}" i]`);
    if (el) return { found: true, selector: `[aria-label*="${keyword}"]`, type: el.type || 'text' };
    
    // By data-* attribute
    el = document.querySelector(`input[data-field*="${keyword}" i], input[data-name*="${keyword}" i]`);
    if (el) return { found: true, selector: `[data-field*="${keyword}"]`, type: el.type || 'text' };
  }
  
  // Try finding by label text
  const labels = document.querySelectorAll('label');
  for (const label of labels) {
    const labelText = label.textContent.toLowerCase();
    for (const keyword of keywords) {
      if (labelText.includes(keyword)) {
        // Find associated input
        const forId = label.getAttribute('for');
        if (forId) {
          const input = document.getElementById(forId);
          if (input) return { found: true, selector: `#${forId}`, type: input.type || 'text' };
        }
        // Check for input inside label
        const input = label.querySelector('input, textarea');
        if (input) return { found: true, element: input, type: input.type || 'text' };
      }
    }
  }
  
  return { found: false };
}

// ============================================
// FORM FILLING
// ============================================

function fillForm(profile) {
  console.log('📝 ====== STARTING FORM FILL ======');
  console.log('Profile data:', profile);
  
  if (!profile) {
    return { success: false, message: 'No profile data provided', filledFields: [] };
  }
  
  const filled = [];
  
  // Get all documents to search (main document + iframes)
  const documents = getAllDocuments();
  console.log(`🔍 Found ${documents.length} document(s) to search (including iframes)`);
  
  for (let docIndex = 0; docIndex < documents.length; docIndex++) {
    const doc = documents[docIndex];
    console.log(`📄 Searching document ${docIndex + 1}/${documents.length}...`);
    
    // =============================================
    // METHOD 0: DIRECT ID/NAME TARGETING
    // =============================================
    console.log('🎯 Method 0: Direct targeting by exact ID...');
    
    const directTargets = [
      { id: 'first_name', value: profile.firstName, label: 'First Name' },
      { id: 'last_name', value: profile.lastName, label: 'Last Name' },
      { id: 'email', value: profile.email, label: 'Email' },
      { id: 'phone', value: profile.phone, label: 'Phone' },
      { id: 'linkedin', value: profile.linkedinUrl, label: 'LinkedIn' },
      { id: 'city', value: profile.city, label: 'City' },
      { id: 'location', value: profile.city, label: 'Location' },
    ];
    
    for (const target of directTargets) {
      if (!target.value) continue;
      
      // Try exact ID match
      let input = doc.getElementById(target.id);
      console.log(`  Looking for #${target.id}:`, input ? 'FOUND' : 'not found');
      
      if (input && fillInput(input, target.value)) {
        if (!filled.includes(target.label)) filled.push(target.label);
        continue;
      }
      
      // Try name attribute
      input = doc.querySelector(`input[name="${target.id}"]`);
      if (input && fillInput(input, target.value)) {
        if (!filled.includes(target.label)) filled.push(target.label);
      }
    }
    
    // =============================================
    // METHOD 1: aria-label targeting
    // =============================================
    console.log('🎯 Method 1: Targeting by aria-label...');
    
    const ariaTargets = [
      { label: 'First Name', value: profile.firstName, filled: 'First Name' },
      { label: 'Last Name', value: profile.lastName, filled: 'Last Name' },
      { label: 'Email', value: profile.email, filled: 'Email' },
      { label: 'Phone', value: profile.phone, filled: 'Phone' },
      { label: 'LinkedIn', value: profile.linkedinUrl, filled: 'LinkedIn' },
      { label: 'LinkedIn Profile', value: profile.linkedinUrl, filled: 'LinkedIn' },
    ];
    
    for (const target of ariaTargets) {
      if (!target.value || filled.includes(target.filled)) continue;
      
      const input = doc.querySelector(`input[aria-label="${target.label}"]`);
      console.log(`  Looking for [aria-label="${target.label}"]:`, input ? 'FOUND' : 'not found');
      
      if (input && fillInput(input, target.value)) {
        if (!filled.includes(target.filled)) filled.push(target.filled);
      }
    }
    
    // =============================================
    // METHOD 2: autocomplete attribute
    // =============================================
    console.log('🎯 Method 2: Targeting by autocomplete attribute...');
    
    const autocompleteTargets = [
      { autocomplete: 'given-name', value: profile.firstName, label: 'First Name' },
      { autocomplete: 'family-name', value: profile.lastName, label: 'Last Name' },
      { autocomplete: 'email', value: profile.email, label: 'Email' },
      { autocomplete: 'tel', value: profile.phone, label: 'Phone' },
    ];
    
    for (const target of autocompleteTargets) {
      if (!target.value || filled.includes(target.label)) continue;
      
      const input = doc.querySelector(`input[autocomplete="${target.autocomplete}"]`);
      console.log(`  Looking for [autocomplete="${target.autocomplete}"]:`, input ? 'FOUND' : 'not found');
      
      if (input && fillInput(input, target.value)) {
        if (!filled.includes(target.label)) filled.push(target.label);
      }
    }
    
    // =============================================
    // METHOD 3: Partial ID/name matching (fallback)
    // =============================================
    console.log('🎯 Method 3: Partial matching...');
    
    const partialMatches = [
      { patterns: ['first', 'fname', 'given'], value: profile.firstName, label: 'First Name' },
      { patterns: ['last', 'lname', 'surname', 'family'], value: profile.lastName, label: 'Last Name' },
      { patterns: ['email', 'mail'], value: profile.email, label: 'Email' },
      { patterns: ['phone', 'tel', 'mobile'], value: profile.phone, label: 'Phone' },
      { patterns: ['linkedin'], value: profile.linkedinUrl, label: 'LinkedIn' },
    ];
    
    for (const match of partialMatches) {
      if (!match.value || filled.includes(match.label)) continue;
      
      for (const pattern of match.patterns) {
        const input = doc.querySelector(
          `input[id*="${pattern}" i]:not([type="hidden"]), ` +
          `input[name*="${pattern}" i]:not([type="hidden"])`
        );
        
        if (input && fillInput(input, match.value)) {
          if (!filled.includes(match.label)) {
            filled.push(match.label);
            console.log(`  ✅ Filled ${match.label} via pattern: ${pattern}`);
          }
          break;
        }
      }
    }
    
    // =============================================
    // METHOD 4: Label text association
    // =============================================
    console.log('🎯 Method 4: Label text association...');
    fillByLabelTextInDoc(doc, profile, filled);
    
    // =============================================
    // METHOD 5: Platform-specific
    // =============================================
    console.log('🎯 Method 5: Platform-specific...');
    fillGreenhouseFormInDoc(doc, profile, filled);
    fillLeverFormInDoc(doc, profile, filled);
    fillWorkdayFormInDoc(doc, profile, filled);
  }
  
  // =============================================
  // RESULTS
  // =============================================
  const uniqueFilled = [...new Set(filled)];
  console.log('📋 ====== FILL COMPLETE ======');
  console.log(`Total filled: ${uniqueFilled.length} fields:`, uniqueFilled);
  
  return { 
    success: uniqueFilled.length > 0, 
    message: uniqueFilled.length > 0 ? `Auto-filled ${uniqueFilled.length} fields` : 'No fillable fields found', 
    filledFields: uniqueFilled
  };
}

// Get all documents including iframes
function getAllDocuments() {
  const docs = [document];
  
  try {
    // Get all iframes
    const iframes = document.querySelectorAll('iframe');
    console.log(`Found ${iframes.length} iframes on page`);
    
    for (const iframe of iframes) {
      try {
        console.log(`  Iframe: src=${iframe.src || 'none'}, id=${iframe.id || 'none'}, name=${iframe.name || 'none'}`);
        
        // Try to access iframe content (same-origin only)
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          console.log(`    ✅ CAN access this iframe's document`);
          
          // Log what's in the iframe
          const inputs = iframeDoc.querySelectorAll('input');
          console.log(`    Found ${inputs.length} inputs in iframe`);
          inputs.forEach(inp => {
            console.log(`      - input: id=${inp.id}, name=${inp.name}, type=${inp.type}, aria-label=${inp.getAttribute('aria-label')}`);
          });
          
          docs.push(iframeDoc);
          
          // Also check for nested iframes
          const nestedIframes = iframeDoc.querySelectorAll('iframe');
          for (const nested of nestedIframes) {
            try {
              const nestedDoc = nested.contentDocument || nested.contentWindow?.document;
              if (nestedDoc) {
                console.log(`    Found nested iframe with ${nestedDoc.querySelectorAll('input').length} inputs`);
                docs.push(nestedDoc);
              }
            } catch (e) {
              console.log(`    ❌ Cannot access nested iframe (cross-origin)`);
            }
          }
        }
      } catch (e) {
        console.log(`    ❌ Cannot access iframe (cross-origin): ${e.message}`);
      }
    }
    
    // Also list all inputs on the main page for debugging
    const mainInputs = document.querySelectorAll('input');
    console.log(`Main page has ${mainInputs.length} inputs`);
    
  } catch (e) {
    console.error('Error getting iframes:', e);
  }
  
  return docs;
}

function fillFieldByKeywords(keywords, value) {
  for (const keyword of keywords) {
    // Try multiple selector patterns
    const selectors = [
      `input[name*="${keyword}" i]`,
      `input[id*="${keyword}" i]`,
      `input[placeholder*="${keyword}" i]`,
      `input[aria-label*="${keyword}" i]`,
      `input[data-field*="${keyword}" i]`,
      `textarea[name*="${keyword}" i]`,
      `textarea[id*="${keyword}" i]`,
    ];
    
    for (const selector of selectors) {
      const inputs = document.querySelectorAll(selector);
      for (const input of inputs) {
        if (fillInput(input, value)) {
          return { success: true, selector };
        }
      }
    }
  }
  
  return { success: false };
}

function fillInput(input, value) {
  if (!input) {
    console.log('❌ Input is null');
    return false;
  }
  
  if (input.disabled) {
    console.log('❌ Input is disabled:', input.id || input.name);
    return false;
  }
  
  // Allow filling even if it has a value (user might want to overwrite)
  // Skip only if the value is already what we want to set
  if (input.value === value) {
    console.log('⏭️ Input already has this value:', input.id || input.name);
    return true; // Consider it filled
  }
  
  try {
    const inputId = input.id || input.name || input.className;
    console.log(`📝 Attempting to fill: ${inputId} with: ${value.substring(0, 30)}...`);
    
    // Focus first
    input.focus();
    
    // For React apps, we need to use the native setter
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
                       Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    
    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    
    // Also set via setAttribute for some frameworks
    input.setAttribute('value', value);
    
    // Dispatch events in the order React expects
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    input.dispatchEvent(inputEvent);
    
    const changeEvent = new Event('change', { bubbles: true, cancelable: true });
    input.dispatchEvent(changeEvent);
    
    // Some forms also listen for keyup/keydown
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
    
    // Blur to trigger validation
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    
    // Verify
    const success = input.value === value;
    console.log(`${success ? '✅' : '⚠️'} Fill result for ${inputId}: value=${input.value.substring(0, 20)}`);
    
    return true; // Return true even if verification fails - we tried
  } catch (e) {
    console.error('❌ Error filling input:', e);
    return false;
  }
}

// ============================================
// PLATFORM-SPECIFIC FILLING
// ============================================

function fillGreenhouseForm(profile, filled) {
  fillGreenhouseFormInDoc(document, profile, filled);
}

function fillGreenhouseFormInDoc(doc, profile, filled) {
  console.log('🌿 Trying Greenhouse-specific selectors...');
  
  // Greenhouse uses exact field IDs
  const greenhouseFields = [
    { id: 'first_name', value: profile.firstName, label: 'First Name' },
    { id: 'last_name', value: profile.lastName, label: 'Last Name' },
    { id: 'email', value: profile.email, label: 'Email' },
    { id: 'phone', value: profile.phone, label: 'Phone' },
  ];
  
  for (const field of greenhouseFields) {
    if (!field.value) continue;
    
    // Try exact ID match first
    let input = doc.getElementById(field.id);
    
    // Also try name attribute
    if (!input) {
      input = doc.querySelector(`input[name="${field.id}"]`);
    }
    
    // Try aria-label
    if (!input) {
      input = doc.querySelector(`input[aria-label="${field.label}"]`);
    }
    
    if (input) {
      console.log(`Found Greenhouse field: ${field.id}`, input);
      if (fillInput(input, field.value)) {
        if (!filled.includes(field.label)) {
          filled.push(field.label);
        }
      }
    }
  }
  
  // Greenhouse LinkedIn field - often a custom question
  const linkedinInput = doc.querySelector(
    'input[name*="linkedin" i], ' +
    'input[id*="linkedin" i], ' +
    'input[placeholder*="linkedin" i], ' +
    'input[aria-label*="LinkedIn" i]'
  );
  if (linkedinInput && profile.linkedinUrl) {
    if (fillInput(linkedinInput, profile.linkedinUrl)) {
      if (!filled.includes('LinkedIn')) {
        filled.push('LinkedIn');
      }
    }
  }
}

function fillLeverForm(profile, filled) {
  fillLeverFormInDoc(document, profile, filled);
}

function fillLeverFormInDoc(doc, profile, filled) {
  // Lever uses specific class names
  const leverSelectors = {
    name: '.application-name input, input[name="name"]',
    email: '.application-email input, input[name="email"]',
    phone: '.application-phone input, input[name="phone"]',
    linkedin: '.application-linkedin input, input[name*="linkedin"]',
  };
  
  // Lever often has a full name field
  const nameInput = doc.querySelector(leverSelectors.name);
  if (nameInput && profile.firstName && profile.lastName) {
    const fullName = `${profile.firstName} ${profile.lastName}`;
    if (fillInput(nameInput, fullName)) {
      filled.push('Full Name');
    }
  }
  
  const emailInput = doc.querySelector(leverSelectors.email);
  if (emailInput && profile.email && fillInput(emailInput, profile.email)) {
    filled.push('Email');
  }
  
  const phoneInput = doc.querySelector(leverSelectors.phone);
  if (phoneInput && profile.phone && fillInput(phoneInput, profile.phone)) {
    filled.push('Phone');
  }
  
  const linkedinInput = doc.querySelector(leverSelectors.linkedin);
  if (linkedinInput && profile.linkedinUrl && fillInput(linkedinInput, profile.linkedinUrl)) {
    filled.push('LinkedIn');
  }
}

function fillWorkdayForm(profile, filled) {
  fillWorkdayFormInDoc(document, profile, filled);
}

function fillWorkdayFormInDoc(doc, profile, filled) {
  // Workday uses data-automation-id attributes
  const workdayFields = [
    { selector: '[data-automation-id="legalNameSection_firstName"] input, input[data-automation-id="firstName"]', value: profile.firstName, label: 'First Name' },
    { selector: '[data-automation-id="legalNameSection_lastName"] input, input[data-automation-id="lastName"]', value: profile.lastName, label: 'Last Name' },
    { selector: '[data-automation-id="email"] input, input[data-automation-id="email"]', value: profile.email, label: 'Email' },
    { selector: '[data-automation-id="phone"] input, input[data-automation-id="phone-number"]', value: profile.phone, label: 'Phone' },
  ];
  
  for (const field of workdayFields) {
    if (!field.value) continue;
    const input = doc.querySelector(field.selector);
    if (input && fillInput(input, field.value)) {
      filled.push(field.label);
    }
  }
}

function fillByLabelText(profile, filled) {
  fillByLabelTextInDoc(document, profile, filled);
}

function fillByLabelTextInDoc(doc, profile, filled) {
  // Find inputs by their associated label text
  const labelMappings = [
    { text: ['first name', 'given name', 'prénom'], value: profile.firstName, label: 'First Name' },
    { text: ['last name', 'family name', 'surname', 'nom'], value: profile.lastName, label: 'Last Name' },
    { text: ['email', 'e-mail', 'email address'], value: profile.email, label: 'Email' },
    { text: ['phone', 'telephone', 'mobile', 'cell'], value: profile.phone, label: 'Phone' },
    { text: ['linkedin', 'linkedin url', 'linkedin profile'], value: profile.linkedinUrl, label: 'LinkedIn' },
  ];
  
  const labels = doc.querySelectorAll('label');
  
  for (const mapping of labelMappings) {
    if (!mapping.value) continue;
    if (filled.includes(mapping.label)) continue; // Already filled
    
    for (const label of labels) {
      const labelText = label.textContent.toLowerCase().trim();
      
      if (mapping.text.some(t => labelText.includes(t))) {
        // Find the associated input
        let input = null;
        
        // Method 1: for attribute
        const forId = label.getAttribute('for');
        if (forId) {
          input = doc.getElementById(forId);
        }
        
        // Method 2: input inside label
        if (!input) {
          input = label.querySelector('input, textarea');
        }
        
        // Method 3: next sibling
        if (!input) {
          input = label.nextElementSibling;
          if (input && !['INPUT', 'TEXTAREA'].includes(input.tagName)) {
            input = input.querySelector('input, textarea');
          }
        }
        
        // Method 4: parent's next sibling
        if (!input) {
          const parent = label.parentElement;
          if (parent) {
            const nextEl = parent.nextElementSibling;
            if (nextEl) {
              input = nextEl.querySelector('input, textarea') || (nextEl.tagName === 'INPUT' ? nextEl : null);
            }
          }
        }
        
        if (input && fillInput(input, mapping.value)) {
          filled.push(mapping.label);
          break;
        }
      }
    }
  }
}

function fillByAriaLabel(profile, filled) {
  // Find inputs by aria-label attribute
  console.log('🔍 Trying aria-label matching...');
  
  const ariaLabelMappings = [
    { labels: ['First Name', 'First name', 'first name'], value: profile.firstName, label: 'First Name' },
    { labels: ['Last Name', 'Last name', 'last name'], value: profile.lastName, label: 'Last Name' },
    { labels: ['Email', 'email', 'Email Address'], value: profile.email, label: 'Email' },
    { labels: ['Phone', 'phone', 'Phone Number', 'Telephone'], value: profile.phone, label: 'Phone' },
    { labels: ['LinkedIn', 'LinkedIn Profile', 'LinkedIn URL'], value: profile.linkedinUrl, label: 'LinkedIn' },
  ];
  
  for (const mapping of ariaLabelMappings) {
    if (!mapping.value) continue;
    if (filled.includes(mapping.label)) continue;
    
    for (const ariaLabel of mapping.labels) {
      const input = document.querySelector(`input[aria-label="${ariaLabel}"], textarea[aria-label="${ariaLabel}"]`);
      if (input && fillInput(input, mapping.value)) {
        filled.push(mapping.label);
        console.log(`✅ Filled ${mapping.label} via aria-label: ${ariaLabel}`);
        break;
      }
    }
  }
}

// ============================================
// FLOATING AUTO-FILL BUTTON (任何网站都显示)
// ============================================

function createAutoFillButton() {
  // Check if button already exists
  if (document.getElementById('linkedin-agent-autofill-btn')) return;
  
  // Create container
  const container = document.createElement('div');
  container.id = 'linkedin-agent-autofill-container';
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  // Create main button
  const btn = document.createElement('button');
  btn.id = 'linkedin-agent-autofill-btn';
  btn.innerHTML = '🤖';
  btn.title = 'Auto-Fill Form (LinkedIn AI Agent)';
  btn.style.cssText = `
    width: 48px;
    height: 48px;
    padding: 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 50%;
    font-size: 22px;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.1)';
    btn.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)';
  });
  
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
  });
  
  btn.addEventListener('click', async () => {
    btn.innerHTML = '⏳';
    btn.disabled = true;
    
    // Get profile from storage
    const profile = await chrome.storage.local.get([
      'firstName', 'lastName', 'phone', 'city', 
      'linkedinUrl', 'githubUrl', 'portfolioUrl', 'userEmail'
    ]);
    
    // Add email to profile
    profile.email = profile.userEmail;
    
    console.log('🤖 Auto-filling with profile:', profile);
    
    // Check if profile has data
    if (!profile.firstName && !profile.email) {
      btn.innerHTML = '❓';
      btn.title = 'No profile data - click extension icon to set up';
      setTimeout(() => {
        btn.innerHTML = '🤖';
        btn.title = 'Auto-Fill Form (LinkedIn AI Agent)';
        btn.disabled = false;
      }, 2000);
      return;
    }
    
    // Try multiple times with delays (for iframes that load slowly)
    let result = { success: false, filledFields: [] };
    
    for (let attempt = 0; attempt < 3; attempt++) {
      console.log(`🔄 Attempt ${attempt + 1}/3...`);
      
      // Wait for potential iframe loading
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
      
      // Fill forms in current document and accessible iframes
      result = fillForm(profile);
      
      // Also send postMessage to ALL iframes (including cross-origin)
      // This will trigger the autofill script running inside those iframes
      const iframes = document.querySelectorAll('iframe');
      console.log(`📤 Sending postMessage to ${iframes.length} iframes...`);
      for (const iframe of iframes) {
        try {
          iframe.contentWindow.postMessage({
            type: 'LINKEDIN_AGENT_AUTOFILL',
            profile: profile
          }, '*');
          console.log(`  Sent to iframe: ${iframe.src || iframe.id || 'anonymous'}`);
        } catch (e) {
          console.log(`  Failed to send to iframe: ${e.message}`);
        }
      }
      
      // Wait a bit for iframe responses
      await new Promise(r => setTimeout(r, 500));
      
      if (result.success && result.filledFields.length > 0) {
        break;
      }
    }
    
    // Also check for results from iframes via postMessage
    // (These are collected asynchronously)
    
    if (result.success && result.filledFields.length > 0) {
      btn.innerHTML = '✅';
      btn.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
      btn.title = `Filled: ${result.filledFields.join(', ')}`;
    } else {
      btn.innerHTML = '❌';
      btn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
      btn.title = 'No fillable fields found - form may be in a protected iframe';
    }
    
    // Reset button after 3 seconds
    setTimeout(() => {
      btn.innerHTML = '🤖';
      btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      btn.title = 'Auto-Fill Form (LinkedIn AI Agent)';
      btn.disabled = false;
    }, 3000);
  });
  
  container.appendChild(btn);
  document.body.appendChild(container);
}

// Initialize
async function init() {
  // Check if we're in an iframe
  const isInIframe = window !== window.top;
  
  if (isInIframe) {
    console.log('🤖 AutoFill script running in IFRAME:', window.location.href);
    // In iframe: just listen for messages, don't show button
    return;
  }
  
  console.log('🤖 AutoFill script running in TOP WINDOW:', window.location.href);
  
  // Check if button should be shown
  const settings = await chrome.storage.local.get(['showAutoFillBtn']);
  
  // Default to true if not set
  if (settings.showAutoFillBtn !== false) {
    createAutoFillButton();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Listen for setting changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.showAutoFillBtn) {
    const container = document.getElementById('linkedin-agent-autofill-container');
    if (changes.showAutoFillBtn.newValue === false) {
      // Remove button
      if (container) container.remove();
    } else {
      // Add button
      if (!container) createAutoFillButton();
    }
  }
});

console.log('🤖 AutoFill script ready - button will appear on all sites (if enabled)');
