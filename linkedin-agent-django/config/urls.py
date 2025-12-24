"""
LinkedIn AI Agent - URL Configuration

URL routing for the Django application.
"""

from django.contrib import admin
from django.urls import path, include
from django.http import HttpResponse


def dashboard_view(request):
    """Simple HTML dashboard to view database"""
    html = '''
<!DOCTYPE html>
<html>
<head>
  <title>LinkedIn AI Agent - Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: white; margin-bottom: 20px; }
    .card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    .card h2 { 
      color: #333; 
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #667eea;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { 
      padding: 10px; 
      text-align: left; 
      border-bottom: 1px solid #eee;
      font-size: 13px;
    }
    th { background: #f8f9fa; font-weight: 600; }
    tr:hover { background: #f8f9fa; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 20px;
    }
    .stat-card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    .stat-value { font-size: 32px; font-weight: 700; color: #667eea; }
    .stat-label { color: #888; font-size: 12px; margin-top: 5px; }
    .refresh-btn {
      background: #667eea;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      margin-right: 10px;
    }
    .refresh-btn:hover { background: #5a6fd6; }
    .admin-btn {
      background: #22c55e;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      text-decoration: none;
    }
    .truncate { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
    }
    .badge-score { background: #dcfce7; color: #166534; }
    .empty { color: #888; text-align: center; padding: 40px; }
    .tech-stack {
      background: rgba(255,255,255,0.1);
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
      color: white;
    }
    .tech-stack span {
      display: inline-block;
      background: rgba(255,255,255,0.2);
      padding: 4px 12px;
      border-radius: 20px;
      margin: 4px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🤖 LinkedIn AI Agent - Database Dashboard</h1>
    
    <div class="tech-stack">
      <strong>Tech Stack:</strong>
      <span>🐍 Python</span>
      <span>🎸 Django</span>
      <span>🐘 PostgreSQL/SQLite</span>
      <span>🔗 REST API</span>
      <span>🤖 OpenAI</span>
    </div>
    
    <div class="stats-grid" id="statsGrid">
      <div class="stat-card">
        <div class="stat-value" id="totalUsers">-</div>
        <div class="stat-label">Total Users</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="totalJobs">-</div>
        <div class="stat-label">Jobs Scanned</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="avgScore">-</div>
        <div class="stat-label">Avg Match Score</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="totalLogs">-</div>
        <div class="stat-label">Activity Logs</div>
      </div>
    </div>
    
    <div class="card">
      <h2>👤 Users</h2>
      <table id="usersTable">
        <thead>
          <tr>
            <th>ID</th>
            <th>Email</th>
            <th>Target Role</th>
            <th>Location</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
    
    <div class="card">
      <h2>💼 Scanned Jobs</h2>
      <table id="jobsTable">
        <thead>
          <tr>
            <th>Title</th>
            <th>Company</th>
            <th>Match Score</th>
            <th>Scanned At</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
    
    <div class="card">
      <h2>📋 Activity Logs</h2>
      <table id="logsTable">
        <thead>
          <tr>
            <th>Time</th>
            <th>Action</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
    
    <button class="refresh-btn" onclick="loadData()">🔄 Refresh Data</button>
    <a href="/admin/" class="admin-btn">⚙️ Django Admin</a>
  </div>
  
  <script>
    async function loadData() {
      try {
        const res = await fetch('/api/admin/dashboard');
        const data = await res.json();
        
        // Stats
        document.getElementById('totalUsers').textContent = data.stats.totalUsers;
        document.getElementById('totalJobs').textContent = data.stats.totalJobs;
        document.getElementById('avgScore').textContent = data.stats.avgScore + '%';
        document.getElementById('totalLogs').textContent = data.stats.totalLogs;
        
        // Users table
        const usersBody = document.querySelector('#usersTable tbody');
        usersBody.innerHTML = data.users.length ? data.users.map(u => `
          <tr>
            <td>${u.id.substring(0, 8)}...</td>
            <td>${u.email}</td>
            <td>${u.target_role || '-'}</td>
            <td>${u.location || '-'}</td>
            <td>${new Date(u.created_at).toLocaleString()}</td>
          </tr>
        `).join('') : '<tr><td colspan="5" class="empty">No users yet</td></tr>';
        
        // Jobs table
        const jobsBody = document.querySelector('#jobsTable tbody');
        jobsBody.innerHTML = data.jobs.length ? data.jobs.map(j => `
          <tr>
            <td class="truncate">${j.title || '-'}</td>
            <td>${j.company || '-'}</td>
            <td>${j.match_score ? '<span class="badge badge-score">' + j.match_score + '%</span>' : '-'}</td>
            <td>${new Date(j.scanned_at).toLocaleString()}</td>
          </tr>
        `).join('') : '<tr><td colspan="4" class="empty">No jobs scanned yet</td></tr>';
        
        // Logs table
        const logsBody = document.querySelector('#logsTable tbody');
        logsBody.innerHTML = data.logs.length ? data.logs.map(l => `
          <tr>
            <td>${new Date(l.created_at).toLocaleString()}</td>
            <td>${l.action}</td>
            <td class="truncate">${l.details}</td>
          </tr>
        `).join('') : '<tr><td colspan="3" class="empty">No activity yet</td></tr>';
        
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    }
    
    // Load on page load
    loadData();
    
    // Auto-refresh every 5 seconds
    setInterval(loadData, 5000);
  </script>
</body>
</html>
    '''
    return HttpResponse(html)


urlpatterns = [
    # Dashboard (home page)
    path('', dashboard_view, name='dashboard'),
    
    # Django Admin
    path('admin/', admin.site.urls),
    
    # API endpoints
    path('api/', include('api.urls')),
]
