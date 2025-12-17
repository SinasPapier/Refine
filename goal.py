import json
from typing import Optional

from storage import DATA_FILE


# ---------------------------
# Helpers (internal)
# ---------------------------

def _load_data() -> dict:
    """Load the JSON data file."""
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_data(data: dict) -> None:
    """Persist the JSON data file."""
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)


def _format_goal_line(i: int, goal: dict) -> str:
    title = goal.get("goal", "(no-title)")
    return f"{i}. {title}"


def _print_goals_numbered(goals: list[dict]) -> None:
    print("Current Goals:")
    if not goals:
        print("- (none)")
        return
    for i, g in enumerate(goals, start=1):
        print(_format_goal_line(i, g))


def _choose_goal(goals: list[dict], prompt: str) -> Optional[dict]:
    """Let the user choose a goal by number (1..n).

    UX:
    - shows a numbered list
    - user can type a number
    - user can press Enter (or type 'b') to go back

    Returns the chosen goal dict, or None if cancelled.
    """
    if not goals:
        print("No goals found. Please set a goal first.")
        return None

    _print_goals_numbered(goals)
    print("Options: enter a number (1..n) • Enter = back • b = back")

    raw = input(prompt).strip().lower()
    if raw in ("", "b", "back"):
        return None

    if not raw.isdigit():
        print("Please enter a number (e.g., 1) or press Enter to go back.")
        return None

    idx = int(raw)
    if idx < 1 or idx > len(goals):
        print("Number out of range.")
        return None

    return goals[idx - 1]


# ---------------------------
# Public API
# ---------------------------


def get_goal() -> dict:
    """Ask the user for a goal title and store it. Returns the created goal dict."""
    data = _load_data()
    goals: list[dict] = data.setdefault("goals", [])

    goal_title = input("Enter your main goal: ").strip()
    if not goal_title:
        print("No goal entered. Cancelled.")
        return {}

    goal = {
        "goal": goal_title,
        "steps": [],  # list[str]
    }

    goals.append(goal)
    _save_data(data)

    print(f"Goal '{goal_title}' added.")
    return goal


def define_steps() -> None:
    """Add steps to an existing goal (selected by number).

    Flow:
    1) Choose goal (or go back)
    2) Choose action: add steps or back
    3) Enter steps (blank line finishes)
    """
    data = _load_data()
    goals: list[dict] = data.get("goals", [])

    chosen = _choose_goal(goals, "Choose a goal number: ")
    if chosen is None:
        # Explicitly go back to the menu
        print("Back to menu.")
        return

    title = chosen.get("goal", "(no-title)")
    print(f"Selected goal: {title}")

    action = input("Add steps now? (a = add / Enter = back): ").strip().lower()
    if action in ("", "b", "back"):
        print("Back to menu.")
        return
    if action not in ("a", "add"):
        print("Invalid choice. Back to menu.")
        return

    new_steps: list[str] = []
    print("Enter steps one per line. Press Enter on an empty line to finish.")
    while True:
        step = input("Step: ").strip()
        if not step:
            break
        new_steps.append(step)

    if not new_steps:
        print("No steps entered. Back to menu.")
        return

    chosen.setdefault("steps", []).extend(new_steps)
    _save_data(data)

    print("Added steps:")
    print_steps(new_steps)


def print_steps(steps: list[str]) -> None:
    for i, step in enumerate(steps, 1):
        print(f"{i}. {step}")


def display_goals() -> None:
    data = _load_data()
    goals: list[dict] = data.get("goals", [])
    _print_goals_numbered(goals)


def view_steps_for_goal(goal_number: str) -> None:
    """Show steps for a goal selected by number (1..n)."""
    data = _load_data()
    goals: list[dict] = data.get("goals", [])

    if not goals:
        print("No goals found.")
        return

    if not goal_number.strip().isdigit():
        print("Please enter a goal number (e.g., 1).")
        return

    idx = int(goal_number.strip())
    if idx < 1 or idx > len(goals):
        print("Number out of range.")
        return

    entry = goals[idx - 1]
    title = entry.get("goal", "(no-title)")
    steps = entry.get("steps", [])

    print(f"Steps for goal '{title}':")
    if not steps:
        print("(no steps yet)")
        return

    for i, step in enumerate(steps, 1):
        print(f"{i}. {step}")


def confirm_deletion() -> bool:
    confirmation = input("Are you sure you want to delete this goal? (y/n): ").strip().lower()
    if confirmation == "y":
        return True
    if confirmation == "n":
        print("Deletion cancelled.")
        return False

    print("Invalid input. Deletion cancelled.")
    return False


def delete_goal(goal_number: Optional[str] = None) -> None:
    """Delete a goal by number (1..n). If goal_number is None, ask interactively."""
    data = _load_data()
    goals: list[dict] = data.get("goals", [])

    if not goals:
        print("No goals to delete.")
        return

    if goal_number is None:
        _print_goals_numbered(goals)
        goal_number = input("Which goal do you want to delete? Enter the goal number (1..n): ").strip()

    if not goal_number or not goal_number.isdigit():
        print("Cancelled.")
        return

    idx = int(goal_number)
    if idx < 1 or idx > len(goals):
        print("Number out of range.")
        return

    target = goals[idx - 1]
    print(f"Selected: {_format_goal_line(idx, target)}")
    if not confirm_deletion():
        return

    goals.pop(idx - 1)
    data["goals"] = goals
    _save_data(data)

    print("Goal deleted.")