# TP Automation — Deploy qo'llanmasi (AWS EC2 + Docker Compose)

Bu tizim 3 qismdan iborat: **app** (Next.js web), **worker** (Telegram bot + cron:
hisobot/eslatma/kunlik taqsimot/backup) va **PostgreSQL**. Hammasi bitta Docker image'dan
ishlaydi (`Dockerfile`), `docker-compose.yml` ularni birga ko'taradi.

> Eslatma: bu app uzluksiz worker, fayl yuklash (cheklar) va `pg_dump` backup ishlatadi —
> shuning uchun **EC2 + Docker Compose** (yoki ECS) mos; Vercel kabi serverless mos kelmaydi.

---

## 1. AWS EC2 tayyorlash

1. **EC2 instance**: Ubuntu 22.04 LTS, `t3.small` (2 GB RAM) yoki kattaroq, 20+ GB disk.
2. **Security Group** (kiruvchi portlar):
   - `22` (SSH) — faqat o'z IP'ingizdan.
   - `80` va `443` (HTTP/HTTPS) — hammaga (reverse proxy uchun).
   - `3100` ni **ochmang** (faqat ichki); `5432` ni ham **ochmang** (baza tashqariga chiqmasin).
3. **Elastic IP** biriktiring (IP o'zgarmasligi uchun) va domeningizni shu IP'ga yo'naltiring (A record).

## 2. Serverga Docker o'rnatish

```bash
ssh ubuntu@<EC2-IP>
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker ubuntu && newgrp docker   # docker'ni sudo'siz ishlatish
```

## 3. Kodni olish va sozlash

```bash
git clone https://github.com/Abdulloh1623/tp_automation.git
cd tp_automation
cp .env.example .env
nano .env
```

`.env` da to'ldiring:
- `POSTGRES_PASSWORD` — kuchli parol; `DATABASE_URL` ichidagi parol bilan **bir xil** bo'lsin
  (host = `postgres`, port `5432`).
- `SESSION_SECRET` — `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` bilan generatsiya.
- `ADMIN_PASSWORD` — birinchi admin paroli (keyin create-admin uchun).
- `TELEGRAM_BOT_TOKEN` va kanal ID'lari (ixtiyoriy — bo'sh bo'lsa log rejimi).

## 4. Birinchi ishga tushirish

```bash
docker compose up -d --build      # image quriladi, migratsiya bajariladi, app+worker ko'tariladi
docker compose run --rm app npm run create-admin   # birinchi ADMIN (ADMIN_* .env dan)
docker compose ps                 # holat: postgres+app+worker = up, migrate = exited(0)
curl -fsS http://localhost:3100/api/health         # {"status":"ok","db":"up"}
```

Endi `http://<EC2-IP>:3100` (yoki domen) orqali kiring — `admin` / `.env`'dagi parol.

> **Haqiqiy data**: bo'sh bazaga sxema migratsiya bilan yaratiladi. Mavjud mijozlarni
> import qilish uchun `/import` (ADMIN) sahifasidan CSV yuklang. `npm run db:seed` ni
> **prod'da ishlatMANG** — u bazani tozalaydi (faqat lokal demo uchun).

## 5. HTTPS (reverse proxy)

Eng oson — **Caddy** (avtomatik Let's Encrypt sertifikat). Serverda:

```bash
# /etc/caddy/Caddyfile
crm.sizning-domen.uz {
    reverse_proxy localhost:3100
}
```
Caddy o'rnatib ishga tushiring (yoki ALB/nginx ishlating). HSTS sarlavhasi app'da allaqachon bor.
Caddy 80/443 ni egallaydi, app esa faqat `localhost:3100` da qoladi.

## 6. Backup

Worker har kuni 03:00 (Asia/Tashkent) `pg_dump` (gzip) qiladi → `backups` hajmiga + Telegram backup kanaliga.
Tekshirish / qo'lda:
```bash
docker compose exec worker npm run bot -- --backup
docker compose exec worker ls -lh backups
```
Tavsiya: `backups` hajmini kuniga bir marta **S3**'ga sync qiling (cron + `aws s3 sync`), offsite nusxa uchun.

## 7. Yangilash (deploy)

```bash
cd tp_automation
git pull
docker compose up -d --build      # migratsiya avtomatik qo'llanadi
docker compose logs -f app worker # loglar
```

## 8. Foydali buyruqlar

```bash
docker compose logs -f app            # app loglari
docker compose logs -f worker         # bot/cron loglari
docker compose restart app            # qayta ishga tushirish
docker compose exec postgres psql -U tp -d tp_automation   # bazaga kirish
docker compose down                   # to'xtatish (ma'lumot saqlanadi — volume'da)
```

---

## Muqobil: RDS (boshqariladigan baza)

`postgres` xizmatini olib tashlab, AWS RDS PostgreSQL 16 ishlatishingiz mumkin:
- `DATABASE_URL` ni RDS endpoint'iga yo'naltiring (`...@<rds-endpoint>:5432/...?schema=public&sslmode=require`).
- `docker-compose.yml`'dan `postgres` xizmati va undagi `depends_on: postgres` larni olib tashlang
  (`migrate`/`app`/`worker` faqat RDS'ga ulanadi).
- RDS avtomatik backup yoqilsa, worker backup'i qo'shimcha himoya bo'ladi.

## Muqobil: ECS/Fargate

Bir xil image ishlatiladi: 2 ta service (app: `npm run start`, worker: `npm run bot`),
migratsiya — bir martalik task (`npm run db:deploy`), baza — RDS, fayllar (cheklar) — EFS yoki S3.
Bu kattaroq miqyos uchun; hozirgi hajm (≈350 mijoz) uchun EC2+Compose yetarli.

## Eslatmalar / xavfsizlik

- Login sahifasidagi demo akkauntlar `NODE_ENV=production` da **ko'rinmaydi** (image'da `NODE_ENV=production`).
- `.env` hech qachon git'ga tushmaydi (`.gitignore`), image'ga ham (`.dockerignore`).
- Cheklar (`uploads`) va backuplar Docker **volume**'larida — `docker compose down` ularni o'chirmaydi
  (`down -v` esa o'chiradi — ehtiyot bo'ling).
- Vaqt mintaqasi: worker `TZ=Asia/Tashkent` (cron jadvallari shunга bog'liq).
