import os
import time


def run_worker() -> None:
    poll_seconds = int(os.getenv("WORKER_POLL_SECONDS", "2"))
    print("ClipCraft worker started")
    while True:
        # Placeholder for Redis dequeue and render execution.
        print("Polling queue...")
        time.sleep(poll_seconds)


if __name__ == "__main__":
    run_worker()
