"""
LinkedIn AI Agent - Django Admin Configuration

Django Admin provides a free, auto-generated admin interface.
We customize it to show our models nicely.
"""

from django.contrib import admin
from django.utils.html import format_html
from .models import User, JobPost, ConnectionRequest, ActivityLog, Education, WorkExperience


class EducationInline(admin.TabularInline):
    """Inline education display for User admin"""
    model = Education
    extra = 0
    max_num = 3


class WorkExperienceInline(admin.TabularInline):
    """Inline work experience display for User admin"""
    model = WorkExperience
    extra = 0
    max_num = 4


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    """Custom admin for User model"""
    
    list_display = ['email', 'full_name', 'target_role', 'location', 'work_authorization', 'created_at', 'is_active']
    list_filter = ['is_active', 'is_staff', 'work_authorization', 'created_at']
    search_fields = ['email', 'first_name', 'last_name', 'target_role']
    ordering = ['-created_at']
    
    inlines = [EducationInline, WorkExperienceInline]
    
    fieldsets = (
        (None, {'fields': ('email',)}),
        ('Personal Info', {'fields': ('first_name', 'last_name', 'phone', 'city')}),
        ('Job Search', {'fields': ('target_role', 'location', 'work_authorization')}),
        ('Links', {'fields': ('linkedin_url', 'github_url', 'portfolio_url', 'resume_url')}),
        ('API', {'fields': ('api_key_encrypted',)}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser')}),
        ('Timestamps', {'fields': ('created_at', 'updated_at')}),
    )
    
    readonly_fields = ['created_at', 'updated_at']
    
    def full_name(self, obj):
        return obj.full_name or '-'
    full_name.short_description = 'Name'


@admin.register(JobPost)
class JobPostAdmin(admin.ModelAdmin):
    """Admin for JobPost model"""
    
    list_display = ['title', 'company', 'status_badge', 'match_score_display', 'has_easy_apply', 'user', 'scanned_at']
    list_filter = ['status', 'has_easy_apply', 'company', 'scanned_at']
    search_fields = ['title', 'company', 'description', 'linkedin_url']
    ordering = ['-updated_at']
    
    fieldsets = (
        ('Job Info', {'fields': ('title', 'company', 'location', 'linkedin_job_id')}),
        ('URLs', {'fields': ('linkedin_url', 'external_apply_url', 'has_easy_apply')}),
        ('Application', {'fields': ('status', 'apply_method', 'applied_at')}),
        ('Hiring Team', {'fields': ('hiring_contacts',)}),
        ('AI Analysis', {'fields': ('match_score', 'ai_analysis')}),
        ('Notes', {'fields': ('notes',)}),
        ('Description', {'fields': ('description',), 'classes': ('collapse',)}),
        ('Meta', {'fields': ('user', 'scanned_at', 'updated_at')}),
    )
    
    readonly_fields = ['scanned_at', 'updated_at']
    
    def status_badge(self, obj):
        colors = {
            'new': '#6b7280',
            'not_interested': '#9ca3af',
            'apply_later': '#f59e0b',
            'applied': '#3b82f6',
            'interviewing': '#8b5cf6',
            'offer': '#22c55e',
            'rejected': '#ef4444',
        }
        color = colors.get(obj.status, '#6b7280')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">{}</span>',
            color, obj.get_status_display()
        )
    status_badge.short_description = 'Status'
    
    def match_score_display(self, obj):
        if obj.match_score is None:
            return '-'
        if obj.match_score >= 70:
            color = '#22c55e'
        elif obj.match_score >= 40:
            color = '#f59e0b'
        else:
            color = '#ef4444'
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color, f'{obj.match_score}%'
        )
    match_score_display.short_description = 'Score'


@admin.register(Education)
class EducationAdmin(admin.ModelAdmin):
    """Admin for Education model"""
    
    list_display = ['school', 'degree', 'major', 'user', 'is_graduated', 'end_date']
    list_filter = ['degree', 'is_graduated']
    search_fields = ['school', 'major', 'user__email']
    ordering = ['user', 'order']


@admin.register(WorkExperience)
class WorkExperienceAdmin(admin.ModelAdmin):
    """Admin for WorkExperience model"""
    
    list_display = ['title', 'company', 'location', 'user', 'is_current', 'start_date', 'end_date']
    list_filter = ['is_current', 'company']
    search_fields = ['title', 'company', 'user__email']
    ordering = ['user', 'order']


@admin.register(ConnectionRequest)
class ConnectionRequestAdmin(admin.ModelAdmin):
    """Admin for ConnectionRequest model"""
    
    list_display = ['recipient_name', 'recipient_title', 'message_type', 'status', 'user', 'created_at', 'sent_at']
    list_filter = ['status', 'message_type', 'created_at']
    search_fields = ['recipient_name', 'message', 'user__email']
    ordering = ['-created_at']
    
    readonly_fields = ['created_at']


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    """Admin for ActivityLog model"""
    
    list_display = ['action', 'user', 'job_info', 'created_at', 'details_preview']
    list_filter = ['action', 'created_at']
    search_fields = ['action', 'user__email']
    ordering = ['-created_at']
    
    def job_info(self, obj):
        if obj.job:
            return f'{obj.job.title[:30]}...' if len(obj.job.title) > 30 else obj.job.title
        return '-'
    job_info.short_description = 'Job'
    
    def details_preview(self, obj):
        if obj.details:
            preview = str(obj.details)[:50]
            return preview + '...' if len(str(obj.details)) > 50 else preview
        return '-'
    details_preview.short_description = 'Details'
    
    readonly_fields = ['created_at']


# Customize admin site header
admin.site.site_header = '🤖 LinkedIn AI Agent Admin'
admin.site.site_title = 'LinkedIn AI Agent'
admin.site.index_title = 'Database Management'
