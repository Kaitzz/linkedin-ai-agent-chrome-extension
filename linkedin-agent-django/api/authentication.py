"""
LinkedIn AI Agent - Custom Authentication

Simple token-based authentication.
In production, use JWT (djangorestframework-simplejwt).
"""

import logging
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from .models import User

logger = logging.getLogger(__name__)


class TokenAuthentication(BaseAuthentication):
    """
    Simple token authentication.
    Token is the user's UUID.
    
    Usage: Authorization: Bearer <user_id>
    """
    
    def authenticate(self, request):
        auth_header = request.headers.get('Authorization', '')
        
        logger.info(f"Auth header: {auth_header[:50] if auth_header else 'None'}...")
        
        if not auth_header.startswith('Bearer '):
            logger.warning("No Bearer token found")
            return None
        
        token = auth_header.split(' ')[1]
        logger.info(f"Token received: {token[:20]}...")
        
        try:
            user = User.objects.get(id=token)
            logger.info(f"User authenticated: {user.email}")
            return (user, token)
        except User.DoesNotExist:
            logger.error(f"User not found for token: {token}")
            raise AuthenticationFailed('Invalid token - user not found')
        except ValueError as e:
            logger.error(f"Invalid token format: {e}")
            raise AuthenticationFailed('Invalid token format')
