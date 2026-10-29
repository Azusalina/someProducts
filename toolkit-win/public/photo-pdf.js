export function photoLayout(width, height, paper) {
  if (!(width > 0 && height > 0)) throw new Error('Invalid photo dimensions.');
  if (paper === 'photo') return { width: width * .75, height: height * .75, x: 0, y: 0, imageWidth: width * .75, imageHeight: height * .75 };
  const portrait = { A4: [595.28, 841.89], Letter: [612, 792] }[paper];
  if (!portrait) throw new Error('Choose A4, Letter or Fit photo.');
  const [pageWidth, pageHeight] = width > height ? [...portrait].reverse() : portrait;
  const margin = 34.02; // 12 mm, image aspect ratio preserved.
  const scale = Math.min((pageWidth - margin * 2) / width, (pageHeight - margin * 2) / height);
  const imageWidth = width * scale, imageHeight = height * scale;
  return { width: pageWidth, height: pageHeight, x: (pageWidth - imageWidth) / 2, y: (pageHeight - imageHeight) / 2, imageWidth, imageHeight };
}

export async function combinePhotos(PDFDocument, photos, paper) {
  if (!photos.length) throw new Error('Add at least one photo.');
  const pdf = await PDFDocument.create();
  for (const photo of photos) {
    const image = photo.jpeg ? await pdf.embedJpg(photo.bytes) : await pdf.embedPng(photo.bytes);
    const layout = photoLayout(image.width, image.height, paper);
    const page = pdf.addPage([layout.width, layout.height]);
    page.drawImage(image, { x: layout.x, y: layout.y, width: layout.imageWidth, height: layout.imageHeight });
  }
  return pdf.save();
}
