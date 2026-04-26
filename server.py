from datetime import datetime
from pathlib import Path
import re

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import config
import src.flow_logger as fl
from db import (
    decrypt_secret,
    dumps,
    encrypt_secret,
    get_conn,
    init_db,
    loads,
    parse_markdown_sections,
    row_to_dict,
    rows_to_dicts,
    slugify,
)
from src.orchestrator import Orchestrator
from src.providers import PROVIDER_CATALOG, get_provider, ProviderError


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

global_orchestrator = None


AGENT_COLORS = [
    {"themeColor": "#E76F51", "bgColor": "rgba(231, 111, 81, 0.1)", "ringColor": "rgba(231, 111, 81, 0.4)"},
    {"themeColor": "#2A9D8F", "bgColor": "rgba(42, 157, 143, 0.1)", "ringColor": "rgba(42, 157, 143, 0.4)"},
    {"themeColor": "#E9C46A", "bgColor": "rgba(233, 196, 106, 0.1)", "ringColor": "rgba(233, 196, 106, 0.4)"},
    {"themeColor": "#264653", "bgColor": "rgba(38, 70, 83, 0.1)", "ringColor": "rgba(38, 70, 83, 0.4)"},
    {"themeColor": "#F4A261", "bgColor": "rgba(244, 162, 97, 0.1)", "ringColor": "rgba(244, 162, 97, 0.4)"},
    {"themeColor": "#9D4EDD", "bgColor": "rgba(157, 78, 221, 0.1)", "ringColor": "rgba(157, 78, 221, 0.4)"},
]


class AgentMemoryIn(BaseModel):
    type: str = "personal"
    target_agent_slug: str | None = None
    title: str = ""
    content: str = ""


class AgentIn(BaseModel):
    display_name: str
    provider_config_id: int | None = None
    provider_type: str = "openai"
    model_id: str = ""
    role: str = ""
    core_personality: str = ""
    talkativeness: float = Field(default=0.5, ge=0.0, le=1.0)
    speech_style: str = ""
    private_goal: str = ""
    values_text: str = ""
    handling_defeat: str = ""
    urgency_tendency: str = ""
    extra_notes: str = ""
    personal_memory: str = ""
    memories: list[AgentMemoryIn] = Field(default_factory=list)
    personas: dict[str, str] = Field(default_factory=dict)


class GroupMemoryIn(BaseModel):
    title: str = ""
    content: str
    participant_slugs: list[str] = Field(default_factory=list)
    is_general: bool = False


class TeamCreateIn(BaseModel):
    name: str
    description: str = ""
    agents: list[AgentIn]
    group_memories: list[GroupMemoryIn] = Field(default_factory=list)
    scenario_template: str = ""


class TeamUpdateIn(TeamCreateIn):
    pass


class AgentQuickUpdateIn(BaseModel):
    display_name: str = Field(min_length=1)
    provider_config_id: int
    model_id: str = Field(min_length=1)
    role: str = ""
    core_personality: str = ""
    talkativeness: float = Field(default=0.5, ge=0.0, le=1.0)


class ScenarioTemplateUpdateIn(BaseModel):
    scenario_template: str = ""


class ConversationCreateIn(BaseModel):
    title: str
    participant_slugs: list[str]
    scenario_prompt: str
    max_turns: int = Field(default=config.MAX_TURNS, ge=1, le=100)
    all_hold_termination: int = Field(default=config.ALL_HOLD_TERMINATION, ge=1, le=20)
    consecutive_speaker_penalty: bool = config.CONSECUTIVE_SPEAKER_PENALTY
    penalty_multiplier_1: float = Field(default=config.CONSECUTIVE_PENALTY_MULTIPLIERS[1], ge=0.0, le=1.0)
    penalty_multiplier_2: float = Field(default=config.CONSECUTIVE_PENALTY_MULTIPLIERS[2], ge=0.0, le=1.0)
    penalty_multiplier_3: float = Field(default=config.CONSECUTIVE_PENALTY_MULTIPLIERS[3], ge=0.0, le=1.0)


class ProviderConfigCreateIn(BaseModel):
    provider_type: str
    api_key: str


def timestamp_slug() -> str:
    return datetime.now().strftime("%Y-%m-%d_%H-%M-%S")


def build_agent_meta(agent_id: str, name: str, role: str, idx: int, provider_type: str | None = None, model_id: str | None = None) -> dict:
    color_info = AGENT_COLORS[idx % len(AGENT_COLORS)]
    return {
        "id": agent_id,
        "name": name,
        "role": role if len(role) <= 30 else role[:27] + "...",
        "providerType": provider_type,
        "modelId": model_id,
        "initials": name[:2].upper(),
        "emoji": "👤",
        **color_info,
    }


def default_model_for_provider(provider_type: str) -> str:
    catalog = PROVIDER_CATALOG.get(provider_type, {})
    models = catalog.get("models", [])
    return models[0]["model_id"] if models else ""


def default_runtime_provider() -> tuple[str, str, str]:
    if config.OPENAI_API_KEY:
        return ("openai", "gpt-4o-mini", config.OPENAI_API_KEY)
    if config.GEMINI_API_KEY:
        return ("gemini", "gemini-3.1-flash-lite-preview", config.GEMINI_API_KEY)
    return ("openai", "gpt-4o-mini", "")


def validated_provider_count(conn) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS count FROM llm_provider_configs WHERE is_valid = 1"
    ).fetchone()
    return int(row["count"]) if row else 0


def validate_agent_provider_assignments(conn, agents: list[AgentIn]) -> None:
    valid_provider_ids = {
        row["id"]
        for row in conn.execute("SELECT id FROM llm_provider_configs WHERE is_valid = 1").fetchall()
    }
    for agent in agents:
        if not agent.provider_config_id:
            raise HTTPException(status_code=400, detail=f"Select a provider for {agent.display_name}.")
        if agent.provider_config_id not in valid_provider_ids:
            raise HTTPException(status_code=400, detail=f"{agent.display_name} is using an invalid or missing provider configuration.")
        if not agent.model_id.strip():
            raise HTTPException(status_code=400, detail=f"Select a model for {agent.display_name}.")


def provider_type_for_agent(conn, provider_config_id: int | None) -> str:
    if not provider_config_id:
        return config.DEFAULT_PROVIDER
    row = conn.execute(
        "SELECT provider_type FROM llm_provider_configs WHERE id = ?",
        (provider_config_id,),
    ).fetchone()
    return row["provider_type"] if row else config.DEFAULT_PROVIDER


def parse_identity_markdown(content: str, fallback_name: str) -> dict:
    def match(label: str) -> str:
        m = re.search(rf"\*\*{re.escape(label)}:\*\*\s*(.+)", content)
        return m.group(1).strip() if m else ""

    sections = parse_markdown_sections(content)
    return {
        "display_name": match("Name") or fallback_name,
        "role": match("Role"),
        "core_personality": match("Core Personality"),
        "talkativeness": float(re.search(r"\*\*Talkativeness:\*\*\s*([0-9.]+)", content).group(1)) if re.search(r"\*\*Talkativeness:\*\*\s*([0-9.]+)", content) else 0.5,
        "speech_style": match("Speech Style"),
        "private_goal": match("Private Goal for This Conversation"),
        "values_text": match("What You Value"),
        "handling_defeat": sections.get("Handling Defeat", ""),
        "urgency_tendency": sections.get("Urgency Tendency", ""),
        "extra_notes": "",
    }


def build_identity_markdown(agent: dict) -> str:
    parts = [
        f"# {agent['display_name']} - Identity",
        "",
        f"**Name:** {agent['display_name']}",
        f"**Role:** {agent['role']}",
        f"**Core Personality:** {agent['core_personality']}",
        "",
        f"**Talkativeness:** {agent['talkativeness']:.2f}",
        f"**Speech Style:** {agent['speech_style']}",
        "",
        f"**Private Goal for This Conversation:** {agent['private_goal']}",
        "",
        f"**What You Value:** {agent['values_text']}",
        "",
        "## Handling Defeat",
        agent["handling_defeat"],
        "",
        "## Urgency Tendency",
        agent["urgency_tendency"],
    ]
    if agent.get("extra_notes"):
        parts.extend(["", "## Extra Notes", agent["extra_notes"]])
    return "\n".join(parts).strip() + "\n"


def build_memory_markdown(personal_memory: str, relational_memories: list[dict], slug_to_name: dict[str, str]) -> str:
    parts = ["# Personal Memories", "", personal_memory.strip() or "- None recorded yet."]
    if relational_memories:
        parts.extend(["", "## Relationship Memories", ""])
        for memory in relational_memories:
            target_name = slug_to_name.get(memory["target_agent_slug"] or "", "Shared")
            title = memory["title"] or target_name
            parts.append(f"### {title}")
            parts.append(memory["content"].strip() or "-")
            parts.append("")
    return "\n".join(parts).strip() + "\n"


def build_personas_markdown(personas: dict[str, str], slug_to_name: dict[str, str]) -> str:
    parts = ["# How You See Others", ""]
    for slug, content in personas.items():
        parts.append(f"## {slug_to_name.get(slug, slug)}")
        parts.append(content.strip() or "No strong opinion recorded yet.")
        parts.append("")
    return "\n".join(parts).strip() + "\n"


def build_group_memory_markdown(memories: list[dict], visible_slugs: set[str], slug_to_name: dict[str, str]) -> str:
    if not memories:
        return ""
    parts = ["# Shared Group Memories", ""]
    for memory in memories:
        members = set(memory["participant_slugs"])
        if not memory["is_general"] and not (visible_slugs & members):
            continue
        title = memory["title"] or ("Everyone" if memory["is_general"] else ", ".join(slug_to_name[s] for s in memory["participant_slugs"]))
        parts.append(f"## {title}")
        parts.append(memory["content"].strip())
        parts.append("")
    return "\n".join(parts).strip() + "\n"


def read_protocol() -> str:
    return (Path(config.SHARED_DIR) / "protocol.md").read_text(encoding="utf-8")


def persist_managed_turn(conversation_id: int, result: dict) -> None:
    turn = result["data"]
    with get_conn() as conn:
        participants = rows_to_dicts(conn.execute(
            "SELECT id, slug, display_name FROM conversation_participants WHERE conversation_id = ? ORDER BY sort_order",
            (conversation_id,),
        ).fetchall())
        participant_by_slug = {row["slug"]: row for row in participants}
        winner_row = participant_by_slug.get(turn["winner"]) if turn["winner"] else None
        conn.execute(
            """
            INSERT OR REPLACE INTO conversation_turns
            (conversation_id, turn_number, winner_participant_id, spoken_message, all_hold)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                conversation_id,
                turn["turn"],
                winner_row["id"] if winner_row else None,
                turn["message"],
                1 if turn["winner"] is None else 0,
            ),
        )
        turn_id = conn.execute(
            "SELECT id FROM conversation_turns WHERE conversation_id = ? AND turn_number = ?",
            (conversation_id, turn["turn"]),
        ).fetchone()["id"]
        for slug, decision in turn["decisions"].items():
            participant = participant_by_slug[slug]
            conn.execute(
                """
                INSERT INTO conversation_decisions
                (conversation_turn_id, participant_id, decision, urgency, effective_urgency,
                 penalty_multiplier, penalty_delta, penalty_reason, consecutive_wins_before,
                 inner_thought, raw_output, usage_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    turn_id,
                    participant["id"],
                    decision.get("decision", "HOLD"),
                    decision.get("urgency", 0),
                    decision.get("effective_urgency", 0),
                    decision.get("penalty_multiplier", 1),
                    decision.get("penalty_delta", 0),
                    decision.get("penalty_reason", ""),
                    decision.get("consecutive_wins_before", 0),
                    decision.get("inner_thought", ""),
                    decision.get("raw_output", ""),
                    dumps(decision.get("usage", {})),
                ),
            )
        if turn["turn"] == 1:
            scenario = conn.execute("SELECT scenario_prompt FROM conversations WHERE id = ?", (conversation_id,)).fetchone()["scenario_prompt"]
            conn.execute(
                """
                INSERT INTO conversation_messages
                (conversation_id, turn_number, speaker_type, participant_id, speaker_name, message_text)
                VALUES (?, 0, 'narrator', NULL, 'Narrator', ?)
                """,
                (conversation_id, scenario),
            )
        if turn["winner"] and turn["message"]:
            conn.execute(
                """
                INSERT INTO conversation_messages
                (conversation_id, turn_number, speaker_type, participant_id, speaker_name, message_text)
                VALUES (?, ?, 'agent', ?, ?, ?)
                """,
                (
                    conversation_id,
                    turn["turn"],
                    winner_row["id"],
                    winner_row["display_name"],
                    turn["message"],
                ),
            )


def persist_conversation_state(conversation_id: int, orchestrator: Orchestrator, status: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE conversations SET state_json = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (dumps(orchestrator.serialize_state()), status, conversation_id),
        )


def runtime_settings_from_payload(payload: ConversationCreateIn) -> dict:
    return {
        "max_turns": payload.max_turns,
        "all_hold_termination": payload.all_hold_termination,
        "consecutive_speaker_penalty": payload.consecutive_speaker_penalty,
        "consecutive_penalty_multipliers": {
            0: 1.0,
            1: payload.penalty_multiplier_1,
            2: payload.penalty_multiplier_2,
            3: payload.penalty_multiplier_3,
        },
    }


def build_managed_simulation(conversation_id: int) -> dict:
    with get_conn() as conn:
        convo = row_to_dict(conn.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone())
        if not convo:
            raise HTTPException(status_code=404, detail="Conversation not found")
        participants = rows_to_dicts(conn.execute(
            "SELECT * FROM conversation_participants WHERE conversation_id = ? ORDER BY sort_order",
            (conversation_id,),
        ).fetchall())
        provider_configs = rows_to_dicts(conn.execute("SELECT * FROM llm_provider_configs").fetchall())
        group_memories = rows_to_dicts(conn.execute(
            "SELECT * FROM conversation_group_memories WHERE conversation_id = ?",
            (conversation_id,),
        ).fetchall())
        member_rows = rows_to_dicts(conn.execute(
            """
            SELECT cgm.id AS group_id, cp.slug
            FROM conversation_group_memory_members cgm_members
            JOIN conversation_group_memories cgm ON cgm.id = cgm_members.group_memory_id
            JOIN conversation_participants cp ON cp.id = cgm_members.participant_id
            WHERE cgm.conversation_id = ?
            """,
            (conversation_id,),
        ).fetchall())
    member_map: dict[int, list[str]] = {}
    for row in member_rows:
        member_map.setdefault(row["group_id"], []).append(row["slug"])
    normalized_memories = []
    for memory in group_memories:
        normalized_memories.append({
            "title": memory["title"],
            "content": memory["content"],
            "is_general": bool(memory["is_general"]),
            "participant_slugs": member_map.get(memory["id"], []),
        })
    slug_to_name = {participant["slug"]: participant["display_name"] for participant in participants}
    provider_by_id = {provider["id"]: provider for provider in provider_configs}
    default_provider, default_model, default_api_key = default_runtime_provider()
    agents = []
    for participant in participants:
        provider_row = provider_by_id.get(participant.get("provider_config_id"))
        provider_type = participant.get("provider_type") or default_provider
        agents.append({
            "id": participant["slug"],
            "provider_type": provider_type,
            "model_id": participant.get("model_id") or default_model_for_provider(provider_type) or default_model,
            "api_key": decrypt_secret(provider_row["api_key_ciphertext"]) if provider_row and provider_row.get("api_key_ciphertext") else default_api_key,
            "identity": participant["identity_md"],
            "memory": participant["memory_md"],
            "personas": participant["personas_md"],
            "group_memories": build_group_memory_markdown(normalized_memories, {participant["slug"]}, slug_to_name),
        })
    return {
        "agents": agents,
        "protocol": read_protocol(),
        "kickoff": convo["scenario_prompt"],
        "state": loads(convo["state_json"], {}),
        "settings": loads(convo.get("settings_json"), {}),
    }


def team_summary(team_id: int) -> dict:
    with get_conn() as conn:
        team = row_to_dict(conn.execute("SELECT * FROM teams WHERE id = ?", (team_id,)).fetchone())
        agents = rows_to_dicts(conn.execute(
            """
            SELECT ta.id, ta.slug, ta.display_name, ta.provider_config_id, COALESCE(lp.provider_type, 'openai') AS provider_type,
                   ta.model_id, ta.role, ta.core_personality, ta.talkativeness, ta.speech_style,
                   ta.private_goal, ta.values_text, ta.handling_defeat, ta.urgency_tendency, ta.extra_notes, ta.sort_order
            FROM team_agents ta
            LEFT JOIN llm_provider_configs lp ON lp.id = ta.provider_config_id
            WHERE ta.team_id = ?
            ORDER BY ta.sort_order
            """,
            (team_id,),
        ).fetchall())
        agent_id_to_slug = {agent["id"]: agent["slug"] for agent in agents}
        memories = rows_to_dicts(conn.execute(
            """
            SELECT tam.team_agent_id, tam.memory_type, tam.title, tam.content, target.slug AS target_agent_slug, tam.sort_order
            FROM team_agent_memories tam
            LEFT JOIN team_agents target ON target.id = tam.target_agent_id
            WHERE tam.team_agent_id IN (
                SELECT id FROM team_agents WHERE team_id = ?
            )
            ORDER BY tam.team_agent_id, tam.sort_order
            """,
            (team_id,),
        ).fetchall())
        personas = rows_to_dicts(conn.execute(
            """
            SELECT sap.source_agent_id, target.slug AS target_agent_slug, sap.content
            FROM team_agent_personas sap
            JOIN team_agents source ON source.id = sap.source_agent_id
            JOIN team_agents target ON target.id = sap.target_agent_id
            WHERE source.team_id = ?
            """,
            (team_id,),
        ).fetchall())
        group_memories = rows_to_dicts(conn.execute(
            "SELECT id, title, content, is_general FROM team_group_memories WHERE team_id = ? ORDER BY id",
            (team_id,),
        ).fetchall())
        group_memory_members = rows_to_dicts(conn.execute(
            """
            SELECT tgmm.group_memory_id, ta.slug
            FROM team_group_memory_members tgmm
            JOIN team_agents ta ON ta.id = tgmm.team_agent_id
            WHERE ta.team_id = ?
            ORDER BY tgmm.group_memory_id, ta.sort_order
            """,
            (team_id,),
        ).fetchall())
        conversations = rows_to_dicts(conn.execute(
            "SELECT id, title, status, created_at, updated_at FROM conversations WHERE team_id = ? ORDER BY updated_at DESC",
            (team_id,),
        ).fetchall())
        scenario = conn.execute(
            "SELECT scenario_prompt FROM conversations WHERE team_id = ? AND status = 'template' ORDER BY id DESC LIMIT 1",
            (team_id,),
        ).fetchone()
    memory_map: dict[int, list[dict]] = {}
    personal_memory_map: dict[int, str] = {}
    for memory in memories:
        if memory["memory_type"] == "personal":
            personal_memory_map[memory["team_agent_id"]] = memory["content"]
        else:
            memory_map.setdefault(memory["team_agent_id"], []).append({
                "type": memory["memory_type"],
                "target_agent_slug": memory["target_agent_slug"],
                "title": memory["title"],
                "content": memory["content"],
            })
    persona_map: dict[int, dict[str, str]] = {}
    for persona in personas:
        persona_map.setdefault(persona["source_agent_id"], {})[persona["target_agent_slug"]] = persona["content"]
    group_member_map: dict[int, list[str]] = {}
    for member in group_memory_members:
        group_member_map.setdefault(member["group_memory_id"], []).append(member["slug"])
    for agent in agents:
        agent["personal_memory"] = personal_memory_map.get(agent["id"], "")
        agent["memories"] = memory_map.get(agent["id"], [])
        agent["personas"] = persona_map.get(agent["id"], {})
    normalized_group_memories = [
        {
            "title": memory["title"],
            "content": memory["content"],
            "participant_slugs": group_member_map.get(memory["id"], []),
            "is_general": bool(memory["is_general"]),
        }
        for memory in group_memories
    ]
    return {
        "team": team,
        "agents": agents,
        "conversations": conversations,
        "scenarioTemplate": scenario["scenario_prompt"] if scenario else "",
        "groupMemories": normalized_group_memories,
    }


def delete_conversations_for_agent(conn, team_id: int, agent_id: int) -> None:
    conversation_ids = [
        row["conversation_id"]
        for row in conn.execute(
            """
            SELECT conversation_id
            FROM conversation_participants
            WHERE team_agent_id = ?
            """,
            (agent_id,),
        ).fetchall()
    ]
    if conversation_ids:
        placeholders = ",".join("?" for _ in conversation_ids)
        conn.execute(f"DELETE FROM conversations WHERE id IN ({placeholders})", tuple(conversation_ids))


def rebuild_team_relationships(conn, team_id: int) -> None:
    team_agents = rows_to_dicts(conn.execute(
        "SELECT id, slug, display_name FROM team_agents WHERE team_id = ? ORDER BY sort_order",
        (team_id,),
    ).fetchall())
    valid_ids = {agent["id"] for agent in team_agents}
    conn.execute(
        """
        DELETE FROM team_agent_personas
        WHERE source_agent_id NOT IN (
            SELECT id FROM team_agents WHERE team_id = ?
        )
        OR target_agent_id NOT IN (
            SELECT id FROM team_agents WHERE team_id = ?
        )
        """,
        (team_id, team_id),
    )
    conn.execute(
        """
        DELETE FROM team_agent_memories
        WHERE team_agent_id NOT IN (
            SELECT id FROM team_agents WHERE team_id = ?
        )
        OR (
            target_agent_id IS NOT NULL
            AND target_agent_id NOT IN (
                SELECT id FROM team_agents WHERE team_id = ?
            )
        )
        """,
        (team_id, team_id),
    )
    group_memories = rows_to_dicts(conn.execute(
        "SELECT id, is_general FROM team_group_memories WHERE team_id = ?",
        (team_id,),
    ).fetchall())
    for memory in group_memories:
        conn.execute(
            "DELETE FROM team_group_memory_members WHERE group_memory_id = ? AND team_agent_id NOT IN ({})".format(
                ",".join(str(agent_id) for agent_id in valid_ids) if valid_ids else "NULL"
            ),
            (memory["id"],),
        )
        if not memory["is_general"]:
            count_row = conn.execute(
                "SELECT COUNT(*) AS count FROM team_group_memory_members WHERE group_memory_id = ?",
                (memory["id"],),
            ).fetchone()
            if count_row["count"] < 2:
                conn.execute("DELETE FROM team_group_memories WHERE id = ?", (memory["id"],))


def write_team(team_id: int, payload: TeamCreateIn) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM team_agents WHERE team_id = ?", (team_id,))
        slug_map: dict[str, int] = {}
        requested_slugs: list[str] = []
        for idx, agent in enumerate(payload.agents):
            slug = slugify(agent.display_name)
            if slug in requested_slugs:
                raise HTTPException(status_code=400, detail=f"Duplicate agent name: {agent.display_name}")
            requested_slugs.append(slug)
            cursor = conn.execute(
                """
                INSERT INTO team_agents
                (team_id, slug, display_name, provider_config_id, model_id, role, core_personality, talkativeness, speech_style,
                 private_goal, values_text, handling_defeat, urgency_tendency, extra_notes, sort_order, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    team_id,
                    slug,
                    agent.display_name,
                    agent.provider_config_id,
                    agent.model_id,
                    agent.role,
                    agent.core_personality,
                    agent.talkativeness,
                    agent.speech_style,
                    agent.private_goal,
                    agent.values_text,
                    agent.handling_defeat,
                    agent.urgency_tendency,
                    agent.extra_notes,
                    idx,
                ),
            )
            slug_map[slug] = cursor.lastrowid
        for agent in payload.agents:
            source_slug = slugify(agent.display_name)
            source_id = slug_map[source_slug]
            if agent.personal_memory.strip():
                conn.execute(
                    """
                    INSERT INTO team_agent_memories (team_agent_id, memory_type, title, content, sort_order)
                    VALUES (?, 'personal', 'Personal Memory', ?, 0)
                    """,
                    (source_id, agent.personal_memory.strip()),
                )
            for idx, memory in enumerate(agent.memories, start=1):
                target_id = slug_map.get(memory.target_agent_slug or "")
                conn.execute(
                    """
                    INSERT INTO team_agent_memories
                    (team_agent_id, memory_type, target_agent_id, title, content, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (source_id, memory.type, target_id, memory.title, memory.content, idx),
                )
            for target_slug, content in agent.personas.items():
                if target_slug not in slug_map or not content.strip():
                    continue
                conn.execute(
                    """
                    INSERT INTO team_agent_personas (source_agent_id, target_agent_id, content)
                    VALUES (?, ?, ?)
                    """,
                    (source_id, slug_map[target_slug], content.strip()),
                )
        conn.execute("DELETE FROM team_group_memories WHERE team_id = ?", (team_id,))
        for memory in payload.group_memories:
            cursor = conn.execute(
                """
                INSERT INTO team_group_memories (team_id, title, content, is_general)
                VALUES (?, ?, ?, ?)
                """,
                (team_id, memory.title, memory.content, 1 if memory.is_general else 0),
            )
            memory_id = cursor.lastrowid
            for slug in memory.participant_slugs:
                if slug in slug_map:
                    conn.execute(
                        "INSERT INTO team_group_memory_members (group_memory_id, team_agent_id) VALUES (?, ?)",
                        (memory_id, slug_map[slug]),
                    )
        if payload.scenario_template.strip():
            conn.execute("DELETE FROM conversations WHERE team_id = ? AND status = 'template'", (team_id,))
            conn.execute(
                """
                INSERT INTO conversations (team_id, title, mode, status, scenario_prompt, state_json)
                VALUES (?, 'Scenario Template', 'managed', 'template', ?, '{}')
                """,
                (team_id, payload.scenario_template.strip()),
            )


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.post("/api/reset")
async def reset_simulation():
    global global_orchestrator
    provider_type, model_id, api_key = default_runtime_provider()
    if not api_key:
        raise HTTPException(status_code=500, detail="Set OPENAI_API_KEY or GEMINI_API_KEY in .env before starting default mode.")
    timestamp = timestamp_slug()
    run_dir = Path(config.RUNS_DIR) / timestamp
    run_dir.mkdir(parents=True, exist_ok=True)
    fl.init(timestamp)
    fl.step("api: run started")
    global_orchestrator = Orchestrator(
        run_dir,
        runtime_config={"default_provider_type": provider_type, "default_model_id": model_id, "default_api_key": api_key},
    )
    await global_orchestrator.bootstrap()
    return {"status": "ok", "message": "Simulation reset and bootstrapped."}


@app.post("/api/turn")
async def advance_turn():
    global global_orchestrator
    if global_orchestrator is None:
        raise HTTPException(status_code=400, detail="Simulation not started. Call /api/reset first.")
    result = await global_orchestrator.run_turn()
    result["data"]["timestamp"] = int(datetime.now().timestamp() * 1000)
    return {"status": "ok", "continue": result["continue"], "data": result["data"]}


@app.get("/api/config")
async def get_config():
    agents_data = {}
    provider_type, model_id, _ = default_runtime_provider()
    for idx, agent_id in enumerate(config.AGENTS):
        identity_path = Path(config.AGENTS_DIR) / agent_id / "identity.md"
        name = agent_id.capitalize()
        role = "Agent"
        if identity_path.exists():
            content = identity_path.read_text(encoding="utf-8")
            name_match = re.search(r"\*\*Name:\*\*\s*(.+)", content)
            role_match = re.search(r"\*\*Core Personality:\*\*\s*(.+)", content)
            if name_match:
                name = name_match.group(1).strip()
            if role_match:
                role = role_match.group(1).strip()
        agents_data[agent_id] = build_agent_meta(agent_id, name, role, idx, provider_type, model_id)
    kickoff_path = Path(config.SHARED_DIR) / "kickoff.md"
    kickoff_text = kickoff_path.read_text(encoding="utf-8").strip() if kickoff_path.exists() else ""
    return {"status": "ok", "agents": agents_data, "kickoff": kickoff_text}


@app.get("/api/managed/teams")
async def list_teams():
    with get_conn() as conn:
        teams = rows_to_dicts(conn.execute("SELECT * FROM teams ORDER BY updated_at DESC").fetchall())
    return {"status": "ok", "teams": teams}


@app.get("/api/managed/providers")
async def list_provider_configs():
    with get_conn() as conn:
        providers = rows_to_dicts(
            conn.execute(
                """
                SELECT id, provider_type, display_name, is_valid, validation_error, validated_at
                FROM llm_provider_configs
                ORDER BY provider_type
                """
            ).fetchall()
        )
    return {"status": "ok", "providers": providers, "catalog": PROVIDER_CATALOG}


@app.post("/api/managed/providers")
async def create_provider_config(payload: ProviderConfigCreateIn):
    if payload.provider_type not in PROVIDER_CATALOG:
        raise HTTPException(status_code=400, detail="Unsupported provider type.")
    provider = get_provider(payload.provider_type)
    try:
        provider.validate_api_key(payload.api_key.strip())
        is_valid = 1
        validation_error = ""
    except ProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM llm_provider_configs WHERE provider_type = ?",
            (payload.provider_type,),
        ).fetchone()
        display_name = PROVIDER_CATALOG[payload.provider_type]["name"]
        encrypted_key = encrypt_secret(payload.api_key.strip())
        if existing:
            conn.execute(
                """
                UPDATE llm_provider_configs
                SET display_name = ?, api_key = '', api_key_ciphertext = ?, is_valid = ?, validation_error = ?, validated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (display_name, encrypted_key, is_valid, validation_error, existing["id"]),
            )
            provider_id = existing["id"]
        else:
            cursor = conn.execute(
                """
                INSERT INTO llm_provider_configs
                (provider_type, display_name, api_key, api_key_ciphertext, is_valid, validation_error, validated_at, updated_at)
                VALUES (?, ?, '', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """,
                (payload.provider_type, display_name, encrypted_key, is_valid, validation_error),
            )
            provider_id = cursor.lastrowid
    return {"status": "ok", "providerId": provider_id, "message": f"{display_name} validated successfully."}


@app.delete("/api/managed/providers/{provider_id}")
async def delete_provider_config(provider_id: int):
    with get_conn() as conn:
        provider = conn.execute(
            "SELECT id, provider_type FROM llm_provider_configs WHERE id = ?",
            (provider_id,),
        ).fetchone()
        if not provider:
            raise HTTPException(status_code=404, detail="Provider configuration not found.")
        conn.execute("UPDATE team_agents SET provider_config_id = NULL, model_id = '' WHERE provider_config_id = ?", (provider_id,))
        conn.execute("DELETE FROM llm_provider_configs WHERE id = ?", (provider_id,))
    return {"status": "ok"}


@app.post("/api/managed/teams")
async def create_team(payload: TeamCreateIn):
    if not 2 <= len(payload.agents) <= 11:
        raise HTTPException(status_code=400, detail="Teams must have between 2 and 11 agents.")
    with get_conn() as conn:
        if validated_provider_count(conn) < 1:
            raise HTTPException(status_code=400, detail="Validate at least one provider before creating a team.")
        validate_agent_provider_assignments(conn, payload.agents)
        cursor = conn.execute(
            "INSERT INTO teams (name, description) VALUES (?, ?)",
            (payload.name.strip(), payload.description.strip()),
        )
        team_id = cursor.lastrowid
    write_team(team_id, payload)
    return {"status": "ok", "team": team_summary(team_id)}


@app.get("/api/managed/teams/{team_id}")
async def get_team(team_id: int):
    return {"status": "ok", **team_summary(team_id)}


@app.put("/api/managed/teams/{team_id}")
async def update_team(team_id: int, payload: TeamUpdateIn):
    with get_conn() as conn:
        if validated_provider_count(conn) < 1:
            raise HTTPException(status_code=400, detail="Validate at least one provider before saving a team.")
        validate_agent_provider_assignments(conn, payload.agents)
        exists = conn.execute("SELECT id FROM teams WHERE id = ?", (team_id,)).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Team not found")
        conn.execute(
            "UPDATE teams SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (payload.name.strip(), payload.description.strip(), team_id),
        )
    write_team(team_id, payload)
    return {"status": "ok", "team": team_summary(team_id)}


@app.patch("/api/managed/teams/{team_id}/agents/{agent_slug}")
async def quick_update_team_agent(team_id: int, agent_slug: str, payload: AgentQuickUpdateIn):
    next_slug = slugify(payload.display_name)
    with get_conn() as conn:
        if validated_provider_count(conn) < 1:
            raise HTTPException(status_code=400, detail="Validate at least one provider before saving a team.")
        provider = conn.execute(
            "SELECT id FROM llm_provider_configs WHERE id = ? AND is_valid = 1",
            (payload.provider_config_id,),
        ).fetchone()
        if not provider:
            raise HTTPException(status_code=400, detail="Choose a validated provider for this agent.")
        if not payload.model_id.strip():
            raise HTTPException(status_code=400, detail="Choose a model for this agent.")
        team = conn.execute("SELECT id FROM teams WHERE id = ?", (team_id,)).fetchone()
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        agent = conn.execute(
            "SELECT id FROM team_agents WHERE team_id = ? AND slug = ?",
            (team_id, agent_slug),
        ).fetchone()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        duplicate = conn.execute(
            "SELECT id FROM team_agents WHERE team_id = ? AND slug = ? AND id != ?",
            (team_id, next_slug, agent["id"]),
        ).fetchone()
        if duplicate:
            raise HTTPException(status_code=400, detail="Another agent already uses that name.")
        conn.execute(
            """
            UPDATE team_agents
            SET slug = ?, display_name = ?, provider_config_id = ?, model_id = ?, role = ?,
                core_personality = ?, talkativeness = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                next_slug,
                payload.display_name.strip(),
                payload.provider_config_id,
                payload.model_id.strip(),
                payload.role.strip(),
                payload.core_personality.strip(),
                payload.talkativeness,
                agent["id"],
            ),
        )
        conn.execute("UPDATE teams SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (team_id,))
    return {"status": "ok", **team_summary(team_id)}


@app.patch("/api/managed/teams/{team_id}/scenario-template")
async def update_scenario_template(team_id: int, payload: ScenarioTemplateUpdateIn):
    with get_conn() as conn:
        team = conn.execute("SELECT id FROM teams WHERE id = ?", (team_id,)).fetchone()
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        existing = conn.execute(
            "SELECT id FROM conversations WHERE team_id = ? AND status = 'template' ORDER BY id DESC LIMIT 1",
            (team_id,),
        ).fetchone()
        if payload.scenario_template.strip():
            if existing:
                conn.execute(
                    "UPDATE conversations SET scenario_prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (payload.scenario_template.strip(), existing["id"]),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO conversations (team_id, title, mode, status, scenario_prompt, state_json)
                    VALUES (?, 'Scenario Template', 'managed', 'template', ?, '{}')
                    """,
                    (team_id, payload.scenario_template.strip()),
                )
        else:
            conn.execute("DELETE FROM conversations WHERE team_id = ? AND status = 'template'", (team_id,))
        conn.execute("UPDATE teams SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (team_id,))
    return {"status": "ok", **team_summary(team_id)}


@app.delete("/api/managed/teams/{team_id}")
async def delete_team(team_id: int):
    with get_conn() as conn:
        exists = conn.execute("SELECT id FROM teams WHERE id = ?", (team_id,)).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Team not found")
        conn.execute("DELETE FROM teams WHERE id = ?", (team_id,))
    return {"status": "ok"}


@app.delete("/api/managed/teams/{team_id}/agents/{agent_slug}")
async def delete_team_agent(team_id: int, agent_slug: str):
    with get_conn() as conn:
        team_agents = rows_to_dicts(conn.execute(
            "SELECT id, slug FROM team_agents WHERE team_id = ? ORDER BY sort_order",
            (team_id,),
        ).fetchall())
        if len(team_agents) <= 2:
            raise HTTPException(
                status_code=400,
                detail="At least two agents are required. Add another agent before deleting this one.",
            )
        agent = next((item for item in team_agents if item["slug"] == agent_slug), None)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        delete_conversations_for_agent(conn, team_id, agent["id"])
        conn.execute("DELETE FROM team_agents WHERE id = ?", (agent["id"],))
        rebuild_team_relationships(conn, team_id)
        remaining = rows_to_dicts(conn.execute(
            "SELECT id FROM team_agents WHERE team_id = ? ORDER BY sort_order",
            (team_id,),
        ).fetchall())
        for idx, row in enumerate(remaining):
            conn.execute("UPDATE team_agents SET sort_order = ? WHERE id = ?", (idx, row["id"]))
    return {"status": "ok", "team": team_summary(team_id)}


@app.post("/api/managed/teams/{team_id}/conversations")
async def create_conversation(team_id: int, payload: ConversationCreateIn):
    with get_conn() as conn:
        team = conn.execute("SELECT * FROM teams WHERE id = ?", (team_id,)).fetchone()
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        team_agents = rows_to_dicts(conn.execute(
            "SELECT * FROM team_agents WHERE team_id = ? ORDER BY sort_order",
            (team_id,),
        ).fetchall())
        selected = [agent for agent in team_agents if agent["slug"] in payload.participant_slugs]
        if not 2 <= len(selected) <= 11:
            raise HTTPException(status_code=400, detail="Conversation must include between 2 and 11 agents.")
        cursor = conn.execute(
            """
            INSERT INTO conversations (team_id, title, mode, status, scenario_prompt, settings_json, state_json)
            VALUES (?, ?, 'managed', 'draft', ?, ?, '{}')
            """,
            (team_id, payload.title.strip(), payload.scenario_prompt.strip(), dumps(runtime_settings_from_payload(payload))),
        )
        conversation_id = cursor.lastrowid
        slug_to_name = {agent["slug"]: agent["display_name"] for agent in selected}
        memories = rows_to_dicts(conn.execute(
            """
            SELECT tam.*, ta.slug AS source_slug, target.slug AS target_slug
            FROM team_agent_memories tam
            JOIN team_agents ta ON ta.id = tam.team_agent_id
            LEFT JOIN team_agents target ON target.id = tam.target_agent_id
            WHERE ta.team_id = ?
            ORDER BY tam.sort_order
            """,
            (team_id,),
        ).fetchall())
        personas = rows_to_dicts(conn.execute(
            """
            SELECT sap.content, src.slug AS source_slug, tgt.slug AS target_slug
            FROM team_agent_personas sap
            JOIN team_agents src ON src.id = sap.source_agent_id
            JOIN team_agents tgt ON tgt.id = sap.target_agent_id
            WHERE src.team_id = ?
            """,
            (team_id,),
        ).fetchall())
        group_memories = rows_to_dicts(conn.execute(
            "SELECT * FROM team_group_memories WHERE team_id = ?",
            (team_id,),
        ).fetchall())
        group_members = rows_to_dicts(conn.execute(
            """
            SELECT tgm.id AS memory_id, ta.slug
            FROM team_group_memory_members tgmm
            JOIN team_group_memories tgm ON tgm.id = tgmm.group_memory_id
            JOIN team_agents ta ON ta.id = tgmm.team_agent_id
            WHERE tgm.team_id = ?
            """,
            (team_id,),
        ).fetchall())
        gm_map: dict[int, list[str]] = {}
        for row in group_members:
            gm_map.setdefault(row["memory_id"], []).append(row["slug"])
        normalized_group_memories = []
        for memory in group_memories:
            slugs = gm_map.get(memory["id"], [])
            if not memory["is_general"] and not set(slugs).issubset(set(payload.participant_slugs)):
                continue
            normalized_group_memories.append({
                "title": memory["title"],
                "content": memory["content"],
                "is_general": bool(memory["is_general"]),
                "participant_slugs": slugs,
            })
        participant_id_by_slug: dict[str, int] = {}
        for idx, agent in enumerate(selected):
            agent_memories = [m for m in memories if m["source_slug"] == agent["slug"]]
            personal_memory = "\n".join(m["content"] for m in agent_memories if m["memory_type"] == "personal").strip()
            relational_memories = [
                {"target_agent_slug": m["target_slug"], "title": m["title"], "content": m["content"]}
                for m in agent_memories if m["memory_type"] != "personal"
                if not m["target_slug"] or m["target_slug"] in payload.participant_slugs
            ]
            agent_personas = {
                row["target_slug"]: row["content"]
                for row in personas
                if row["source_slug"] == agent["slug"] and row["target_slug"] in payload.participant_slugs
            }
            identity_md = build_identity_markdown(agent)
            memory_md = build_memory_markdown(personal_memory, relational_memories, slug_to_name)
            personas_md = build_personas_markdown(agent_personas, slug_to_name)
            participant_id = conn.execute(
                """
                INSERT INTO conversation_participants
                (conversation_id, team_agent_id, slot_index, slug, display_name, provider_type, provider_config_id, model_id, identity_md, memory_md, personas_md, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    conversation_id,
                    agent["id"],
                    idx,
                    agent["slug"],
                    agent["display_name"],
                    provider_type_for_agent(conn, agent["provider_config_id"]),
                    agent["provider_config_id"],
                    agent["model_id"] or default_model_for_provider(provider_type_for_agent(conn, agent["provider_config_id"])),
                    identity_md,
                    memory_md,
                    personas_md,
                    idx,
                ),
            ).lastrowid
            participant_id_by_slug[agent["slug"]] = participant_id
        for memory in normalized_group_memories:
            group_id = conn.execute(
                """
                INSERT INTO conversation_group_memories (conversation_id, title, content, is_general)
                VALUES (?, ?, ?, ?)
                """,
                (conversation_id, memory["title"], memory["content"], 1 if memory["is_general"] else 0),
            ).lastrowid
            for slug in memory["participant_slugs"]:
                conn.execute(
                    "INSERT INTO conversation_group_memory_members (group_memory_id, participant_id) VALUES (?, ?)",
                    (group_id, participant_id_by_slug[slug]),
                )
    return {"status": "ok", "conversationId": conversation_id}


@app.get("/api/managed/conversations/{conversation_id}")
async def get_conversation(conversation_id: int):
    with get_conn() as conn:
        convo = row_to_dict(conn.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone())
        if not convo:
            raise HTTPException(status_code=404, detail="Conversation not found")
        participants = rows_to_dicts(conn.execute(
            "SELECT * FROM conversation_participants WHERE conversation_id = ? ORDER BY sort_order",
            (conversation_id,),
        ).fetchall())
        messages = rows_to_dicts(conn.execute(
            "SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY turn_number, id",
            (conversation_id,),
        ).fetchall())
        turns = rows_to_dicts(conn.execute(
            """
            SELECT ct.id, ct.turn_number, cp.slug AS winner_slug, ct.spoken_message, ct.all_hold, ct.created_at
            FROM conversation_turns ct
            LEFT JOIN conversation_participants cp ON cp.id = ct.winner_participant_id
            WHERE ct.conversation_id = ?
            ORDER BY ct.turn_number
            """,
            (conversation_id,),
        ).fetchall())
        decisions = rows_to_dicts(conn.execute(
            """
            SELECT cd.*, ct.turn_number, cp.slug
            FROM conversation_decisions cd
            JOIN conversation_turns ct ON ct.id = cd.conversation_turn_id
            JOIN conversation_participants cp ON cp.id = cd.participant_id
            WHERE ct.conversation_id = ?
            ORDER BY ct.turn_number, cp.sort_order
            """,
            (conversation_id,),
        ).fetchall())
    decisions_by_turn: dict[int, dict] = {}
    for row in decisions:
        decisions_by_turn.setdefault(row["turn_number"], {})[row["slug"]] = {
            "decision": row["decision"],
            "urgency": row["urgency"],
            "effective_urgency": row["effective_urgency"],
            "penalty_multiplier": row["penalty_multiplier"],
            "penalty_delta": row["penalty_delta"],
            "penalty_reason": row["penalty_reason"],
            "consecutive_wins_before": row["consecutive_wins_before"],
            "inner_thought": row["inner_thought"],
            "reason": row["inner_thought"],
            "raw_output": row["raw_output"],
            "usage": loads(row["usage_json"], {}),
        }
    formatted_turns = []
    for row in turns:
        formatted_turns.append({
            "turn": row["turn_number"],
            "winner": row["winner_slug"],
            "message": row["spoken_message"],
            "timestamp": int(datetime.fromisoformat(row["created_at"]).timestamp() * 1000),
            "decisions": decisions_by_turn.get(row["turn_number"], {}),
        })
    return {
        "status": "ok",
        "conversation": {**convo, "settings": loads(convo.get("settings_json"), {})},
        "participants": participants,
        "messages": messages,
        "turns": formatted_turns,
    }


@app.post("/api/managed/conversations/{conversation_id}/start")
async def start_conversation(conversation_id: int):
    global global_orchestrator
    simulation = build_managed_simulation(conversation_id)
    timestamp = f"managed_{conversation_id}_{timestamp_slug()}"
    run_dir = Path(config.RUNS_DIR) / timestamp
    run_dir.mkdir(parents=True, exist_ok=True)
    fl.init(timestamp)
    fl.step(f"managed api: conversation {conversation_id} started")
    try:
        global_orchestrator = Orchestrator(
            run_dir,
            simulation=simulation,
            initial_state=simulation["state"],
            runtime_config=simulation["settings"],
        )
        await global_orchestrator.bootstrap()
        persist_conversation_state(conversation_id, global_orchestrator, "running")
        return {"status": "ok", "message": "Conversation ready."}
    except Exception as exc:
        fl.error("managed start failed", exc)
        raise HTTPException(status_code=400, detail=f"Could not start conversation: {exc}") from exc


@app.post("/api/managed/conversations/{conversation_id}/turn")
async def advance_managed_turn(conversation_id: int):
    global global_orchestrator
    if global_orchestrator is None:
        raise HTTPException(status_code=400, detail="Conversation not started.")
    try:
        result = await global_orchestrator.run_turn()
        result["data"]["timestamp"] = int(datetime.now().timestamp() * 1000)
        persist_managed_turn(conversation_id, result)
        persist_conversation_state(conversation_id, global_orchestrator, "finished" if not result["continue"] else "running")
        return {"status": "ok", "continue": result["continue"], "data": result["data"]}
    except Exception as exc:
        fl.error("managed turn failed", exc)
        raise HTTPException(status_code=400, detail=f"Could not advance conversation: {exc}") from exc


@app.post("/api/managed/import/agent")
async def import_agent_markdown(file: UploadFile = File(...)):
    content = (await file.read()).decode("utf-8")
    parsed = parse_identity_markdown(content, Path(file.filename or "agent").stem)
    return {"status": "ok", "parsed": parsed}


@app.post("/api/managed/import/memory")
async def import_memory_markdown(file: UploadFile = File(...)):
    content = (await file.read()).decode("utf-8")
    sections = parse_markdown_sections(content)
    return {"status": "ok", "parsed": {"personal_memory": sections.get("_root", ""), "sections": sections}}


@app.post("/api/managed/import/personas")
async def import_personas_markdown(file: UploadFile = File(...)):
    content = (await file.read()).decode("utf-8")
    sections = parse_markdown_sections(content)
    sections.pop("_root", None)
    return {"status": "ok", "parsed": {"personas": sections}}


@app.post("/api/managed/import/group-memory")
async def import_group_markdown(file: UploadFile = File(...)):
    content = (await file.read()).decode("utf-8")
    sections = parse_markdown_sections(content)
    return {"status": "ok", "parsed": {"sections": sections}}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
