"""
Groq integration for generating personalized LinkedIn connection messages.
Uses Llama 3.3 70B model via Groq's ultra-fast inference.
"""

import logging
import requests
import random
import re
from typing import Dict, List, Optional, Tuple
from django.conf import settings

logger = logging.getLogger(__name__)

# School abbreviations
SCHOOL_ABBREVIATIONS = {
    'university of pennsylvania': 'UPenn',
    'massachusetts institute of technology': 'MIT',
    'california institute of technology': 'Caltech',
    'university of california, berkeley': 'UC Berkeley',
    'university of california berkeley': 'UC Berkeley',
    'university of california, los angeles': 'UCLA',
    'university of california los angeles': 'UCLA',
    'university of southern california': 'USC',
    'new york university': 'NYU',
    'carnegie mellon university': 'CMU',
    'georgia institute of technology': 'Georgia Tech',
    'university of michigan': 'UMich',
    'university of texas at austin': 'UT Austin',
    'university of illinois urbana-champaign': 'UIUC',
    'university of illinois at urbana-champaign': 'UIUC',
    'university of north carolina': 'UNC',
    'university of virginia': 'UVA',
    'university of wisconsin-madison': 'UW-Madison',
    'university of wisconsin': 'UW-Madison',
    'university of washington': 'UW',
    'duke university': 'Duke',
    'stanford university': 'Stanford',
    'harvard university': 'Harvard',
    'yale university': 'Yale',
    'princeton university': 'Princeton',
    'columbia university': 'Columbia',
    'cornell university': 'Cornell',
    'brown university': 'Brown',
    'dartmouth college': 'Dartmouth',
    'northwestern university': 'Northwestern',
    'johns hopkins university': 'Johns Hopkins',
    'boston university': 'BU',
    'boston college': 'BC',
    'purdue university': 'Purdue',
    'ohio state university': 'OSU',
    'penn state university': 'Penn State',
    'pennsylvania state university': 'Penn State',
    'michigan state university': 'MSU',
    'arizona state university': 'ASU',
    'florida state university': 'FSU',
    'texas a&m university': 'Texas A&M',
}

# Major abbreviations (only commonly used ones for casual tone)
MAJOR_ABBREVIATIONS = {
    'computer science': 'CS',
    'electrical engineering': 'EE',
    'electrical and computer engineering': 'ECE',
    'mechanical engineering': 'MechE',
    'economics': 'Econ',
    'mathematics': 'Math',
    'political science': 'Poli Sci',
    'information technology': 'IT',
    'information systems': 'IS',
}

# Seniority levels (lower number = more junior)
SENIORITY_LEVELS = {
    'student': 1,
    'entry': 2,
    'mid': 3,
    'senior': 4,
    'lead': 5,
    'director': 6,
    'executive': 7,
    'professor': 6,  # Similar to director level
}

# Keywords to detect seniority from title
SENIOR_TITLE_KEYWORDS = [
    (r'\b(ceo|cto|cfo|coo|cmo|cio)\b', 7),  # C-suite
    (r'\b(president|founder|co-founder|partner)\b', 7),
    (r'\b(vice president|vp)\b', 6),
    (r'\b(director|head of)\b', 6),
    (r'\b(professor|prof\.|faculty|dean)\b', 6),
    (r'\b(manager|lead|principal|staff)\b', 5),
    (r'\b(senior|sr\.?|experienced)\b', 4),
    (r'\b(mid|intermediate)\b', 3),
    (r'\b(junior|jr\.?|associate|entry)\b', 2),
    (r'\b(intern|student|trainee|graduate|apprentice)\b', 1),
]


class GroqMessageGenerator:
    """
    Service for generating personalized LinkedIn connection messages using Groq.
    """
    
    def __init__(self):
        self.api_key = settings.GROQ_API_KEY
        self.model = "llama-3.3-70b-versatile"
        self.api_url = "https://api.groq.com/openai/v1/chat/completions"
        self.max_message_length = 300
    
    def _get_short_school_name(self, school: str, casual: bool = False) -> str:
        """Get abbreviated school name for casual tone."""
        if not casual or not school:
            return school
        
        lower = school.lower().strip()
        return SCHOOL_ABBREVIATIONS.get(lower, school)
    
    def _get_short_major(self, major: str, casual: bool = False) -> str:
        """Get abbreviated major name for casual tone."""
        if not casual or not major:
            return major
        
        lower = major.lower().strip()
        return MAJOR_ABBREVIATIONS.get(lower, major)
    
    def _detect_target_seniority(self, title: str) -> int:
        """Detect seniority level from job title."""
        if not title:
            return 3  # Default to mid-level if unknown
        
        title_lower = title.lower()
        
        for pattern, level in SENIOR_TITLE_KEYWORDS:
            if re.search(pattern, title_lower):
                return level
        
        return 3  # Default to mid-level
    
    def _get_seniority_relationship(self, user_level: int, target_level: int) -> str:
        """Determine the relationship based on seniority difference."""
        diff = target_level - user_level
        
        if diff >= 3:
            return "much_senior"  # Target is significantly more senior
        elif diff >= 1:
            return "senior"  # Target is somewhat more senior
        elif diff == 0:
            return "peer"  # Same level
        elif diff >= -2:
            return "junior"  # Target is somewhat junior
        else:
            return "much_junior"  # Target is significantly more junior
    
    def _get_user_seniority(self, experience_level: str) -> int:
        """Get user's seniority level from their experience level setting."""
        return SENIORITY_LEVELS.get(experience_level, 3)
    
    def generate_message(
        self,
        user_info: Dict,
        target_info: Dict,
        tone: str = "professional",
        include_settings: Optional[Dict] = None
    ) -> str:
        """Generate a personalized connection message."""
        
        if include_settings is None:
            include_settings = {
                'title': True,
                'company': False,
                'school': True,
                'major': False,
                'email': False
            }
        
        is_casual = tone == "casual"
        
        # Analyze seniority relationship
        user_level = self._get_user_seniority(user_info.get('experience_level', ''))
        target_level = self._detect_target_seniority(target_info.get('title', ''))
        relationship = self._get_seniority_relationship(user_level, target_level)
        
        prompt = self._build_prompt(user_info, target_info, tone, include_settings, is_casual, relationship)
        system_prompt = self._get_system_prompt(tone, relationship)
        
        try:
            response = requests.post(
                self.api_url,
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ],
                    "max_tokens": 150,
                    "temperature": 0.95
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
                
                # Remove any extra lines
                lines = message.split('\n')
                message = lines[0] if lines else message
                
                # Ensure message doesn't exceed LinkedIn's limit
                if len(message) > self.max_message_length:
                    message = self._truncate_message(message)
                
                return message
            else:
                logger.error(f"Groq API error: {response.status_code} - {response.text}")
                return self._generate_fallback_message(user_info, target_info, include_settings, is_casual, relationship)
            
        except Exception as e:
            logger.error(f"Groq API error: {str(e)}")
            return self._generate_fallback_message(user_info, target_info, include_settings, is_casual, relationship)
    
    def generate_batch_messages(
        self,
        user_info: Dict,
        targets: List[Dict],
        tone: str = "professional",
        include_settings: Optional[Dict] = None
    ) -> List[Dict]:
        """Generate personalized messages for multiple targets."""
        results = []
        
        for target in targets:
            try:
                message = self.generate_message(user_info, target, tone, include_settings)
                results.append({
                    "target": target,
                    "message": message,
                    "success": True
                })
            except Exception as e:
                logger.error(f"Error generating message for {target.get('name', 'unknown')}: {str(e)}")
                is_casual = tone == "casual"
                user_level = self._get_user_seniority(user_info.get('experience_level', ''))
                target_level = self._detect_target_seniority(target.get('title', ''))
                relationship = self._get_seniority_relationship(user_level, target_level)
                results.append({
                    "target": target,
                    "message": self._generate_fallback_message(user_info, target, include_settings, is_casual, relationship),
                    "success": False,
                    "error": str(e)
                })
        
        return results
    
    def _get_system_prompt(self, tone: str, relationship: str) -> str:
        """Get the system prompt for message generation."""
        
        # Adjust tone based on seniority relationship
        if relationship == "much_senior":
            tone_desc = "respectful, humble, and professional. You are reaching out to someone significantly more experienced."
            extra_rules = """
- Show genuine respect for their experience and achievements
- Express admiration for their work/career
- Position yourself as eager to learn
- NEVER use "fellow" or imply you're at the same level
- Be humble but not overly self-deprecating"""
        elif relationship == "senior":
            tone_desc = "respectful and professional. You are reaching out to someone more experienced."
            extra_rules = """
- Show respect for their experience
- Be genuinely interested in their work
- NEVER use "fellow" unless you truly share something specific
- Be confident but not presumptuous"""
        elif relationship == "peer":
            tone_desc = "friendly and collegial. You are reaching out to a peer."
            extra_rules = """
- Can use "fellow [role]" if appropriate
- Be warm and genuine
- Mention shared experiences or interests if applicable"""
        else:  # junior or much_junior
            tone_desc = "warm, supportive, and professional."
            extra_rules = """
- Be encouraging and approachable
- Can offer to share insights or help
- Be genuine, not condescending"""
        
        if tone == "casual":
            tone_desc = "friendly and " + tone_desc
        
        return f"""You write short LinkedIn connection messages. Be {tone_desc}

RULES:
- Under 280 characters total
- Start with "Hi [Name],"
- End with a statement (NOT a question)
- NO questions at all in the message
- NO sign-offs like "Best regards" or "Thanks"
- Be genuine and specific
- Use school/major abbreviations when provided (e.g., "UPenn" not "University of Pennsylvania")
{extra_rules}

BANNED PHRASES (never use):
- "came across your profile"
- "would love to connect"
- "excited to connect"
- "looking forward to connecting"
- "expand our network"
- "reach out"
- "touch base"
- "I noticed"

Write ONLY the message text, nothing else."""
    
    def _build_prompt(
        self,
        user_info: Dict,
        target_info: Dict,
        tone: str,
        include_settings: Dict,
        is_casual: bool,
        relationship: str
    ) -> str:
        """Build the prompt for message generation."""
        
        user_name = user_info.get('name', 'User')
        user_exp = user_info.get('experience_level', 'mid')
        target_name = target_info.get('name', 'there')
        target_first = target_name.split()[0] if target_name else 'there'
        target_title = target_info.get('title', '')
        
        # Get abbreviated names for casual tone
        school = user_info.get('school', '')
        if school:
            school = self._get_short_school_name(school, is_casual)
        
        major = user_info.get('major', '')
        if major:
            major = self._get_short_major(major, is_casual)
        
        # Experience level descriptions
        exp_descriptions = {
            'student': 'a student',
            'entry': 'early in their career',
            'mid': 'a mid-level professional',
            'senior': 'a senior professional',
            'lead': 'a team lead/manager',
            'director': 'a director-level professional',
            'executive': 'an executive',
            'professor': 'an academic/professor'
        }
        user_exp_desc = exp_descriptions.get(user_exp, 'a professional')
        
        # Relationship guidance
        relationship_guidance = {
            'much_senior': f"The recipient ({target_title}) is SIGNIFICANTLY more senior than you ({user_exp_desc}). Be respectful and humble. Do NOT call them 'fellow' anything.",
            'senior': f"The recipient ({target_title}) is more senior than you ({user_exp_desc}). Be respectful.",
            'peer': f"The recipient ({target_title}) is at a similar level to you ({user_exp_desc}). You can be collegial.",
            'junior': f"The recipient is less senior than you. Be warm and supportive.",
            'much_junior': f"The recipient is significantly less senior. Be encouraging."
        }
        
        # Build what to include
        include_parts = []
        
        if include_settings.get('title') and user_info.get('title'):
            include_parts.append(f"mention your role as {user_info['title']}")
        
        if include_settings.get('company') and user_info.get('company'):
            include_parts.append(f"mention you work at {user_info['company']}")
        
        if include_settings.get('school') and school:
            if include_settings.get('major') and major:
                include_parts.append(f"mention you studied {major} at {school}")
            else:
                include_parts.append(f"mention you're from {school}")
        elif include_settings.get('major') and major:
            include_parts.append(f"mention you studied {major}")
        
        if include_settings.get('email') and user_info.get('email'):
            include_parts.append(f"include your email {user_info['email']}")
        
        include_text = ""
        if include_parts:
            include_text = "Include: " + ", ".join(include_parts) + "."
        
        # Random variation seed
        variation = random.randint(1000, 9999)
        
        # Connection purpose
        purpose = user_info.get('connection_purpose', 'networking and professional growth')
        
        prompt = f"""[Message #{variation}]

SENIORITY CONTEXT: {relationship_guidance.get(relationship, '')}

Write a connection request from {user_name} ({user_exp_desc}) to {target_first}"""
        
        if target_title:
            prompt += f" ({target_title})"
        
        prompt += f""".

Tone: {"Casual but respectful" if is_casual else "Professional"}
Purpose: {purpose}
{include_text}

Remember the seniority difference! Write a short, appropriate message (under 280 chars):"""

        return prompt
    
    def _generate_fallback_message(
        self,
        user_info: Dict,
        target_info: Dict,
        include_settings: Optional[Dict] = None,
        is_casual: bool = False,
        relationship: str = "peer"
    ) -> str:
        """Generate a simple fallback message when API fails."""
        
        target_name = target_info.get('name', '').split()[0] if target_info.get('name') else 'there'
        target_title = target_info.get('title', '')
        
        # Build intro based on include settings
        intro = f"Hi {target_name}, "
        
        if include_settings:
            school = user_info.get('school', '')
            major = user_info.get('major', '')
            
            if school:
                school = self._get_short_school_name(school, is_casual)
            if major:
                major = self._get_short_major(major, is_casual)
            
            if include_settings.get('school') and school:
                if include_settings.get('major') and major:
                    intro += f"{major} student from {school} here - " if user_info.get('experience_level') == 'student' else f"{major} grad from {school} here - "
                else:
                    intro += f"{school} student here - " if user_info.get('experience_level') == 'student' else f"{school} alum here - "
            elif include_settings.get('title') and user_info.get('title'):
                # Only use "fellow" if peer relationship
                if relationship == "peer":
                    intro += f"fellow {user_info['title']} here - "
                else:
                    intro += f"{user_info['title']} here - "
            elif include_settings.get('company') and user_info.get('company'):
                intro += f"from {user_info['company']} - "
        
        # Adjust message based on relationship
        if relationship in ["much_senior", "senior"] and target_title:
            templates = [
                f"{intro}your work as {target_title} is truly inspiring. Would be honored to connect!",
                f"{intro}I admire your experience as {target_title}. Hope to learn from your journey!",
                f"{intro}your career path is impressive. Would be great to connect!",
            ]
        elif target_title and len(target_title) > 5:
            templates = [
                f"{intro}your work as {target_title} is impressive. Hope we can connect!",
                f"{intro}your background caught my eye. Great to meet you!",
                f"{intro}always good to connect with a {target_title}!",
            ]
        else:
            templates = [
                f"{intro}always great to connect with fellow professionals!",
                f"{intro}building my network - hope to connect!",
                f"{intro}let's connect!",
            ]
        
        return random.choice(templates)
    
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
