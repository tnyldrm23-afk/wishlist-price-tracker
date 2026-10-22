# Credential handling

Store secrets only in ignored local configuration or n8n's encrypted credential store. The repository contains empty credential placeholders and credential references, not live keys or passwords.

Do not commit `.env`, `.runtime/`, credential exports, Docker data, logs, private keys or execution payloads. Do not show credential editors or provider key dashboards during a demonstration. Review screenshots visually before publishing them; automatic text checks cannot reliably inspect image pixels.

The included commit guard blocks private paths and common token formats in staged text. It is a supplementary check, not a guarantee that every possible secret format is detected. Keep repository access restricted to intended reviewers.

If a credential is exposed, revoke or rotate it at the provider first. Removing the current file does not remove a secret from existing Git history.
