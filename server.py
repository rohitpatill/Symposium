from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
from datetime import datetime
import asyncio

import config
from src.orchestrator import Orchestrator
import src.flow_logger as fl

app = FastAPI()

# Enable CORS for the Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global orchestrator instance
global_orchestrator = None

@app.post("/api/reset")
async def reset_simulation():
    global global_orchestrator
    
    if not config.API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set in .env")

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    run_dir = Path(config.RUNS_DIR) / timestamp
    run_dir.mkdir(parents=True, exist_ok=True)

    fl.init(timestamp)
    fl.step("api: run started")

    global_orchestrator = Orchestrator(run_dir)
    await global_orchestrator.bootstrap()
    
    return {"status": "ok", "message": "Simulation reset and bootstrapped."}

@app.post("/api/turn")
async def advance_turn():
    global global_orchestrator
    if global_orchestrator is None:
        raise HTTPException(status_code=400, detail="Simulation not started. Call /api/reset first.")
        
    result = await global_orchestrator.run_turn()
    
    # Add timestamp to match frontend Turn interface
    turn_data = result["data"]
    turn_data["timestamp"] = int(datetime.now().timestamp() * 1000)
    
    return {
        "status": "ok",
        "continue": result["continue"],
        "data": turn_data
    }

import re

# predefined vibrant colors for dynamic agents
AGENT_COLORS = [
    {"themeColor": "#E76F51", "bgColor": "rgba(231, 111, 81, 0.1)", "ringColor": "rgba(231, 111, 81, 0.4)"},  # warm coral
    {"themeColor": "#2A9D8F", "bgColor": "rgba(42, 157, 143, 0.1)", "ringColor": "rgba(42, 157, 143, 0.4)"},  # teal
    {"themeColor": "#E9C46A", "bgColor": "rgba(233, 196, 106, 0.1)", "ringColor": "rgba(233, 196, 106, 0.4)"},  # golden
    {"themeColor": "#264653", "bgColor": "rgba(38, 70, 83, 0.1)", "ringColor": "rgba(38, 70, 83, 0.4)"},  # deep blue
    {"themeColor": "#F4A261", "bgColor": "rgba(244, 162, 97, 0.1)", "ringColor": "rgba(244, 162, 97, 0.4)"},  # sandy orange
    {"themeColor": "#9D4EDD", "bgColor": "rgba(157, 78, 221, 0.1)", "ringColor": "rgba(157, 78, 221, 0.4)"},  # purple
]

@app.get("/api/config")
async def get_config():
    agents_data = {}
    
    # Parse agents
    for idx, agent_id in enumerate(config.AGENTS):
        identity_path = Path(config.AGENTS_DIR) / agent_id / "identity.md"
        name = agent_id.capitalize()
        role = "Agent"
        
        if identity_path.exists():
            content = identity_path.read_text(encoding="utf-8")
            
            # Extract Name
            name_match = re.search(r"\*\*Name:\*\*\s*(.+)", content)
            if name_match:
                name = name_match.group(1).strip()
                
            # Extract Personality/Role
            role_match = re.search(r"\*\*Core Personality:\*\*\s*(.+)", content)
            if role_match:
                role = role_match.group(1).strip()
                # truncate if too long
                if len(role) > 30:
                    role = role[:27] + "..."
                    
        # Assign color from palette
        color_info = AGENT_COLORS[idx % len(AGENT_COLORS)]
        
        agents_data[agent_id] = {
            "id": agent_id,
            "name": name,
            "role": role,
            "initials": name[:2].upper(),
            "emoji": "👤",  # Default emoji
            "themeColor": color_info["themeColor"],
            "bgColor": color_info["bgColor"],
            "ringColor": color_info["ringColor"],
        }
        
    # Read kickoff
    kickoff_text = ""
    kickoff_path = Path(config.SHARED_DIR) / "kickoff.md"
    if kickoff_path.exists():
        kickoff_text = kickoff_path.read_text(encoding="utf-8").strip()
        
    return {
        "status": "ok",
        "agents": agents_data,
        "kickoff": kickoff_text
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
