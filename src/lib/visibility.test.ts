import { describe, it, expect } from "vitest";
import { hasFullStaffAccess, canViewAll, assignedStaffScope } from "./visibility";

describe("hasFullStaffAccess", () => {
  it("ADMIN, SUPER_ADMIN va HEAD_OF_SUPPORT — boshqaruv", () => {
    expect(hasFullStaffAccess("ADMIN")).toBe(true);
    expect(hasFullStaffAccess("SUPER_ADMIN")).toBe(true);
    expect(hasFullStaffAccess("HEAD_OF_SUPPORT")).toBe(true);
  });
  it("OPERATOR va INSTALLER — boshqaruv emas", () => {
    expect(hasFullStaffAccess("OPERATOR")).toBe(false);
    expect(hasFullStaffAccess("INSTALLER")).toBe(false);
  });
  it("VIEWER — boshqaruv EMAS (tahrirlay olmaydi)", () => {
    expect(hasFullStaffAccess("VIEWER")).toBe(false);
  });
});

describe("canViewAll", () => {
  it("ADMIN, SUPER_ADMIN, HEAD_OF_SUPPORT va VIEWER — to'liq ko'rinish", () => {
    expect(canViewAll("ADMIN")).toBe(true);
    expect(canViewAll("SUPER_ADMIN")).toBe(true);
    expect(canViewAll("HEAD_OF_SUPPORT")).toBe(true);
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
    expect(assignedStaffScope("SUPER_ADMIN", "u1", "escalationStaffId")).toEqual({});
    expect(assignedStaffScope("HEAD_OF_SUPPORT", "u1", "escalationStaffId")).toEqual({});
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
