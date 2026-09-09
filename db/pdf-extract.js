// Extraction de texte depuis un buffer PDF, via pdfjs-dist (module ESM charge dynamiquement)
let pdfjsLibPromise = null;

function chargerPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsLibPromise;
}

async function extractTextFromPdf(buffer) {
  const pdfjsLib = await chargerPdfjs();

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
  });

  const pdfDocument = await loadingTask.promise;
  let texteComplet = '';

  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const contenu = await page.getTextContent();
    const texteLigne = contenu.items.map((item) => item.str).join(' ');
    texteComplet += texteLigne + '\n';
  }

  return texteComplet.trim();
}

module.exports = { extractTextFromPdf };
