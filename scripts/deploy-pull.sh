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

# --- Kod/config o'zgarishlari (KOD emas — kod image'da) ---------------------
git pull --rebase --autostash origin main --quiet || true

# Serverdagi HEAD = deploy.yml ${{ github.sha }} image tegi bilan bir xil
SHA="$(git rev-parse HEAD)"
TAG="${IMAGE_REPO}:${SHA}"

# --- TEZ CHIQISH: deploy qiladigan narsa yo'q bo'lsa ------------------------
# Bu skript cron'da HAR 3 DAQIQADA ishlaydi. Ilgari u har safar pre-deploy
# pg_dump qilar, .deploy-history ga qator qo'shar va `up -d` chaqirardi —
# ya'ni kuniga ~480 ta keraksiz dump, va rollback tarixi bir soatlik bir xil
# SHA bilan to'lib, ma'nosini yo'qotardi.
#
# Ikki shart bajarilsa hech narsa qilmaymiz: (1) ishlab turgan image kutilgan
# tegga teng, (2) barcha xizmatlar ko'tarilgan. Ikkinchi shart muhim — eski
# skriptning har 3 daqiqadagi `up -d` si tasodifan "o'z-o'zini tiklash" vazifasini
# ham bajarardi (to'xtab qolgan xizmatni qaytarardi); uni yo'qotmaymiz.
NEEDS_DEPLOY=0
CID="$(sudo docker compose ps -q app 2>/dev/null | head -1)"
RUNNING_IMAGE=""
[ -n "${CID}" ] && RUNNING_IMAGE="$(sudo docker inspect --format '{{.Config.Image}}' "${CID}" 2>/dev/null || echo "")"
[ "${RUNNING_IMAGE}" = "${TAG}" ] || NEEDS_DEPLOY=1

RUNNING_SERVICES=" $(sudo docker compose ps --services --status running 2>/dev/null | tr '\n' ' ') "
for svc in postgres app worker caddy; do
  case "${RUNNING_SERVICES}" in
    *" ${svc} "*) ;;
    *) echo "$(date '+%F %T') — '${svc}' ishlamayapti, ko'taramiz"; NEEDS_DEPLOY=1 ;;
  esac
done

[ "${NEEDS_DEPLOY}" = "1" ] || exit 0

# Faqat xizmat tushib qolgan bo'lsa (image o'zgarmagan) — dump/tarixsiz ko'taramiz
if [ "${RUNNING_IMAGE}" = "${TAG}" ]; then
  export TP_IMAGE="${TAG}"
  sudo -E docker compose up -d
  exit 0
fi

echo "$(date '+%F %T') — yangi reliz: ${SHA:0:12} (oldingi: ${OLD_SHA:0:12})"

# --- Joy bo'shatish (pull'DAN OLDIN) ---------------------------------------
# ATAYLAB shu yerda: tozalash oxirida turganda disk to'lib qolsa `docker compose
# pull` yiqilardi, `set -e` skriptni to'xtatardi va tozalash HECH QACHON
# ishlamasdi — ya'ni eng kerakli paytda o'chiq bo'lardi (2026-07-26 hodisasi:
# 23 ta eski image 34 GB, disk 100%, postgres halokati).
KEEP=3 "$(dirname "$0")/docker-gc.sh" || true

# Bu ishga tushirish uchun tegni muhitga beramiz (compose shundan o'qiydi).
# .env ga YOZMAYMIZ — hali image mavjudligiga ishonchimiz yo'q.
export TP_IMAGE="${TAG}"

# --- Aynan shu SHA image'ni tortamiz (latest EMAS) -------------------------
# CI hali tugamagan bo'lsa bu yiqiladi va skript to'xtaydi — 3 daqiqadan keyingi
# cron qayta uradi. Shuning uchun pre-deploy dump PULL'DAN KEYIN turadi:
# qurilmagan image uchun bekorga dump olinmasin.
sudo -E docker compose pull --quiet

# --- Pre-deploy DB backup (postgres ishlab turgan bo'lsa) -------------------
# Postgres tushib qolmagan bo'lsa — rollback uchun dump. Endi faqat HAQIQIY
# deployda olinadi, ya'ni oxirgi 14 ta dump = oxirgi 14 ta reliz.
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
# Faqat haqiqiy deployda yoziladi (tez chiqish yuqorida) — shu sabab 2-qator
# ROSTDAN ham oldingi reliz bo'ladi va rollback.sh unga qaytara oladi.
printf '%s\t%s\n' "${SHA}" "$(date '+%F %T')" | cat - .deploy-history 2>/dev/null | head -20 > .deploy-history.tmp
mv .deploy-history.tmp .deploy-history

echo "$(date '+%F %T') — deployed ${SHA}"
