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

### Backup shifrlash

Telegramga yuboriladigan nusxa `BACKUP_ENCRYPTION_KEY` berilgan bo'lsa
AES-256-GCM bilan shifrlanadi (fayl `.enc` bilan tugaydi). Lokal (`backups`
hajmidagi) nusxa shifrlanmaydi — u serverning o'zida turadi va tiklashda tez
kerak bo'ladi.

Kalit **serverdagi `.env` da turmasligi kerak**: aks holda serverga kirgan
hujumchi ham dump'ni, ham kalitni oladi. Uni parol menejerida saqlang.
Shifrlangan nusxani ochish (istalgan mashinada):

```bash
BACKUP_ENCRYPTION_KEY='...' npx tsx scripts/decrypt-backup.ts db-2026....sql.gz.enc
gunzip -c db-2026....sql.gz | psql "$DATABASE_URL"
```

Kalit qo'yilmasa dump shifrlanmagan ketadi va Telegram caption'ida
"⚠️ SHIFRLANMAGAN" ogohlantirishi ko'rinadi.

> **Kalitni yo'qotsangiz, Telegramdagi nusxalarni ochib bo'lmaydi.** Lokal
> `backups` hajmi shifrlanmagan bo'lgani uchun tiklash imkoni saqlanadi, lekin
> kalitni ishonchli joyda saqlang.

## 7. Yangilash (deploy) va rollback

Kod **serverda BUILD QILINMAYDI** — `main`'ga push bo'lганда GitHub Actions
(`deploy.yml`) image quradi va GHCR'ga ikkita teg bilan yuklaydi: `:latest` va
`:<git-sha>` (immutable). Server faqat tayyor image'ni **pull** qiladi
(kichik EC2'da `next build` OOM'ini butunlay yo'q qiladi).

**Deploy (serverda):**

```bash
cd tp_automation
./scripts/deploy-pull.sh          # pre-deploy pg_dump → git pull → SHA'ga pin → up -d
docker compose logs -f app worker # loglar
```

> ### ⚠️ BIR MARTALIK: konteyner endi `node` (root emas) foydalanuvchisi ostida ishlaydi
>
> Xavfsizlik uchun image'ga `USER node` qo'shildi. Mavjud `uploads` va
> `backups` hajmlari **root egaligida** yaratilgan, shu bois yangi versiya
> ularga yoza olmaydi (chek yuklash va backup ishlamay qoladi).
>
> Yangi image'ga o'tishdan oldin **bir marta** ishga tushiring:
>
> ```bash
> docker compose down
> docker run --rm -v tp_automation_uploads:/u -v tp_automation_backups:/b \
>   alpine sh -c 'chown -R 1000:1000 /u /b'
> ./scripts/deploy-pull.sh
> ```
>
> (Hajm nomlarini `docker volume ls` bilan tekshiring — prefiks papka nomiga
> qarab farq qilishi mumkin.) Keyin cheklar sahifasiga rasm yuklab va
> `docker compose exec worker npm run bot -- --backup` bilan tekshiring.

`deploy-pull.sh` har deployда:
1. **pre-deploy `pg_dump`** oladi (`backups/pre-deploy/`) — rollback uchun mos DB nusxasi;
2. `TP_IMAGE` ni joriy commit **SHA**'ga pin qiladi va `.env`'ga saqlaydi
   (reboot/manual `up -d` ham aynan shu versiyada qoladi — `:latest` emas);
3. `.deploy-history`'ga yozadi (rollback shundan foydalanadi).

**Rollback (buzuq reliz bo'lsa):**

```bash
./scripts/rollback.sh             # bir oldingi deployga qaytadi
./scripts/rollback.sh <git-sha>   # aniq versiyaga qaytadi
./scripts/rollback.sh --list      # so'nggi deploylar ro'yxati
```

Oldingi image lokalda tag'langan (dangling emas) → `image prune` uni o'chirmaydi →
rollback tarmoqsiz, bir necha soniyada bajariladi. Deploy skripti oxirgi **8**
reliz image'ini saqlaydi (`KEEP` — `deploy-pull.sh`), eskilarini o'chiradi (disk
to'lib qolmasin). Undan eskiroq relizga rollback qilinsa image GHCR'dan qayta
tortiladi (tarmoq kerak, lekin ishlaydi).

> ⚠️ **Schema rollback:** `rollback.sh` faqat **app image**'ini qaytaradi. Prisma
> migratsiyalari `up -d`'da avtomatik qo'llanadi va **avtomatik orqaga qaytmaydi**.
> Migratsiyalarни **additive** (ustun o'chirmaydigan/nom o'zgartirmaydigan) qilib
> yozing — shunda image rollback har doim xavfsiz. Agar reliz destructive migratsiya
> bo'lsa, mos `backups/pre-deploy/*.sql.gz` dump'ini tiklang.

## 8. Foydali buyruqlar

```bash
docker compose logs -f app            # app loglari
docker compose logs -f worker         # bot/cron loglari
docker compose restart app            # qayta ishga tushirish
docker compose exec postgres psql -U tp -d tp_automation   # bazaga kirish
docker compose down                   # to'xtatish (ma'lumot saqlanadi — volume'da)
```

## 9. "database system is in recovery mode" — tashxis

**Alomat:** Telegram xato kanalida `PrismaClientUnknownRequestError: ... FATAL: the
database system is in recovery mode` (ko'pincha cron vaqtida: 08:00 taqsimot, 03:00 backup).

**Ma'nosi:** postgres o'chib qolmagan — uning bitta backend jarayoni **abnormal
o'lgan** (PANIC yoki signal), shundan keyin postmaster hamma ulanishni uzib WAL'ni
qayta o'ynatadi (crash recovery) va shu davrda har qanday so'rovni `FATAL` bilan
rad etadi. Sovuq ishga tushishda xabar boshqacha bo'lardi — `the database system
is starting up`, ya'ni bu **restart/deploy/reboot emas**.

Ikki asosiy sabab: **disk to'lgan** (birinchi tekshiring) yoki **xotira (OOM)**.

### Avval: disk

Postgres WAL yozolmasa PANIC qiladi → crash recovery → tizim to'liq to'xtaydi.
2026-07-26/27 hodisasi aynan shu bo'lgan (`could not extend file ...: No space
left on device`, keyingi kuni taqsimot recovery mode'ga urilgan).

```bash
df -h /                                   # 100% bo'lsa — sabab shu
docker system df                          # image/konteyner/volume/log hajmi
sudo du -sh /var/lib/docker/containers/*  # konteyner loglari
docker compose exec worker du -sh /app/backups /app/uploads
docker compose logs postgres | grep -i "no space left"
```

Tozalash (xavfsiz tartibda):

```bash
docker system prune -af                   # ishlatilmayotgan image/konteyner
docker compose exec worker sh -c 'ls -1t /app/backups | tail -n +8 | xargs -r -I{} rm -rf /app/backups/{}'
sudo truncate -s 0 /var/lib/docker/containers/*/*-json.log   # eski loglar
```

Disk bo'shagach postgres o'zi tiklanadi; tiklanmasa `docker compose restart postgres`
va logda `database system is ready to accept connections` ni kuting.

Diskni to'ldiradigan odatiy manbalar va ularning cheklovi:

| Manba | Cheklov |
| --- | --- |
| Konteyner loglari | `logging: json-file, max-size 10m × 3` (compose'da) |
| Kunlik backup | 14 kun (`KEEP`, `lib/backup.ts`); cheklar **hard link** bilan (nusxa emas) |
| Pre-deploy dump | oxirgi 14 ta (`scripts/deploy-pull.sh`) |
| Eski image'lar | oxirgi 8 reliz (`scripts/deploy-pull.sh`) |

### Keyin: xotira (OOM)

```bash
sudo dmesg -T | grep -iE "out of memory|killed process|memory cgroup" | tail -20
docker compose logs postgres | grep -iE "terminated by signal"
free -m && docker stats --no-stream
```

`server process ... was terminated by signal 9: Killed` + dmesg'da OOM bo'lsa —
xotira. Diqqat: `docker inspect .State.OOMKilled` faqat PID 1 uchun, backend
o'ldirilsa `false` qoladi va `RestartCount` ham o'zgarmaydi — bu OOM'ni **inkor
etmaydi**. `dmesg`/`journalctl -k` esa faqat joriy boot'ni ko'rsatadi.

`t3.small` = 2 GB, konteyner limitlari yig'indisi 768 + 640 + 448 + 128 + 64 =
**2048 MB** — OS uchun zaxira qolmaydi. Yechim: 2 GB swap (`free -m` da bormi
tekshiring), yoki `t3.medium`, yoki limitlarni ~1.7 GB gacha tushirish.

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**Kod tomondan:** fon ishlari (cron) o'tkinchi DB uzilishida ~1 daqiqagacha kutib
qayta uriladi (`withDbJobRetry`), disk bo'sh joyi har kuni 07:00 da tekshiriladi
va kamaysa xato kanaliga ogohlantirish boradi (`lib/disk.ts`), backup esa disk
to'lgan bo'lsa yozishga urinmaydi.

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
