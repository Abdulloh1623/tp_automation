import { describe, it, expect, vi, beforeEach } from "vitest";

// Prisma, fayl saqlash va Telegram — hammasi mock. Bu yerda tekshiriladigan
// narsa: chek va matn ALOHIDA xabar bo'lib kelganda to'g'ri juftlanishi.
const {
  pendingFindUnique,
  pendingCreate,
  pendingUpdate,
  pendingUpdateMany,
  pendingDelete,
  clientFindMany,
  saveReceiptMock,
  downloadMock,
} = vi.hoisted(() => ({
  pendingFindUnique: vi.fn(),
  pendingCreate: vi.fn(),
  pendingUpdate: vi.fn(),
  pendingUpdateMany: vi.fn(),
  pendingDelete: vi.fn(),
  clientFindMany: vi.fn(),
  saveReceiptMock: vi.fn(),
  downloadMock: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {
    pendingPayment: {
      findUnique: pendingFindUnique,
      create: pendingCreate,
      update: pendingUpdate,
      updateMany: pendingUpdateMany,
      delete: pendingDelete,
    },
    client: { findMany: clientFindMany },
  },
}));

vi.mock("./receipts", async (orig) => ({
  ...(await orig<typeof import("./receipts")>()),
  saveReceipt: saveReceiptMock,
}));

vi.mock("./telegram", () => ({ downloadTelegramFile: downloadMock }));

import {
  intakeReceiptFile,
  intakeReceiptText,
  _resetPairingState,
} from "./receipt-intake-service";

const TEXT = `Nortojiyev Faxriddin (Sergeli Food city, Mobina kafe)
90 965 65 89
187 raqam`;

beforeEach(() => {
  vi.clearAllMocks();
  _resetPairingState();
  pendingFindUnique.mockResolvedValue(null);
  pendingCreate.mockImplementation(({ data }) => Promise.resolve({ id: "p1", ...data }));
  pendingUpdate.mockResolvedValue({});
  pendingUpdateMany.mockResolvedValue({ count: 1 });
  clientFindMany.mockResolvedValue([
    { id: "c1", phone: "+998909656589", phones: [] },
  ]);
  saveReceiptMock.mockResolvedValue({ ok: true, relPath: "receipts/pending-p1.jpg" });
  downloadMock.mockResolvedValue({ ok: true, buffer: Buffer.from("img") });
});

const fileInput = {
  chatId: -100,
  messageId: 5,
  senderId: 7,
  senderName: "Bilol",
  fileId: "f1",
  mime: "image/jpeg",
};

describe("intakeReceiptFile", () => {
  it("caption bilan kelgan chekda mijozni topadi", async () => {
    const res = await intakeReceiptFile({ ...fileInput, caption: TEXT });
    expect(res.ok).toBe(true);
    expect(pendingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          suggestedClientId: "c1",
          parsedPhone: "909656589",
          sheetNo: "187",
        }),
      }),
    );
  });

  it("bir xil xabar ikki marta kelsa yangi yozuv yaratmaydi", async () => {
    pendingFindUnique.mockResolvedValue({ id: "existing" });
    const res = await intakeReceiptFile({ ...fileInput, caption: TEXT });
    expect(res).toEqual({ ok: true, id: "existing", duplicate: true });
    expect(pendingCreate).not.toHaveBeenCalled();
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it("qo'llab-quvvatlanmaydigan fayl turini rad etadi", async () => {
    const res = await intakeReceiptFile({ ...fileInput, mime: "video/mp4" });
    expect(res.ok).toBe(false);
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it("yuklab olish muvaffaqiyatsiz bo'lsa yozuv yaratmaydi", async () => {
    downloadMock.mockResolvedValue({ ok: false, error: "tarmoq" });
    const res = await intakeReceiptFile(fileInput);
    expect(res).toEqual({ ok: false, error: "tarmoq" });
    expect(pendingCreate).not.toHaveBeenCalled();
  });

  it("chek saqlanmasa yozuvni o'chiradi", async () => {
    saveReceiptMock.mockResolvedValue({ ok: false, error: "katta" });
    const res = await intakeReceiptFile(fileInput);
    expect(res.ok).toBe(false);
    expect(pendingDelete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });
});

describe("matn va chek juftlanishi", () => {
  it("MATN oldin, CHEK keyin — matn chekka biriktiriladi", async () => {
    await intakeReceiptText({ chatId: -100, senderId: 7, senderName: "Bilol", text: TEXT });
    await intakeReceiptFile(fileInput);

    expect(pendingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rawText: TEXT, suggestedClientId: "c1" }),
      }),
    );
  });

  it("CHEK oldin, MATN keyin — mavjud yozuv yangilanadi", async () => {
    await intakeReceiptFile(fileInput);
    // Chek matnsiz yozildi
    expect(pendingCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rawText: null }) }),
    );

    const res = await intakeReceiptText({
      chatId: -100,
      senderId: 7,
      senderName: "Bilol",
      text: TEXT,
    });
    expect(res.attachedTo).toBe("p1");
    expect(pendingUpdateMany).toHaveBeenCalledWith({
      where: { id: "p1", status: "PENDING", rawText: null },
      data: expect.objectContaining({ suggestedClientId: "c1" }),
    });
  });

  it("boshqa odamning matni chekka biriktirilmaydi", async () => {
    await intakeReceiptFile(fileInput); // senderId 7
    const res = await intakeReceiptText({
      chatId: -100,
      senderId: 999, // boshqa xodim
      senderName: "Boshqa",
      text: TEXT,
    });
    expect(res.attachedTo).toBeNull();
    expect(pendingUpdateMany).not.toHaveBeenCalled();
  });

  it("matn allaqachon biriktirilgan bo'lsa qayta yozmaydi", async () => {
    await intakeReceiptFile(fileInput);
    pendingUpdateMany.mockResolvedValue({ count: 0 }); // poyga: boshqa matn ulgurdi
    const res = await intakeReceiptText({
      chatId: -100,
      senderId: 7,
      senderName: "Bilol",
      text: TEXT,
    });
    expect(res.attachedTo).toBeNull();
  });

  it("matn bir marta ishlatiladi — ikkinchi chekka o'tmaydi", async () => {
    await intakeReceiptText({ chatId: -100, senderId: 7, senderName: "Bilol", text: TEXT });
    await intakeReceiptFile(fileInput);
    await intakeReceiptFile({ ...fileInput, messageId: 6 });

    const second = pendingCreate.mock.calls[1][0].data;
    expect(second.rawText).toBeNull();
  });
});
