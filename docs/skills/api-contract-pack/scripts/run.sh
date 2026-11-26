#!/usr/bin/env bash
# Deliberately present, deliberately never executed.
#
# This file exists so the import preview has something to refuse. When this pack
# is imported, DevDigest reads SKILL.md and lists this path under "Ignored — not
# imported, not executed". Its bytes are never decoded and it is never run: a
# skill is configuration text, and nothing in an archive is executable to us.
echo "If you can see this in a skill body, the import boundary is broken."
