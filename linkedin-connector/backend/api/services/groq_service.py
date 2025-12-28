"""
Groq integration for generating personalized LinkedIn connection messages.
Uses Llama 3.3 70B model via Groq's ultra-fast inference.
"""

import logging
import requests
from typing import Dict, List
from django.conf import settings

logger = logging.getLogger(__name__)


class GroqMessageGenerator:
    """
    Service for generating personalized LinkedIn connection messages using Groq.
    """
    
    def __init__(self):
        self.api_key = settings.GROQ_API_KEY
        self.model = "llama-3.3-70b-versatile"  # Fast and capable
        self.api_url = "https://api.groq.com/openai/v1/chat/completions"
        self.max_message_length = 300
    
    def generate_message(
        self,
        user_info: Dict,
        target_info: Dict,
        tone: str = "professional"
    ) -> str:
        """Generate a personalized connection message."""
        
        prompt = self._build_prompt(user_info, target_info, tone)
        
        try:
            response = requests.post(
                self.api_url,
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": self._get_system_prompt()},
                        {"role": "user", "content": prompt}
                    ],
                    "max_tokens": 150,
                    "temperature": 0.7
                },
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                message = data['choices'][0]['message']['content'].strip()
                
                # Clean up the message
                message = message.strip('"\'')
                
                # Ensure message doesn't exceed LinkedIn's limit
                if len(message) > self.max_message_length:
                    message = self._truncate_message(message)
                
                return message
            else:
                logger.error(f"Groq API error: {response.status_code} - {response.text}")
                return self._generate_fallback_message(user_info, target_info)
            
        except Exception as e:
            logger.error(f"Groq API error: {str(e)}")
            return self._generate_fallback_message(user_info, target_info)
    
    def generate_batch_messages(
        self,
        user_info: Dict,
        targets: List[Dict],
        tone: str = "professional"
    ) -> List[Dict]:
        """Generate personalized messages for multiple targets."""
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
        return """You are an expert at writing unique LinkedIn connection request messages.

CRITICAL RULES:
1. Each message MUST be completely different in structure and wording
2. NEVER use these overused phrases:
   - "loved your recent post"
   - "came across your profile"  
   - "would love to connect"
   - "great to connect"
   - "expand our networks"
3. NEVER ask questions that require a real response, such as:
   - "Can I show you my project?"
   - "Care for a coffee?"
   - "Would you be open to a call?"
   - "Can we chat sometime?"
4. Keep it under 280 characters
5. Start with "Hi [FirstName],"
6. No sign-offs like "Best regards"
7. End with a simple statement, not a question

GOOD ENDINGS:
- "Would be great to connect!"
- "Looking forward to connecting."
- "Hope to connect and learn from your experience."
- "Excited to be part of your network."

Write ONLY the message, nothing else."""
    
    def _build_prompt(
        self,
        user_info: Dict,
        target_info: Dict,
        tone: str
    ) -> str:
        """Build the prompt for message generation."""
        
        import random
        
        user_name = user_info.get('name', 'User')
        user_title = user_info.get('title', user_info.get('current_title', ''))
        user_company = user_info.get('company', user_info.get('current_company', ''))
        user_school = user_info.get('school', '')
        connection_purpose = user_info.get('connection_purpose', 'networking')
        
        target_name = target_info.get('name', 'there')
        target_first = target_name.split()[0] if target_name else 'there'
        target_title = target_info.get('title', '')
        target_company = target_info.get('company', '')
        
        tone_style = {
            'professional': "professional but warm",
            'friendly': "friendly and enthusiastic",
            'casual': "casual and genuine"
        }.get(tone, "professional but warm")
        
        # Randomize the approach for variety
        approaches = [
            "Focus on their role/title and express genuine interest in their work",
            "Mention you're in a similar field and looking to learn from others",
            "Mention a specific skill or expertise they might have",
            "Express interest in their career journey",
            "Note something impressive about their background",
            "Express enthusiasm about connecting with someone in their field"
        ]
        chosen_approach = random.choice(approaches)
        
        prompt = f"""Write a LinkedIn connection message (under 280 chars).
DO NOT ask any questions. End with a statement like "Would be great to connect!"

SENDER: {user_name}"""
        
        if user_title:
            prompt += f", {user_title}"
        if user_company:
            prompt += f" at {user_company}"
        
        prompt += f"""

RECIPIENT: {target_first}"""
        
        if target_title:
            prompt += f", {target_title}"
        if target_company:
            prompt += f" at {target_company}"
        
        prompt += f"""

CONNECTION GOAL: {connection_purpose}
TONE: {tone_style}
APPROACH: {chosen_approach}

Remember: Be unique, specific, and genuine. Avoid generic phrases.

Write the message:"""

        return prompt
    
    def _generate_fallback_message(
        self,
        user_info: Dict,
        target_info: Dict
    ) -> str:
        """Generate a simple fallback message when API fails."""
        
        user_name = user_info.get('name', '').split()[0] if user_info.get('name') else ''
        target_name = target_info.get('name', '').split()[0] if target_info.get('name') else 'there'
        target_title = target_info.get('title', '')
        purpose = user_info.get('connection_purpose', 'expand our networks')
        
        if target_title and len(target_title) > 5:
            msg = f"Hi {target_name}, I noticed your experience as {target_title} and would love to connect!"
        else:
            msg = f"Hi {target_name}, I'd love to connect to {purpose}!"
        
        if user_name:
            msg += f" - {user_name}"
        
        return msg
    
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
