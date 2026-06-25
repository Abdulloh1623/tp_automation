// Telegram interaktiv bot (grammy) — boshliq/admin uchun menyu.
// Long-polling bilan worker (scripts/bot.ts) ichida ishga tushadi.

import { Bot, InlineKeyboard, type Context } from "grammy";
import { botToken } from "./telegram";
import { userRoleLabel } from "./constants";
import { buildReport, buildReportAlbum, type ReportKind } from "./reports";
import { sendToChannel, sendAlbumToChannel, escapeHtml } from "./telegram";
import {
  resolveActor,
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
    .text("📈 Hisobot yuborish", "report");
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

  // Kirish nazorati: /start har doim, qolgani faqat ruxsat berilganlarga
  bot.use(async (ctx, next) => {
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

  bot.callbackQuery("report", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Qaysi hisobot?", {
      reply_markup: new InlineKeyboard()
        .text("Kunlik", "report:daily")
        .text("Haftalik", "report:weekly")
        .text("Oylik", "report:monthly")
        .row()
        .text("⬅️ Orqaga", "menu"),
    });
  });
  bot.callbackQuery(/^report:(daily|weekly|monthly)$/, async (ctx) => {
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
