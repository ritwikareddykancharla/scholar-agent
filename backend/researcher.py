import os
import httpx
from google import genai
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
from bs4 import BeautifulSoup
import json

load_dotenv()

class ResearchRequest(BaseModel):
    topic: str
    depth: int = 2

class ResearchReport(BaseModel):
    title: str
    content: str
    sources: List[str]

class ScholarAgent:
    def __init__(self):
        self.client = genai.Client()
        self.model_id = "gemini-2.0-flash"

    async def search_web(self, query: str) -> List[str]:
        # Note: In a real production app, you'd use a Search API like Serper or Tavily.
        # For the hackathon, we can use Gemini's built-in Google Search tool if available
        # or simulate/mock it. Let's use Gemini's Google Search tool integration.
        return []

    async def conduct_research(self, request: ResearchRequest) -> ResearchReport:
        # We will use Gemini with Google Search tool enabled
        prompt = f"""
        Conduct a deep research report on the following topic: "{request.topic}"
        
        Requirements:
        1. Use Google Search to find latest data.
        2. Synthesize the findings into a structured Markdown report.
        3. Include a "Sources" section with URLs.
        4. Focus on accuracy and depth.
        
        Structure your final output as a JSON object with:
        {{
            "title": "Report Title",
            "content": "Full Markdown content",
            "sources": ["URL1", "URL2"]
        }}
        """
        
        # Use Gemini 2.0 with search tool enabled
        response = self.client.models.generate_content(
            model=self.model_id,
            contents=prompt,
            config={
                'tools': [{'google_search': {}}],
                'response_mime_type': 'application/json',
            }
        )
        
        try:
            result = json.loads(response.text)
            return ResearchReport(**result)
        except Exception as e:
            # Fallback if JSON parsing fails
            return ResearchReport(
                title=f"Research: {request.topic}",
                content=response.text,
                sources=[]
            )

scholar = ScholarAgent()
