#!/usr/bin/env bash
# Install the design skill set globally on a Switchyard control plane and
# expose it to the app's skill registry.
#
# `npx skills add -g` installs into ~/.agents/skills and symlinks that into the
# agent directories it knows about. The Switchyard registry historically reads
# ~/.hermes/skills and its walker does not follow directory symlinks, so this
# script copies the four skill folders into the registry. The dispatcher reads
# both roots, which keeps a card working even if the bridge is missing.
#
# Re-run after provisioning or when an upstream skill changes. It is
# idempotent: npx updates the install and the copy replaces the registry entry.
set -u

SKILLS=(sunnyside-brand-system pen-dev better-typography implement-brand-system)

install_one() {
  local repo="$1" skill="$2"
  shift 2
  echo "==> installing $repo -> $skill"
  # Some agent targets (PromptScript) cannot do a global install and make npx
  # exit non-zero after the universal install succeeded. Verify the file
  # instead of trusting the exit code.
  npx -y skills add "$repo" --skill "$skill" -g -y "$@" || true
  if [[ ! -f "$HOME/.agents/skills/$skill/SKILL.md" ]]; then
    echo "error: $skill did not land in ~/.agents/skills" >&2
    return 1
  fi
  echo "    ok: $HOME/.agents/skills/$skill/SKILL.md"
}

install_one adityahimaone/sunnyside sunnyside-brand-system --full-depth
install_one adityahimaone/sunnyside pen-dev --full-depth
install_one adityahimaone/sunnyside implement-brand-system --full-depth
install_one jakubkrehel/skills better-typography

HERMES_SKILLS="${HERMES_HOME:-$HOME/.hermes}/skills"
mkdir -p "$HERMES_SKILLS"

for skill in "${SKILLS[@]}"; do
  src="$HOME/.agents/skills/$skill"
  dest="$HERMES_SKILLS/$skill"
  if [[ ! -f "$src/SKILL.md" ]]; then
    echo "error: cannot copy $skill; $src/SKILL.md is missing" >&2
    exit 1
  fi
  # Replace a previous copy or the old symlink bridge. `skill` comes from the
  # fixed list above, so dest is always directly under the registry.
  rm -rf -- "$dest"
  mkdir -p "$dest"
  cp -a "$src/." "$dest/"
  echo "copied $dest"
done

echo
echo "Installed design skills:"
for skill in "${SKILLS[@]}"; do
  wc -c "$HOME/.agents/skills/$skill/SKILL.md"
done
echo
echo "The dispatcher auto-loads: sunnyside-brand-system, pen-dev, better-typography"
echo "Opt-in only: implement-brand-system (summon it with \$implement-brand-system)"
