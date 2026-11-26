"use client";

import { useEffect, useRef, useState } from "react";
import { getSafeImageUrl, DEFAULT_IMAGE_FALLBACK } from "@/lib/utils/image";

export type GalleryImage = {
  id: string;
  image_url: string;
  alt_text: string | null;
  display_order: number;
};

type Props = {
  images: GalleryImage[];
  title: string;
  featuredBadge?: boolean;
  typeBadge?: string;
};

export function ImageGallery({ images, title, featuredBadge, typeBadge }: Props) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const imageCount = Math.max(images.length, 1);
  const imageIndex = Math.min(selectedImageIndex, imageCount - 1);

  useEffect(() => {
    if (!lightboxOpen) return;
    const dialog = dialogRef.current;
    const opener = openerRef.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [lightboxOpen]);

  const currentImage = images[imageIndex] || { image_url: null, alt_text: title };
  const safeImageUrl = getSafeImageUrl(currentImage.image_url, DEFAULT_IMAGE_FALLBACK);

  const nextImage = () => {
    if (images.length > 1) {
      setSelectedImageIndex((prev) => (prev + 1) % images.length);
    }
  };

  const prevImage = () => {
    if (images.length > 1) {
      setSelectedImageIndex((prev) => (prev - 1 + images.length) % images.length);
    }
  };

  return (
    <>
      <div className="space-y-2 sm:space-y-4">
        {/* Main Image */}
        <div
          className="group relative aspect-video overflow-hidden rounded-[22px] border border-white/50 bg-slate-100 shadow-[0_30px_80px_rgba(25,48,89,0.16)] cursor-pointer sm:aspect-[16/11] sm:rounded-[30px]"
        >
          <img
            src={safeImageUrl}
            alt={currentImage.alt_text || title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,20,43,0.08)_0%,rgba(9,20,43,0.02)_38%,rgba(9,20,43,0.38)_100%)]" />
          <button
            type="button"
            ref={openerRef}
            aria-label={`Open photos of ${title}`}
            onClick={() => setLightboxOpen(true)}
            className="absolute inset-0 rounded-[30px] focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-[#FBCA1A]"
          />
          {featuredBadge && (
            <span className="absolute left-5 top-5 rounded-full bg-[#FBCA1A] px-4 py-1.5 text-sm font-semibold text-[#193059] shadow-[0_12px_24px_rgba(25,48,89,0.16)]">
              Featured
            </span>
          )}
          {typeBadge && (
            <span className="absolute right-5 top-5 rounded-full border border-white/70 bg-white/88 px-4 py-1.5 text-sm font-medium text-[#193059] backdrop-blur-sm">
              {typeBadge}
            </span>
          )}
          {images.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={(e) => {
                  e.stopPropagation();
                  prevImage();
                }}
                className="absolute left-5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-[#193059] shadow-lg transition hover:scale-105 hover:bg-white"
              >
                <ChevronLeftIcon />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={(e) => {
                  e.stopPropagation();
                  nextImage();
                }}
                className="absolute right-5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-[#193059] shadow-lg transition hover:scale-105 hover:bg-white"
              >
                <ChevronRightIcon />
              </button>
            </>
          )}
          <div className="absolute bottom-5 right-5 rounded-full border border-white/20 bg-[#193059]/78 px-3 py-1 text-sm text-white backdrop-blur-sm">
            {imageIndex + 1} / {imageCount}
          </div>
        </div>

        {/* Thumbnail Strip */}
        {images.length > 1 && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {images.map((img, index) => (
              <button
                key={img.id}
                type="button"
                aria-label={`Show photo ${index + 1} of ${images.length}`}
                aria-pressed={index === imageIndex}
                onClick={() => setSelectedImageIndex(index)}
                className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border-2 transition sm:h-[5.5rem] sm:w-[5.5rem] sm:rounded-2xl ${
                  index === selectedImageIndex
                    ? "border-[#407FC2] shadow-[0_12px_24px_rgba(64,127,194,0.28)] ring-2 ring-[#407FC2]/25"
                    : "border-white/60 shadow-[0_10px_24px_rgba(25,48,89,0.08)] hover:border-[#bfd3e7]"
                }`}
              >
                <img
                  src={getSafeImageUrl(img.image_url, DEFAULT_IMAGE_FALLBACK)}
                  alt={img.alt_text || `Image ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {lightboxOpen && (
        <dialog
          ref={dialogRef}
          aria-label={`Photos of ${title}`}
          onCancel={() => setLightboxOpen(false)}
          onClose={() => setLightboxOpen(false)}
          className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-black/90 p-0 text-white open:flex open:items-center open:justify-center backdrop:bg-black/70"
          onClick={(event) => {
            if (event.target === event.currentTarget) setLightboxOpen(false);
          }}
        >
          <button
            type="button"
            aria-label="Close photos"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-6 right-6 text-white hover:text-gray-300"
          >
            <CloseIcon />
          </button>
          {images.length > 1 && (
            <button
              type="button"
              aria-label="Previous photo"
              onClick={(e) => {
                e.stopPropagation();
                prevImage();
              }}
              className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition"
            >
              <ChevronLeftIcon className="w-6 h-6" />
            </button>
          )}
          <img
            src={safeImageUrl}
            alt={currentImage.alt_text || title}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {images.length > 1 && (
            <button
              type="button"
              aria-label="Next photo"
              onClick={(e) => {
                e.stopPropagation();
                nextImage();
              }}
              className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition"
            >
              <ChevronRightIcon className="w-6 h-6" />
            </button>
          )}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-2 rounded-full">
            {imageIndex + 1} / {imageCount}
          </div>
        </dialog>
      )}
    </>
  );
}

// Icon components
function ChevronLeftIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
