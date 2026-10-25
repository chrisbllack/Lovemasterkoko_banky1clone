"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ROOMS, naira } from "@/lib/hotel";
import { ArrowRight } from "lucide-react";
import { RoomImageSlider } from "@/components/common/RoomImageSlider";
import { useRoomPreloader, preloadAllRoomsOnIdle } from "@/lib/image-preloader";

export default function RoomsPage() {
  const { getPreloadHandlers } = useRoomPreloader();

  // Progressively warm up all room images during idle time
  useEffect(() => {
    const cancelIdle = preloadAllRoomsOnIdle(ROOMS, 600);
    return () => {
      cancelIdle?.();
    };
  }, []);

  return (
    <>
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 bg-[#1b1b1b] dark:bg-[#1a1a1d] overflow-hidden">
        {/* Baseline Header Image — guaranteed first visual to show immediately */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/exterior-night.jpg"
          alt="Rooms & Suites at Banky Hotel"
          className="absolute inset-0 w-full h-full object-cover opacity-35 pointer-events-none select-none"
        />
        <video
          autoPlay
          loop
          muted
          playsInline
          poster="/images/exterior-night.jpg"
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover opacity-35 pointer-events-none"
        >
          <source src="/videos/hero.mp4" type="video/mp4" />
          <source src="/videos/executive-room.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-t from-[#1b1b1b] dark:from-[#202023] via-[#1b1b1b]/60 to-[#1b1b1b]/80" />
        <div className="container-x relative z-10 text-center">
          <span className="eyebrow text-[var(--accent)] block mb-3">Luxury Accommodations</span>
          <h1 className="font-display font-normal text-4xl sm:text-5xl md:text-6xl text-white mb-4">Rooms &amp; Suites</h1>
          <p className="text-base text-stone-100 font-normal max-w-xl mx-auto">Twenty-eight appointed residences, each designed for comfort, elegance, and an unforgettable stay in Ado-Ekiti.</p>
        </div>
      </section>
      <section className="py-16 sm:py-24 bg-white dark:bg-[#202023]">
        <div className="container-x">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {ROOMS.map((room) => (
              <Link
                key={room.slug}
                href={`/rooms/${room.slug}`}
                {...getPreloadHandlers(room.slug)}
                className="group block border border-[#ece6dd] dark:border-[#3a3a42] bg-white dark:bg-[#28282d] overflow-hidden rounded-2xl hover:shadow-lg transition-all duration-300 hover:border-[var(--accent)]"
              >
                <RoomImageSlider
                  images={room.images && room.images.length > 0 ? room.images : [room.image]}
                  alt={room.name}
                  aspectClass="aspect-[16/10]"
                  autoSlideInterval={6000}
                />
                <div className="p-6">
                  <h2 className="font-display text-2xl font-normal text-stone-900 dark:text-white mb-2">{room.name}</h2>
                  <p className="text-sm text-stone-700 dark:text-stone-200 font-normal leading-relaxed mb-4">{room.blurb}</p>
                  <div className="flex items-center justify-between pt-3 border-t border-[#ece6dd] dark:border-[#3a3a42]">
                    <span className="font-display text-2xl font-medium text-[var(--accent)]">{naira(room.rate)} <span className="text-xs font-condensed uppercase font-normal text-stone-600 dark:text-stone-300">/ night</span></span>
                    <span className="btn-gold px-4 py-2 text-xs font-medium inline-flex items-center gap-1">View Details <ArrowRight className="h-3 w-3" /></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
