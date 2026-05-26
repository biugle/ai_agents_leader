# Security Policy

## Reporting a Vulnerability

Please do not report security issues through public GitHub issues.

Until a dedicated private security channel is published, open a private contact
through the repository owner or maintainer channel you already use and include:

- A clear summary of the issue
- Affected version or branch
- Reproduction steps or proof of concept
- Impact assessment
- Any suggested mitigation if available

We will acknowledge receipt as soon as possible and aim to follow up with the
next steps after triage.

## Scope

Security-sensitive areas in this project include, but are not limited to:

- Local runtime process spawning and cleanup
- HTTP API and WebSocket exposure on local ports
- Hook installation and local file parsing
- Tauri desktop shell permissions and window operations
- Any future third-party adapter or plugin surface

## Disclosure Expectations

Please give the maintainers reasonable time to investigate and prepare a fix
before public disclosure.

When reporting, prefer concrete reproduction details over broad claims. This
helps us confirm impact quickly and avoid shipping partial fixes.
