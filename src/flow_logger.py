import os
import json
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
LOGS_DIR = BASE_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)

_log_file = None


def init(run_timestamp: str):
    global _log_file
    _log_file = LOGS_DIR / f"flow_{run_timestamp}.log"
    _write(f"=== FLOW LOG: {run_timestamp} ===\n")


def _write(msg: str):
    ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    line = f"[{ts}] {msg}"
    print(line)
    if _log_file:
        with open(_log_file, "a", encoding="utf-8") as f:
            f.write(line + "\n")


def step(label: str):
    _write(f"STEP  | {label}")


def info(label: str, data=None):
    if data is not None:
        if isinstance(data, (dict, list)):
            _write(f"INFO  | {label}: {json.dumps(data, ensure_ascii=False)}")
        else:
            _write(f"INFO  | {label}: {data}")
    else:
        _write(f"INFO  | {label}")


def ok(label: str):
    _write(f"OK    | {label}")


def warn(label: str):
    _write(f"WARN  | {label}")


def error(label: str, exc=None):
    _write(f"ERROR | {label}")
    if exc:
        _write(f"ERROR | {type(exc).__name__}: {exc}")


def decision(turn: int, name: str, decision: str, urgency: float = 0, inner_thought: str = ""):
    if decision == "SPEAK":
        _write(f"DEC   | turn={turn} agent={name} SPEAK urgency={urgency:.2f} thought={inner_thought!r}")
    else:
        _write(f"DEC   | turn={turn} agent={name} HOLD thought={inner_thought!r}")


def floor(turn: int, winner: str, urgency: float, all_speakers: list):
    _write(f"FLOOR | turn={turn} winner={winner} urgency={urgency:.2f} competed={all_speakers}")


def message(turn: int, speaker: str, text: str):
    _write(f"MSG   | turn={turn} {speaker}: {text[:120]}")


def held(turn: int, agent: str, reason: str):
    _write(f"HELD  | turn={turn} {agent} stores held thought: {reason!r}")


def transcript_state(shared_transcript: list):
    _write(f"TRANS | shared_transcript has {len(shared_transcript)} entries")
    for e in shared_transcript[-3:]:
        _write(f"TRANS |   turn={e['turn']} speaker={e['speaker']} msg={str(e['message'])[:60]}")


def agent_messages_state(name: str, messages: list):
    _write(f"MSGS  | {name} has {len(messages)} messages in array")
    for i, m in enumerate(messages[-4:]):
        role = m.get("role", "?")
        content = str(m.get("content", ""))[:80]
        _write(f"MSGS  |   [{len(messages)-4+i}] role={role} content={content!r}")
