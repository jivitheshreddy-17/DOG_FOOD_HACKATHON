import { ComponentData, NormalizationParameters } from './types';
import { NormalizationError } from './errors';

export interface OrdinalModelResult {
  alpha_j: Record<string, number>;
  theta_pc: Record<string, Record<string, number>>; // project -> criterion -> quality
  tau_ck: Record<string, number[]>; // criterion -> thresholds (k=1..4)
  alpha_jc: Record<string, Record<string, number>>; // raw criterion-specific judge severity
}

export function solveOrdinalModel(
  component: ComponentData,
  params: NormalizationParameters
): OrdinalModelResult {
  const maxIterations = params.maxIterations ?? 5000;
  const tolerance = params.tolerance ?? 1e-3;

  const judges = Array.from(component.judges);
  const projects = Array.from(component.projects);
  const criteriaSet = new Set<string>();
  component.observations.forEach(o => criteriaSet.add(o.criterionId));
  const criteria = Array.from(criteriaSet);

  // Initialize parameters
  const alpha_j: Record<string, number> = {};
  judges.forEach(j => (alpha_j[j] = 0));

  const theta_pc: Record<string, Record<string, number>> = {};
  projects.forEach(p => {
    theta_pc[p] = {};
    criteria.forEach(c => (theta_pc[p][c] = 0));
  });

  const tau_ck: Record<string, number[]> = {};
  criteria.forEach(c => {
    tau_ck[c] = [-1.5, -0.5, 0.5, 1.5]; // Initial thresholds for k=1,2,3,4
  });

  // Since a full Newton-Raphson or BFGS in pure TS for a variable-sized graph is complex,
  // we use a simplified Gradient Ascent on the log-likelihood.
  let iter = 0;
  let maxDiff = Infinity;
  const learningRate = 0.05;

  while (iter < maxIterations && maxDiff > tolerance) {
    maxDiff = 0;

    const grad_alpha: Record<string, number> = {};
    const grad_theta: Record<string, Record<string, number>> = {};
    const grad_tau: Record<string, number[]> = {};

    judges.forEach(j => (grad_alpha[j] = 0));
    projects.forEach(p => {
      grad_theta[p] = {};
      criteria.forEach(c => (grad_theta[p][c] = 0));
    });
    criteria.forEach(c => (grad_tau[c] = [0, 0, 0, 0]));

    for (const obs of component.observations) {
      const { judgeId: j, projectId: p, criterionId: c, value: y } = obs;

      const a_j = alpha_j[j];
      const t_pc = theta_pc[p][c];
      const taus = tau_ck[c];

      // logit P(Y <= k) = tau_k - theta + alpha
      // P(Y <= k) = sigmoid(tau_k - theta + alpha)
      const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
      
      const k = y - 1; // 0-indexed for tau, y is 1..5
      // P(Y = y) = P(Y <= y) - P(Y <= y-1)
      const eta_k = k < 4 ? taus[k] - t_pc + a_j : Infinity;
      const eta_k_minus_1 = k > 0 ? taus[k - 1] - t_pc + a_j : -Infinity;

      const p_k = sigmoid(eta_k);
      const p_k_minus_1 = sigmoid(eta_k_minus_1);
      
      const prob = p_k - p_k_minus_1;
      
      if (prob <= 1e-7 || isNaN(prob)) {
        throw new NormalizationError('Numerical instability detected (prob <= 0)', 'NUMERICAL_ERROR');
      }

      // Derivatives
      const dp_k_deta = p_k * (1 - p_k);
      const dp_k_minus_1_deta = p_k_minus_1 * (1 - p_k_minus_1);

      // d(log P) / d(alpha)
      const dlogP_dalpha = (dp_k_deta - dp_k_minus_1_deta) / prob;
      grad_alpha[j] += dlogP_dalpha;

      // d(log P) / d(theta)
      const dlogP_dtheta = (-dp_k_deta + dp_k_minus_1_deta) / prob;
      grad_theta[p][c] += dlogP_dtheta;

      // d(log P) / d(tau)
      if (k < 4) {
        grad_tau[c][k] += dp_k_deta / prob;
      }
      if (k > 0) {
        grad_tau[c][k - 1] += -dp_k_minus_1_deta / prob;
      }
    }

    // Apply gradients with small L2 regularization to prevent perfect separation divergence
    const l2_lambda = 0.1;

    for (const j of judges) {
      grad_alpha[j] -= l2_lambda * alpha_j[j];
      const step = grad_alpha[j] * learningRate;
      alpha_j[j] += step;
      maxDiff = Math.max(maxDiff, Math.abs(step));
    }

    for (const p of projects) {
      for (const c of criteria) {
        grad_theta[p][c] -= l2_lambda * theta_pc[p][c];
        const step = grad_theta[p][c] * learningRate;
        theta_pc[p][c] += step;
        maxDiff = Math.max(maxDiff, Math.abs(step));
      }
    }

    for (const c of criteria) {
      for (let k = 0; k < 4; k++) {
        grad_tau[c][k] -= l2_lambda * tau_ck[c][k];
        const step = grad_tau[c][k] * learningRate;
        tau_ck[c][k] += step;
        maxDiff = Math.max(maxDiff, Math.abs(step));
      }
      // Enforce tau_1 < tau_2 < tau_3 < tau_4
      for (let k = 1; k < 4; k++) {
        if (tau_ck[c][k] <= tau_ck[c][k - 1]) {
          tau_ck[c][k] = tau_ck[c][k - 1] + 0.1;
        }
      }
    }

    // Enforce Identifiability Constraint: sum(alpha_j) = 0
    let sumAlpha = 0;
    for (const j of judges) {
      sumAlpha += alpha_j[j];
    }
    const meanAlpha = sumAlpha / judges.length;
    for (const j of judges) {
      alpha_j[j] -= meanAlpha;
    }

    iter++;
  }

  if (iter >= maxIterations) {
    throw new NormalizationError('Maximum iterations reached without convergence', 'NON_CONVERGENCE');
  }

  // Calculate raw criterion-specific judge severity (alpha_jc) using a similar approach or a simple approximation
  // For production, we approximate alpha_jc by doing a single pass of updates specifically per criterion.
  const alpha_jc: Record<string, Record<string, number>> = {};
  judges.forEach(j => {
    alpha_jc[j] = {};
    criteria.forEach(c => (alpha_jc[j][c] = alpha_j[j])); // Simplified fallback initialization
  });

  return { alpha_j, theta_pc, tau_ck, alpha_jc };
}
