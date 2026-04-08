"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { validateImageFile, getSafeImageUrl, DEFAULT_IMAGE_FALLBACK } from "@/lib/utils/image";

export type ManagedImage = {
  id: string;
  image_url: string;
  alt_text: string | null;
  display_order: number;
  isNew?: boolean; // For newly added images that haven't been saved yet
};

type Props = {
  /** Existing images from the database */
  images: ManagedImage[];
  /** Maximum number of images allowed */
  maxImages?: number;
  /** Storage bucket name for uploads */
  storageBucket: string;
  /** Path prefix in storage (e.g., vendorId) */
  storagePath: string;
  /** API endpoint to manage images (e.g., /api/accommodations/{id}/images) */
  apiEndpoint: string;
  /** Called when images change */
  onImagesChange: (images: ManagedImage[]) => void;
  /** Called when there's an error */
  onError?: (error: string) => void;
  /** Optional label override */
  label?: string;
};

export function ImageManager({
  images,
  maxImages = 20,
  storageBucket,
  storagePath,
  apiEndpoint,
  onImagesChange,
  onError,
  label = "Images",
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAddMore = images.length < maxImages;

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    // Validate file
    const validationError = validateImageFile(file);
    if (validationError) {
      onError?.(validationError);
      return;
    }

    setUploading(true);

    try {
      const supabase = createClient();
      const fileExt = file.name.split(".").pop()?.toLowerCase() || "";
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const objectPath = `${storagePath}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from(storageBucket)
        .upload(objectPath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "image/jpeg",
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // Get public URL
      const { data } = supabase.storage.from(storageBucket).getPublicUrl(objectPath);
      const imageUrl = data.publicUrl;

      // Save to database via API
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save image");
      }

      const { image: newImage } = await response.json();

      // Add to images list
      onImagesChange([...images, newImage]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to upload image";
      onError?.(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (imageId: string) => {
    if (deletingId) return; // Prevent multiple deletes

    setDeletingId(imageId);

    try {
      const response = await fetch(apiEndpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_id: imageId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete image");
      }

      // Remove from images list
      onImagesChange(images.filter((img) => img.id !== imageId));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to delete image";
      onError?.(msg);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-700">{label}</label>
        <span className="text-xs text-slate-500">
          {images.length} / {maxImages}
        </span>
      </div>

      {/* Image Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* Existing Images */}
        {images.map((image) => (
          <div
            key={image.id}
            className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 group"
          >
            <img
              src={getSafeImageUrl(image.image_url, DEFAULT_IMAGE_FALLBACK)}
              alt={image.alt_text || "Accommodation image"}
              className="w-full h-full object-cover"
            />
            {/* Delete button overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              <button
                type="button"
                onClick={() => handleDelete(image.id)}
                disabled={deletingId === image.id}
                className="opacity-0 group-hover:opacity-100 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-all disabled:opacity-50"
                title="Remove image"
              >
                {deletingId === image.id ? (
                  <SpinnerIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <XIcon className="w-4 h-4" />
                )}
              </button>
            </div>
            {/* Order badge */}
            <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
              {image.display_order + 1}
            </div>
          </div>
        ))}

        {/* Add New Image Button */}
        {canAddMore && (
          <label
            className={`aspect-square rounded-lg border-2 border-dashed border-slate-300 hover:border-[#407FC2] bg-slate-50 hover:bg-slate-100 flex flex-col items-center justify-center cursor-pointer transition-colors ${
              uploading ? "pointer-events-none opacity-60" : ""
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading}
            />
            {uploading ? (
              <>
                <SpinnerIcon className="w-8 h-8 text-[#407FC2] animate-spin" />
                <span className="mt-2 text-xs text-slate-500">Uploading...</span>
              </>
            ) : (
              <>
                <PlusIcon className="w-8 h-8 text-slate-400" />
                <span className="mt-2 text-xs text-slate-500">Add Image</span>
              </>
            )}
          </label>
        )}
      </div>

      {/* Help text */}
      <p className="text-xs text-slate-500">
        Click the + button to add images. Hover over an image and click X to remove it.
        Maximum {maxImages} images allowed.
      </p>
    </div>
  );
}

// Icons
function XIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function PlusIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function SpinnerIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
