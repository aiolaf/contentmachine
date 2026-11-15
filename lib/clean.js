// What a public post page gives back is mostly not the post: a login wall,
// menus, counters and other people's comments. These functions keep the post
// itself: its text, its maker and, for a LinkedIn video, the transcript.

const unlink = (s) => String(s).replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
const tidy = (s) => String(s).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
// The app stores social text as a quote; take the markers off before reading it.
const unquote = (s) => String(s || '').replace(/^> ?/gm, '');

// A page that asks to log in instead of showing the post.
export function isWall(text) {
  const t = String(text || '').slice(0, 600);
  return /Agree & Join LinkedIn|Sign in to view|Log in or sign up for Threads|This content isn't available|Log in to Instagram|Create an account or log in|Inloggen of registreren|Je moet inloggen|Something went wrong/i.test(t)
    && !/public_post_feed-actor-name/.test(text);
}

// Titles that say where something is, not what it is about.
export function weakTitle(title) {
  const t = String(title || '').trim();
  return !t
    || /^(www\.)?[a-z0-9-]+\.(com|net|in|nl|co|io)$/i.test(t)
    || /^(threads|linkedin|instagram|tiktok|x|notitie|log in|login|sign up)$/i.test(t)
    || /•\s*Instagram\b/i.test(t)
    || /\bon (Threads|Instagram|TikTok)\s*$/i.test(t)
    || /^(Instagram|Threads|TikTok|LinkedIn) (post|reel|video|photo)s?$/i.test(t)
    || /\| LinkedIn$/i.test(t) && t.length < 30;
}

// "Jesse Rurka (@jesserurka) • Instagram reel" -> { naam, handle, soort }.
export function makerFromTitle(title) {
  const t = String(title || '');
  const m = t.match(/^(.*?)\s*\(@([A-Za-z0-9._]+)\)\s*(?:•\s*Instagram\s*(reel|photos? and videos?|photo|video|post)?|on Threads)/i);
  if (!m) return null;
  return { naam: m[1].trim(), handle: m[2], soort: (m[3] || '').toLowerCase().includes('reel') ? 'reel' : '' };
}

// Instagram's page description: `1,234 likes, 56 comments - handle on
// November 4, 2026: "The caption"`. Returns the caption alone.
export function captionFromDescription(desc) {
  const d = String(desc || '').trim();
  const m = d.match(/^[\d.,]+[KkMm]?\s+[^,]{2,24},\s+[\d.,]+[KkMm]?\s+[^-]{2,24}-\s+(\S+)\s+\S+\s+[^:]{3,40}:\s*([\s\S]*)$/);
  if (!m) return { tekst: '', handle: '' };
  const tekst = m[2].trim().replace(/^["“”]/, '').replace(/["“”]\.?\s*$/, '').trim();
  return { tekst, handle: m[1].replace(/^@/, '') };
}

// A LinkedIn post page as Markdown: the post is the text after the maker's
// name and "Report this post", up to "...more", the reactions or the comments.
export function cleanLinkedIn(markdown) {
  const src = unquote(markdown);
  const actor = /\[([^\]]+)\]\(https?:\/\/[^)]*trk=public_post_feed-actor-name[^)]*\)/.exec(src);
  if (!actor) return shortLinkedIn(src);
  let rest = src.slice(actor.index + actor[0].length);
  const report = /\*\s+\[Report this post\]\([^)]*\)/.exec(rest);
  if (report) rest = rest.slice(report.index + report[0].length);
  const end = rest.search(/^\s*…more\s*$|^\s*\.\.\.more\s*$|public_post_social-actions|^\[Like\]\(|^\s*\[!\[Image[^\n]*\]\([^)]*reactions|^\s*Share\s*$|^\*\s+!\[Image|public_post_comment_actor|^\s*Transcript\s+Transcript\s*$|^#{1,6}\s*\*{0,2}Transcript/m);
  const head = end === -1 ? rest : rest.slice(0, end);
  // Followers and "3h" stand between the name and the text.
  const tekst = tidy(unlink(head).split('\n')
    .filter((l) => !/^\s*[\d.,]+\s+followers\s*$/i.test(l) && !/^\s*\d+\s*(s|m|h|d|w|mo|yr)\s*(Edited)?\s*$/i.test(l) && !/^\s*(Edited|Follow)\s*$/i.test(l))
    .join('\n'));
  const tr = /^#{1,6}\s*\*{0,2}Transcript\*{0,2}\s*$/m.exec(rest);
  let transcript = '';
  if (tr) {
    const after = rest.slice(tr.index + tr[0].length);
    const stop = after.search(/public_post_comment_actor|^\[\]\(https?:\/\/[^)]*linkedin\.com|^\[Like\]\(|^#{1,6}\s/m);
    transcript = tidy(unlink(stop === -1 ? after : after.slice(0, stop)));
  }
  if (!tekst && !transcript) return null;
  return { auteur: actor[1].trim(), tekst, transcript };
}

// The short form of a post page: "### Name's Post", the maker's picture,
// followers and time, then the post as one paragraph. Comments follow without
// a marker, so only that first paragraph is the post.
function shortLinkedIn(src) {
  const head = /^#{1,6}\s+(.+?)[’']s Post\s*$/m.exec(src);
  if (!head) return null;
  const lines = src.slice(head.index + head[0].length).split('\n').map((l) => l.trim());
  const first = lines.find((l) => l && !/^\[?!\[/.test(l) && !/^[\d.,]+\s+followers$/i.test(l) && !/^\d+\s*(s|m|h|d|w|mo|yr)$/i.test(l) && !/^(Edited|Follow)$/i.test(l));
  const tekst = tidy(unlink(first || ''));
  return tekst ? { auteur: head[1].trim(), tekst, transcript: '' } : null;
}

// A Threads post page as Markdown: the post follows the maker's name and the
// time, and ends at the counters under it or at the login prompt.
export function cleanThreads(markdown) {
  const src = unquote(markdown);
  const link = /https?:\/\/www\.threads\.(?:com|net)\/@([A-Za-z0-9._]+)\/post\/([A-Za-z0-9_-]+)/.exec(src);
  const pic = /\[!\[Image \d+: ([A-Za-z0-9._]+)'s profile picture\]\([^)]*\)\]\([^)]*\)/.exec(src);
  if (!pic && !link) return null;
  let rest = src.slice(pic ? pic.index + pic[0].length : link.index);
  const handle = pic?.[1] || link?.[1] || '';
  const lines = rest.split('\n');
  const out = [];
  let started = false;
  for (const raw of lines) {
    const l = raw.trim();
    // Name, topic and time links open the post; counters or the login prompt close it.
    if (!started && (!l || /^\[.*\]\(https?:\/\/www\.threads\.(?:com|net)\/[^)]*\)$/.test(l) || /^[\d.,]+[KM]?\s+views$/i.test(l) || /^#{1,6}\s/.test(l) || /^·?\s*Author$/i.test(l))) continue;
    if (/^Sorry, we're having trouble playing this video\.?$/i.test(l) || /^\[?Learn more\]?(\([^)]*\))?$/i.test(l) || /^Translate$/i.test(l)) continue;
    if (/^[\d.,]+[KM]?$/.test(l) || /^Log in or sign up for Threads/i.test(l) || /^\*\s+©/.test(l) || /^\[Log in/i.test(l)) {
      if (started) break;
      continue;
    }
    started = true;
    out.push(raw);
  }
  const tekst = tidy(unlink(out.join('\n').replace(/\(https?:\/\/l\.threads\.(?:com|net)\/[^)]*\)/g, '()')));
  if (!tekst) return null;
  return { auteur: handle ? `@${handle}` : '', tekst, post: link ? `https://www.threads.com/@${link[1]}/post/${link[2]}` : '' };
}
