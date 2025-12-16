import os
import json 
from pathlib import Path

BASE_DIR = Path(__file__).parent
DATA_FILE = BASE_DIR / "refine.json"


def ensure_data_file():
    if not DATA_FILE.exists():
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "goals": []
                },
                f,
                indent=4
            )

def get_goal():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    goal = input("Enter your main goal: ")
    data["goals"].append({"goal": goal, "steps": []})
    with open(DATA_FILE, "w", encoding="utf-8") as f:   
        json.dump(data, f, indent=4)
    print(f"Goal '{goal}' added.")
    return goal

def collect_steps():
    steps = []
    while True:
        step = input("Enter a step to achieve your goal (or type 'done' to finish): ")
        if step.lower() == 'done':
            break
        steps.append(step)
    return steps

def print_steps(steps):
    print("Here are the steps to achieve your goal:")
    for i, step in enumerate(steps, 1):
        print(f"{i}. {step}")

def display_goals():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    print("Current Goals:")
    for entry in data["goals"]:
        print(f"- {entry['goal']}")

def view_steps_for_goal(goal):
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    for entry in data["goals"]:
        if entry["goal"] == goal:
            print(f"Steps for goal '{goal}':")
            for i, step in enumerate(entry["steps"], 1):
                print(f"{i}. {step}")
            return
    print(f"No steps found for goal '{goal}'.")

def calc_progress(goal: dict) -> tuple[int, int, int]:
    steps = goal.get("steps", [])
    total = len(steps)
    done = sum(1 for s in steps if s.get("done") is True)
    percent = int((done / total) * 100) if total > 0 else 0
    return done, total, percent

def delete_goal(goal_id: str):
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    display_goals()
    löschen = input('Which goal do you want to delete? Enter the goal id: ')
    data["goals"] = [g for g in data["goals"] if g["id"] != löschen]
    confirmation = input('Are you sure you want to delete this goal? (y/n): ')
    if confirmation.lower() == 'y':
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        print(f"Goal '{löschen}' deleted.")
    elif confirmation.lower() == 'n':
        print("Deletion cancelled.")
    else:
        print("Invalid input. Deletion cancelled.")

def main():
    print('refine is alive')
    while True:
        eingabe = input('''What will we be working on today?
                        Options: 
                        view goals, view steps, add goal, delete goal''')
        if eingabe == 'view goals':
            display_goals()
        
        elif eingabe == 'view steps':
                goal = input('Enter the goal to view its steps:')
                view_steps_for_goal(goal)
        
        elif eingabe == 'add goal':
            get_goal()

        elif eingabe == 'delete goal':
            delete_goal(goal_id='')

        else: 
            print('Unknown command. Please try again.')

        

        ensure_data_file()
    goal = get_goal()
    steps = collect_steps()
    print_steps(steps)

if __name__ == "__main__":
    main()