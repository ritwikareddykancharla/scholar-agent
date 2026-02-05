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
        self.flash_model = "gemini-2.0-flash"

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

        sys_instruct = "You are The Scholar, a research engine. Use Google Search for facts and cite sources."
        config = types.GenerateContentConfig(
            system_instruction=sys_instruct,
            tools=[types.Tool(google_search=types.GoogleSearch())]
        )

        # Generate the main text response
        response = self.client.models.generate_content(
            model=self.flash_model,
            contents=contents,
            config=config
        )
        
        full_response_text = response.text
        sources = []
        
        # --- FINAL SOURCE CHECK ---
        # Ask Gemini to extract the REAL sources from the full text it just generated
        source_extraction_prompt = f"""
        Based on the grounding metadata and context from the previous turn that generated the report below, list all the original source URLs.
        Report: "{full_response_text}"
        Provide your response as a JSON object with a single key "sources" which is an array of strings.
        Example: {{"sources": ["https://www.example.com/article1", "https://en.wikipedia.org/wiki/RNA"]}}
        """
        
        source_context = contents + [types.Content(role="model", parts=[types.Part.from_text(full_response_text)])]
        source_context.append(types.Content(role="user", parts=[types.Part.from_text(source_extraction_prompt)]))

        source_response = self.client.models.generate_content(
            model=self.flash_model,
            contents=source_context,
            config={'response_mime_type': 'application/json'}
        )

        try:
            sources_data = json.loads(source_response.text)
            if "sources" in sources_data and isinstance(sources_data["sources"], list):
                sources = sources_data["sources"]
        except (json.JSONDecodeError, KeyError):
            # Fallback if parsing fails
            pass

        return ChatResponse(response=full_response_text, sources=sources)

scholar = ScholarAgent()