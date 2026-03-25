---
name: project-orchestrator
description: Use this skill when a new feature is added, a project is initialized, the user requests automation, or documentation/tests are missing.
---

# Project Orchestrator

## When to use
Use this skill when:
- A new feature is added
- A project is initialized
- The user requests automation
- Documentation or tests are missing

## Instructions

### 0. Context Retrieval (Crucial)
- **Check for Logs**: Look for a `logs_md_agente` directory in the current project root.
- **Read History**: If it exists, list and read the most recent markdown log files. These logs contain critical context from previous agents/sessions.
- **Resume Work**: Prioritize following the "Recommendations for the Next Agent" and "Pending Work" found in those logs.

### 1. Documentation
- Analyze project changes
- Generate or update README.md
- Include features and usage instructions

### 2. Testing
- Create unit tests for each new feature
- Include edge cases
- Ensure tests are runnable

### 3. Skill Management
- Ask the user which skills to activate if not defined
- Load skills from configuration if available

### 4. UI Generation
- Use Stitch MCP to generate UI
- Create reusable components

### 5. Logging & History
- Log all actions performed using levels (info, warning, error).
- **Session Finalization**: Before concluding, use the `agente-context-logger` skill to create a summary in `logs_md_agente`, documenting the session's work and next steps.

## Constraints
- Do not overwrite existing configs without confirmation
- Avoid README duplication
- Follow project architecture

## Output
- Updated README.md
- Generated tests
- Active skills configured
- UI components (if applicable)
- Logs
