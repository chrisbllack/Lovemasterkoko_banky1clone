"use client";
import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Loader2,
  Lock,
  CheckCircle2,
  Calendar,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  CreditCard,
  Search,
  BedDouble,
  User,
  Check,
  FileDown,
  Building2,
  Copy,
  Info,
} from "lucide-react";
import { naira } from "@/lib/hotel";
import type { AvailabilityResult, BookingQuote, BookingErrorCode } from "@/lib/booking/types";
import { BookingCalendarDatePicker } from "@/components/booking/BookingCalendarDatePicker";
import { usePaymentSettings } from "@/lib/settings/usePaymentSettings";

/* ------------------------------------------------------------------ */
/* Typed API client                                                    */
/* ------------------------------------------------------------------ */

async function api<T>(url: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: BookingErrorCode; message: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(url, {
      method: body !== undefined ? "POST" : "GET",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const json = await res.json();
    if (json.ok) return json as { ok: true; data: T };
    return json as { ok: false; error: BookingErrorCode; message: string };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { ok: false, error: "INTERNAL_ERROR" as BookingErrorCode, message: "Request timed out. Please try again." };
    }
    return { ok: false, error: "INTERNAL_ERROR" as BookingErrorCode, message: err?.message || "Network request failed. Please check your connection." };
  }
}

type SearchParams = { checkIn: string; checkOut: string; adults: number; children: number; roomCount: number };

type RatePlanSummary = {
  id: string;
  name: string;
  description: string;
  priceModifier: { type: "percent" | "absolute"; value: number };
  cancellationPolicy: string;
  freeCancellationDays: number;
  depositPercent: number;
  minNights: number;
};

const STEPS = ["Dates", "Room", "Details", "Pay"] as const;

function BookingFlow() {
  const sp = useSearchParams();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Search
  const today = new Date().toISOString().split("T")[0];
  const [checkIn, setCheckIn] = useState(sp.get("checkIn") ?? "");
  const [checkOut, setCheckOut] = useState(sp.get("checkOut") ?? "");
  const [adults, setAdults] = useState(sp.get("adults") ? Math.max(1, parseInt(sp.get("adults")!, 10)) : 2);
  const [children, setChildren] = useState(sp.get("children") ? Math.max(0, parseInt(sp.get("children")!, 10)) : 0);
  const [roomCount, setRoomCount] = useState(sp.get("rooms") ? Math.max(1, parseInt(sp.get("rooms")!, 10)) : 1);
  const [promoInput, setPromoInput] = useState("");
  const [search, setSearch] = useState<AvailabilityResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [ratePlans, setRatePlans] = useState<RatePlanSummary[]>([]);
  const [ratePlanId, setRatePlanId] = useState("flexible");
  const [maxStepReached, setMaxStepReached] = useState(0);

  // Quote
  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [addonSelection, setAddonSelection] = useState<Record<string, number>>({});
  const [addons, setAddons] = useState<{ id: string; name: string; price: number; unit?: string; description?: string }[]>([]);

  // Guest
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [requests, setRequests] = useState("");

  // Booking
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [copiedBank, setCopiedBank] = useState(false);

  // Global payment settings (real-time from Firestore)
  const { paystackEnabled, settings: paymentSettings } = usePaymentSettings();

  // Keep track of highest unlocked step for progress bar navigation
  useEffect(() => {
    setMaxStepReached((prev) => Math.max(prev, step));
  }, [step]);

  const canJumpTo = useCallback(
    (targetStep: number) => {
      if (targetStep === step) return false;
      // Users can always jump back to completed earlier steps
      if (targetStep < step) return true;
      // Users can also jump forward if they previously unlocked that step and data is present
      if (targetStep === 1 && search !== null) return true;
      if (targetStep === 2 && quote !== null) return true;
      if (targetStep === 3 && quote !== null && reference !== null) return true;
      return false;
    },
    [step, search, quote, reference],
  );

  const jumpToStep = useCallback(
    (targetStep: number) => {
      if (!canJumpTo(targetStep)) return;
      setError(null);
      setStep(targetStep);

      // Smooth scroll back to form container so user sees the step content
      if (typeof window !== "undefined") {
        const container = document.getElementById("booking-flow-container");
        if (container) {
          const rect = container.getBoundingClientRect();
          const targetY = window.pageYOffset + rect.top - 145;
          window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
        }
      }
    },
    [canJumpTo],
  );

  useEffect(() => {
    api<{ addons: typeof addons }>("/api/booking/addons")
      .then((r) => {
        if (r.ok) setAddons(r.data.addons);
      })
      .catch(() => {});
    api<{ ratePlans: RatePlanSummary[] }>("/api/booking/rate-plans")
      .then((r) => {
        if (r.ok && r.data.ratePlans.length > 0) setRatePlans(r.data.ratePlans);
      })
      .catch(() => {});
  }, []);

  const runSearch = useCallback(async () => {
    setSearching(true);
    setError(null);
    try {
      const res = await api<AvailabilityResult>("/api/booking/search", {
        checkIn,
        checkOut,
        adults,
        children,
        roomCount,
      });
      if (!res.ok) {
        setError(res.message);
        setSearch(null);
        return;
      }
      setSearch(res.data);
      setQuote(null);
      setQuoteId(null);
      if (res.data.rooms.every((r) => r.available <= 0)) {
        setError("No rooms are available for these dates. Please try different dates.");
      } else {
        setStep(1);
        setMaxStepReached((prev) => Math.max(prev, 1));
        if (typeof window !== "undefined") {
          const container = document.getElementById("booking-flow-container");
          if (container) {
            const rect = container.getBoundingClientRect();
            const targetY = window.pageYOffset + rect.top - 145;
            window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || "Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }, [checkIn, checkOut, adults, children, roomCount]);

  // Auto-run search when directed from header reservation widget with valid dates
  useEffect(() => {
    if (sp.get("autosearch") === "true" && checkIn && checkOut && !search && !searching) {
      runSearch();
    }
  }, [sp, checkIn, checkOut, search, searching, runSearch]);

  const selectRoom = useCallback(
    async (roomTypeId: string) => {
      setBusy(true);
      setError(null);
      try {
        const addonIds = Object.entries(addonSelection)
          .filter(([, qty]) => qty > 0)
          .map(([id, qty]) => ({ id, qty }));
        const res = await api<{ quote: BookingQuote; quoteId: string }>("/api/booking/quote", {
          roomTypeId,
          ratePlanId: ratePlanId || "flexible",
          checkIn,
          checkOut,
          adults,
          children,
          roomCount,
          promoCode: promoInput || undefined,
          addonIds,
        });
        if (!res.ok) {
          setError(res.message);
          return;
        }
        setQuote(res.data.quote);
        setQuoteId(res.data.quoteId);
        setStep(2);
        setMaxStepReached((prev) => Math.max(prev, 2));
        if (typeof window !== "undefined") {
          const container = document.getElementById("booking-flow-container");
          if (container) {
            const rect = container.getBoundingClientRect();
            const targetY = window.pageYOffset + rect.top - 145;
            window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
          }
        }
      } catch (err: any) {
        setError(err?.message || "Failed to calculate room pricing. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [addonSelection, checkIn, checkOut, adults, children, roomCount, promoInput, ratePlanId],
  );

  const refreshQuote = useCallback(
    async (withPromo?: string) => {
      if (!quote) return;
      setBusy(true);
      setError(null);
      try {
        const addonIds = Object.entries(addonSelection)
          .filter(([, qty]) => qty > 0)
          .map(([id, qty]) => ({ id, qty }));
        const res = await api<{ quote: BookingQuote; quoteId: string }>("/api/booking/quote", {
          roomTypeId: quote.roomTypeId,
          ratePlanId: quote.ratePlanId || ratePlanId || "flexible",
          checkIn,
          checkOut,
          adults,
          children,
          roomCount,
          promoCode: withPromo || undefined,
          addonIds,
        });
        if (res.ok) {
          setQuote(res.data.quote);
          setQuoteId(res.data.quoteId);
        } else {
          setError(res.message);
        }
      } catch (err: any) {
        setError(err?.message || "Failed to refresh pricing.");
      } finally {
        setBusy(false);
      }
    },
    [quote, addonSelection, checkIn, checkOut, adults, children, roomCount, ratePlanId],
  );

  const createBooking = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName || !trimmedEmail || !trimmedPhone) {
      setError("Please provide your name, email address, and phone number.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      // If quoteId was lost but quote data exists, re-acquire active quote
      let activeQuoteId = quoteId;
      if (!activeQuoteId && quote) {
        const qRes = await api<{ quote: BookingQuote; quoteId: string }>("/api/booking/quote", {
          roomTypeId: quote.roomTypeId,
          ratePlanId: quote.ratePlanId || ratePlanId || "flexible",
          checkIn,
          checkOut,
          adults,
          children,
          roomCount,
          promoCode: promoInput || undefined,
        });
        if (qRes.ok) {
          activeQuoteId = qRes.data.quoteId;
          setQuote(qRes.data.quote);
          setQuoteId(qRes.data.quoteId);
        } else {
          setError(qRes.message || "Failed to secure room pricing. Please select a room again.");
          setStep(1);
          return;
        }
      }

      if (!activeQuoteId) {
        setError("Your booking session has expired. Please choose a room to continue.");
        setStep(1);
        return;
      }

      // Safe cross-platform UUID fallback
      const idempotencyKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

      const res = await api<{ reservationId: string; reference: string; pricing: BookingQuote["pricing"] }>(
        "/api/booking/create",
        {
          quoteId: activeQuoteId,
          guest: { name: trimmedName, email: trimmedEmail, phone: trimmedPhone },
          requests: requests.trim() || undefined,
          idempotencyKey,
        },
      );

      if (!res.ok) {
        setError(res.message);
        if (res.error === "ROOM_UNAVAILABLE" || res.error === "QUOTE_EXPIRED") {
          setStep(1);
          setQuote(null);
          setQuoteId(null);
        }
        return;
      }

      setReservationId(res.data.reservationId);
      setReference(res.data.reference);
      setStep(3);
      setMaxStepReached((prev) => Math.max(prev, 3));

      // Smooth scroll to top of booking flow container
      if (typeof window !== "undefined") {
        const container = document.getElementById("booking-flow-container");
        if (container) {
          const rect = container.getBoundingClientRect();
          const targetY = window.pageYOffset + rect.top - 145;
          window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
        }
      }
    } catch (err: any) {
      console.error("Booking creation error:", err);
      setError(err?.message || "Failed to create reservation. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [quoteId, quote, name, email, phone, requests, ratePlanId, checkIn, checkOut, adults, children, roomCount, promoInput]);

  const payNow = useCallback(async () => {
    if (!reservationId) return;
    setBusy(true);
    setError(null);
    const res = await api<{ authorizationUrl: string; reference: string }>("/api/booking/pay", {
      reservationId,
      origin: window.location.origin,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    // Remember the exact Paystack reference so "verify now" can re-check it
    // after the redirect back from Paystack.
    try {
      window.localStorage.setItem("banky-ps-ref-" + reference, res.data.reference);
    } catch {
      /* storage unavailable — verify falls back to the BKS reference */
    }
    window.location.assign(res.data.authorizationUrl);
  }, [reservationId, reference]);

  const checkPayment = useCallback(async () => {
    if (!reference) return;
    setCheckingPayment(true);
    setError(null);
    // Prefer the exact Paystack reference if we saved one; the API also
    // accepts the BKS reservation reference directly.
    let psRef: string | null = null;
    try {
      psRef = window.localStorage.getItem("banky-ps-ref-" + reference);
    } catch {
      psRef = null;
    }
    const res = await api<{ status: string; paymentStatus: string }>("/api/booking/verify", {
      reference: psRef ?? reference,
    });
    setCheckingPayment(false);
    if (res.ok) {
      setConfirmed(true);
    } else {
      setError(res.message);
    }
  }, [reference]);

  const canSearch = checkIn && checkOut && checkOut > checkIn;

  /* ---------------------------------------------------------------- */
  /* Confirmation view                                                 */
  /* ---------------------------------------------------------------- */
  if (confirmed && reference) {
    return (
      <div className="max-w-2xl mx-auto text-center py-10">
        <div className="h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h2 className="font-display text-3xl text-stone-900 dark:text-white mb-3">Payment Verified — Booking Confirmed</h2>
        <p className="text-sm text-stone-600 dark:text-stone-300 mb-2">
          Your reservation reference is <strong className="text-[var(--accent)]">{reference}</strong>
        </p>
        <p className="text-sm text-stone-600 dark:text-stone-300 mb-8">
          A confirmation has been sent to {email}. Present your reference at the front desk on arrival.
        </p>
        <div className="glass p-6 rounded-2xl text-left text-sm space-y-2 border border-[#ece6dd] mb-6">
          {quote && (
            <>
              <div className="flex justify-between"><span className="text-stone-600 dark:text-stone-300">Room</span><span className="font-medium">{quote.roomTypeName}</span></div>
              <div className="flex justify-between"><span className="text-stone-600 dark:text-stone-300">Dates</span><span className="font-medium">{quote.checkIn} → {quote.checkOut}</span></div>
              <div className="flex justify-between"><span className="text-stone-600 dark:text-stone-300">Guests</span><span className="font-medium">{quote.adults + quote.children}</span></div>
              <div className="flex justify-between border-t border-[#ece6dd] pt-2"><span className="text-stone-600 dark:text-stone-300">Total</span><span className="font-semibold text-[var(--accent)]">{naira(quote.pricing.grandTotal / 100)}</span></div>
            </>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href={`/booking/confirmation?ref=${encodeURIComponent(reference)}`}
            className="btn-gold w-full sm:w-auto px-6 py-3 text-xs font-medium inline-flex items-center justify-center gap-2"
          >
            <FileDown className="h-4 w-4" />
            <span>View &amp; Generate PDF Itinerary</span>
          </Link>
          <Link
            href="/"
            className="btn-outline-white w-full sm:w-auto px-6 py-3 text-xs font-medium inline-flex items-center justify-center gap-2"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Wizard                                                            */
  /* ---------------------------------------------------------------- */
  const STEP_CONFIG = [
    { id: 0, label: "Dates", shortDesc: "Stay & Guests", icon: Calendar },
    { id: 1, label: "Room", shortDesc: "Select Suite", icon: BedDouble },
    { id: 2, label: "Details", shortDesc: "Guest Info", icon: User },
    { id: 3, label: "Pay", shortDesc: "Secure Deposit", icon: CreditCard },
  ] as const;

  const progressPercentage = Math.round(((step + 1) / STEP_CONFIG.length) * 100);

  return (
    <div id="booking-flow-container" className="space-y-6">
      {/* Sticky Progress Bar */}
      <nav
        aria-label="Booking steps"
        className="sticky top-[64px] sm:top-[72px] lg:top-[78px] z-30 rounded-2xl bg-white/95 dark:bg-[#1a1815]/95 backdrop-blur-md border border-[#ece6dd] dark:border-[#2e2b26] shadow-sm p-3 sm:p-4 transition-all"
      >
        {/* Mobile View (< sm): Compact touch-friendly step navigation */}
        <div className="sm:hidden">
          <div className="flex items-center justify-between text-xs mb-2.5">
            <div className="flex items-center gap-1.5">
              <span className="font-condensed uppercase tracking-wider text-stone-500 dark:text-stone-400 font-medium">
                Step {step + 1} of 4:
              </span>
              <strong className="text-stone-900 dark:text-white font-semibold">
                {STEP_CONFIG[step].label}
              </strong>
            </div>
            {step > 0 && (
              <button
                type="button"
                onClick={() => jumpToStep(step - 1)}
                className="text-[11px] font-condensed uppercase tracking-wider text-[var(--accent)] hover:underline inline-flex items-center gap-1 font-medium"
              >
                <ArrowLeft className="h-3 w-3" /> Back
              </button>
            )}
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {STEP_CONFIG.map((item, idx) => {
              const isCurrent = idx === step;
              const isCompleted = idx < step || (idx <= maxStepReached && idx !== step && ((idx === 0) || (idx === 1 && search) || (idx === 2 && quote)));
              const isClickable = canJumpTo(idx);

              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && jumpToStep(idx)}
                  className={`flex flex-col items-center justify-center p-1.5 rounded-xl transition-all ${
                    isCurrent
                      ? "bg-[var(--accent)]/10 text-stone-900 dark:text-white font-medium"
                      : isClickable
                        ? "hover:bg-stone-100 dark:hover:bg-stone-800/80 cursor-pointer text-stone-700 dark:text-stone-300"
                        : "opacity-40 cursor-not-allowed text-stone-400"
                  }`}
                  aria-label={`${item.label} (${isCurrent ? "Current step" : isCompleted ? "Completed - tap to jump back" : "Upcoming"})`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center text-xs mb-1 transition-all ${
                      isCurrent
                        ? "bg-[var(--accent)] text-white shadow-sm ring-2 ring-[var(--accent)]/40 font-bold"
                        : isCompleted
                          ? "bg-emerald-600 text-white font-bold"
                          : "border border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-stone-500"
                    }`}
                  >
                    {isCompleted ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : idx + 1}
                  </div>
                  <span className="text-[11px] font-condensed uppercase tracking-wider truncate max-w-full">
                    {item.label}
                  </span>
                  <span className="text-[9px] font-condensed uppercase tracking-tight">
                    {isCurrent ? (
                      <span className="text-[var(--accent)] font-semibold">Current</span>
                    ) : isClickable ? (
                      <span className="text-emerald-600 dark:text-emerald-400">Edit ↩</span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop / Tablet View (>= sm): Full stepped layout with track & contextual summary */}
        <div className="hidden sm:block">
          <div className="relative flex items-center justify-between">
            {/* Background connecting track */}
            <div className="absolute top-1/2 left-8 right-8 -translate-y-1/2 h-[2px] bg-stone-200 dark:bg-stone-800 z-0" aria-hidden="true" />

            {/* Active connecting track */}
            <div
              className="absolute top-1/2 left-8 -translate-y-1/2 h-[2px] bg-emerald-500 transition-all duration-500 ease-out z-0"
              style={{
                width: `${(Math.min(step, maxStepReached) / (STEP_CONFIG.length - 1)) * 84}%`,
              }}
              aria-hidden="true"
            />

            {STEP_CONFIG.map((item, idx) => {
              const Icon = item.icon;
              const isCurrent = idx === step;
              const isCompleted = idx < step || (idx <= maxStepReached && idx !== step && ((idx === 0) || (idx === 1 && search) || (idx === 2 && quote)));
              const isClickable = canJumpTo(idx);

              let contextHint: string = item.shortDesc;
              if (idx === 0 && checkIn && checkOut) {
                contextHint = `${checkIn} → ${checkOut}`;
              } else if (idx === 1 && quote) {
                contextHint = quote.roomTypeName;
              } else if (idx === 2 && name) {
                contextHint = name;
              } else if (idx === 3 && quote) {
                contextHint = `Deposit ${naira(quote.pricing.depositDue / 100)}`;
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && jumpToStep(idx)}
                  className={`relative z-10 flex items-center gap-3 px-3.5 py-2 rounded-xl transition-all ${
                    isCurrent
                      ? "bg-white dark:bg-[#201d19] ring-2 ring-[var(--accent)] shadow-sm"
                      : isClickable
                        ? "bg-white/90 dark:bg-[#1a1815]/90 hover:bg-stone-50 dark:hover:bg-stone-800 cursor-pointer group hover:shadow-sm"
                        : "bg-white/50 dark:bg-[#1a1815]/50 opacity-60 cursor-not-allowed"
                  }`}
                  aria-label={`${item.label}: ${contextHint} (${isCurrent ? "Current step" : isCompleted ? "Completed step - click to jump back" : "Upcoming step"})`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center transition-all shrink-0 ${
                      isCurrent
                        ? "bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/20 ring-4 ring-[var(--accent)]/20 font-bold"
                        : isCompleted
                          ? "bg-emerald-600 text-white font-bold group-hover:scale-105"
                          : "border border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-stone-400"
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4 stroke-[2.5]" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </div>
                  <div className="text-left min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs font-condensed uppercase tracking-wider font-semibold block ${
                          isCurrent
                            ? "text-[var(--accent-dark)] dark:text-[var(--accent-light)]"
                            : isClickable
                              ? "text-stone-800 dark:text-stone-200 group-hover:text-[var(--accent)]"
                              : "text-stone-400 dark:text-stone-500"
                        }`}
                      >
                        {item.label}
                      </span>
                      {isClickable && (
                        <span className="text-[10px] font-condensed uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-medium group-hover:bg-[var(--accent)] group-hover:text-white transition-colors">
                          Edit ↩
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 block truncate max-w-[120px] lg:max-w-[160px]">
                      {contextHint}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom subtle progress line */}
        <div className="mt-3 -mx-3 -mb-3 sm:-mx-4 sm:-mb-4 h-[2.5px] bg-stone-100 dark:bg-stone-800/80 overflow-hidden rounded-b-2xl">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-500 ease-out"
            style={{
              width: `${progressPercentage}%`,
            }}
          />
        </div>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          {error && (
            <div role="alert" className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl flex gap-3 items-start">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300">{error}</p>
            </div>
          )}

        {/* Step 0 — Search */}
        {step === 0 && (
          <section className="glass p-6 rounded-md space-y-6 border border-[#ece6dd]/80" aria-label="Search availability">
            <div className="flex items-center gap-2 border-b border-[#ece6dd]/60 pb-3">
              <span className="h-6 w-6 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-medium flex items-center justify-center">1</span>
              <div>
                <h3 className="font-display text-xl text-stone-900 dark:text-white font-normal">Stay Dates &amp; Guests</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Select your arrival and departure dates. Calendar reflects real-time room inventory and sold-out nights.
                </p>
              </div>
            </div>

            {/* Real-time Inventory Calendar Date Picker */}
            <BookingCalendarDatePicker
              checkIn={checkIn}
              checkOut={checkOut}
              onSelectDates={(inDate, outDate) => {
                setCheckIn(inDate);
                setCheckOut(outDate);
                if (error) setError(null);
              }}
              adults={adults}
              childrenCount={children}
              roomCount={roomCount}
              minNights={1}
            />

            {/* Occupancy, Rooms & Promo Options */}
            <div className="pt-4 border-t border-[#ece6dd]/70 dark:border-stone-800">
              <h4 className="text-xs font-condensed uppercase tracking-wider text-stone-600 dark:text-stone-300 font-semibold mb-3">
                Occupancy &amp; Preferences
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label htmlFor="adults" className="text-xs font-condensed uppercase tracking-wider text-stone-700 dark:text-stone-300 font-medium block mb-1">Adults</label>
                  <select id="adults" value={adults} onChange={(e) => setAdults(Number(e.target.value))} className="w-full border-b border-[#ece6dd] py-2 text-base bg-transparent outline-none text-stone-900 dark:text-white">
                    {[1, 2, 3, 4, 5].map((a) => <option key={a} value={a}>{a} {a === 1 ? "Adult" : "Adults"}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="children" className="text-xs font-condensed uppercase tracking-wider text-stone-700 dark:text-stone-300 font-medium block mb-1">Children</label>
                  <select id="children" value={children} onChange={(e) => setChildren(Number(e.target.value))} className="w-full border-b border-[#ece6dd] py-2 text-base bg-transparent outline-none text-stone-900 dark:text-white">
                    {[0, 1, 2, 3].map((c) => <option key={c} value={c}>{c} {c === 1 ? "Child" : "Children"}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="rooms" className="text-xs font-condensed uppercase tracking-wider text-stone-700 dark:text-stone-300 font-medium block mb-1">Rooms</label>
                  <select id="rooms" value={roomCount} onChange={(e) => setRoomCount(Number(e.target.value))} className="w-full border-b border-[#ece6dd] py-2 text-base bg-transparent outline-none text-stone-900 dark:text-white">
                    {[1, 2, 3].map((r) => <option key={r} value={r}>{r} Room{r > 1 ? "s" : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="promo" className="text-xs font-condensed uppercase tracking-wider text-stone-700 dark:text-stone-300 font-medium block mb-1">Promo Code (optional)</label>
                  <input id="promo" value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} placeholder="e.g. WELCOME10" className="w-full border-b border-[#ece6dd] py-2 text-base bg-transparent outline-none placeholder:text-stone-400 text-stone-900 dark:text-white" />
                </div>
              </div>
            </div>


            <button
              type="button"
              onClick={runSearch}
              disabled={!canSearch || searching}
              className="btn-gold w-full min-h-[52px] text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span>{searching ? "Checking availability…" : "Check Availability"}</span>
            </button>
          </section>
        )}

        {/* Step 1 — Room selection */}
        {step === 1 && search && (
          <section className="space-y-4" aria-label="Select a room">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl text-stone-900 dark:text-white">Available Rooms</h3>
              <button type="button" onClick={() => jumpToStep(0)} className="text-xs font-condensed uppercase tracking-wider text-stone-500 hover:text-[var(--accent)] inline-flex items-center gap-1 transition-colors">
                <ArrowLeft className="h-3.5 w-3.5" /> Change dates
              </button>
            </div>
            {search.rooms.length === 0 && (
              <div className="glass p-8 text-center rounded-md border border-[#ece6dd]">
                <Calendar className="h-8 w-8 text-stone-300 mx-auto mb-3" />
                <p className="text-sm text-stone-600 dark:text-stone-300">No rooms are available for these dates. Please change your dates or guest count.</p>
              </div>
            )}
            {search.rooms.map((r) => (
              <div key={r.roomType.id} className={`glass p-5 rounded-md border ${r.available > 0 ? "border-[#ece6dd]" : "border-[#ece6dd]/50 opacity-60"} flex gap-4`}>
                <Image
                  src={r.roomType.image}
                  alt={r.roomType.name}
                  width={112}
                  height={112}
                  referrerPolicy="no-referrer"
                  className="hidden sm:block w-28 h-28 object-cover rounded-xl"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-display text-lg text-stone-900 dark:text-white">{r.roomType.name}</h4>
                    <span className="text-sm font-medium text-[var(--accent)]">{naira(r.minRate / 100)} <span className="text-xs text-stone-400">/ night</span></span>
                  </div>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 line-clamp-2">{r.roomType.blurb}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className={`text-xs font-condensed uppercase tracking-wider ${r.available > 0 ? "text-emerald-600" : "text-stone-400"}`}>
                      {r.available > 0 ? `${r.available} available` : "Sold out for these dates"}
                    </span>
                    <button
                      type="button"
                      disabled={r.available <= 0 || busy}
                      onClick={() => selectRoom(r.roomType.id)}
                      className="btn-gold px-5 py-2.5 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-40"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Select <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Step 2 — Guest details + review */}
        {step === 2 && quote && (
          <section className="space-y-6" aria-label="Guest details">
            <div className="glass p-6 rounded-md space-y-5 border border-[#ece6dd]/80">
              <div className="flex items-center gap-2 border-b border-[#ece6dd]/60 pb-3">
                <span className="h-6 w-6 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-medium flex items-center justify-center">3</span>
                <h3 className="font-display text-xl text-stone-900 dark:text-white font-normal">Primary Guest Information</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2">
                  <label htmlFor="fullname" className="text-xs font-condensed uppercase tracking-wider text-stone-700 dark:text-stone-300 font-medium block mb-1">Full Name</label>
                  <input id="fullname" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chief Adeleke Johnson" className="w-full border-b border-[#ece6dd] py-2 text-base bg-transparent outline-none placeholder:text-stone-400 text-stone-900 dark:text-white" />
                </div>
                <div>
                  <label htmlFor="email" className="text-xs font-condensed uppercase tracking-wider text-stone-700 dark:text-stone-300 font-medium block mb-1">Email Address</label>
                  <input id="email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="guest@domain.com" className="w-full border-b border-[#ece6dd] py-2 text-base bg-transparent outline-none placeholder:text-stone-400 text-stone-900 dark:text-white" />
                </div>
                <div>
                  <label htmlFor="phone" className="text-xs font-condensed uppercase tracking-wider text-stone-700 dark:text-stone-300 font-medium block mb-1">Phone / WhatsApp</label>
                  <input id="phone" required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 800 000 0000" className="w-full border-b border-[#ece6dd] py-2 text-base bg-transparent outline-none placeholder:text-stone-400 text-stone-900 dark:text-white" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="requests" className="text-xs font-condensed uppercase tracking-wider text-stone-700 dark:text-stone-300 font-medium block mb-1">Special Requests</label>
                  <textarea id="requests" rows={2} value={requests} onChange={(e) => setRequests(e.target.value)} placeholder="High floor, quiet wing, anniversary setup…" className="w-full border-b border-[#ece6dd] py-2 text-base bg-transparent outline-none resize-none placeholder:text-stone-400 text-stone-900 dark:text-white" />
                </div>
              </div>
            </div>

            {/* Extras */}
            {addons.length > 0 && (
              <div className="glass p-6 rounded-md space-y-3 border border-[#ece6dd]/80">
                <h3 className="font-display text-lg text-stone-900 dark:text-white font-normal">Enhance Your Stay</h3>
                {addons.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 py-2 border-b border-[#ece6dd]/60 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm text-stone-900 dark:text-white font-medium">{a.name}</p>
                      <p className="text-xs text-stone-500">{naira(a.price / 100)} {a.unit === "per_night" ? "per night" : a.unit === "per_person" ? "per person" : ""}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        aria-label={`Quantity for ${a.name}`}
                        value={addonSelection[a.id] ?? 0}
                        onChange={(e) => {
                          const qty = Number(e.target.value);
                          setAddonSelection((s) => ({ ...s, [a.id]: qty }));
                        }}
                        className="border border-[#ece6dd] rounded px-2 py-1 text-sm bg-transparent text-stone-900 dark:text-white"
                      >
                        {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n === 0 ? "—" : n}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => refreshQuote()} className="btn-gold w-full py-2.5 text-xs font-medium">
                  {busy ? "Recalculating…" : "Apply extras & update price"}
                </button>
              </div>
            )}

            {/* Inline Error display in Step 2 */}
            {error && (
              <div role="alert" className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={() => jumpToStep(1)} className="btn-outline-white px-6 py-3 text-xs font-medium inline-flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" /> Back to Rooms
              </button>
              <button
                type="button"
                onClick={createBooking}
                disabled={!name || !email || !phone || busy}
                className="btn-gold flex-1 min-h-[52px] text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                <span>{busy ? "Reserving your room…" : "Reserve & Continue to Payment"}</span>
              </button>
            </div>
          </section>
        )}

        {/* Step 3 — Payment */}
        {step === 3 && reference && quote && (
          <section className="glass p-6 rounded-md space-y-5 border border-[#ece6dd]/80" aria-label="Payment">
            <div className="flex items-center gap-2 border-b border-[#ece6dd]/60 pb-3">
              <span className="h-6 w-6 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-medium flex items-center justify-center">4</span>
              <h3 className="font-display text-xl text-stone-900 dark:text-white font-normal">Secure Your Reservation</h3>
            </div>

            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-xs text-emerald-800 dark:text-emerald-300">
              Room held for 30 minutes — reference <strong>{reference}</strong>.
            </div>

            {/* If Paystack is Enabled: Online Paystack Gateway is Primary */}
            {paystackEnabled ? (
              <div className="space-y-4">
                <p className="text-xs text-stone-600 dark:text-stone-300">
                  Pay the deposit of <strong>{naira(quote.pricing.depositDue / 100)}</strong> now with Paystack (cards, bank transfer, USSD). The balance of {naira(quote.pricing.balanceDue / 100)} is due at the hotel.
                </p>

                <button
                  type="button"
                  onClick={payNow}
                  disabled={busy}
                  className="btn-gold w-full min-h-[52px] text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  <span>Pay {naira(quote.pricing.depositDue / 100)} with Paystack</span>
                </button>

                <button
                  type="button"
                  onClick={checkPayment}
                  disabled={checkingPayment}
                  className="w-full py-2.5 text-xs font-condensed uppercase tracking-wider text-stone-600 dark:text-stone-300 hover:text-[var(--accent)] transition-colors"
                >
                  {checkingPayment ? "Verifying payment…" : "I've completed payment — verify now"}
                </button>

                {/* Alternative Settlement Option */}
                <div className="pt-3 border-t border-[#ece6dd]/60 text-center">
                  <span className="text-[11px] text-stone-500 block mb-2 font-medium">Or prefer manual transfer / payment on arrival?</span>
                  <button
                    type="button"
                    onClick={() => {
                      window.location.assign(
                        `/booking/confirmation?ref=${encodeURIComponent(reference)}&method=bank_transfer`
                      );
                    }}
                    className="w-full py-2.5 px-4 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-900 text-stone-800 dark:text-stone-200 text-xs font-semibold hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors flex items-center justify-center gap-2"
                  >
                    <Building2 className="h-4 w-4 text-[var(--accent)]" />
                    <span>Confirm Hold &amp; Pay via Direct Bank Transfer / At Hotel</span>
                  </button>
                </div>
              </div>
            ) : (
              /* If Paystack is Disabled: Direct Bank Transfer & Front Desk Mode */
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-semibold">Online Card Checkout Paused</strong>
                    <span>
                      {paymentSettings.noticeMessage ||
                        "Online Paystack payment is currently offline. Direct Bank Transfer and Front-Desk settlements are active."}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white dark:bg-[#1a1815] border border-[#ece6dd] dark:border-[#2e2b26] space-y-3">
                  <div className="flex items-center justify-between text-xs border-b border-[#ece6dd]/60 dark:border-stone-800 pb-2">
                    <span className="font-semibold text-stone-900 dark:text-white flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-[var(--accent)]" />
                      <span>Hotel Bank Account for Transfer:</span>
                    </span>
                    <span className="font-bold text-[var(--accent)] text-sm">
                      {naira(quote.pricing.depositDue / 100)} deposit
                    </span>
                  </div>

                  <div className="grid gap-2 text-xs text-stone-700 dark:text-stone-300">
                    <div className="flex justify-between">
                      <span className="text-stone-500">Bank:</span>
                      <strong className="text-stone-900 dark:text-white font-medium">
                        {paymentSettings.bankDetails?.bankName || "Zenith Bank"}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Account Name:</span>
                      <strong className="text-stone-900 dark:text-white font-medium">
                        {paymentSettings.bankDetails?.accountName || "Banky Hotel & Suites Ltd"}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between bg-stone-50 dark:bg-stone-900/80 p-2 rounded-lg border border-stone-200 dark:border-stone-800">
                      <div>
                        <span className="text-[10px] text-stone-500 block uppercase font-mono">Account Number:</span>
                        <span className="font-mono font-bold text-base text-stone-900 dark:text-white">
                          {paymentSettings.bankDetails?.accountNumber || "1018273645"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const num = paymentSettings.bankDetails?.accountNumber || "1018273645";
                          if (navigator.clipboard) {
                            navigator.clipboard.writeText(num);
                            setCopiedBank(true);
                            setTimeout(() => setCopiedBank(false), 2000);
                          }
                        }}
                        className="p-1.5 px-3 rounded-md bg-white dark:bg-stone-800 border text-xs font-semibold text-stone-700 dark:text-stone-200 hover:text-[var(--accent)] inline-flex items-center gap-1 shadow-sm"
                      >
                        {copiedBank ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedBank ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                    <div className="text-[11px] text-stone-500 italic">
                      Narration: Please use reference <strong>{reference}</strong> when transferring.
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    window.location.assign(
                      `/booking/confirmation?ref=${encodeURIComponent(reference)}&method=bank_transfer`
                    );
                  }}
                  className="btn-gold w-full min-h-[52px] text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                >
                  <Building2 className="h-4 w-4" />
                  <span>Confirm Reservation &amp; Settle via Bank Transfer / At Hotel</span>
                </button>
              </div>
            )}

            <div className="pt-3 border-t border-[#ece6dd]/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <button
                type="button"
                onClick={() => jumpToStep(2)}
                className="text-xs font-condensed uppercase tracking-wider text-stone-500 hover:text-[var(--accent)] inline-flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Modify guest details
              </button>
              <button
                type="button"
                onClick={() => jumpToStep(1)}
                className="text-xs font-condensed uppercase tracking-wider text-stone-500 hover:text-[var(--accent)] inline-flex items-center gap-1.5 transition-colors"
              >
                Change room
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Sidebar: authoritative price breakdown */}
      <aside className="h-fit rounded-xl p-6 sm:p-8 space-y-4 border border-[#ece6dd]/80 bg-white dark:bg-[#1a1815] shadow-md lg:sticky lg:top-[160px]" aria-live="polite">
        <div>
          <span className="eyebrow text-[var(--accent)] font-medium">Stay Breakdown</span>
          <h2 className="mt-1 text-2xl sm:text-3xl font-display font-normal text-stone-900 dark:text-white">
            {quote ? quote.roomTypeName : "Your Selection"}
          </h2>
        </div>

        {!quote && (
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Search your dates and select a room — the full price breakdown, taxes and charges will appear here, calculated by our reservations system.
          </p>
        )}

        {quote && (
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between"><span className="text-stone-600 dark:text-stone-300">{quote.checkIn} → {quote.checkOut}</span><span className="text-stone-500">{quote.nights} night{quote.nights !== 1 ? "s" : ""}</span></div>
            <div className="border-t border-[#ece6dd] dark:border-[#2e2b26] pt-2.5 space-y-2">
              {quote.nightlyRates.map((r, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-stone-500 dark:text-stone-400">Night {i + 1} · {quote.roomTypeName}</span>
                  <span className="text-stone-700 dark:text-stone-200">{naira(r / 100)}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs">
                <span className="text-stone-500 dark:text-stone-400">Rooms</span>
                <span className="text-stone-700 dark:text-stone-200">× {quote.roomCount}</span>
              </div>
            </div>
            {quote.addons.length > 0 && (
              <div className="border-t border-[#ece6dd] dark:border-[#2e2b26] pt-2.5 space-y-2">
                {quote.addons.map((a) => (
                  <div key={a.id} className="flex justify-between text-xs">
                    <span className="text-stone-500 dark:text-stone-400">{a.name} × {a.qty}</span>
                    <span className="text-stone-700 dark:text-stone-200">{naira(a.total / 100)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-[#ece6dd] dark:border-[#2e2b26] pt-2.5 space-y-2">
              <div className="flex justify-between text-xs"><span className="text-stone-500 dark:text-stone-400">Rooms subtotal</span><span className="text-stone-700 dark:text-stone-200">{naira(quote.pricing.roomSubtotal / 100)}</span></div>
              {quote.pricing.discountTotal > 0 && (
                <div className="flex justify-between text-xs text-emerald-600"><span>Discount {quote.promoCode ? `(${quote.promoCode})` : ""}</span><span>−{naira(quote.pricing.discountTotal / 100)}</span></div>
              )}
              <div className="flex justify-between text-xs"><span className="text-stone-500 dark:text-stone-400">Service charge (5%)</span><span className="text-stone-700 dark:text-stone-200">{naira(quote.pricing.serviceCharge / 100)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-stone-500 dark:text-stone-400">VAT (7.5%)</span><span className="text-stone-700 dark:text-stone-200">{naira(quote.pricing.taxTotal / 100)}</span></div>
              <div className="flex justify-between border-t border-[#ece6dd] dark:border-[#2e2b26] pt-2.5 text-base sm:text-lg font-medium text-stone-900 dark:text-white">
                <span>Total</span>
                <span className="text-[var(--accent)]">{naira(quote.pricing.grandTotal / 100)}</span>
              </div>
              <div className="flex justify-between text-xs"><span className="text-stone-500 dark:text-stone-400">Deposit due now</span><span className="text-stone-700 dark:text-stone-200 font-medium">{naira(quote.pricing.depositDue / 100)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-stone-500 dark:text-stone-400">Balance at hotel</span><span className="text-stone-700 dark:text-stone-200">{naira(quote.pricing.balanceDue / 100)}</span></div>
            </div>
            {quote.cancellationDeadline && (
              <p className="text-[0.68rem] text-stone-500 dark:text-stone-400 pt-2 border-t border-[#ece6dd] dark:border-[#2e2b26]">
                {quote.cancellationPolicy === "non_refundable"
                  ? "Non-refundable rate."
                  : `Free cancellation until ${quote.cancellationDeadline}.`}
              </p>
            )}
          </div>
        )}
      </aside>
    </div>
    </div>
  );
}

export default function BookingPage() {
  return (
    <>
      <section className="relative pt-32 pb-16 sm:pt-40 sm:pb-20 bg-[#1b1b1b] dark:bg-[#1a1a1d]">
        <div className="absolute inset-0 bg-gradient-to-b from-[#1b1b1b] dark:from-[#202023] via-[#1b1b1b]/80 to-[#1b1b1b] dark:to-[#202023]" />
        <div className="container-x relative z-10 text-center">
          <span className="eyebrow text-[var(--accent)] block mb-3">Online Reservations</span>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl text-white mb-4">Book Your Stay</h1>
          <p className="text-sm text-stone-300 max-w-xl mx-auto">
            Real-time availability, transparent pricing, and secure Paystack payments — confirmed the moment your payment is verified.
          </p>
        </div>
      </section>
      <section className="py-10 sm:py-16 md:py-20 bg-white dark:bg-[#202023]">
        <div className="container-x">
          <Suspense fallback={<div className="text-center py-20 text-stone-400">Loading booking form…</div>}>
            <BookingFlow />
          </Suspense>
        </div>
      </section>
    </>
  );
}
