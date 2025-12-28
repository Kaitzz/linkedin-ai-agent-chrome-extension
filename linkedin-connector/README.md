# LinkedIn Auto Connector

A Chrome extension that helps you batch connect with LinkedIn suggestions and send AI-generated personalized messages.

## Features

- 🔍 **Scan LinkedIn Page**: Automatically find "People you may know" suggestions
- 🤖 **AI-Generated Messages**: Create personalized connection messages using OpenAI
- ⚡ **Batch Connect**: Send multiple connection requests efficiently
- 📊 **Track Usage**: Monitor your connection activities
- 💾 **Save Profile**: Store your information for consistent messaging

## Project Structure

```
linkedin-connector/
├── backend/                 # Django REST API
│   ├── linkedin_connector/  # Main Django project
│   ├── api/                 # API application
│   │   ├── models.py       # Database models
│   │   ├── views.py        # API endpoints
│   │   ├── serializers.py  # DRF serializers
│   │   └── services/       # OpenAI integration
│   ├── requirements.txt
│   └── manage.py
│
└── chrome-extension/        # Chrome Extension
    ├── manifest.json        # Extension config
    ├── popup/              # Extension popup UI
    ├── content/            # LinkedIn page scripts
    ├── background/         # Service worker
    └── icons/              # Extension icons
```

## Setup Instructions

### 1. Backend Setup

```bash
cd backend

# Create virtual environment (optional but recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your settings:
# - Add your OPENAI_API_KEY
# - Configure PostgreSQL if needed (SQLite works for development)

# Run migrations
python manage.py migrate

# Create superuser (optional, for admin access)
python manage.py createsuperuser

# Start the development server
python manage.py runserver
```

### 2. PostgreSQL Setup (Optional)

For production, set up PostgreSQL:

```bash
# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Create database
sudo -u postgres psql
CREATE DATABASE linkedin_connector;
CREATE USER youruser WITH PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE linkedin_connector TO youruser;
\q

# Update .env with your database credentials
```

### 3. Chrome Extension Setup

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `chrome-extension` folder
5. The extension icon should appear in your toolbar

## Usage

### 1. Configure Your Profile

1. Click the extension icon
2. Go to the "Profile" tab
3. Fill in your information:
   - Name and email (required)
   - Current job title and company
   - Target role and industry
   - Education details
   - Skills and connection purpose
4. Click "Save Profile"

### 2. Configure Settings

1. Go to the "Settings" tab
2. Adjust:
   - **Message Tone**: Professional, friendly, or casual
   - **Delay**: Seconds between connections (3-5 recommended)
   - **Max Connections**: Limit per session
   - **API URL**: Your backend server URL

### 3. Start Connecting

1. Navigate to [LinkedIn My Network](https://www.linkedin.com/mynetwork/grow/)
2. Click the extension icon
3. Go to the "Connect" tab
4. Click "Scan Page" to find suggestions
5. Review found connections
6. Click "Start Connecting" to begin

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/health/` | GET | Health check |
| `/api/v1/profiles/` | GET, POST | User profiles CRUD |
| `/api/v1/profiles/by_email/` | GET | Get profile by email |
| `/api/v1/generate-message/` | POST | Generate single message |
| `/api/v1/generate-messages/batch/` | POST | Generate batch messages |
| `/api/v1/connections/` | GET, POST | Connection request records |
| `/api/v1/stats/<profile_id>/` | GET | Usage statistics |

## API Request Examples

### Generate a Message

```bash
curl -X POST http://localhost:8000/api/v1/generate-message/ \
  -H "Content-Type: application/json" \
  -d '{
    "user_name": "John Doe",
    "user_title": "Software Engineer",
    "user_company": "Tech Corp",
    "target_name": "Jane Smith",
    "target_title": "Product Manager",
    "target_company": "Innovation Inc",
    "tone": "professional"
  }'
```

### Create User Profile

```bash
curl -X POST http://localhost:8000/api/v1/profiles/ \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "current_title": "Software Engineer",
    "current_company": "Tech Corp",
    "school": "Stanford University",
    "skills": "Python, JavaScript, React",
    "connection_purpose": "Looking for opportunities in AI/ML"
  }'
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DEBUG` | Debug mode | `True` |
| `SECRET_KEY` | Django secret key | (auto-generated) |
| `OPENAI_API_KEY` | Your OpenAI API key | (required) |
| `DB_NAME` | PostgreSQL database name | - |
| `DB_USER` | PostgreSQL username | - |
| `DB_PASSWORD` | PostgreSQL password | - |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |

## Important Notes

⚠️ **LinkedIn Terms of Service**: Use this tool responsibly and in accordance with LinkedIn's terms of service. Excessive automation may result in account restrictions.

⚠️ **Rate Limiting**: The extension includes delays between connections to avoid triggering LinkedIn's rate limits. Don't set the delay too low.

⚠️ **Message Quality**: While AI generates personalized messages, review them for appropriateness before sending.

## Tech Stack

- **Backend**: Django 5.0+, Django REST Framework, PostgreSQL/SQLite
- **AI**: OpenAI GPT-4o-mini
- **Frontend**: Chrome Extension (Manifest V3), Vanilla JavaScript

## License

MIT License - Feel free to modify and use for your own purposes.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
