import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d;
}

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function main() {
  console.log("Seed boshlandi...");

  // Tozalash (qayta ishga tushirilganda)
  await db.equipmentReturnRequest.deleteMany();
  await db.equipmentMovement.deleteMany();
  await db.inventoryStock.deleteMany();
  await db.clientEquipment.deleteMany();
  await db.equipmentType.deleteMany();
  await db.auditLog.deleteMany();
  await db.dailyLeadGrant.deleteMany();
  await db.callLog.deleteMany();
  await db.payment.deleteMany();
  await db.ticket.deleteMany();
  await db.clientPhone.deleteMany();
  await db.client.deleteMany();
  await db.user.deleteMany();

  // Barcha xodimlar uchun UMUMIY parol (loginlar har xil, parol bitta).
  const commonPass = await bcrypt.hash("parol123", 10);

  const admin = await db.user.create({
    data: {
      name: "Administrator",
      username: "admin",
      passwordHash: commonPass,
      role: "ADMIN",
      phone: "+998 90 000 00 00",
    },
  });

  const asadbek = await db.user.create({
    data: {
      name: "Asadbek",
      username: "asadbek",
      passwordHash: commonPass,
      role: "OPERATOR",
      phone: "+998 90 111 11 11",
      region: "Toshkent",
      dailyLeadTarget: 20,
    },
  });

  const suxrob = await db.user.create({
    data: {
      name: "Suxrob",
      username: "suxrob",
      passwordHash: commonPass,
      role: "OPERATOR",
      phone: "+998 90 222 22 22",
      region: "Samarqand",
      dailyLeadTarget: 20,
    },
  });

  // Usta (o'rnatuvchi / dala texnigi)
  const bekzod = await db.user.create({
    data: {
      name: "Bekzod (usta)",
      username: "bekzod",
      passwordHash: commonPass,
      role: "INSTALLER",
      phone: "+998 90 333 33 33",
      region: "Toshkent",
    },
  });

  // Texnik bo'lim boshlig'i (MANAGER)
  await db.user.create({
    data: {
      name: "Jahongir (boshliq)",
      username: "boshliq",
      passwordHash: commonPass,
      role: "MANAGER",
      phone: "+998 90 444 44 44",
      region: "Toshkent",
    },
  });

  // Texnika katalogi (standart narx)
  const eqPrinter = await db.equipmentType.create({
    data: { name: "Printer", rentalPrice: 2.5, salePrice: 90 },
  });
  const eqMono = await db.equipmentType.create({
    data: { name: "Monoblok", rentalPrice: 25, salePrice: 350 },
  });
  const eqWifi = await db.equipmentType.create({
    data: { name: "WiFi router", rentalPrice: 2, salePrice: 40 },
  });

  // Ombor qoldig'i
  for (const [t, q] of [
    [eqPrinter, 10],
    [eqMono, 8],
    [eqWifi, 15],
  ] as const) {
    await db.inventoryStock.create({
      data: {
        locationType: "WAREHOUSE",
        locationId: "WAREHOUSE",
        equipmentTypeId: t.id,
        quantity: q,
      },
    });
  }

  // Usta (bekzod) zaxirasi
  await db.inventoryStock.create({
    data: {
      locationType: "USTA",
      locationId: bekzod.id,
      equipmentTypeId: eqMono.id,
      quantity: 2,
    },
  });
  await db.inventoryStock.create({
    data: {
      locationType: "USTA",
      locationId: bekzod.id,
      equipmentTypeId: eqPrinter.id,
      quantity: 1,
    },
  });

  const operators = [asadbek, suxrob];
  const today = new Date();

  type SeedClient = {
    fullName: string;
    restaurantName: string;
    region: string;
    phone: string;
    contractNumber: string;
    contractMonthsAgo: number;
    installerName: string;
    monoblokCount: number;
    equipment: string;
    status: string;
    monthlyAmount: number;
    currency: string;
    nextPaymentInDays: number | null;
    notes?: string;
    callLogs?: {
      daysAgo: number;
      result: string;
      note?: string;
      followUpInDays?: number;
      operator?: number;
    }[];
    payments?: { monthsAgo: number; amount: number; currency: string; note?: string }[];
  };

  const clients: SeedClient[] = [
    {
      fullName: "Sardor Aliyev",
      restaurantName: "Osh Markazi",
      region: "Toshkent",
      phone: "+998 91 400 08 02",
      contractNumber: "SH-1001",
      contractMonthsAgo: 5,
      installerName: "Asadbek",
      monoblokCount: 2,
      equipment: "2 monoblok + chek printer + fiskal modul",
      status: "ACTIVE",
      monthlyAmount: 52,
      currency: "USD",
      nextPaymentInDays: -4,
      notes: "10$ chegirma qo'llanilgan (62$ → 52$).",
      callLogs: [
        { daysAgo: 1, result: "NO_ANSWER", note: "Telefonni ko'tarmadilar, SMS yozdim", followUpInDays: 0, operator: 0 },
        { daysAgo: 6, result: "TALKED", note: "Karta tashlab qo'ydim, to'lov qilamiz dedi", operator: 0 },
      ],
      payments: [{ monthsAgo: 1, amount: 52, currency: "USD", note: "Karta orqali" }],
    },
    {
      fullName: "Zamon Karimov",
      restaurantName: "FastFood Lavash",
      region: "Samarqand",
      phone: "+998 93 555 12 34",
      contractNumber: "SH-1002",
      contractMonthsAgo: 3,
      installerName: "Suxrob",
      monoblokCount: 1,
      equipment: "1 monoblok + chek printer",
      status: "ACTIVE",
      monthlyAmount: 40,
      currency: "USD",
      nextPaymentInDays: 0,
      notes: "Soliq cheki chiqmayapti — tekshirish kerak.",
      callLogs: [
        { daysAgo: 0, result: "TALKED", note: "Soliq chekini to'g'irlab berdim, ishlayapti", operator: 1 },
      ],
    },
    {
      fullName: "Shuxrat Yo'ldoshev",
      restaurantName: "Choyxona Diyor",
      region: "Xorazm",
      phone: "+998 97 700 45 67",
      contractNumber: "SH-1003",
      contractMonthsAgo: 7,
      installerName: "Asadbek",
      monoblokCount: 1,
      equipment: "1 monoblok",
      status: "ACTIVE",
      monthlyAmount: 35,
      currency: "USD",
      nextPaymentInDays: 5,
      callLogs: [
        { daysAgo: 2, result: "NO_ANSWER", note: "Ko'tarishmadi (2x), SMS yuborildi", followUpInDays: 0, operator: 0 },
        { daysAgo: 3, result: "PHONE_OFF", note: "Telefon o'chiq", operator: 0 },
      ],
    },
    {
      fullName: "Mashxur Rahimov",
      restaurantName: "Restoran Bahor",
      region: "Farg'ona",
      phone: "+998 94 321 76 54",
      contractNumber: "SH-1004",
      contractMonthsAgo: 2,
      installerName: "Suxrob",
      monoblokCount: 3,
      equipment: "3 monoblok + 2 chek printer + fiskal modul",
      status: "ACTIVE",
      monthlyAmount: 90,
      currency: "USD",
      nextPaymentInDays: 24,
      notes: "To'lov qildilar, chek olindi.",
      payments: [{ monthsAgo: 0, amount: 90, currency: "USD", note: "30 kunga ochildi" }],
      callLogs: [
        { daysAgo: 0, result: "RESOLVED", note: "To'lov qildilar, 30 kunga faollashtirildi", operator: 1 },
      ],
    },
    {
      fullName: "Subxon Tursunov",
      restaurantName: "Kafe Shirin",
      region: "Andijon",
      phone: "+998 99 888 33 22",
      contractNumber: "SH-1005",
      contractMonthsAgo: 9,
      installerName: "Asadbek",
      monoblokCount: 1,
      equipment: "1 monoblok + chek printer",
      status: "ACTIVE",
      monthlyAmount: 450000,
      currency: "UZS",
      nextPaymentInDays: -12,
      notes: "So'mda to'laydi. Qarzdor.",
      callLogs: [
        { daysAgo: 1, result: "BUSY", note: "Band (zaynit)", followUpInDays: 1, operator: 1 },
        { daysAgo: 4, result: "NO_ANSWER", note: "Ko'tarishmadi", operator: 1 },
      ],
    },
    {
      fullName: "Botir Ergashev",
      restaurantName: "Tandir Osh",
      region: "Buxoro",
      phone: "+998 90 444 55 66",
      contractNumber: "SH-1006",
      contractMonthsAgo: 1,
      installerName: "Suxrob",
      monoblokCount: 1,
      equipment: "1 monoblok",
      status: "PENDING",
      monthlyAmount: 40,
      currency: "USD",
      nextPaymentInDays: 10,
      notes: "Yangi o'rnatildi, kuzatuvda.",
      callLogs: [
        { daysAgo: 1, result: "TELEGRAM_SENT", note: "Telegramdan yo'riqnoma yubordim", operator: 0 },
      ],
    },
    {
      fullName: "Jasur Nazarov",
      restaurantName: "Burger House",
      region: "Toshkent viloyati",
      phone: "+998 91 777 88 99",
      contractNumber: "SH-1007",
      contractMonthsAgo: 6,
      installerName: "Asadbek",
      monoblokCount: 2,
      equipment: "2 monoblok + fiskal modul",
      status: "ACTIVE",
      monthlyAmount: 70,
      currency: "USD",
      nextPaymentInDays: -1,
      notes: "Vozvrat funksiyasini so'radilar.",
      callLogs: [
        { daysAgo: 0, result: "NO_ANSWER", note: "Ko'tarmadilar, SMS yozdim", followUpInDays: 0, operator: 0 },
      ],
    },
    {
      fullName: "Olim Sodiqov",
      restaurantName: "Milliy Taomlar",
      region: "Namangan",
      phone: "+998 88 123 45 67",
      contractNumber: "SH-1008",
      contractMonthsAgo: 11,
      installerName: "Suxrob",
      monoblokCount: 1,
      equipment: "1 monoblok + chek printer",
      status: "INACTIVE",
      monthlyAmount: 35,
      currency: "USD",
      nextPaymentInDays: -40,
      notes: "O'chirilgan — magazinga o'tdilar.",
    },
    {
      fullName: "Davron Qosimov",
      restaurantName: "Pizza Time",
      region: "Qashqadaryo",
      phone: "+998 95 222 11 00",
      contractNumber: "SH-1009",
      contractMonthsAgo: 4,
      installerName: "Asadbek",
      monoblokCount: 2,
      equipment: "2 monoblok + 2 chek printer",
      status: "ACTIVE",
      monthlyAmount: 60,
      currency: "USD",
      nextPaymentInDays: 2,
      notes: "Yandex va Uzum integratsiyasini so'radilar.",
      callLogs: [
        { daysAgo: 1, result: "TALKED", note: "Yandex/Uzum integratsiya so'rovi, Asadbekka yo'naltirildi", followUpInDays: 2, operator: 0 },
      ],
    },
    {
      fullName: "Akmal Yusupov",
      restaurantName: "Choyxona Zilol",
      region: "Surxondaryo",
      phone: "+998 97 654 32 10",
      contractNumber: "SH-1010",
      contractMonthsAgo: 8,
      installerName: "Suxrob",
      monoblokCount: 1,
      equipment: "1 monoblok",
      status: "ACTIVE",
      monthlyAmount: 38,
      currency: "USD",
      nextPaymentInDays: 14,
      payments: [{ monthsAgo: 1, amount: 38, currency: "USD" }],
    },
  ];

  // Lid bo'limlari (board to'lishi uchun) — indeks bo'yicha taqsimlanadi
  const STAGE_CYCLE = [
    "NEW",
    "NO_ANSWER",
    "LATER",
    "AWAITING_PAYMENT",
    "FORWARDED",
    "NEW",
    "RESOLVED",
    "NEW",
    "NO_ANSWER",
    "LATER",
  ];
  const ACTIVE = ["NO_ANSWER", "LATER", "AWAITING_PAYMENT", "FORWARDED"];

  let i = 0;
  for (const c of clients) {
    const op = operators[i % operators.length];
    const leadStage =
      c.status === "INACTIVE" ? "DEACTIVATED" : (STAGE_CYCLE[i] ?? "NEW");
    // Faol bo'limlar bugun ko'rinsin (nextContactDate <= bugun); NEW -> null
    const leadNextContact = ACTIVE.includes(leadStage) ? today : null;

    await db.client.create({
      data: {
        fullName: c.fullName,
        restaurantName: c.restaurantName,
        region: c.region,
        phone: c.phone,
        contractNumber: c.contractNumber,
        contractDate: addMonths(today, -c.contractMonthsAgo),
        installerName: c.installerName,
        monoblokCount: c.monoblokCount,
        equipment: c.equipment,
        status: c.status,
        monthlyAmount: c.monthlyAmount,
        currency: c.currency,
        nextPaymentDate:
          c.nextPaymentInDays === null ? null : addDays(today, c.nextPaymentInDays),
        notes: c.notes,
        assignedToId: op.id,
        stage: leadStage,
        nextContactDate: leadNextContact,
        lastOutcome: null,
        missedCallCount: leadStage === "NO_ANSWER" ? 3 : 0,
        callLogs: c.callLogs
          ? {
              create: c.callLogs.map((cl) => ({
                calledAt: addDays(today, -cl.daysAgo),
                result: cl.result,
                note: cl.note,
                nextFollowUpDate:
                  cl.followUpInDays === undefined
                    ? null
                    : addDays(today, cl.followUpInDays),
                operatorId: operators[cl.operator ?? 0].id,
              })),
            }
          : undefined,
        payments: c.payments
          ? {
              create: c.payments.map((p) => ({
                amount: p.amount,
                currency: p.currency,
                paidAt: addMonths(today, -p.monthsAgo),
                receiptNote: p.note,
                recordedById: op.id,
              })),
            }
          : undefined,
      },
    });
    i++;
  }

  // Namuna: ba'zi mijozlarga qo'shimcha yorliqli telefonlar
  const phoneSamples: Record<string, { label: string; number: string }[]> = {
    "Osh Markazi": [
      { label: "Menejer", number: "+998 90 111 22 33" },
      { label: "Kassir", number: "+998 91 444 55 66" },
    ],
    "Choyxona Diyor": [{ label: "Buxgalter", number: "+998 93 777 88 99" }],
  };
  for (const [name, phones] of Object.entries(phoneSamples)) {
    const cl = await db.client.findFirst({ where: { restaurantName: name } });
    if (cl) {
      await db.clientPhone.createMany({
        data: phones.map((p) => ({ clientId: cl.id, label: p.label, number: p.number })),
      });
    }
  }

  // Bir nechta namuna ticket
  const firstClient = await db.client.findFirst({
    where: { restaurantName: "Burger House" },
  });
  if (firstClient) {
    await db.ticket.create({
      data: {
        clientId: firstClient.id,
        title: "Vozvrat (qaytarish) funksiyasi so'rovi",
        type: "FEATURE",
        status: "OPEN",
        priority: "MEDIUM",
        assignedToId: asadbek.id,
      },
    });
  }

  // Demo: eskalatsiya navbati (admin biriktiradi) — Toshkent => bekzod taklif qilinadi
  const osh = await db.client.findFirst({
    where: { restaurantName: "Osh Markazi" },
  });
  if (osh) {
    await db.client.update({
      where: { id: osh.id },
      data: { stage: "ESCALATED", pendingStage: null, missedCallCount: 4 },
    });
  }

  // Demo: ustaga biriktirilgan vazifa (usta portalida ko'rinadi)
  const kafe = await db.client.findFirst({
    where: { restaurantName: "Kafe Shirin" },
  });
  if (kafe) {
    await db.client.update({
      where: { id: kafe.id },
      data: {
        assignedUstaId: bekzod.id,
        stage: "FORWARDED",
        ustaStatus: "ASSIGNED",
        pendingStage: null,
      },
    });
    await db.callLog.create({
      data: {
        clientId: kafe.id,
        result: "ASSIGNED",
        note: "Monoblokda wifi ulanmayapti — borib tekshiring",
        operatorId: admin.id,
      },
    });
  }

  // Demo: ijara mijoz (avto-qaytarish uchun) va sotib olgan mijoz
  const choyxona = await db.client.findFirst({
    where: { restaurantName: "Choyxona Diyor" },
  });
  if (choyxona) {
    await db.client.update({
      where: { id: choyxona.id },
      data: { equipmentMode: "RENTAL" },
    });
    await db.clientEquipment.create({
      data: {
        clientId: choyxona.id,
        equipmentTypeId: eqMono.id,
        quantity: 1,
        ownership: "RENTAL",
      },
    });
    await db.clientEquipment.create({
      data: {
        clientId: choyxona.id,
        equipmentTypeId: eqPrinter.id,
        quantity: 1,
        ownership: "RENTAL",
      },
    });
  }
  const bahor = await db.client.findFirst({
    where: { restaurantName: "Restoran Bahor" },
  });
  if (bahor) {
    await db.client.update({
      where: { id: bahor.id },
      data: { equipmentMode: "SOLD" },
    });
    await db.clientEquipment.create({
      data: {
        clientId: bahor.id,
        equipmentTypeId: eqMono.id,
        quantity: 3,
        ownership: "SOLD",
      },
    });
  }

  const counts = {
    users: await db.user.count(),
    clients: await db.client.count(),
    callLogs: await db.callLog.count(),
    payments: await db.payment.count(),
    tickets: await db.ticket.count(),
  };
  console.log("Seed tugadi:", counts);
  console.log(
    "Kirish: admin/admin123 · boshliq/boshliq123 · asadbek/operator123 · bekzod/usta123",
  );
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
