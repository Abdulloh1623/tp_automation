"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/components/toaster";

/**
 * useActionState bilan ishlaydigan formalar uchun umumiy toast yordamchisi:
 * server action natijasi kelganda 2 soniyalik bildirishnoma chiqaradi —
 * `error` bo'lsa qizil (xato), `ok` bo'lsa yashil (muvaffaqiyat). Boshlang'ich
 * holatda (hali yuborilmagan) hech narsa chiqmaydi.
 */
export function useActionToast(
  state: { ok?: boolean; error?: string },
  successMsg: string,
) {
  const prev = useRef(state);
  useEffect(() => {
    if (state === prev.current) return; // boshlang'ich holat — o'tkazib yuboramiz
    prev.current = state;
    if (state.error) toast(state.error, "error");
    else if (state.ok) toast(successMsg, "success");
  }, [state, successMsg]);
}
