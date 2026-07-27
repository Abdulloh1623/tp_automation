#!/bin/bash
# Registry-based deploy — immutable per-commit image tag'iga pin qiladi.
# Kod image'da (GHCR); serverda BUILD BO'LMAYDI → OOM yo'q.
# - Har deploy oldidan pre-deploy pg_dump (rollback uchun mos DB nusxasi).
# - TP_IMAGE .env ga saqlanadi (reboot/manual `up -d` ham pinned qoladi).
# - .deploy-history ga yoziladi (rollback.sh shundan foydalanadi).
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
cd /home/ubuntu/tp_automation || exit 1

IMAGE_REPO="ghcr.io/abdulloh1623/tp_automation"

# Joriy (deploydan oldingi) SHA — pre-deploy dump'ni shu bilan nomlaymiz
OLD_SHA="$(git rev-parse HEAD 2>/dev/null || echo unknown)"

# --- Pre-deploy DB backup (postgres ishlab turgan bo'lsa) -------------------
# Postgres tushib qolmagan bo'lsa (birinchi deploy emas) — rollback uchun dump.
if sudo docker compose ps --status running postgres 2>/dev/null | grep -q postgres; then
  # POSTGRES_USER / POSTGRES_DB ni .env dan olamiz (tirnoqlarni olib tashlab)
  PG_USER="$(sed -n 's/^POSTGRES_USER=//p' .env | tr -d '"' | head -1)"
  PG_DB="$(sed -n 's/^POSTGRES_DB=//p' .env | tr -d '"' | head -1)"
  PG_USER="${PG_USER:-tp}"
  PG_DB="${PG_DB:-tp_automation}"
  mkdir -p backups/pre-deploy
  DUMP="backups/pre-deploy/predeploy-$(date '+%Y%m%d-%H%M%S')-${OLD_SHA:0:12}.sql.gz"
  echo "Pre-deploy backup → ${DUMP}"
  # Dump muvaffaqiyatsiz bo'lsa deploy TO'XTAYDI (set -e) — xavfsizlik uchun ataylab.
  sudo docker compose exec -T postgres pg_dump -U "${PG_USER}" "${PG_DB}" | gzip > "${DUMP}"
  # Oxirgi 14 ta pre-deploy dump'ni saqlaymiz (disk to'lmasin)
  ls -1t backups/pre-deploy/predeploy-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
else
  echo "Postgres ishlamayapti — pre-deploy backup o'tkazib yuborildi (ehtimol birinchi deploy)."
fi

# --- Kod/config o'zgarishlari (KOD emas — kod image'da) ---------------------
git pull --rebase --autostash origin main --quiet || true

# Serverdagi HEAD = deploy.yml ${{ github.sha }} image tegi bilan bir xil
SHA="$(git rev-parse HEAD)"
TAG="${IMAGE_REPO}:${SHA}"

# Bu ishga tushirish uchun tegni muhitga beramiz (compose shundan o'qiydi).
# .env ga YOZMAYMIZ — hali image mavjudligiga ishonchimiz yo'q.
export TP_IMAGE="${TAG}"

# --- Aynan shu SHA image'ni tortamiz (latest EMAS) -------------------------
sudo -E docker compose pull --quiet

# --- TP_IMAGE ni .env ga upsert (persist) ----------------------------------
# ATAYLAB pull'DAN KEYIN: agar image hali qurilmagan bo'lsa (CI tugamagan),
# pull yiqiladi va `set -e` skriptni to'xtatadi. Bu qator yuqorida turganda
# .env mavjud bo'lmagan tegga ishora qilib qolardi — ishlab turgan konteynerlar
# zarar ko'rmasdi, lekin qayta yuklashda ilova umuman ko'tarilmasdi.
# Endi pull muvaffaqiyatli bo'lgandagina yoziladi, ya'ni .env doim
# mavjud image'ga ishora qiladi.
if grep -q '^TP_IMAGE=' .env 2>/dev/null; then
  sed -i "s|^TP_IMAGE=.*|TP_IMAGE=${TAG}|" .env
else
  printf '\nTP_IMAGE=%s\n' "${TAG}" >> .env
fi

# up -d: yangi digest bo'lsa qayta yaratadi (migrate migratsiyalarni qo'llaydi)
sudo -E docker compose up -d

# --- Rollback tarixi (eng yangi tepada) — oxirgi 20 ta ---------------------
# Format (TAB bilan): <sha>\t<sana vaqt>[\t(rollback)] — SHA birinchi ustun.
printf '%s\t%s\n' "${SHA}" "$(date '+%F %T')" | cat - .deploy-history 2>/dev/null | head -20 > .deploy-history.tmp
mv .deploy-history.tmp .deploy-history

# Eski image'larni tozalash — yagona manba: scripts/docker-gc.sh (u host cron'da
# ham ishlaydi, chunki deploy qo'lda `docker compose pull && up -d` bilan
# qilinganda bu skript umuman chaqirilmaydi — 2026-07-26 da disk shundan to'lgan).
# KEEP=3: joriy + 2 orqaga qaytish; eskisi kerak bo'lsa rollback.sh GHCR'dan tortadi.
KEEP=3 "$(dirname "$0")/docker-gc.sh" || true

echo "$(date '+%F %T') — deployed ${SHA}"
