import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// Vertical bar chart
export function BarChartCard({ title, data, bars, height = 280, colors }) {
  return (
    <div className="chart-container">
      {title && <h4 className="chart-title">{title}</h4>}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
          <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          {bars.map((bar, i) => (
            <Bar
              key={bar.key}
              dataKey={bar.key}
              name={bar.name}
              fill={colors && colors[i] ? colors[i] : '#4f46e5'}
              radius={[6, 6, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Pie / donut chart
export function DonutChart({ title, data, colors, height = 280 }) {
  return (
    <div className="chart-container">
      {title && <h4 className="chart-title">{title}</h4>}
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            label={({ name, percent }) => name + ' ' + Math.round(percent * 100) + '%'}
            labelLine={false}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 13 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// Line chart for trends
export function LineTrendChart({ title, data, xKey, lines, colors, height = 280 }) {
  return (
    <div className="chart-container">
      {title && <h4 className="chart-title">{title}</h4>}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
          <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          {lines.map((line, i) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.name}
              stroke={colors && colors[i] ? colors[i] : '#4f46e5'}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}