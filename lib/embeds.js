// The original post or video, shown in the app only after a tap. Each platform's
// own embed page is loaded in an iframe, so nothing is fetched until then.
import { youtubeId } from './capture.js';

export function embedFor(meta) {
  const url = String(meta.url || '');
  let m;
  if (meta.type === 'youtube') {
    const id = youtubeId(url);
    if (id) return { src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, ratio: '16 / 9', label: 'Speel video af' };
  }
  if (meta.type === 'tweet' && (m = url.match(/status(?:es)?\/(\d+)/))) {
    return { src: `https://platform.twitter.com/embed/Tweet.html?id=${m[1]}&dnt=true&lang=nl`, height: 620, label: 'Bekijk de post' };
  }
  if (meta.type === 'tiktok' && (m = url.match(/\/video\/(\d+)/))) {
    return { src: `https://www.tiktok.com/embed/v2/${m[1]}`, height: 760, label: 'Speel video af' };
  }
  if (meta.type === 'instagram' && (m = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/))) {
    return { src: `https://www.instagram.com/p/${m[1]}/embed/captioned/`, height: 720, label: 'Bekijk de post' };
  }
  if (meta.type === 'linkedin' && (m = url.match(/(?:activity[-:]|urn:li:activity:)(\d{15,25})/))) {
    return { src: `https://www.linkedin.com/embed/feed/update/urn:li:activity:${m[1]}`, height: 640, label: 'Bekijk de post' };
  }
  return null;
}
