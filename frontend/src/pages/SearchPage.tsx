import { useState } from "react";
import { motion } from "framer-motion";
import { Search as SearchIcon, Mic, Brain, Music, Eye, Bookmark, ExternalLink } from "lucide-react";
import { scrapeService, SearchResult } from "@/services/scrape";
import { toast } from "sonner";

interface SearchPageProps {
  onNavigate?: (page: string) => void;
}

const SearchPage = ({ onNavigate }: SearchPageProps) => {
  const [query, setQuery] = useState("");
  const [activeChips, setActiveChips] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiToggle, setAiToggle] = useState(true);
  const [results, setResults] = useState<SearchResult[]>([]);

  const chips = ["Supreme Court", "High Court", "District Court", "2020-2024", "Commercial", "IP", "Constitutional", "Banking"];
  const toggleChip = (c: string) => setActiveChips((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);

  const handleSearch = async () => {
    if (!query.trim()) return toast.error("Please enter a search query.");
    setLoading(true);
    setResults([]);
    try {
      const q = activeChips.length > 0 ? `${query} ${activeChips.join(" ")}` : query;
      const data = await scrapeService.search(q);
      setResults(data.results || []);
      if (!data.results?.length) toast("No results found.");
    } catch (err: any) {
      const status = Number(err?.status || 0);
      if (status === 401 || status === 403) {
        toast.error("Session expired. Please login again to continue searching.");
        return;
      }
      toast.error(err?.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleAction = (type: "summary" | "audio", item: SearchResult) => {
    // Store selected case dynamically via localStorage then navigate
    localStorage.setItem("selected_case", JSON.stringify(item));
    if (onNavigate) onNavigate(type === "summary" ? "dashboard" : "audio");
    toast(`Case selected: ${item.title}`);
  };

  return (
    <div className="p-7 animate-fade-in">
      <div className="mb-7">
        <h1 className="text-[22px] font-semibold tracking-tight">Legal Case Search</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Search via CourtListener & AI parsing</p>
      </div>

      {/* Search bar */}
      <div className="bg-card border border-border rounded-lg p-5 mb-5">
        <div className="relative mb-3.5">
          <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full bg-card border border-border rounded-lg py-3.5 pl-12 pr-14 text-[14.5px] text-foreground outline-none transition-all focus:border-primary focus:shadow-[0_0_0_4px_hsl(var(--gold)/0.06),0_4px_24px_rgba(0,0,0,0.3)] placeholder:text-dim"
            placeholder="Search by case name, citation, legal issue, judge..."
            autoFocus
          />
          <Mic size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground cursor-pointer hover:text-primary transition-colors" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {chips.map((c) => (
              <button key={c} onClick={() => toggleChip(c)}
                className={`px-3 py-1 rounded-full text-xs border transition-all ${activeChips.includes(c)
                    ? "bg-gold-dim border-primary/40 text-primary"
                    : "bg-card border-border text-muted-foreground hover:border-primary hover:text-primary"
                  }`}
              >{c}</button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setAiToggle((p) => !p)} className="flex items-center gap-2">
              <div className={`w-8 h-[18px] rounded-full relative transition-colors ${aiToggle ? "bg-primary" : "bg-border"}`}>
                <div className={`absolute top-0.5 w-3.5 h-3.5 bg-foreground rounded-full transition-all ${aiToggle ? "left-[14px]" : "left-0.5"}`} />
              </div>
              <span className="text-xs text-muted-foreground">AI Search</span>
            </button>
            <button onClick={handleSearch} disabled={loading} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium flex items-center gap-1.5 hover:gold-glow transition-all active:scale-95 disabled:opacity-50">
              <SearchIcon size={13} /> Search
            </button>
          </div>
        </div>
      </div>

      {/* Results header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-muted-foreground">
          {loading ? "Searching..." : `${results.length} results found`}
        </div>
      </div>

      {/* Results */}
      <div className="flex flex-col gap-3">
        {loading
          ? [...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-5">
              <div className="h-4 w-3/5 bg-gradient-to-r from-card via-muted/40 to-card bg-[length:200%_100%] animate-shimmer rounded mb-2.5" />
              <div className="h-3 w-[30%] bg-gradient-to-r from-card via-muted/40 to-card bg-[length:200%_100%] animate-shimmer rounded mb-3.5" />
              <div className="h-3 w-full bg-gradient-to-r from-card via-muted/40 to-card bg-[length:200%_100%] animate-shimmer rounded mb-1.5" />
            </div>
          ))
          : results.map((c, i) => (
            <motion.div
              key={c.caseId || i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => {
                if (c.link) {
                  window.open(c.link, "_blank", "noopener,noreferrer");
                }
              }}
              className="bg-card border border-border rounded-lg p-5 transition-all hover:border-primary/25 hover:shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
            >
              <div className="flex items-start justify-between mb-2">
                <a
                  href={c.link || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[14.5px] font-semibold leading-snug hover:text-primary transition-colors"
                >
                  {c.title}
                </a>
                <button className="p-1.5 border border-border rounded-md text-muted-foreground hover:border-primary hover:text-primary hover:bg-gold-glow transition-all" title="Bookmark">
                  <Bookmark size={14} />
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap mb-2.5">
                {c.court && <span className="px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-[10px] font-semibold text-accent max-w-[200px] truncate">{c.court}</span>}
                {c.dateFiled && <span className="px-2 py-0.5 rounded bg-muted/50 border border-border text-[11px] text-muted-foreground">{c.dateFiled}</span>}
                {c.pdf && <span className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-500">PDF Available</span>}
              </div>
              {c.preview && <p className="text-[12.5px] text-muted-foreground leading-relaxed">{c.preview}</p>}

              <div className="flex gap-2 items-center mt-3.5 pt-3.5 border-t border-border">
                <button onClick={(e) => { e.stopPropagation(); handleAction("summary", c); }} className="px-3 py-1.5 border border-border rounded-md text-xs text-muted-foreground flex items-center gap-1.5 hover:border-primary hover:text-primary hover:bg-gold-glow transition-all">
                  <Brain size={13} /> Process & Summarize
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleAction("audio", c); }} className="px-3 py-1.5 border border-border rounded-md text-xs text-muted-foreground flex items-center gap-1.5 hover:border-primary hover:text-primary hover:bg-gold-glow transition-all">
                  <Music size={13} /> Generate Audio
                </button>
                {c.link && (
                  <a href={c.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="ml-auto px-3 py-1.5 border border-border rounded-md text-xs text-muted-foreground flex items-center gap-1.5 hover:text-foreground transition-colors hover:border-foreground">
                    <ExternalLink size={13} /> Source
                  </a>
                )}
              </div>
            </motion.div>
          ))}
      </div>
    </div>
  );
};

export default SearchPage;
