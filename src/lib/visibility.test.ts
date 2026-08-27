import { describe, it, expect } from "vitest";
import { isManagerRole, canViewAll, assignedStaffScope } from "./visibility";

describe("isManagerRole", () => {
  it("ADMIN va MANAGER — boshqaruv", () => {
    expect(isManagerRole("ADMIN")).toBe(true);
    expect(isManagerRole("MANAGER")).toBe(true);
  });
  it("OPERATOR va INSTALLER — boshqaruv emas", () => {
    expect(isManagerRole("OPERATOR")).toBe(false);
    expect(isManagerRole("INSTALLER")).toBe(false);
  });
  it("VIEWER — boshqaruv EMAS (tahrirlay olmaydi)", () => {
    expect(isManagerRole("VIEWER")).toBe(false);
  });
});

describe("canViewAll", () => {
  it("ADMIN, MANAGER va VIEWER — to'liq ko'rinish", () => {
    expect(canViewAll("ADMIN")).toBe(true);
    expect(canViewAll("MANAGER")).toBe(true);
    expect(canViewAll("VIEWER")).toBe(true);
  });
  it("OPERATOR va INSTALLER — cheklangan", () => {
    expect(canViewAll("OPERATOR")).toBe(false);
    expect(canViewAll("INSTALLER")).toBe(false);
  });
});

describe("assignedStaffScope", () => {
  it("boshqaruv roli — cheklovsiz (bo'sh qamrov)", () => {
    expect(assignedStaffScope("ADMIN", "u1", "assignedStaffId")).toEqual({});
    expect(assignedStaffScope("MANAGER", "u1", "escalationStaffId")).toEqual({});
  });

  it("VIEWER — cheklovsiz (bo'sh qamrov), lekin faqat ko'rish uchun", () => {
    expect(assignedStaffScope("VIEWER", "u1", "assignedStaffId")).toEqual({});
  });

  it("TP xodim — faqat o'ziga biriktirilgan ticketlar", () => {
    expect(assignedStaffScope("OPERATOR", "u7", "assignedStaffId")).toEqual({
      assignedStaffId: "u7",
    });
  });

  it("TP xodim — faqat o'ziga biriktirilgan eskalatsiya", () => {
    expect(assignedStaffScope("OPERATOR", "u7", "escalationStaffId")).toEqual({
      escalationStaffId: "u7",
    });
  });
});
