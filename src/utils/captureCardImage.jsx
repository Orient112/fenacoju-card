import { createRoot } from 'react-dom/client';
import { toJpeg } from 'html-to-image';
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

export async function captureCardImage(judoka) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;pointer-events:none;background:#ffffff;';
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

  node.style.margin = '0';
  node.style.boxShadow = 'none';
  node.style.maxWidth = 'none';
  node.style.transform = 'none';

  const width = node.offsetWidth;
  const height = node.offsetHeight;

  const dataUrl = await toJpeg(node, {
    quality: 0.95,
    pixelRatio: 3,
    backgroundColor: '#ffffff',
    width,
    height,
    cacheBust: true,
    style: {
      margin: '0',
      boxShadow: 'none',
      transform: 'none',
    },
  });

  root.unmount();
  document.body.removeChild(host);
  return dataUrl;
}
