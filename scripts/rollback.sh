#!/bin/bash
# Oldingi (yoki ko'rsatilgan) immutable image'ga qaytarish — BUILD yo'q.
# Oldingi image lokalda tag'langan (dangling emas) → prune o'chirmagan → PULL kamdan-kam.
#
#   ./scripts/rollback.sh            # bir oldingi deployga qaytadi (.deploy-history[2])
#   ./scripts/rollback.sh <git-sha>  # aniq SHA ga qaytadi
#   ./scripts/rollback.sh --list     # so'nggi deploylar ro'yxati
#
# DIQQAT: bu FAQAT app image'ini qaytaradi. Agar buzuq relizda DESTRUCTIVE
# (ustun o'chirgan/nomini o'zgartirgan) Prisma migratsiya bo'lgan bo'lsa, schema
# QAYTMAYDI — bunday holda backups/pre-deploy/ dagi mos dump'ni tiklang.
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
cd /home/ubuntu/tp_automation || exit 1

IMAGE_REPO="ghcr.io/abdulloh1623/tp_automation"

if [ "${1:-}" = "--list" ]; then
  echo "So'nggi deploylar (.deploy-history):"
  cat .deploy-history 2>/dev/null || echo "  (tarix yo'q)"
  exit 0
fi

if [ "${1:-}" != "" ]; then
  SHA="$1"
else
  # .deploy-history: qator 1 = joriy, qator 2 = oldingi (TAB-ajratilgan, SHA = 1-ustun)
  SHA="$(awk -F'\t' 'NR==2{print $1}' .deploy-history 2>/dev/null)"
  [ -n "${SHA}" ] || { echo "Oldingi deploy topilmadi. SHA ni qo'lda bering: ./scripts/rollback.sh <sha>"; exit 1; }
fi
TAG="${IMAGE_REPO}:${SHA}"

echo "Rollback → ${SHA}"

# Bu ishga tushirish uchun tegni muhitga beramiz (compose shundan o'qiydi).
export TP_IMAGE="${TAG}"

sudo -E docker compose pull --quiet || true   # lokalda bor bo'lsa no-op
sudo -E docker compose up -d

# TP_IMAGE ni .env ga upsert — ATAYLAB `up -d` DAN KEYIN: agar rollback image
# na lokalda, na registryda bo'lsa `up -d` yiqiladi va `set -e` skriptni
# to'xtatadi; .env eski (ishlayotgan) tegda qoladi. Yuqorida yozilsa .env
# ko'tarilmaydigan image'ga ishora qilib qolardi.
if grep -q '^TP_IMAGE=' .env 2>/dev/null; then
  sed -i "s|^TP_IMAGE=.*|TP_IMAGE=${TAG}|" .env
else
  printf '\nTP_IMAGE=%s\n' "${TAG}" >> .env
fi

printf '%s\t%s\t(rollback)\n' "${SHA}" "$(date '+%F %T')" | cat - .deploy-history 2>/dev/null | head -20 > .deploy-history.tmp
mv .deploy-history.tmp .deploy-history
echo "Rollback tugadi: ${SHA}"
