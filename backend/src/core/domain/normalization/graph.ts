import { NormalizationInputObservation, ComponentData } from './types';
import { NormalizationError } from './errors';

export function analyzeGraph(observations: NormalizationInputObservation[]): ComponentData[] {
  if (observations.length === 0) {
    throw new NormalizationError('No observations provided', 'NO_DATA');
  }

  const adjList = new Map<string, Set<string>>();
  const judges = new Set<string>();
  const projects = new Set<string>();

  for (const obs of observations) {
    judges.add(obs.judgeId);
    projects.add(obs.projectId);

    if (!adjList.has(obs.judgeId)) adjList.set(obs.judgeId, new Set());
    if (!adjList.has(obs.projectId)) adjList.set(obs.projectId, new Set());

    adjList.get(obs.judgeId)!.add(obs.projectId);
    adjList.get(obs.projectId)!.add(obs.judgeId);
  }

  const visited = new Set<string>();
  const components: ComponentData[] = [];
  let componentCounter = 1;

  for (const judge of judges) {
    if (!visited.has(judge)) {
      const compJudges = new Set<string>();
      const compProjects = new Set<string>();
      const compObservations: NormalizationInputObservation[] = [];

      const queue = [judge];
      visited.add(judge);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        if (judges.has(curr)) compJudges.add(curr);
        if (projects.has(curr)) compProjects.add(curr);

        for (const neighbor of adjList.get(curr) || []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      // Collect observations for this component
      for (const obs of observations) {
        if (compJudges.has(obs.judgeId) && compProjects.has(obs.projectId)) {
          compObservations.push(obs);
        }
      }

      components.push({
        componentId: `comp_${componentCounter++}`,
        judges: compJudges,
        projects: compProjects,
        observations: compObservations,
      });
    }
  }

  return components;
}
