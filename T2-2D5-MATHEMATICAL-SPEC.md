# Tier 2 — 2D-5 Mathematical Specification: Normalization + Diagnostics

## 1. Overview
This document specifies the exact mathematical framework implemented for normalizing raw hackathon scores across multiple judges to remove severity and calibration biases. The objective is to compute true latent project qualities ($\theta$) while accounting for individual judge severities ($\alpha$).

## 2. Layer 1: Raw Weighted Scoring
The baseline descriptive score is the raw weighted score.
For judge $j$ grading project $p$:
$$ R_{jp} = \frac{\sum_c w_c x_{jpc}}{\sum_c w_c} $$
Where:
- $w_c$: Organizer-defined weight for criterion $c$ (must be $> 0$).
- $x_{jpc}$: Raw score value given by judge $j$ to project $p$ for criterion $c$ ($x_{jpc} \in \{1, 2, 3, 4, 5\}$).

## 3. Layer 2: Judge Calibration (Empirical Bayes Shrinkage)
Overall judge severity $\alpha_j$ is estimated from the ordinal model.
The implementation uses a fallback estimation for raw criterion-specific judge severity $\alpha_{jc} = \alpha_j$, which is then shrunk toward $\alpha_j$.

$$ \tilde{\alpha}_{jc} = \lambda_{jc} \alpha_{jc} + (1 - \lambda_{jc}) \alpha_j $$
Where:
- $\tilde{\alpha}_{jc}$: Shrunk criterion-specific judge estimate.
- $\alpha_{jc}$: Raw criterion-specific estimate.
- $\alpha_j$: Overall judge severity.
- $\lambda_{jc} = \frac{n_{jc}}{n_{jc} + \kappa}$
- $n_{jc}$: Number of observations for judge $j$ on criterion $c$.
- $\kappa$: Shrinkage hyperparameter (default: 5).

## 4. Layer 3: Ordinal Normalization (Logit Model)
We use a Cumulative-Link Ordinal Model, where raw scores are treated as ordered categorical responses driven by a latent, unobserved continuous scale.

**Likelihood / Objective:**
The probability that judge $j$ gives project $p$ a score of $k$ or lower on criterion $c$ is:
$$ \text{logit}[P(Y_{jpc} \le k)] = \tau_{ck} - \theta_{pc} + \alpha_j $$
Which implies:
$$ P(Y_{jpc} \le k) = \sigma(\tau_{ck} - \theta_{pc} + \alpha_j) $$
Where $\sigma(x) = \frac{1}{1 + e^{-x}}$.

- $Y_{jpc} \in \{1, 2, 3, 4, 5\}$
- $\theta_{pc}$: Latent quality of project $p$ on criterion $c$.
- $\alpha_j$: Severity of judge $j$.
- $\tau_{ck}$: Ordinal threshold for category $k$ (for $k = 1, 2, 3, 4$, with $\tau_{c5} = \infty, \tau_{c0} = -\infty$).

The exact likelihood we maximize is:
$$ \mathcal{L}(\theta, \alpha, \tau) = \sum_{j,p,c} \log P(Y_{jpc} = y_{jpc}) $$
Where $P(Y_{jpc} = y) = P(Y_{jpc} \le y) - P(Y_{jpc} \le y-1) = p_k - p_{k-1}$ for $k = y-1$.

**Identifiability Constraint:**
$$ \sum_{j \in C} \alpha_j = 0 $$
After each gradient update, the mean of $\alpha_j$ within each component is subtracted from all $\alpha_j$.

**Threshold Ordering Constraint:**
For each criterion $c$:
$$ \tau_{c1} < \tau_{c2} < \tau_{c3} < \tau_{c4} $$
Enforced post-update: if $\tau_{c,k} \le \tau_{c,k-1}$, we set $\tau_{c,k} = \tau_{c,k-1} + 0.1$.

**Parameterization & Initialization:**
- $\alpha_j$: Initialized to 0.
- $\theta_{pc}$: Initialized to 0.
- $\tau_{ck}$: Initialized to $[-1.5, -0.5, 0.5, 1.5]$ for $k=1,2,3,4$.

**Exact Implemented Optimization Equations (Gradient Ascent):**
For an observation with value $y$, let $k = y - 1$.
$p_k = \sigma(\tau_{ck} - \theta_{pc} + \alpha_j)$
$p_{k-1} = \sigma(\tau_{c,k-1} - \theta_{pc} + \alpha_j)$
$prob = p_k - p_{k-1}$

Derivatives:
$\frac{\partial p_k}{\partial \eta} = p_k(1-p_k)$
$\frac{\partial p_{k-1}}{\partial \eta} = p_{k-1}(1-p_{k-1})$

Gradients with respect to log-likelihood:
$\frac{\partial \mathcal{L}}{\partial \alpha_j} = \sum \frac{1}{prob} \left( \frac{\partial p_k}{\partial \eta} - \frac{\partial p_{k-1}}{\partial \eta} \right)$
$\frac{\partial \mathcal{L}}{\partial \theta_{pc}} = \sum \frac{1}{prob} \left( -\frac{\partial p_k}{\partial \eta} + \frac{\partial p_{k-1}}{\partial \eta} \right)$
$\frac{\partial \mathcal{L}}{\partial \tau_{ck}} = \sum \frac{1}{prob} \left( \frac{\partial p_k}{\partial \eta} \right)$ (for upper bound)
$\frac{\partial \mathcal{L}}{\partial \tau_{c,k-1}} = \sum \frac{1}{prob} \left( -\frac{\partial p_{k-1}}{\partial \eta} \right)$ (for lower bound)

**Gradient-Ascent Step-Size Strategy:**
- Learning Rate: $\gamma = 0.1$ fixed.
- Update: $\theta^{(t+1)} = \theta^{(t)} + \gamma \nabla \theta$

**Convergence Tolerance:**
- Maximum absolute change in any parameter ($\Delta < 10^{-4}$).

**Maximum Iterations:**
- 100 iterations per component.

**Finite-Value & Numerical Checks:**
- If $prob \le 10^{-7}$ or $\text{isNaN}(prob)$, throws `NUMERICAL_ERROR`.
- If `iterations >= 100`, throws `NON_CONVERGENCE`.
- On any thrown error, the entire normalization run is saved with `status = 'FAILED'`, and zero `NormalizedResult` rows are persisted.

## 5. Layer 4: Weighted Aggregation
$$ \text{FinalAggregate}_p = \frac{\sum_c w_c \theta_{pc}}{\sum_c w_c} $$

## 6. Graph Identifiability Behavior
- Connected components are analyzed via BFS.
- Each component solves its parameters independently.
- If $>1$ components exist, global `NOT_IDENTIFIED` is appended, indicating disconnected global ranking.
- No single global comparable score is published if disconnected.
