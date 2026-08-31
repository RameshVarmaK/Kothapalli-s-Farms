import React from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { LocalDatabase } from '../utils/database';
import {
  calculateDashboardStats,
  calculateCropProfitability,
  calculateMemberContribution,
  calculateFieldPerformance,
  calculateSeasonalTrends,
  formatCurrency,
  percentChange
} from '../utils/analytics';
import { TrendingUp, BarChart3, Users, Leaf } from 'lucide-react';

interface AnalyticsDashboardProps {
  db: LocalDatabase;
  currency: string;
  onExport?: (format: 'csv' | 'json') => void;
}

export function AnalyticsDashboard({ db, currency, onExport }: AnalyticsDashboardProps) {
  const stats = calculateDashboardStats(db);
  const crops = calculateCropProfitability(db);
  const members = calculateMemberContribution(db);
  const fields = calculateFieldPerformance(db);
  const trends = calculateSeasonalTrends(db);

  const colors = ['#059669', '#10b981', '#34d399', '#6ee7b7', '#d1fae5'];

  const handleExport = (format: 'csv' | 'json') => {
    if (format === 'json') {
      const data = JSON.stringify({
        timestamp: new Date().toISOString(),
        stats,
        crops,
        members,
        fields,
        trends
      }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `farm-analytics-${new Date().getTime()}.json`;
      a.click();
    } else if (format === 'csv') {
      const csvContent = [
        ['Metric', 'Value'],
        ['Total Revenue', stats.totalRevenue],
        ['Total Expenses', stats.totalExpenses],
        ['Net Profit', stats.netProfit],
        ['Profit Margin (%)', stats.profitMargin.toFixed(1)],
        [],
        ['Crop', 'Revenue', 'Expenses', 'Profit', 'Margin (%)'],
        ...crops.map(c => [c.cropName, c.revenue, c.expenses, c.profit, c.profitMargin.toFixed(1)])
      ].map(row => row.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `farm-analytics-${new Date().getTime()}.csv`;
      a.click();
    }
    onExport?.(format);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header with Export Controls */}
      <div className="flex items-center justify-between bg-white rounded-lg border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-900">Farm Analytics Dashboard</h2>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
          >
            📊 Export CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="px-3 py-1.5 text-xs font-semibold bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
          >
            💾 Export JSON
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Revenue"
          value={formatCurrency(stats.totalRevenue, currency)}
          icon={<TrendingUp className="text-emerald-600" />}
          color="emerald"
        />
        <MetricCard
          label="Total Expenses"
          value={formatCurrency(stats.totalExpenses, currency)}
          icon={<BarChart3 className="text-amber-600" />}
          color="amber"
        />
        <MetricCard
          label="Net Profit"
          value={formatCurrency(stats.netProfit, currency)}
          icon={<TrendingUp className="text-green-600" />}
          color="green"
          highlight={stats.netProfit > 0}
        />
        <MetricCard
          label="Profit Margin"
          value={`${stats.profitMargin.toFixed(1)}%`}
          icon={<BarChart3 className="text-blue-600" />}
          color="blue"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Crop Profitability */}
        {crops.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900 mb-4">Crop Profitability</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={crops.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="cropName" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value as number, currency)} />
                <Bar dataKey="profit" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Seasonal Trends */}
        {trends.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900 mb-4">Seasonal Trends</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="season" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value as number, currency)} />
                <Legend />
                <Line type="monotone" dataKey="totalExpenses" stroke="#f59e0b" />
                <Line type="monotone" dataKey="totalRevenue" stroke="#10b981" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Field Performance */}
        {fields.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900 mb-4">Field ROI Performance</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={fields}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fieldName" angle={-45} textAnchor="end" height={100} />
                <YAxis label={{ value: 'ROI (%)', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value) => `${(value as number).toFixed(1)}%`} />
                <Bar dataKey="roi" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Member Contributions */}
        {members.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900 mb-4">Member Contributions</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={members.slice(0, 5)}
                  dataKey="expensesPaid"
                  nameKey="memberName"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                >
                  {members.slice(0, 5).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value as number, currency)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Crops */}
        {crops.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Leaf size={18} className="text-emerald-600" />
              Top Crops by Profit
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200">
                  <tr className="text-left text-slate-600 font-semibold text-xs uppercase">
                    <th className="pb-2">Crop</th>
                    <th className="pb-2 text-right">Profit</th>
                    <th className="pb-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {crops.slice(0, 5).map((crop, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2">{crop.cropName}</td>
                      <td className="py-2 text-right text-emerald-700 font-semibold">
                        {formatCurrency(crop.profit, currency)}
                      </td>
                      <td className="py-2 text-right text-slate-600">
                        {crop.profitMargin.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Top Members */}
        {members.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Users size={18} className="text-blue-600" />
              Top Contributors
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200">
                  <tr className="text-left text-slate-600 font-semibold text-xs uppercase">
                    <th className="pb-2">Member</th>
                    <th className="pb-2 text-right">Expenses</th>
                    <th className="pb-2 text-right">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {members.slice(0, 5).map((member, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2">{member.memberName}</td>
                      <td className="py-2 text-right font-semibold">
                        {formatCurrency(member.expensesPaid, currency)}
                      </td>
                      <td className="py-2 text-right text-slate-600">
                        {member.hoursWorked.toFixed(0)}h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  color?: string;
  highlight?: boolean;
}

function MetricCard({ label, value, icon, color = 'slate', highlight }: MetricCardProps) {
  const bgColor = `bg-${color}-50`;
  const textColor = `text-${color}-700`;

  return (
    <div className={`${bgColor} rounded-lg border border-${color}-200 p-4`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wider text-${color}-600`}>
            {label}
          </p>
          <p className={`text-xl md:text-2xl font-bold mt-1 ${textColor} ${highlight ? 'text-green-700' : ''}`}>
            {value}
          </p>
        </div>
        <div className="text-2xl opacity-20">{icon}</div>
      </div>
    </div>
  );
}
