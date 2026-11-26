import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImageGallery } from "./ImageGallery";

describe("gallery fallback", () => {
  it("counts the fallback image and provides a keyboard-accessible photo opener", () => {
    const html = renderToStaticMarkup(<ImageGallery title="Island tour" images={[]} />);
    expect(html).toContain("1 / 1");
    expect(html).not.toContain("1 / 0");
    expect(html).toContain('aria-label="Open photos of Island tour"');
  });

  it("labels the navigation and thumbnails for multiple photos", () => {
    const images = [1, 2].map(id => ({ id: String(id), image_url: "/photo.jpg", alt_text: null, display_order: id }));
    const html = renderToStaticMarkup(<ImageGallery title="Island tour" images={images} />);
    expect(html).toContain("1 / 2");
    expect(html).toContain('aria-label="Next photo"');
    expect(html).toContain('aria-label="Show photo 2 of 2"');
  });
});
