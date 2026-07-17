// Nav yonidagi badge sanoqlari — har bo'limda foydalanuvchining O'ZIGA tegishli,
// hal qilinmagan (ochiq) elementlar soni. Sahifalardagi scoping bilan bir xil:
// - muammo/eskalatsiya — assignedStaffScope (operator faqat o'ziniki, boshliq hammasi);
// - lidlar — o'ziga biriktirilgan bugungi ish; boshliq navbatlari (qaytarish/taklif) — boshliqqa.
import { startOfDay, endOfDay } from "date-fns";
import { db } from "@/lib/db";
import { ACTIVE_STAGES, NO_CONTACT_STAGES } from "@/lib/constants";
import { assignedStaffScope, isManagerRole } from "@/lib/visibility";

/** href → ochiq (o'ziga tegishli) elementlar soni. Nol bo'lganlari badge chiqarmaydi. */
export async function getNavBadges(
  userId: string,
  role: string,
): Promise<Record<string, number>> {
  const now = new Date();
  const today = endOfDay(now);
  const todayStart = startOfDay(now);
  const ticketScope = assignedStaffScope(role, userId, "assignedStaffId");
  const escScope = assignedStaffScope(role, userId, "escalationStaffId");
  const manager = isManagerRole(role);

  const [unread, lidlar, muammolar, eskalatsiya, qaytarish, takliflar, soliq] =
    await Promise.all([
      // Bildirishnomalar — o'qilmagan
      db.notificationRecipient.count({ where: { userId, readAt: null } }),
      // Kunlik ish — o'ziga biriktirilgan, muddati kelgan lidlar (/lidlar bilan bir xil mezon)
      db.client.count({
        where: {
          assignedToId: userId,
          stage: { notIn: [...NO_CONTACT_STAGES] },
          status: { not: "INACTIVE" },
          OR: [
            {
              stage: { in: [...ACTIVE_STAGES] },
              OR: [
                { pendingStage: { not: null } },
                { nextContactDate: null },
                { nextContactDate: { lte: today } },
              ],
            },
            { status: "ACTIVE", nextPaymentDate: { lt: todayStart } },
          ],
        },
      }),
      // Muammolar — hal qilinmagan, o'ziga tegishli (boshliq — hammasi)
      db.ticket.count({ where: { ...ticketScope, status: { not: "RESOLVED" } } }),
      // Eskalatsiya — o'ziga tegishli navbat (boshliq — hammasi)
      db.client.count({ where: { ...escScope, stage: "ESCALATED" } }),
      // Qaytarish — kutilayotgan arizalar (boshliq navbati)
      manager
        ? db.equipmentReturnRequest.count({ where: { status: "PENDING" } })
        : Promise.resolve(0),
      // Takliflar — ochiq (boshliq navbati)
      manager
        ? db.suggestion.count({ where: { status: "OPEN" } })
        : Promise.resolve(0),
      // Soliqqa ulash — kutilayotgan arizalar (boshliq hammasi, operator o'ziniki)
      db.taxConnection.count({
        where: { status: "PENDING", ...(manager ? {} : { byUserId: userId }) },
      }),
    ]);

  return {
    "/bildirishnomalar": unread,
    "/lidlar": lidlar,
    "/muammolar": muammolar,
    "/eskalatsiya": eskalatsiya,
    "/qaytarish": qaytarish,
    "/takliflar": takliflar,
    "/soliq": soliq,
  };
}
