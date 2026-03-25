import os
import datetime

def create_agent_log(project_root, objective="", completed="", decisions="", pending="", recommendations=""):
    log_dir = os.path.join(project_root, "logs_md_agente")
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)
        print(f"Created directory: {log_dir}")

    now = datetime.datetime.now()
    timestamp = now.strftime("%Y-%m-%d_%H-%m")
    filename = f"{timestamp}_session_summary.md"
    file_path = os.path.join(log_dir, filename)

    content = f"""# Session Log: {now.strftime("%Y-%m-%d %H:%M:%S")}

## 🎯 Objective
- {objective if objective else "[Primary goal of the session]"}

## ✅ Completed Tasks
- {completed if completed else "[List of accomplishments]"}

## 🛠️ Technical Decisions & Rationale
- {decisions if decisions else "[Decision 1]: [Why?]"}

## 🚧 Current State & Pending Work
- {pending if pending else "[List of tasks that are still in progress or planned]"}

## 💡 Recommendations for the Next Agent
- {recommendations if recommendations else "[Specific advice or warnings]"}
- [Where to pick up from]
"""

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"Log created successfully: {file_path}")
    return file_path

if __name__ == "__main__":
    # Example usage: create_agent_log(os.getcwd())
    import sys
    proj_root = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    create_agent_log(proj_root)
