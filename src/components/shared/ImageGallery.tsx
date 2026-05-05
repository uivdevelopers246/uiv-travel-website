"use client";

import { useState } from "react";
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

  const currentImage = images[selectedImageIndex] || { image_url: null, alt_text: title };
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
      <div className="space-y-4">
        {/* Main Image */}
        <div
          className="group relative aspect-[16/11] overflow-hidden rounded-[30px] border border-white/50 bg-slate-100 shadow-[0_30px_80px_rgba(25,48,89,0.16)] cursor-pointer"
          onClick={() => setLightboxOpen(true)}
        >
          <img
            src={safeImageUrl}
            alt={currentImage.alt_text || title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,20,43,0.08)_0%,rgba(9,20,43,0.02)_38%,rgba(9,20,43,0.38)_100%)]" />
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
                onClick={(e) => {
                  e.stopPropagation();
                  prevImage();
                }}
                className="absolute left-5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-[#193059] shadow-lg transition hover:scale-105 hover:bg-white"
              >
                <ChevronLeftIcon />
              </button>
              <button
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
            {selectedImageIndex + 1} / {images.length}
          </div>
        </div>

        {/* Thumbnail Strip */}
        {images.length > 1 && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {images.map((img, index) => (
              <button
                key={img.id}
                onClick={() => setSelectedImageIndex(index)}
                className={`h-[5.5rem] w-[5.5rem] flex-shrink-0 overflow-hidden rounded-2xl border-2 transition ${
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
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-6 right-6 text-white hover:text-gray-300"
          >
            <CloseIcon />
          </button>
          {images.length > 1 && (
            <button
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
            {selectedImageIndex + 1} / {images.length}
          </div>
        </div>
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
