# IREN Signal Pro — TradingView Indicator

**Two versions in this repo:**

| File | What it is |
|---|---|
| [`iren_signal_pro_v2.pine`](iren_signal_pro_v2.pine) | **Recommended.** Everything in V1 plus market-regime filters (ADX chop filter, higher-timeframe trend filter, signal cooldown), profitability stats (win rate, avg P&L per signal, profit factor) and a compact-labels mode. Fewer, better signals. |
| [`iren_signal_pro.pine`](iren_signal_pro.pine) | V1 — the original engine. More signals, no regime filtering. Keep it if you want to compare. |

## What's new in V2

- **ADX chop filter** — entries are blocked while ADX is below 20 (configurable). Sideways ranges are where the losing whipsaw flips happen; those periods are shaded gray on the chart so you can see why it's staying out.
- **Higher-timeframe trend filter** — longs only while price is above the 1h EMA 50, shorts only below it (both configurable). Stops you from fighting the bigger trend.
- **Signal cooldown** — a minimum number of bars (default 3) between entries, killing rapid-fire flip clusters.
- **Profitability stats in the dashboard** — hit rate tells you how often T1 is tagged, but not whether the engine makes money. V2 records the realized P&L of every closed signal and shows **Win rate**, **Avg P&L per signal**, and **Profit factor** (gross wins ÷ gross losses; above 1 = profitable). A **Regime** row shows TRENDING/CHOPPY with the live ADX.
- **Compact labels** — optional tiny BUY/SELL tags with the full details in a hover tooltip, for busy charts.

Note: with the filters on, V2 fires noticeably fewer signals than V1 — that's the point. If it feels too quiet, lower "Min ADX" to 15 or disable the HTF filter.

A Pine Script v5 indicator built for **NASDAQ:IREN** (works on any symbol) that gives:

- **BUY / SELL signals** — an ATR trailing-stop engine (UT-Bot style) confirmed by trend (EMA 9/21), momentum (RSI 14) and volume.
- **Shaded reward/risk zones on every signal**, sized by IREN's live volatility (ATR):
  - **Green zone (entry → T1)** — high-probability target (default 1.0 × ATR)
  - **Light cyan zone (T1 → T2)** — stretch target (default 2.2 × ATR)
  - **Red zone (entry → stop)** — your risk; it shrinks as the trailing stop tightens and turns green once the stop moves past entry (risk-free trade)
- **Adaptive end goals** — targets are re-evaluated on every bar from a live momentum score (RSI distance from 50, EMA 9/21 spread vs ATR, volume vs average). Strong readings stretch T1/T2 up to ~1.3–1.5× their base size; fading readings pull them in to ~0.6–0.7×. Once a target is hit it locks and stops moving. The dashboard's **Momentum** row shows the current score and whether the goals are extending (▲), steady (→), or pulling in (▼). Turn this off with the "Adaptive targets" input if you prefer fixed targets.
- **Expected holding time** — how long the signal is likely to stay active, based on the *median* duration of all past signals on the chart.
- **Self-measured probabilities** — the indicator tracks every historical signal and shows the **real hit rate** of T1 and T2 on IREN (e.g. "T1 · hit 82%"), so probabilities are measured, not guessed.
- **Live dashboard** — active signal, age, open P&L, targets with hit rates, trailing stop, typical hold, time-to-T1, estimated remaining hold, and sample size.
- **Alerts** — BUY, SELL, T1 reached, T2 reached, and signal exit (trailing-stop flip).

> ⚠️ **Honesty note:** no indicator can promise a target will be reached "for sure."
> T1 is the *highest-probability* target and the dashboard shows you its exact
> historical hit rate on IREN so you can judge the odds yourself. Always use the
> trailing stop as your risk limit.

## Installation

1. Open [TradingView](https://tradingview.com) and load the **NASDAQ:IREN** chart.
2. Open the **Pine Editor** (bottom toolbar).
3. Delete the default code and paste the full contents of [`iren_signal_pro.pine`](iren_signal_pro.pine).
4. Click **Save**, then **Add to chart**.

## How to read it

| Element | Meaning |
|---|---|
| Green **BUY** / red **SELL** label | New signal. Shows entry price, T1/T2 with historical hit rates, and expected hold time (⏱). |
| Dashed green line | **T1** — take partial profit here (highest probability). |
| Dotted cyan line | **T2** — stretch target; hold the remainder for this. |
| Thick green/red line | ATR trailing stop — your exit/stop level; it follows price. |
| `T1 ✓` / `T2 ✓` markers | Target reached. Dashed line turns solid. |
| Gray **✕** | Signal closed by a trailing-stop flip without a new opposite entry. |
| Dashboard (top-right) | Live state: signal, P&L, targets + hit rates, typical hold, estimated remaining time, sample size. |

**Signal grades:** `A+` = all 3 confirmations agree (trend + momentum + volume), `B` = 2 of 3. Prefer A+ signals.

## Recommended settings for IREN

IREN is a high-beta stock (Bitcoin mining / AI data centers) and moves 5–10% intraday, so ATR-based targets adapt automatically. Suggested tuning:

| Style | Timeframe | ATR sensitivity | T1 / T2 | Min confirmations |
|---|---|---|---|---|
| Day trading (default) | 15m | 1.8 | 1.0 / 2.2 | 2 |
| Scalping | 5m | 1.2–1.5 | 0.8 / 1.6 | 3 |
| Swing trading | 1D | 2.5–3.0 | 1.2 / 2.5 | 2 |

Keep **"Confirm signals on bar close"** enabled — it prevents repainting (signals never appear and then vanish).

## Getting notifications on your phone (recommended setup)

One alert covers **everything** — BUY, SELL, T1/T2 reached, profit-protection warning, and exits — with live prices in each message:

1. Install the **TradingView mobile app** and log in (needed for push notifications).
2. Open the IREN chart with the indicator, right-click → **Add alert** (or press `Alt+A`).
3. **Condition:** `IREN Signal Pro` → **`Any alert() function call`**.
4. **Expiration:** Open-ended.
5. **Notifications tab:** enable *Notify in app* (phone push) and optionally *Send email*.
6. Click **Create**. Done — repeat once per symbol you want to watch (e.g. OPEN).

You'll now get messages like:

- `🟢 BUY IREN @ 39.15 | T1 40.05 · T2 41.15 | stop 38.60`
- `🎯 IREN: T1 reached @ 40.05 — consider taking partial profit`
- `⚠️ IREN: giving back gains — peaked +5.1%, now +2.3%. Consider protecting profit.`
- `✖ IREN: LONG signal closed @ 38.92 (-0.6%) — trailing stop flipped`

**The profit-protection warning** is your "never ride +5% back down to red" guard: it fires once per trade when the open profit has retraced a set share of its peak (default 50%, and only if the peak was at least 0.8 × ATR so tiny wiggles don't spam you). Tune both in the *Notifications* settings group.

> Note: TradingView alerts run on their servers, so they work with your computer off — but the alert must stay active, and free plans limit how many active alerts you can have. Signals are confirmed on bar close, so on the 15m chart a notification arrives at the close of the 15-minute bar.

### Prefer separate alerts per event?

Classic `alertcondition` entries still exist: choose **IREN Signal Pro** → `BUY signal`, `SELL signal`, `T1 reached`, `T2 reached`, `Profit-protection warning`, or `Signal exit`, with *Once per bar close*.

## How the numbers are computed

- **Signal engine:** price crossing an ATR trailing stop (`ATR(10) × 1.8`) flips the bias; entries require the confirmation score (EMA 9>21, RSI>50, volume above average) to pass.
- **Targets:** `entry ± multiplier × ATR` — they scale with IREN's current volatility instead of using fixed dollar amounts.
- **Adaptive targets:** momentum strength `s ∈ [0,1]` is the average of three normalized components — RSI vs 50, EMA spread vs ATR, volume vs its average. Each bar the target is pulled toward `entry ± mult × factor(s) × ATR` (T1 factor `0.7 + 0.6s`, T2 factor `0.6 + 0.9s`) at the configured adaptation speed, and T2 always stays at least 0.3 × ATR beyond T1. Hit targets lock immediately.
- **Hit rates & hold time:** every closed signal is recorded (up to the last 300 per direction). Hit rate = share of past signals that reached the target; hold time = median bars held, converted to hours/days for your chart timeframe. Statistics appear once ≥5 signals have completed.
- **Estimated remaining hold** = median hold − current signal age (floored at 0).

## Disclaimer

This indicator is a decision-support tool, not financial advice. Past hit rates do not guarantee future results. Trade at your own risk and always use a stop loss.
