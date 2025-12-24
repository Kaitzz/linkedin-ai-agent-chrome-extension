"""
LinkedIn AI Agent - API Views

RESTful API endpoints for:
- User authentication (register/login)
- Profile management
- Job tracking with deduplication
- Status updates
- Statistics
"""

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.db.models import Avg, Count
from django.utils import timezone
from datetime import timedelta
import uuid

from .models import User, JobPost, ConnectionRequest, ActivityLog, Education, WorkExperience
from .serializers import (
    UserSerializer, UserSettingsSerializer, UserProfileSerializer,
    JobPostSerializer, JobPostCreateSerializer, JobStatusUpdateSerializer,
    ConnectionRequestSerializer, ConnectionRequestCreateSerializer,
    ActivityLogSerializer, UserStatsSerializer, AIAnalyzeSerializer,
    RegisterSerializer, LoginSerializer,
    EducationSerializer, WorkExperienceSerializer
)


# ============================================
# AUTHENTICATION VIEWS
# ============================================

class RegisterView(APIView):
    """
    POST /api/auth/register/
    Register a new user (email only for simplicity)
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            
            # Log activity
            ActivityLog.objects.create(
                user=user,
                action='user_registered',
                details={'email': user.email}
            )
            
            return Response({
                'success': True,
                'token': str(user.id),  # Token is user's UUID
                'user': UserSerializer(user).data,
                'message': 'User registered successfully'
            }, status=status.HTTP_201_CREATED)
        
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    """
    POST /api/auth/login/
    Simple email-based login (for demo - no password)
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']
            
            try:
                user = User.objects.get(email=email)
                
                # Log activity
                ActivityLog.objects.create(
                    user=user,
                    action='user_login',
                    details={'ip': request.META.get('REMOTE_ADDR')}
                )
                
                return Response({
                    'success': True,
                    'token': str(user.id),  # Token is user's UUID
                    'user': UserSerializer(user).data
                })
            except User.DoesNotExist:
                return Response({
                    'success': False,
                    'error': 'User not found'
                }, status=status.HTTP_404_NOT_FOUND)
        
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)


# ============================================
# USER PROFILE VIEWS
# ============================================

class UserProfileView(APIView):
    """
    GET /api/user/profile/ - Get user profile
    PUT /api/user/profile/ - Update user profile
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)
    
    def put(self, request):
        serializer = UserProfileSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            
            # Log activity
            ActivityLog.objects.create(
                user=request.user,
                action='profile_updated',
                details={'fields': list(request.data.keys())}
            )
            
            return Response({
                'success': True,
                'user': UserSerializer(request.user).data
            })
        
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)


class UserSettingsView(APIView):
    """
    GET /api/user/settings/ - Get user settings
    PUT /api/user/settings/ - Update user settings
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        return Response({
            'target_role': request.user.target_role,
            'location': request.user.location,
            'has_api_key': bool(request.user.api_key_encrypted)
        })
    
    def put(self, request):
        serializer = UserSettingsSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({
                'success': True,
                'message': 'Settings updated'
            })
        
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)


# ============================================
# EDUCATION & WORK EXPERIENCE VIEWS
# ============================================

class EducationView(APIView):
    """
    GET /api/user/education/ - Get all education entries
    POST /api/user/education/ - Add education entry
    PUT /api/user/education/<id>/ - Update education entry
    DELETE /api/user/education/<id>/ - Delete education entry
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        education = request.user.education.all()
        serializer = EducationSerializer(education, many=True)
        return Response(serializer.data)
    
    def post(self, request):
        # Check limit
        if request.user.education.count() >= 3:
            return Response({
                'success': False,
                'error': 'Maximum 3 education entries allowed'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = EducationSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(user=request.user)
            return Response({
                'success': True,
                'education': serializer.data
            }, status=status.HTTP_201_CREATED)
        
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)


class EducationDetailView(APIView):
    """Handle individual education entry"""
    permission_classes = [IsAuthenticated]
    
    def put(self, request, pk):
        try:
            education = Education.objects.get(pk=pk, user=request.user)
        except Education.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = EducationSerializer(education, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({'success': True, 'education': serializer.data})
        return Response({'success': False, 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
    
    def delete(self, request, pk):
        try:
            education = Education.objects.get(pk=pk, user=request.user)
            education.delete()
            return Response({'success': True})
        except Education.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)


class WorkExperienceView(APIView):
    """
    GET /api/user/experience/ - Get all work experience entries
    POST /api/user/experience/ - Add work experience entry
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        experience = request.user.work_experience.all()
        serializer = WorkExperienceSerializer(experience, many=True)
        return Response(serializer.data)
    
    def post(self, request):
        # Check limit
        if request.user.work_experience.count() >= 4:
            return Response({
                'success': False,
                'error': 'Maximum 4 work experience entries allowed'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = WorkExperienceSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(user=request.user)
            return Response({
                'success': True,
                'experience': serializer.data
            }, status=status.HTTP_201_CREATED)
        
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)


class WorkExperienceDetailView(APIView):
    """Handle individual work experience entry"""
    permission_classes = [IsAuthenticated]
    
    def put(self, request, pk):
        try:
            experience = WorkExperience.objects.get(pk=pk, user=request.user)
        except WorkExperience.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = WorkExperienceSerializer(experience, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({'success': True, 'experience': serializer.data})
        return Response({'success': False, 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
    
    def delete(self, request, pk):
        try:
            experience = WorkExperience.objects.get(pk=pk, user=request.user)
            experience.delete()
            return Response({'success': True})
        except WorkExperience.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)


# ============================================
# JOB POST VIEWS
# ============================================

class JobPostListView(APIView):
    """
    GET /api/jobs/ - List all saved jobs
    POST /api/jobs/ - Save new jobs (with deduplication)
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # Filter parameters
        status_filter = request.query_params.get('status')
        company = request.query_params.get('company')
        
        jobs = request.user.job_posts.all()
        
        if status_filter:
            jobs = jobs.filter(status=status_filter)
        if company:
            jobs = jobs.filter(company__icontains=company)
        
        serializer = JobPostSerializer(jobs, many=True)
        return Response({
            'count': jobs.count(),
            'jobs': serializer.data
        })
    
    def post(self, request):
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"Received job save request: {request.data}")
        
        serializer = JobPostCreateSerializer(
            data=request.data,
            context={'request': request}
        )
        
        if serializer.is_valid():
            try:
                results = serializer.save()
                
                # Log activity for created jobs
                for job_data in results['created']:
                    ActivityLog.objects.create(
                        user=request.user,
                        action='job_saved',
                        details={
                            'title': job_data.get('title'),
                            'company': job_data.get('company')
                        }
                    )
                
                logger.info(f"Job save results: created={len(results['created'])}, updated={len(results['updated'])}, skipped={len(results['skipped'])}")
                
                return Response({
                    'success': True,
                    'created': results['created'],
                    'updated': results['updated'],
                    'skipped': results['skipped']
                }, status=status.HTTP_201_CREATED)
            except Exception as e:
                logger.error(f"Error saving jobs: {e}", exc_info=True)
                return Response({
                    'success': False,
                    'error': str(e)
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        logger.error(f"Serializer validation failed: {serializer.errors}")
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)


class JobPostDetailView(APIView):
    """
    GET /api/jobs/<id>/ - Get job details
    PUT /api/jobs/<id>/ - Update job
    DELETE /api/jobs/<id>/ - Delete job
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request, pk):
        try:
            job = JobPost.objects.get(pk=pk, user=request.user)
            serializer = JobPostSerializer(job)
            return Response(serializer.data)
        except JobPost.DoesNotExist:
            return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def put(self, request, pk):
        try:
            job = JobPost.objects.get(pk=pk, user=request.user)
        except JobPost.DoesNotExist:
            return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = JobPostSerializer(job, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({'success': True, 'job': serializer.data})
        return Response({'success': False, 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
    
    def delete(self, request, pk):
        try:
            job = JobPost.objects.get(pk=pk, user=request.user)
            job.delete()
            return Response({'success': True})
        except JobPost.DoesNotExist:
            return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)


class JobStatusUpdateView(APIView):
    """
    PUT /api/jobs/status/ - Update job application status
    """
    permission_classes = [IsAuthenticated]
    
    def put(self, request):
        serializer = JobStatusUpdateSerializer(data=request.data)
        
        if serializer.is_valid():
            job = serializer.update_status(request.user)
            
            if job:
                # Log activity
                ActivityLog.objects.create(
                    user=request.user,
                    action='status_changed',
                    job=job,
                    details={
                        'new_status': job.status,
                        'title': job.title,
                        'company': job.company
                    }
                )
                
                return Response({
                    'success': True,
                    'job': JobPostSerializer(job).data
                })
            else:
                return Response({
                    'success': False,
                    'error': 'Job not found'
                }, status=status.HTTP_404_NOT_FOUND)
        
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)


class JobByUrlView(APIView):
    """
    GET /api/jobs/by-url/?url=... - Get job by LinkedIn URL
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        url = request.query_params.get('url', '')
        
        if not url:
            return Response({'error': 'URL parameter required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Normalize URL
        normalized_url = url.split('?')[0]
        
        job = JobPost.objects.filter(
            user=request.user,
            linkedin_url__startswith=normalized_url
        ).first()
        
        if job:
            return Response({
                'found': True,
                'job': JobPostSerializer(job).data
            })
        else:
            return Response({
                'found': False,
                'job': None
            })


# ============================================
# CONNECTION REQUEST VIEWS
# ============================================

class ConnectionRequestListView(APIView):
    """
    GET /api/connections/ - List all connection requests
    POST /api/connections/ - Create new connection request
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        connections = request.user.connection_requests.all()
        serializer = ConnectionRequestSerializer(connections, many=True)
        return Response({
            'count': connections.count(),
            'connections': serializer.data
        })
    
    def post(self, request):
        serializer = ConnectionRequestCreateSerializer(
            data=request.data,
            context={'request': request}
        )
        
        if serializer.is_valid():
            connection = serializer.save()
            
            # Log activity
            ActivityLog.objects.create(
                user=request.user,
                action='message_sent',
                job=connection.job,
                details={
                    'recipient': connection.recipient_name,
                    'type': connection.message_type
                }
            )
            
            return Response({
                'success': True,
                'connection': ConnectionRequestSerializer(connection).data
            }, status=status.HTTP_201_CREATED)
        
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)


class ConnectionRequestDetailView(APIView):
    """Update connection request status"""
    permission_classes = [IsAuthenticated]
    
    def put(self, request, pk):
        try:
            connection = ConnectionRequest.objects.get(pk=pk, user=request.user)
        except ConnectionRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Update status
        new_status = request.data.get('status')
        if new_status:
            connection.status = new_status
            if new_status == 'sent' and not connection.sent_at:
                connection.sent_at = timezone.now()
            connection.save()
        
        return Response({
            'success': True,
            'connection': ConnectionRequestSerializer(connection).data
        })


# ============================================
# STATISTICS VIEW
# ============================================

class UserStatsView(APIView):
    """
    GET /api/stats/ - Get user statistics
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        user = request.user
        jobs = user.job_posts.all()
        
        # Jobs by status
        jobs_by_status = {}
        for status_choice in JobPost.STATUS_CHOICES:
            status_code = status_choice[0]
            jobs_by_status[status_code] = jobs.filter(status=status_code).count()
        
        # Average match score
        avg_score = jobs.filter(match_score__isnull=False).aggregate(
            avg=Avg('match_score')
        )['avg']
        
        # Top companies
        top_companies = jobs.values('company').annotate(
            count=Count('id')
        ).order_by('-count')[:5]
        
        # Recent activity
        recent_logs = ActivityLog.objects.filter(user=user).order_by('-created_at')[:10]
        
        stats = {
            'total_jobs': jobs.count(),
            'jobs_by_status': jobs_by_status,
            'jobs_applied': jobs_by_status.get('applied', 0),
            'jobs_interviewing': jobs_by_status.get('interviewing', 0),
            'average_match_score': round(avg_score, 1) if avg_score else None,
            'top_companies': [
                {'company': c['company'], 'count': c['count']} 
                for c in top_companies if c['company']
            ],
            'recent_activity': ActivityLogSerializer(recent_logs, many=True).data
        }
        
        return Response(stats)


# ============================================
# AI ANALYSIS VIEW
# ============================================

class AIAnalyzeView(APIView):
    """
    POST /api/ai/analyze/ - Analyze job with AI
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        serializer = AIAnalyzeSerializer(data=request.data)
        
        if serializer.is_valid():
            job_data = serializer.validated_data['job']
            user_profile = serializer.validated_data.get('user_profile', {})
            
            # Get user's API key
            api_key = None
            if request.user.api_key_encrypted:
                import base64
                try:
                    api_key = base64.b64decode(request.user.api_key_encrypted).decode()
                except:
                    pass
            
            if not api_key:
                return Response({
                    'success': False,
                    'error': 'No API key configured'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Build analysis prompt
            target_role = request.user.target_role or user_profile.get('targetRole', '')
            
            prompt = f"""Analyze this job posting for fit with the candidate:

JOB:
Title: {job_data.get('title', 'Unknown')}
Company: {job_data.get('company', 'Unknown')}
Location: {job_data.get('location', 'Unknown')}
Description: {job_data.get('description', job_data.get('content', 'No description'))}

CANDIDATE:
Target Role: {target_role}
Location: {request.user.location or user_profile.get('location', '')}

Please provide:
1. Match Score (0-100)
2. Key matching qualifications
3. Potential gaps
4. Recommendation (Apply/Skip/Maybe)
5. Suggested talking points for cover letter

Respond in JSON format:
{{"matchScore": number, "matching": [...], "gaps": [...], "recommendation": "...", "talkingPoints": [...]}}"""

            try:
                import openai
                client = openai.OpenAI(api_key=api_key)
                
                response = client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=1000,
                    temperature=0.7
                )
                
                analysis_text = response.choices[0].message.content
                
                # Try to parse JSON
                import json
                try:
                    # Find JSON in response
                    start = analysis_text.find('{')
                    end = analysis_text.rfind('}') + 1
                    if start != -1 and end > start:
                        analysis = json.loads(analysis_text[start:end])
                    else:
                        analysis = {'raw': analysis_text}
                except json.JSONDecodeError:
                    analysis = {'raw': analysis_text}
                
                # Log activity
                ActivityLog.objects.create(
                    user=request.user,
                    action='ai_analysis',
                    details={
                        'title': job_data.get('title'),
                        'company': job_data.get('company'),
                        'match_score': analysis.get('matchScore')
                    }
                )
                
                return Response({
                    'success': True,
                    'analysis': analysis
                })
                
            except Exception as e:
                return Response({
                    'success': False,
                    'error': str(e)
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)


# ============================================
# ACTIVITY LOG VIEW
# ============================================

class ActivityLogView(APIView):
    """
    GET /api/activity/ - Get activity log
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        limit = int(request.query_params.get('limit', 50))
        logs = request.user.activity_logs.all()[:limit]
        serializer = ActivityLogSerializer(logs, many=True)
        return Response({
            'count': logs.count(),
            'activities': serializer.data
        })
