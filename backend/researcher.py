import os
import json
import asyncio
import re
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

    @property
    def client(self):
        if self._client is None:
            api_key = os.getenv("GOOGLE_API_KEY")
            if not api_key:
                raise ValueError("GOOGLE_API_KEY is not set.")
            self._client = genai.Client(api_key=api_key)
        return self._client

    async def chat_stream(self, request: ChatRequest) -> AsyncGenerator[str, None]:
        def _get(obj, *names):
            if obj is None:
                return None
            for name in names:
                if isinstance(obj, dict) and name in obj:
                    return obj[name]
                if hasattr(obj, name):
                    return getattr(obj, name)
            return None

        def _ensure_list(value):
            if value is None:
                return []
            if isinstance(value, list):
                return value
            if isinstance(value, tuple):
                return list(value)
            return [value]

        def _extract_grounding_urls(resp) -> set[str]:
            urls = set()
            candidates = _ensure_list(_get(resp, "candidates"))
            for cand in candidates:
                gm = _get(cand, "grounding_metadata", "groundingMetadata")
                if not gm:
                    continue
                chunks = _ensure_list(_get(gm, "grounding_chunks", "groundingChunks"))
                for chunk in chunks:
                    web = _get(chunk, "web", "web_result", "webResult")
                    if web:
                        uri = _get(web, "uri", "url")
                        if uri:
                            urls.add(uri)
                    uri = _get(chunk, "uri", "url")
                    if uri:
                        urls.add(uri)
            return urls

        def _extract_urls(obj) -> list[str]:
            urls = set()

            def walk(value):
                if value is None:
                    return
                if isinstance(value, str):
                    if value.startswith("http://") or value.startswith("https://"):
                        urls.add(value)
                    else:
                        for match in re.findall(r"https?://[^\s\"'<>]+", value):
                            urls.add(match)
                    return
                if isinstance(value, dict):
                    for v in value.values():
                        walk(v)
                    return
                if isinstance(value, (list, tuple, set)):
                    for v in value:
                        walk(v)
                    return

                # Pydantic-style models
                if hasattr(value, "model_dump"):
                    try:
                        walk(value.model_dump())
                        return
                    except Exception:
                        pass
                if hasattr(value, "__dict__"):
                    try:
                        walk(vars(value))
                        return
                    except Exception:
                        pass

            walk(obj)
            return list(urls)

        contents = [
            types.Content(
                role="user" if msg.role == "user" else "model",
                parts=[types.Part.from_text(text=msg.content)]
            ) for msg in request.messages
        ]

        sys_instruct = "You are The Scholar, a research engine. Use Google Search for facts and cite sources."
        config = types.GenerateContentConfig(
            system_instruction=sys_instruct,
            tools=[types.Tool(google_search=types.GoogleSearch())],
            temperature=0.3
        )

        try:
            yield json.dumps({"type": "status", "content": "Analyzing request..."}) + "\n"

            # Stream the main text response
            response_stream = self.client.models.generate_content_stream(
                model=self.flash_model,
                contents=contents,
                config=config
            )

            source_set = set()
            full_response_text = ""
            for chunk in response_stream:
                for url in _extract_grounding_urls(chunk):
                    source_set.add(url)
                for url in _extract_urls(chunk):
                    source_set.add(url)
                if chunk.text:
                    full_response_text += chunk.text
                    yield json.dumps({"type": "token", "content": chunk.text}) + "\n"
                if chunk.function_calls:
                     for fc in chunk.function_calls:
                         if fc.name == "google_search":
                            query = fc.args.get("query", "Unknown query")
                            yield json.dumps({"type": "log", "content": f"Searching for: {query}"}) + "\n"
            
            if not source_set:
                # --- FINAL SOURCE CHECK (fallback) ---
                yield json.dumps({"type": "status", "content": "Verifying sources..."}) + "\n"
                
                source_extraction_prompt = f"""
                Here is a research report:
                ---
                {full_response_text}
                ---
                Based on the grounding metadata and context available to you from the previous turn, list all the original source URLs that were used to generate this text.
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
                        for url in sources_data["sources"]:
                            source_set.add(url)
                except (json.JSONDecodeError, KeyError):
                    yield json.dumps({"type": "log", "content": "Could not verify sources with final check."}) + "\n"

            if source_set:
                yield json.dumps({"type": "sources", "content": sorted(source_set)}) + "\n"

        except Exception as e:
            yield json.dumps({"type": "error", "content": str(e)}) + "\n"

scholar = ScholarAgent()
