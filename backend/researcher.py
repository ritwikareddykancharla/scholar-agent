import os
import json
from google import genai
from google.genai import types
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

# We now accept a full chat history
class Message(BaseModel):
    role: str  # "user" or "model"
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]

class ChatResponse(BaseModel):
    response: str
    sources: List[str] = []

class ScholarAgent:
    def __init__(self):
        self.client = genai.Client()
        self.model_id = "gemini-2.0-flash"
        self.system_instruction = """
        You are The Scholar, an advanced recursive knowledge synthesis engine.
        Your goal is to provide deep, well-researched answers.
        
        RULES:
        1. ALWAYS use the Google Search tool when asked for facts, data, or recent events.
        2. If the user refers to previous context (e.g., "tell me more about that"), use the chat history to understand.
        3. Structure your answers with clear Markdown headers.
        4. Cite your sources at the end of your response.
        """

    async def chat(self, request: ChatRequest) -> ChatResponse:
        # Convert Pydantic messages to Gemini SDK format
        # The SDK expects contents as a list of strings or Content objects
        # We need to format the history correctly.
        
        contents = []
        for msg in request.messages:
            contents.append(
                types.Content(
                    role="user" if msg.role == "user" else "model",
                    parts=[types.Part.from_text(text=msg.content)]
                )
            )

        # Generate content with tools enabled
        response = self.client.models.generate_content(
            model=self.model_id,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=self.system_instruction,
                tools=[types.Tool(google_search=types.GoogleSearch())],
                response_mime_type='text/plain' # We want natural text, not JSON, for a chat
            )
        )
        
        # Extract text and grounding metadata (sources)
        text_response = response.text
        
        # Extract sources from grounding metadata if available
        sources = []
        if response.candidates[0].grounding_metadata and response.candidates[0].grounding_metadata.grounding_chunks:
            for chunk in response.candidates[0].grounding_metadata.grounding_chunks:
                if chunk.web:
                    sources.append(chunk.web.uri)
        
        # Deduplicate sources
        sources = list(set(sources))

        return ChatResponse(response=text_response, sources=sources)

scholar = ScholarAgent()