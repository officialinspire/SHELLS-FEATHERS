#!/bin/sh
# Rebuilds the game's MP3 files from the owner's originals (as uploaded in
# commit 6b8ec0e): trims the silence before each short effect so it sounds
# when the tap happens, evens out their levels, and re-encodes the music and
# the victory theme at a lower bit rate. The sounds themselves are unchanged.
# See docs/assets.md.
#
#   sh tools/prepare-audio.sh        # needs git, awk and ffmpeg (libmp3lame)
set -eu
cd "$(dirname "$0")/.."
ORIGINALS=6b8ec0e
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# name, start (s), end (s), gain, bit rate
while read -r name start end gain rate; do
  git show "$ORIGINALS:$name" > "$tmp/$name"
  fade_at=$(awk "BEGIN { printf \"%.3f\", $end - $start - 0.04 }")
  ffmpeg -nostdin -v error -y -i "$tmp/$name" \
    -af "atrim=start=$start:end=$end,asetpts=PTS-STARTPTS,afade=t=in:d=0.005,afade=t=out:st=$fade_at:d=0.04,volume=$gain" \
    -c:a libmp3lame -b:a "$rate" "$name"
done <<'EOF'
button_select.mp3 0.07 0.75 1.8 128k
player_select.mp3 0.50 0.80 0.67 128k
opponent_select.mp3 0.31 0.60 0.54 128k
newgame.mp3 0.46 3.95 1.0 128k
EOF

# Long tracks: same sound, lower bit rate. The victory theme loses the 1.9 s
# of silence at its end.
git show "$ORIGINALS:victory.mp3" > "$tmp/victory.mp3"
ffmpeg -nostdin -v error -y -i "$tmp/victory.mp3" -af "atrim=end=29.6,afade=t=out:st=29.2:d=0.4" -c:a libmp3lame -b:a 96k victory.mp3
git show "$ORIGINALS:gameplay.mp3" > "$tmp/gameplay.mp3"
ffmpeg -nostdin -v error -y -i "$tmp/gameplay.mp3" -c:a libmp3lame -b:a 96k gameplay.mp3
ls -l ./*.mp3
