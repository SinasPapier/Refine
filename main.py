from storage import ensure_data_file

from goal import get_goal, define_steps, display_goals, view_steps_for_goal, delete_goal

def main():
    """Main entry point for the Refine application."""
    ensure_data_file()

    while True:
        print("\nRefine - Main Menu")
        print("1. Set a new goal")
        print("2. Define steps for a goal")
        print("3. View steps for a goal")
        print("4. Display all goals")
        print("5. Delete a goal")
        print("6. Exit")

        choice = input("Select an option (1-6): ").strip()

        if choice == "1" or choice.lower() == "set goal" or choice == "goal" or choice == "set":
            get_goal()
        elif choice == "2" or choice.lower() == "define steps" or choice == "define":
            define_steps()
        elif choice == "3" or choice.lower() == "view steps" or choice == "view":
            display_goals()
            view_steps_for_goal(input("Enter goal ID or exact title: ").strip())
        elif choice == "4" or choice.lower() == "display goals" or choice == "display":
            display_goals()
        elif choice == "5" or choice.lower() == "delete goal" or choice == "delete":
            delete_goal()
        elif choice == "6" or choice.lower() == "exit":
            print("Exiting Refine. Goodbye!")
            break
        else:
            print("Invalid choice. Please select a valid option.")






if __name__ == "__main__":
    main()