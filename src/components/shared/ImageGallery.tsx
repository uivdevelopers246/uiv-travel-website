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
          className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 cursor-pointer group"
          onClick={() => setLightboxOpen(true)}
        >
          <img
            src={safeImageUrl}
            alt={currentImage.alt_text || title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {featuredBadge && (
            <span className="absolute top-4 left-4 bg-[#FBCA1A] text-[#193059] text-sm font-semibold px-4 py-1 rounded-full">
              Featured
            </span>
          )}
          {typeBadge && (
            <span className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm text-[#193059] text-sm font-medium px-4 py-1 rounded-full">
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
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-lg hover:bg-white transition"
              >
                <ChevronLeftIcon />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  nextImage();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-lg hover:bg-white transition"
              >
                <ChevronRightIcon />
              </button>
            </>
          )}
          <div className="absolute bottom-4 right-4 bg-black/60 text-white text-sm px-3 py-1 rounded-full">
            {selectedImageIndex + 1} / {images.length}
          </div>
        </div>

        {/* Thumbnail Strip */}
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {images.map((img, index) => (
              <button
                key={img.id}
                onClick={() => setSelectedImageIndex(index)}
                className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition ${
                  index === selectedImageIndex
                    ? "border-[#407FC2] ring-2 ring-[#407FC2]/30"
                    : "border-transparent hover:border-gray-300"
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
