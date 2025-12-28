"""
Django admin configuration for LinkedIn Connector.
"""

from django.contrib import admin
from .models import UserProfile, ConnectionRequest, MessageTemplate, UsageStats


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['name', 'email', 'current_title', 'current_company', 'created_at']
    list_filter = ['created_at', 'target_industry']
    search_fields = ['name', 'email', 'current_company', 'school']
    readonly_fields = ['id', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Info', {
            'fields': ('id', 'name', 'email')
        }),
        ('Professional Info', {
            'fields': ('current_title', 'current_company', 'target_role', 'target_industry')
        }),
        ('Education', {
            'fields': ('school', 'major', 'graduation_year')
        }),
        ('Additional Info', {
            'fields': ('skills', 'bio', 'connection_purpose')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(ConnectionRequest)
class ConnectionRequestAdmin(admin.ModelAdmin):
    list_display = ['user_profile', 'target_name', 'target_company', 'status', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['target_name', 'target_company', 'user_profile__name']
    readonly_fields = ['id', 'created_at']
    raw_id_fields = ['user_profile']


@admin.register(MessageTemplate)
class MessageTemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'is_active', 'created_at']
    list_filter = ['category', 'is_active']
    search_fields = ['name', 'template']
    readonly_fields = ['id', 'created_at']


@admin.register(UsageStats)
class UsageStatsAdmin(admin.ModelAdmin):
    list_display = ['user_profile', 'date', 'messages_generated', 'connections_sent']
    list_filter = ['date']
    search_fields = ['user_profile__name', 'user_profile__email']
    readonly_fields = ['id']
    raw_id_fields = ['user_profile']
