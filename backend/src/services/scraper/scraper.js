const axios = require("axios");
const cheerio = require("cheerio");

function toAbsoluteCourtListenerUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `https://www.courtlistener.com${url}`;
  return `https://www.courtlistener.com/${url}`;
}

function normalizeCaseRow(row) {
  return {
    title: row.title || "Untitled Case",
    link: toAbsoluteCourtListenerUrl(row.link),
    pdf: toAbsoluteCourtListenerUrl(row.pdf),
    dateFiled: row.dateFiled || null,
    court: row.court || null,
    preview: row.preview || null,
  };
}

function normalizeResultKey(link) {
  try {
    const url = new URL(toAbsoluteCourtListenerUrl(link));
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch (_error) {
    return String(link || "").trim().toLowerCase();
  }
}

function mergeResultsWithApi(cheerioResults, apiResults) {
  const byLink = new Map(
    (apiResults || []).map((item) => [normalizeResultKey(item.link), item])
  );

  return (cheerioResults || []).map((item) => {
    const key = normalizeResultKey(item.link);
    const match = byLink.get(key);
    if (!match) return item;

    return normalizeCaseRow({
      title: item.title || match.title,
      link: item.link || match.link,
      pdf: item.pdf || match.pdf || null,
      dateFiled: item.dateFiled || match.dateFiled || null,
      court: item.court || match.court || null,
      preview: item.preview || match.preview || null,
    });
  });
}

function pickOpinionPdf(row) {
  const opinions = Array.isArray(row?.opinions) ? row.opinions : [];
  const first = opinions.find((op) => op && (op.download_url || op.local_path)) || null;
  if (!first) return null;
  return first.download_url || first.local_path || null;
}

async function scrapeCasesViaApi(query) {
  const token = process.env.COURTLISTENER_API_KEY || process.env.COURTLISTENER_API_TOKEN;

  if (token) {
    try {
      const res = await axios.get("https://www.courtlistener.com/api/rest/v4/search/", {
        timeout: 20000,
        params: { q: query, type: "o", page_size: 20 },
        headers: { Authorization: `Token ${token}` },
      });

      const results = (res.data.results || []).map((row) => {
        return normalizeCaseRow({
          title: row.caseName || row.caseNameFull,
          link: row.absolute_url,
          pdf: pickOpinionPdf(row),
          dateFiled: row.dateFiled,
          court: row.court_citation_string,
          preview: row.snippet || row.syllabus || null,
        });
      });

      return {
        provider: "courtlistener-auth-api",
        pdfLinksGuaranteed: results.some((item) => Boolean(item.pdf)),
        results,
      };
    } catch (_error) {
      // fall through to public API
    }
  }

  try {
    const res = await axios.get("https://www.courtlistener.com/api/rest/v4/search/", {
      timeout: 20000,
      params: { q: query, type: "o", page_size: 20 },
    });

    const results = (res.data.results || []).map((row) => normalizeCaseRow({
      title: row.caseName || row.caseNameFull,
      link: row.absolute_url,
      pdf: pickOpinionPdf(row),
      dateFiled: row.dateFiled,
      court: row.court_citation_string,
      preview: row.snippet || row.syllabus || null,
    }));

    const timeoutMs = Number(process.env.CHEERIO_TIMEOUT_MS || 10000);
    const maxEnrichCount = Number(process.env.CHEERIO_ENRICH_PDF_COUNT || 5);
    await enrichPdfLinksViaCheerio(results, timeoutMs, maxEnrichCount);

    return {
      provider: "courtlistener-public-api",
      pdfLinksGuaranteed: results.some((item) => Boolean(item.pdf)),
      results,
    };
  } catch (_error) {
    return {
      provider: "courtlistener-api-failed",
      pdfLinksGuaranteed: false,
      results: [],
    };
  }
}

async function enrichPdfLinksViaCheerio(items, timeoutMs, maxEnrichCount) {
  const targets = items.filter((r) => !r.pdf && r.link).slice(0, Math.max(0, maxEnrichCount));
  if (!targets.length) return;

  for (const item of targets) {
    try {
      const res = await axios.get(item.link, {
        timeout: timeoutMs,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      const $ = cheerio.load(String(res.data || ""));
      const candidates = [
        "a[href$='.pdf']",
        "a[href*='/pdf/']",
        "a[href*='download']",
        "a[title*='PDF']",
        "a[href*='/opinion/'][href*='.pdf']",
      ];
      for (const selector of candidates) {
        const href = $(selector).first().attr("href");
        if (href) {
          item.pdf = toAbsoluteCourtListenerUrl(href);
          break;
        }
      }
    } catch (_error) {
      // ignore per-item failures
    }
  }
}

function parseSearchResultsHtml(html, maxResults) {
  const $ = cheerio.load(html);
  const rows = [];
  const seen = new Set();

  $("article, .search-result, .result, li").each((_idx, node) => {
    if (rows.length >= maxResults) return false;

    const card = $(node);
    let anchor =
      card.find("h2 a, h3 a, h4 a, a[href*='/opinion/'], a[href*='/case/']").first();

    if (!anchor.length) {
      anchor = card.find("a").first();
    }

    const href = (anchor.attr("href") || "").trim();
    const absLink = toAbsoluteCourtListenerUrl(href);
    if (!absLink || !/\/opinion\/\d+/i.test(absLink)) return;
    if (seen.has(absLink)) return;

    const title = (anchor.text() || "").replace(/\s+/g, " ").trim();
    if (!title || /search case law/i.test(title)) return;

    const rawText = (card.text() || "").replace(/\s+/g, " ").trim();
    const dateMatch = rawText.match(/\b(19|20)\d{2}-\d{2}-\d{2}\b/);

    const pdfHref = card
      .find("a[href$='.pdf'], a[href*='/pdf/'], a[href*='download'], a[title*='PDF']")
      .first()
      .attr("href");

    seen.add(absLink);
    rows.push(normalizeCaseRow({
      title: title || "Untitled Case",
      link: absLink,
      pdf: pdfHref ? toAbsoluteCourtListenerUrl(pdfHref) : null,
      dateFiled: dateMatch ? dateMatch[0] : null,
      court: rawText.slice(0, 160) || null,
      preview: rawText.slice(0, 420) || null,
    }));
    return undefined;
  });

  return rows;
}

async function scrapeCasesViaCheerio(query) {
  const timeoutMs = Number(process.env.CHEERIO_TIMEOUT_MS || 10000);
  const maxResults = Number(process.env.CHEERIO_MAX_RESULTS || 20);
  const maxEnrichCount = Number(process.env.CHEERIO_ENRICH_PDF_COUNT || 5);

  try {
    const searchUrl = `https://www.courtlistener.com/?q=${encodeURIComponent(query)}&type=o`;
    const res = await axios.get(searchUrl, {
      timeout: timeoutMs,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const parsed = parseSearchResultsHtml(String(res.data || ""), maxResults);
    await enrichPdfLinksViaCheerio(parsed, timeoutMs, maxEnrichCount);

    return {
      provider: "cheerio-courtlistener",
      pdfLinksGuaranteed: parsed.some((r) => Boolean(r.pdf)),
      results: parsed,
    };
  } catch (error) {
    return {
      provider: `cheerio-error:${error.name || "error"}`,
      pdfLinksGuaranteed: false,
      results: [],
    };
  }
}

async function scrapeCases(query) {
  const provider = String(process.env.SCRAPER_PROVIDER || "cheerio").toLowerCase();
  const allowApiFallback = String(process.env.SCRAPER_ALLOW_API_FALLBACK || "true").toLowerCase() === "true";

  if (provider === "api") {
    return scrapeCasesViaApi(query);
  }

  const cheerioResult = await scrapeCasesViaCheerio(query);
  const cheerioHasResults = cheerioResult.results.length > 0;
  const cheerioHasPdf = cheerioResult.results.some((r) => Boolean(r.pdf));

  if (cheerioHasResults && (cheerioHasPdf || !allowApiFallback)) {
    return cheerioResult;
  }

  const apiResult = await scrapeCasesViaApi(query);

  if (!cheerioHasResults) {
    return {
      ...apiResult,
      provider: `${cheerioResult.provider}->${apiResult.provider}`,
    };
  }

  if (!apiResult.results.length) {
    return cheerioResult;
  }

  const mergedResults = mergeResultsWithApi(cheerioResult.results, apiResult.results);
  return {
    provider: `${cheerioResult.provider}+${apiResult.provider}`,
    pdfLinksGuaranteed: mergedResults.some((r) => Boolean(r.pdf)),
    results: mergedResults,
  };
}

module.exports = { scrapeCases };
