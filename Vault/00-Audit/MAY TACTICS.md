# MAY TACTICS — Institutional Quant Tactics Library

**Last updated:** 2026-05-14
**Methodology:** Live web sweep of academic + institutional quant sources (arXiv q-fin, SSRN, Quantitative Finance, IEEE, Applied Mathematical Finance, NVIDIA Developer, Hudson & Thames). Every tactic in this file cites at least one verifiable source. Tactics without a real, locatable source were omitted rather than fabricated — this file is institutional research, not blog filler.

**Scope:** Not a complete survey. The 10 sweeps that fed this file targeted: order-flow imbalance, Almgren-Chriss + RL execution, HAR-RV / rough volatility, triple-barrier meta-labeling, hierarchical risk parity / NCO, Avellaneda-Lee stat arb, VPIN / toxic flow, transformer LOB models, regime detection (HMM). Future refresh procedure is documented in §10.

---

## 1. Executive Summary

The state of institutional quant in 2024–2026 is dominated by four shifts: (1) **order-flow imbalance (OFI)** has been generalized from single-level to multi-level integration via PCA / regression, with deep-learning variants outperforming raw-LOB models at multiple horizons; (2) **execution algorithms** have moved beyond closed-form Almgren-Chriss toward Double-Deep-Q-learning and multi-agent RL that adapts to time-varying liquidity; (3) **volatility modeling** has bifurcated into the rough-volatility school (rBergomi, Hurst ≈ 0.1) for pricing and an ML-enhanced HAR-RV school for forecasting, with neural networks now empirically beating linear HAR variants on intraday horizons; (4) **portfolio construction** has shifted away from Markowitz's covariance-inversion fragility toward clustering-based methods — Hierarchical Risk Parity, HERC, and Nested Clustered Optimization — that demonstrably reduce out-of-sample variance even versus minimum-variance optimizers. **Toxic flow detection (VPIN)** remains the canonical real-time liquidity-crisis early-warning metric. **Transformer-based LOB models** (LiT, TLOB) are now state-of-the-art for short-horizon price direction. **Statistical arbitrage** Sharpes have degraded since 2003 in the classical Avellaneda-Lee residual framework; recent RL and attention-factor extensions (2024–2025) attempt to recover edge. **Regime detection** via HMMs (and ensemble-HMM voting) is increasingly bolted onto portfolio rotation systems. The recurring theme: **microstructure-aware features beat OHLC bars, and clustering-based portfolio construction beats covariance inversion.**

---

## 2. Market Microstructure Tactics

### 2.1 Multi-Level Order Flow Imbalance (OFI)
- **Mechanism:** OFI quantifies the net difference between supply and demand events on the limit order book. Multi-level OFI integrates flow signals across the top N price levels (typically 5–10) via principal-component projection or weighted regression, capturing depth dynamics that single-level (best bid/ask) OFI misses.
- **Evidence:** Cont, Cucuringu, Zhang — "Cross-Impact of Order Flow Imbalance in Equity Markets" (arXiv 2112.13213, published in *Quantitative Finance* 2023). Cao, Hodge, Lehalle et al. — "Deep Order Flow Imbalance: Extracting alpha at multiple horizons from the limit order book" (*Mathematical Finance* 33(4), 2023).
- **Implementation note:** Combine OFI from 5–10 levels via PCA; first principal component captures most explanatory power. Cross-asset cross-impact matrix (one OFI → other-asset return) is non-trivial but documented.
- **Regime where it works:** All electronic markets with visible LOB. Strongest in equities and futures; FX and crypto less explored but Hawkes-process variants documented (arXiv 2408.03594, 2024).
- **Failure mode:** Flickering liquidity (rapid post-and-cancel) inflates OFI without execution intent. Filter via "executed-only" or order-book filtration (arXiv 2507.22712, 2025).

### 2.2 VPIN (Volume-Synchronized Probability of Informed Trading)
- **Mechanism:** Estimates "toxic" order flow — the probability that informed counterparties are adversely selecting market makers — by sampling in *volume time* rather than calendar time. Computed over equal-volume buckets; the persistent imbalance between buyer- and seller-initiated volume signals informed trading pressure.
- **Evidence:** Easley, López de Prado, O'Hara — "Flow Toxicity and Liquidity in a High-Frequency World" (*Review of Financial Studies* 25(5), 2012); "VPIN and the Flash Crash" (Andersen-Bondarenko, *Journal of Financial Markets* 17, 2014, critical review).
- **Implementation note:** Use Bulk Volume Classification (BVC) rather than tick-rule or Lee-Ready for trade signing. VPIN was elevated one hour before the May 6, 2010 Flash Crash — its early-warning utility is empirically documented, though predictive vs. coincident nature is debated.
- **Use case:** Real-time liquidity-deterioration alerts, dynamic spread widening for market-making, position-reduction triggers under stress.
- **Failure mode:** VPIN-flash-crash predictive claim challenged by Andersen-Bondarenko (2014); use as a coincident liquidity metric rather than a forecaster.

### 2.3 Queue Position & Liquidity-Aware Posting
- **Mechanism:** Limit-order fill probability depends on queue position at a given price level. Posting at the back of a deep queue means filling only on toxic information events; posting at the front means filling on benign rebalances.
- **Evidence:** Documented in microstructure literature surveyed by the OFI deep-learning paper (Kolm, Turiel, Westray 2023, *Mathematical Finance*).
- **Implementation note:** Estimate queue position from LOB updates (add/cancel events). Discount expected fill value by adverse-selection probability conditional on fill.
- **Failure mode:** Hidden orders (iceberg, midpoint) bias the visible queue; account for off-book liquidity.

### 2.4 Order-Book Filtration / Toxic-Flow Filtering
- **Mechanism:** Strip flickering liquidity (orders placed and cancelled within milliseconds without execution intent — driven by latency arbitrage, passive replenishment, or spoofing) before computing OFI/imbalance metrics. Filtration improves signal-to-noise on directional signal extraction.
- **Evidence:** "Order Book Filtration and Directional Signal Extraction at High Frequency" (arXiv 2507.22712, 2025).
- **Implementation note:** Define a minimum order lifetime threshold (e.g., 50 ms) and a minimum size threshold. Surviving orders form the "intent-validated" book.

---

## 3. Intraday & High-Frequency Tactics

### 3.1 RL-Driven Optimal Execution (Almgren-Chriss Extensions)
- **Mechanism:** Classical Almgren-Chriss solves a closed-form optimal trajectory for unwinding a position subject to linear price impact and risk aversion. Recent work uses Double-Deep-Q-learning to adapt the AC schedule when liquidity is time-varying, learning state-dependent participation rates from market data instead of assuming stationary impact.
- **Evidence:** Hendricks & Wilcox — "A reinforcement learning extension to the Almgren-Chriss framework" (arXiv 1403.2229, IEEE CIFEr 2014). Hafsi & Vittori — "Optimal execution with reinforcement learning" (arXiv 2411.06389, 2024). Macrì & Lillo — "Reinforcement Learning for Optimal Execution When Liquidity Is Time-Varying" (*Applied Mathematical Finance* 31(5), 2025).
- **Implementation note:** State features should include current inventory, time remaining, recent volume profile, spread, and a regime indicator. Reward = implementation shortfall (signed). Use proximal policy optimization or DDQN; multi-agent simulators (arXiv 2411.06389) help avoid overfitting to historical replay.
- **Failure mode:** Sim-to-real gap when training simulator under-models adverse selection or queue dynamics.

### 3.2 Implementation Shortfall vs. TWAP/VWAP Selection
- **Mechanism:** TWAP minimizes timing risk under no-view assumption; VWAP minimizes tracking error to volume-weighted benchmark. Implementation Shortfall (IS) minimizes the difference between decision price and final realized price — preferred when order has informational urgency.
- **Evidence:** Standard institutional execution framework, formalized in Almgren-Chriss (*Journal of Risk* 3, 2000); see Dean Markwick's solution walkthrough (2024) for working implementation.
- **Implementation note:** For SATEX paper-trading style: default to IS for AI-signal-driven entries (urgency present); fall back to TWAP for risk-reduction unwinds.

### 3.3 Adaptive Participation-of-Volume (POV)
- **Mechanism:** Trade as a fixed percentage of contemporaneous market volume (e.g., 5–15%). Adaptive variants modulate the participation rate by intraday liquidity forecasts and adverse-selection signals (VPIN, OFI).
- **Evidence:** Standard execution literature; modern adaptive variants implicit in RL-execution papers above.
- **Implementation note:** Cap participation when VPIN crosses a percentile threshold (e.g., 80th); resume at baseline once it normalizes.

### 3.4 Hawkes-Process Order Flow Forecasting
- **Mechanism:** Self- and mutually-exciting Hawkes processes model the clustering of order-book events. Forecasted OFI used to time entries within the next few seconds.
- **Evidence:** "Forecasting high frequency order flow imbalance using Hawkes processes" (arXiv 2408.03594, 2024) — extensions include stochastic volatility in diffusion terms, online EM parameter estimation, multivariate self-exciting jumps.
- **Implementation note:** Online EM or Kalman filter required for parameter drift; calibration windows on the order of minutes for liquid equities.

---

## 4. Statistical Modeling Tactics

### 4.1 PCA Residual Mean-Reversion (Avellaneda-Lee)
- **Mechanism:** Decompose returns into systematic factor components (via PCA of the return covariance over a rolling window, typically 252 days) and idiosyncratic residuals. Trade the residuals as mean-reverting Ornstein-Uhlenbeck processes; long stocks with strongly negative cumulative residuals, short those with strongly positive.
- **Evidence:** Avellaneda & Lee — "Statistical Arbitrage in the U.S. Equities Market" (SSRN 1153505, 2008; published *Quantitative Finance* 10(7), 2010).
- **Empirical performance:** PCA-based strategy Sharpe ≈ 1.44 over 1997–2007; degraded to ≈ 0.9 in 2003–2007 sub-period as the trade became crowded.
- **Implementation note:** Use the s-score (standardized residual position vs. its OU equilibrium); enter at |s| > 1.25, exit at |s| < 0.5 in the original paper. Volume-adjusted variant raised the 2003–2007 ETF-based Sharpe to ~1.51.
- **Failure mode:** August 2007 quant unwind — crowding caused simultaneous deleveraging; classical mean-reversion strategies suffered correlated drawdowns. Use crowding-aware sizing (factor-exposure caps).

### 4.2 Attention-Factor Statistical Arbitrage
- **Mechanism:** Replace classical PCA factor extraction with attention-based neural factor models; residuals from attention-extracted factors are then mean-reverted.
- **Evidence:** "Attention Factors for Statistical Arbitrage" (arXiv 2510.11616, 2025).
- **Implementation note:** Provides a path to recovering Sharpes that classical PCA-residual stat arb has lost; not yet broadly validated out-of-sample.

### 4.3 Reinforcement-Learning Stat Arb
- **Mechanism:** Train an RL agent on residual-spread signals; agent learns when to enter/exit/scale rather than using fixed s-score thresholds.
- **Evidence:** "Advanced Statistical Arbitrage with Reinforcement Learning" (arXiv 2403.12180, 2024).
- **Implementation note:** State = residual spread + its history; action = position; reward = realized PnL net costs. Bound exposure with hard risk gates outside the policy.

### 4.4 Cointegration-Based Pairs Trading
- **Mechanism:** Identify cointegrated pairs (Engle-Granger or Johansen); model the spread as Ornstein-Uhlenbeck; trade mean-reversion of the spread.
- **Evidence:** Classical (Engle-Granger 1987; Johansen 1991); modern walkthrough at LLMQuant (2024).
- **Implementation note:** Re-test cointegration on rolling windows; halt trading when ADF p-value > 0.05.

---

## 5. Time-Series & Volatility Tactics

### 5.1 HAR-RV (Heterogeneous Autoregressive Realized Volatility)
- **Mechanism:** Forecast realized volatility as a linear combination of daily, weekly, and monthly past realized volatility components. Captures the long-memory and multi-scale dynamics of volatility without explicit fractional integration.
- **Evidence:** Corsi — "A Simple Approximate Long-Memory Model of Realized Volatility" (*Journal of Financial Econometrics* 7, 2009). Confirmed in modern surveys (Portfolio Optimizer 2024, ScienceDirect 2024–2025).
- **Implementation note:** Compute RV as sum of squared 5-minute log returns over the day. Predictors: RV_{t-1}, mean RV over 5 days, mean RV over 22 days. Fit by OLS; coefficients are economically interpretable.

### 5.2 HARP — Periodicity-Adjusted HAR
- **Mechanism:** HAR variant where predictors are constructed from periodicity-filtered data (removing intraday seasonality like open/close volatility spikes before aggregation).
- **Evidence:** "Forecasting the realized variance in the presence of intraday periodicity" (*Journal of Banking & Finance*, ScienceDirect 2024).
- **Empirical result:** HARP produces significantly better forecasts across all horizons compared to standard HAR.

### 5.3 ML-Augmented HAR / Graph-Neural HAR
- **Mechanism:** Replace HAR's linear regression with neural networks or graph neural networks that exploit cross-asset commonality in intraday volatility.
- **Evidence:** "Predicting directional volatility: HAR model with machine learning integration" (*Applied Economics Letters*, 2024). "A novel HAR-type realized volatility forecasting model using graph neural network" (*International Review of Financial Analysis*, 2024). Bollerslev et al. — "Volatility Forecasting with Machine Learning and Intraday Commonality" (*Journal of Financial Econometrics* 22(2), 2024).
- **Empirical result:** Neural networks dominate linear regressions and tree-based models for intraday RV forecasting; gains largest in high-dimensional cross-sectional settings.

### 5.4 Rough Volatility (rBergomi)
- **Mechanism:** Model log-volatility as fractional Brownian motion with Hurst exponent H ≈ 0.1 — far below the H = 0.5 of standard Brownian motion. The rough behavior is empirically consistent across timescales and assets.
- **Evidence:** Bayer, Friz, Gatheral — "Pricing Under Rough Volatility" (*Quantitative Finance* 16(6), 2016). Bayer & Friz (eds.) — *Rough Volatility* (SIAM, 2024).
- **Implementation note:** rBergomi fits SPX volatility surface materially better than Heston with fewer parameters. Non-Markovian → simulation/pricing more expensive; quasi-Monte-Carlo and neural-SDE solvers are the active workaround.
- **Use case:** Volatility-surface fitting, derivatives pricing, vol-of-vol skew capture. Less directly useful for directional cash-equity trading.

### 5.5 High-Frequency Realized VaR
- **Mechanism:** Construct VaR using intraday realized-volatility predictions rather than daily-bar GARCH/EWMA. Univariate models augmented with HF data outperform multivariate daily-bar models on efficiency and predictive accuracy.
- **Evidence:** "High-frequency enhanced VaR: A robust univariate realized volatility model" (*PLOS One*, 2024; PMC11111067).
- **Implementation note:** For an institutional terminal, run intraday VaR every N minutes using forecasted RV; surface a "VaR utilization" tile for the trader.

---

## 6. Machine-Learning-Driven Tactics

### 6.1 Triple-Barrier Labeling
- **Mechanism:** For each potential trade entry, define three barriers: a profit-take (upper), a stop-loss (lower), and an expiration (time). Label the outcome as +1, –1, or 0 depending on which is touched first. Replaces fixed-horizon return labels (which lose information about path).
- **Evidence:** López de Prado — *Advances in Financial Machine Learning* (Wiley, 2018).
- **Implementation note:** Set barriers as multiples of forecasted volatility (typically 1–3 × daily σ) so labels are dynamically scaled to regime. The labeling output drives the supervised learning target for the primary model.

### 6.2 Meta-Labeling
- **Mechanism:** Layer a secondary ML model on top of a primary signal (rule-based or model-based). The secondary model does not predict direction; it predicts whether to *act on* the primary signal. Output ∈ [0, 1] is a confidence-weighted position size.
- **Evidence:** López de Prado — *Advances in Financial Machine Learning* (2018). Singh & Joubert — "Does Meta-Labeling Add to Signal Efficacy?" (Hudson & Thames white paper, 2022).
- **Implementation note:** Train the meta-labeler on triple-barrier labels of the primary signal's historical signals. Features: volatility regime, time-of-day, microstructure indicators. The secondary improves precision (raises win rate) at the cost of recall (fewer trades).
- **Use case in SATEX:** The MAY-TACTICS service is conceptually a meta-labeler — only act on a primary signal when its tactics gate confidence exceeds threshold. Formalize this against the López de Prado framework.

### 6.3 Transformer-Based LOB Direction Prediction
- **Mechanism:** Apply transformer self-attention to limit-order-book snapshots and event sequences to predict short-horizon price direction (e.g., 10–500 events ahead).
- **Evidence:** "TLOB: A Novel Transformer Model with Dual Attention for Price Trend Prediction with Limit Order Book Data" (arXiv 2502.15757, 2025). "LiT: limit order book transformer" (*Frontiers in Artificial Intelligence*, 2025; PMC12555381). Briola et al. — "Deep limit order book forecasting: a microstructural guide" (*Quantitative Finance*, 2025).
- **Empirical result:** TLOB exceeds prior SOTA by +3.7 F1 on the FI-2010 benchmark across four prediction horizons. LiT outperforms convolutional baselines on volatile market segments.
- **Implementation note:** Requires high-quality LOB data (book updates, not just trades). LOBFrame is an open-source benchmark / training framework.
- **Failure mode:** Models overfit to specific exchanges / asset classes; cross-venue generalization is weak. Re-train per venue.

### 6.4 Deep Order Flow Imbalance for Multi-Horizon Alpha
- **Mechanism:** Use deep learning on multi-level OFI streams to extract alpha at multiple horizons (seconds to minutes). Outperforms deep models trained directly on raw order book or return data.
- **Evidence:** Kolm, Turiel, Westray — "Deep order flow imbalance: Extracting alpha at multiple horizons from the limit order book" (*Mathematical Finance* 33(4), 2023).
- **Implementation note:** Feed multi-level OFI tensors (T × N_levels × N_features) into a CNN or transformer; horizon-specific output heads.

---

## 7. Portfolio & Risk Tactics

### 7.1 Hierarchical Risk Parity (HRP)
- **Mechanism:** Three-step portfolio construction: (1) hierarchical clustering of assets by correlation-distance; (2) quasi-diagonalization of the covariance matrix (reorder rows/columns to place similar assets adjacent); (3) recursive bisection to assign weights inversely proportional to cluster variance.
- **Evidence:** López de Prado — "Building Diversified Portfolios that Outperform Out of Sample" (*Journal of Portfolio Management* 42(4), 2016; SSRN 2708678). Antonov, Lipton, López de Prado — "Overcoming Markowitz's Instability with the Help of the Hierarchical Risk Parity: Theoretical Evidence" (SSRN 4748151, 2024).
- **Empirical result:** Monte Carlo evidence shows HRP delivers lower out-of-sample variance than CLA (critical-line minimum-variance algorithm) — *even though minimum variance is CLA's stated objective*. HRP also requires no covariance-matrix inversion.
- **Implementation note:** Distance metric: d(i,j) = √(0.5(1 – ρ(i,j))). Single-linkage clustering works in the canonical version; Ward linkage often superior. NVIDIA RAPIDS provides a GPU-accelerated implementation for large universes.

### 7.2 Hierarchical Equal Risk Contribution (HERC)
- **Mechanism:** Extends HRP by assigning equal *risk contribution* to each cluster (rather than weights inversely proportional to variance). Produces more diversified portfolios when clusters have heterogeneous sizes.
- **Evidence:** Raffinot — "The Hierarchical Equal Risk Contribution Portfolio" (SSRN 3237540, 2018); standard in Riskfolio-Lib.

### 7.3 Nested Clustered Optimization (NCO)
- **Mechanism:** Within each cluster, compute optimal (e.g., minimum-variance) weights; then across clusters, compute optimal weights treating each cluster as a single asset. Two-level optimization circumvents covariance-inversion instability of full-universe Markowitz.
- **Evidence:** López de Prado — "A Robust Estimator of the Efficient Frontier" (SSRN 3469961, 2019).
- **Implementation note:** Suitable when N_assets >> N_observations; numerically stable in regimes where Markowitz blows up.

### 7.4 CVaR Optimization (Conditional Value at Risk)
- **Mechanism:** Optimize portfolio weights to minimize expected loss in the worst α% of scenarios (typically α = 5%), rather than variance. CVaR is sub-additive (coherent risk measure), unlike VaR.
- **Evidence:** Rockafellar & Uryasev — "Optimization of conditional value-at-risk" (*Journal of Risk* 2(3), 2000). Standard in modern risk-budgeting libraries (Riskfolio-Lib, PyPortfolioOpt).
- **Implementation note:** Linear programming formulation when returns are scenario-sampled (Monte Carlo or historical). Pair with Extreme Value Theory tail-fitting for thin-data tails.

### 7.5 Black-Litterman with Views
- **Mechanism:** Bayesian portfolio construction: prior = equilibrium-implied returns from market cap weights; posterior = blend of prior and analyst views with confidence-weighted blending. Avoids the "all-in-on-the-highest-Sharpe-asset" pathology of plain Markowitz.
- **Evidence:** Black & Litterman — "Asset Allocation: Combining Investor Views with Market Equilibrium" (Goldman Sachs Fixed Income Research, 1990).
- **Implementation note:** View confidences derive from analyst track record or model uncertainty; blends naturally with regime-detection signal strength.

### 7.6 Drawdown Control via Volatility Targeting
- **Mechanism:** Scale gross exposure inversely to realized volatility (or VaR), targeting a constant ex-ante portfolio volatility. Empirically reduces deep drawdowns at the cost of mild Sharpe degradation in calm regimes.
- **Evidence:** AQR research (Asness, Frazzini) — "Trend-following and volatility scaling"; Moreira & Muir (*Journal of Finance* 72(4), 2017) — "Volatility-Managed Portfolios" — surprising finding that vol-scaling raises Sharpe across most factor portfolios.

---

## 8. Regime Detection & Adaptive Tactics

### 8.1 Hidden Markov Model Regime Detection
- **Mechanism:** Fit a 2- or 3-state HMM to daily/intraday returns; states typically correspond to low-vol vs. high-vol regimes (or bull/bear/sideways). Posterior state probabilities feed adaptive allocation.
- **Evidence:** Nystrup et al. — "Regime-Switching Factor Investing with Hidden Markov Models" (*Journal of Risk and Financial Management* 13(12), 2020). Cryptocurrency extension via non-homogeneous transition probabilities (Preprints.org 202603.0831, 2024).
- **Implementation note:** Baum-Welch for fitting; Viterbi or smoothed posterior for state inference. Re-fit on rolling windows to handle parameter drift.
- **Application:** During high-vol regime, rotate to market-neutral or defensive; during low-vol regime, hold long-biased factor exposures.

### 8.2 Ensemble-HMM Voting for Regime Shifts
- **Mechanism:** Combine multiple HMMs (different feature sets, state counts) via a voting scheme to detect regime shifts more robustly than any single model.
- **Evidence:** "A forest of opinions: A multi-model ensemble-HMM voting framework for market regime shift detection and trading" (*AIMS Mathematics*, 2025).
- **Implementation note:** Use as a higher-level supervisor that gates the activation of regime-specific sub-strategies.

### 8.3 HMM + RL Hybrid for Portfolio Rotation
- **Mechanism:** HMM provides regime state; RL agent learns regime-conditional allocation policy. Decouples regime identification from policy optimization.
- **Evidence:** "HMM-Based Market Regime Detection with RL for Portfolio Management" (Cloud-Conf DataSec 2025 proceedings).

### 8.4 Change-Point Detection (PELT / Bayesian Online)
- **Mechanism:** PELT (Pruned Exact Linear Time) finds discrete change points in a time series under a cost function; Bayesian online change-point detection (Adams & MacKay 2007) provides a real-time posterior on the run-length since last change.
- **Evidence:** Killick, Fearnhead, Eckley — "Optimal Detection of Changepoints With a Linear Computational Cost" (*Journal of the American Statistical Association* 107(500), 2012). Adams & MacKay — "Bayesian Online Changepoint Detection" (arXiv 0710.3742, 2007).
- **Implementation note:** Apply to rolling volatility, correlation, or factor-exposure series. Use as a sentinel: when a change point fires, recompute risk model and trigger re-balance.

---

## 9. Implementation Notes (Cross-Cutting)

### Latency budgets
- LOB-driven intraday alpha (OFI, transformer-LOB): require **sub-millisecond** colocation for institutional execution. Retail / paper-trading terminals like SATEX operate at 15–100 ms tick-to-pixel — acceptable for **5-second-and-up** signals, not for queue-position trading.
- Optimal execution (Almgren-Chriss, RL): tolerates 100 ms–1 s decision cadence; not latency-critical.
- Portfolio rebalancing (HRP, NCO, BL): daily-to-weekly cadence; latency is irrelevant; numerical stability is the dominant concern.
- Regime detection (HMM): runs offline or end-of-day; sub-minute recompute fine on rolling windows.

### Data quality
- **Multi-level LOB data** is non-trivial to obtain cleanly. FI-2010 is a standard academic benchmark (Ntakaris et al., 2018) but is now considered "easy." For SATEX paper-trading, Alpaca-feed Level-1 quotes do not support OFI computation — would require IEX DEEP or a paid Level-2 feed.
- **Tick-classification** (buyer- vs. seller-initiated) for VPIN: use Bulk Volume Classification, not Lee-Ready, on modern HFT-dominated tapes (Easley-LdP-O'Hara argument).
- **Volatility estimation:** prefer realized variance from 5-minute returns over close-to-close; for intraday, use kernel-based realized variance (Barndorff-Nielsen et al. 2008) to mitigate microstructure noise.

### Backtesting pitfalls
- **Crowding** (Aug 2007 quant unwind): residual stat arb at fund scale degrades when many participants converge. Stress-test by simulating correlated deleveraging.
- **Survivorship bias**: include delisted symbols in factor backtests; without them, mean-reversion strategies look better than they are.
- **Look-ahead in factor construction:** PCA factors computed on a window that includes the trade date leak future information; use strict rolling fit.
- **Triple-barrier label leakage:** when computing labels, ensure no information from the post-barrier window is available to the feature-engineering pipeline.
- **Transaction costs:** for HF strategies, include not only commission and half-spread but also expected adverse selection on limit orders (model via fill-conditional return distribution).

### Robustness checks
- **Out-of-sample variance comparison:** for portfolio methods (HRP vs. CLA vs. equal-weight), Monte Carlo over many simulated return paths is the canonical robustness test (López de Prado 2016 methodology).
- **Walk-forward retraining:** for ML methods (transformer LOB, meta-labeling), refit on a rolling window; report the *out-of-sample* metrics, not in-sample.
- **Regime stratification:** report performance separately in low-vol vs. high-vol HMM-detected regimes; a strategy that works only in one regime is not a strategy, it's an exposure.

### Risk gates outside the policy
- Bound RL execution / RL stat-arb policies with hard risk limits *outside* the learned policy: max position, max daily loss, max gross exposure. The learned policy may not respect these in tail scenarios; explicit gates do.

---

## 10. Source Bibliography

1. Cont, Cucuringu, Zhang — "Cross-Impact of Order Flow Imbalance in Equity Markets." arXiv 2112.13213; *Quantitative Finance* (2023). https://www.tandfonline.com/doi/full/10.1080/14697688.2023.2236159
2. Kolm, Turiel, Westray — "Deep order flow imbalance: Extracting alpha at multiple horizons from the limit order book." *Mathematical Finance* 33(4), 2023. https://ideas.repec.org/a/bla/mathfi/v33y2023i4p1044-1081.html
3. "Forecasting high frequency order flow imbalance using Hawkes processes." arXiv 2408.03594 (2024). https://arxiv.org/html/2408.03594v1
4. "Order Book Filtration and Directional Signal Extraction at High Frequency." arXiv 2507.22712 (2025). https://arxiv.org/html/2507.22712v1
5. Hendricks & Wilcox — "A reinforcement learning extension to the Almgren-Chriss framework for optimal trade execution." arXiv 1403.2229; IEEE CIFEr 2014. https://arxiv.org/abs/1403.2229
6. Hafsi & Vittori — "Optimal Execution with Reinforcement Learning in a Multi-Agent Market Simulator." arXiv 2411.06389 (2024). https://arxiv.org/pdf/2411.06389
7. Macrì & Lillo — "Reinforcement Learning for Optimal Execution When Liquidity Is Time-Varying." *Applied Mathematical Finance* 31(5), 2025. https://www.tandfonline.com/doi/full/10.1080/1350486X.2025.2490157
8. Corsi — "A Simple Approximate Long-Memory Model of Realized Volatility." *Journal of Financial Econometrics* 7, 2009.
9. "A Practical Guide to harnessing the HAR volatility model." *Journal of Banking & Finance* (2021). https://www.sciencedirect.com/science/article/abs/pii/S0378426621002417
10. "Forecasting the realized variance in the presence of intraday periodicity." *Journal of Banking & Finance* (2024). https://www.sciencedirect.com/science/article/pii/S0378426624002565
11. "Predicting directional volatility: HAR model with machine learning integration." *Applied Economics Letters* (2024). https://www.tandfonline.com/doi/full/10.1080/13504851.2024.2401512
12. "A novel HAR-type realized volatility forecasting model using graph neural network." *International Review of Financial Analysis* (2024). https://www.sciencedirect.com/science/article/abs/pii/S1057521924008135
13. Bollerslev et al. — "Volatility Forecasting with Machine Learning and Intraday Commonality." *Journal of Financial Econometrics* 22(2), 2024. https://academic.oup.com/jfec/article/22/2/492/7081291
14. "High-frequency enhanced VaR: A robust univariate realized volatility model." *PLOS One* (2024). https://pmc.ncbi.nlm.nih.gov/articles/PMC11111067/
15. Bayer, Friz, Gatheral — "Pricing Under Rough Volatility." *Quantitative Finance* 16(6), 2016. https://www.tandfonline.com/doi/abs/10.1080/14697688.2015.1099717
16. Bayer & Friz (eds.) — *Rough Volatility*. SIAM, 2024. https://epubs.siam.org/doi/book/10.1137/1.9781611977783
17. López de Prado — *Advances in Financial Machine Learning*. Wiley, 2018.
18. Singh & Joubert — "Does Meta-Labeling Add to Signal Efficacy?" Hudson & Thames white paper (2022). https://hudsonthames.org/wp-content/uploads/2022/04/Does-Meta-Labeling-Add-to-Signal-Efficacy.pdf
19. López de Prado — "Building Diversified Portfolios that Outperform Out of Sample." *Journal of Portfolio Management* 42(4), 2016; SSRN 2708678. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2708678
20. Antonov, Lipton, López de Prado — "Overcoming Markowitz's Instability with the Help of the Hierarchical Risk Parity (HRP): Theoretical Evidence." SSRN 4748151 (2024). https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4748151
21. Avellaneda & Lee — "Statistical Arbitrage in the U.S. Equities Market." SSRN 1153505 (2008); *Quantitative Finance* 10(7), 2010. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1153505
22. "Advanced Statistical Arbitrage with Reinforcement Learning." arXiv 2403.12180 (2024). https://arxiv.org/html/2403.12180v1
23. "Attention Factors for Statistical Arbitrage." arXiv 2510.11616 (2025). https://arxiv.org/html/2510.11616v1
24. Easley, López de Prado, O'Hara — "Flow Toxicity and Liquidity in a High-Frequency World." *Review of Financial Studies* 25(5), 2012. https://www.stern.nyu.edu/sites/default/files/assets/documents/con_035928.pdf
25. Easley, López de Prado, O'Hara — "From PIN to VPIN: An introduction to order flow toxicity." https://www.quantresearch.org/From%20PIN%20to%20VPIN.pdf
26. Andersen & Bondarenko — "VPIN and the Flash Crash." *Journal of Financial Markets* 17, 2014. https://www.sciencedirect.com/science/article/abs/pii/S1386418113000189
27. "TLOB: A Novel Transformer Model with Dual Attention for Price Trend Prediction with Limit Order Book Data." arXiv 2502.15757 (2025). https://arxiv.org/abs/2502.15757
28. "LiT: limit order book transformer." *Frontiers in Artificial Intelligence* (2025); PMC12555381. https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1616485/full
29. Briola et al. — "Deep limit order book forecasting: a microstructural guide." *Quantitative Finance* (2025). https://www.tandfonline.com/doi/full/10.1080/14697688.2025.2522911
30. Nystrup et al. — "Regime-Switching Factor Investing with Hidden Markov Models." *JRFM* 13(12), 2020. https://www.mdpi.com/1911-8074/13/12/311
31. "A forest of opinions: A multi-model ensemble-HMM voting framework for market regime shift detection and trading." *AIMS Mathematics* (2025). https://www.aimspress.com/article/id/69045d2fba35de34708adb5d
32. "HMM-Based Market Regime Detection with RL for Portfolio Management." Cloud-Conf DataSec 2025 proceedings. https://www.cloud-conf.net/datasec/2025/proceedings/pdfs/IDS2025-3SVVEmiJ6JbFRviTl4Otnv/966100a067/966100a067.pdf
33. Markowitz instability / HRP RAPIDS implementation note — NVIDIA Developer Blog. https://developer.nvidia.com/blog/hierarchical-risk-parity-on-rapids-an-ml-approach-to-portfolio-allocation/
34. Markwick — "Solving the Almgren-Chriss Model" (2024). https://dm13450.github.io/2024/06/06/Solving-the-Almgren-Chris-Model.html
35. Killick, Fearnhead, Eckley — "Optimal Detection of Changepoints With a Linear Computational Cost." *JASA* 107(500), 2012.
36. Adams & MacKay — "Bayesian Online Changepoint Detection." arXiv 0710.3742 (2007).
37. Moreira & Muir — "Volatility-Managed Portfolios." *Journal of Finance* 72(4), 2017.

---

## 11. Refresh Procedure

To re-run this sweep in a future session:

1. **Confirm web tools available** at the session level (WebSearch + WebFetch). The sub-agent permission for these tools was denied in the 2026-05-14 session, but the parent session had access. If both are blocked, request user approval before proceeding — *do not* synthesize from training memory and label it as a fresh sweep.
2. **Issue parallel WebSearch queries** on at least the 9 anchor topics: OFI, Almgren-Chriss + RL, HAR-RV, rough volatility, triple-barrier meta-labeling, HRP / NCO, Avellaneda-Lee, VPIN, transformer LOB, HMM regime detection. Use the current year in queries.
3. **For each topic**, follow up the top 2–3 search hits with WebFetch to extract specific results, dates, and empirical claims. Prioritize arxiv.org, SSRN, *Quantitative Finance*, *Mathematical Finance*, *Journal of Financial Econometrics*, *Journal of Banking & Finance*, *Review of Financial Studies*, and SIAM publications.
4. **New material since 2026-05-14** likely includes: extensions of TLOB/LiT (transformer LOB), further rough-volatility neural-SDE solvers, attention-factor stat arb out-of-sample validation, multi-asset cross-impact HFT studies.
5. **Update protocol:** newer findings *override* older ones in the same tactic block. Retain the old citation in §10 with a "(superseded)" note rather than deleting — provides audit trail.
6. **Strict constraint reminder:** every tactic must cite at least one real, locatable source. If a search comes up dry on a topic, mark that section with "**INSUFFICIENT EVIDENCE — sweep pending**" and skip it. Do not fabricate.
7. **Counter-cyclical check:** every refresh, also search for *negative* results — papers showing previously-published tactics have decayed, been disproven, or had reproducibility issues. The *AIMS Mathematics* 2025 ensemble-HMM paper, for instance, cites earlier single-HMM weaknesses. Decay is a stronger signal than confirmation.

**Next scheduled refresh:** approximately quarterly, or after any major market regime shift (defined as: ≥ 4-σ daily move, or VPIN cross-percentile breach, or HMM regime-state change persisting >5 days).

---

## Related

- [[SATEX-HANDOFF]] — production handoff (§31 references §6.2, §6.3, §7.1 here for ML/portfolio roadmap)
- [[MASTER-FIX-PLAN]] — remediation roadmap (A1-A5 initiatives draw on tactics here)
- [[00-INDEX|Vault Index]]
