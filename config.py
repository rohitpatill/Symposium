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

import os
from pathlib import Path

# Orchestration
AGENTS_DIR_PATH = Path(os.path.dirname(os.path.abspath(__file__))) / "agents"
AGENTS = [d.name for d in AGENTS_DIR_PATH.iterdir() if d.is_dir()]
MAX_TURNS = 20
CONSECUTIVE_HOLDS_TO_STOP = 2
MAX_POST_CONSENSUS_TURNS = 3
STALENESS_THRESHOLD = 2

# Floor selection: pick the highest effective urgency. Random tie-break only on exact ties.
# No fuzzy threshold — scales correctly for any number of agents.

# Per-agent thought history (Option A): how many of this agent's last inner thoughts to
# surface each turn — they only ever see their OWN, never others'.
MAX_THOUGHT_HISTORY = 2

DECISION_MAX_TOKENS = 200
RESPONSE_MAX_TOKENS = 500
ALL_HOLD_TERMINATION = 2

# ---------------------------------------------------------------------------
# Consecutive-Speaker Penalty
# ---------------------------------------------------------------------------
# Models real-group social pressure: dominant speakers face increasing pressure
# to yield the floor. The penalty multiplies the agent's RAW urgency to compute
# their EFFECTIVE urgency, which is what's used for floor selection.
#
# The agent's self-reported urgency is never modified — penalty is applied
# externally during floor selection. LLMs never see urgency at all.
#
# Multipliers indexed by consecutive_wins_immediately_before_this_turn:
#   0 → no penalty (multiplier 1.0)
#   1 → just won last turn (multiplier 0.85)
#   2 → won last 2 turns in a row (multiplier 0.65)
#   3+ → won 3+ in a row (multiplier 0.40, heavy penalty)
# ---------------------------------------------------------------------------
CONSECUTIVE_SPEAKER_PENALTY = True
CONSECUTIVE_PENALTY_MULTIPLIERS = {
    0: 1.00,
    1: 0.85,
    2: 0.65,
    3: 0.40,
}

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AGENTS_DIR = os.path.join(BASE_DIR, "agents")
SHARED_DIR = os.path.join(BASE_DIR, "shared")
RUNS_DIR = os.path.join(BASE_DIR, "runs")
