import { load } from 'cheerio';
import { AlboItem } from '../types';
import { request } from 'undici';
import pRetry from 'p-retry';

function absolute(url: string, base: string) {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

async function fetchHtml(url: string, userAgent: string): Promise<string> {
  return await pRetry(
    async () => {
      const res = await request(url, {
        method: 'GET',
        headers: {
          'user-agent': userAgent,
          accept: 'text/html,application/xhtml+xml',
        },
      });
      if (res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode}`);
      return await res.body.text();
    },
    { retries: 3 }
  );
}

export async function scrapeListing(listUrl: string, userAgent: string): Promise<AlboItem[]> {
  // helper to parse a jCityGov popup listing table
  const parsePopupTable = ($: ReturnType<typeof load>, baseUrl: string): AlboItem[] => {
    const items: AlboItem[] = [];
    $('table.master-detail-list-table tr.master-detail-list-line').each((_, tr) => {
      const tds = $(tr).find('td');
      if (tds.length < 5) return;

      const yearNumber = $(tds[0]).text().replace(/\s+/g, ' ').trim();
      const type = $(tds[1]).text().replace(/\s+/g, ' ').trim();
      const subject = $(tds[2]).text().replace(/\s+/g, ' ').trim();
      const period = $(tds[3]).text().replace(/\s+/g, ' ').trim();

      // detail link
      let detailUrl = $(tds[4])
        .find('a[title*="Dettaglio" i]')
        .attr('href');
      if (detailUrl) detailUrl = absolute(detailUrl, baseUrl);

      // id: prefer row data-id or year/number
      const rowId = $(tr).attr('data-id');
      let year: string | undefined;
      let number: string | undefined;
      const m = yearNumber.match(/(\d{4}).*?(\d+)/);
      if (m) {
        year = m[1];
        number = m[2];
      }
      const id = rowId || (year && number ? `${year}-${number}` : detailUrl || `${subject}:${type}`);

      // Parse two dates like "01/10/2025 18/10/2025" or with line break
      let dateStart: string | undefined;
      let dateEnd: string | undefined;
      const pm = period.match(/(\d{2}\/\d{2}\/\d{4}).*(\d{2}\/\d{2}\/\d{4})/);
      if (pm) {
        const [d1, d2] = [pm[1], pm[2]].map((d) => d.split('/').reverse().join('-'));
        dateStart = d1;
        dateEnd = d2;
      }

      if (!detailUrl) return;

      items.push({
        id,
        year,
        number,
        category: type,
        type,
        subject,
        dateStart,
        dateEnd,
        detailUrl,
        attachments: [],
        raw: { yearNumber, period },
      });
    });
    return items;
  };

  const parseGenericTable = ($: ReturnType<typeof load>, baseUrl: string): AlboItem[] => {
    const items: AlboItem[] = [];
    $('table tbody tr').each((_, tr) => {
      const tds = $(tr).find('td');
      if (tds.length < 4) return; // skip malformed
      const yearNumber = $(tds[0]).text().trim();
      const type = $(tds[1]).text().trim();
      const subject = $(tds[2]).text().trim();
      const period = $(tds[3]).text().trim();
      let detailUrl = $(tr)
        .find('a')
        .filter((_, a) => /dettaglio|dettagli|detail/i.test($(a).text()) || /dettaglio/i.test($(a).attr('title') || ''))
        .attr('href');
      if (detailUrl) detailUrl = absolute(detailUrl, baseUrl);
      let year: string | undefined;
      let number: string | undefined;
      const m = yearNumber.match(/(\d{4}).*?(\d+)/);
      if (m) {
        year = m[1];
        number = m[2];
      }
      const id = year && number ? `${year}-${number}` : detailUrl || `${subject}:${type}`;
      let dateStart: string | undefined;
      let dateEnd: string | undefined;
      const pm = period.match(/(\d{2}\/\d{2}\/\d{4}).*(\d{2}\/\d{2}\/\d{4})/);
      if (pm) {
        const [d1, d2] = [pm[1], pm[2]].map((d) => d.split('/').reverse().join('-'));
        dateStart = d1;
        dateEnd = d2;
      }
      if (!detailUrl) return;
      items.push({
        id,
        year,
        number,
        category: type,
        type,
        subject,
        dateStart,
        dateEnd,
        detailUrl,
        attachments: [],
        raw: { yearNumber, period },
      });
    });
    return items;
  };

  const findNextUrl = ($: ReturnType<typeof load>, baseUrl: string): string | undefined => {
    // Prefer explicit NEXT pagination action in href (jCityGov pattern)
    const nextHrefDirect = $('a[href]')
      .filter((_, a) => (($(a).attr('href') || '').toLowerCase().includes('paginationaction=next')))
      .first()
      .attr('href');
    if (nextHrefDirect && !/^javascript/i.test(nextHrefDirect)) return absolute(nextHrefDirect, baseUrl);

    // 0) Explicit paginator container
    let $a = $('.pagination li a[rel="next"]').first();
    if ($a.length === 0)
      $a = $('.pagination li a')
        .filter((_, a) => /successivo|seguente|next|avanti|»|›/i.test($(a).text().trim()))
        .first();

    // 1) rel=next anywhere
    if ($a.length === 0) $a = $('a[rel="next"]').first();
    // 2) class contains next
    if ($a.length === 0) $a = $('a.next, a.pager-next, a.aui-paginator-next-link').first();
    // 3) textual hints
    if ($a.length === 0)
      $a = $('a')
        .filter((_, a) => /successivo|seguente|next|avanti|»|›/i.test($(a).text().trim()))
        .first();

    // If we have an anchor with usable href
    let href = $a.attr('href');
    if (href && !/^javascript/i.test(href)) return absolute(href, baseUrl);

    // 4) Look for numbered page links and choose the smallest greater than current
    const current = new URL(baseUrl);
    const curKeys = Array.from(current.searchParams.keys()).filter((k) => /cur|page|start/i.test(k));
    const currentMap = new Map<string, number>();
    for (const k of curKeys) {
      const v = Number(current.searchParams.get(k) || '1');
      if (!Number.isNaN(v)) currentMap.set(k, v);
    }

    const candidates: { url: string; score: number }[] = [];
    $('a[href]')
      .each((_, a) => {
        const h = $(a).attr('href')!;
        if (!h || /^javascript/i.test(h)) return;
        if (!/(cur|page|start)=/i.test(h)) return;
        try {
          const u = new URL(absolute(h, baseUrl));
          let score = 0;
          u.searchParams.forEach((val, key) => {
            if (!/(cur|page|start)/i.test(key)) return;
            const n = Number(val);
            if (Number.isNaN(n)) return;
            const cur = currentMap.get(key) ?? (key.toLowerCase().includes('start') ? 0 : 1);
            if (n > cur) score = score === 0 ? n : Math.min(score, n);
          });
          if (score > 0) candidates.push({ url: u.toString(), score });
        } catch {}
      });
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.score - b.score);
      return candidates[0].url;
    }

    // 5) aui paginator with data-page and javascript href
    const nextData = $('a.aui-paginator-next-link[data-page]');
    if (nextData.length > 0) {
      const nextPage = Number(nextData.attr('data-page'));
      if (!Number.isNaN(nextPage)) {
        const u = new URL(baseUrl);
        // try to find an existing *cur* param name from any link
        let curKey: string | undefined;
        const hrefWithCur = $('a[href*="cur="]').attr('href');
        if (hrefWithCur) {
          try {
            const u2 = new URL(absolute(hrefWithCur, baseUrl));
            curKey = Array.from(u2.searchParams.keys()).find((k) => /cur/i.test(k));
          } catch {}
        }
        if (!curKey) curKey = 'cur';
        u.searchParams.set(curKey, String(nextPage));
        return u.toString();
      }
    }

    return undefined;
  };

  // 1) resolve listing start page
  let currentUrl = listUrl;
  let html = await fetchHtml(currentUrl, userAgent);
  let $ = load(html);
  if ($('table.master-detail-list-table').length === 0) {
    let mainUrl = $('a[data-resource="Albo pretorio"]').attr('data-mainurl');
    if (!mainUrl) mainUrl = $('a[data-mainurl*="/papca-ap/"]').attr('data-mainurl');
    if (mainUrl) {
      currentUrl = absolute(mainUrl, listUrl);
      html = await fetchHtml(currentUrl, userAgent);
      $ = load(html);
    }
  }

  // 2) iterate pages
  const all: AlboItem[] = [];
  const seenIds = new Set<string>();
  let pages = 0;
  const MAX_PAGES = 5;
  const visited = new Set<string>();
  while (true) {
    pages++;
    if (visited.has(currentUrl)) break;
    visited.add(currentUrl);
    let pageItems: AlboItem[] = [];
    if ($('table.master-detail-list-table').length > 0) {
      pageItems = parsePopupTable($, currentUrl);
    } else {
      pageItems = parseGenericTable($, currentUrl);
    }
    for (const it of pageItems) {
      if (!seenIds.has(it.id)) {
        seenIds.add(it.id);
        all.push(it);
      }
    }
    if (pages >= MAX_PAGES) break;
    const nextUrl = findNextUrl($, currentUrl);
    if (!nextUrl) break;
    currentUrl = nextUrl;
    html = await fetchHtml(currentUrl, userAgent);
    $ = load(html);
  }

  return all;
}

export async function enrichDetail(item: AlboItem, userAgent: string): Promise<AlboItem> {
  const html = await fetchHtml(item.detailUrl, userAgent);
  const $ = load(html);

  // Attempt to extract better subject/category and attachments
  const subjectAlt = $('h1, h2, .titolo, .title').first().text().trim();
  if (subjectAlt && subjectAlt.length > 5) item.subject = item.subject || subjectAlt;

  // Attachments: look for links with text "Allegato" or within a table/list
  const attachments: { name?: string; url: string; size?: string }[] = [];
  $('a').each((_, a) => {
    const text = $(a).text().trim();
    const href = $(a).attr('href');
    if (!href) return;
    if (/allegato|download|\.pdf$|\.docx?$|\.xlsx?$/i.test(text) || /\/documenti\//i.test(href)) {
      attachments.push({ name: text || undefined, url: absolute(href, item.detailUrl) });
    }
  });
  item.attachments = attachments;

  // Try to refine category/type from labels
  const maybeType = $('td, th, li, span').filter((_, el) => /tipo\s*atto/i.test($(el).text())).next().text().trim();
  if (maybeType) item.type = item.category = maybeType;

  return item;
}
