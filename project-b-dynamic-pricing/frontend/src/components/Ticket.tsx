import type { Study } from "../lib/api";
import { useLang } from "../lib/i18n";
import { kMoney, pct, signedPct } from "../lib/format";
import { recommendationWhy } from "../lib/explain";

/** The signature element: the recommended opening price printed on a ticket. */
export function Ticket({ study, eventLabel }: { study: Study; eventLabel?: string }) {
  const { t, lang } = useLang();
  const rec = study.recommendation;
  const s = study.policies[rec.policy]!.summary;
  const gain = rec.edge_vs_baseline;
  return (
    <div className="ticket" role="group" aria-label={t("rec.label")}>
      <div className="ticket-main">
        <div className="kicker">{eventLabel ?? t("rec.label")}</div>
        <div className="price">${s.first_price.toFixed(0)}</div>
        <div className="policy">{t(`policy.${rec.policy}`)}</div>
        <p className="why">{recommendationWhy(study, lang)}</p>
      </div>
      <div className="ticket-stub">
        <div>
          <div className="big">{kMoney(s.revenue.mean, lang)}</div>
          <div className="lbl">{t("rec.expected")}</div>
        </div>
        <div>
          <div className="big">{pct(s.sellout.prob, lang)}</div>
          <div className="lbl">{t("rec.sellout")}</div>
        </div>
        {gain && (
          <div>
            <div className="big">{signedPct(gain.pct, lang)}</div>
            <div className="lbl">{t("rec.gain")}</div>
          </div>
        )}
      </div>
    </div>
  );
}
