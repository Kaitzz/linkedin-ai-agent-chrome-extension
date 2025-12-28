"""
OpenAI integration for generating personalized LinkedIn connection messages.
"""

import logging
from typing import Optional, Dict, List
from django.conf import settings
from openai import OpenAI

logger = logging.getLogger(__name__)


class OpenAIMessageGenerator:
    """
    Service for generating personalized LinkedIn connection messages using OpenAI.
    """
    
    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = "gpt-4o-mini"  # Cost-effective for message generation
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
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": self._get_system_prompt()
                    },
                    {
                        "role": "user", 
                        "content": prompt
                    }
                ],
                max_tokens=150,
                temperature=0.7
            )
            
            message = response.choices[0].message.content.strip()
            
            # Ensure message doesn't exceed LinkedIn's limit
            if len(message) > self.max_message_length:
                message = self._truncate_message(message)
            
            return message
            
        except Exception as e:
            logger.error(f"OpenAI API error: {str(e)}")
            # Return a fallback generic message
            return self._generate_fallback_message(user_info, target_info)
    
    def generate_batch_messages(
        self,
        user_info: Dict,
        targets: List[Dict],
        tone: str = "professional"
    ) -> List[Dict]:
        """
        Generate personalized messages for multiple targets.
        
        Args:
            user_info: Dict containing user's profile information
            targets: List of dicts containing target persons' information
            tone: Message tone
            
        Returns:
            List of dicts with target info and generated messages
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
    
    def _get_system_prompt(self) -> str:
        """Get the system prompt for message generation."""
        return """You are an expert at writing LinkedIn connection request messages. 
Your task is to write personalized, authentic connection messages that:

1. Are warm and genuine, not salesy or robotic
2. Mention something specific about the target person (their role, company, or background)
3. Briefly explain why the sender wants to connect
4. Are concise (under 300 characters for LinkedIn's limit)
5. Don't include greetings like "Dear" or sign-offs like "Best regards"
6. Sound natural and human

Important:
- Keep messages short and to the point
- Focus on mutual benefit or genuine interest
- Avoid generic phrases like "I'd love to pick your brain"
- Make each message feel personal and relevant
- Write in first person as if you are the sender"""
    
    def _build_prompt(
        self,
        user_info: Dict,
        target_info: Dict,
        tone: str
    ) -> str:
        """Build the prompt for message generation."""
        
        # Extract user info with defaults
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
        
        purpose_context = f"My purpose for connecting: {connection_purpose}"
        
        tone_instruction = {
            'professional': "Write in a professional, polished tone.",
            'friendly': "Write in a friendly, approachable tone.",
            'casual': "Write in a casual, relaxed tone."
        }.get(tone, "Write in a professional tone.")
        
        prompt = f"""Please write a LinkedIn connection request message based on the following information:

ABOUT ME:
{user_context}

ABOUT THE TARGET:
{target_context}

PURPOSE:
{purpose_context}

TONE:
{tone_instruction}

Remember: Keep it under 300 characters, don't use greetings or sign-offs, and make it personal and genuine."""

        return prompt
    
    def _generate_fallback_message(
        self,
        user_info: Dict,
        target_info: Dict
    ) -> str:
        """Generate a simple fallback message when API fails."""
        
        user_name = user_info.get('name', '').split()[0] if user_info.get('name') else ''
        target_name = target_info.get('name', '').split()[0] if target_info.get('name') else ''
        target_company = target_info.get('company', '')
        
        if target_company:
            return f"Hi {target_name}, I noticed you work at {target_company} and would love to connect and learn more about your experience there."
        else:
            return f"Hi {target_name}, I came across your profile and would love to connect and expand our professional networks."
    
    def _truncate_message(self, message: str) -> str:
        """Truncate message to fit LinkedIn's character limit."""
        if len(message) <= self.max_message_length:
            return message
        
        # Try to truncate at a sentence boundary
        truncated = message[:self.max_message_length]
        last_period = truncated.rfind('.')
        last_exclaim = truncated.rfind('!')
        last_question = truncated.rfind('?')
        
        last_sentence_end = max(last_period, last_exclaim, last_question)
        
        if last_sentence_end > self.max_message_length * 0.7:
            return truncated[:last_sentence_end + 1]
        
        # Otherwise, truncate at word boundary
        last_space = truncated.rfind(' ')
        if last_space > 0:
            return truncated[:last_space] + "..."
        
        return truncated
