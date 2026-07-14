'use client';

import { useRef, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Title, Tooltip, Legend, Filler,
  type ChartOptions, type ChartData, type ChartType
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Title, Tooltip, Legend, Filler
);

ChartJS.defaults.color = '#8b949e';
ChartJS.defaults.borderColor = '#30363d';
ChartJS.defaults.font.family = '-apple-system,sans-serif';
ChartJS.defaults.font.size = 11;

interface ChartWrapperProps {
  type: 'bar' | 'line';
  data: ChartData<'bar'> | ChartData<'line'>;
  options?: ChartOptions<'bar'> | ChartOptions<'line'>;
  height?: number;
}

export default function ChartWrapper({ type, data, options, height = 320 }: ChartWrapperProps) {
  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
  };

  const merged = { ...defaultOptions, ...options };

  if (type === 'line') {
    return (
      <div style={{ position: 'relative', height }}>
        <Line data={data as ChartData<'line'>} options={merged as ChartOptions<'line'>} />
      </div>
    );
  }
  return (
    <div style={{ position: 'relative', height }}>
      <Bar data={data as ChartData<'bar'>} options={merged as ChartOptions<'bar'>} />
    </div>
  );
}
