#!/bin/bash
# Docker "axlat yig'ish" — diskni eski image'lar to'ldirib qo'yishining oldini oladi.
#
# NEGA KERAK: har deploy GHCR'dan yangi SHA-tegli image tortadi (~1.5 GB). Teg
# bo'lgani uchun `docker image prune -f` uni O'CHIRMAYDI, va agar deploy
# `deploy-pull.sh` orqali emas, qo'lda (`docker compose pull && up -d`) qilinsa
# hech qanday tozalash bo'lmaydi. 2026-07-26 da shu tarzda 23 ta image 34 GB
# egallab, disk 100% to'lgan → postgres WAL yozolmay halokatga uchragan
# ("the database system is in recovery mode") va butun tizim to'xtagan.
#
# XAVFSIZ: ishlab turgan konteyner ishlatayotgan image'ni docker o'chira olmaydi.
# O'chirilgan reliz kerak bo'lsa `rollback.sh` uni GHCR'dan qayta tortadi.
#
# O'rnatish (serverda BIR MARTA — deploydan mustaqil ishlashi uchun):
#   crontab -e
#   17 4 * * * /home/ubuntu/tp_automation/scripts/docker-gc.sh >> /home/ubuntu/docker-gc.log 2>&1
#
# Qo'lda: ./scripts/docker-gc.sh        yoki      KEEP=5 ./scripts/docker-gc.sh
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

IMAGE_REPO="${IMAGE_REPO:-ghcr.io/abdulloh1623/tp_automation}"
# Nechta oxirgi reliz saqlansin. 2 = joriy + bitta orqaga qaytish varianti
# (lokal, tarmoqsiz). Undan eskisi kerak bo'lsa rollback.sh GHCR'dan tortadi.
# Har bir image ~1.5 GB — ko'p saqlash qimmat, shu sabab default kichik.
KEEP="${KEEP:-2}"

# ubuntu docker guruhida bo'lmasa sudo bilan ishlaymiz; ikkalasi ham ishlamasa
# jimgina chiqamiz (deploy skripti buni chaqiradi — u to'xtab qolmasin).
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
  else
    echo "docker'ga ulanib bo'lmadi — tozalash o'tkazib yuborildi"
    exit 0
  fi
fi

echo "=== $(date '+%F %T') docker-gc (KEEP=${KEEP}) ==="
df -h / | tail -1

# 1) To'xtagan konteynerlar, tegsiz (dangling) qatlamlar, build kesh
$DOCKER container prune -f >/dev/null 2>&1 || true
$DOCKER image prune -f >/dev/null 2>&1 || true
$DOCKER builder prune -f >/dev/null 2>&1 || true

# 2) Eski reliz image'lari — eng yangi KEEP tasi qoladi.
#    `docker images` yangidan-eskiga tartiblangan.
$DOCKER images --format '{{.Repository}}:{{.Tag}}' "${IMAGE_REPO}" \
  | grep -v ':<none>$' \
  | tail -n +$((KEEP + 1)) \
  | while read -r tag; do
      if $DOCKER rmi "$tag" >/dev/null 2>&1; then
        echo "o'chirildi: ${tag}"
      else
        echo "band — qoldirildi: ${tag}"
      fi
    done || true

df -h / | tail -1
