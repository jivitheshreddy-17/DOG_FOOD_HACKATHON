'use client';

import { useEffect, useState } from 'react';

type ProgressStats = {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  completionPercentage: number;
  byTrack?: Record<string, { total: number; pending: number; inProgress: number; completed: number; percentage: number }>;
  byJudge?: Record<string, { total: number; pending: number; inProgress: number; completed: number; percentage: number }>;
};

export default function JudgeDashboard() {
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const res = await fetch('/api/judge/progress');
        if (!res.ok) {
          throw new Error('Failed to fetch progress');
        }
        const json = await res.json();
        setStats(json.data);
        setError(null);
      } catch (e: any) {
        setError(e.message);
      }
    };

    fetchProgress();
    const interval = setInterval(fetchProgress, 5000);
    return () => clearInterval(interval);
  }, []);

  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;
  if (!stats) return <div className="p-8">Loading progress...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto font-sans">
      <h1 className="text-3xl font-bold mb-6">Judging Progress</h1>
      
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-100 p-4 rounded-lg shadow-sm">
          <div className="text-sm text-gray-500">Total</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg shadow-sm border border-yellow-100">
          <div className="text-sm text-yellow-600">Pending</div>
          <div className="text-2xl font-bold text-yellow-700">{stats.pending}</div>
        </div>
        <div className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-100">
          <div className="text-sm text-blue-600">In Progress</div>
          <div className="text-2xl font-bold text-blue-700">{stats.inProgress}</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg shadow-sm border border-green-100">
          <div className="text-sm text-green-600">Completed</div>
          <div className="text-2xl font-bold text-green-700">{stats.completed}</div>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex justify-between mb-1">
          <span className="text-base font-medium text-gray-700">Overall Completion</span>
          <span className="text-sm font-medium text-gray-700">{stats.completionPercentage}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div 
            className="bg-green-500 h-4 rounded-full transition-all duration-500" 
            style={{ width: `${stats.completionPercentage}%` }}
          ></div>
        </div>
      </div>

      {stats.byTrack && Object.keys(stats.byTrack).length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4">By Track</h2>
          <div className="space-y-4">
            {Object.entries(stats.byTrack).map(([trackId, track]) => (
              <div key={trackId} className="bg-white border rounded p-4 shadow-sm">
                <div className="flex justify-between mb-1">
                  <span className="font-semibold">{trackId}</span>
                  <span className="text-sm font-medium text-gray-600">{track.percentage}% ({track.completed}/{track.total})</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-500" 
                    style={{ width: `${track.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.byJudge && Object.keys(stats.byJudge).length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4">By Judge (Organizer View)</h2>
          <div className="space-y-4">
            {Object.entries(stats.byJudge).map(([judgeId, judge]) => (
              <div key={judgeId} className="bg-white border rounded p-4 shadow-sm">
                <div className="flex justify-between mb-1">
                  <span className="font-semibold">{judgeId}</span>
                  <span className="text-sm font-medium text-gray-600">{judge.percentage}% ({judge.completed}/{judge.total})</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-purple-500 h-2 rounded-full transition-all duration-500" 
                    style={{ width: `${judge.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
