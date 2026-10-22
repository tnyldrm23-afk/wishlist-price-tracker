# Workflow screenshots

These are reviewed n8n canvas screenshots. They show workflow structure without credential values or execution payloads. They are structural illustrations rather than evidence that a current provider request succeeded.

## Entry points

Telegram messages and the daily schedule call the appropriate sub-workflows.

![Telegram and daily schedule workflow](images/n8n-entry.jpg)

## One-product price check

The workflow obtains a valid observation, calculates eligibility, reserves an alert and records delivery. Invalid observations follow the lower branch.

![One-product price checking workflow](images/n8n-check.jpg)

The shared Error Trigger handler was added after these canvas screenshots. Its current definition is included in `workflows/error.json`.
