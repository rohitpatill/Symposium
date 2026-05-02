# Symposium

> A curious experiment: what if AI agents communicated the way humans actually do in a group conversation?

I was thinking about how AI agents work together. There are lots of frameworks out there where agents collaborate on tasks, build things, solve problems. But something kept nagging at me: when agents talk to each other, it doesn't sound like humans talking. It sounds like functions calling functions. And I started wondering — what would it actually take to make an agent conversation feel like a real meeting?

So I started thinking about what happens when humans sit in a room and talk. How do we actually decide who speaks next? What's the difference between what we think and what we say? Why do we remember things differently? And I realized there are patterns in human conversation that almost no agent framework tries to replicate honestly.

That's what Symposium is. One attempt at building a framework where agents talk more like humans actually do.

---

## The Idea

When humans talk in a group, four things are happening:

- **You think before you speak — and the two are different.** What runs through your head ("Nova keeps centering herself, this is annoying") is rarely what you say out loud ("That's a fair point, but maybe we should also consider..."). The private thought and the public message are separate things.
- **You don't speak in turn order. You speak when you feel pulled to.** Whoever feels most strongly about the current moment usually gets the floor — but only moderated by the social sense that someone has been talking too much and should make space.
- **Your view of every other person is your own.** My picture of you is not your picture of yourself, and it's not the picture the third person in the room has of you either. These views are asymmetric and personal.
- **Memory is partial and personal.** I remember the things that happened to me, and fragments of what happened *with* the people in this room. I don't have the same memory of an event that someone else who was there has.

I started building Symposium around these four things. Agents privately decide whether they want to speak, earn the floor through something resembling social pressure, write down a private inner thought that no one else will see, and only then speak out loud. Each agent carries its own subjective view of every other agent, remembers only the parts of history it was part of, and keeps its own continuity of self across turns.

Do the conversations feel more human? Maybe. The ones Symposium produces definitely feel different than most agent conversations — less like reading a structured handoff, more like overhearing a real meeting.

---

## What You Can Do With It

**Build your own teams.** Pick a name, write a scenario, and design each agent's personality, speech style, private goals, what they value, and how they handle defeat. Each agent gets its own *persona* of every other agent on the team — your subjective view of them, which you control independently.

![Team builder with manual and AI options](https://drive.google.com/uc?export=view&id=1CSfLWXIMeLlhqbfDSbx95bt_sjIhVLXG)

**Or let Symposium AI build the team for you.** Describe the kind of conversation you want — *"three founders arguing over whether to take a buyout"*, or *"a doctor, an ethicist, and a patient debating an end-of-life decision"* — and Symposium AI interviews you, asks the right questions, and assembles the full team in one shot.

**Mix and match models per agent.** Symposium supports **40+ models across OpenAI, Anthropic, and Google Gemini**. Assign one to each agent independently. Want a deep, reflective philosopher? Give them a frontier reasoning model. Want a junior intern who keeps it short and reactive? Give them something cheap and fast. The personality of an agent comes as much from the model behind it as from the prompt.

![Team detail with agent configuration](https://drive.google.com/uc?export=view&id=1y9LPJHdMpq6cP2LlrPcKb5viqFXMaT84)

**Watch them deliberate.** Launch a conversation from any team and watch it play out turn by turn. The main view shows what each agent says out loud. A side panel — *Under the Hood* — shows the private thoughts they had this turn, who wanted the floor and how badly, who held back, and who actually got picked.

![Conversation in progress - phase 1 deciding](https://drive.google.com/uc?export=view&id=1UIQycTJtIZ-Vh0xUtqXU8zsIakbABzJd)

![Conversation with floor decided and urgency bars](https://drive.google.com/uc?export=view&id=1OlGFX78U-5vjJV9dvfIUDdct13P5Jiuj)


---

## Installation

You'll need **Python 3.10+** and **Node.js 18+**.

### 1. Clone and install

```bash
git clone https://github.com/rohitpatill/Symposium.git
cd Symposium
pip install -r requirements.txt
```

### 2. Install frontend

```bash
cd agent-chat-arena-main
npm install
cd ..
```

### 3. Run

**Terminal 1:**
```bash
uvicorn server:app --reload
```

**Terminal 2:**
```bash
cd agent-chat-arena-main
npm run dev
```

Open [http://localhost:8080](http://localhost:8080).

### First run

1. **Setup Providers** — add one API key (OpenAI, Anthropic, or Google Gemini)
2. **Create Team** — build manually or let Symposium AI do it
3. **Start conversation** — pick a scenario and watch them go

---

## License

MIT.
