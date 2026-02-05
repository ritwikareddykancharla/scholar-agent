from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import sys

# --- Fix Import Paths ---
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from researcher import scholar, ChatRequest, ChatResponse

app = FastAPI(title="Scholar Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    try:
        result = await scholar.chat(request)
        return result
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Serve Frontend ---
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")

# SELF-HEALING: Build frontend if missing
if not os.path.exists(frontend_path):
    print(f"⚠️ Frontend build not found at: {frontend_path}")
    print("🚀 Starting self-build of frontend...")
    import subprocess
    frontend_src = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
    
    if os.path.exists(frontend_src):
        try:
            subprocess.run(["npm", "install"], cwd=frontend_src, check=True)
            subprocess.run(["npm", "run", "build"], cwd=frontend_src, check=True)
            print("✅ Frontend build completed successfully!")
        except Exception as e:
            print(f"❌ Frontend build failed: {e}")

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
        return {"message": "Scholar Backend running. Frontend build failed. Check logs."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
