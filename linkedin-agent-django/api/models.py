"""
LinkedIn AI Agent - Database Models

Models:
- User: Extended profile with work authorization
- Education: User's education history (0-3 entries)
- WorkExperience: User's work history (0-4 entries)
- JobPost: Scanned jobs with deduplication by URL
- ConnectionRequest: Hiring team outreach tracking
- ActivityLog: Audit trail
"""

import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
from django.core.exceptions import ValidationError


class UserManager(BaseUserManager):
    """Custom user manager for email-based authentication"""
    
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        user.save(using=self._db)
        return user
    
    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser):
    """
    Custom User model for the LinkedIn AI Agent
    """
    WORK_AUTH_CHOICES = [
        ('us_citizen', 'U.S. Citizen'),
        ('green_card', 'Green Card / Permanent Resident'),
        ('h1b', 'H-1B Visa'),
        ('h1b_transfer', 'H-1B (Need Transfer)'),
        ('opt', 'OPT'),
        ('opt_stem', 'OPT STEM Extension'),
        ('cpt', 'CPT'),
        ('f1', 'F-1 Student (Need Sponsorship)'),
        ('ead', 'EAD'),
        ('tn', 'TN Visa'),
        ('l1', 'L-1 Visa'),
        ('o1', 'O-1 Visa'),
        ('other_authorized', 'Other (Authorized to Work)'),
        ('need_sponsorship', 'Need Sponsorship'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    
    # Job search settings
    target_role = models.CharField(max_length=200, blank=True, null=True)
    location = models.CharField(max_length=200, blank=True, null=True)
    api_key_encrypted = models.TextField(blank=True, null=True)
    
    # Profile fields for auto-apply
    first_name = models.CharField(max_length=100, blank=True, null=True)
    last_name = models.CharField(max_length=100, blank=True, null=True)
    phone = models.CharField(max_length=50, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    linkedin_url = models.URLField(max_length=500, blank=True, null=True)
    github_url = models.URLField(max_length=500, blank=True, null=True)
    portfolio_url = models.URLField(max_length=500, blank=True, null=True)
    resume_url = models.URLField(max_length=500, blank=True, null=True)
    
    # Work authorization
    work_authorization = models.CharField(
        max_length=50, 
        choices=WORK_AUTH_CHOICES, 
        blank=True, 
        null=True
    )
    
    # Auth fields
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    objects = UserManager()
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []
    
    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'
    
    def __str__(self):
        return self.email
    
    def has_perm(self, perm, obj=None):
        return self.is_superuser
    
    def has_module_perms(self, app_label):
        return self.is_superuser
    
    @property
    def full_name(self):
        return f"{self.first_name or ''} {self.last_name or ''}".strip()


class Education(models.Model):
    """
    User's education history (0-3 entries per user)
    """
    DEGREE_CHOICES = [
        ('high_school', 'High School'),
        ('associate', "Associate's Degree"),
        ('bachelor', "Bachelor's Degree"),
        ('master', "Master's Degree"),
        ('mba', 'MBA'),
        ('phd', 'Ph.D.'),
        ('jd', 'J.D.'),
        ('md', 'M.D.'),
        ('other', 'Other'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='education'
    )
    
    school = models.CharField(max_length=200)
    degree = models.CharField(max_length=50, choices=DEGREE_CHOICES, blank=True, null=True)
    major = models.CharField(max_length=200, blank=True, null=True)
    
    # Date fields - using CharField for flexibility (e.g., "2020-09")
    start_date = models.CharField(max_length=7, blank=True, null=True)  # YYYY-MM format
    end_date = models.CharField(max_length=7, blank=True, null=True)    # YYYY-MM format
    is_graduated = models.BooleanField(default=False)
    
    # Order for display (1 = most recent)
    order = models.PositiveSmallIntegerField(default=1)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'education'
        verbose_name = 'Education'
        verbose_name_plural = 'Education'
        ordering = ['order', '-end_date']
        
        indexes = [
            models.Index(fields=['user', 'order']),
        ]
    
    def __str__(self):
        return f"{self.degree or 'Degree'} from {self.school}"
    
    def clean(self):
        """Limit to 3 education entries per user"""
        if not self.pk:  # Only check on create
            existing_count = Education.objects.filter(user=self.user).count()
            if existing_count >= 3:
                raise ValidationError('Maximum 3 education entries allowed per user')


class WorkExperience(models.Model):
    """
    User's work experience history (0-4 entries per user)
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='work_experience'
    )
    
    company = models.CharField(max_length=200)
    location = models.CharField(max_length=200, blank=True, null=True)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, null=True)
    
    # Date fields
    start_date = models.CharField(max_length=7, blank=True, null=True)  # YYYY-MM format
    end_date = models.CharField(max_length=7, blank=True, null=True)    # YYYY-MM format
    is_current = models.BooleanField(default=False)
    
    # Order for display (1 = most recent)
    order = models.PositiveSmallIntegerField(default=1)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'work_experience'
        verbose_name = 'Work Experience'
        verbose_name_plural = 'Work Experience'
        ordering = ['order', '-end_date']
        
        indexes = [
            models.Index(fields=['user', 'order']),
        ]
    
    def __str__(self):
        return f"{self.title} at {self.company}"
    
    def clean(self):
        """Limit to 4 work experience entries per user"""
        if not self.pk:  # Only check on create
            existing_count = WorkExperience.objects.filter(user=self.user).count()
            if existing_count >= 4:
                raise ValidationError('Maximum 4 work experience entries allowed per user')


class JobPost(models.Model):
    """
    Stores job posts scanned from LinkedIn
    
    Deduplication: unique constraint on (user, linkedin_url)
    - Same job post won't be duplicated for the same user
    - Use update_or_create to update existing records
    """
    STATUS_CHOICES = [
        ('new', 'New'),
        ('not_interested', 'Not Interested'),
        ('apply_later', 'Apply Later'),
        ('applied', 'Applied'),
        ('interviewing', 'Interviewing'),
        ('offer', 'Offer'),
        ('rejected', 'Rejected'),
    ]
    
    APPLY_METHOD_CHOICES = [
        ('easy_apply', 'Easy Apply'),
        ('external', 'External Website'),
        ('email', 'Email'),
        ('referral', 'Referral'),
        ('other', 'Other'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Foreign Key relationship to User
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE,
        related_name='job_posts'
    )
    
    # Job identification - linkedin_url is unique per user for deduplication
    linkedin_job_id = models.CharField(max_length=100, blank=True, null=True)
    linkedin_url = models.URLField(max_length=1000)
    
    # Job information
    title = models.CharField(max_length=500)
    company = models.CharField(max_length=200, blank=True, null=True)
    location = models.CharField(max_length=200, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    
    # Application URLs
    external_apply_url = models.URLField(max_length=1000, blank=True, null=True)
    has_easy_apply = models.BooleanField(default=False)
    
    # Application status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')
    applied_at = models.DateTimeField(blank=True, null=True)
    apply_method = models.CharField(
        max_length=20, 
        choices=APPLY_METHOD_CHOICES, 
        blank=True, 
        null=True
    )
    
    # Hiring team contacts - stored as JSON array
    # Format: [{"name": "John Doe", "title": "Senior Recruiter", "linkedin_url": "..."}, ...]
    hiring_contacts = models.JSONField(blank=True, null=True, default=list)
    
    # AI analysis results
    match_score = models.IntegerField(blank=True, null=True)  # 0-100
    ai_analysis = models.JSONField(blank=True, null=True)
    
    # Notes
    notes = models.TextField(blank=True, null=True)
    
    # Timestamps
    scanned_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'job_posts'
        verbose_name = 'Job Post'
        verbose_name_plural = 'Job Posts'
        ordering = ['-updated_at']
        
        # Unique constraint for deduplication
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'linkedin_url'],
                name='unique_job_per_user'
            )
        ]
        
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['user', 'scanned_at']),
            models.Index(fields=['company']),
            models.Index(fields=['match_score']),
            models.Index(fields=['linkedin_job_id']),
        ]
    
    def __str__(self):
        return f"{self.title} at {self.company} ({self.status})"
    
    @classmethod
    def save_or_update(cls, user, linkedin_url, **kwargs):
        """
        Save a new job post or update existing one if URL already exists.
        
        Usage:
            job, created = JobPost.save_or_update(
                user=user,
                linkedin_url='https://linkedin.com/jobs/view/123',
                title='Software Engineer',
                company='Google',
                ...
            )
        
        Returns: (job_instance, created_boolean)
        """
        # Normalize URL (remove query params that don't affect job identity)
        normalized_url = linkedin_url.split('?')[0] if linkedin_url else linkedin_url
        
        job, created = cls.objects.update_or_create(
            user=user,
            linkedin_url=normalized_url,
            defaults=kwargs
        )
        return job, created


class ConnectionRequest(models.Model):
    """
    Tracks connection requests / messages sent to hiring team
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('sent', 'Sent'),
        ('accepted', 'Accepted'),
        ('replied', 'Replied'),
        ('no_response', 'No Response'),
    ]
    
    MESSAGE_TYPE_CHOICES = [
        ('connection', 'Connection Request'),
        ('message', 'Direct Message'),
        ('inmail', 'InMail'),
        ('follow_up', 'Follow Up'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Relationships
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='connection_requests'
    )
    job = models.ForeignKey(
        JobPost,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='connection_requests'
    )
    
    # Recipient details
    recipient_name = models.CharField(max_length=200)
    recipient_title = models.CharField(max_length=200, blank=True, null=True)
    recipient_linkedin_url = models.URLField(max_length=500, blank=True, null=True)
    
    # Message details
    message_type = models.CharField(
        max_length=20, 
        choices=MESSAGE_TYPE_CHOICES, 
        default='message'
    )
    message = models.TextField()
    
    # Status tracking
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(blank=True, null=True)
    
    class Meta:
        db_table = 'connection_requests'
        verbose_name = 'Connection Request'
        verbose_name_plural = 'Connection Requests'
        ordering = ['-created_at']
        
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['user', 'job']),
            models.Index(fields=['created_at']),
        ]
    
    def __str__(self):
        return f"{self.message_type} to {self.recipient_name} ({self.status})"


class ActivityLog(models.Model):
    """
    Audit log for user activities
    """
    ACTION_CHOICES = [
        ('user_registered', 'User Registered'),
        ('user_login', 'User Login'),
        ('profile_updated', 'Profile Updated'),
        ('job_scanned', 'Job Scanned'),
        ('job_saved', 'Job Saved'),
        ('status_changed', 'Status Changed'),
        ('applied', 'Applied'),
        ('ai_analysis', 'AI Analysis'),
        ('message_generated', 'Message Generated'),
        ('message_sent', 'Message Sent'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='activity_logs'
    )
    
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    details = models.JSONField(blank=True, null=True)
    
    # Optional link to job
    job = models.ForeignKey(
        JobPost,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='activity_logs'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'activity_logs'
        verbose_name = 'Activity Log'
        verbose_name_plural = 'Activity Logs'
        ordering = ['-created_at']
        
        indexes = [
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['action']),
        ]
    
    def __str__(self):
        return f"{self.user.email}: {self.action}"
