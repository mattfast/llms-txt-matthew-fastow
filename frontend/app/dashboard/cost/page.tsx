"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/lib/api";
import type { CostSummary } from "@/lib/types";

const COLORS = ["#6366f1", "#34d399", "#f59e0b", "#f87171", "#38bdf8"];

export default function CostTrackerPage() {
  const [cost, setCost] = useState<CostSummary | null>(null);

  useEffect(() => {
    apiFetch<CostSummary>("/analytics/cost").then(setCost);
  }, []);

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Cost tracker</h1>
      <p className="text-foreground-muted text-sm mb-6">
        How much your company has spent on LLM tokens traversing and summarizing websites.
      </p>

      {cost === null ? (
        <p className="text-foreground-muted text-sm">Loading…</p>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="card p-6">
            <p className="text-foreground-muted text-xs uppercase tracking-wide">Total spend</p>
            <p className="text-4xl font-semibold mt-1">${cost.total_usd.toFixed(4)}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card p-5">
              <h3 className="font-medium text-sm mb-3">Spend by day</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={cost.by_day}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2d" />
                  <XAxis dataKey="day" stroke="#9a9ea3" fontSize={11} />
                  <YAxis stroke="#9a9ea3" fontSize={11} />
                  <Tooltip
                    contentStyle={{ background: "#1a1a1c", border: "1px solid #2a2a2d", fontSize: 12 }}
                  />
                  <Bar dataKey="cost_usd" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card p-5">
              <h3 className="font-medium text-sm mb-3">Spend by purpose</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={cost.by_purpose}
                    dataKey="cost_usd"
                    nameKey="purpose"
                    innerRadius={45}
                    outerRadius={75}
                  >
                    {cost.by_purpose.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1a1a1c", border: "1px solid #2a2a2d", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
