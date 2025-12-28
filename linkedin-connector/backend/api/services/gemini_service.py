"""
Google Gemini integration for generating personalized LinkedIn connection messages.
"""

import logging
import requests
from typing import Optional, Dict, List
from django.conf import settings

logger = logging.getLogger(__name__)


class GeminiMessageGenerator:
    """
    Service for generating personalized LinkedIn connection messages using Google Gemini.
    """
    
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.model = "gemini-2.0-flash"  # Current stable model
        self.api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        self.max_message_length = 300  # LinkedIn connection message limit
    
    def generate_message(
        self,
        user_info: Dict,
        target_info: Dict,
        tone: str = "professional"
    ) -> str:
        """
        Generate a personalized connection message.
        
        Args:
            user_info: Dict containing user's profile information
            target_info: Dict containing target person's information
            tone: Message tone - 'professional', 'friendly', or 'casual'
            
        Returns:
            Generated personalized message string
        """
        
        prompt = self._build_prompt(user_info, target_info, tone)
        
        try:
            response = requests.post(
                f"{self.api_url}?key={self.api_key}",
                json={
                    "contents": [{
                        "parts": [{
                            "text": prompt
                        }]
                    }],
                    "generationConfig": {
                        "temperature": 0.7,
                        "maxOutputTokens": 150,
                    }
                },
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                message = data['candidates'][0]['content']['parts'][0]['text'].strip()
                
                # Remove any quotes that Gemini might add
                message = message.strip('"\'')
                
                # Ensure message doesn't exceed LinkedIn's limit
                if len(message) > self.max_message_length:
                    message = self._truncate_message(message)
                
                return message
            else:
                logger.error(f"Gemini API error: {response.status_code} - {response.text}")
                return self._generate_fallback_message(user_info, target_info)
            
        except Exception as e:
            logger.error(f"Gemini API error: {str(e)}")
            return self._generate_fallback_message(user_info, target_info)
    
    def generate_batch_messages(
        self,
        user_info: Dict,
        targets: List[Dict],
        tone: str = "professional"
    ) -> List[Dict]:
        """
        Generate personalized messages for multiple targets.
        """
        results = []
        
        for target in targets:
            try:
                message = self.generate_message(user_info, target, tone)
                results.append({
                    "target": target,
                    "message": message,
                    "success": True
                })
            except Exception as e:
                logger.error(f"Error generating message for {target.get('name', 'unknown')}: {str(e)}")
                results.append({
                    "target": target,
                    "message": self._generate_fallback_message(user_info, target),
                    "success": False,
                    "error": str(e)
                })
        
        return results
    
    def _build_prompt(
        self,
        user_info: Dict,
        target_info: Dict,
        tone: str
    ) -> str:
        """Build the prompt for message generation."""
        
        # Extract user info
        user_name = user_info.get('name', 'User')
        user_title = user_info.get('title', user_info.get('current_title', ''))
        user_company = user_info.get('company', user_info.get('current_company', ''))
        user_school = user_info.get('school', '')
        user_skills = user_info.get('skills', '')
        connection_purpose = user_info.get('connection_purpose', 'professional networking')
        
        # Extract target info
        target_name = target_info.get('name', 'Connection')
        target_title = target_info.get('title', '')
        target_company = target_info.get('company', '')
        
        # Build context
        user_context = f"My name is {user_name}."
        if user_title:
            user_context += f" I work as a {user_title}"
            if user_company:
                user_context += f" at {user_company}"
            user_context += "."
        if user_school:
            user_context += f" I studied at {user_school}."
        if user_skills:
            user_context += f" My skills include: {user_skills}."
        
        target_context = f"The person I want to connect with is {target_name}."
        if target_title:
            target_context += f" They work as a {target_title}"
            if target_company:
                target_context += f" at {target_company}"
            target_context += "."
        
        tone_instruction = {
            'professional': "professional and polished",
            'friendly': "friendly and approachable",
            'casual': "casual and relaxed"
        }.get(tone, "professional")
        
        prompt = f"""Write a short LinkedIn connection request message (under 280 characters).

ABOUT ME:
{user_context}

ABOUT TARGET:
{target_context}

PURPOSE: {connection_purpose}

TONE: {tone_instruction}

RULES:
- Keep it under 280 characters
- No greetings like "Dear" or "Hi [Name]," at the start
- No sign-offs like "Best regards" or signatures
- Make it personal and genuine
- Just write the message text, nothing else

Write only the message:"""

        return prompt
    
    def _generate_fallback_message(
        self,
        user_info: Dict,
        target_info: Dict
    ) -> str:
        """Generate a simple fallback message when API fails."""
        
        user_name = user_info.get('name', '').split()[0] if user_info.get('name') else ''
        target_name = target_info.get('name', '').split()[0] if target_info.get('name') else ''
        target_title = target_info.get('title', '')
        target_company = target_info.get('company', '')
        
        if target_title:
            return f"Hi {target_name}, I noticed your work as {target_title} and would love to connect!{' - ' + user_name if user_name else ''}"
        elif target_company:
            return f"Hi {target_name}, I noticed you work at {target_company} and would love to connect and learn more about your experience there.{' - ' + user_name if user_name else ''}"
        else:
            return f"Hi {target_name}, I came across your profile and would love to connect and expand our professional networks.{' - ' + user_name if user_name else ''}"
    
    def _truncate_message(self, message: str) -> str:
        """Truncate message to fit LinkedIn's character limit."""
        if len(message) <= self.max_message_length:
            return message
        
        truncated = message[:self.max_message_length]
        last_period = truncated.rfind('.')
        last_exclaim = truncated.rfind('!')
        last_question = truncated.rfind('?')
        
        last_sentence_end = max(last_period, last_exclaim, last_question)
        
        if last_sentence_end > self.max_message_length * 0.7:
            return truncated[:last_sentence_end + 1]
        
        last_space = truncated.rfind(' ')
        if last_space > 0:
            return truncated[:last_space] + "..."
        
        return truncated
