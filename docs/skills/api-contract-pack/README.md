# api-contract-pack

A sample skill archive used to demonstrate — and test — the import flow.

It holds one skill (`SKILL.md`) and one shell script (`scripts/run.sh`). The
script is there on purpose: importing this pack shows the script listed under
**Ignored — not imported, not executed**, which is the whole point. DevDigest
reads the markdown and nothing else.

## Build the archive

```sh
./scripts/make-skill-archive.sh
# → dist/api-contract-pack.zip
```

Then, in the app: **Skills → Add Skill → Import from file**, pick the zip, read
the preview, and confirm. The skill is saved **disabled** — a skill body becomes
instructions inside an agent's prompt, so enabling one is a decision a person
makes after reading it.
