"""
LinkedIn AI Agent - API URL Configuration

Maps URL paths to views.
"""

from django.urls import path
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from . import views

# Health check endpoint (no auth required)
@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    return Response({'status': 'ok', 'service': 'linkedin-ai-agent'})

urlpatterns = [
    # Health check
    path('health/', health_check, name='health'),
    
    # Authentication
    path('auth/register/', views.RegisterView.as_view(), name='register'),
    path('auth/login/', views.LoginView.as_view(), name='login'),
    
    # User profile & settings
    path('user/profile/', views.UserProfileView.as_view(), name='profile'),
    path('user/settings/', views.UserSettingsView.as_view(), name='settings'),
    
    # Education
    path('user/education/', views.EducationView.as_view(), name='education'),
    path('user/education/<uuid:pk>/', views.EducationDetailView.as_view(), name='education_detail'),
    
    # Work Experience
    path('user/experience/', views.WorkExperienceView.as_view(), name='experience'),
    path('user/experience/<uuid:pk>/', views.WorkExperienceDetailView.as_view(), name='experience_detail'),
    
    # Jobs
    path('jobs/', views.JobPostListView.as_view(), name='jobs'),
    path('jobs/<uuid:pk>/', views.JobPostDetailView.as_view(), name='job_detail'),
    path('jobs/status/', views.JobStatusUpdateView.as_view(), name='job_status'),
    path('jobs/by-url/', views.JobByUrlView.as_view(), name='job_by_url'),
    
    # Connection Requests
    path('connections/', views.ConnectionRequestListView.as_view(), name='connections'),
    path('connections/<uuid:pk>/', views.ConnectionRequestDetailView.as_view(), name='connection_detail'),
    
    # AI
    path('ai/analyze/', views.AIAnalyzeView.as_view(), name='ai_analyze'),
    
    # Statistics
    path('stats/', views.UserStatsView.as_view(), name='stats'),
    
    # Activity Log
    path('activity/', views.ActivityLogView.as_view(), name='activity'),
]
