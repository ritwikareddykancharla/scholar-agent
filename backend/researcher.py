import os
import json
import asyncio
from google import genai
from google.genai import types
from pydantic import BaseModel
from typing import List, Optional, AsyncGenerator
from dotenv import load_dotenv

load_dotenv()

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]

class ScholarAgent:
    def __init__(self):
        self._client = None
        self.flash_model = "gemini-2.0-flash"
        # self.pro_model = "gemini-1.5-pro" # Optional upgrade

    @property
    def client(self):
        if self._client is None:
            api_key = os.getenv("GOOGLE_API_KEY")
            if not api_key:
                raise ValueError("GOOGLE_API_KEY is not set.")
            self._client = genai.Client(api_key=api_key)
        return self._client

    async def chat_stream(self, request: ChatRequest) -> AsyncGenerator[str, None]:
        """
        Streams the thought process and final response.
        Output format: JSON strings prefixed with data type.
        e.g.
        __THOUGHT__ I need to search for RNA types.
        __SEARCH__ RNA types and function
        __ANSWER__ RNA is a nucleic acid...
        """
        
        contents = [
            types.Content(
                role="user" if msg.role == "user" else "model",
                parts=[types.Part.from_text(text=msg.content)]
            ) for msg in request.messages
        ]

        # Config for the "Thinking" Phase (Tool Use)
        # We ask the model to explicitly narrate its actions
        sys_instruct = """
        You are The Scholar, an advanced research engine.
        
        PROTOCOL:
        1. PLAN: First, think about what you need to research.
        2. SEARCH: Use the Google Search tool to find facts. Perform multiple searches if needed.
        3. SYNTHESIZE: After gathering info, write a deep, structured report.
        
        OUTPUT FORMAT:
        - When you are thinking or planning, just speak normally.
        - When you are writing the final report, ensure it is in Markdown.
        """

        # We use generate_content_stream to get real-time tokens
        # Note: The SDK's automatic tool use might hide the intermediate steps.
        # To show "Thinking", we might need to manually handle tool calls or use the automatic function calling events if available.
        # For this Hackathon, we will simulate the "Thinking" UI by streaming the tool call requests if possible, 
        # or by asking the model to "Think out loud" before calling tools.
        
        # Strategy: We'll use a single stream call with tools. 
        # We will yield chunks. If a chunk contains a function call, we yield a "Searching..." log.
        
        # Create a new config for streaming
        config = types.GenerateContentConfig(
            system_instruction=sys_instruct,
            tools=[types.Tool(google_search=types.GoogleSearch())],
            temperature=0.3
        )

        try:
            # Send initial "Thinking" signal
            yield json.dumps({"type": "status", "content": "Analyzing request..."}) + "\n"

            # Stream the response
            # Note: 2.0 Flash is fast. We want to capture the tool use.
            # The python SDK handles tool calling automatically in simple mode, but for granular control we might need manual loop.
            # Let's stick to automatic for stability, but we can infer "Searching" if there's a pause or specific content.
            
            # Actually, to show "Thinking" effectively with the Google Search tool, 
            # we rely on the model's output. 
            
            response_stream = self.client.models.generate_content_stream(
                model=self.flash_model,
                contents=contents,
                config=config
            )

            for chunk in response_stream:
                sources = []
                # Check for valid grounding metadata to extract correct source URLs
                if chunk.candidates and chunk.candidates[0].grounding_metadata:
                    chunks_data = chunk.candidates[0].grounding_metadata.grounding_chunks
                    if chunks_data:
                        raw_sources = [c.web.uri for c in chunks_data if c.web and c.web.uri]
                        # Clean up and deduplicate
                        sources = sorted(list(set(raw_sources)))

                if sources:
                     yield json.dumps({"type": "sources", "content": sources}) + "\n"

                # Check for text content
                if chunk.text:
                    yield json.dumps({"type": "token", "content": chunk.text}) + "\n"
                
                # Log search queries if the model makes a function call
                if chunk.function_calls:
                     for fc in chunk.function_calls:
                         if fc.name == "google_search":
                            query = fc.args.get("query", "Unknown query")
                            yield json.dumps({"type": "log", "content": f"Searching for: {query}"}) + "\n"

        except Exception as e:
            yield json.dumps({"type": "error", "content": str(e)}) + "\n"

scholar = ScholarAgent()