"use client";
import { use, useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ROOMS, HOTEL, naira, whatsappLink, bookingMessage } from "@/lib/hotel";
import { ArrowRight, Check, Play, Pause, Volume2, VolumeX, Upload, Sparkles, Maximize2, ZoomIn, Film, Loader2, ShieldCheck, Save } from "lucide-react";
import { PhoneSolidIcon } from "@/components/icons/PhoneSolidIcon";
import { RoomSchema } from "@/components/seo/StructuredData";
import { RoomImageSlider } from "@/components/common/RoomImageSlider";
import { RoomPhotoLightbox } from "@/components/common/RoomPhotoLightbox";
import { VideoStitcherModal } from "@/components/admin/VideoStitcherModal";
import { RoomVideoUploadModal } from "@/components/admin/RoomVideoUploadModal";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  RoomImagePreloadLinks,
  preloadImages,
  preloadRoomImages,
  useRoomPreloader,
} from "@/lib/image-preloader";

export default function RoomDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const room =
    ROOMS.find(
      (r) =>
        r.slug === slug ||
        (slug === "signature-suite" && r.slug === "luxury-suite") ||
        (slug === "presidential-suite" && r.slug === "luxury")
    ) ||
    ROOMS[0]!;

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [customVideoSrc, setCustomVideoSrc] = useState<string | null>(null);
  const [customImages, setCustomImages] = useState<string[] | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState<boolean>(false);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);
  const [stitcherOpen, setStitcherOpen] = useState<boolean>(false);
  const [videoModalOpen, setVideoModalOpen] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Determine if user has admin privileges or admin mode enabled via backend query/auth
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("admin") === "1" || params.get("admin") === "true") {
        setIsAdmin(true);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const email = (user.email ?? "").toLowerCase();
        const allowlist = [
          "bankyhotelado@gmail.com",
          "chrisbllack@gmail.com",
          "admin@bankyhotelandsuites.com",
          "chrisbllackaidev@gmail.com",
          "infinityplussolutionsss@gmail.com",
        ];
        if (allowlist.includes(email)) {
          setIsAdmin(true);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const openLightbox = (index: number = 0) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  // Reduced speed by 50% from 0.65x down to ~0.33x for ultra-smooth luxurious slow motion
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(0.33);

  const { getPreloadHandlers } = useRoomPreloader();

  const defaultRoomImages = room.images && room.images.length > 0 ? room.images : [room.image];
  const roomImages = customImages && customImages.length > 0 ? customImages : defaultRoomImages;

  // Immediate preloading of gallery slider images + idle warming of adjacent rooms
  useEffect(() => {
    // 1. High priority preload for active room's gallery images
    if (roomImages && roomImages.length > 0) {
      preloadImages(roomImages, true);
    }

    // 2. Warm up adjacent rooms in background idle time
    const currentIdx = ROOMS.findIndex((r) => r.slug === room.slug);
    const nextRoom = ROOMS[(currentIdx + 1) % ROOMS.length];
    const prevRoom = ROOMS[(currentIdx - 1 + ROOMS.length) % ROOMS.length];

    const timer = setTimeout(() => {
      if (nextRoom) preloadRoomImages(nextRoom.slug, false);
      if (prevRoom) preloadRoomImages(prevRoom.slug, false);
    }, 1500);

    return () => clearTimeout(timer);
  }, [roomImages, room.slug]);

  const defaultVideo = room.video || `/videos/${room.slug}-room.mp4`;
  const [activeVideoSrc, setActiveVideoSrc] = useState<string>(customVideoSrc || defaultVideo);
  const [videoError, setVideoError] = useState(false);
  const hasVideo = true;

  useEffect(() => {
    if (customVideoSrc) {
      setActiveVideoSrc(customVideoSrc);
      setVideoError(false);
    } else {
      setActiveVideoSrc(room.video || `/videos/${room.slug}-room.mp4`);
      setVideoError(false);
    }
  }, [customVideoSrc, room.video, room.slug]);

  // Query live video header status and cache-busting timestamp on mount
  useEffect(() => {
    let unmounted = false;
    fetch(`/api/upload-video?slug=${room.slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (!unmounted && data.ok && data.video?.url) {
          setActiveVideoSrc(data.video.url);
          setVideoError(false);
        }
      })
      .catch(() => {});
    return () => {
      unmounted = true;
    };
  }, [room.slug]);

  const handleVideoError = () => {
    if (!videoError) {
      if (activeVideoSrc.includes("-room.mp4")) {
        const altSrc = `/videos/${room.slug}.mp4`;
        console.warn(`Video ${activeVideoSrc} failed to load, trying alt alias ${altSrc}`);
        setActiveVideoSrc(altSrc);
      } else if (activeVideoSrc !== "/videos/executive-room.mp4") {
        console.warn(`Video ${activeVideoSrc} failed to load, falling back to default tour.`);
        setVideoError(true);
        setActiveVideoSrc("/videos/executive-room.mp4");
      }
    }
  };

  const applySpeed = (rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      videoRef.current.defaultPlaybackRate = rate;
      // Preserve pitch for audio playback if unmuted
      if ("preservesPitch" in videoRef.current) {
        (videoRef.current as HTMLVideoElement & { preservesPitch: boolean }).preservesPitch = true;
      }
    }
  };

  // Ensure seamless unprompted autoplay start without requiring user interaction
  useEffect(() => {
    const video = videoRef.current;
    if (video && hasVideo) {
      video.muted = true;
      video.defaultMuted = true;
      applySpeed(playbackSpeed);
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setVideoLoaded(true);
          })
          .catch((err) => {
            console.warn("Autoplay was deferred or blocked by browser policy:", err);
            // Ensure muted fallback and retry
            video.muted = true;
            setIsMuted(true);
            video.play().then(() => setIsPlaying(true)).catch(() => {});
          });
      }
    }
  }, [activeVideoSrc, hasVideo, playbackSpeed]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.muted = isMuted;
      video
        .play()
        .then(() => {
          setIsPlaying(true);
          setVideoLoaded(true);
        })
        .catch((err) => {
          console.warn("Manual play attempt deferred, retrying muted:", err);
          video.muted = true;
          setIsMuted(true);
          video
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => {});
        });
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const speeds = [0.25, 0.33, 0.5, 0.75, 1];
  const cycleSpeed = () => {
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const next = speeds[nextIdx] ?? 0.33;
    setPlaybackSpeed(next);
    applySpeed(next);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhotos(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
      formData.append("slug", room.slug);

      const res = await fetch("/api/upload-room-image", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.urls && data.urls.length > 0) {
        const freshUrls = data.urls.map((u: string) => `${u}?t=${Date.now()}`);
        setCustomImages(freshUrls);
        setUploadSuccessMessage(data.message || `Loaded ${data.urls.length} actual photo(s)`);
        setTimeout(() => setUploadSuccessMessage(null), 6000);
      }
    } catch (err) {
      console.error("Photo upload failed:", err);
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("slug", room.slug);

      const res = await fetch("/api/upload-video", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.url) {
        // Bust cache so new video reloads instantly
        setCustomVideoSrc(`${data.url}?t=${Date.now()}`);
        setVideoLoaded(false);
      }
    } catch (err) {
      console.error("Video upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <RoomImagePreloadLinks images={roomImages} />
      <RoomSchema slug={slug} />
      <section
        id="video-header-container"
        data-video-header="true"
        className="video-header-container relative min-h-[380px] xs:min-h-[440px] sm:min-h-[500px] md:min-h-[560px] lg:min-h-[620px] pt-28 pb-16 sm:pt-36 sm:pb-24 bg-[#111111] overflow-hidden flex flex-col justify-end"
      >
        {/* Baseline Room Photo Backdrop — guaranteed first visual to show immediately */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={roomImages[0] || room.image}
          alt={room.name}
          className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none"
        />

        {/* Background Video Header rendered in Landscape mode - video only */}
        <video
          ref={videoRef}
          key={activeVideoSrc}
          id={`${room.slug}-room-header-video`}
          src={activeVideoSrc}
          poster={roomImages[0] || room.image}
          autoPlay
          loop
          muted={isMuted}
          playsInline
          crossOrigin="anonymous"
          preload="auto"
          onError={handleVideoError}
          onLoadStart={() => {
            setVideoLoaded(false);
          }}
          onWaiting={() => {
            setVideoLoaded(false);
          }}
          onPlaying={() => {
            setVideoLoaded(true);
            setIsPlaying(true);
            applySpeed(playbackSpeed);
          }}
          onLoadedMetadata={() => {
            setVideoLoaded(true);
            applySpeed(playbackSpeed);
            if (videoRef.current) {
              const p = videoRef.current.play();
              if (p !== undefined) {
                p.then(() => setIsPlaying(true)).catch((err) => {
                  console.warn("Autoplay deferred, retry muted:", err);
                  if (videoRef.current) {
                    videoRef.current.muted = true;
                    setIsMuted(true);
                    const retry = videoRef.current.play();
                    if (retry !== undefined) {
                      retry.then(() => setIsPlaying(true)).catch(() => {});
                    }
                  }
                });
              }
            }
          }}
          onLoadedData={() => {
            setVideoLoaded(true);
            applySpeed(playbackSpeed);
            if (videoRef.current && videoRef.current.paused) {
              const p = videoRef.current.play();
              if (p !== undefined) {
                p.then(() => setIsPlaying(true)).catch(() => {});
              }
            }
          }}
          onCanPlay={() => {
            setVideoLoaded(true);
            if (videoRef.current && videoRef.current.paused) {
              const p = videoRef.current.play();
              if (p !== undefined) {
                p.then(() => setIsPlaying(true)).catch(() => {});
              }
            }
          }}
          onPlay={() => {
            setIsPlaying(true);
            setVideoLoaded(true);
            applySpeed(playbackSpeed);
          }}
          onPause={() => {
            setIsPlaying(false);
          }}
          onTimeUpdate={() => {
            if (!videoLoaded) setVideoLoaded(true);
          }}
          className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-700 ${
            videoLoaded ? "opacity-85" : "opacity-0"
          }`}
        >
          <source src={activeVideoSrc} type="video/mp4" />
          <source
            src={activeVideoSrc.includes("-room.mp4") ? activeVideoSrc.replace("-room.mp4", ".mp4") : activeVideoSrc}
            type="video/mp4"
          />
          <source src={`/public/videos/${room.slug}-room.mp4`} type="video/mp4" />
        </video>

        {/* Cinematic dark film vignette & gradients to protect text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#111111] via-[#111111]/40 to-[#111111]/60 pointer-events-none" />
        <div className="absolute inset-0 bg-radial-gradient from-transparent via-transparent to-[#111111]/70 pointer-events-none" />

        {/* Video Header Controls: absolutely positioned within video header container */}
        {hasVideo && (
          <>
            <button
              id="video-playback-toggle"
              type="button"
              onClick={togglePlay}
              aria-label={!videoLoaded ? "Video header loading..." : isPlaying ? "Pause Video" : "Play Video"}
              title={!videoLoaded ? "Loading video stream..." : isPlaying ? "Pause video header" : "Play video header"}
              className="absolute bottom-4 right-4 z-30 rounded-full bg-black/65 hover:bg-black/85 active:scale-95 backdrop-blur-md border border-white/25 text-white hover:text-[var(--accent-light)] transition-all shadow-md cursor-pointer disabled:cursor-wait"
            >
              {!videoLoaded ? (
                <Loader2 className="animate-spin text-amber-300" />
              ) : isPlaying ? (
                <Pause className="text-white" />
              ) : (
                <Play className="fill-white text-white" />
              )}
            </button>

            <button
              id="video-audio-toggle"
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? "Unmute Video" : "Mute Video"}
              title={isMuted ? "Unmute audio" : "Mute audio"}
              className="absolute bottom-4 right-16 sm:right-[4.25rem] z-30 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 text-white hover:text-[var(--accent-light)] transition-colors shadow-md cursor-pointer"
            >
              {isMuted ? <VolumeX /> : <Volume2 />}
            </button>
          </>
        )}

        {/* Admin Header Controls & Tools — hidden from public guests, enabled only by admin at the backend */}
        {isAdmin && (
          <>
            {/* Upload success notification */}
            {uploadSuccessMessage && (
              <div className="absolute top-28 sm:top-36 right-3 sm:right-8 z-30 bg-emerald-900/90 text-emerald-100 text-xs px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg border border-emerald-500/40 backdrop-blur-md shadow-lg animate-fadeIn">
                ✓ {uploadSuccessMessage}
              </div>
            )}

            {/* Video controls & Live status toolbar - visible only when admin mode is active */}
            <div className="absolute top-20 sm:top-24 md:top-28 right-3 sm:right-6 md:right-8 z-20 flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 max-w-[calc(100%-1.5rem)] sm:max-w-none">
              <span
                id="video-admin-badge"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-amber-500/20 backdrop-blur-md border border-amber-400/40 text-[10px] sm:text-xs font-condensed tracking-wider uppercase text-amber-300 font-semibold shadow-sm"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Admin Controls</span>
              </span>

              <span
                id="video-live-badge"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[10px] sm:text-xs font-condensed tracking-wider uppercase text-amber-300 font-medium shadow-sm"
              >
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="hidden sm:inline">Video Header ({playbackSpeed}x)</span>
                <span className="sm:hidden inline">Tour ({playbackSpeed}x)</span>
              </span>

              <button
                id="video-speed-toggle"
                type="button"
                onClick={cycleSpeed}
                aria-label={`Change playback speed, currently ${playbackSpeed}x`}
                className="inline-flex items-center px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 text-white hover:text-[var(--accent-light)] text-[10px] sm:text-xs font-condensed tracking-wider uppercase font-semibold transition-colors shadow-sm cursor-pointer shrink-0"
                title="Toggle playback speed"
              >
                {playbackSpeed}x
              </button>

              <button
                id="room-header-lightbox-trigger"
                type="button"
                onClick={() => openLightbox(0)}
                className="inline-flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 text-[10px] sm:text-xs font-condensed tracking-wider uppercase text-white hover:text-amber-200 transition-all shadow-sm cursor-pointer shrink-0"
                title="Click to view full-resolution photo gallery"
              >
                <ZoomIn className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-300" />
                <span className="hidden xs:inline">Photos ({roomImages.length})</span>
                <span className="xs:hidden">{roomImages.length}</span>
              </button>

              <button
                id="video-stitch-trigger"
                type="button"
                onClick={() => setStitcherOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-amber-500 hover:bg-amber-600 backdrop-blur-md border border-amber-400/40 text-[10px] sm:text-xs font-condensed tracking-wider uppercase text-black font-bold transition-all shadow-sm cursor-pointer shrink-0"
                title="Upload multiple clips and stitch together into this room header"
              >
                <Film className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden xs:inline">Stitch Video</span>
                <span className="xs:hidden">Stitch</span>
              </button>

              <button
                id="video-save-modal-trigger"
                type="button"
                onClick={() => setVideoModalOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-amber-500 hover:bg-amber-600 backdrop-blur-md border border-amber-400/40 text-[10px] sm:text-xs font-condensed tracking-wider uppercase text-black font-bold transition-all shadow-sm cursor-pointer shrink-0"
                title="Select, preview, and save the active video header for this room"
              >
                <Save className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden xs:inline">Upload &amp; Save Video</span>
                <span className="xs:hidden">Save Video</span>
              </button>

              <button
                id="video-upload-trigger"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 text-[10px] sm:text-xs font-condensed tracking-wider uppercase text-white transition-colors shadow-sm cursor-pointer disabled:opacity-50 shrink-0"
                title="Quick replace video file for this room"
              >
                <Upload className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span>{uploading ? "Uploading..." : "Quick Replace"}</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/*"
                className="hidden"
                onChange={handleVideoUpload}
              />
              <input
                ref={photoInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>
          </>
        )}

        <div className="container-x relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Link href="/rooms" className="text-xs font-condensed uppercase tracking-wider font-medium text-stone-300 hover:text-[var(--accent-light)] transition-colors">Rooms & Suites</Link>
            <span className="text-stone-400">/</span>
            <span className="text-xs font-condensed uppercase tracking-wider font-medium text-[var(--accent-light)]">{room.name}</span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-display font-normal text-4xl sm:text-5xl md:text-6xl text-white">{room.name}</h1>
            {hasVideo && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-condensed uppercase tracking-wider bg-[var(--accent)]/20 text-[var(--accent-light)] border border-[var(--accent)]/40 font-medium">
                <Sparkles className="h-3 w-3" /> Video Tour
              </span>
            )}
          </div>
          <p className="text-base sm:text-lg text-stone-100 font-normal max-w-2xl">{room.blurb}</p>
        </div>
      </section>
      <section className="py-16 sm:py-24 bg-white dark:bg-[#202023]">
        <div className="container-x">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="overflow-hidden rounded-2xl border border-[#ece6dd] dark:border-[#3a3a42] mb-4 shadow-md">
                <RoomImageSlider
                  images={roomImages}
                  alt={room.name}
                  aspectClass="aspect-[16/10]"
                  autoSlideInterval={6000}
                  priority={true}
                  onExpand={(idx) => openLightbox(idx)}
                />
              </div>

              {roomImages.length > 1 && (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-condensed uppercase tracking-wider font-semibold text-stone-700 dark:text-stone-300">
                        Room Photo Gallery
                      </h4>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-condensed uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold border border-amber-400/30">
                        <ZoomIn className="h-2.5 w-2.5" />
                        <span>Click to Zoom Textures</span>
                      </span>
                    </div>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 hidden sm:inline">
                      Click any photo to inspect fine fabrics, textures & finishes in full screen
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {roomImages.map((img, idx) => (
                      <button
                        key={img + idx}
                        type="button"
                        onClick={() => openLightbox(idx)}
                        className="group relative overflow-hidden rounded-xl border border-[#ece6dd] dark:border-[#3a3a42] bg-stone-100 dark:bg-stone-800 transition-all hover:border-[var(--accent)] text-left cursor-pointer shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      >
                        <div className="aspect-[16/10] relative overflow-hidden bg-stone-200 dark:bg-stone-800">
                          {/* Blurred placeholder background using CSS filter: blur(20px) while full image loads */}
                          <div
                            className="img-blur-bg absolute inset-0 bg-cover bg-center pointer-events-none transition-opacity duration-700"
                            style={{
                              backgroundImage: `url(${encodeURI(img)})`,
                              filter: "blur(20px)",
                              WebkitFilter: "blur(20px)",
                              transform: "scale(1.15)",
                            }}
                            data-placeholder="blur"
                            aria-hidden="true"
                          />
                          <Image
                            src={img}
                            alt={`${room.name} Photo ${idx + 1}`}
                            fill
                            sizes="(max-width: 640px) 50vw, 33vw"
                            referrerPolicy="no-referrer"
                            className="relative z-10 object-cover group-hover:scale-105 transition-transform duration-500"
                            onLoad={(e) => {
                              const sibling = e.currentTarget.previousElementSibling as HTMLElement | null;
                              if (sibling) {
                                sibling.style.opacity = "0";
                                sibling.classList.add("is-loaded");
                              }
                            }}
                          />
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-condensed uppercase tracking-wider bg-black/70 text-white font-medium backdrop-blur-sm z-20">
                            Photo {idx + 1}
                          </span>

                          {/* Hover Overlay with High-Res Lightbox Cue */}
                          <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[1px] z-20">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 text-white text-xs font-condensed uppercase tracking-wider border border-white/30 backdrop-blur-sm shadow-md">
                              <ZoomIn className="h-3.5 w-3.5 text-amber-300" />
                              <span>Click to Zoom</span>
                            </span>
                          </div>
                        </div>
                        <div className="p-2.5 bg-white dark:bg-[#28282d] border-t border-[#ece6dd] dark:border-[#3a3a42] flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate">
                              {room.slug === "standard-plus"
                                ? idx === 0
                                  ? "Standard Plus Master Bedroom"
                                  : "Lounge & Workstation Interior"
                                : room.slug === "standard"
                                ? idx === 0
                                  ? "Standard Bedroom & Ambient Lighting"
                                  : "Workstation & Guest Interior"
                                : idx === 0
                                ? "Primary Chamber & Ambient Mood Lighting"
                                : "Media Wall, Desk & Wardrobe Suite"}
                            </p>
                            <p className="text-[10px] text-stone-600 dark:text-stone-300 font-mono mt-0.5 truncate">
                              {img.replace("/images/", "")}
                            </p>
                          </div>
                          <ZoomIn className="h-4 w-4 text-stone-400 group-hover:text-[var(--accent)] transition-colors shrink-0 ml-2" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <h2 className="font-display text-3xl font-normal text-stone-900 dark:text-white mb-4">About This Room</h2>
              <p className="text-base leading-relaxed text-stone-700 dark:text-stone-200 font-normal mb-8">{room.blurb}</p>
              <h3 className="font-display text-2xl font-normal text-stone-900 dark:text-white mb-4">Room Features</h3>
              <div className="grid grid-cols-2 gap-3">
                {room.features.map((f) => (
                  <div key={f} className="flex items-center gap-2.5 text-sm sm:text-base font-normal text-stone-800 dark:text-stone-100">
                    <Check className="h-4 w-4 text-[var(--accent)] shrink-0" /><span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="sticky top-28 rounded-2xl border border-[#ece6dd] dark:border-[#3a3a42] bg-white dark:bg-[#28282d] p-8 shadow-md">
                <div className="text-center mb-6">
                  <span className="eyebrow text-[var(--accent)] block mb-1">Starting from</span>
                  <span className="font-display text-4xl font-normal text-[var(--accent)]">{naira(room.rate)}</span>
                  <span className="text-xs font-condensed uppercase font-normal text-stone-600 dark:text-stone-300 block mt-1">per night</span>
                </div>
                <div className="space-y-3 mb-6 text-sm sm:text-base font-normal">
                  <div className="flex justify-between py-2.5 border-b border-[#ece6dd] dark:border-[#2e2b26]"><span className="text-stone-600 dark:text-stone-300 font-normal">Check-in</span><span className="font-medium text-stone-900 dark:text-white">{HOTEL.checkIn}</span></div>
                  <div className="flex justify-between py-2.5"><span className="text-stone-600 dark:text-stone-300 font-normal">Check-out</span><span className="font-medium text-stone-900 dark:text-white">{HOTEL.checkOut}</span></div>
                </div>
                <Link href={`/booking?room=${room.slug}`} className="btn-gold w-full py-4 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-2 mb-3 shadow-md">
                  <span>Book This Room</span><ArrowRight className="h-4 w-4" />
                </Link>
                <a href={whatsappLink(bookingMessage({ room: room.name, rate: room.rate }))} target="_blank" rel="noreferrer" className="w-full py-4 text-xs sm:text-sm inline-flex items-center justify-center gap-2 border-2 border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-all font-condensed uppercase tracking-[0.18em] font-medium">
                  <span>WhatsApp Inquiry</span>
                </a>
                <a href={`tel:${HOTEL.phone}`} className="flex items-center justify-center gap-2 mt-4 text-xs sm:text-sm font-medium text-stone-700 dark:text-stone-200 hover:text-[var(--accent)] transition-colors">
                  <PhoneSolidIcon className="h-4 w-4 text-[var(--accent)]" /><span>Call to Reserve: {HOTEL.phone}</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Explore Other Rooms with Instant Preloading on Hover & Touch */}
      <section className="py-16 bg-[#f8f5f0] dark:bg-[#1a1a1d] border-t border-[#ece6dd] dark:border-[#3a3a42]">
        <div className="container-x">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
            <div>
              <span className="eyebrow text-[var(--accent)] block mb-1">More Accommodations</span>
              <h3 className="font-display font-normal text-2xl sm:text-3xl text-stone-900 dark:text-white">
                Explore Other Suites
              </h3>
            </div>
            <Link
              href="/rooms"
              className="text-xs font-condensed uppercase tracking-wider font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1.5"
            >
              <span>View All 28 Rooms</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {ROOMS.filter((r) => r.slug !== room.slug)
              .slice(0, 3)
              .map((otherRoom) => (
                <Link
                  key={otherRoom.slug}
                  href={`/rooms/${otherRoom.slug}`}
                  {...getPreloadHandlers(otherRoom.slug)}
                  className="group block border border-[#ece6dd] dark:border-[#3a3a42] bg-white dark:bg-[#28282d] overflow-hidden rounded-2xl hover:shadow-lg transition-all duration-300 hover:border-[var(--accent)]"
                >
                  <RoomImageSlider
                    images={otherRoom.images && otherRoom.images.length > 0 ? otherRoom.images : [otherRoom.image]}
                    alt={otherRoom.name}
                    aspectClass="aspect-[16/10]"
                    autoSlideInterval={6000}
                  />
                  <div className="p-5">
                    <h4 className="font-display text-xl font-normal text-stone-900 dark:text-white mb-1.5">
                      {otherRoom.name}
                    </h4>
                    <p className="text-xs text-stone-600 dark:text-stone-300 line-clamp-2 mb-3">
                      {otherRoom.blurb}
                    </p>
                    <div className="flex items-center justify-between pt-3 border-t border-[#ece6dd] dark:border-[#3a3a42]">
                      <span className="font-display text-lg font-medium text-[var(--accent)]">
                        {naira(otherRoom.rate)}{" "}
                        <span className="text-[10px] font-condensed uppercase text-stone-500">/ night</span>
                      </span>
                      <span className="text-xs font-condensed uppercase tracking-wider font-semibold text-[var(--accent)] group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                        <span>Details</span>
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      </section>

      {/* Expanded High-Resolution Lightbox Gallery */}
      <RoomPhotoLightbox
        isOpen={lightboxOpen}
        images={roomImages}
        currentIndex={lightboxIndex}
        roomName={room.name}
        onClose={() => setLightboxOpen(false)}
        onNavigate={(idx) => setLightboxIndex(idx)}
        onUploadClick={() => photoInputRef.current?.click()}
      />

      {/* Room Video Header Stitcher Studio Modal (admin only) */}
      {isAdmin && (
        <VideoStitcherModal
          isOpen={stitcherOpen}
          onClose={() => setStitcherOpen(false)}
          defaultSlug={slug}
          onStitchComplete={({ url }) => {
            setCustomVideoSrc(`${url}?t=${Date.now()}`);
            setVideoLoaded(false);
            setUploadSuccessMessage("Video header successfully stitched and deployed!");
            setTimeout(() => setUploadSuccessMessage(null), 5000);
          }}
        />
      )}

      {/* Room Video Header Upload & Save Modal (admin only) */}
      {isAdmin && (
        <RoomVideoUploadModal
          isOpen={videoModalOpen}
          onClose={() => setVideoModalOpen(false)}
          defaultSlug={room.slug}
          onSaveComplete={({ url }) => {
            setCustomVideoSrc(`${url}?t=${Date.now()}`);
            setVideoLoaded(false);
            setUploadSuccessMessage("Successfully saved and activated main video header!");
            setTimeout(() => setUploadSuccessMessage(null), 6000);
          }}
        />
      )}
    </>
  );
}
