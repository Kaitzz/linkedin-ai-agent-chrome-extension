# LinkedIn AI Agent Chrome Extension

🤖 AI-powered Chrome extension for job seekers - automatically scan LinkedIn jobs, analyze matches with AI, and generate personalized connection messages.

## ✅ Completed Features

### Core Functionality
- **Job Scanning**: Automatically detect and parse job listings from LinkedIn pages
  - Works on `/jobs/search-results/` pages
  - Works on `/jobs/collections/` pages  
  - Extracts job title, company name (from logo alt text), location
  - Displays currently viewed job detail

- **Feed Scanning**: Scan LinkedIn feed for hiring posts
  - Keyword-based detection (hiring, looking for, open position, etc.)
  - Extract author, content, posting time

- **AI Integration (OpenAI)**
  - Analyze jobs/posts for match scoring (0-100%)
  - Generate personalized connection messages
  - Auto-copy generated messages to clipboard
  - Uses GPT-4o-mini for cost efficiency

### Backend Integration 🆕
- **Server Connection**: Connect to backend API server
  - Health check and connection status indicator
  - Real-time sync status in UI

- **User Authentication**
  - Email-based registration/login
  - Token-based session management
  - Persistent login across browser sessions

- **Cloud Data Sync**
  - Save scanned jobs to database
  - Sync settings across devices
  - View scan history from any device

- **Analytics Dashboard**
  - Total jobs scanned counter
  - Average match score
  - Today's activity stats

### User Interface
- Clean popup UI with gradient design
- **Server connection status indicator** 🆕
- **User stats panel (from database)** 🆕
- Settings panel (server URL, email, target role, location, API key)
- Activity log tracking
- Visual indicators for hiring posts vs regular posts
- Match score display with color coding (green/yellow/red)

## 🚧 TODO / Known Issues

### AI Scoring Improvements
- [ ] Better prompt engineering for more accurate match scores
- [ ] Consider user's specific skills and experience in matching
- [ ] Add explanation for why a job matches or doesn't match
- [ ] Batch analysis to reduce API calls

### Auto-Connect Feature
- [ ] Implement actual LinkedIn connect button clicking
- [ ] Add rate limiting to avoid LinkedIn restrictions
- [ ] Queue system for scheduled connections
- [ ] Track connection success/failure

### Auto-Apply Feature
- [ ] Detect "Easy Apply" jobs
- [ ] Auto-fill application forms
- [ ] Resume upload integration

### UI/UX Improvements
- [ ] Show more job details in popup
- [ ] Filter jobs by match score
- [ ] Export scanned jobs to CSV
- [ ] Dark mode support

### Technical Debt
- [ ] Better error handling and user feedback
- [ ] Support for Comet browser (different DOM structure)
- [ ] Handle LinkedIn DOM changes more gracefully
- [ ] Add unit tests

## 🛠️ Installation

### Step 1: Start Django Backend
```bash
cd linkedin-agent-django

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Start server
python manage.py runserver
# Server runs on http://localhost:8000
```

### Step 2: Install Chrome Extension
1. Download and unzip `linkedin-agent-extension`
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `linkedin-agent-extension` folder

### Step 3: Configure Extension
1. Click the extension icon
2. Open **Settings**
3. Verify Server URL: `http://localhost:8000`
4. Enter your email and click **Register/Login**
5. Enter your OpenAI API key
6. Set target role and location
7. Click **Save Settings**

## 📖 Usage

1. **Start backend server** (required for full functionality)
2. Navigate to LinkedIn Jobs or Feed page
3. Click the extension icon
4. Click **🔍 Scan Current Page** to find jobs/posts
5. Click **🤖 Analyze with AI** to get match scores
6. Click **☁️ Save to Server** to persist data to database
7. Click **✉️ Generate Message** on any job to create a personalized connection request

## 🏗️ Architecture

```
┌────────────────────────────────────────┐
│         Chrome Extension               │
│  • Popup UI (stats, controls)          │
│  • Content Script (LinkedIn DOM)       │
│  • Background Worker (API calls)       │
└──────────────┬─────────────────────────┘
               │ REST API
               ▼
┌────────────────────────────────────────┐
│         Django Backend                 │
│  • Django REST Framework               │
│  • Token Authentication                │
│  • AI Proxy (secure API key)           │
│  • Django Admin (free admin UI!)       │
├────────────────────────────────────────┤
│         PostgreSQL / SQLite            │
│  • users                               │
│  • scanned_jobs                        │
│  • connection_requests                 │
│  • activity_logs                       │
└────────────────────────────────────────┘
```

## 🏗️ Project Structure

```
linkedin-agent-extension/
├── manifest.json          # Chrome extension config (Manifest V3)
├── src/
│   ├── popup.html        # Extension popup UI
│   ├── popup.css         # Popup styles
│   ├── popup.js          # Popup logic + LinkedIn DOM parsing
│   ├── content.js        # Injected into LinkedIn pages
│   ├── content.css       # Styles for LinkedIn page
│   └── background.js     # Service worker (AI API calls)
└── icons/                # Extension icons
```

## 🔧 Tech Stack

- **Chrome Extension**: Manifest V3
- **AI**: OpenAI GPT-4o-mini
- **Storage**: Chrome Storage API
- **UI**: Vanilla HTML/CSS/JS

## ⚠️ Disclaimer

This tool is for educational and personal use only. Please:
- Respect LinkedIn's Terms of Service
- Use reasonable delays between actions
- Don't spam connection requests
- Be responsible with automation

## 📝 License

MIT
