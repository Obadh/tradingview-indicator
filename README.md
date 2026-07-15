# IREN Signal Pro — TradingView Indicator

A Pine Script v5 indicator built for **NASDAQ:IREN** (works on any symbol) that gives:

- **BUY / SELL signals** — an ATR trailing-stop engine (UT-Bot style) confirmed by trend (EMA 9/21), momentum (RSI 14) and volume.
- **Two targets on every signal**, sized by IREN's live volatility (ATR):
  - **T1 — high-probability target** (default 1.0 × ATR)
  - **T2 — stretch target** (default 2.2 × ATR)
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

## Setting up alerts

1. Right-click the chart → **Add alert**.
2. Condition: **IREN Signal Pro** → choose `BUY signal`, `SELL signal`, `T1 reached`, `T2 reached`, or `Signal exit`.
3. Set *Options* to **Once per bar close** and pick your notification channel (app push, e-mail, webhook).

## How the numbers are computed

- **Signal engine:** price crossing an ATR trailing stop (`ATR(10) × 1.8`) flips the bias; entries require the confirmation score (EMA 9>21, RSI>50, volume above average) to pass.
- **Targets:** `entry ± multiplier × ATR` — they scale with IREN's current volatility instead of using fixed dollar amounts.
- **Hit rates & hold time:** every closed signal is recorded (up to the last 300 per direction). Hit rate = share of past signals that reached the target; hold time = median bars held, converted to hours/days for your chart timeframe. Statistics appear once ≥5 signals have completed.
- **Estimated remaining hold** = median hold − current signal age (floored at 0).

## Disclaimer

This indicator is a decision-support tool, not financial advice. Past hit rates do not guarantee future results. Trade at your own risk and always use a stop loss.
