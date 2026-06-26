import { describe, it, expect } from "vitest";
import {
  currencyEnum,
  clientStatusEnum,
  leadOutcomeEnum,
  leadStageEnum,
  equipmentModeEnum,
  noteString,
  isCurrency,
  isClientStatus,
  isLeadOutcome,
  isLeadStage,
} from "./validation";
import {
  CURRENCY,
  CLIENT_STATUS,
  LEAD_OUTCOME,
  LEAD_STAGE,
  EQUIPMENT_MODE,
} from "./constants";

describe("enum sxemalari constants bilan mos (yagona manba)", () => {
  it("currencyEnum = CURRENCY kalitlari", () => {
    expect([...currencyEnum.options].sort()).toEqual(Object.keys(CURRENCY).sort());
  });
  it("clientStatusEnum = CLIENT_STATUS kalitlari", () => {
    expect([...clientStatusEnum.options].sort()).toEqual(Object.keys(CLIENT_STATUS).sort());
  });
  it("leadOutcomeEnum = LEAD_OUTCOME kalitlari", () => {
    expect([...leadOutcomeEnum.options].sort()).toEqual(Object.keys(LEAD_OUTCOME).sort());
  });
  it("leadStageEnum = LEAD_STAGE kalitlari", () => {
    expect([...leadStageEnum.options].sort()).toEqual(Object.keys(LEAD_STAGE).sort());
  });
  it("equipmentModeEnum = EQUIPMENT_MODE kalitlari", () => {
    expect([...equipmentModeEnum.options].sort()).toEqual(Object.keys(EQUIPMENT_MODE).sort());
  });
});

describe("currency validatsiya", () => {
  it("USD/UZS qabul qilinadi", () => {
    expect(isCurrency("USD")).toBe(true);
    expect(isCurrency("UZS")).toBe(true);
  });
  it("noma'lum valyuta / bo'sh / null rad etiladi", () => {
    expect(isCurrency("EUR")).toBe(false);
    expect(isCurrency("")).toBe(false);
    expect(isCurrency(null)).toBe(false);
  });
});

describe("client status validatsiya", () => {
  it("haqiqiy statuslar qabul qilinadi", () => {
    expect(isClientStatus("ACTIVE")).toBe(true);
    expect(isClientStatus("PENDING")).toBe(true);
    expect(isClientStatus("INACTIVE")).toBe(true);
  });
  it("soxta status rad etiladi", () => {
    expect(isClientStatus("FAKE")).toBe(false);
  });
});

describe("lead outcome — `in` operatori prototip teshigi yopilgan", () => {
  it("haqiqiy natija qabul qilinadi", () => {
    expect(isLeadOutcome("NO_ANSWER")).toBe(true);
    expect(isLeadOutcome("RETURN_EQUIPMENT")).toBe(true);
  });
  it("prototip xossalari rad etiladi (oldin `key in OBJ` true qaytarardi)", () => {
    expect(isLeadOutcome("toString")).toBe(false);
    expect(isLeadOutcome("constructor")).toBe(false);
    expect(isLeadOutcome("hasOwnProperty")).toBe(false);
  });
  it("noma'lum natija rad etiladi", () => {
    expect(isLeadOutcome("BLAH")).toBe(false);
  });
});

describe("lead stage validatsiya", () => {
  it("haqiqiy stage qabul qilinadi", () => {
    expect(isLeadStage("NEW")).toBe(true);
    expect(isLeadStage("RETURNING")).toBe(true);
  });
  it("prototip / soxta stage rad etiladi", () => {
    expect(isLeadStage("toString")).toBe(false);
    expect(isLeadStage("XXX")).toBe(false);
  });
});

describe("noteString", () => {
  it("oddiy izohni trim qiladi", () => {
    expect(noteString.parse("  salom  ")).toBe("salom");
  });
  it("2000 belgida ruxsat, undan oshsa rad etiladi", () => {
    expect(noteString.safeParse("a".repeat(2000)).success).toBe(true);
    expect(noteString.safeParse("a".repeat(2001)).success).toBe(false);
  });
});
