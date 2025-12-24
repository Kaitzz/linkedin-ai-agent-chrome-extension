# LinkedIn AI Agent - Django Backend

🐍 Python + Django + PostgreSQL backend for the LinkedIn AI Agent Chrome Extension.

## 🏗️ Architecture

```
┌────────────────────────────────────────┐
│         Chrome Extension               │
└──────────────┬─────────────────────────┘
               │ REST API
               ▼
┌────────────────────────────────────────┐
│         Django Backend                 │
│  ┌──────────────────────────────────┐  │
│  │  Django REST Framework           │  │
│  │  • Serializers (JSON ↔ Models)   │  │
│  │  • Views (API endpoints)         │  │
│  │  • Authentication                │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │  Django ORM                      │  │
│  │  • Models (database schema)      │  │
│  │  • Migrations (schema changes)   │  │
│  │  • QuerySets (database queries)  │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │  Django Admin                    │  │
│  │  • Auto-generated admin UI       │  │
│  │  • Data management               │  │
│  └──────────────────────────────────┘  │
├────────────────────────────────────────┤
│         PostgreSQL / SQLite            │
└────────────────────────────────────────┘
```

## 🗄️ Database Models

### Entity Relationship Diagram
```
User (1) ─────<< ScannedJob (N)
  │
  ├─────────<< ConnectionRequest (N)
  │
  └─────────<< ActivityLog (N)
```

### Models

```python
# User - Custom user model with email authentication
class User(AbstractBaseUser):
    id = UUIDField(primary_key=True)
    email = EmailField(unique=True)
    target_role = CharField(max_length=200)
    location = CharField(max_length=200)
    api_key_encrypted = TextField()  # Secure storage
    created_at = DateTimeField(auto_now_add=True)

# ScannedJob - Jobs scanned from LinkedIn
class ScannedJob(Model):
    id = UUIDField(primary_key=True)
    user = ForeignKey(User, on_delete=CASCADE)  # Foreign Key!
    title = CharField(max_length=500)
    company = CharField(max_length=200)
    match_score = IntegerField()  # 0-100
    ai_analysis = JSONField()
    scanned_at = DateTimeField(auto_now_add=True)
    
    class Meta:
        indexes = [
            Index(fields=['user', 'scanned_at']),  # Query optimization
        ]
```

## 📡 REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/users/register` | Register new user |
| POST | `/api/users/login` | Login |
| GET | `/api/users/profile` | Get profile |
| PUT | `/api/users/settings` | Update settings |
| POST | `/api/jobs/scan` | Save scanned jobs |
| GET | `/api/jobs/history` | Get scan history |
| POST | `/api/ai/analyze` | AI analysis |
| GET | `/api/analytics/stats` | User statistics |

## 🚀 Getting Started

### Quick Start (SQLite)
```bash
# Clone and enter directory
cd linkedin-agent-django

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Create admin user
python manage.py createsuperuser

# Start server
python manage.py runserver
```

### With PostgreSQL
```bash
# Install PostgreSQL and create database
createdb linkedin_agent

# Set environment variable
export DATABASE_URL=postgresql://user:password@localhost:5432/linkedin_agent

# Run migrations
python manage.py migrate

# Start server
python manage.py runserver
```

## 🖥️ Access Points

After starting the server:

| URL | Description |
|-----|-------------|
| http://localhost:8000 | Dashboard (view data) |
| http://localhost:8000/admin | Django Admin |
| http://localhost:8000/api/health | API Health Check |

## 📁 Project Structure

```
linkedin-agent-django/
├── config/                 # Project settings
│   ├── settings.py        # Django configuration
│   ├── urls.py            # URL routing
│   └── wsgi.py            # WSGI application
├── api/                    # Main application
│   ├── models.py          # Database models ⭐
│   ├── views.py           # API endpoints
│   ├── serializers.py     # JSON serialization
│   ├── admin.py           # Admin configuration
│   ├── urls.py            # API routes
│   └── authentication.py  # Token auth
├── manage.py              # Django CLI
├── requirements.txt       # Dependencies
└── .env.example          # Environment template
```

## 🔑 Key Django Concepts Demonstrated

### 1. ORM & Foreign Keys
```python
# Relationship: User has many ScannedJobs
class ScannedJob(models.Model):
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE,  # Delete jobs when user deleted
        related_name='scanned_jobs'  # user.scanned_jobs.all()
    )
```

### 2. Database Indexes
```python
class Meta:
    indexes = [
        models.Index(fields=['user', 'scanned_at']),  # Speeds up queries
    ]
```

### 3. Migrations
```bash
python manage.py makemigrations  # Detect model changes
python manage.py migrate         # Apply to database
```

### 4. QuerySet Optimization
```python
# select_related prevents N+1 queries
jobs = ScannedJob.objects.select_related('user').all()

# Aggregation
avg_score = ScannedJob.objects.aggregate(avg=Avg('match_score'))
```

### 5. Django Admin
```python
@admin.register(ScannedJob)
class ScannedJobAdmin(admin.ModelAdmin):
    list_display = ['title', 'company', 'match_score', 'user']
    list_filter = ['company', 'scanned_at']
    search_fields = ['title', 'company']
```

## 🔒 Security Features

- **API Key Encryption**: Stored as base64 (use proper encryption in production)
- **Token Authentication**: Simple UUID tokens (use JWT in production)
- **CORS Configuration**: Controlled cross-origin access
- **Input Validation**: Through DRF serializers

## 📊 Why Django?

| Feature | Benefit |
|---------|---------|
| Django Admin | Free admin interface! |
| ORM | Clean database interactions |
| Migrations | Version-controlled schema |
| DRF | Best REST API framework |
| Python | AI/ML ecosystem |

## 🧪 Testing API

```bash
# Register
curl -X POST http://localhost:8000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# Save jobs
curl -X POST http://localhost:8000/api/jobs/scan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"jobs": [{"title": "SWE", "company": "Google"}]}'
```

## 📝 License

MIT
