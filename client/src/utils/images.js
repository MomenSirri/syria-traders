// Bound uploads before storage/network transfer. Object URLs are always released.
export async function prepareImage(file, avatar = false) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPEG, PNG or WebP image.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose an image smaller than 12 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.width * image.height > 40000000)
      throw new Error("This image is too large. Resize it below 40 megapixels.");
    const canvas = document.createElement("canvas");
    const limit = avatar ? 28000 : 85000;
    let side = avatar ? 160 : 512;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      canvas.width = side;
      canvas.height = side;
      const context = canvas.getContext("2d");
      const crop = Math.min(image.width, image.height);
      context.drawImage(
        image,
        (image.width - crop) / 2,
        (image.height - crop) / 2,
        crop,
        crop,
        0,
        0,
        side,
        side,
      );
      const data = canvas.toDataURL("image/jpeg", 0.75);
      if (data.length <= limit) return data;
      side = Math.round(side * 0.8);
    }
    throw new Error("Could not resize this image. Try a different photo.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
