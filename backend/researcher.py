import os
import json
import asyncio
import re
import time
import httpx
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
        def _wants_deep_research(text: str) -> bool:
            keywords = [
                "deep research",
                "report",
                "outline",
                "trends",
                "deep dive",
                "earnings",
                "analysis",
                "due diligence",
                "investment memo",
                "memo"
            ]
            lower = text.lower()
            return any(k in lower for k in keywords)

        def _needs_regen(text: str) -> bool:
            lower = text.lower()
            triggers = [
                "search queries",
                "i can help you gather",
                "i can't directly",
                "i cannot directly",
                "use a word processor",
                "suggested outline",
                "you can then use",
                "i can provide the content"
            ]
            return any(t in lower for t in triggers)

        def _looks_like_outline(text: str) -> bool:
            lines = [line.strip() for line in text.split("\n") if line.strip()]
            if not lines:
                return True
            numbered = sum(1 for line in lines if re.match(r"^\d+\.\s+", line))
            headings = sum(1 for line in lines if line.startswith("#"))
            word_count = len(text.split())
            return (numbered >= 6 and headings == 0 and word_count < 600)

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

        def _is_redirect(url: str) -> bool:
            return "vertexaisearch.cloud.google.com/grounding-api-redirect" in url

        def _clean_url(url: str | None) -> str | None:
            if not url:
                return None
            if url == "http://www.w3.org/2000/svg":
                return None
            return url

        def _filter_sources(urls: list[str]) -> list[str]:
            cleaned = []
            for url in urls:
                url = _clean_url(url)
                if not url:
                    continue
                if _is_redirect(url):
                    continue
                cleaned.append(url)
            # Preserve order while deduping
            seen = set()
            ordered = []
            for url in cleaned:
                if url in seen:
                    continue
                seen.add(url)
                ordered.append(url)
            return ordered

        async def _resolve_redirects(urls: list[str]) -> list[str]:
            if not urls:
                return []

            sem = asyncio.Semaphore(4)

            async def fetch(u: str, client: httpx.AsyncClient) -> str:
                async with sem:
                    try:
                        resp = await client.get(u)
                        return str(resp.url)
                    except Exception:
                        return u

            async with httpx.AsyncClient(
                follow_redirects=True,
                timeout=3.0,
                headers={"User-Agent": "ScholarAgent/1.0"}
            ) as client:
                tasks = [fetch(u, client) for u in urls]
                return await asyncio.gather(*tasks)

        def _extract_grounding_metadata(resp):
            candidates = _ensure_list(_get(resp, "candidates"))
            for cand in candidates:
                gm = _get(cand, "grounding_metadata", "groundingMetadata")
                if gm:
                    return gm
            return None

        def _parse_grounding(gm):
            chunks = _ensure_list(_get(gm, "grounding_chunks", "groundingChunks"))
            supports = _ensure_list(_get(gm, "grounding_supports", "groundingSupports"))

            chunk_urls = []
            for chunk in chunks:
                web = _get(chunk, "web", "web_result", "webResult")
                uri = _get(web, "uri", "url") if web else None
                uri = _clean_url(uri or _get(chunk, "uri", "url"))
                chunk_urls.append(uri)

            normalized_supports = []
            for support in supports:
                seg = _get(support, "segment")
                start = _get(seg, "start_index", "startIndex") if seg else None
                end = _get(seg, "end_index", "endIndex") if seg else None
                indices = _ensure_list(_get(support, "grounding_chunk_indices", "groundingChunkIndices"))
                normalized_supports.append({
                    "start": start,
                    "end": end,
                    "indices": [i for i in indices if isinstance(i, int)]
                })

            return chunk_urls, normalized_supports

        def _build_source_map(chunk_urls: list[str]):
            sources: list[str] = []
            index_map: dict[int, int] = {}
            seen: dict[str, int] = {}
            for idx, url in enumerate(chunk_urls):
                if not url:
                    continue
                if url in seen:
                    index_map[idx] = seen[url]
                    continue
                sources.append(url)
                index = len(sources)
                seen[url] = index
                index_map[idx] = index
            return sources, index_map

        def _insert_citations(text: str, supports, index_map) -> str:
            if not supports or not index_map:
                return text
            inserts: dict[int, set[int]] = {}
            for support in supports:
                end = support.get("end")
                if end is None:
                    continue
                numbers = [index_map[i] for i in support.get("indices", []) if i in index_map]
                if not numbers:
                    continue
                pos = max(0, min(int(end), len(text)))
                inserts.setdefault(pos, set()).update(numbers)

            if not inserts:
                return text

            out = []
            last = 0
            for pos in sorted(inserts.keys()):
                out.append(text[last:pos])
                marker = "".join([f"[{n}]" for n in sorted(inserts[pos])])
                out.append(f" {marker}")
                last = pos
            out.append(text[last:])
            return "".join(out)

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

        def _extract_sources_block(text: str) -> list[str]:
            lines = text.split("\n")
            in_sources = False
            blocks: list[str] = []
            for raw in lines:
                line = raw.strip()
                if not line:
                    continue
                if re.match(r"^(#{1,3}\s*)?Sources$", line, re.IGNORECASE):
                    if in_sources:
                        break
                    in_sources = True
                    continue
                if not in_sources:
                    continue
                blocks.append(line)
            return blocks

        def _parse_sources_lines(lines: list[str]):
            parsed = []
            for line in lines:
                match = re.match(r"^\[(\d+)\]\s+(.*?)(?:\s+—\s+|\s+-\s+)?(https?://\S+)?$", line)
                if match:
                    title = match.group(2).strip()
                    url = match.group(3)
                    parsed.append({"title": title, "url": url})
                else:
                    url_match = re.search(r"https?://\S+", line)
                    if url_match:
                        parsed.append({"title": line.replace(url_match.group(0), "").strip(), "url": url_match.group(0)})
                    else:
                        parsed.append({"title": line, "url": None})
            return parsed

        async def _repair_sources(lines: list[str], request_text: str):
            parsed = _parse_sources_lines(lines)
            if not parsed:
                return []
            missing = [item for item in parsed if not item.get("url")]
            if not missing:
                return parsed

            titles = [item["title"] for item in missing]
            prompt = (
                "You are given a list of source titles. Use Google Search to find the exact source URLs. "
                "Return JSON: {\"sources\":[{\"title\":\"...\",\"url\":\"https://...\"}]}.\n"
                f"User request: {request_text}\nTitles: {titles}"
            )
            response = self.client.models.generate_content(
                model=self.flash_model,
                contents=[types.Content(role="user", parts=[types.Part.from_text(text=prompt)])],
                config={
                    "response_mime_type": "application/json",
                    "tools": [types.Tool(google_search=types.GoogleSearch())]
                }
            )
            try:
                data = json.loads(response.text)
                url_map = {item.get("title"): item.get("url") for item in data.get("sources", [])}
                for item in parsed:
                    if not item.get("url"):
                        item["url"] = url_map.get(item.get("title"))
            except Exception:
                pass
            return parsed

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

        sys_instruct = (
            "You are The Scholar, a research engine. Use Google Search for facts and cite sources. "
            "Never ask the user to do their own research. If data is needed, search for it yourself. "
            "When asked for a report, produce the full report with citations instead of an outline. "
            "If evidence is insufficient, explicitly state limitations and what is missing."
        )
        config = types.GenerateContentConfig(
            system_instruction=sys_instruct,
            tools=[types.Tool(google_search=types.GoogleSearch())],
            temperature=0.3
        )

        try:
            yield json.dumps({"type": "status", "content": "Analyzing request..."}) + "\n"

            user_request = request.messages[-1].content if request.messages else ""
            is_deep = _wants_deep_research(user_request)
            research_notes: list[str] = []
            pre_source_set = set()
            start_time = time.monotonic()

            if is_deep:
                yield json.dumps({"type": "status", "content": "Deep research mode: planning research..."}) + "\n"
                passes = int(os.getenv("DEEP_RESEARCH_PASSES", "2"))
                for idx in range(passes):
                    yield json.dumps({
                        "type": "status",
                        "content": f"Research pass {idx + 1}/{passes}: gathering evidence..."
                    }) + "\n"
                    notes_prompt = (
                        "Collect evidence for the request below. Use Google Search tool calls. "
                        "Return concise bullet notes with inline citations like [1]. "
                        "Do NOT output a full report.\n\n"
                        f"Request: {user_request}"
                    )
                    notes_response = self.client.models.generate_content(
                        model=self.flash_model,
                        contents=[types.Content(role="user", parts=[types.Part.from_text(text=notes_prompt)])],
                        config=config
                    )
                    if notes_response.text:
                        research_notes.append(notes_response.text)
                    for url in _extract_grounding_urls(notes_response):
                        pre_source_set.add(url)
                    for url in _extract_urls(notes_response):
                        pre_source_set.add(url)

                min_seconds_default = "0"
                min_seconds = int(os.getenv("DEEP_RESEARCH_MIN_SECONDS", min_seconds_default))
                elapsed = time.monotonic() - start_time
                while elapsed < min_seconds:
                    remaining = int(min_seconds - elapsed)
                    yield json.dumps({
                        "type": "status",
                        "content": f"Deep research: validating sources... ({remaining}s)"
                    }) + "\n"
                    await asyncio.sleep(min(10, remaining))
                    elapsed = time.monotonic() - start_time

            if is_deep:
                notes_block = "\n\n".join(research_notes)
                if len(notes_block) > 8000:
                    notes_block = notes_block[:8000] + "\n\n[Notes truncated]"
                final_prompt = (
                    "Write the final deep research report now. Do NOT ask the user to search or gather "
                    "information. Use Google Search tool calls as needed. Provide a complete report with "
                    "inline citations like [1]. The Sources section MUST be formatted as:\n"
                    "[1] Title — https://example.com\n"
                    "[2] Title — https://example.com\n"
                    "Use sections: Executive Summary, Key Financials, Segment Performance, Guidance & Outlook, "
                    "Risks, and Sources. Write in full paragraphs (not a brief outline). "
                    "If evidence is insufficient, explicitly state limitations.\n\n"
                    f"User request: {user_request}\n\nResearch notes (verify with fresh searches):\n{notes_block}"
                )
                final_contents = [types.Content(role="user", parts=[types.Part.from_text(text=final_prompt)])]
            else:
                final_contents = contents

            # Stream the main text response
            response_stream = self.client.models.generate_content_stream(
                model=self.flash_model,
                contents=final_contents,
                config=config
            )

            source_set = set()
            full_response_text = ""
            last_grounding = None
            for chunk in response_stream:
                for url in _extract_grounding_urls(chunk):
                    source_set.add(url)
                for url in _extract_urls(chunk):
                    source_set.add(url)
                gm = _extract_grounding_metadata(chunk)
                if gm:
                    last_grounding = gm
                if chunk.text:
                    full_response_text += chunk.text
                    yield json.dumps({"type": "token", "content": chunk.text}) + "\n"
                if chunk.function_calls:
                     for fc in chunk.function_calls:
                         if fc.name == "google_search":
                            query = fc.args.get("query", "Unknown query")
                            yield json.dumps({"type": "log", "content": f"Searching for: {query}"}) + "\n"
            
            cited_text = full_response_text
            sources_list: list[str] = []

            if last_grounding:
                chunk_urls, supports = _parse_grounding(last_grounding)
                resolved = await _resolve_redirects([u for u in chunk_urls if u])
                # put resolved urls back in the same order
                resolved_iter = iter(resolved)
                normalized_chunk_urls = []
                for url in chunk_urls:
                    if url:
                        resolved_url = _clean_url(next(resolved_iter))
                        if resolved_url and _is_redirect(resolved_url):
                            resolved_url = None
                        normalized_chunk_urls.append(resolved_url)
                    else:
                        normalized_chunk_urls.append(None)
                sources_list, index_map = _build_source_map(normalized_chunk_urls)
                cited_text = _insert_citations(full_response_text, supports, index_map)

            if not sources_list and source_set:
                sources_list = _filter_sources(sorted(source_set))

            if not sources_list and pre_source_set:
                sources_list = _filter_sources(sorted(pre_source_set))

            if sources_list:
                sources_list = _filter_sources(sources_list)

            should_regen = (
                _needs_regen(full_response_text)
                or (is_deep and (len(sources_list) < 3 or _looks_like_outline(full_response_text)))
                or (is_deep and len(full_response_text.split()) < 600)
            )

            if should_regen:
                yield json.dumps({"type": "status", "content": "Deep research mode: refining report..."}) + "\n"
                notes_suffix = ""
                if research_notes:
                    notes_block = "\n\n".join(research_notes)
                    if len(notes_block) > 8000:
                        notes_block = notes_block[:8000] + "\n\n[Notes truncated]"
                    notes_suffix = f"\n\nResearch notes (verify with fresh searches):\n{notes_block}"
                regen_prompt = (
                    "Write the final deep research report now. Do NOT ask the user to search or gather "
                    "information. Use Google Search tool calls as needed. Provide a complete report with "
                    "inline citations like [1]. The Sources section MUST be formatted as:\n"
                    "[1] Title — https://example.com\n"
                    "[2] Title — https://example.com\n"
                    "Use sections: Executive Summary, Key Financials, Segment Performance, Guidance & Outlook, "
                    "Risks, and Sources. Write in full paragraphs (not a brief outline).\n\n"
                    f"User request: {user_request}{notes_suffix}"
                )
                regen_contents = [
                    types.Content(role="user", parts=[types.Part.from_text(text=regen_prompt)])
                ]
                regen_stream = self.client.models.generate_content_stream(
                    model=self.flash_model,
                    contents=regen_contents,
                    config=config
                )

                regen_source_set = set()
                regen_text = ""
                regen_grounding = None
                for chunk in regen_stream:
                    for url in _extract_grounding_urls(chunk):
                        regen_source_set.add(url)
                    for url in _extract_urls(chunk):
                        regen_source_set.add(url)
                    gm = _extract_grounding_metadata(chunk)
                    if gm:
                        regen_grounding = gm
                    if chunk.text:
                        regen_text += chunk.text

                cited_text = regen_text
                sources_list = []

                if regen_grounding:
                    chunk_urls, supports = _parse_grounding(regen_grounding)
                    resolved = await _resolve_redirects([u for u in chunk_urls if u])
                    resolved_iter = iter(resolved)
                    normalized_chunk_urls = []
                    for url in chunk_urls:
                        if url:
                            resolved_url = _clean_url(next(resolved_iter))
                            if resolved_url and _is_redirect(resolved_url):
                                resolved_url = None
                            normalized_chunk_urls.append(resolved_url)
                        else:
                            normalized_chunk_urls.append(None)
                    sources_list, index_map = _build_source_map(normalized_chunk_urls)
                    cited_text = _insert_citations(regen_text, supports, index_map)

                if not sources_list and regen_source_set:
                    sources_list = _filter_sources(sorted(regen_source_set))

                if sources_list:
                    sources_list = _filter_sources(sources_list)

                if not sources_list:
                    source_lines = _extract_sources_block(cited_text)
                    if source_lines:
                        repaired = await _repair_sources(source_lines, user_request)
                        sources_list = [item.get("url") for item in repaired if item.get("url")]
                        if sources_list:
                            cited_text = re.sub(r"\n(?:#{1,3}\s*)?Sources\s*\n[\s\S]*$", "", cited_text, flags=re.IGNORECASE).strip() + "\n\nSources\n" + "\n".join(
                                [f"[{i+1}] {item.get('title','Source')} — {item.get('url')}" for i, item in enumerate(repaired) if item.get("url")]
                            )

            yield json.dumps({
                "type": "final",
                "content": cited_text,
                "sources": sources_list
            }) + "\n"

        except Exception as e:
            yield json.dumps({"type": "error", "content": str(e)}) + "\n"

scholar = ScholarAgent()
