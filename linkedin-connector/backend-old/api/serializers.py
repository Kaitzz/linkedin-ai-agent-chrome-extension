"""
Serializers for LinkedIn Connector API.
"""

from rest_framework import serializers
from .models import UserProfile, ConnectionRequest, MessageTemplate, UsageStats


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer for UserProfile model."""
    
    class Meta:
        model = UserProfile
        fields = [
            'id', 'name', 'email', 
            'current_title', 'current_company',
            'target_role', 'target_industry',
            'school', 'major', 'graduation_year',
            'skills', 'bio', 'connection_purpose',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class UserProfileCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating UserProfile."""
    
    class Meta:
        model = UserProfile
        fields = [
            'name', 'email', 
            'current_title', 'current_company',
            'target_role', 'target_industry',
            'school', 'major', 'graduation_year',
            'skills', 'bio', 'connection_purpose'
        ]
    
    def validate_email(self, value):
        """Normalize email to lowercase."""
        return value.lower()


class ConnectionRequestSerializer(serializers.ModelSerializer):
    """Serializer for ConnectionRequest model."""
    
    class Meta:
        model = ConnectionRequest
        fields = [
            'id', 'user_profile', 'target_name', 'target_title',
            'target_company', 'target_linkedin_url', 'message_sent',
            'status', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class ConnectionRequestCreateSerializer(serializers.Serializer):
    """Serializer for creating connection request records."""
    
    target_name = serializers.CharField(max_length=255)
    target_title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    target_company = serializers.CharField(max_length=255, required=False, allow_blank=True)
    target_linkedin_url = serializers.URLField(required=False, allow_blank=True)
    message_sent = serializers.CharField()
    status = serializers.ChoiceField(
        choices=['pending', 'sent', 'accepted', 'failed'],
        default='sent'
    )


class MessageGenerationRequestSerializer(serializers.Serializer):
    """Serializer for message generation requests."""
    
    # User profile ID (if already registered)
    user_profile_id = serializers.UUIDField(required=False)
    
    # Or inline user info for quick use
    user_name = serializers.CharField(max_length=255, required=False)
    user_title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    user_company = serializers.CharField(max_length=255, required=False, allow_blank=True)
    user_school = serializers.CharField(max_length=255, required=False, allow_blank=True)
    user_skills = serializers.CharField(required=False, allow_blank=True)
    connection_purpose = serializers.CharField(required=False, allow_blank=True)
    
    # Target person info
    target_name = serializers.CharField(max_length=255)
    target_title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    target_company = serializers.CharField(max_length=255, required=False, allow_blank=True)
    
    # Optional: specific tone or style
    tone = serializers.ChoiceField(
        choices=['professional', 'friendly', 'casual'],
        default='professional',
        required=False
    )
    
    def validate(self, data):
        """Ensure we have either a profile ID or inline user info."""
        if not data.get('user_profile_id') and not data.get('user_name'):
            raise serializers.ValidationError(
                "Either 'user_profile_id' or 'user_name' must be provided."
            )
        return data


class BatchMessageGenerationRequestSerializer(serializers.Serializer):
    """Serializer for batch message generation."""
    
    # User info (from profile or inline)
    user_profile_id = serializers.UUIDField(required=False)
    user_name = serializers.CharField(max_length=255, required=False)
    user_title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    user_company = serializers.CharField(max_length=255, required=False, allow_blank=True)
    user_school = serializers.CharField(max_length=255, required=False, allow_blank=True)
    user_skills = serializers.CharField(required=False, allow_blank=True)
    connection_purpose = serializers.CharField(required=False, allow_blank=True)
    
    # List of targets
    targets = serializers.ListField(
        child=serializers.DictField(),
        min_length=1,
        max_length=50  # Limit batch size
    )
    
    tone = serializers.ChoiceField(
        choices=['professional', 'friendly', 'casual'],
        default='professional',
        required=False
    )
    
    def validate_targets(self, value):
        """Validate each target has at least a name."""
        for i, target in enumerate(value):
            if 'name' not in target or not target['name']:
                raise serializers.ValidationError(
                    f"Target at index {i} must have a 'name' field."
                )
        return value


class MessageTemplateSerializer(serializers.ModelSerializer):
    """Serializer for MessageTemplate model."""
    
    class Meta:
        model = MessageTemplate
        fields = ['id', 'name', 'category', 'template', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class UsageStatsSerializer(serializers.ModelSerializer):
    """Serializer for UsageStats model."""
    
    class Meta:
        model = UsageStats
        fields = ['id', 'user_profile', 'date', 'messages_generated', 'connections_sent']
        read_only_fields = ['id']
