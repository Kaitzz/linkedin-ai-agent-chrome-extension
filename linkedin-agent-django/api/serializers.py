"""
LinkedIn AI Agent - API Serializers

Serializers convert Django models to JSON and vice versa.
They also handle validation.
"""

from rest_framework import serializers
from django.utils import timezone
from .models import (
    User, JobPost, ConnectionRequest, ActivityLog,
    Education, WorkExperience
)


class EducationSerializer(serializers.ModelSerializer):
    """Serializer for Education model"""
    
    class Meta:
        model = Education
        fields = [
            'id', 'school', 'degree', 'major',
            'start_date', 'end_date', 'is_graduated', 'order'
        ]
        read_only_fields = ['id']


class WorkExperienceSerializer(serializers.ModelSerializer):
    """Serializer for WorkExperience model"""
    
    class Meta:
        model = WorkExperience
        fields = [
            'id', 'company', 'location', 'title', 'description',
            'start_date', 'end_date', 'is_current', 'order'
        ]
        read_only_fields = ['id']


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model with nested education and work experience"""
    education = EducationSerializer(many=True, read_only=True)
    work_experience = WorkExperienceSerializer(many=True, read_only=True)
    
    class Meta:
        model = User
        fields = [
            'id', 'email', 'target_role', 'location', 
            'first_name', 'last_name', 'phone', 'city',
            'linkedin_url', 'github_url', 'portfolio_url', 'resume_url',
            'work_authorization',
            'education', 'work_experience',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class UserSettingsSerializer(serializers.ModelSerializer):
    """Serializer for updating user settings"""
    api_key = serializers.CharField(write_only=True, required=False, allow_blank=True)
    
    class Meta:
        model = User
        fields = ['target_role', 'location', 'api_key']
    
    def update(self, instance, validated_data):
        # Handle API key encryption (simple base64 for demo)
        api_key = validated_data.pop('api_key', None)
        if api_key:
            import base64
            instance.api_key_encrypted = base64.b64encode(api_key.encode()).decode()
        
        return super().update(instance, validated_data)


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer for user profile (auto-apply info)"""
    education = EducationSerializer(many=True, required=False)
    work_experience = WorkExperienceSerializer(many=True, required=False)
    
    class Meta:
        model = User
        fields = [
            'first_name', 'last_name', 'phone', 'city',
            'linkedin_url', 'github_url', 'portfolio_url', 'resume_url',
            'target_role', 'location', 'work_authorization',
            'education', 'work_experience'
        ]
    
    def update(self, instance, validated_data):
        # Handle nested education
        education_data = validated_data.pop('education', None)
        if education_data is not None:
            # Clear existing and recreate (max 3)
            instance.education.all().delete()
            for i, edu in enumerate(education_data[:3]):
                Education.objects.create(user=instance, order=i+1, **edu)
        
        # Handle nested work experience
        work_exp_data = validated_data.pop('work_experience', None)
        if work_exp_data is not None:
            # Clear existing and recreate (max 4)
            instance.work_experience.all().delete()
            for i, exp in enumerate(work_exp_data[:4]):
                WorkExperience.objects.create(user=instance, order=i+1, **exp)
        
        return super().update(instance, validated_data)


class JobPostSerializer(serializers.ModelSerializer):
    """Serializer for JobPost model"""
    
    class Meta:
        model = JobPost
        fields = [
            'id', 'linkedin_job_id', 'linkedin_url', 
            'title', 'company', 'location', 'description',
            'external_apply_url', 'has_easy_apply',
            'status', 'apply_method', 'applied_at',
            'hiring_contacts',
            'match_score', 'ai_analysis', 'notes',
            'scanned_at', 'updated_at'
        ]
        read_only_fields = ['id', 'scanned_at', 'updated_at']


class JobPostCreateSerializer(serializers.Serializer):
    """
    Serializer for creating/updating job posts with deduplication.
    If job with same linkedin_url exists, it updates the existing record
    (only if status changes or new data available).
    """
    jobs = serializers.ListField(
        child=serializers.DictField(),
        allow_empty=False
    )
    
    def create(self, validated_data):
        user = self.context['request'].user
        jobs_data = validated_data['jobs']
        
        results = {
            'created': [],
            'updated': [],
            'skipped': []
        }
        
        for job_data in jobs_data:
            linkedin_url = job_data.get('linkedinUrl') or job_data.get('postUrl') or job_data.get('url', '')
            
            if not linkedin_url:
                continue
            
            # Normalize URL (remove query params for deduplication)
            # Keep jobId param if present
            from urllib.parse import urlparse, parse_qs, urlencode
            parsed = urlparse(linkedin_url)
            query_params = parse_qs(parsed.query)
            
            # Keep only essential params for dedup
            essential_params = {}
            if 'currentJobId' in query_params:
                essential_params['currentJobId'] = query_params['currentJobId'][0]
            
            normalized_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
            if essential_params:
                normalized_url += '?' + urlencode(essential_params)
            
            # Check if job already exists
            existing_job = JobPost.objects.filter(
                user=user,
                linkedin_url=normalized_url
            ).first()
            
            new_status = job_data.get('status', 'new')
            
            # Prepare hiring contacts data
            hiring_team = job_data.get('hiringTeam', [])
            hiring_contacts = [
                {
                    'name': contact.get('name', ''),
                    'title': contact.get('title', ''),
                    'linkedin_url': contact.get('profileUrl', ''),
                    'connection_degree': contact.get('connectionDegree', '')
                }
                for contact in hiring_team
            ]
            
            if existing_job:
                # Only update if status changed or new data available
                status_changed = existing_job.status != new_status
                has_new_data = (
                    (job_data.get('matchScore') and not existing_job.match_score) or
                    (job_data.get('analysis') and not existing_job.ai_analysis) or
                    (hiring_contacts and not existing_job.hiring_contacts)
                )
                
                if status_changed or has_new_data:
                    # Update existing record
                    existing_job.status = new_status
                    if job_data.get('matchScore'):
                        existing_job.match_score = job_data['matchScore']
                    if job_data.get('analysis'):
                        existing_job.ai_analysis = job_data['analysis']
                    if job_data.get('externalApplyUrl'):
                        existing_job.external_apply_url = job_data['externalApplyUrl']
                    if job_data.get('hasEasyApply') is not None:
                        existing_job.has_easy_apply = job_data['hasEasyApply']
                    if job_data.get('notes'):
                        existing_job.notes = job_data['notes']
                    if hiring_contacts:
                        existing_job.hiring_contacts = hiring_contacts
                    
                    # Set applied_at if status changed to 'applied'
                    if new_status == 'applied' and not existing_job.applied_at:
                        existing_job.applied_at = timezone.now()
                        existing_job.apply_method = job_data.get('applyMethod', 'external')
                    
                    existing_job.save()
                    results['updated'].append(JobPostSerializer(existing_job).data)
                else:
                    results['skipped'].append({
                        'linkedin_url': normalized_url,
                        'reason': 'No changes detected'
                    })
            else:
                # Create new job
                job = JobPost.objects.create(
                    user=user,
                    linkedin_job_id=job_data.get('jobId', ''),
                    linkedin_url=normalized_url,
                    title=job_data.get('title', 'Unknown'),
                    company=job_data.get('company') or job_data.get('author', ''),
                    location=job_data.get('location', ''),
                    description=job_data.get('description') or job_data.get('content', ''),
                    external_apply_url=job_data.get('externalApplyUrl', ''),
                    has_easy_apply=job_data.get('hasEasyApply', False),
                    status=new_status,
                    hiring_contacts=hiring_contacts if hiring_contacts else [],
                    match_score=job_data.get('matchScore'),
                    ai_analysis=job_data.get('analysis'),
                    notes=job_data.get('notes', '')
                )
                
                results['created'].append(JobPostSerializer(job).data)
        
        return results


class JobStatusUpdateSerializer(serializers.Serializer):
    """Serializer for updating job application status"""
    linkedin_url = serializers.CharField(required=False)
    job_id = serializers.UUIDField(required=False)
    status = serializers.ChoiceField(choices=JobPost.STATUS_CHOICES)
    apply_method = serializers.ChoiceField(
        choices=JobPost.APPLY_METHOD_CHOICES,
        required=False
    )
    notes = serializers.CharField(required=False, allow_blank=True)
    
    def validate(self, data):
        if not data.get('linkedin_url') and not data.get('job_id'):
            raise serializers.ValidationError(
                "Either linkedin_url or job_id is required"
            )
        return data
    
    def update_status(self, user):
        linkedin_url = self.validated_data.get('linkedin_url')
        job_id = self.validated_data.get('job_id')
        new_status = self.validated_data['status']
        
        # Find the job
        if job_id:
            job = JobPost.objects.filter(user=user, id=job_id).first()
        else:
            # Normalize URL for lookup
            normalized_url = linkedin_url.split('?')[0] if linkedin_url else linkedin_url
            job = JobPost.objects.filter(user=user, linkedin_url__startswith=normalized_url).first()
        
        if not job:
            return None
        
        # Update status
        old_status = job.status
        job.status = new_status
        
        # Set applied_at if status changed to 'applied'
        if new_status == 'applied' and old_status != 'applied':
            job.applied_at = timezone.now()
            if self.validated_data.get('apply_method'):
                job.apply_method = self.validated_data['apply_method']
        
        if self.validated_data.get('notes'):
            job.notes = self.validated_data['notes']
        
        job.save()
        return job


class ConnectionRequestSerializer(serializers.ModelSerializer):
    """Serializer for ConnectionRequest model"""
    
    class Meta:
        model = ConnectionRequest
        fields = [
            'id', 'job', 'recipient_name', 'recipient_title', 'recipient_linkedin_url',
            'message_type', 'message', 'status', 'created_at', 'sent_at'
        ]
        read_only_fields = ['id', 'created_at']


class ConnectionRequestCreateSerializer(serializers.Serializer):
    """Serializer for creating connection request"""
    job_id = serializers.UUIDField(required=False)
    linkedin_url = serializers.CharField(required=False)
    recipient_name = serializers.CharField()
    recipient_title = serializers.CharField(required=False, allow_blank=True)
    recipient_linkedin_url = serializers.URLField(required=False, allow_blank=True)
    message_type = serializers.ChoiceField(
        choices=ConnectionRequest.MESSAGE_TYPE_CHOICES,
        default='message'
    )
    message = serializers.CharField()
    
    def create(self, validated_data):
        user = self.context['request'].user
        job = None
        
        # Find the job if provided
        job_id = validated_data.pop('job_id', None)
        linkedin_url = validated_data.pop('linkedin_url', None)
        
        if job_id:
            job = JobPost.objects.filter(user=user, id=job_id).first()
        elif linkedin_url:
            normalized_url = linkedin_url.split('?')[0]
            job = JobPost.objects.filter(user=user, linkedin_url__startswith=normalized_url).first()
        
        return ConnectionRequest.objects.create(
            user=user,
            job=job,
            **validated_data
        )


class ActivityLogSerializer(serializers.ModelSerializer):
    """Serializer for ActivityLog model"""
    
    class Meta:
        model = ActivityLog
        fields = ['id', 'action', 'details', 'job', 'created_at']
        read_only_fields = ['id', 'created_at']


class UserStatsSerializer(serializers.Serializer):
    """Serializer for user statistics"""
    total_jobs = serializers.IntegerField()
    jobs_by_status = serializers.DictField()
    jobs_applied = serializers.IntegerField()
    jobs_interviewing = serializers.IntegerField()
    average_match_score = serializers.FloatField(allow_null=True)
    top_companies = serializers.ListField()
    recent_activity = serializers.ListField()


class AIAnalyzeSerializer(serializers.Serializer):
    """Serializer for AI analysis request"""
    job = serializers.DictField()
    user_profile = serializers.DictField(required=False)


class RegisterSerializer(serializers.Serializer):
    """Serializer for user registration"""
    email = serializers.EmailField()
    
    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("User with this email already exists")
        return value
    
    def create(self, validated_data):
        return User.objects.create_user(email=validated_data['email'])


class LoginSerializer(serializers.Serializer):
    """Serializer for user login"""
    email = serializers.EmailField()
