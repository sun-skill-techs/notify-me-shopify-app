#!/bin/sh
# Nightly encrypted database backup, run by root's cron on the server:
#   15 3 * * * /srv/backsoon/scripts/backup.sh >> /var/log/backsoon-backup.log 2>&1
# Restore: gpg -d --passphrase-file /root/.backup-passphrase --batch FILE | gunzip | \
#   docker compose -f /srv/backsoon/docker-compose.yml exec -T db psql -U postgres
set -eu
DIR=/root/backups
PASS=/root/.backup-passphrase
mkdir -p "$DIR" && chmod 700 "$DIR"
FILE="$DIR/backsoon-$(date -u +%Y-%m-%d).sql.gz.gpg"

# The dump never touches the disk unencrypted.
docker compose -f /srv/backsoon/docker-compose.yml exec -T db pg_dumpall -U postgres \
  | gzip \
  | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "$PASS" -o "$FILE"
chmod 600 "$FILE"

find "$DIR" -name 'backsoon-*.gpg' -mtime +14 -delete
# Off-server copy, once an rclone remote named "offsite" is set up.
if command -v rclone >/dev/null && rclone listremotes | grep -q '^offsite:'; then
  rclone copy "$FILE" offsite:backsoon-backups
fi
echo "$(date -u +%FT%TZ) ok $FILE $(wc -c < "$FILE") bytes"
