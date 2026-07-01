#!/bin/bash
# Registry-based deploy — serverda ishlaydi (cron yoki qo'lda).
# Kod image'da (GHCR), shuning uchun serverda BUILD BO'LMAYDI → OOM yo'q.
# Faqat yangi image'ni tortadi va migrate + app'ni qayta ishga tushiradi.
set -e
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
cd /home/ubuntu/tp_automation || exit 1

# docker-compose.yml / config o'zgarishlari uchun (KOD emas — kod image'da)
git pull --rebase --autostash origin main --quiet || true

# Yangi image'ni tortamiz (o'zgarmagan bo'lsa — tez, hech nima yuklamaydi)
sudo docker compose pull --quiet

# up -d: image digest o'zgargan bo'lsa konteynerlarni qayta yaratadi
# (migrate yangi migratsiyalarni qo'llaydi), aks holda no-op.
sudo docker compose up -d

# Eski image qatlamlarini tozalash (disk to'lmasin)
sudo docker image prune -f >/dev/null 2>&1 || true

echo "$(date '+%F %T') — deploy tekshirildi"
