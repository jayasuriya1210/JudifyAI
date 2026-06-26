const { scrapeCases } = require("../services/scraper/scraper");
const { buildSearchTerms } = require("../services/ai/searchTerms");
const Case = require("../models/caseModel");

function buildCourtListenerSearchUrl(query) {
  const q = String(query || "").trim();
  return `https://www.courtlistener.com/?q=${encodeURIComponent(q)}&type=o`;
}

async function scrapeWithFallbackQueries(originalQuery, optimizedQuery) {
  const attempts = [];
  const queue = [optimizedQuery, originalQuery].map((q) => String(q || "").trim()).filter(Boolean);
  const uniqueQueue = [...new Set(queue)];

  for (const attemptedQuery of uniqueQueue) {
    const payload = await scrapeCases(attemptedQuery);
    const results = Array.isArray(payload) ? payload : (payload.results || []);
    attempts.push({
      query: attemptedQuery,
      provider: payload.provider || "scraper",
      count: results.length,
    });

    if (results.length) {
      return { payload, attempts };
    }
  }

  return {
    payload: { provider: "scraper-empty", pdfLinksGuaranteed: false, results: [] },
    attempts,
  };
}

exports.searchCases = async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ msg: "query is required" });
    }

    const aiQuery = await buildSearchTerms(query);
    const { payload: scrapedPayload, attempts } = await scrapeWithFallbackQueries(
      query,
      aiQuery.optimized
    );
    const scraped = Array.isArray(scrapedPayload) ? scrapedPayload : (scrapedPayload.results || []);
    const user_id = req.user.id;
    const courtlistenerApiKeyConfigured = Boolean(
      process.env.COURTLISTENER_API_KEY || process.env.COURTLISTENER_API_TOKEN
    );

    const limited = scraped.slice(0, 25);
    const results = [];

    for (const item of limited) {
      let caseId = null;
      try {
        caseId = await Case.createFromSearch({
          user_id,
          title: item.title,
          source_url: item.link,
          pdf_url: item.pdf,
        });
      } catch (insertError) {
        console.error("Case.createFromSearch failed:", insertError?.message || insertError);
      }

      results.push({ ...item, caseId });
    }

    if (!results.length) {
      const fallbackUrl = buildCourtListenerSearchUrl(aiQuery.optimized || query);
      return res.json({
        query,
        optimizedQuery: aiQuery.optimized,
        provider: `${scrapedPayload.provider || "scraper"}:no-results-fallback`,
        attempts,
        courtlistenerApiKeyConfigured,
        pdfLinksGuaranteed: false,
        results: [
          {
            title: `Open CourtListener results for: ${query}`,
            link: fallbackUrl,
            pdf: null,
            dateFiled: null,
            court: "CourtListener",
            preview: "Parsed results were empty. Open the source search page directly.",
            caseId: null,
          },
        ],
      });
    }

    return res.json({
      query,
      optimizedQuery: aiQuery.optimized,
      provider: scrapedPayload.provider || "scraper",
      attempts,
      courtlistenerApiKeyConfigured,
      pdfLinksGuaranteed: Boolean(
        scrapedPayload.pdfLinksGuaranteed || results.some((item) => Boolean(item.pdf))
      ),
      results,
    });
  } catch (error) {
    console.error("Search failed:", error?.message || error);
    return res.status(500).json({ msg: error?.message || "Search failed" });
  }
};
