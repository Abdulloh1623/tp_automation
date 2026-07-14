import { describe, it, expect } from "vitest";
import { isManagerRole, assignedStaffScope } from "./visibility";

describe("isManagerRole", () => {
  it("ADMIN va MANAGER — boshqaruv", () => {
    expect(isManagerRole("ADMIN")).toBe(true);
    expect(isManagerRole("MANAGER")).toBe(true);
  });
  it("OPERATOR va INSTALLER — boshqaruv emas", () => {
    expect(isManagerRole("OPERATOR")).toBe(false);
    expect(isManagerRole("INSTALLER")).toBe(false);
  });
});

describe("assignedStaffScope", () => {
  it("boshqaruv roli — cheklovsiz (bo'sh qamrov)", () => {
    expect(assignedStaffScope("ADMIN", "u1", "assignedStaffId")).toEqual({});
    expect(assignedStaffScope("MANAGER", "u1", "escalationStaffId")).toEqual({});
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
