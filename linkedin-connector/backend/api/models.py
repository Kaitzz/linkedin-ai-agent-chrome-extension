"""
Database models for LinkedIn Connector API.
"""

from django.db import models
import uuid


class UserProfile(models.Model):
    """
    Stores user profile information for generating personalized connection messages.
    This is not authentication - just profile data for message generation.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Basic info
    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    
    # Professional info for personalized messages
    current_title = models.CharField(max_length=255, blank=True)
    current_company = models.CharField(max_length=255, blank=True)
    target_role = models.CharField(max_length=255, blank=True)
    target_industry = models.CharField(max_length=255, blank=True)
    
    # Education
    school = models.CharField(max_length=255, blank=True)
    major = models.CharField(max_length=255, blank=True)
    graduation_year = models.CharField(max_length=10, blank=True)
    
    # Additional context for AI message generation
    skills = models.TextField(blank=True, help_text="Comma-separated list of skills")
    bio = models.TextField(blank=True, help_text="Short bio or introduction")
    connection_purpose = models.TextField(
        blank=True, 
        help_text="Why user wants to connect (e.g., job seeking, networking, recruiting)"
    )
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'User Profile'
        verbose_name_plural = 'User Profiles'
    
    def __str__(self):
        return f"{self.name} ({self.email})"


class ConnectionRequest(models.Model):
    """
    Tracks connection requests sent through the extension.
    Useful for analytics and preventing duplicate requests.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Link to user profile
    user_profile = models.ForeignKey(
        UserProfile, 
        on_delete=models.CASCADE, 
        related_name='connection_requests'
    )
    
    # Target person info (from LinkedIn)
    target_name = models.CharField(max_length=255)
    target_title = models.CharField(max_length=255, blank=True)
    target_company = models.CharField(max_length=255, blank=True)
    target_linkedin_url = models.URLField(blank=True)
    
    # Message sent
    message_sent = models.TextField()
    
    # Status tracking
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('sent', 'Sent'),
        ('accepted', 'Accepted'),
        ('failed', 'Failed'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Connection Request'
        verbose_name_plural = 'Connection Requests'
    
    def __str__(self):
        return f"{self.user_profile.name} -> {self.target_name}"


class MessageTemplate(models.Model):
    """
    Pre-defined message templates that can be customized by AI.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100)  # e.g., 'job_seeking', 'networking', 'recruiting'
    template = models.TextField(
        help_text="Template with placeholders like {user_name}, {target_name}, etc."
    )
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['category', 'name']
        verbose_name = 'Message Template'
        verbose_name_plural = 'Message Templates'
    
    def __str__(self):
        return f"{self.category}: {self.name}"


class UsageStats(models.Model):
    """
    Track API usage for analytics and potential rate limiting.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    user_profile = models.ForeignKey(
        UserProfile, 
        on_delete=models.CASCADE, 
        related_name='usage_stats'
    )
    
    # Daily usage tracking
    date = models.DateField()
    messages_generated = models.IntegerField(default=0)
    connections_sent = models.IntegerField(default=0)
    
    class Meta:
        unique_together = ['user_profile', 'date']
        ordering = ['-date']
        verbose_name = 'Usage Stats'
        verbose_name_plural = 'Usage Stats'
    
    def __str__(self):
        return f"{self.user_profile.name} - {self.date}"
