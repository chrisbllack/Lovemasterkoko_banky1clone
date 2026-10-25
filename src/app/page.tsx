"use client";
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, Play, Pause, Volume2, VolumeX, Loader2 } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Dynamic imports — below-fold sections load only when scrolled to    */
/* ------------------------------------------------------------------ */
const AboutSection = dynamic(() => import("@/components/home/sections").then((m) => m.AboutSection), { loading: () => <div className="h-96" /> });
const RoomsSection = dynamic(() => import("@/components/home/sections").then((m) => m.RoomsSection), { loading: () => <div className="h-96" /> });
const FacilitiesSection = dynamic(() => import("@/components/home/sections").then((m) => m.FacilitiesSection), { loading: () => <div className="h-96" /> });
const ExperiencesSection = dynamic(() => import("@/components/home/sections").then((m) => m.ExperiencesSection), { loading: () => <div className="h-96" /> });
const GallerySection = dynamic(() => import("@/components/home/sections").then((m) => m.GallerySection), { loading: () => <div className="h-96" /> });
const TestimonialsSection = dynamic(() => import("@/components/home/sections").then((m) => m.TestimonialsSection), { loading: () => <div className="h-96" /> });
const FaqSection = dynamic(() => import("@/components/home/sections").then((m) => m.FaqSection), { loading: () => <div className="h-96" /> });
const CtaSection = dynamic(() => import("@/components/home/sections").then((m) => m.CtaSection), { loading: () => <div className="h-64" /> });

/* ------------------------------------------------------------------ */
/*  Hero Video Header                                                 */
/* ------------------------------------------------------------------ */
function HeroVideoHeader() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [videoLoaded, setVideoLoaded] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setVideoLoaded(true);
          })
          .catch(() => {
            if (videoRef.current) {
              videoRef.current.muted = true;
              videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
            }
          });
      }
    }
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      const p = video.play();
      if (p !== undefined) {
        p.then(() => setIsPlaying(true)).catch((err) => {
          console.warn("Home hero play deferred, muted retry:", err);
          video.muted = true;
          setIsMuted(true);
          const p2 = video.play();
          if (p2 !== undefined) {
            p2.then(() => setIsPlaying(true)).catch(() => {});
          }
        });
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  return (
    <div id="video-header-container" data-video-header="true" className="video-header-container absolute inset-0 overflow-hidden bg-black">
      {/* Baseline Hero Image Backdrop — renders immediately as the first visual on the page */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/exterior-night.jpg"
        alt="Banky Hotel & Suites Exterior"
        className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none"
      />

      <video
        ref={videoRef}
        poster="/images/exterior-night.jpg"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onLoadStart={() => setVideoLoaded(false)}
        onWaiting={() => setVideoLoaded(false)}
        onLoadedData={() => setVideoLoaded(true)}
        onCanPlay={() => setVideoLoaded(true)}
        onPlaying={() => {
          setVideoLoaded(true);
          setIsPlaying(true);
        }}
        className={`w-full h-full object-cover object-center select-none transition-opacity duration-700 ${
          videoLoaded ? "opacity-100" : "opacity-0"
        }`}
      >
        <source src="/videos/hero.mp4" type="video/mp4" />
        <source src="/videos/executive-room.mp4" type="video/mp4" />
      </video>

      {/* Gradient overlay */}
      <div className="absolute inset-0 z-20 bg-gradient-to-t from-black/85 via-black/45 to-black/25 pointer-events-none" />

      {/* Video Playback Toggle: absolutely positioned at bottom: 1rem, right: 1rem, z-index: 30 */}
      <button
        id="video-playback-toggle"
        type="button"
        onClick={togglePlay}
        className="absolute bottom-4 right-4 z-30 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white flex items-center justify-center backdrop-blur-md transition-all hover:scale-105 active:scale-95 shadow-md cursor-pointer"
        aria-label={!videoLoaded ? "Video loading..." : isPlaying ? "Pause video" : "Play video"}
        title={!videoLoaded ? "Video buffering..." : isPlaying ? "Pause video" : "Play video"}
      >
        {!videoLoaded ? (
          <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 fill-white" />
        )}
      </button>

      {/* Audio Toggle: absolutely positioned to the left of #video-playback-toggle to prevent overlap */}
      <button
        id="video-audio-toggle"
        type="button"
        onClick={toggleMute}
        className="absolute bottom-4 right-16 sm:right-[4.25rem] z-30 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white flex items-center justify-center backdrop-blur-md transition-all hover:scale-105 active:scale-95 shadow-md cursor-pointer"
        aria-label={isMuted ? "Unmute audio" : "Mute audio"}
        title={isMuted ? "Unmute audio" : "Mute audio"}
      >
        {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function Home() {
  return (
    <>
      {/* HERO — critical, inlined */}
      <section className="relative min-h-[100dvh] w-full overflow-hidden flex flex-col justify-center lg:justify-end">
        <HeroVideoHeader />
        <div className="container-x relative z-30 flex flex-col justify-center lg:justify-end pt-20 sm:pt-24 lg:pt-28 pb-8 sm:pb-12 my-auto lg:my-0">
          <div className="max-w-3xl pb-0 lg:pb-8 mx-auto lg:mx-0 text-center lg:text-left">
            <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-normal text-white leading-[1.1] text-center lg:text-left">
              Banky Hotel &amp; Suites
            </h1>
            <p className="mt-3 sm:mt-5 max-w-xl mx-auto lg:mx-0 text-[14px] sm:text-base leading-relaxed text-stone-100 font-normal text-center lg:text-left">
              Quiet luxury in the heart of Ado-Ekiti
            </p>
            <div className="mt-6 sm:mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-3.5">
              <Link href="/booking" className="btn-gold px-8 py-4 text-xs sm:text-sm inline-flex items-center gap-2.5 shadow-lg shadow-[var(--accent)]/30 font-medium">
                <span>Book Now</span><ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* BELOW-FOLD — dynamically split into separate chunks */}
      <AboutSection />
      <RoomsSection />
      <FacilitiesSection />
      <ExperiencesSection />
      <GallerySection />
      <TestimonialsSection />
      <FaqSection />
      <CtaSection />
    </>
  );
}
