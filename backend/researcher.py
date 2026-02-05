import os
import json
from google import genai
from google.genai import types
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv

load_dotenv()

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]

class ChatResponse(BaseModel):
    response: str
    sources: List[str] = []

class ScholarAgent:
    def __init__(self):
        self._client = None
        self.model_id = "gemini-2.0-flash"
        self.system_instruction = "You are The Scholar, a research engine. Use Google Search for facts."

    @property
    def client(self):
        if self._client is None:
            api_key = os.getenv("GOOGLE_API_KEY")
            if not api_key:
                raise ValueError("GOOGLE_API_KEY is not set.")
            self._client = genai.Client(api_key=api_key)
        return self._client

    async def chat(self, request: ChatRequest) -> ChatResponse:
        contents = [
            types.Content(
                role="user" if msg.role == "user" else "model",
                parts=[types.Part.from_text(text=msg.content)]
            ) for msg in request.messages
        ]

        response = self.client.models.generate_content(
            model=self.model_id,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=self.system_instruction,
                tools=[types.Tool(google_search=types.GoogleSearch())]
            )
        )
        
        sources = []
        if response.candidates[0].grounding_metadata and response.candidates[0].grounding_metadata.grounding_chunks:
            for chunk in response.candidates[0].grounding_metadata.grounding_chunks:
                if chunk.web: sources.append(chunk.web.uri)
        
        return ChatResponse(response=response.text, sources=list(set(sources)))

scholar = ScholarAgent()
