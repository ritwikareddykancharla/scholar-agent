import json
import os
import sys

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

# --- Fix Import Paths ---
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from researcher import scholar, ChatRequest

app = FastAPI(title="Scholar Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    try:
        return StreamingResponse(
            scholar.chat_stream(request), 
            media_type="application/x-ndjson"
        )
    except Exception as e:
        print(f"Error: {e}")
        return StreamingResponse(
            iter([json.dumps({"type": "error", "content": str(e)}) + "\n"]),
            media_type="application/x-ndjson"
        )

# --- Serve Frontend ---
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")

if os.path.exists(frontend_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_path, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api/"):
             raise HTTPException(status_code=404, detail="API endpoint not found")
        return FileResponse(os.path.join(frontend_path, "index.html"))
else:
    @app.get("/")
    async def root():
        return {"message": "Scholar Backend running. Frontend not found."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
