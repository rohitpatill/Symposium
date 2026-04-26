# Add Team

This document explains how an agent should create a complete managed Symposium team from a natural-language request.

The goal is simple: a user should be able to say something like "create a six-person launch council with product, engineering, security, UX, sales, and customer success" and the agent should translate that into the exact managed payload Symposium expects.

## What counts as a complete team

A complete managed team has four parts:

1. `name`
2. `description`
3. `agents`
4. `scenario_template`

It may also include:

5. `group_memories`

Every agent must have:

- `display_name`
- `provider_config_id`
- `model_id`
- `role`
- `core_personality`
- `talkativeness`
- `speech_style`
- `private_goal`
- `values_text`
- `handling_defeat`
- `urgency_tendency`
- `extra_notes`
- `personal_memory`
- `memories`
- `personas`

## Rules to respect

### Team size

- Minimum: 2 agents
- Maximum: 11 agents

### Provider requirements

- At least one validated managed provider must already exist
- Every agent must be assigned a validated `provider_config_id`
- Every agent must have a non-empty `model_id`

### Agent-name requirements

- Agent names must be unique inside the team
- Slugs are generated automatically from `display_name`

### Scenario template

- This is the default kickoff for new managed conversations
- It should establish the situation, stakes, and decision pressure
- It should be concrete enough that the first turn feels alive immediately

## How to think from natural language

When a user describes a team in plain English, convert the request into these layers:

1. What is the setting?
2. What decision or tension is at the center?
3. How many agents are needed?
4. What real-world perspective does each agent represent?
5. What private motive or fear makes each agent distinct?
6. What shared history would shape interruptions, trust, or alliances?
7. Which provider/model should each agent use?

The target is not just "six roles." The target is a cast that will actually produce interesting turn-taking.

## Best practices for agent design

Each agent should feel:

- socially distinct
- strategically distinct
- psychologically distinct

Strong agents usually differ on:

- incentives
- risk tolerance
- status in the room
- speaking style
- what makes them interrupt
- what they are secretly optimizing for

Weak agents are just job titles with generic text.

## Best practices for talkativeness

Use talkativeness intentionally:

- `0.45 - 0.55`: reflective, selective speakers
- `0.56 - 0.68`: balanced contributors
- `0.69 - 0.82`: high-pressure or high-status speakers
- `0.83+`: dominant or impulsive speakers

Do not make everyone equally talkative. Variation is important.

## Model assignment guidance

Use the currently validated provider inventory and assign models intentionally.

Good pattern:

- premium reasoning model for the most strategic or safety-critical role
- balanced mid-tier model for central deliberative roles
- cheaper/faster models for commercially reactive or operationally practical roles
- mixed providers when the user wants diversity in conversational texture

Every selected `model_id` must belong to a currently available model in the provider catalog for that provider.

## Personal memories vs group memories vs personas

### `personal_memory`

Use for private history or facts only that agent knows or feels personally.

Examples:

- past incident ownership
- fear of repeating a failure
- pressure from leadership
- past betrayal

### `group_memories`

Use for events shared by:

- everyone
- or a specific subset of agents

These should explain alliances, distrust, or shared caution.

Each group memory has:

- `title`
- `content`
- `participant_slugs`
- `is_general`

If `is_general` is true:

- `participant_slugs` should usually be empty

If `is_general` is false:

- `participant_slugs` should name the relevant subset

### `personas`

Use for how one agent privately sees another.

This should be written from the source agent's perspective.

Examples:

- "Brilliant but operationally dangerous."
- "Commercially sharp, but too eager to call curiosity demand."

## Managed payload shape

The managed create payload is:

```json
{
  "name": "Team Name",
  "description": "Short summary",
  "agents": [
    {
      "display_name": "Ava Chen",
      "provider_config_id": 6,
      "provider_type": "openai",
      "model_id": "gpt-5.4",
      "role": "Product Manager",
      "core_personality": "Structured, persuasive, ambitious...",
      "talkativeness": 0.74,
      "speech_style": "Crisp, framing-heavy...",
      "private_goal": "Win approval for a limited launch...",
      "values_text": "Momentum, clarity, accountable ownership...",
      "handling_defeat": "Regroups quickly and tries to preserve leverage.",
      "urgency_tendency": "Speaks when the room drifts into indecision.",
      "extra_notes": "Optional extra context.",
      "personal_memory": "Last quarter...",
      "memories": [
        {
          "type": "relational",
          "target_agent_slug": "rowan-park",
          "title": "Prior conflict",
          "content": "They clashed over the last rollout."
        }
      ],
      "personas": {
        "rowan-park": "Brilliant and credible, but expands scope until delivery slips."
      }
    }
  ],
  "group_memories": [
    {
      "title": "Post-incident caution",
      "content": "Three of them remember the fallout from a rushed launch.",
      "participant_slugs": ["rowan-park", "daniel-reed", "elena-brooks"],
      "is_general": false
    }
  ],
  "scenario_template": "The company is considering launching..."
}
```

## API flow

### Create a team

`POST /api/managed/teams`

### Update a whole team

`PUT /api/managed/teams/{team_id}`

### Read a team

`GET /api/managed/teams/{team_id}`

### List providers and models

`GET /api/managed/providers`

This returns:

- validated provider configs
- provider IDs
- provider types
- model catalogs

Always use this endpoint to decide which provider IDs and model IDs are available before building a managed team.

## Natural-language team creation workflow

When the user asks to create a team from plain English, use this sequence:

1. Read `/api/managed/providers`
2. Confirm there is at least one validated provider
3. Infer the team concept:
   - scenario
   - cast size
   - tension
4. Design a cast with distinct incentives
5. Assign provider/model per agent from the live catalog
6. Draft private memories, personas, and group memories
7. Draft a strong `scenario_template`
8. Build the final managed JSON payload
9. Submit it to `POST /api/managed/teams`
10. Verify with `GET /api/managed/teams/{team_id}`

## When the user is underspecified

If the user gives partial information, the agent should still build responsibly.

Reasonable defaults:

- use 5 to 7 agents for strategy scenarios
- choose one chair/facilitator role
- include at least one cautious role and one pressure-for-speed role
- include at least one shared memory if the scenario benefits from social texture
- vary talkativeness
- write scenario text with clear stakes

## What makes a strong Symposium team

The best managed teams are not balanced by symmetry. They are balanced by tension.

Look for:

- one or two high-urgency speakers
- one or two skeptical stabilizers
- one values-driven voice
- one operational realist
- enough hidden friction to create meaningful floor competition

If the cast feels like six people who would all give the same answer politely, the team is not ready yet.
