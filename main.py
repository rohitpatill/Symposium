import asyncio
from pathlib import Path
from datetime import datetime

import config
from src.orchestrator import Orchestrator
import src.flow_logger as fl


async def main():
    if not config.API_KEY:
        raise ValueError("OPENAI_API_KEY not set in .env")

    # Create run directory
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    run_dir = Path(config.RUNS_DIR) / timestamp
    run_dir.mkdir(parents=True, exist_ok=True)

    fl.init(timestamp)
    fl.step("main: run started")
    fl.info("run_dir", str(run_dir))
    fl.info("model", config.MODEL)
    fl.info("max_turns", config.MAX_TURNS)

    print(f"Run directory: {run_dir}")
    print(f"Model: {config.MODEL}")
    print(f"Max turns: {config.MAX_TURNS}")
    print(f"Stop on {config.CONSECUTIVE_HOLDS_TO_STOP} consecutive HOLDs")
    print()

    # Run orchestrator
    orchestrator = Orchestrator(run_dir)
    await orchestrator.run()


if __name__ == "__main__":
    asyncio.run(main())
