// Telegram interaktiv bot (grammy) — boshliq/admin uchun menyu.
// Long-polling bilan worker (scripts/bot.ts) ichida ishga tushadi.

import { RateLimiter } from "./rate-limit";
import { Bot, InlineKeyboard, type Context } from "grammy";
import { botToken, receiptsGroupId } from "./telegram";
import { intakeReceiptFile, intakeReceiptText } from "./receipt-intake-service";
import {
  userRoleLabel,
  LEAD_PRIORITY_PROFILES,
  isLeadProfileId,
  leadProfileLabel,
  type LeadProfileId,
} from "./constants";
import { getActiveLeadProfile, setLeadProfile } from "./settings";
import { logAudit } from "./audit";
import { buildReport, buildReportAlbum, startOfTzDay, type ReportKind } from "./reports";
import { distributeLeadsCore } from "./leads-distribution";
import { sendDailyReminders } from "./reminders";
import { createBackup } from "./backup";
import { getDiskUsage } from "./disk";
import { db } from "./db";
import { sendToChannel, sendAlbumToChannel, escapeHtml } from "./telegram";
import {
  approveButtons,
  rejectReasonButtons,
  resolveCardPayment,
} from "./card-payment";
import {
  resolveActor,
  resolveCardVerifier,
  listEmployees,
  addEmployee,
  changePassword,
  setDailyTarget,
  grantExtraLeads,
  type Actor,
} from "./bot-service";

// Suhbat holati (chat id bo'yicha)
type Flow =
  | { name: "add"; step: "name" | "username" | "password" | "region"; data: { role?: string; name?: string; username?: string; password?: string } }
  | { name: "pw"; step: "value"; data: { userId?: string; userName?: string } }
  | { name: "target"; step: "value"; data: { userId?: string; userName?: string } }
  | { name: "extra"; step: "value"; data: { userId?: string; userName?: string } };

const flows = new Map<number, Flow>();

function mainMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("➕ Operator qo'shish", "add").row()
    .text("🔑 Parol o'zgartirish", "pw").row()
    .text("📊 Kunlik lid soni", "target").row()
    .text("📅 1 kunlik qo'shimcha lid", "extra").row()
    .text("📈 Hisobot yuborish", "report").row()
    .text("🛠 Xizmat (holat / qayta yurgizish)", "ops");
}

async function showMenu(ctx: Context, actor: Actor) {
  await ctx.reply(
    `👋 <b>${escapeHtml(actor.name)}</b> (${userRoleLabel(actor.role)})\nKerakli amalni tanlang:`,
    { parse_mode: "HTML", reply_markup: mainMenu() },
  );
}

async function employeeKeyboard(prefix: string): Promise<InlineKeyboard> {
  const emps = await listEmployees();
  const kb = new InlineKeyboard();
  for (const e of emps) {
    kb.text(`${e.name} — ${userRoleLabel(e.role)}`, `${prefix}:${e.id}`).row();
  }
  kb.text("⬅️ Orqaga", "menu");
  return kb;
}


export async function startBot(): Promise<void> {
  const token = botToken();
  if (!token) {
    console.log("[bot] token yo'q — bot ishga tushmadi");
    return;
  }

  const bot = new Bot(token);

  // --- "To'lov cheklari" guruhi: chek qabul qilish ---
  // Auth middleware'dan OLDIN turadi: guruhdagi xodimlarning ko'pchiligida bot
  // ruxsati yo'q, middleware esa har xabarga "ruxsat yo'q" deb javob berib
  // guruhni spamlagan bo'lardi.
  const receiptsGroup = receiptsGroupId();
  const inReceiptsGroup = (ctx: Context): boolean =>
    !!receiptsGroup && String(ctx.chat?.id) === receiptsGroup;

  // Guruhga yozish uchun CRM hisobi kerak emas — guruh a'zosi bo'lish yetarli.
  // Har fayl Telegramdan yuklab olinadi (20MB gacha), diskka yoziladi va
  // mijozni topish uchun butun Client jadvali skanerlanadi. Cheklovsiz bu
  // uploads hajmini to'ldirish va navbatni ko'mib tashlash uchun ishlatilishi
  // mumkin. Yuboruvchi bo'yicha soatiga 30 ta fayl / 60 ta matn.
  const receiptFileLimit = new RateLimiter(30, 60 * 60 * 1000);
  const receiptTextLimit = new RateLimiter(60, 60 * 60 * 1000);

  bot.on(["message:photo", "message:document"], async (ctx, next) => {
    if (!inReceiptsGroup(ctx)) return next();

    const msg = ctx.message!;
    // Rasmning eng katta o'lchamini olamiz (oxirgi element)
    const photo = msg.photo?.at(-1);
    const doc = msg.document;
    const fileId = photo?.file_id ?? doc?.file_id;
    if (!fileId) return;
    if (!receiptFileLimit.allow(String(ctx.from?.id ?? "noma'lum"))) {
      console.warn("[bot:cheklar] rate-limit: fayl o'tkazib yuborildi, sender:", ctx.from?.id);
      return;
    }
    const mime = photo ? "image/jpeg" : (doc?.mime_type ?? "");

    const res = await intakeReceiptFile({
      chatId: ctx.chat!.id,
      messageId: msg.message_id,
      senderId: ctx.from?.id ?? 0,
      senderName: ctx.from ? [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") : null,
      fileId,
      mime,
      caption: msg.caption,
    });

    if (!res.ok) {
      console.error("[bot:cheklar] chek qabul qilinmadi:", res.error);
      return;
    }
    // Guruhda javob yozmaymiz — xodimlarning ish oqimini buzmaslik uchun.
    // Chek /tolovlar sahifasidagi "Telegramdan" bo'limida ko'rinadi.
  });

  bot.on("message:text", async (ctx, next) => {
    if (!inReceiptsGroup(ctx)) return next();
    const text = ctx.message.text.trim();
    if (!text || text.startsWith("/")) return;
    if (!receiptTextLimit.allow(String(ctx.from?.id ?? "noma'lum"))) return;
    await intakeReceiptText({
      chatId: ctx.chat!.id,
      senderId: ctx.from?.id ?? 0,
      senderName: ctx.from ? [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") : null,
      text,
    });
  });

  // --- Karta to'lovini tasdiqlash (kartaga dostupi bor xodim) ---
  // Auth middleware'dan OLDIN: tasdiqlovchi ADMIN/MANAGER bo'lishi shart emas,
  // shu sabab o'z tekshiruvini o'zi qiladi (resolveCardVerifier).
  bot.callbackQuery(/^cardpay:(ok|no|back):([^:]+)(?::([A-Z_]+))?$/, async (ctx) => {
    const [, action, requestId, reasonCode] = ctx.match as unknown as string[];
    const verifier = ctx.from?.id ? await resolveCardVerifier(ctx.from.id) : null;
    if (!verifier) {
      await ctx.answerCallbackQuery({
        text: "Sizda karta to'lovini tasdiqlash huquqi yo'q",
        show_alert: true,
      });
      return;
    }
    const actor = { userId: verifier.id, name: verifier.name };

    // "Rad etish" bosilganda avval sababni so'raymiz (matn yozish shart emas)
    if (action === "no" && !reasonCode) {
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup({
        reply_markup: { inline_keyboard: rejectReasonButtons(requestId) },
      });
      return;
    }
    if (action === "back") {
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup({
        reply_markup: { inline_keyboard: approveButtons(requestId) },
      });
      return;
    }

    const res = await resolveCardPayment(requestId, {
      approve: action === "ok",
      actor,
      via: "TELEGRAM",
      reason: reasonCode,
    });
    await ctx.answerCallbackQuery({
      text: res.ok
        ? action === "ok"
          ? "To'lov tasdiqlandi"
          : "To'lov rad etildi"
        : res.error,
      show_alert: !res.ok,
    });
  });

  // Kirish nazorati: /start har doim, qolgani faqat ruxsat berilganlarga
  bot.use(async (ctx, next) => {
    // Guruhlarda menyu ishlamaydi — "ruxsat yo'q" javoblari bilan spamlamaymiz
    if (ctx.chat && ctx.chat.type !== "private") return;
    const tgId = ctx.from?.id;
    const text = ctx.message?.text ?? "";
    if (text.startsWith("/start")) return next();
    if (!tgId) return;
    const actor = await resolveActor(tgId);
    if (!actor) {
      await ctx.reply(
        `⛔️ Sizda bot ruxsati yo'q.\nSizning Telegram ID: <code>${tgId}</code>\nAdmin shu ID'ni profilingizga ulashi kerak.`,
        { parse_mode: "HTML" },
      );
      return;
    }
    // actor'ni keyingi handlerlar uchun saqlaymiz
    (ctx as Context & { actor: Actor }).actor = actor;
    return next();
  });

  bot.command("start", async (ctx) => {
    const tgId = ctx.from?.id;
    const actor = tgId ? await resolveActor(tgId) : null;
    if (!actor) {
      // Menyu huquqi yo'q, lekin karta tasdiqlovchisi bo'lishi mumkin —
      // unga "ruxsat yo'q" deyish chalg'ituvchi bo'lardi.
      const verifier = tgId ? await resolveCardVerifier(tgId) : null;
      if (verifier) {
        await ctx.reply(
          `👋 <b>${escapeHtml(verifier.name)}</b>\n\nSiz karta to'lovlarini tasdiqlaysiz.\n` +
            `Yangi karta/QR to'lovi kiritilganda chek, summa va vaqt shu yerga keladi — ` +
            `pul kartaga tushganini tekshirib, <b>✅ Tasdiqlash</b> yoki <b>❌ Rad etish</b> tugmasini bosing.\n\n` +
            `Tasdiqlanmagan to'lov hisobga olinmaydi.`,
          { parse_mode: "HTML" },
        );
        return;
      }
      await ctx.reply(
        `Salom! Bu — TP Automation boshqaruv boti.\nSizning Telegram ID: <code>${tgId}</code>\nFoydalanish uchun admin shu ID'ni profilingizga ulashi kerak.`,
        { parse_mode: "HTML" },
      );
      return;
    }
    flows.delete(ctx.chat!.id);
    await showMenu(ctx, actor);
  });

  bot.command("bekor", async (ctx) => {
    flows.delete(ctx.chat!.id);
    await ctx.reply("Bekor qilindi.");
  });

  // --- Menyu tugmalari ---
  bot.callbackQuery("menu", async (ctx) => {
    flows.delete(ctx.chat!.id);
    await ctx.answerCallbackQuery();
    await showMenu(ctx, (ctx as Context & { actor: Actor }).actor);
  });

  bot.callbackQuery("add", async (ctx) => {
    // Ustalar login'siz (/ustalar sahifasida) — bot orqali faqat OPERATOR qo'shiladi
    flows.set(ctx.chat!.id, { name: "add", step: "name", data: { role: "OPERATOR" } });
    await ctx.answerCallbackQuery();
    await ctx.reply("Yangi operator ism-familiyasini yuboring:");
  });

  bot.callbackQuery("pw", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Kimning parolini o'zgartiramiz?", {
      reply_markup: await employeeKeyboard("pw_user"),
    });
  });
  bot.callbackQuery(/^pw_user:(.+)$/, async (ctx) => {
    const userId = ctx.match![1];
    const emps = await listEmployees();
    const u = emps.find((e) => e.id === userId);
    flows.set(ctx.chat!.id, { name: "pw", step: "value", data: { userId, userName: u?.name } });
    await ctx.answerCallbackQuery();
    await ctx.reply(`<b>${escapeHtml(u?.name ?? "Xodim")}</b> uchun yangi parolni yuboring:`, {
      parse_mode: "HTML",
    });
  });

  bot.callbackQuery("target", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Kimning kunlik lid sonini o'zgartiramiz?", {
      reply_markup: await employeeKeyboard("target_user"),
    });
  });
  bot.callbackQuery(/^target_user:(.+)$/, async (ctx) => {
    const userId = ctx.match![1];
    const emps = await listEmployees();
    const u = emps.find((e) => e.id === userId);
    flows.set(ctx.chat!.id, { name: "target", step: "value", data: { userId, userName: u?.name } });
    await ctx.answerCallbackQuery();
    await ctx.reply(`<b>${escapeHtml(u?.name ?? "Xodim")}</b> uchun kunlik lid sonini yuboring (masalan 25):`, {
      parse_mode: "HTML",
    });
  });

  bot.callbackQuery("extra", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Kimga bugun qo'shimcha lid beramiz?", {
      reply_markup: await employeeKeyboard("extra_user"),
    });
  });
  bot.callbackQuery(/^extra_user:(.+)$/, async (ctx) => {
    const userId = ctx.match![1];
    const emps = await listEmployees();
    const u = emps.find((e) => e.id === userId);
    flows.set(ctx.chat!.id, { name: "extra", step: "value", data: { userId, userName: u?.name } });
    await ctx.answerCallbackQuery();
    await ctx.reply(`<b>${escapeHtml(u?.name ?? "Xodim")}</b> uchun bugungi qo'shimcha lid sonini yuboring:`, {
      parse_mode: "HTML",
    });
  });

  // --- 🛠 Xizmat menyusi: serverga SSH qilmasdan holatni ko'rish va
  // o'tkazib yuborilgan ishlarni qayta yurgizish. Faqat ADMIN.
  function opsMenu(): InlineKeyboard {
    return new InlineKeyboard()
      .text("📊 Holat", "ops_status").row()
      .text("🎯 Bugungi fokus", "ops_focus").row()
      .text("🔄 Taqsimotni qayta yurgizish", "ops_distribute").row()
      .text("🔔 Eslatmalarni yuborish", "ops_remind").row()
      .text("💾 Backup olish", "ops_backup").row()
      .text("⬅️ Orqaga", "menu");
  }

  /** Xizmat amallari faqat ADMIN uchun. */
  function opsAllowed(ctx: Context): boolean {
    return (ctx as Context & { actor?: Actor }).actor?.role === "ADMIN";
  }

  /** Audit muallifi — botda sessiya (cookie) yo'q, aktyorni aniq uzatamiz. */
  function actorOf(ctx: Context): { userId?: string; name?: string } {
    const a = (ctx as Context & { actor?: Actor }).actor;
    return { userId: a?.id, name: a?.name };
  }

  bot.callbackQuery("ops", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!opsAllowed(ctx)) {
      await ctx.reply("Bu bo'lim faqat admin uchun.");
      return;
    }
    await ctx.reply("🛠 <b>Xizmat</b> — kerakli amalni tanlang:", {
      parse_mode: "HTML",
      reply_markup: opsMenu(),
    });
  });

  bot.callbackQuery("ops_status", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!opsAllowed(ctx)) return;
    const started = Date.now();
    const [disk, clients, pendingCards, todayCalls] = await Promise.all([
      getDiskUsage(),
      db.client.count({ where: { status: "ACTIVE" } }),
      db.pendingCardPayment.count({ where: { status: "PENDING" } }),
      db.callLog.count({ where: { calledAt: { gte: startOfTzDay(0) } } }),
    ]);
    const dbMs = Date.now() - started;
    await ctx.reply(
      [
        "📊 <b>Tizim holati</b>",
        `💾 Disk: ${disk ? `${disk.freeGb} GB bo'sh / ${disk.totalGb} GB (band ${disk.usedPct}%)` : "aniqlanmadi"}`,
        `🗄 Baza: javob berdi (${dbMs} ms)`,
        `👥 Faol mijoz: ${clients}`,
        `📞 Bugungi qo'ng'iroq: ${todayCalls}`,
        `💳 Karta tasdig'i kutmoqda: ${pendingCards}`,
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  });

  // 🎯 Bugungi fokus — admin telefondan turib kunlik ustuvorlikni almashtiradi.
  // Bot orqali tanlov FAQAT BUGUNGA qo'yiladi (tezkor qaror); doimiy profilni
  // o'zgartirish web'da (/lidlar) qilinadi.
  bot.callbackQuery("ops_focus", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!opsAllowed(ctx)) return;
    const active = await getActiveLeadProfile();
    const kb = new InlineKeyboard();
    for (const id of Object.keys(LEAD_PRIORITY_PROFILES) as LeadProfileId[]) {
      kb.text(
        `${id === active.id ? "✅ " : ""}${LEAD_PRIORITY_PROFILES[id].label}`,
        `ops_focus_set:${id}`,
      ).row();
    }
    kb.text("⬅️ Orqaga", "ops");
    await ctx.reply(
      `🎯 <b>Bugungi fokus</b>: ${escapeHtml(leadProfileLabel(active.id))}` +
        (active.todayOnly ? " <i>(faqat bugunga)</i>" : "") +
        `\n<i>${escapeHtml(LEAD_PRIORITY_PROFILES[active.id].hint)}</i>\n\n` +
        "Yangi fokus faqat bugunga qo'yiladi — ertaga doimiy profil qaytadi.",
      { parse_mode: "HTML", reply_markup: kb },
    );
  });

  bot.callbackQuery(/^ops_focus_set:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!opsAllowed(ctx)) return;
    const id = ctx.match?.[1];
    if (!isLeadProfileId(id)) {
      await ctx.reply("⚠️ Noma'lum fokus profili");
      return;
    }
    await setLeadProfile(id, true);
    await logAudit("Kunlik fokus o'zgartirildi (bot)", {
      entity: "AppSetting",
      detail: `${leadProfileLabel(id)} (faqat bugunga)`,
      actor: actorOf(ctx),
    });
    await ctx.reply(
      `✅ Bugungi fokus: <b>${escapeHtml(leadProfileLabel(id))}</b>\n` +
        "Kuchga kirishi uchun «🔄 Taqsimotni qayta yurgizish»ni bosing.",
      { parse_mode: "HTML", reply_markup: opsMenu() },
    );
  });

  bot.callbackQuery("ops_distribute", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Taqsimot boshlandi…" });
    if (!opsAllowed(ctx)) return;
    try {
      const r = await distributeLeadsCore();
      await ctx.reply(
        r.error
          ? `⚠️ Taqsimot: ${escapeHtml(r.error)}`
          : `✅ Taqsimot tugadi: <b>${r.assigned}</b> mijoz ${r.operators} operatorga\n` +
            `🎯 Fokus: ${escapeHtml(r.profileLabel ?? "-")}${r.todayOnly ? " (faqat bugunga)" : ""}` +
            ` · majburiy: ${r.floor ?? 0} · egasida qoldi: ${r.kept ?? 0}`,
        { parse_mode: "HTML" },
      );
    } catch (e) {
      await ctx.reply(`❌ Taqsimot xatosi: ${escapeHtml(e instanceof Error ? e.message : String(e))}`, {
        parse_mode: "HTML",
      });
    }
  });

  bot.callbackQuery("ops_remind", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Eslatmalar yuborilmoqda…" });
    if (!opsAllowed(ctx)) return;
    try {
      const r = await sendDailyReminders();
      await ctx.reply(
        `✅ Eslatma: operatorlarga ${r.operators.sent} ta yuborildi` +
          ` (telegramsiz: ${r.operators.noTelegram}) · boshliq: ${r.managers.sent}`,
      );
    } catch (e) {
      await ctx.reply(`❌ Eslatma xatosi: ${escapeHtml(e instanceof Error ? e.message : String(e))}`, {
        parse_mode: "HTML",
      });
    }
  });

  bot.callbackQuery("ops_backup", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Backup olinmoqda…" });
    if (!opsAllowed(ctx)) return;
    try {
      const res = await createBackup();
      await ctx.reply(
        res.ok
          ? `✅ Backup: <code>${escapeHtml(res.name ?? "")}</code> · ${res.sizeKb} KB · cheklar: ${res.receipts} · Telegram: ${escapeHtml(res.telegram ?? "-")}`
          : `❌ Backup xatosi: ${escapeHtml(res.error ?? "noma'lum")}`,
        { parse_mode: "HTML" },
      );
    } catch (e) {
      await ctx.reply(`❌ Backup xatosi: ${escapeHtml(e instanceof Error ? e.message : String(e))}`, {
        parse_mode: "HTML",
      });
    }
  });

  bot.callbackQuery("report", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Qaysi hisobot?", {
      reply_markup: new InlineKeyboard()
        .text("☀️ Kunduzgi smena", "report:shift-day")
        .text("🌙 Kechki smena", "report:shift-night")
        .row()
        .text("Haftalik", "report:weekly")
        .text("Oylik", "report:monthly")
        .row()
        .text("⬅️ Orqaga", "menu"),
    });
  });
  bot.callbackQuery(/^report:(shift-day|shift-night|weekly|monthly)$/, async (ctx) => {
    const kind = ctx.match![1] as ReportKind;
    await ctx.answerCallbackQuery();
    await ctx.reply("⏳ Hisobot tayyorlanmoqda...");
    let res;
    try {
      const album = await buildReportAlbum(kind);
      res = await sendAlbumToChannel(album.images);
    } catch {
      res = await sendToChannel(await buildReport(kind)); // render xato — matn zaxira
    }
    await ctx.reply(
      res.ok
        ? res.mode === "log"
          ? "Hisobot tayyor (log rejimi — kanal IDsi sozlanmagan)."
          : "✅ Hisobot kanalga yuborildi."
        : `❌ Xatolik: ${res.error}`,
    );
  });

  // --- Matnli javoblar (flow bosqichlari) ---
  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const flow = flows.get(chatId);
    if (!flow) return; // menyu rejimida — e'tibor bermaymiz
    const actor = (ctx as Context & { actor: Actor }).actor;
    const value = ctx.message.text.trim();

    if (flow.name === "add") {
      if (flow.step === "name") {
        flow.data.name = value;
        flow.step = "username";
        await ctx.reply("Login (foydalanuvchi nomi) ni yuboring:");
        return;
      }
      if (flow.step === "username") {
        flow.data.username = value;
        flow.step = "password";
        await ctx.reply("Parolni yuboring:");
        return;
      }
      if (flow.step === "password") {
        flow.data.password = value;
        try { await ctx.deleteMessage(); } catch { /* parol xabarini o'chirishga urinish */ }
        const res = await addEmployee(actor, {
          name: flow.data.name!,
          username: flow.data.username!,
          password: flow.data.password!,
        });
        flows.delete(chatId);
        await ctx.reply(res.ok ? `✅ ${res.info}` : `❌ ${res.error}`);
        await showMenu(ctx, actor);
        return;
      }
    }

    if (flow.name === "pw" && flow.step === "value") {
      try { await ctx.deleteMessage(); } catch { /* parol xabarini o'chirish */ }
      const res = await changePassword(actor, flow.data.userId!, value);
      flows.delete(chatId);
      await ctx.reply(res.ok ? `✅ ${res.info}` : `❌ ${res.error}`);
      await showMenu(ctx, actor);
      return;
    }

    if (flow.name === "target" && flow.step === "value") {
      const res = await setDailyTarget(actor, flow.data.userId!, Number(value));
      flows.delete(chatId);
      await ctx.reply(res.ok ? `✅ ${res.info}` : `❌ ${res.error}`);
      await showMenu(ctx, actor);
      return;
    }

    if (flow.name === "extra" && flow.step === "value") {
      const res = await grantExtraLeads(actor, flow.data.userId!, Number(value));
      flows.delete(chatId);
      await ctx.reply(res.ok ? `✅ ${res.info}` : `❌ ${res.error}`);
      await showMenu(ctx, actor);
      return;
    }
  });

  bot.catch((err) => {
    console.error("[bot] xato:", err.error);
  });

  // Long-polling (bloklamasdan — cron ham ishlashi kerak)
  bot.start({
    onStart: (info) => console.log(`[bot] ishga tushdi: @${info.username}`),
  });
  console.log("[bot] polling boshlandi");
}
