import os

# API Configuration
MODEL = "gpt-4o-mini"

# Load API key from .env file directly
try:
    with open('.env', encoding='utf-8') as f:
        _env_line = f.read().split('=')[1].strip()
        # Normalize to ASCII (replace Unicode dashes with regular hyphens)
        API_KEY = _env_line.replace('\u2011', '-').replace('\u2010', '-').replace('\u2212', '-')
except:
    API_KEY = os.getenv("OPENAI_API_KEY")

API_URL = "https://api.openai.com/v1/responses"

# Orchestration
AGENTS = ["aarav", "priya", "kabir"]
MAX_TURNS = 20
CONSECUTIVE_HOLDS_TO_STOP = 2
MAX_POST_CONSENSUS_TURNS = 3
STALENESS_THRESHOLD = 2

# Run 4 additions
URGENCY_TIE_THRESHOLD = 0.3
MAX_HELD_THOUGHTS = 2
DECISION_MAX_TOKENS = 150
RESPONSE_MAX_TOKENS = 500
ALL_HOLD_TERMINATION = 2

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AGENTS_DIR = os.path.join(BASE_DIR, "agents")
SHARED_DIR = os.path.join(BASE_DIR, "shared")
RUNS_DIR = os.path.join(BASE_DIR, "runs")
