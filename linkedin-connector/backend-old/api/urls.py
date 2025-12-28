"""
URL configuration for the API app.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    HealthCheckView,
    UserProfileViewSet,
    GenerateMessageView,
    BatchGenerateMessagesView,
    ConnectionRequestViewSet,
    MessageTemplateViewSet,
    UsageStatsView,
)

# Create a router for ViewSets
router = DefaultRouter()
router.register(r'profiles', UserProfileViewSet, basename='profile')
router.register(r'connections', ConnectionRequestViewSet, basename='connection')
router.register(r'templates', MessageTemplateViewSet, basename='template')

urlpatterns = [
    # Health check
    path('health/', HealthCheckView.as_view(), name='health-check'),
    
    # Message generation
    path('generate-message/', GenerateMessageView.as_view(), name='generate-message'),
    path('generate-messages/batch/', BatchGenerateMessagesView.as_view(), name='batch-generate-messages'),
    
    # Usage stats
    path('stats/<uuid:profile_id>/', UsageStatsView.as_view(), name='usage-stats'),
    
    # Router URLs
    path('', include(router.urls)),
]
