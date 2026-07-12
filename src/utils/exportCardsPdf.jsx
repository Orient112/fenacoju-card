import { createRoot } from 'react-dom/client';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import JudokaCard from '../components/JudokaCard';

async function waitForImages(container) {
  const images = container.querySelectorAll('img');
  await Promise.all(
    [...images].map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            })
    )
  );
}

async function captureCardImage(judoka) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;pointer-events:none;';
  document.body.appendChild(host);

  const root = createRoot(host);
  root.render(<JudokaCard judoka={judoka} />);

  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  await waitForImages(host);

  const node = host.querySelector('.judoka-card');
  if (!node) {
    root.unmount();
    document.body.removeChild(host);
    throw new Error('Carte introuvable');
  }

  const dataUrl = await toJpeg(node, {
    quality: 0.95,
    pixelRatio: 3,
    backgroundColor: '#ffffff',
    width: node.offsetWidth,
    height: node.offsetHeight,
    cacheBust: true,
  });

  root.unmount();
  document.body.removeChild(host);
  return dataUrl;
}

export async function exportCardsToPdf(judokas, onProgress) {
  if (!judokas.length) {
    throw new Error('Aucune carte à exporter');
  }

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85, 55] });

  for (let i = 0; i < judokas.length; i++) {
    if (i > 0) {
      pdf.addPage([85, 55], 'landscape');
    }
    const dataUrl = await captureCardImage(judokas[i]);
    pdf.addImage(dataUrl, 'JPEG', 0, 0, 85, 55);
    onProgress?.(i + 1, judokas.length);
  }

  pdf.save(`fenacoju-cartes-${new Date().toISOString().split('T')[0]}.pdf`);
}
