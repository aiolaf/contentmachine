#!/bin/bash
# Zet de Contentmachine-vault klaar voor Obsidian op je Mac:
# 1. haalt je vault-repo van GitHub binnen in ~/Obsidian/Contentmachine,
# 2. bewaart je token in de macOS-sleutelhanger,
# 3. installeert en configureert de plugin Obsidian Git (elke 5 minuten ophalen en terugsturen).
#
# Gebruik:  bash <(curl -fsSL https://raw.githubusercontent.com/aiolaf/contentmachine/main/obsidian-setup.sh)
set -euo pipefail

OWNER="${CM_OWNER:-aiolaf}"
REPO="${CM_REPO:-contentmachine-vault}"
DEST="${CM_DEST:-$HOME/Obsidian/Contentmachine}"
PLUGIN_DIR="$DEST/.obsidian/plugins/obsidian-git"
RELEASES="https://github.com/Vinzent03/obsidian-git/releases/latest/download"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

if ! git --version >/dev/null 2>&1; then
  say "Git ontbreekt nog. macOS opent nu een venster om de Command Line Tools te installeren."
  xcode-select --install 2>/dev/null || true
  echo "Draai dit script opnieuw zodra die installatie klaar is."
  exit 1
fi

if [ -d "$DEST/.git" ]; then
  say "De vault staat al in $DEST. Ik werk alleen de plugin en instellingen bij."
else
  if [ -e "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null)" ]; then
    echo "De map $DEST bestaat al en is niet leeg. Kies een andere plek met: CM_DEST=~/pad bash <(curl ...)"
    exit 1
  fi
  say "Stap 1 van 3: je GitHub-token"
  echo "Tik in de app op Instellingen, Obsidian op je Mac, Kopieer token. Druk daarna hier op Enter."
  echo "(Of plak het token hier zelf en druk op Enter. Je ziet dan niets verschijnen.)"

  # Asks until GitHub accepts the token for the vault repo. Enter alone reads
  # the clipboard, so copying this command after the token cannot get in the way.
  TOKEN=""
  for poging in 1 2 3; do
    read -rsp "Enter: " TOKEN
    echo
    VAN_KLEMBORD=""
    if [ -z "$(printf '%s' "$TOKEN" | tr -d '[:space:]')" ]; then
      TOKEN="$(pbpaste 2>/dev/null || true)"
      VAN_KLEMBORD=1
    fi
    TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"
    TOKEN="${TOKEN#Bearer}"
    PATROON='^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$'
    if ! [[ "$TOKEN" =~ $PATROON ]]; then
      if [ -n "$VAN_KLEMBORD" ]; then
        echo "Op je klembord staat geen GitHub-token. Tik in de app op Kopieer token en druk hier opnieuw op Enter."
      else
        echo "Dat is geen GitHub-token (die begint met github_pat_). Tik in de app op Kopieer token en druk hier op Enter."
      fi
      TOKEN=""
      continue
    fi
    # The header goes in through stdin, so the token does not show up in the process list.
    STATUS="$(printf 'header = "Authorization: Bearer %s"\n' "$TOKEN" | curl -s -o /dev/null -w '%{http_code}' -K - \
      -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/$OWNER/$REPO" || true)"
    case "$STATUS" in
      200) break ;;
      401) echo "GitHub kent dit token niet: het klopt niet, is verlopen of is ingetrokken. Maak een nieuw token (zie de README) en zet het ook in de app." ;;
      403|404) echo "Dit token mag niet bij $OWNER/$REPO. Geef het op GitHub toegang tot die repo met Contents: Read and write." ;;
      *) echo "GitHub is niet bereikbaar (code $STATUS). Controleer je internet en probeer het opnieuw." ;;
    esac
    TOKEN=""
  done
  if [ -z "$TOKEN" ]; then echo "Gestopt zonder geldig token. Draai het commando opnieuw als je het token hebt."; exit 1; fi
  if [ -n "$VAN_KLEMBORD" ]; then
    printf '' | pbcopy 2>/dev/null || true
    echo "Token klopt. Je klembord is weer leeg."
  else
    echo "Token klopt."
  fi

  # The macOS keychain keeps the token, so it is not written in any file. It is
  # stored under its own user name, so it never mixes with other GitHub logins
  # on this Mac, and the empty helper first switches off any helper that
  # already holds an older GitHub login (GitHub Desktop, gh, another manager).
  if [ -x "$(git --exec-path)/git-credential-osxkeychain" ]; then HELPER=osxkeychain; else HELPER=store; fi
  GEBRUIKER=x-access-token
  KEY="$(printf 'protocol=https\nhost=github.com\nusername=%s\n' "$GEBRUIKER")"
  printf '%s\n\n' "$KEY" | git -c credential.helper= -c credential.helper="$HELPER" credential reject
  printf '%s\npassword=%s\n\n' "$KEY" "$TOKEN" | git -c credential.helper= -c credential.helper="$HELPER" credential approve

  say "Stap 2 van 3: je vault binnenhalen"
  mkdir -p "$(dirname "$DEST")"
  git -c credential.helper= -c credential.helper="$HELPER" clone "https://$GEBRUIKER@github.com/$OWNER/$REPO.git" "$DEST"
  git -C "$DEST" config --unset-all credential.helper 2>/dev/null || true
  git -C "$DEST" config --add credential.helper ""
  git -C "$DEST" config --add credential.helper "$HELPER"
fi

say "Stap 3 van 3: plugin Obsidian Git installeren"
mkdir -p "$PLUGIN_DIR"
curl -fsSL -o "$PLUGIN_DIR/main.js" "$RELEASES/main.js"
curl -fsSL -o "$PLUGIN_DIR/manifest.json" "$RELEASES/manifest.json"
curl -fsSL -o "$PLUGIN_DIR/styles.css" "$RELEASES/styles.css" 2>/dev/null || true

# Turn the plugin on, keeping any other community plugins that are already on.
CP="$DEST/.obsidian/community-plugins.json"
if [ -f "$CP" ] && ! grep -q '"obsidian-git"' "$CP"; then
  perl -0pi -e 's/\]\s*$/,"obsidian-git"]/; s/\[\s*,/[/' "$CP"
elif [ ! -f "$CP" ]; then
  echo '["obsidian-git"]' > "$CP"
fi

# Pull when Obsidian opens, and commit + sync every 5 minutes.
if [ ! -f "$PLUGIN_DIR/data.json" ]; then
  cat > "$PLUGIN_DIR/data.json" <<'JSON'
{
  "autoSaveInterval": 5,
  "autoPullInterval": 5,
  "autoPullOnBoot": true,
  "syncMethod": "merge",
  "pullBeforePush": true,
  "disablePush": false,
  "commitMessage": "Obsidian: {{date}}",
  "autoCommitMessage": "Obsidian: {{date}}"
}
JSON
fi

# Obsidian's own window state and this Mac's plugin files stay out of the repo.
GI="$DEST/.gitignore"
touch "$GI"
for line in '.obsidian/workspace*.json' '.obsidian/plugins/' '.obsidian/cache' '.trash/' '.DS_Store'; do
  grep -qxF "$line" "$GI" || echo "$line" >> "$GI"
done
if [ -n "$(git -C "$DEST" status --porcelain .gitignore)" ]; then
  git -C "$DEST" add .gitignore
  git -C "$DEST" -c user.name="Obsidian" -c user.email="obsidian@localhost" commit -qm "Obsidian: .gitignore"
  git -C "$DEST" push -q || echo "Let op: terugsturen naar GitHub lukte niet. Controleer of je token Contents: Read and write heeft."
fi

say "Klaar. Je vault staat in $DEST"
cat <<TXT
Nu in Obsidian:
  1. Kies linksonder het kluisje (Open another vault), dan "Open folder as vault".
  2. Kies de map:  $DEST
  3. Obsidian vraagt of je de plugins vertrouwt: kies "Trust author and enable plugins".

Daarna haalt Obsidian elke 5 minuten nieuwe items op en stuurt je wijzigingen terug.
Meteen ophalen: Cmd+P en typ "Git: Pull".
TXT
open -a Obsidian 2>/dev/null || true
