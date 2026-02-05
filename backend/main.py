from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .researcher import scholar, ResearchRequest, ResearchReport

app = FastAPI(title="Scholar Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Scholar Agent Backend is running"}

@app.post("/api/research", response_model=ResearchReport)
async def research(request: ResearchRequest):
    try:
        result = await scholar.conduct_research(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
