# NetConnect — Smart Networking Assistant

A Chrome extension that helps you batch connect with LinkedIn suggestions and send AI-generated personalized messages. **No backend server required** — all AI message generation runs directly in the extension via the free Groq API.

## Features

- 🔍 **Scan LinkedIn Page**: Automatically find "People you may know" suggestions on LinkedIn
- 🤖 **AI-Generated Messages**: Create personalized connection messages using Groq (Llama 3.3 70B) — **free**
- ⚡ **Two Modes**: Quick Connect (no message) or Connect with AI Message
- 💬 **Smart Personalization**: AI considers seniority, shared school/industry, and your profile info
- 📝 **Customizable**: Choose which personal info to include in messages (title, company, school, major, email)
- 🎛️ **Configurable Tone**: Professional or Casual message styles
- 💾 **Local Storage**: All profile data stored locally in Chrome — nothing leaves your browser except Groq API calls

## Project Structure

```
linkedin-connector/
└── chrome-extension/        # Chrome Extension (Manifest V3)
    ├── manifest.json        # Extension config & permissions
    ├── popup/               # Side panel UI
    │   ├── popup.html       # Main UI (Connect / Profile / Settings tabs)
    │   ├── popup.js         # UI logic, local storage management
    │   └── popup.css        # Styling
    ├── content/             # LinkedIn page scripts
    │   ├── content.js       # Page scanning, form handling, Connect flow
    │   └── content.css      # Injected LinkedIn styles
    ├── background/          # Service worker
    │   └── background.js    # Tab management, Groq API calls, AI prompt engineering
    └── icons/               # Extension icons
```

## Setup

### 1. Get a Groq API Key (Free)

1. Go to [console.groq.com/keys](https://console.groq.com/keys)
2. Sign up / log in and create an API key
3. Copy the key (starts with `gsk_...`)

### 2. Install the Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder
5. The extension icon should appear in your toolbar

### 3. Configure the Extension

1. Click the extension icon to open the side panel
2. Go to the **Settings** tab:
   - Paste your **Groq API Key**
   - Set number of connections per session
   - Choose message tone (Professional / Casual)
   - Select which personal info to include in AI messages
   - Click **Save Settings**
3. Go to the **Profile** tab:
   - Fill in your name, email, job title, company, education, skills, etc.
   - Click **Save Profile**

## Usage

### Quick Connect Mode (No Message)

1. Navigate to [LinkedIn My Network](https://www.linkedin.com/mynetwork/grow/) or a search results page
2. Open the side panel → **Connect** tab
3. Click **🔍 Scan Page** to find connection suggestions
4. Select **⚡ Quick Connect** mode
5. Click **🚀 Start** — the extension clicks Connect buttons directly

### Connect with AI Message Mode

1. Navigate to LinkedIn My Network or search results
2. Open the side panel → **Connect** tab
3. Click **🔍 Scan Page**
4. Select **💬 Connect with AI Message** mode
5. Click **🚀 Start** — for each person, the extension will:
   - Open their invite page in a new tab
   - Generate a personalized message via Groq AI
   - Fill in the message and click Send
   - Auto-close the tab and move to the next person

> 💎 **Note**: LinkedIn Premium is recommended for the AI Message mode, as free accounts have limited custom invite note capabilities.

## How It Works

```
Side Panel UI ──► Content Script (LinkedIn page)
                      │
                      ├── Scan: finds "Connect" buttons & extracts names/titles
                      │
                      ├── Quick Connect: clicks Connect directly
                      │
                      └── AI Message: sends request to Background Script
                                          │
                                          ├── Calls Groq API (Llama 3.3 70B)
                                          ├── Opens /preload/custom-invite/ page
                                          ├── Content Script fills form & sends
                                          └── Auto-closes tab on success
```

## Important Notes

⚠️ **LinkedIn Terms of Service**: Use this tool responsibly and in accordance with LinkedIn's terms of service. Excessive automation may result in account restrictions.

⚠️ **Recommended Daily Limits**:
- Quick Connect: max **100** per day
- Connect with Message: max **40** per day
- Exceeding these limits may trigger LinkedIn restrictions

⚠️ **Rate Limiting**: The extension includes configurable delays between connections (default 3 seconds). Don't set the delay too low.

## Tech Stack

- **Extension**: Chrome Extension (Manifest V3), Side Panel API, Vanilla JavaScript
- **AI**: Groq API — Llama 3.3 70B Versatile (free tier)
- **Storage**: Chrome `storage.local` (no external database)

## License

MIT License — Feel free to modify and use for your own purposes.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
