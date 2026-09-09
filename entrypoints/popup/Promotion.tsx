import { ArrowUpRight, Sparkles } from 'lucide-react';

export default function Promotion() {
  return (
    <a
      className="promotion"
      href="https://ai.corouter.cc/"
      target="_blank"
      rel="noopener noreferrer sponsored"
      referrerPolicy="no-referrer"
      aria-label="AI 订阅代付 · ai.corouter.cc（新标签页打开）"
    >
      <span className="promotion-icon">
        <Sparkles size={18} />
      </span>
      <span className="promotion-copy">
        <strong>AI 订阅代付</strong>
        <span>
          ai.corouter.cc <span className="promotion-separator">·</span> 了解代付服务
        </span>
      </span>
      <ArrowUpRight size={17} className="promotion-arrow" />
    </a>
  );
}
