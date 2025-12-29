"""
API views for LinkedIn Connector.
"""

import logging
from datetime import date

from rest_framework import status, viewsets
from rest_framework.decorators import api_view, action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UserProfile, ConnectionRequest, MessageTemplate, UsageStats
from .serializers import (
    UserProfileSerializer,
    UserProfileCreateSerializer,
    ConnectionRequestSerializer,
    ConnectionRequestCreateSerializer,
    MessageGenerationRequestSerializer,
    BatchMessageGenerationRequestSerializer,
    MessageTemplateSerializer,
    UsageStatsSerializer,
)
from .services import GroqMessageGenerator

logger = logging.getLogger(__name__)


class HealthCheckView(APIView):
    """Simple health check endpoint."""
    
    def get(self, request):
        return Response({
            "status": "healthy",
            "service": "linkedin-connector-api"
        })


class UserProfileViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing user profiles.
    
    Provides CRUD operations for user profiles.
    Users can register their information for personalized message generation.
    """
    
    queryset = UserProfile.objects.all()
    serializer_class = UserProfileSerializer
    
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return UserProfileCreateSerializer
        return UserProfileSerializer
    
    def create(self, request, *args, **kwargs):
        """Create or update user profile based on email."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        email = serializer.validated_data['email']
        
        # Check if profile with this email exists
        existing_profile = UserProfile.objects.filter(email=email).first()
        
        if existing_profile:
            # Update existing profile
            for key, value in serializer.validated_data.items():
                setattr(existing_profile, key, value)
            existing_profile.save()
            
            output_serializer = UserProfileSerializer(existing_profile)
            return Response(output_serializer.data, status=status.HTTP_200_OK)
        
        # Create new profile
        profile = UserProfile.objects.create(**serializer.validated_data)
        output_serializer = UserProfileSerializer(profile)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=False, methods=['get'])
    def by_email(self, request):
        """Get user profile by email."""
        email = request.query_params.get('email', '').lower()
        if not email:
            return Response(
                {"error": "Email parameter is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            profile = UserProfile.objects.get(email=email)
            serializer = UserProfileSerializer(profile)
            return Response(serializer.data)
        except UserProfile.DoesNotExist:
            return Response(
                {"error": "Profile not found"},
                status=status.HTTP_404_NOT_FOUND
            )


class GenerateMessageView(APIView):
    """
    Generate a personalized LinkedIn connection message.
    """
    
    def post(self, request):
        serializer = MessageGenerationRequestSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
        
        data = serializer.validated_data
        
        # Build user info
        user_info = {}
        
        if data.get('user_profile_id'):
            try:
                profile = UserProfile.objects.get(id=data['user_profile_id'])
                user_info = {
                    'name': profile.name,
                    'title': profile.current_title,
                    'company': profile.current_company,
                    'school': profile.school,
                    'email': profile.email,
                    'skills': profile.skills,
                    'connection_purpose': profile.connection_purpose,
                }
            except UserProfile.DoesNotExist:
                return Response(
                    {"error": "User profile not found"},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            user_info = {
                'name': data.get('user_name', ''),
                'title': data.get('user_title', ''),
                'company': data.get('user_company', ''),
                'school': data.get('user_school', ''),
                'major': data.get('user_major', ''),
                'email': data.get('user_email', ''),
                'experience_level': data.get('user_experience_level', ''),
                'skills': data.get('user_skills', ''),
                'connection_purpose': data.get('connection_purpose', ''),
            }
        
        # Build target info
        target_info = {
            'name': data.get('target_name', ''),
            'title': data.get('target_title', ''),
            'company': data.get('target_company', ''),
        }
        
        tone = data.get('tone', 'professional')
        
        # Include settings - what to mention in the message
        include_settings = {
            'title': data.get('include_title', True),
            'company': data.get('include_company', False),
            'school': data.get('include_school', True),
            'major': data.get('include_major', False),
            'email': data.get('include_email', False),
        }
        
        # Generate message
        generator = GroqMessageGenerator()
        message = generator.generate_message(user_info, target_info, tone, include_settings)
        
        # Update usage stats if we have a profile
        if data.get('user_profile_id'):
            self._update_usage_stats(data['user_profile_id'])
        
        return Response({
            "message": message,
            "target": target_info,
            "tone": tone
        })
    
    def _update_usage_stats(self, profile_id):
        """Update usage statistics for the user."""
        try:
            stats, created = UsageStats.objects.get_or_create(
                user_profile_id=profile_id,
                date=date.today()
            )
            stats.messages_generated += 1
            stats.save()
        except Exception as e:
            logger.error(f"Error updating usage stats: {str(e)}")


class BatchGenerateMessagesView(APIView):
    """
    Generate personalized messages for multiple targets at once.
    """
    
    def post(self, request):
        serializer = BatchMessageGenerationRequestSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
        
        data = serializer.validated_data
        
        # Build user info (same logic as single message)
        user_info = {}
        
        if data.get('user_profile_id'):
            try:
                profile = UserProfile.objects.get(id=data['user_profile_id'])
                user_info = {
                    'name': profile.name,
                    'title': profile.current_title,
                    'company': profile.current_company,
                    'school': profile.school,
                    'skills': profile.skills,
                    'connection_purpose': profile.connection_purpose,
                }
            except UserProfile.DoesNotExist:
                return Response(
                    {"error": "User profile not found"},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            user_info = {
                'name': data.get('user_name', ''),
                'title': data.get('user_title', ''),
                'company': data.get('user_company', ''),
                'school': data.get('user_school', ''),
                'skills': data.get('user_skills', ''),
                'connection_purpose': data.get('connection_purpose', ''),
            }
        
        # Format targets
        targets = []
        for target in data['targets']:
            targets.append({
                'name': target.get('name', ''),
                'title': target.get('title', ''),
                'company': target.get('company', ''),
            })
        
        tone = data.get('tone', 'professional')
        
        # Generate batch messages
        generator = GroqMessageGenerator()
        results = generator.generate_batch_messages(user_info, targets, tone)
        
        # Update usage stats
        if data.get('user_profile_id'):
            self._update_usage_stats(data['user_profile_id'], len(targets))
        
        return Response({
            "results": results,
            "total": len(results),
            "successful": sum(1 for r in results if r.get('success', False))
        })
    
    def _update_usage_stats(self, profile_id, count):
        """Update usage statistics for the user."""
        try:
            stats, created = UsageStats.objects.get_or_create(
                user_profile_id=profile_id,
                date=date.today()
            )
            stats.messages_generated += count
            stats.save()
        except Exception as e:
            logger.error(f"Error updating usage stats: {str(e)}")


class ConnectionRequestViewSet(viewsets.ModelViewSet):
    """
    ViewSet for tracking connection requests.
    """
    
    queryset = ConnectionRequest.objects.all()
    serializer_class = ConnectionRequestSerializer
    
    def get_queryset(self):
        """Filter by user profile if provided."""
        queryset = super().get_queryset()
        profile_id = self.request.query_params.get('profile_id')
        if profile_id:
            queryset = queryset.filter(user_profile_id=profile_id)
        return queryset
    
    @action(detail=False, methods=['post'])
    def bulk_create(self, request):
        """Create multiple connection request records at once."""
        profile_id = request.data.get('profile_id')
        requests = request.data.get('requests', [])
        
        if not profile_id:
            return Response(
                {"error": "profile_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            profile = UserProfile.objects.get(id=profile_id)
        except UserProfile.DoesNotExist:
            return Response(
                {"error": "User profile not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        created_records = []
        for req in requests:
            serializer = ConnectionRequestCreateSerializer(data=req)
            if serializer.is_valid():
                connection_request = ConnectionRequest.objects.create(
                    user_profile=profile,
                    **serializer.validated_data
                )
                created_records.append(ConnectionRequestSerializer(connection_request).data)
        
        # Update usage stats
        stats, _ = UsageStats.objects.get_or_create(
            user_profile=profile,
            date=date.today()
        )
        stats.connections_sent += len(created_records)
        stats.save()
        
        return Response({
            "created": len(created_records),
            "records": created_records
        }, status=status.HTTP_201_CREATED)


class MessageTemplateViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for message templates (read-only for now).
    """
    
    queryset = MessageTemplate.objects.filter(is_active=True)
    serializer_class = MessageTemplateSerializer


class UsageStatsView(APIView):
    """
    Get usage statistics for a user profile.
    """
    
    def get(self, request, profile_id):
        try:
            profile = UserProfile.objects.get(id=profile_id)
        except UserProfile.DoesNotExist:
            return Response(
                {"error": "User profile not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        stats = UsageStats.objects.filter(user_profile=profile).order_by('-date')[:30]
        serializer = UsageStatsSerializer(stats, many=True)
        
        # Calculate totals
        total_messages = sum(s.messages_generated for s in stats)
        total_connections = sum(s.connections_sent for s in stats)
        
        return Response({
            "profile_id": str(profile_id),
            "daily_stats": serializer.data,
            "totals": {
                "messages_generated": total_messages,
                "connections_sent": total_connections
            }
        })
